/**
 * The order-details PDF ("Order Details / Invoice", "შეკვეთის დეტალები /
 * ინვოისი"): one A4 document per order and language, generated from the order
 * record. Design reference (high fidelity, the spec this module follows):
 * `Invoice PDF/design_handoff_order_details_pdf/` — README + `Order Details
 * PDF.dc.html`.
 *
 * **What it prints.** A header (ZOMO lockup, title, Order ID = the order's
 * `reference`, Document No. and issue time), an optional "preliminary" note,
 * then seven numbered sections: 01 order information, 02 customer, 03 carrier
 * with driver and vehicle, 04 route (A/B stop cards + schedule), 05 cargo table,
 * 06 additional services, 07 money (transport + services − POOLING discount =
 * total, VAT-inclusive, with the payment-status badge). A running footer
 * (`ZOMO · {reference}` | "generated automatically …") is on every page. No
 * seller block, no client legal address, no payment method — removed on
 * purpose.
 *
 * **Input.** A `ServiceDocumentView` (built by `buildServiceDocumentView` in
 * `src/lib/orders/service-document-server.ts`) plus a plain
 * `ServiceDocumentPdfLabels` object holding ONE locale's strings. The renderer
 * never calls `next-intl` itself: the route builds the labels with
 * `serviceDocumentPdfLabels(t)` from a translator for the requested `lang`, and
 * `tests/service-document-pdf.spec.ts` builds them from the JSON catalogs
 * directly, so the whole document renders with neither a request nor a server.
 *
 * **Units.** The design is specified in CSS px; every page is drawn inside a
 * `scale(0.75)` transform so the layout code below uses those px numbers as-is
 * (1px = 0.75pt). A4 is 793.7 × 1122.5 px, the 14 mm margin is 52.9 px.
 *
 * **Fonts.** IBM Plex Sans (400/500/600/700) and IBM Plex Mono (500/600) are the
 * primary faces; Plex has no Mkhedruli and no "₾", so Noto Sans Georgian
 * (400/500/600/700 — it carries both) is the second face and Noto Sans the last
 * fallback. pdfkit has no font fallback of its own, which is why this module
 * splits text into runs per font and does its own line wrapping: a wrapped
 * Georgian label can switch fonts mid-line and still be measured correctly.
 * Runs are placed on a shared alphabetic baseline (the fonts' ascenders
 * differ), and line boxes follow CSS half-leading with Plex's metrics as the
 * strut. Plex's digits are tabular by default, so amounts line up without a
 * `tnum` feature. All families are SIL OFL 1.1 (`fonts/OFL*.txt`), and pdfkit
 * subsets them, so a document carries only the glyphs it uses.
 *
 * The TTFs are read with `fs` from `process.cwd()`, never imported, because
 * webpack would otherwise try to bundle them. `next.config.ts` lists the
 * directory in `outputFileTracingIncludes` for the PDF route, and keeps
 * `pdfkit`/`fontkit` external. A Plex font is handed to the `PDFDocument`
 * constructor so pdfkit never loads its built-in Helvetica.
 *
 * **Pagination.** Blocks are laid out top to bottom with the design's 28 px
 * gap; a grid row, stop-card pair or table row that would run into the footer
 * starts a new page, a section heading is kept with its first row, the cargo
 * table repeats its header after a break, and section 07 is kept whole
 * (`break-inside: avoid`). Pages are buffered so the footers are drawn last.
 *
 * **Not `server-only`**: the spec imports it with no Next runtime. It is still
 * Node-only (it reads files), so only server code may import it.
 *
 * **Formatting rules.** Missing values print as "—"; dates are
 * `DD.MM.YYYY, HH:mm` in Asia/Tbilisi; money is `180.00 ₾` with a true minus
 * sign (U+2212) for negatives and no digit grouping (the design's format, and
 * unambiguous in both locales).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";

import {
  ZOMO_BRAND_COLOURS,
  ZOMO_LOCKUP_GEOMETRY,
  ZOMO_SYMBOL_GEOMETRY,
  ZOMO_WORDMARK_GEOMETRY,
} from "@/components/brand/zomo-logo";
import { HUB_TIME_ZONE } from "@/lib/dashboard/hub/timezone";
import {
  roundCurrency,
  vehicleMakeModel,
  type DocumentCargoRow,
  type DocumentCustomerType,
  type DocumentFinance,
  type DocumentPaymentStatus,
  type HandlingTagValue,
  type OrderStatusValue,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";

/** Printed wherever a value is missing. */
export const PDF_DASH = "—";

/** The two document languages. One per render. */
export type PdfLocale = "en" | "ka";

export const PDF_LOCALES: readonly PdfLocale[] = ["en", "ka"];

export function isPdfLocale(value: unknown): value is PdfLocale {
  return value === "en" || value === "ka";
}

/**
 * The strings of one locale, from `orderDocument.pdf.*` (plus the handling-tag
 * names reused from `driverHub.loadsFormat.*`). Parameterised strings are
 * functions so the renderer never formats ICU itself.
 */
export type ServiceDocumentPdfLabels = {
  title: string;
  documentNumber: string;
  issued: string;
  preliminary: string;
  sections: {
    orderInfo: string;
    customer: string;
    vehicleDriver: string;
    transportation: string;
    cargo: string;
    services: string;
    finance: string;
  };
  orderId: string;
  created: string;
  orderStatus: string;
  customerType: string;
  customerTypes: Record<DocumentCustomerType, string>;
  orderStatuses: Record<OrderStatusValue, string>;
  companyName: string;
  companyIdNumber: string;
  customerName: string;
  personalId: string;
  phone: string;
  email: string;
  carrierCompanyId: string;
  carrierIndividual: string;
  carrierPersonalId: string;
  driverFullName: string;
  driverId: string;
  driverPhone: string;
  vehicleCategory: string;
  makeModel: string;
  licensePlate: string;
  trailerPlate: string;
  pickupAddress: string;
  deliveryAddress: string;
  contact: string;
  scheduledPickup: string;
  estimatedDelivery: string;
  routeDistance: string;
  goods: string;
  qty: string;
  unit: string;
  weight: string;
  dimensions: string;
  cargoTotal: string;
  units: Record<NonNullable<DocumentCargoRow["unit"]>, string>;
  helpers: string;
  floor: string;
  elevator: string;
  loadingUnloading: string;
  specialRequirements: string;
  extraTime: string;
  yes: string;
  no: string;
  notRequired: string;
  handlingTags: Record<HandlingTagValue, string>;
  transportPrice: string;
  additionalServices: string;
  discount: string;
  pooling: string;
  total: string;
  paymentStatus: string;
  paymentStatuses: Record<DocumentPaymentStatus, string>;
  /** `orderDocument.pdf.km` — `value` is already formatted. */
  km: (value: string) => string;
  kg: (value: string) => string;
  minutes: (value: string) => string;
  /** `orderDocument.pdf.noteHelpers` — `amount` is formatted money. */
  noteHelpers: (amount: string) => string;
  noteOvertime: (amount: string) => string;
  /** `orderDocument.pdf.vatIncluded` — `rate` is a percentage, e.g. 18. */
  vatIncluded: (rate: number, amount: string) => string;
  /** `orderDocument.pdf.generated`. */
  generated: (timestamp: string) => string;
  /** `orderDocument.pdf.page`. */
  page: (page: number, pages: number) => string;
};

/**
 * The minimal translator shape the label builder needs: a root `next-intl`
 * translator (`getTranslations({ locale })`) satisfies it, and so does a
 * ten-line stand-in over the JSON catalogs in a spec. Keys are full paths.
 */
export type PdfTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const HANDLING_TAG_KEYS: Record<HandlingTagValue, string> = {
  FRAGILE: "fragile",
  COLD_CHAIN: "coldChain",
  HAZMAT: "hazmat",
  TIME_CRITICAL: "timeCritical",
  UPRIGHT_ONLY: "uprightOnly",
  HEAVY_ITEM: "heavyItem",
};

/** One locale's labels from a root translator (full key paths). */
export function serviceDocumentPdfLabels(
  t: PdfTranslator,
): ServiceDocumentPdfLabels {
  const p = (key: string, values?: Record<string, string | number>) =>
    t(`orderDocument.pdf.${key}`, values);
  const handlingTags = {} as Record<HandlingTagValue, string>;
  for (const [tag, key] of Object.entries(HANDLING_TAG_KEYS) as [
    HandlingTagValue,
    string,
  ][]) {
    handlingTags[tag] = t(`driverHub.loadsFormat.${key}`);
  }

  return {
    title: p("title"),
    documentNumber: p("documentNumber"),
    issued: p("issued"),
    preliminary: p("preliminary"),
    sections: {
      orderInfo: p("sections.orderInfo"),
      customer: p("sections.customer"),
      vehicleDriver: p("sections.vehicleDriver"),
      transportation: p("sections.transportation"),
      cargo: p("sections.cargo"),
      services: p("sections.services"),
      finance: p("sections.finance"),
    },
    orderId: p("orderId"),
    created: p("created"),
    orderStatus: p("orderStatus"),
    customerType: p("customerType"),
    customerTypes: {
      BUSINESS: p("customerTypes.business"),
      INDIVIDUAL: p("customerTypes.individual"),
    },
    orderStatuses: {
      INITIATED: p("orderStatuses.initiated"),
      PENDING: p("orderStatuses.pending"),
      CLAIMED: p("orderStatuses.claimed"),
      ACCEPTED: p("orderStatuses.accepted"),
      IN_TRANSIT: p("orderStatuses.inTransit"),
      COMPLETED: p("orderStatuses.completed"),
      CANCELLED: p("orderStatuses.cancelled"),
    },
    companyName: p("companyName"),
    companyIdNumber: p("companyIdNumber"),
    customerName: p("customerName"),
    personalId: p("personalId"),
    phone: p("phone"),
    email: p("email"),
    carrierCompanyId: p("carrierCompanyId"),
    carrierIndividual: p("carrierIndividual"),
    carrierPersonalId: p("carrierPersonalId"),
    driverFullName: p("driverFullName"),
    driverId: p("driverId"),
    driverPhone: p("driverPhone"),
    vehicleCategory: p("vehicleCategory"),
    makeModel: p("makeModel"),
    licensePlate: p("licensePlate"),
    trailerPlate: p("trailerPlate"),
    pickupAddress: p("pickupAddress"),
    deliveryAddress: p("deliveryAddress"),
    contact: p("contact"),
    scheduledPickup: p("scheduledPickup"),
    estimatedDelivery: p("estimatedDelivery"),
    routeDistance: p("routeDistance"),
    goods: p("goods"),
    qty: p("qty"),
    unit: p("unit"),
    weight: p("weight"),
    dimensions: p("dimensions"),
    cargoTotal: p("cargoTotal"),
    units: { PIECE: p("units.piece"), PALLET: p("units.pallet") },
    helpers: p("helpers"),
    floor: p("floor"),
    elevator: p("elevator"),
    loadingUnloading: p("loadingUnloading"),
    specialRequirements: p("specialRequirements"),
    extraTime: p("extraTime"),
    yes: p("yes"),
    no: p("no"),
    notRequired: p("notRequired"),
    handlingTags,
    transportPrice: p("transportPrice"),
    additionalServices: p("additionalServices"),
    discount: p("discount"),
    pooling: p("pooling"),
    total: p("total"),
    paymentStatus: p("paymentStatus"),
    paymentStatuses: {
      PAID: p("paymentStatuses.paid"),
      PENDING: p("paymentStatuses.pending"),
      FAILED: p("paymentStatuses.failed"),
      REFUNDED: p("paymentStatuses.refunded"),
    },
    km: (value) => p("km", { value }),
    kg: (value) => p("kg", { value }),
    minutes: (value) => p("minutes", { value }),
    noteHelpers: (amount) => p("noteHelpers", { amount }),
    noteOvertime: (amount) => p("noteOvertime", { amount }),
    vatIncluded: (rate, amount) => p("vatIncluded", { rate, amount }),
    generated: (timestamp) => p("generated", { timestamp }),
    page: (page, pages) => p("page", { page, pages }),
  };
}

// ---------------------------------------------------------------------------
// Pure formatting — exported for the spec.
// ---------------------------------------------------------------------------

const DATE_PARTS_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: HUB_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** U+2212, the typographic minus the design uses for negative amounts. */
const MINUS = "−";

/** `180` → `"180.00 ₾"`, `-27.5` → `"−27.50 ₾"` (never `"−0.00 ₾"`). */
export function formatPdfMoney(amount: number): string {
  const rounded = roundCurrency(amount);
  const sign = rounded < 0 ? MINUS : "";
  return `${sign}${Math.abs(rounded).toFixed(2)} ₾`;
}

/** `14.2` → `"14.2"`, `85` → `"85"`, `1.005` → `"1.01"`; no grouping. */
export function formatPdfNumber(value: number): string {
  return NUMBER_FORMAT.format(value).replace("-", MINUS);
}

/**
 * An instant as `DD.MM.YYYY, HH:mm` on the Tbilisi clock, or "—" for a missing
 * or unparseable value. Built from parts rather than trusting a locale's own
 * pattern, so the separator and order never change underneath us.
 */
export function formatPdfDateTime(value: string | Date | null): string {
  if (value === null) {
    return PDF_DASH;
  }
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return PDF_DASH;
  }
  const p: Record<string, string> = {};
  for (const part of DATE_PARTS_FORMAT.formatToParts(instant)) {
    p[part.type] = part.value;
  }
  return `${p.day}.${p.month}.${p.year}, ${p.hour}:${p.minute}`;
}

/** The value, trimmed, or "—" when there is nothing to print. */
export function orDash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : PDF_DASH;
}

/** `[220, 95, 90]` → `"220 × 95 × 90"`; `null` → "—". */
export function formatPdfDimensions(
  dims: [number, number, number] | null,
): string {
  return dims ? dims.map(formatPdfNumber).join(" × ") : PDF_DASH;
}

/** The VAT rate as a printable percentage: 0.18 → 18 (never 18.000000000000004). */
export function vatPercent(rate: number): number {
  return Math.round(rate * 100 * 100) / 100;
}

/** One line item of section 07, top to bottom. */
export type FinanceLine = {
  kind: "transport" | "services" | "discount";
  label: string;
  /** The muted second line; empty when there is nothing to say. */
  note: string;
  amount: string;
};

/**
 * Section 07's line items as data. Figures come from `view.finance`, computed
 * server-side by `computeDocumentFinance`; nothing is re-derived here. The
 * discount line (the POOLING service-level discount) is omitted when there is
 * no discount.
 */
export function financeLines(
  view: Pick<ServiceDocumentView, "finance" | "vehicle" | "distanceKm">,
  labels: ServiceDocumentPdfLabels,
): FinanceLine[] {
  const f = view.finance;
  const transportNote = [
    view.vehicle.category?.trim(),
    labels.km(formatPdfNumber(view.distanceKm)),
  ]
    .filter(Boolean)
    .join(" · ");
  const servicesNote = [
    f.servicesBreakdown.helpers !== 0
      ? labels.noteHelpers(formatPdfMoney(f.servicesBreakdown.helpers))
      : null,
    f.servicesBreakdown.overtime !== 0
      ? labels.noteOvertime(formatPdfMoney(f.servicesBreakdown.overtime))
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines: FinanceLine[] = [
    {
      kind: "transport",
      label: labels.transportPrice,
      note: transportNote,
      amount: formatPdfMoney(f.transport),
    },
    {
      kind: "services",
      label: labels.additionalServices,
      note: servicesNote,
      amount: formatPdfMoney(f.services),
    },
  ];
  if (f.discount !== 0) {
    lines.push({
      kind: "discount",
      label: labels.discount,
      note:
        f.discountPercent !== null
          ? `${labels.pooling} · ${f.discountPercent}%`
          : labels.pooling,
      amount: formatPdfMoney(f.discount),
    });
  }
  return lines;
}

/** The "incl. VAT 18%: 45.00 ₾" note under the total. */
export function vatNote(
  finance: Pick<DocumentFinance, "vat" | "vatRate">,
  labels: ServiceDocumentPdfLabels,
): string {
  return labels.vatIncluded(
    vatPercent(finance.vatRate),
    formatPdfMoney(finance.vat),
  );
}

/** Colours of a pill badge. */
export type PillTone = { bg: string; fg: string; border: string };

const TONES = {
  success: { bg: "#ECFDF5", fg: "#065F46", border: "#6EE7B7" },
  pending: { bg: "#FEF9C2", fg: "#7B3306", border: "#FEE685" },
  neutral: { bg: "#F3F4F6", fg: "#030712", border: "#E5E7EB" },
} as const satisfies Record<string, PillTone>;

export type PillToneName = keyof typeof TONES;

/** COMPLETED ("Delivered") is green; every other status is neutral. */
export function orderStatusTone(status: OrderStatusValue): PillToneName {
  return status === "COMPLETED" ? "success" : "neutral";
}

/** PAID green, PENDING amber, FAILED / REFUNDED neutral. */
export function paymentStatusTone(status: DocumentPaymentStatus): PillToneName {
  if (status === "PAID") {
    return "success";
  }
  return status === "PENDING" ? "pending" : "neutral";
}

/** Section 06's six cells, in the design's order. */
export function serviceFields(
  services: ServiceDocumentView["services"],
  labels: ServiceDocumentPdfLabels,
): { label: string; value: string }[] {
  const yesNo = (value: boolean) => (value ? labels.yes : labels.no);
  return [
    {
      label: labels.helpers,
      value: `${services.pickupHelpers} / ${services.deliveryHelpers}`,
    },
    {
      label: labels.floor,
      value: `${services.pickupFloor} / ${services.deliveryFloor}`,
    },
    {
      label: labels.elevator,
      value: `${yesNo(services.pickupElevator)} / ${yesNo(services.deliveryElevator)}`,
    },
    { label: labels.loadingUnloading, value: yesNo(services.loadingUnloading) },
    {
      label: labels.specialRequirements,
      value: services.handlingTags.length
        ? services.handlingTags
            .map((tag) => labels.handlingTags[tag])
            .join(", ")
        : labels.notRequired,
    },
    {
      label: labels.extraTime,
      value: labels.minutes(formatPdfNumber(services.extraMinutes)),
    },
  ];
}

/**
 * `ZOMO_{reference}_{lang}.pdf`, safe in a quoted `Content-Disposition`:
 * references look like `GE-48239`, but anything outside that alphabet is
 * replaced rather than trusted, so a stray quote or newline can never split
 * the header.
 */
export function serviceDocumentPdfFilename(
  reference: string,
  locale: PdfLocale,
): string {
  const safe = reference.replace(/[^A-Za-z0-9._-]/g, "_") || "order";
  return `ZOMO_${safe}_${locale}.pdf`;
}

// ---------------------------------------------------------------------------
// Fonts.
// ---------------------------------------------------------------------------

type Family = "sans" | "mono";
type Weight = 400 | 500 | 600 | 700;

const FONT_FILES = {
  "plex-400": "IBMPlexSans-Regular.ttf",
  "plex-500": "IBMPlexSans-Medium.ttf",
  "plex-600": "IBMPlexSans-SemiBold.ttf",
  "plex-700": "IBMPlexSans-Bold.ttf",
  "plex-mono-500": "IBMPlexMono-Medium.ttf",
  "plex-mono-600": "IBMPlexMono-SemiBold.ttf",
  "georgian-400": "NotoSansGeorgian-Regular.ttf",
  "georgian-500": "NotoSansGeorgian-Medium.ttf",
  "georgian-600": "NotoSansGeorgian-SemiBold.ttf",
  "georgian-700": "NotoSansGeorgian-Bold.ttf",
  "noto-400": "NotoSans-Regular.ttf",
  "noto-700": "NotoSans-Bold.ttf",
} as const;

type FontName = keyof typeof FONT_FILES;

/**
 * The fallback chain of one face: Plex (Latin, digits, punctuation, "−"), then
 * Noto Sans Georgian (Mkhedruli, "₾") at the same weight, then Noto Sans for
 * anything else (Cyrillic names, …), which only ships 400 and 700. Plex Mono
 * only ships 500 and 600, so mono maps 400→500 and 700→600.
 */
function fontChain(family: Family, weight: Weight): FontName[] {
  const primary: FontName =
    family === "mono"
      ? weight >= 600
        ? "plex-mono-600"
        : "plex-mono-500"
      : `plex-${weight}`;
  return [
    primary,
    `georgian-${weight}`,
    weight >= 600 ? "noto-700" : "noto-400",
  ];
}

type LoadedFonts = {
  buffers: Record<FontName, Buffer>;
  has: (font: FontName, codePoint: number) => boolean;
};

let loadedFonts: LoadedFonts | null = null;

function fontKitFont(buffer: Buffer): fontkit.Font {
  const font = fontkit.create(buffer);
  if ("fonts" in font) {
    throw new Error(
      "order-details PDF: expected a single font, got a collection",
    );
  }
  return font;
}

/**
 * Reads the TTFs once per process. The directory is resolved from
 * `process.cwd()` (the project root under `next dev`, `next start` and
 * Playwright alike) because `__dirname` points into `.next/` once bundled.
 */
function loadFonts(): LoadedFonts {
  if (loadedFonts) {
    return loadedFonts;
  }
  const dir = join(process.cwd(), "src", "lib", "waybill", "fonts");
  const buffers = {} as Record<FontName, Buffer>;
  const faces = {} as Record<FontName, fontkit.Font>;
  for (const [name, file] of Object.entries(FONT_FILES) as [
    FontName,
    string,
  ][]) {
    buffers[name] = readFileSync(join(dir, file));
    faces[name] = fontKitFont(buffers[name]);
  }
  const cache = new Map<string, boolean>();
  loadedFonts = {
    buffers,
    has: (font, codePoint) => {
      const key = `${font}:${codePoint}`;
      let has = cache.get(key);
      if (has === undefined) {
        has = faces[font].hasGlyphForCodePoint(codePoint);
        cache.set(key, has);
      }
      return has;
    },
  };
  return loadedFonts;
}

// ---------------------------------------------------------------------------
// Text layout: runs per font, greedy word wrap, CSS-like line boxes.
// ---------------------------------------------------------------------------

type Run = { text: string; font: FontName };
type Line = { runs: Run[]; width: number };

type TextStyle = {
  /** px. */
  size: number;
  family?: Family;
  weight?: Weight;
  color?: string;
  align?: "left" | "right" | "center";
  /** Multiple of `size`; CSS `line-height`. Default 1.5. */
  lineHeight?: number;
  /** CSS `letter-spacing`, in em. */
  tracking?: number;
};

/**
 * Plex's ascent and descent (1025 / 275 per 1000 em): the strut every line box
 * is built on, as CSS builds it on the first font of the `font-family` list.
 */
const STRUT_ASCENT = 1.025;
const STRUT_DESCENT = 0.275;

type Typesetter = {
  doc: PDFKit.PDFDocument;
  fonts: LoadedFonts;
};

function chainOf(style: TextStyle): FontName[] {
  return fontChain(style.family ?? "sans", style.weight ?? 400);
}

/**
 * Splits text into runs per font: each character goes to the first font of the
 * chain that has it. Whitespace stays with the run before it, so a Latin word
 * inside Georgian text does not fragment the line needlessly.
 */
function splitRuns(fonts: LoadedFonts, text: string, chain: FontName[]): Run[] {
  const runs: Run[] = [];
  for (const char of text) {
    const last = runs[runs.length - 1];
    if (last && /\s/.test(char)) {
      last.text += char;
      continue;
    }
    const codePoint = char.codePointAt(0) ?? 0;
    const font = chain.find((name) => fonts.has(name, codePoint)) ?? chain[0]!;
    if (last && last.font === font) {
      last.text += char;
    } else {
      runs.push({ text: char, font });
    }
  }
  return runs;
}

function runWidth(ts: Typesetter, run: Run, style: TextStyle): number {
  const tracking = (style.tracking ?? 0) * style.size;
  return (
    ts.doc.font(run.font).fontSize(style.size).widthOfString(run.text) +
    tracking * [...run.text].length
  );
}

function runsWidth(ts: Typesetter, runs: Run[], style: TextStyle): number {
  return runs.reduce((sum, run) => sum + runWidth(ts, run, style), 0);
}

/** The width of `text` on one line, unwrapped. */
function textWidth(ts: Typesetter, text: string, style: TextStyle): number {
  return runsWidth(ts, splitRuns(ts.fonts, text, chainOf(style)), style);
}

/**
 * Greedy word wrap into lines no wider than `maxWidth`. Explicit newlines are
 * honoured, U+00A0 never breaks; a single word wider than the column (a long
 * code, an email) is
 * broken between characters rather than allowed to overflow into the next
 * column.
 */
function wrapText(
  ts: Typesetter,
  text: string,
  maxWidth: number,
  style: TextStyle,
): Line[] {
  const measure = (s: string) => textWidth(ts, s, style);
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    // Break only at ordinary spaces: a no-break space (U+00A0) holds a phone
    // number together.
    const words = paragraph.split(/[ \t]+/).filter(Boolean);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
        current = "";
      }
      if (measure(word) <= maxWidth) {
        current = word;
        continue;
      }
      // Break an over-long word between characters.
      let piece = "";
      for (const char of word) {
        if (piece && measure(piece + char) > maxWidth) {
          lines.push(piece);
          piece = "";
        }
        piece += char;
      }
      current = piece;
    }
    lines.push(current);
  }

  const chain = chainOf(style);
  return lines.map((line) => {
    const runs = splitRuns(ts.fonts, line, chain);
    return { runs, width: runsWidth(ts, runs, style) };
  });
}

function linePitch(style: TextStyle): number {
  return style.size * (style.lineHeight ?? 1.5);
}

/** Distance from a line box's top to its baseline (CSS half-leading). */
function baselineOffset(style: TextStyle): number {
  const pitch = linePitch(style);
  return (
    (pitch - style.size * (STRUT_ASCENT + STRUT_DESCENT)) / 2 +
    style.size * STRUT_ASCENT
  );
}

function measureText(
  ts: Typesetter,
  text: string,
  width: number,
  style: TextStyle,
): number {
  return wrapText(ts, text, width, style).length * linePitch(style);
}

/** Draws one prepared line with its baseline at `baseline`. */
function drawLine(
  ts: Typesetter,
  line: Line,
  x: number,
  baseline: number,
  style: TextStyle,
): void {
  const characterSpacing = (style.tracking ?? 0) * style.size;
  let cursor = x;
  for (const run of line.runs) {
    ts.doc
      .font(run.font)
      .fontSize(style.size)
      .text(run.text, cursor, baseline, {
        lineBreak: false,
        baseline: "alphabetic",
        characterSpacing,
      });
    cursor += runWidth(ts, run, style);
  }
}

/**
 * Draws wrapped text with its line-box top-left at (x, y) and returns its
 * height. Each run is placed with `lineBreak: false` at a computed x on a
 * shared alphabetic baseline, so pdfkit's own wrapper (which knows nothing
 * about the fallback fonts) never runs.
 */
function drawText(
  ts: Typesetter,
  text: string,
  x: number,
  y: number,
  width: number,
  style: TextStyle,
): number {
  const lines = wrapText(ts, text, width, style);
  const pitch = linePitch(style);
  const offset = baselineOffset(style);
  ts.doc.fillColor(style.color ?? COLORS.ink);
  lines.forEach((line, index) => {
    let cursor = x;
    if (style.align === "right") {
      cursor = x + width - line.width;
    } else if (style.align === "center") {
      cursor = x + (width - line.width) / 2;
    }
    drawLine(ts, line, cursor, y + index * pitch + offset, style);
  });
  return lines.length * pitch;
}

/** A styled piece of an inline sequence (label + value on one line). */
type Segment = { text: string; style: TextStyle };

function segmentsWidth(ts: Typesetter, segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + textWidth(ts, s.text, s.style), 0);
}

/** Draws segments on one shared baseline, starting at x. */
function drawSegments(
  ts: Typesetter,
  segments: Segment[],
  x: number,
  baseline: number,
): void {
  let cursor = x;
  for (const segment of segments) {
    const chain = chainOf(segment.style);
    const runs = splitRuns(ts.fonts, segment.text, chain);
    const line = { runs, width: runsWidth(ts, runs, segment.style) };
    ts.doc.fillColor(segment.style.color ?? COLORS.ink);
    drawLine(ts, line, cursor, baseline, segment.style);
    cursor += line.width;
  }
}

// ---------------------------------------------------------------------------
// Page geometry and palette (px; see "Units" above).
// ---------------------------------------------------------------------------

/** 1 CSS px in PDF points. */
const PX = 0.75;

const PAGE = {
  width: 595.28 / PX,
  height: 841.89 / PX,
  /** 14 mm. */
  margin: ((14 / 25.4) * 72) / PX,
} as const;

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const LEFT = PAGE.margin;
const RIGHT = PAGE.margin + CONTENT_WIDTH;

/** Footer: 1px rule, 10px padding, one 11px line at 1.5. */
const FOOTER_HEIGHT = 1 + 10 + 11 * 1.5;
const FOOTER_TOP = PAGE.height - PAGE.margin - FOOTER_HEIGHT;
/** Space kept between the last content and the footer rule. */
const FOOTER_GAP = 20;
const CONTENT_BOTTOM = FOOTER_TOP - FOOTER_GAP;

/** Body stack gap between blocks. */
const BLOCK_GAP = 28;
/** Section: heading → content and grid row gap. */
const SECTION_GAP = 14;
const COLUMN_GAP = 24;

const COLORS = {
  ink: "#030712",
  muted: "#4B5563",
  line: "#E5E7EB",
  fill: "#F3F4F6",
  white: "#FFFFFF",
} as const;

const STYLE = {
  label: { size: 12, color: COLORS.muted },
  value: { size: 14 },
  note: { size: 12, color: COLORS.muted },
} as const satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------
// Pages and primitives.
// ---------------------------------------------------------------------------

type Ctx = Typesetter & {
  labels: ServiceDocumentPdfLabels;
  y: number;
};

/**
 * Starts a page and enters the px coordinate space. The transform is popped
 * by `endPage` before the next page (and before the footers pass), so the
 * graphics-state stack is balanced on every page.
 */
function startPage(ctx: Ctx): void {
  ctx.doc.addPage();
  ctx.doc.save();
  ctx.doc.scale(PX);
  ctx.y = PAGE.margin;
}

function endPage(ctx: Ctx): void {
  ctx.doc.restore();
}

function newPage(ctx: Ctx): void {
  endPage(ctx);
  startPage(ctx);
}

/** Starts a new page when `height` more px would run into the footer. */
function ensureSpace(ctx: Ctx, height: number): boolean {
  if (ctx.y + height > CONTENT_BOTTOM && ctx.y > PAGE.margin) {
    newPage(ctx);
    return true;
  }
  return false;
}

/** A horizontal rule occupying [y, y + width) like a CSS border. */
function rule(
  ctx: Ctx,
  y: number,
  width = 1,
  color: string = COLORS.line,
  x1: number = LEFT,
  x2: number = RIGHT,
): void {
  ctx.doc
    .moveTo(x1, y + width / 2)
    .lineTo(x2, y + width / 2)
    .lineWidth(width)
    .strokeColor(color)
    .stroke();
}

/** A box with a 1px inside border, like a CSS `border` + `border-radius`. */
function box(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: string | null,
  border: string | null,
): void {
  if (fill && !border) {
    ctx.doc.roundedRect(x, y, w, h, radius).fill(fill);
    return;
  }
  const path = ctx.doc
    .roundedRect(x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, radius - 0.5))
    .lineWidth(1);
  if (fill && border) {
    path.fillAndStroke(fill, border);
  } else if (border) {
    path.stroke(border);
  }
}

const PILL_STYLE: TextStyle = { size: 12, weight: 600 };
/** 2px padding + 1px border, top and bottom, around one 18px line. */
const PILL_HEIGHT = 12 * 1.5 + 4 + 2;

function drawPill(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  tone: PillTone,
  maxWidth: number,
): void {
  const inner = Math.min(textWidth(ctx, text, PILL_STYLE), maxWidth - 22);
  const width = inner + 22;
  box(ctx, x, y, width, PILL_HEIGHT, PILL_HEIGHT / 2, tone.bg, tone.border);
  drawText(ctx, text, x + 11, y + 3, inner + 1, {
    ...PILL_STYLE,
    color: tone.fg,
  });
}

// ---------------------------------------------------------------------------
// Fields and grids.
// ---------------------------------------------------------------------------

type Field = {
  label: string;
  value: string;
  mono?: boolean;
  /** Draws the value as a pill badge in this tone. */
  pill?: PillTone;
};

function valueStyle(field: Field): TextStyle {
  return field.mono
    ? { ...STYLE.value, family: "mono", weight: 500 }
    : STYLE.value;
}

/** Label 12px, gap 2px (4px above a pill), value 14px. */
function fieldHeight(ctx: Ctx, field: Field, width: number): number {
  const label = measureText(ctx, field.label, width, STYLE.label);
  if (field.pill) {
    return label + 4 + PILL_HEIGHT;
  }
  return label + 2 + measureText(ctx, field.value, width, valueStyle(field));
}

function drawField(
  ctx: Ctx,
  field: Field,
  x: number,
  y: number,
  width: number,
): void {
  const label = drawText(ctx, field.label, x, y, width, STYLE.label);
  if (field.pill) {
    drawPill(ctx, field.value, x, y + label + 4, field.pill, width);
    return;
  }
  drawText(ctx, field.value, x, y + label + 2, width, valueStyle(field));
}

function columnWidth(columns: number): number {
  return (CONTENT_WIDTH - COLUMN_GAP * (columns - 1)) / columns;
}

function gridRows(fields: Field[], columns: number): Field[][] {
  const rows: Field[][] = [];
  for (let i = 0; i < fields.length; i += columns) {
    rows.push(fields.slice(i, i + columns));
  }
  return rows;
}

function rowHeight(ctx: Ctx, row: Field[], width: number): number {
  return Math.max(...row.map((field) => fieldHeight(ctx, field, width)));
}

/**
 * `grid-template-columns: repeat(N, minmax(0, 1fr))`, gap 14px / 24px. A row
 * that would run into the footer moves to the next page whole.
 */
function drawGrid(ctx: Ctx, fields: Field[], columns: number): void {
  const width = columnWidth(columns);
  gridRows(fields, columns).forEach((row, index) => {
    const height = rowHeight(ctx, row, width);
    if (index > 0) {
      if (!ensureSpace(ctx, SECTION_GAP + height)) {
        ctx.y += SECTION_GAP;
      }
    }
    row.forEach((field, column) => {
      drawField(ctx, field, LEFT + column * (width + COLUMN_GAP), ctx.y, width);
    });
    ctx.y += height;
  });
}

function firstRowHeight(ctx: Ctx, fields: Field[], columns: number): number {
  return rowHeight(ctx, fields.slice(0, columns), columnWidth(columns));
}

// ---------------------------------------------------------------------------
// Header, notice, section headings.
// ---------------------------------------------------------------------------

/** The logo box: 150 × 52 px, `object-fit: contain`. */
const LOGO_BOX = { width: 150, height: 52 } as const;

/**
 * The horizontal "primary" lockup (orange symbol, ink wordmark), drawn as
 * vectors from the shared geometry in `@/components/brand/zomo-logo` — the
 * single source the web components and OG images use too, so the PDF can never
 * drift from the brand. The wordmark is custom lettering, never text in a font.
 *
 * Line widths are set inside the scaled coordinate space, so they scale with
 * the mark exactly as the SVG's `stroke-width` does.
 */
function drawZomoLockup(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  height: number,
): void {
  const symbol = ZOMO_SYMBOL_GEOMETRY;
  const wordmark = ZOMO_WORDMARK_GEOMETRY;

  doc.save();
  doc.translate(x, y).scale(height / ZOMO_LOCKUP_GEOMETRY.height);

  doc
    .path(symbol.routePath)
    .lineWidth(symbol.routeStrokeWidth)
    .lineCap("round")
    .lineJoin("round")
    .stroke(ZOMO_BRAND_COLOURS.orange);
  for (const dot of [symbol.startDot, symbol.endDot]) {
    doc.circle(dot.cx, dot.cy, dot.r).fill(ZOMO_BRAND_COLOURS.orange);
  }

  // `translate(112 22) scale(.56)` — the lockup's wordmark placement.
  doc.save();
  doc.translate(112, 22).scale(0.56);
  doc.lineWidth(wordmark.strokeWidth).lineCap("round").lineJoin("round");
  doc.path(wordmark.zPath).stroke(ZOMO_BRAND_COLOURS.ink);
  doc.path(wordmark.mPath).stroke(ZOMO_BRAND_COLOURS.ink);
  for (const ring of [wordmark.firstO, wordmark.secondO]) {
    doc.circle(ring.cx, ring.cy, ring.r).stroke(ZOMO_BRAND_COLOURS.ink);
  }
  doc
    .circle(wordmark.zDot.cx, wordmark.zDot.cy, wordmark.zDot.r)
    .fill(ZOMO_BRAND_COLOURS.ink);
  doc.restore();

  doc.restore();
}

/** The lockup fitted into the logo box (contain: centred, aspect kept). */
function drawLogo(ctx: Ctx, x: number, y: number): void {
  const scale = Math.min(
    LOGO_BOX.width / ZOMO_LOCKUP_GEOMETRY.width,
    LOGO_BOX.height / ZOMO_LOCKUP_GEOMETRY.height,
  );
  const w = ZOMO_LOCKUP_GEOMETRY.width * scale;
  const h = ZOMO_LOCKUP_GEOMETRY.height * scale;
  drawZomoLockup(
    ctx.doc,
    x + (LOGO_BOX.width - w) / 2,
    y + (LOGO_BOX.height - h) / 2,
    h,
  );
}

const TITLE_STYLE: TextStyle = { size: 22, weight: 600, lineHeight: 1.2 };
const ORDER_ID_STYLE: TextStyle = {
  size: 20,
  family: "mono",
  weight: 600,
  tracking: 0.02,
};
const META_LABEL: TextStyle = { size: 12, color: COLORS.muted };

/**
 * Logo left; right-aligned stack of title, Order ID and the meta row
 * ("Document No. INV-…" · "Issued 22.10.2026, 18:42"). The meta row's two
 * groups sit 16px apart on one line, or stack when a long translation would
 * not fit beside the logo. Bottom border 2px ink.
 */
function drawHeader(
  ctx: Ctx,
  view: ServiceDocumentView,
  generatedAt: Date,
): void {
  const { labels } = ctx;
  const top = ctx.y;
  const stackX = LEFT + LOGO_BOX.width + 24;
  const stackW = RIGHT - stackX;

  drawLogo(ctx, LEFT, top);

  let y = top;
  y += drawText(ctx, labels.title, stackX, y, stackW, {
    ...TITLE_STYLE,
    align: "right",
  });
  y += 4;
  y += drawText(ctx, orDash(view.reference), stackX, y, stackW, {
    ...ORDER_ID_STYLE,
    align: "right",
  });
  y += 4;

  const groups: Segment[][] = [
    [
      { text: `${labels.documentNumber} `, style: META_LABEL },
      {
        text: orDash(view.documentNumber),
        style: { size: 12, family: "mono", weight: 500 },
      },
    ],
    [
      { text: `${labels.issued} `, style: META_LABEL },
      { text: formatPdfDateTime(generatedAt), style: { size: 12 } },
    ],
  ];
  const widths = groups.map((g) => segmentsWidth(ctx, g));
  const metaLine = 12 * 1.5;
  const metaBaseline = baselineOffset({ size: 12 });
  const oneLine = widths[0]! + 16 + widths[1]! <= stackW;
  if (oneLine) {
    drawSegments(
      ctx,
      groups[0]!,
      RIGHT - widths[1]! - 16 - widths[0]!,
      y + metaBaseline,
    );
    drawSegments(ctx, groups[1]!, RIGHT - widths[1]!, y + metaBaseline);
    y += metaLine;
  } else {
    groups.forEach((group, index) => {
      drawSegments(ctx, group, RIGHT - widths[index]!, y + metaBaseline);
      y += metaLine;
    });
  }

  ctx.y = Math.max(top + LOGO_BOX.height, y) + 20;
  rule(ctx, ctx.y, 2, COLORS.ink);
  ctx.y += 2;
}

const NOTICE_STYLE: TextStyle = {
  size: 13,
  weight: 500,
  color: TONES.pending.fg,
};

/** The "preliminary" note: a pending-toned rounded box under the header. */
function drawPreliminary(ctx: Ctx): void {
  const padX = 14;
  const padY = 10;
  const inner = CONTENT_WIDTH - padX * 2;
  const height =
    measureText(ctx, ctx.labels.preliminary, inner, NOTICE_STYLE) + padY * 2;
  ensureSpace(ctx, height);
  box(
    ctx,
    LEFT,
    ctx.y,
    CONTENT_WIDTH,
    height,
    8,
    TONES.pending.bg,
    TONES.pending.border,
  );
  drawText(
    ctx,
    ctx.labels.preliminary,
    LEFT + padX,
    ctx.y + padY,
    inner,
    NOTICE_STYLE,
  );
  ctx.y += height;
}

const HEADING_STYLE: TextStyle = { size: 16, weight: 600 };
const HEADING_NUMBER_STYLE: TextStyle = {
  size: 12,
  family: "mono",
  weight: 500,
  color: COLORS.muted,
};

function headingHeight(ctx: Ctx, title: string): number {
  const numberWidth = textWidth(ctx, "00", HEADING_NUMBER_STYLE) + 10;
  return (
    measureText(ctx, title, CONTENT_WIDTH - numberWidth, HEADING_STYLE) + 8 + 1
  );
}

/**
 * "01 Order information": the number in Plex Mono 12px muted on the title's
 * baseline, 10px before the 16px/600 title; 8px padding and a 1px rule below,
 * then the section's 14px gap. Starts a new page first when the heading plus
 * `keepWith` px of content would not fit, so a heading is never orphaned.
 */
function drawSectionHeading(
  ctx: Ctx,
  number: number,
  title: string,
  keepWith: number,
): void {
  ensureSpace(ctx, headingHeight(ctx, title) + SECTION_GAP + keepWith);
  const label = String(number).padStart(2, "0");
  const numberWidth = textWidth(ctx, label, HEADING_NUMBER_STYLE);
  ctx.doc.fillColor(COLORS.muted);
  drawSegments(
    ctx,
    [{ text: label, style: HEADING_NUMBER_STYLE }],
    LEFT,
    ctx.y + baselineOffset(HEADING_STYLE),
  );
  const height = drawText(
    ctx,
    title,
    LEFT + numberWidth + 10,
    ctx.y,
    CONTENT_WIDTH - numberWidth - 10,
    HEADING_STYLE,
  );
  ctx.y += height + 8;
  rule(ctx, ctx.y);
  ctx.y += 1 + SECTION_GAP;
}

function blockGap(ctx: Ctx): void {
  ctx.y += BLOCK_GAP;
}

// ---------------------------------------------------------------------------
// Sections.
// ---------------------------------------------------------------------------

function drawOrderInfo(ctx: Ctx, view: ServiceDocumentView): void {
  const { labels } = ctx;
  const fields: Field[] = [
    { label: labels.orderId, value: orDash(view.reference), mono: true },
    { label: labels.created, value: formatPdfDateTime(view.createdAt) },
    {
      label: labels.orderStatus,
      value: labels.orderStatuses[view.status],
      pill: TONES[orderStatusTone(view.status)],
    },
    {
      label: labels.customerType,
      value: labels.customerTypes[view.customer.type],
    },
  ];
  drawSectionHeading(
    ctx,
    1,
    labels.sections.orderInfo,
    firstRowHeight(ctx, fields, 4),
  );
  drawGrid(ctx, fields, 4);
}

function drawCustomer(ctx: Ctx, view: ServiceDocumentView): void {
  const { labels } = ctx;
  const business = view.customer.type === "BUSINESS";
  const fields: Field[] = [
    {
      label: business ? labels.companyName : labels.customerName,
      value: orDash(view.customer.name),
    },
    {
      label: business ? labels.companyIdNumber : labels.personalId,
      value: orDash(view.customer.idNumber),
    },
    { label: labels.phone, value: orDash(view.customer.phone) },
    { label: labels.email, value: orDash(view.customer.email) },
  ];
  drawSectionHeading(
    ctx,
    2,
    labels.sections.customer,
    firstRowHeight(ctx, fields, 2),
  );
  drawGrid(ctx, fields, 2);
}

/**
 * Carrier (company name + ID/VAT, or the independent carrier's name + personal
 * ID/VAT), then driver and vehicle, in the design's order. Before anyone has
 * taken the order the carrier is unknown: the company labels are used with
 * dashes. The trailer plate is appended only when there is one.
 */
function drawVehicleDriver(ctx: Ctx, view: ServiceDocumentView): void {
  const { labels } = ctx;
  const individual = view.carrier?.kind === "DRIVER";
  const fields: Field[] = [
    {
      label: individual ? labels.carrierIndividual : labels.companyName,
      value: orDash(view.carrier?.name),
    },
    {
      label: individual ? labels.carrierPersonalId : labels.carrierCompanyId,
      value: orDash(view.carrier?.idOrVat),
    },
    { label: labels.driverFullName, value: orDash(view.driver.fullName) },
    { label: labels.driverId, value: orDash(view.driver.personalId) },
    { label: labels.driverPhone, value: orDash(view.driver.phone) },
    { label: labels.vehicleCategory, value: orDash(view.vehicle.category) },
    { label: labels.makeModel, value: orDash(vehicleMakeModel(view.vehicle)) },
    { label: labels.licensePlate, value: orDash(view.vehicle.plate) },
  ];
  if (view.vehicle.trailerPlate?.trim()) {
    fields.push({
      label: labels.trailerPlate,
      value: view.vehicle.trailerPlate.trim(),
    });
  }
  drawSectionHeading(
    ctx,
    3,
    labels.sections.vehicleDriver,
    firstRowHeight(ctx, fields, 3),
  );
  drawGrid(ctx, fields, 3);
}

type StopCard = {
  mark: string;
  label: string;
  address: string;
  contact: string;
};

const STOP_CARD = {
  gap: 12,
  padding: 14,
  marker: 24,
  innerGap: 12,
} as const;
const STOP_ADDRESS: TextStyle = { size: 14, weight: 500 };
const STOP_CONTACT: TextStyle = { size: 13 };

function stopContentWidth(): number {
  const cardW = (CONTENT_WIDTH - STOP_CARD.gap) / 2;
  return (
    cardW - STOP_CARD.padding * 2 - 2 - STOP_CARD.marker - STOP_CARD.innerGap
  );
}

function stopContentHeight(ctx: Ctx, card: StopCard): number {
  const w = stopContentWidth();
  return (
    measureText(ctx, card.label, w, STYLE.label) +
    6 +
    measureText(ctx, card.address, w, STOP_ADDRESS) +
    6 +
    measureText(ctx, card.contact, w, STOP_CONTACT)
  );
}

/**
 * Two stop cards side by side (grid stretch: equal height), each with the
 * A/B marker, then the schedule grid. The pair never splits across pages.
 */
function drawTransportation(ctx: Ctx, view: ServiceDocumentView): void {
  const { labels } = ctx;
  const contactLine = (stop: ServiceDocumentView["stops"]["pickup"]) => {
    // The phone number never wraps mid-number.
    const parts = [
      stop.contactName?.trim(),
      stop.contactPhone?.trim().replace(/ /g, "\u00A0"),
    ].filter(Boolean);
    return `${labels.contact}: ${parts.length ? parts.join(" · ") : PDF_DASH}`;
  };
  const cards: StopCard[] = [
    {
      mark: "A",
      label: labels.pickupAddress,
      address: orDash(view.stops.pickup.address),
      contact: contactLine(view.stops.pickup),
    },
    {
      mark: "B",
      label: labels.deliveryAddress,
      address: orDash(view.stops.delivery.address),
      contact: contactLine(view.stops.delivery),
    },
  ];
  const contentH = Math.max(
    STOP_CARD.marker,
    ...cards.map((card) => stopContentHeight(ctx, card)),
  );
  const cardH = contentH + STOP_CARD.padding * 2 + 2;
  const cardW = (CONTENT_WIDTH - STOP_CARD.gap) / 2;

  drawSectionHeading(ctx, 4, labels.sections.transportation, cardH);
  ensureSpace(ctx, cardH);
  const top = ctx.y;
  const w = stopContentWidth();
  cards.forEach((card, index) => {
    const x = LEFT + index * (cardW + STOP_CARD.gap);
    box(ctx, x, top, cardW, cardH, 8, null, COLORS.line);
    const ix = x + 1 + STOP_CARD.padding;
    const iy = top + 1 + STOP_CARD.padding;
    const r = STOP_CARD.marker / 2;
    ctx.doc.circle(ix + r, iy + r, r).fill(COLORS.ink);
    const markStyle: TextStyle = {
      size: 12,
      weight: 600,
      color: COLORS.white,
      lineHeight: STOP_CARD.marker / 12,
      align: "center",
    };
    drawText(ctx, card.mark, ix, iy, STOP_CARD.marker, markStyle);

    const cx = ix + STOP_CARD.marker + STOP_CARD.innerGap;
    let y = iy;
    y += drawText(ctx, card.label, cx, y, w, STYLE.label) + 6;
    y += drawText(ctx, card.address, cx, y, w, STOP_ADDRESS) + 6;
    drawText(ctx, card.contact, cx, y, w, STOP_CONTACT);
  });
  ctx.y = top + cardH;

  const schedule: Field[] = [
    {
      label: labels.scheduledPickup,
      value: formatPdfDateTime(view.scheduledPickupAt),
    },
    {
      label: labels.estimatedDelivery,
      value: formatPdfDateTime(view.estimatedDeliveryAt),
    },
    {
      label: labels.routeDistance,
      value: labels.km(formatPdfNumber(view.distanceKm)),
    },
  ];
  const scheduleH = firstRowHeight(ctx, schedule, 3);
  if (!ensureSpace(ctx, SECTION_GAP + scheduleH)) {
    ctx.y += SECTION_GAP;
  }
  drawGrid(ctx, schedule, 3);
}

const TABLE_TEXT: TextStyle = { size: 13.5 };
const TABLE_HEAD: TextStyle = { size: 12, weight: 500, color: COLORS.muted };
const TABLE_TOTAL: TextStyle = { size: 13.5, weight: 600 };

type TableColumn = {
  header: string;
  align: "left" | "right";
  /** Upper bound of the natural width, px incl. padding; the header wraps. */
  cap: number;
  padLeft: number;
  padRight: number;
};

/**
 * Section 05: description · qty · unit · weight · dimensions. The four narrow
 * columns take their natural width (capped, so a long Georgian header wraps
 * instead of squeezing the description); the description takes the rest.
 * Rows that would run into the footer continue on a new page under a repeated
 * header, like a `<thead>`.
 */
function drawCargo(ctx: Ctx, view: ServiceDocumentView): void {
  const { labels } = ctx;
  const columns: TableColumn[] = [
    {
      header: labels.goods,
      align: "left",
      cap: Infinity,
      padLeft: 0,
      padRight: 8,
    },
    { header: labels.qty, align: "right", cap: 72, padLeft: 8, padRight: 8 },
    { header: labels.unit, align: "left", cap: 96, padLeft: 8, padRight: 8 },
    { header: labels.weight, align: "right", cap: 96, padLeft: 8, padRight: 8 },
    {
      header: labels.dimensions,
      align: "right",
      cap: 170,
      padLeft: 8,
      padRight: 0,
    },
  ];
  const rows: string[][] = (
    view.cargo.length
      ? view.cargo
      : [
          {
            description: PDF_DASH,
            quantity: null,
            unit: null,
            weightKg: null,
            dimensionsCm: null,
          } satisfies DocumentCargoRow,
        ]
  ).map((row) => [
    orDash(row.description),
    row.quantity === null ? PDF_DASH : formatPdfNumber(row.quantity),
    row.unit === null ? PDF_DASH : labels.units[row.unit],
    row.weightKg === null ? PDF_DASH : labels.kg(formatPdfNumber(row.weightKg)),
    formatPdfDimensions(row.dimensionsCm),
  ]);
  const totalWeight =
    view.totalWeightKg === null
      ? PDF_DASH
      : labels.kg(formatPdfNumber(view.totalWeightKg));

  // Column widths.
  const widths = columns.map((column, index) => {
    if (index === 0) {
      return 0;
    }
    const natural = Math.max(
      textWidth(ctx, column.header, TABLE_HEAD),
      ...rows.map((row) => textWidth(ctx, row[index]!, TABLE_TEXT)),
      index === 3 ? textWidth(ctx, totalWeight, TABLE_TOTAL) : 0,
    );
    return Math.min(
      Math.ceil(natural) + 1 + column.padLeft + column.padRight,
      column.cap,
    );
  });
  widths[0] = CONTENT_WIDTH - widths.slice(1).reduce((a, b) => a + b, 0);
  const xs = widths.map(
    (_, index) => LEFT + widths.slice(0, index).reduce((a, b) => a + b, 0),
  );
  const inner = (index: number) =>
    widths[index]! - columns[index]!.padLeft - columns[index]!.padRight;

  const headerH =
    Math.max(
      ...columns.map((column, index) =>
        measureText(ctx, column.header, inner(index), TABLE_HEAD),
      ),
    ) +
    8 +
    1;
  const rowH = (cells: string[], style: TextStyle) =>
    Math.max(
      ...cells.map((cell, index) =>
        measureText(ctx, cell, inner(index), style),
      ),
    );
  const bodyHeights = rows.map((row) => rowH(row, TABLE_TEXT) + 18 + 1);
  const totalCells = [labels.cargoTotal, "", "", totalWeight, ""];
  const totalH = rowH(totalCells, TABLE_TOTAL) + 9;

  const drawCells = (cells: string[], y: number, style: TextStyle) => {
    cells.forEach((cell, index) => {
      if (!cell) {
        return;
      }
      drawText(
        ctx,
        cell,
        xs[index]! + columns[index]!.padLeft,
        y,
        inner(index),
        {
          ...style,
          align: columns[index]!.align,
        },
      );
    });
  };
  const drawHeader = () => {
    drawCells(
      columns.map((c) => c.header),
      ctx.y,
      TABLE_HEAD,
    );
    ctx.y += headerH - 1;
    rule(ctx, ctx.y);
    ctx.y += 1;
  };

  drawSectionHeading(ctx, 5, labels.sections.cargo, headerH + bodyHeights[0]!);
  drawHeader();
  rows.forEach((row, index) => {
    const height = bodyHeights[index]!;
    if (ctx.y + height > CONTENT_BOTTOM) {
      newPage(ctx);
      drawHeader();
    }
    drawCells(row, ctx.y + 9, TABLE_TEXT);
    ctx.y += height - 1;
    rule(ctx, ctx.y);
    ctx.y += 1;
  });
  if (ctx.y + totalH > CONTENT_BOTTOM) {
    newPage(ctx);
    drawHeader();
  }
  drawCells(totalCells, ctx.y + 9, TABLE_TOTAL);
  ctx.y += totalH;
}

function drawServices(ctx: Ctx, view: ServiceDocumentView): void {
  const fields: Field[] = serviceFields(view.services, ctx.labels);
  drawSectionHeading(
    ctx,
    6,
    ctx.labels.sections.services,
    firstRowHeight(ctx, fields, 3),
  );
  drawGrid(ctx, fields, 3);
}

const TOTAL_LABEL: TextStyle = { size: 16, weight: 600 };
const TOTAL_AMOUNT: TextStyle = { size: 24, weight: 700 };

/**
 * Section 07, kept whole (`break-inside: avoid`): line items (label + muted
 * note left, amount right, 1px rule), the 2px-ruled total row with the
 * 24px/700 amount on the label's baseline and the VAT note under it, then the
 * grey payment-status box.
 */
function drawFinance(ctx: Ctx, view: ServiceDocumentView): void {
  const { labels } = ctx;
  const lines = financeLines(view, labels);
  const amountW = Math.max(
    ...lines.map((line) => textWidth(ctx, line.amount, STYLE.value)),
  );
  const labelW = CONTENT_WIDTH - amountW - 24;
  const lineHeights = lines.map(
    (line) =>
      9 +
      measureText(ctx, line.label, labelW, STYLE.value) +
      (line.note ? 2 + measureText(ctx, line.note, labelW, STYLE.note) : 0) +
      9 +
      1,
  );

  const totalAmount = formatPdfMoney(view.finance.total);
  const totalAmountW = textWidth(ctx, totalAmount, TOTAL_AMOUNT);
  const totalLabelW = CONTENT_WIDTH - totalAmountW - 24;
  const totalLabelLines = wrapText(ctx, labels.total, totalLabelW, TOTAL_LABEL);
  const amountLine = linePitch(TOTAL_AMOUNT);
  // `align-items: baseline`: the label's first baseline sits on the amount's.
  const labelShift = baselineOffset(TOTAL_AMOUNT) - baselineOffset(TOTAL_LABEL);
  const totalRowH = Math.max(
    amountLine,
    labelShift + totalLabelLines.length * linePitch(TOTAL_LABEL),
  );
  const vat = vatNote(view.finance, labels);
  const vatH = measureText(ctx, vat, CONTENT_WIDTH, STYLE.note);
  const statusBoxH =
    14 +
    measureText(ctx, labels.paymentStatus, CONTENT_WIDTH - 28, STYLE.label) +
    4 +
    PILL_HEIGHT +
    14;

  const bodyH =
    lineHeights.reduce((a, b) => a + b, 0) +
    2 +
    2 +
    14 +
    totalRowH +
    2 +
    vatH +
    SECTION_GAP +
    statusBoxH;
  drawSectionHeading(ctx, 7, labels.sections.finance, bodyH);

  lines.forEach((line, index) => {
    const top = ctx.y;
    let y = top + 9;
    drawText(ctx, line.amount, RIGHT - amountW, y, amountW, {
      ...STYLE.value,
      align: "right",
    });
    y += drawText(ctx, line.label, LEFT, y, labelW, STYLE.value);
    if (line.note) {
      drawText(ctx, line.note, LEFT, y + 2, labelW, STYLE.note);
    }
    ctx.y = top + lineHeights[index]! - 1;
    rule(ctx, ctx.y);
    ctx.y += 1;
  });

  ctx.y += 2;
  rule(ctx, ctx.y, 2, COLORS.ink);
  ctx.y += 2 + 14;
  drawText(ctx, totalAmount, RIGHT - totalAmountW, ctx.y, totalAmountW, {
    ...TOTAL_AMOUNT,
    align: "right",
  });
  drawText(
    ctx,
    labels.total,
    LEFT,
    ctx.y + labelShift,
    totalLabelW,
    TOTAL_LABEL,
  );
  ctx.y += totalRowH + 2;
  drawText(ctx, vat, LEFT, ctx.y, CONTENT_WIDTH, {
    ...STYLE.note,
    align: "right",
  });
  ctx.y += vatH + SECTION_GAP;

  box(ctx, LEFT, ctx.y, CONTENT_WIDTH, statusBoxH, 8, COLORS.fill, null);
  let y = ctx.y + 14;
  y += drawText(
    ctx,
    labels.paymentStatus,
    LEFT + 14,
    y,
    CONTENT_WIDTH - 28,
    STYLE.label,
  );
  drawPill(
    ctx,
    labels.paymentStatuses[view.finance.paymentStatus],
    LEFT + 14,
    y + 4,
    TONES[paymentStatusTone(view.finance.paymentStatus)],
    CONTENT_WIDTH - 28,
  );
  ctx.y += statusBoxH;
}

/**
 * The running footer on every page, drawn after the content so the page count
 * is known: a 1px rule, then `ZOMO · {reference}` (Plex Mono) left and the
 * "generated automatically" line right — with "Page n of N" appended when the
 * document runs to more than one page.
 */
function drawFooters(
  ctx: Ctx,
  view: ServiceDocumentView,
  generatedAt: Date,
): void {
  const { labels } = ctx;
  const timestamp = formatPdfDateTime(generatedAt);
  const range = ctx.doc.bufferedPageRange();
  const pages = range.count;
  const style: TextStyle = { size: 11, color: COLORS.muted };
  for (let i = 0; i < pages; i++) {
    ctx.doc.switchToPage(range.start + i);
    ctx.doc.save();
    ctx.doc.scale(PX);

    rule(ctx, FOOTER_TOP);
    const y = FOOTER_TOP + 1 + 10;
    const left = `ZOMO · ${orDash(view.reference)}`;
    const leftW = textWidth(ctx, left, {
      ...style,
      family: "mono",
      weight: 500,
    });
    drawText(ctx, left, LEFT, y, leftW + 1, {
      ...style,
      family: "mono",
      weight: 500,
    });
    const right =
      pages > 1
        ? `${labels.generated(timestamp)} · ${labels.page(i + 1, pages)}`
        : labels.generated(timestamp);
    drawText(ctx, right, LEFT + leftW + 16, y, CONTENT_WIDTH - leftW - 16, {
      ...style,
      align: "right",
    });

    ctx.doc.restore();
  }
}

export type RenderServiceDocumentPdfOptions = {
  /** The document language. */
  locale: PdfLocale;
  /** The "Issued" / footer instant; defaults to now. Fixed in tests. */
  generatedAt?: Date;
};

/**
 * Renders the document to a PDF buffer in one language. Pure apart from
 * reading the bundled fonts: no network, no database, no request context.
 */
export function renderServiceDocumentPdf(
  view: ServiceDocumentView,
  labels: ServiceDocumentPdfLabels,
  options: RenderServiceDocumentPdfOptions,
): Promise<Buffer> {
  const fonts = loadFonts();
  const generatedAt = options.generatedAt ?? new Date();

  const doc = new PDFDocument({
    size: "A4",
    // Margins are applied by the layout itself (in px); pdfkit's own must be
    // zero so it never decides on a page break of its own.
    margin: 0,
    autoFirstPage: false,
    bufferPages: true,
    // Handing pdfkit our own font up front means it never loads Helvetica.
    font: fonts.buffers["plex-400"] as unknown as string,
    lang: options.locale,
    displayTitle: true,
    info: {
      Title: `${labels.title} — ${view.reference}`,
      Subject: `${labels.documentNumber} ${view.documentNumber}`,
      Author: "zomo",
      Creator: "zomo",
      Producer: "zomo",
      CreationDate: generatedAt,
    },
  });

  for (const [name, buffer] of Object.entries(fonts.buffers) as [
    FontName,
    Buffer,
  ][]) {
    doc.registerFont(name, buffer);
  }

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  try {
    const ctx: Ctx = { doc, fonts, labels, y: PAGE.margin };
    startPage(ctx);
    drawHeader(ctx, view, generatedAt);
    if (view.preliminary) {
      blockGap(ctx);
      drawPreliminary(ctx);
    }
    for (const section of [
      drawOrderInfo,
      drawCustomer,
      drawVehicleDriver,
      drawTransportation,
      drawCargo,
      drawServices,
      drawFinance,
    ]) {
      blockGap(ctx);
      section(ctx, view);
    }
    endPage(ctx);
    drawFooters(ctx, view, generatedAt);
    doc.end();
  } catch (error) {
    // Close the stream so the promise above cannot dangle, then surface the
    // real error rather than whatever a half-written document produces.
    doc.end();
    return done.then(() => Promise.reject(error));
  }

  return done;
}
