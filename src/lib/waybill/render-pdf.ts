/**
 * The client's order-details PDF ("შეკვეთის დეტალები / Invoice / Order
 * details"): one A4 document per order, printed in Georgian and English side
 * by side.
 *
 * **What it documents.** The transportation service a BUSINESS client bought
 * on zomo — nothing else. CLIENT and SELLER (zomo) side by side, then the
 * SERVICE PROVIDER (carrier company or independent driver) with the DRIVER and
 * VEHICLE that ran the trip, the route and cargo in one short block, and the
 * SERVICE AMOUNT: one "Transportation service" line, then net, VAT and the
 * VAT-inclusive grand total. No buyer, no recipient, no goods prices. It is
 * deliberately *not* styled or titled as the official RS.GE e-waybill
 * ("სასაქონლო ზედნადები").
 *
 * **Input.** A `ServiceDocumentView` (built by `buildServiceDocumentView` in
 * `src/lib/orders/service-document-server.ts`) plus a plain
 * `ServiceDocumentPdfLabels` object holding both locales' strings. The
 * renderer never calls `next-intl` itself: the route builds the labels with
 * `serviceDocumentPdfLocaleLabels(...)`, and `tests/service-document-pdf.spec.ts`
 * builds them from the JSON catalogs directly, so the whole document renders
 * with neither a request nor a server.
 *
 * **Fonts.** Noto Sans Georgian (the Google Fonts build — it carries Mkhedruli,
 * Latin, digits, "№" and "₾") is the primary face. It has no Cyrillic, Greek or
 * superscripts, so Noto Sans is embedded as a fallback and text is split into
 * runs per font. pdfkit has no font fallback of its own, which is why this
 * module does its own line wrapping: a wrapped address can switch fonts
 * mid-line and still be measured correctly. Both families are SIL OFL 1.1
 * (`fonts/OFL*.txt`), and pdfkit subsets them, so a document carries only the
 * glyphs it uses.
 *
 * The TTFs are read with `fs` from `process.cwd()`, never imported, because
 * webpack would otherwise try to bundle them. `next.config.ts` lists the
 * directory in `outputFileTracingIncludes` for the PDF route, and keeps
 * `pdfkit`/`fontkit` external. The primary font is handed to the
 * `PDFDocument` constructor so pdfkit never loads its built-in Helvetica.
 *
 * **Not `server-only`**: the spec imports it with no Next runtime. It is still
 * Node-only (it reads files), so only server code may import it.
 *
 * **Formatting rules.** Missing values print as a blank line ("________") so
 * the paper can be filled in by hand; dates are DD/MM/YYYY in Asia/Tbilisi;
 * money has two decimals and a "GEL" suffix; a document whose provider, driver
 * and vehicle are not yet frozen carries a "Preliminary" banner.
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
  CARGO_CATEGORY_LABEL_KEYS,
  driverFullName,
  vehicleMakeModel,
  type CargoCategoryValue,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";

/** Printed wherever a value is missing, so it can be filled in by pen. */
export const PDF_BLANK = "________";

/** The strings of one locale. Parameterised strings are functions. */
export type ServiceDocumentPdfLocaleLabels = {
  title: string;
  orderNo: string;
  date: string;
  client: string;
  seller: string;
  serviceProvider: string;
  providerCompany: string;
  providerDriver: string;
  company: string;
  name: string;
  taxId: string;
  personalId: string;
  address: string;
  driver: string;
  vehicle: string;
  vehicleMakeModel: string;
  vehiclePlate: string;
  trailerPlate: string;
  route: string;
  pickupAddress: string;
  dropoffAddress: string;
  cargo: string;
  serviceAmount: string;
  service: string;
  amount: string;
  transportationService: string;
  net: string;
  grandTotal: string;
  preliminary: string;
  /** `orderDocument.pdf.vat` — `rate` is a percentage, e.g. 18. */
  vat: (rate: number) => string;
  /** `orderDocument.pdf.vatIncluded`. */
  vatIncluded: (rate: number) => string;
  /** `orderDocument.pdf.generated`. */
  generated: (timestamp: string) => string;
  /** `orderDocument.pdf.page`. */
  page: (page: number, pages: number) => string;
  /** `common.cargoCategory.*`, keyed by the Prisma enum value. */
  cargoCategories: Record<CargoCategoryValue, string>;
};

/** Every label is printed as "{ka} / {en}", so the renderer needs both. */
export type ServiceDocumentPdfLabels = {
  ka: ServiceDocumentPdfLocaleLabels;
  en: ServiceDocumentPdfLocaleLabels;
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

/** One locale's labels from a root translator (full key paths). */
export function serviceDocumentPdfLocaleLabels(
  t: PdfTranslator,
): ServiceDocumentPdfLocaleLabels {
  const p = (key: string) => t(`orderDocument.pdf.${key}`);
  const cargoCategories = {} as Record<CargoCategoryValue, string>;
  for (const [value, key] of Object.entries(CARGO_CATEGORY_LABEL_KEYS) as [
    CargoCategoryValue,
    string,
  ][]) {
    cargoCategories[value] = t(`common.cargoCategory.${key}`);
  }

  return {
    title: p("title"),
    orderNo: p("orderNo"),
    date: p("date"),
    client: p("client"),
    seller: p("seller"),
    serviceProvider: p("serviceProvider"),
    providerCompany: p("providerCompany"),
    providerDriver: p("providerDriver"),
    company: p("company"),
    name: p("name"),
    taxId: p("taxId"),
    personalId: p("personalId"),
    address: p("address"),
    driver: p("driver"),
    vehicle: p("vehicle"),
    vehicleMakeModel: p("vehicleMakeModel"),
    vehiclePlate: p("vehiclePlate"),
    trailerPlate: p("trailerPlate"),
    route: p("route"),
    pickupAddress: p("pickupAddress"),
    dropoffAddress: p("dropoffAddress"),
    cargo: p("cargo"),
    serviceAmount: p("serviceAmount"),
    service: p("service"),
    amount: p("amount"),
    transportationService: p("transportationService"),
    net: p("net"),
    grandTotal: p("grandTotal"),
    preliminary: p("preliminary"),
    vat: (rate) => t("orderDocument.pdf.vat", { rate }),
    vatIncluded: (rate) => t("orderDocument.pdf.vatIncluded", { rate }),
    generated: (timestamp) => t("orderDocument.pdf.generated", { timestamp }),
    page: (page, pages) => t("orderDocument.pdf.page", { page, pages }),
    cargoCategories,
  };
}

// ---------------------------------------------------------------------------
// Pure formatting — exported for the spec.
// ---------------------------------------------------------------------------

const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_PARTS_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: HUB_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `1234.5` → `"1,234.50 GEL"`. */
export function formatPdfMoney(amount: number): string {
  return `${MONEY_FORMAT.format(amount)} GEL`;
}

function tbilisiParts(instant: Date): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of DATE_PARTS_FORMAT.formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return parts;
}

/**
 * An instant as DD/MM/YYYY on the Tbilisi calendar, or the blank line for a
 * missing or unparseable value. Built from parts rather than trusting a
 * locale's own pattern, so the separator and order never change underneath us.
 */
export function formatPdfDate(value: string | Date | null): string {
  if (value === null) {
    return PDF_BLANK;
  }
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    return PDF_BLANK;
  }
  const p = tbilisiParts(instant);
  return `${p.day}/${p.month}/${p.year}`;
}

/** DD/MM/YYYY HH:mm on the Tbilisi clock, for the footer. */
export function formatPdfTimestamp(instant: Date): string {
  const p = tbilisiParts(instant);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** The value, trimmed, or the blank line when there is nothing to print. */
export function orBlank(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : PDF_BLANK;
}

function bilingual(ka: string, en: string): string {
  return ka === en ? ka : `${ka} / ${en}`;
}

/** The VAT rate as a printable percentage: 0.18 → 18 (never 18.000000000000004). */
export function vatPercent(rate: number): number {
  return Math.round(rate * 100 * 100) / 100;
}

/** One line of the amount block, top to bottom. */
export type AmountRow = {
  kind: "net" | "vat" | "grandTotal";
  label: string;
  amount: string;
};

/**
 * Net, VAT and grand total as data. The figures come from `view.amounts`,
 * already split server-side by `computeServiceAmounts`; nothing is re-derived
 * here.
 */
export function serviceAmountRows(
  view: Pick<ServiceDocumentView, "amounts">,
  labels: ServiceDocumentPdfLabels,
): AmountRow[] {
  const rate = vatPercent(view.amounts.vatRate);
  return [
    {
      kind: "net",
      label: bilingual(labels.ka.net, labels.en.net),
      amount: formatPdfMoney(view.amounts.net),
    },
    {
      kind: "vat",
      label: bilingual(labels.ka.vat(rate), labels.en.vat(rate)),
      amount: formatPdfMoney(view.amounts.vat),
    },
    {
      kind: "grandTotal",
      label: bilingual(labels.ka.grandTotal, labels.en.grandTotal),
      amount: formatPdfMoney(view.amounts.gross),
    },
  ];
}

/**
 * Whether the provider's identifier is a person's personal number rather than
 * a company tax ID: an independent driver printed as themselves (not as a
 * BUSINESS account's company) is identified by their personal ID.
 */
export function providerIdIsPersonalId(
  view: Pick<ServiceDocumentView, "provider" | "driver">,
): boolean {
  return (
    view.provider?.kind === "DRIVER" &&
    view.provider.taxId !== null &&
    view.provider.taxId === view.driver.personalId
  );
}

// ---------------------------------------------------------------------------
// Fonts.
// ---------------------------------------------------------------------------

type FontFace = "regular" | "bold";

/** pdfkit font names: primary and fallback per weight. */
const FONT_NAMES = {
  regular: { primary: "georgian-regular", fallback: "latin-regular" },
  bold: { primary: "georgian-bold", fallback: "latin-bold" },
} as const;

type FontName =
  (typeof FONT_NAMES)[FontFace][keyof (typeof FONT_NAMES)["regular"]];

const FONT_FILES: Record<FontName, string> = {
  "georgian-regular": "NotoSansGeorgian-Regular.ttf",
  "georgian-bold": "NotoSansGeorgian-Bold.ttf",
  "latin-regular": "NotoSans-Regular.ttf",
  "latin-bold": "NotoSans-Bold.ttf",
};

type LoadedFonts = {
  buffers: Record<FontName, Buffer>;
  /** Whether the primary (Georgian) family can draw a code point. */
  primaryHas: (codePoint: number) => boolean;
  fallbackHas: (codePoint: number) => boolean;
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
 * Reads the four TTFs once per process. The directory is resolved from
 * `process.cwd()` (the project root under `next dev`, `next start` and
 * Playwright alike) because `__dirname` points into `.next/` once bundled.
 */
function loadFonts(): LoadedFonts {
  if (loadedFonts) {
    return loadedFonts;
  }
  const dir = join(process.cwd(), "src", "lib", "waybill", "fonts");
  const buffers = {} as Record<FontName, Buffer>;
  for (const [name, file] of Object.entries(FONT_FILES) as [
    FontName,
    string,
  ][]) {
    buffers[name] = readFileSync(join(dir, file));
  }
  // Regular and bold of one family share a character set; check one of each.
  const primary = fontKitFont(buffers["georgian-regular"]);
  const fallback = fontKitFont(buffers["latin-regular"]);
  const glyphCache = new Map<number, boolean>();
  loadedFonts = {
    buffers,
    primaryHas: (codePoint) => {
      let has = glyphCache.get(codePoint);
      if (has === undefined) {
        has = primary.hasGlyphForCodePoint(codePoint);
        glyphCache.set(codePoint, has);
      }
      return has;
    },
    fallbackHas: (codePoint) => fallback.hasGlyphForCodePoint(codePoint),
  };
  return loadedFonts;
}

// ---------------------------------------------------------------------------
// Text layout: runs per font, greedy word wrap.
// ---------------------------------------------------------------------------

type Run = { text: string; font: FontName };
type Line = { runs: Run[]; width: number };

type TextStyle = {
  size: number;
  face?: FontFace;
  color?: string;
  align?: "left" | "right" | "center";
};

/** Line pitch as a multiple of the font size; Noto's ascent+descent is 1.36 em. */
const LINE_HEIGHT = 1.42;

type Typesetter = {
  doc: PDFKit.PDFDocument;
  fonts: LoadedFonts;
};

/**
 * Splits text into runs the primary font can draw and runs that need the
 * fallback. Spaces and anything neither font has stay with the primary, so a
 * Latin word inside Georgian text does not fragment the line needlessly.
 */
function splitRuns(fonts: LoadedFonts, text: string, face: FontFace): Run[] {
  const runs: Run[] = [];
  const names = FONT_NAMES[face];
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    const font =
      !fonts.primaryHas(codePoint) && fonts.fallbackHas(codePoint)
        ? names.fallback
        : names.primary;
    const last = runs[runs.length - 1];
    if (last && last.font === font) {
      last.text += char;
    } else {
      runs.push({ text: char, font });
    }
  }
  return runs;
}

function runsWidth(ts: Typesetter, runs: Run[], size: number): number {
  let width = 0;
  for (const run of runs) {
    width += ts.doc.font(run.font).fontSize(size).widthOfString(run.text);
  }
  return width;
}

/**
 * Greedy word wrap into lines no wider than `maxWidth`. Explicit newlines are
 * honoured; a single word wider than the column (a long code, a URL) is broken
 * between characters rather than allowed to overflow into the next column.
 */
function wrapText(
  ts: Typesetter,
  text: string,
  maxWidth: number,
  style: TextStyle,
): Line[] {
  const face = style.face ?? "regular";
  const measure = (s: string) =>
    runsWidth(ts, splitRuns(ts.fonts, s, face), style.size);
  const lines: string[] = [];

  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
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

  return lines.map((line) => {
    const runs = splitRuns(ts.fonts, line, face);
    return { runs, width: runsWidth(ts, runs, style.size) };
  });
}

function blockHeight(lines: Line[], size: number): number {
  return lines.length * size * LINE_HEIGHT;
}

function measureText(
  ts: Typesetter,
  text: string,
  width: number,
  style: TextStyle,
): number {
  return blockHeight(wrapText(ts, text, width, style), style.size);
}

/**
 * Draws wrapped text with its top-left at (x, y) and returns its height. Each
 * run is placed with `lineBreak: false` at a computed x, so pdfkit's own
 * wrapper (which knows nothing about the fallback font) never runs.
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
  const pitch = style.size * LINE_HEIGHT;
  // Centre the 1.36 em glyph box inside the 1.42 em line.
  const inset = (pitch - style.size * 1.36) / 2;
  ts.doc.fillColor(style.color ?? COLORS.text);
  lines.forEach((line, index) => {
    let cursor = x;
    if (style.align === "right") {
      cursor = x + width - line.width;
    } else if (style.align === "center") {
      cursor = x + (width - line.width) / 2;
    }
    const lineY = y + index * pitch + inset;
    for (const run of line.runs) {
      ts.doc
        .font(run.font)
        .fontSize(style.size)
        .text(run.text, cursor, lineY, { lineBreak: false });
      cursor += ts.doc.widthOfString(run.text);
    }
  });
  return blockHeight(lines, style.size);
}

// ---------------------------------------------------------------------------
// Page geometry and palette.
// ---------------------------------------------------------------------------

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
} as const;

const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
/** Space kept clear at the bottom of every page for the footer. */
const FOOTER_HEIGHT = 34;
const CONTENT_BOTTOM = PAGE.height - PAGE.margin - FOOTER_HEIGHT;
const GAP = 16;
const HALF = (CONTENT_WIDTH - GAP) / 2;

const COLORS = {
  text: "#111827",
  muted: "#6b7280",
  rule: "#d1d5db",
  strongRule: "#111827",
  panel: "#f3f4f6",
  noticeFill: "#fff7ed",
  noticeBorder: "#fdba74",
  noticeText: "#9a3412",
} as const;

const SIZE = {
  title: 15,
  heading: 10,
  subheading: 8.5,
  label: 7.5,
  value: 9.5,
  footer: 7,
} as const;

// ---------------------------------------------------------------------------
// Sections.
// ---------------------------------------------------------------------------

type Field = { label: string; value: string };

type Ctx = Typesetter & { labels: ServiceDocumentPdfLabels; y: number };

function addPage(ctx: Ctx): void {
  ctx.doc.addPage();
  ctx.y = PAGE.margin;
}

/** Starts a new page when `height` more points would run into the footer. */
function ensureSpace(ctx: Ctx, height: number): void {
  if (ctx.y + height > CONTENT_BOTTOM) {
    addPage(ctx);
  }
}

function label(ctx: Ctx, key: keyof ServiceDocumentPdfLocaleLabels): string {
  return bilingual(ctx.labels.ka[key] as string, ctx.labels.en[key] as string);
}

function fieldHeight(ctx: Ctx, field: Field, width: number): number {
  return (
    measureText(ctx, field.label, width, { size: SIZE.label }) +
    1 +
    measureText(ctx, field.value, width, { size: SIZE.value, face: "bold" })
  );
}

function drawField(
  ctx: Ctx,
  field: Field,
  x: number,
  y: number,
  width: number,
): number {
  let height = drawText(ctx, field.label, x, y, width, {
    size: SIZE.label,
    color: COLORS.muted,
  });
  height += 1;
  height += drawText(ctx, field.value, x, y + height, width, {
    size: SIZE.value,
    face: "bold",
  });
  return height;
}

const FIELD_GAP = 7;

function fieldsHeight(ctx: Ctx, fields: Field[], width: number): number {
  return (
    fields.reduce((sum, f) => sum + fieldHeight(ctx, f, width) + FIELD_GAP, 0) -
    FIELD_GAP
  );
}

function drawFields(
  ctx: Ctx,
  fields: Field[],
  x: number,
  y: number,
  width: number,
): void {
  for (const field of fields) {
    y += drawField(ctx, field, x, y, width) + FIELD_GAP;
  }
}

function drawSectionHeading(ctx: Ctx, text: string): void {
  const height = drawText(ctx, text, PAGE.margin, ctx.y, CONTENT_WIDTH, {
    size: SIZE.heading,
    face: "bold",
  });
  ctx.y += height + 3;
  ctx.doc
    .moveTo(PAGE.margin, ctx.y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, ctx.y)
    .lineWidth(0.8)
    .strokeColor(COLORS.strongRule)
    .stroke();
  ctx.y += 8;
}

function headingHeight(ctx: Ctx, text: string): number {
  return (
    measureText(ctx, text, CONTENT_WIDTH, {
      size: SIZE.heading,
      face: "bold",
    }) + 11
  );
}

/** Height of the brand lockup in the header; its width follows the viewBox. */
const LOGO_HEIGHT = 24;
const LOGO_WIDTH =
  (LOGO_HEIGHT / ZOMO_LOCKUP_GEOMETRY.height) * ZOMO_LOCKUP_GEOMETRY.width;

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

function drawHeader(ctx: Ctx, view: ServiceDocumentView): void {
  // Brand lockup, top right: the document is ours, not the tax office's.
  drawZomoLockup(
    ctx.doc,
    PAGE.margin + CONTENT_WIDTH - LOGO_WIDTH,
    ctx.y - 2,
    LOGO_HEIGHT,
  );

  ctx.y += drawText(
    ctx,
    label(ctx, "title"),
    PAGE.margin,
    ctx.y,
    CONTENT_WIDTH - LOGO_WIDTH - GAP,
    { size: SIZE.title, face: "bold" },
  );
  ctx.y += 6;

  const left = drawField(
    ctx,
    { label: label(ctx, "orderNo"), value: orBlank(view.reference) },
    PAGE.margin,
    ctx.y,
    HALF,
  );
  const right = drawField(
    ctx,
    { label: label(ctx, "date"), value: formatPdfDate(view.documentDate) },
    PAGE.margin + HALF + GAP,
    ctx.y,
    HALF,
  );
  ctx.y += Math.max(left, right) + 8;

  ctx.doc
    .moveTo(PAGE.margin, ctx.y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, ctx.y)
    .lineWidth(1.4)
    .strokeColor(COLORS.strongRule)
    .stroke();
  ctx.y += 12;
}

function drawPreliminary(ctx: Ctx): void {
  const text = label(ctx, "preliminary");
  const innerWidth = CONTENT_WIDTH - 20;
  const height =
    measureText(ctx, text, innerWidth, { size: 8.5, face: "bold" }) + 12;
  ctx.doc
    .roundedRect(PAGE.margin, ctx.y, CONTENT_WIDTH, height, 3)
    .lineWidth(0.8)
    .fillAndStroke(COLORS.noticeFill, COLORS.noticeBorder);
  drawText(ctx, text, PAGE.margin + 10, ctx.y + 6, innerWidth, {
    size: 8.5,
    face: "bold",
    color: COLORS.noticeText,
  });
  ctx.y += height + 12;
}

type Column = { heading: string; fields: Field[] };

/**
 * Boxed columns of equal height side by side — a grey heading band over the
 * fields. Used for CLIENT | SELLER and for the provider | driver + vehicle row.
 */
function drawBoxes(ctx: Ctx, columns: Column[]): void {
  const boxWidth =
    (CONTENT_WIDTH - GAP * (columns.length - 1)) / columns.length;
  const pad = 10;
  const inner = boxWidth - pad * 2;
  const headingStyle: TextStyle = { size: SIZE.heading, face: "bold" };

  const headBand =
    Math.max(
      ...columns.map((c) => measureText(ctx, c.heading, inner, headingStyle)),
    ) + 10;
  const bodyHeight =
    Math.max(...columns.map((c) => fieldsHeight(ctx, c.fields, inner))) + pad;
  const total = headBand + pad + bodyHeight;

  ensureSpace(ctx, total);
  const top = ctx.y;

  columns.forEach((column, index) => {
    const x = PAGE.margin + index * (boxWidth + GAP);
    ctx.doc.rect(x, top, boxWidth, headBand).fill(COLORS.panel);
    ctx.doc
      .rect(x, top, boxWidth, total)
      .lineWidth(0.8)
      .strokeColor(COLORS.rule)
      .stroke();
    drawText(ctx, column.heading, x + pad, top + 5, inner, headingStyle);
    drawFields(ctx, column.fields, x + pad, top + headBand + pad, inner);
  });

  ctx.y = top + total + 12;
}

function partyFields(ctx: Ctx, party: ServiceDocumentView["client"]): Field[] {
  return [
    { label: label(ctx, "company"), value: orBlank(party.name) },
    { label: label(ctx, "taxId"), value: orBlank(party.taxId) },
    { label: label(ctx, "address"), value: orBlank(party.address) },
  ];
}

function drawClientAndSeller(ctx: Ctx, view: ServiceDocumentView): void {
  drawBoxes(ctx, [
    { heading: label(ctx, "client"), fields: partyFields(ctx, view.client) },
    { heading: label(ctx, "seller"), fields: partyFields(ctx, view.seller) },
  ]);
}

/**
 * SERVICE PROVIDER on the left — what kind of provider, its name, its
 * identifier and address — and the DRIVER and VEHICLE that ran the trip on the
 * right. The trailer plate only appears when there is one: most trips have no
 * trailer, and a blank line there reads as "missing".
 */
function drawProvider(ctx: Ctx, view: ServiceDocumentView): void {
  const provider = view.provider;
  const kind = provider
    ? label(
        ctx,
        provider.kind === "COMPANY" ? "providerCompany" : "providerDriver",
      )
    : label(ctx, "name");

  // The kind of provider is the label of its name line ("Carrier company:
  // Diplomat Georgia LLC"), so the box needs no separate "type" row.
  const providerFields: Field[] = [
    { label: kind, value: orBlank(provider?.name) },
    {
      label: label(ctx, providerIdIsPersonalId(view) ? "personalId" : "taxId"),
      value: orBlank(provider?.taxId),
    },
  ];
  // An independent driver has no business address on file; a blank line
  // would only invite a hand-written one.
  if (provider?.kind !== "DRIVER" || provider.address) {
    providerFields.push({
      label: label(ctx, "address"),
      value: orBlank(provider?.address),
    });
  }

  const driverVehicle: Field[] = [
    {
      label: label(ctx, "driver"),
      value: orBlank(driverFullName(view.driver)),
    },
    { label: label(ctx, "personalId"), value: orBlank(view.driver.personalId) },
    {
      label: label(ctx, "vehicleMakeModel"),
      value: orBlank(vehicleMakeModel(view.vehicle)),
    },
    { label: label(ctx, "vehiclePlate"), value: orBlank(view.vehicle.plate) },
  ];
  if (view.vehicle.trailerPlate?.trim()) {
    driverVehicle.push({
      label: label(ctx, "trailerPlate"),
      value: view.vehicle.trailerPlate.trim(),
    });
  }

  drawBoxes(ctx, [
    { heading: label(ctx, "serviceProvider"), fields: providerFields },
    {
      heading: `${label(ctx, "driver")} · ${label(ctx, "vehicle")}`,
      fields: driverVehicle,
    },
  ]);
}

/** Route and cargo: pickup | drop-off, then one short cargo line. */
function drawRoute(ctx: Ctx, view: ServiceDocumentView): void {
  const heading = label(ctx, "route");
  const stops: Field[] = [
    {
      label: label(ctx, "pickupAddress"),
      value: orBlank(view.route.pickupAddress),
    },
    {
      label: label(ctx, "dropoffAddress"),
      value: orBlank(view.route.dropoffAddress),
    },
  ];
  const category = bilingual(
    ctx.labels.ka.cargoCategories[view.cargo.category],
    ctx.labels.en.cargoCategories[view.cargo.category],
  );
  const cargo: Field = {
    label: label(ctx, "cargo"),
    value: view.cargo.description
      ? `${category} — ${view.cargo.description}`
      : category,
  };

  const stopsHeight = Math.max(...stops.map((f) => fieldHeight(ctx, f, HALF)));
  ensureSpace(ctx, headingHeight(ctx, heading) + stopsHeight);
  drawSectionHeading(ctx, heading);
  stops.forEach((f, index) => {
    drawField(ctx, f, PAGE.margin + index * (HALF + GAP), ctx.y, HALF);
  });
  ctx.y += stopsHeight + 9;

  const cargoHeight = fieldHeight(ctx, cargo, CONTENT_WIDTH);
  ensureSpace(ctx, cargoHeight);
  drawField(ctx, cargo, PAGE.margin, ctx.y, CONTENT_WIDTH);
  ctx.y += cargoHeight + 14;
}

/**
 * SERVICE AMOUNT: a one-line table (the transportation service and what the
 * client paid for it), then net / VAT / grand total on the right and the
 * "prices include VAT" note on the left.
 */
function drawAmount(ctx: Ctx, view: ServiceDocumentView): void {
  const { ka, en } = ctx.labels;
  const heading = label(ctx, "serviceAmount");
  const amountColumn = 120;
  const pad = 6;
  const serviceWidth = CONTENT_WIDTH - amountColumn - pad * 2;

  const serviceText = label(ctx, "transportationService");
  const headerHeight =
    measureText(ctx, label(ctx, "service"), serviceWidth, {
      size: SIZE.label,
      face: "bold",
    }) +
    pad * 2;
  const lineHeight =
    measureText(ctx, serviceText, serviceWidth, { size: SIZE.value }) + pad * 2;

  const rows = serviceAmountRows(view, ctx.labels);
  const blockWidth = 320;
  const blockX = PAGE.margin + CONTENT_WIDTH - blockWidth;
  const amountWidth = 100;
  const labelWidth = blockWidth - amountWidth - 12;
  const rowStyle = (row: AmountRow): TextStyle =>
    row.kind === "grandTotal"
      ? { size: 10, face: "bold" }
      : { size: SIZE.value };
  const rowHeights = rows.map(
    (row) =>
      measureText(ctx, row.label, labelWidth, rowStyle(row)) +
      (row.kind === "grandTotal" ? 12 : 6),
  );
  const totalsHeight = rowHeights.reduce((a, b) => a + b, 0);

  ensureSpace(
    ctx,
    headingHeight(ctx, heading) + headerHeight + lineHeight + 10 + totalsHeight,
  );
  drawSectionHeading(ctx, heading);
  ctx.y -= 4;

  // Column header.
  ctx.doc
    .rect(PAGE.margin, ctx.y, CONTENT_WIDTH, headerHeight)
    .fill(COLORS.panel);
  drawText(
    ctx,
    label(ctx, "service"),
    PAGE.margin + pad,
    ctx.y + pad,
    serviceWidth,
    {
      size: SIZE.label,
      face: "bold",
    },
  );
  drawText(
    ctx,
    label(ctx, "amount"),
    PAGE.margin + CONTENT_WIDTH - amountColumn,
    ctx.y + pad,
    amountColumn - pad,
    { size: SIZE.label, face: "bold", align: "right" },
  );
  ctx.y += headerHeight;

  // The one service line: the amount the client paid, VAT included.
  drawText(ctx, serviceText, PAGE.margin + pad, ctx.y + pad, serviceWidth, {
    size: SIZE.value,
  });
  drawText(
    ctx,
    formatPdfMoney(view.amounts.gross),
    PAGE.margin + CONTENT_WIDTH - amountColumn,
    ctx.y + pad,
    amountColumn - pad,
    { size: SIZE.value, face: "bold", align: "right" },
  );
  ctx.y += lineHeight;
  ctx.doc
    .moveTo(PAGE.margin, ctx.y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, ctx.y)
    .lineWidth(0.5)
    .strokeColor(COLORS.rule)
    .stroke();
  ctx.y += 10;

  const top = ctx.y;
  const rate = vatPercent(view.amounts.vatRate);
  drawText(
    ctx,
    bilingual(ka.vatIncluded(rate), en.vatIncluded(rate)),
    PAGE.margin,
    top + 3,
    CONTENT_WIDTH - blockWidth - 24,
    { size: SIZE.label, color: COLORS.muted },
  );

  let y = top;
  rows.forEach((row, index) => {
    const style = rowStyle(row);
    const h = rowHeights[index]!;
    if (row.kind === "grandTotal") {
      ctx.doc.rect(blockX, y, blockWidth, h).fill(COLORS.panel);
      ctx.doc
        .moveTo(blockX, y)
        .lineTo(blockX + blockWidth, y)
        .lineWidth(1.2)
        .strokeColor(COLORS.strongRule)
        .stroke();
      y += 6;
    } else {
      y += 3;
    }
    drawText(ctx, row.label, blockX + 6, y, labelWidth, {
      ...style,
      color: row.kind === "grandTotal" ? COLORS.text : COLORS.muted,
    });
    drawText(
      ctx,
      row.amount,
      blockX + blockWidth - amountWidth - 6,
      y,
      amountWidth,
      {
        ...style,
        align: "right",
      },
    );
    y += h - (row.kind === "grandTotal" ? 6 : 3);
  });

  ctx.y = top + totalsHeight + 10;
}

/**
 * The footer on every page, drawn after the content so the page count is
 * known. The bottom margin is lifted while drawing: pdfkit starts a new page
 * for any text placed below it.
 */
function drawFooters(ctx: Ctx, generatedAt: Date): void {
  const { ka, en } = ctx.labels;
  const timestamp = formatPdfTimestamp(generatedAt);
  const range = ctx.doc.bufferedPageRange();
  const pages = range.count;
  for (let i = 0; i < pages; i++) {
    ctx.doc.switchToPage(range.start + i);
    const savedBottom = ctx.doc.page.margins.bottom;
    ctx.doc.page.margins.bottom = 0;

    const top = PAGE.height - PAGE.margin - FOOTER_HEIGHT + 12;
    ctx.doc
      .moveTo(PAGE.margin, top)
      .lineTo(PAGE.margin + CONTENT_WIDTH, top)
      .lineWidth(0.5)
      .strokeColor(COLORS.rule)
      .stroke();
    const half = CONTENT_WIDTH / 2;
    const style: TextStyle = { size: SIZE.footer, color: COLORS.muted };
    let y = top + 4;
    y += drawText(ctx, ka.generated(timestamp), PAGE.margin, y, half, style);
    drawText(ctx, en.generated(timestamp), PAGE.margin, y, half, style);
    y = top + 4;
    y += drawText(ctx, ka.page(i + 1, pages), PAGE.margin + half, y, half, {
      ...style,
      align: "right",
    });
    drawText(ctx, en.page(i + 1, pages), PAGE.margin + half, y, half, {
      ...style,
      align: "right",
    });

    ctx.doc.page.margins.bottom = savedBottom;
  }
}

export type RenderServiceDocumentPdfOptions = {
  /** The footer's "generated" instant; defaults to now. Fixed in tests. */
  generatedAt?: Date;
};

/**
 * Renders the document to a PDF buffer. Pure apart from reading the bundled
 * fonts: no network, no database, no request context.
 */
export function renderServiceDocumentPdf(
  view: ServiceDocumentView,
  labels: ServiceDocumentPdfLabels,
  options: RenderServiceDocumentPdfOptions = {},
): Promise<Buffer> {
  const fonts = loadFonts();
  const generatedAt = options.generatedAt ?? new Date();

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE.margin,
    bufferPages: true,
    // Handing pdfkit our own font up front means it never loads Helvetica.
    font: fonts.buffers["georgian-regular"] as unknown as string,
    lang: "ka",
    displayTitle: true,
    info: {
      Title: `${bilingual(labels.ka.title, labels.en.title)} — ${view.reference}`,
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
    drawHeader(ctx, view);
    if (view.preliminary) {
      drawPreliminary(ctx);
    }
    drawClientAndSeller(ctx, view);
    drawProvider(ctx, view);
    drawRoute(ctx, view);
    drawAmount(ctx, view);
    drawFooters(ctx, generatedAt);
    doc.end();
  } catch (error) {
    // Close the stream so the promise above cannot dangle, then surface the
    // real error rather than whatever a half-written document produces.
    doc.end();
    return done.then(() => Promise.reject(error));
  }

  return done;
}
