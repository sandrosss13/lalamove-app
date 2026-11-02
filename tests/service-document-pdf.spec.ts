/**
 * The order-details PDF, rendered without a server, a session or a database.
 *
 * `renderServiceDocumentPdf` (`src/lib/waybill/render-pdf.ts`) takes a
 * `ServiceDocumentView` and one locale's plain labels object, so this suite
 * builds the labels from the real JSON catalogs — the same strings the route
 * gets from `next-intl` — renders both languages and the conditional variants
 * (business + carrier company, individual + independent carrier, preliminary,
 * pending payment, no discount, a cargo list long enough to break the page),
 * and reads the text back out of the PDF with the small extractor below
 * (inflate the content streams, map glyph ids through each font's ToUnicode
 * CMap). It also checks the fonts are embedded — a Georgian document in a
 * standard font is a page of empty boxes.
 *
 * Set `SERVICE_DOCUMENT_PDF_DIR` to also write the rendered PDFs there for a
 * visual check.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { expect, test } from "@playwright/test";

import {
  computeDocumentFinance,
  type DocumentCargoRow,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";
import {
  PDF_DASH,
  financeLines,
  formatPdfDateTime,
  formatPdfDimensions,
  formatPdfMoney,
  formatPdfNumber,
  orDash,
  orderStatusTone,
  paymentStatusTone,
  renderServiceDocumentPdf,
  serviceDocumentPdfFilename,
  serviceDocumentPdfLabels,
  serviceFields,
  vatLines,
  type PdfLocale,
  type ServiceDocumentPdfLabels,
} from "@/lib/waybill/render-pdf";

/** A stand-in for a root `getTranslations({ locale })`: full key paths. */
function catalogTranslator(locale: PdfLocale) {
  const catalog: Record<string, unknown> = Object.fromEntries(
    ["orderDocument", "driverHub"].map((namespace) => [
      namespace,
      JSON.parse(
        readFileSync(
          join(process.cwd(), "src", "messages", locale, `${namespace}.json`),
          "utf8",
        ),
      ),
    ]),
  );

  return (key: string, values?: Record<string, string | number>): string => {
    let node: unknown = catalog;
    for (const part of key.split(".")) {
      node = (node as Record<string, unknown> | undefined)?.[part];
    }
    if (typeof node !== "string") {
      throw new Error(`missing ${key} in ${locale}`);
    }
    return node.replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values?.[name] ?? `{${name}}`),
    );
  };
}

const LABELS: Record<PdfLocale, ServiceDocumentPdfLabels> = {
  en: serviceDocumentPdfLabels(catalogTranslator("en")),
  ka: serviceDocumentPdfLabels(catalogTranslator("ka")),
};

const GENERATED_AT = new Date("2026-10-22T14:42:00Z");

const SAMPLE_CARGO: DocumentCargoRow[] = [
  {
    description: "Sofa, 3-seat",
    quantity: 1,
    unit: "PIECE",
    weightKg: 85,
    dimensionsCm: [220, 95, 90],
  },
  {
    description: "კარადა, დაშლილი",
    quantity: 4,
    unit: "PIECE",
    weightKg: 120,
    dimensionsCm: [200, 60, 15],
  },
  {
    description: "Euro pallets, boxed tiles",
    quantity: 2,
    unit: "PALLET",
    weightKg: 140,
    dimensionsCm: [120, 80, 100],
  },
];

/** Business customer, carrier company, delivered and paid, POOLING −10%. */
function businessView(
  overrides: Partial<ServiceDocumentView> = {},
): ServiceDocumentView {
  return {
    reference: "GE-104857",
    documentNumber: "INV-2026-0012489",
    createdAt: "2026-10-21T05:14:00Z",
    status: "COMPLETED",
    preliminary: false,
    customer: {
      type: "BUSINESS",
      name: "Kartuli Aveji LLC",
      idNumber: "405123987",
      phone: "+995 599 12 34 56",
      email: "orders@kartuliaveji.ge",
    },
    carrier: { kind: "COMPANY", name: "Gela Trans LLC", idOrVat: "404987321" },
    driver: {
      fullName: "Levan Gelashvili",
      personalId: "01019087654",
      phone: "+995 593 44 07 18",
    },
    vehicle: {
      category: "Box truck",
      make: "Mercedes-Benz",
      model: "Sprinter 516",
      plate: "ZM-482-TB",
      trailerPlate: null,
    },
    stops: {
      pickup: {
        address: "12 Aghmashenebeli Ave, Tbilisi 0102",
        contactName: "Giorgi Kapanadze",
        contactPhone: "+995 555 21 43 65",
      },
      delivery: {
        address: "ჭავჭავაძის გამზ. 45, ბინა 18, თბილისი 0179",
        contactName: "Ana Lomidze",
        contactPhone: "+995 568 30 11 72",
      },
    },
    scheduledPickupAt: "2026-10-22T06:00:00Z",
    estimatedDeliveryAt: "2026-10-22T09:30:00Z",
    distanceKm: 14.2,
    cargoCategory: "FURNITURE_FURNISHINGS",
    cargo: SAMPLE_CARGO,
    totalWeightKg: 345,
    services: {
      pickupHelpers: 2,
      deliveryHelpers: 2,
      pickupFloor: 3,
      deliveryFloor: 7,
      pickupElevator: false,
      deliveryElevator: true,
      loadingUnloading: true,
      handlingTags: [],
      extraMinutes: 30,
    },
    finance: computeDocumentFinance({
      price: 240,
      serviceLevelAdjustment: -18,
      overtimeFee: 15,
      helperOvertimeFee: 0,
      helperFee: 60,
      pickupHelperFee: 30,
      dropoffHelperFee: 30,
      transportFare: 180,
      tariffVersion: 1,
      paymentStatus: "PAID",
    }),
    ...overrides,
  };
}

/** Individual customer, independent carrier, preliminary, payment pending, no
 *  discount, and 40 cargo rows so the table breaks across pages. */
function individualView(): ServiceDocumentView {
  const cargo: DocumentCargoRow[] = Array.from({ length: 40 }, (_, i) => ({
    description:
      i % 2 === 0
        ? `გადასაზიდი ყუთი №${i + 1} — წიგნები და სამზარეულოს ნივთები`
        : `Moving box ${i + 1}, kitchenware and books`,
    quantity: (i % 5) + 1,
    unit: i % 7 === 0 ? "PALLET" : "PIECE",
    weightKg: 12.5 * ((i % 5) + 1),
    dimensionsCm: [60, 40, 40],
  }));
  return businessView({
    status: "ACCEPTED",
    preliminary: true,
    customer: {
      type: "INDIVIDUAL",
      name: "ნინო ბერიძე",
      idNumber: "01024056789",
      phone: "+995 577 98 76 54",
      email: "nino.beridze@gmail.com",
    },
    carrier: {
      kind: "DRIVER",
      name: "ლევან გელაშვილი",
      idOrVat: "01019087654",
    },
    driver: {
      fullName: "ლევან გელაშვილი",
      personalId: "01019087654",
      phone: "+995 593 44 07 18",
    },
    vehicle: {
      category: "Small van",
      make: "Ford",
      model: "Transit",
      plate: "AB-123-CD",
      trailerPlate: "TR-001-AA",
    },
    cargo,
    totalWeightKg: cargo.reduce((sum, row) => sum + (row.weightKg ?? 0), 0),
    services: {
      pickupHelpers: 1,
      deliveryHelpers: 0,
      pickupFloor: 0,
      deliveryFloor: 4,
      pickupElevator: true,
      deliveryElevator: false,
      loadingUnloading: true,
      handlingTags: ["FRAGILE", "UPRIGHT_ONLY"],
      extraMinutes: 0,
    },
    finance: computeDocumentFinance({
      price: 150,
      serviceLevelAdjustment: 0,
      overtimeFee: 0,
      helperOvertimeFee: 0,
      helperFee: 25,
      pickupHelperFee: 25,
      dropoffHelperFee: 0,
      transportFare: 125,
      tariffVersion: 1,
      paymentStatus: null,
    }),
  });
}

// ---------------------------------------------------------------------------
// A minimal text extractor for pdfkit output.
// ---------------------------------------------------------------------------

type PdfObject = { dict: string; stream: Buffer | null };

function pdfObjects(pdf: Buffer): Map<number, PdfObject> {
  const raw = pdf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const re = /(\d+) 0 obj\s*([\s\S]*?)endobj/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const body = m[2]!;
    const at = body.indexOf("stream");
    if (at === -1) {
      objects.set(Number(m[1]), { dict: body, stream: null });
      continue;
    }
    const start = body.indexOf("\n", at) + 1;
    const end = body.lastIndexOf("endstream");
    let data = Buffer.from(
      body.slice(start, end).replace(/\r?\n$/, ""),
      "latin1",
    );
    if (/\/FlateDecode/.test(body.slice(0, at))) {
      data = inflateSync(data);
    }
    objects.set(Number(m[1]), { dict: body.slice(0, at), stream: data });
  }
  return objects;
}

function parseCmap(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  const hexToText = (hex: string) =>
    String.fromCodePoint(
      ...(hex.replace(/\s+/g, "").match(/.{4}/g) ?? []).map((h) =>
        parseInt(h, 16),
      ),
    );
  for (const block of cmap.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const [, src, dst] of block.matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F\s]+)>/g,
    )) {
      map.set(parseInt(src!, 16), hexToText(dst!));
    }
  }
  for (const block of cmap.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    // pdfkit writes a ligature's target as `<0066 0069>` — spaces inside.
    const re =
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F\s]+>)/g;
    for (const [, lo, hi, dst] of block.matchAll(re)) {
      const from = parseInt(lo!, 16);
      const to = parseInt(hi!, 16);
      if (dst!.startsWith("[")) {
        (dst!.match(/<([0-9a-fA-F\s]*)>/g) ?? []).forEach((h, i) => {
          map.set(from + i, hexToText(h.slice(1, -1)));
        });
      } else {
        const base = parseInt(dst!.slice(1, -1), 16);
        for (let code = from; code <= to; code++) {
          map.set(code, String.fromCodePoint(base + code - from));
        }
      }
    }
  }
  return map;
}

/** Per page, the text of every `TJ`/`Tj`, concatenated in drawing order. */
function pdfPageTexts(pdf: Buffer): string[] {
  const objects = pdfObjects(pdf);
  const raw = pdf.toString("latin1");
  const cmaps = new Map<string, Map<number, string>>();
  for (const [, name, ref] of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const font = objects.get(Number(ref));
    const toUnicode = font?.dict.match(/\/ToUnicode (\d+) 0 R/);
    const stream = toUnicode && objects.get(Number(toUnicode[1]))?.stream;
    if (stream) {
      cmaps.set(name!, parseCmap(stream.toString("latin1")));
    }
  }

  const pages: string[] = [];
  for (const object of objects.values()) {
    if (!/\/Type \/Page\b/.test(object.dict)) {
      continue;
    }
    const refs = object.dict.match(/\/Contents (\d+) 0 R/);
    const content = refs && objects.get(Number(refs[1]))?.stream;
    if (!content) {
      continue;
    }
    let text = "";
    let cmap: Map<number, string> | undefined;
    const ops =
      /\/(F\d+) [\d.]+ Tf|\[((?:<[0-9a-fA-F]*>|[-\d.\s])*)\] TJ|<([0-9a-fA-F]*)> Tj/g;
    for (const op of content.toString("latin1").matchAll(ops)) {
      if (op[1]) {
        cmap = cmaps.get(op[1]);
        continue;
      }
      const hexes = op[2]
        ? (op[2].match(/<([0-9a-fA-F]*)>/g) ?? []).map((h) => h.slice(1, -1))
        : [op[3]!];
      for (const hex of hexes) {
        for (const code of hex.match(/.{4}/g) ?? []) {
          text += cmap?.get(parseInt(code, 16)) ?? "�";
        }
      }
    }
    pages.push(text);
  }
  return pages;
}

/** `"200.85 ₾"` → 200.85. */
function money(text: string): number {
  return Number(text.replace("\u2212", "-").replace(/[^\d.-]/g, ""));
}

/** The VAT split `computeDocumentFinance` would store for a total. */
function vatOf(total: number) {
  const { vat } = computeDocumentFinance({
    price: total,
    serviceLevelAdjustment: 0,
    overtimeFee: 0,
    helperOvertimeFee: 0,
    helperFee: 0,
    pickupHelperFee: 0,
    dropoffHelperFee: 0,
    transportFare: total,
    tariffVersion: 1,
    paymentStatus: "PAID",
  });
  return { vat };
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function maybeWrite(name: string, pdf: Buffer): void {
  const dir = process.env.SERVICE_DOCUMENT_PDF_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), pdf);
  }
}

async function render(
  view: ServiceDocumentView,
  locale: PdfLocale,
  name: string,
): Promise<{ pdf: Buffer; pages: string[]; text: string }> {
  const pdf = await renderServiceDocumentPdf(view, LABELS[locale], {
    locale,
    generatedAt: GENERATED_AT,
  });
  maybeWrite(name, pdf);
  const pages = pdfPageTexts(pdf);
  return {
    pdf,
    pages: pages.map(squash),
    text: squash(pages.join("")),
  };
}

/**
 * Whitespace removed: the extractor cannot tell a wrapped line from a space
 * (both are just a new text position), so text and needles are compared
 * without either.
 */
function squash(value: string): string {
  return value.replace(/\s+/g, "");
}

function expectText(haystack: string, needle: string): void {
  expect(haystack, needle).toContain(squash(needle));
}

function expectNoText(haystack: string, needle: string): void {
  expect(haystack, needle).not.toContain(squash(needle));
}

// ---------------------------------------------------------------------------
// Pure formatting.
// ---------------------------------------------------------------------------

test.describe("order-details PDF formatting", () => {
  test("dates print as DD.MM.YYYY, HH:mm on the Tbilisi clock", () => {
    // 21:30 UTC is 01:30 the next day in Tbilisi (UTC+4).
    expect(formatPdfDateTime("2026-10-11T21:30:00Z")).toBe("12.10.2026, 01:30");
    expect(formatPdfDateTime(new Date("2026-10-22T14:42:00Z"))).toBe(
      "22.10.2026, 18:42",
    );
    expect(formatPdfDateTime(null)).toBe(PDF_DASH);
    expect(formatPdfDateTime("not a date")).toBe(PDF_DASH);
  });

  test("money has two decimals, the lari sign and a true minus", () => {
    expect(formatPdfMoney(180)).toBe("180.00 ₾");
    expect(formatPdfMoney(1234.5)).toBe("1234.50 ₾");
    expect(formatPdfMoney(-27.5)).toBe("−27.50 ₾");
    expect(formatPdfMoney(-0)).toBe("0.00 ₾");
    expect(formatPdfMoney(-0.001)).toBe("0.00 ₾");
  });

  test("numbers, dimensions and dashes", () => {
    expect(formatPdfNumber(14.2)).toBe("14.2");
    expect(formatPdfNumber(85)).toBe("85");
    expect(formatPdfNumber(1200)).toBe("1200");
    expect(formatPdfDimensions([220, 95, 90])).toBe("220 × 95 × 90");
    expect(formatPdfDimensions(null)).toBe(PDF_DASH);
    expect(orDash(null)).toBe(PDF_DASH);
    expect(orDash("  ")).toBe(PDF_DASH);
    expect(orDash(" ZM-482-TB ")).toBe("ZM-482-TB");
  });

  test("filename is ZOMO_{reference}_{lang}.pdf and header-safe", () => {
    expect(serviceDocumentPdfFilename("GE-104857", "ka")).toBe(
      "ZOMO_GE-104857_ka.pdf",
    );
    expect(serviceDocumentPdfFilename('GE"1\n', "en")).toBe(
      "ZOMO_GE_1__en.pdf",
    );
    expect(serviceDocumentPdfFilename("", "en")).toBe("ZOMO_order_en.pdf");
  });

  test("status tones: delivered/paid green, pending amber, the rest neutral", () => {
    expect(orderStatusTone("COMPLETED")).toBe("success");
    for (const status of [
      "PENDING",
      "CLAIMED",
      "ACCEPTED",
      "IN_TRANSIT",
    ] as const) {
      expect(orderStatusTone(status)).toBe("neutral");
    }
    expect(paymentStatusTone("PAID")).toBe("success");
    expect(paymentStatusTone("PENDING")).toBe("pending");
    expect(paymentStatusTone("FAILED")).toBe("neutral");
    expect(paymentStatusTone("REFUNDED")).toBe("neutral");
  });

  test("finance lines: transport, services, POOLING discount", () => {
    const view = businessView();
    const lines = financeLines(view, LABELS.en);
    expect(lines.map((l) => l.kind)).toEqual([
      "transport",
      "services",
      "discount",
    ]);
    expect(lines[0]).toEqual({
      kind: "transport",
      label: "Transportation price",
      note: "Box truck · 14.2 km",
      amount: "180.00 ₾",
    });
    expect(lines[1]!.amount).toBe("75.00 ₾");
    expect(lines[1]!.note).toBe("Helpers 60.00 ₾ · Extra time 15.00 ₾");
    expect(lines[2]!.amount).toBe("−18.00 ₾");
    expect(lines[2]!.note).toBe("Pooling · 10%");
    expect(formatPdfMoney(view.finance.total)).toBe("237.00 ₾");
  });

  test("VAT breakdown: amount excl. VAT + VAT add up to the total", () => {
    const view = businessView();
    expect(vatLines(view.finance, LABELS.en)).toEqual([
      { kind: "net", label: "Amount excl. VAT", amount: "200.85 ₾" },
      { kind: "vat", label: "VAT 18%", amount: "36.15 ₾" },
    ]);
    expect(vatLines(view.finance, LABELS.ka).map((l) => l.label)).toEqual([
      "თანხა დღგ-ს გარეშე",
      "დღგ 18%",
    ]);
    // Reconciles to the tetri for awkward totals too.
    for (const total of [0.01, 1.01, 99.99, 150, 237, 1234.57, 9999.99]) {
      const finance = { ...view.finance, total, ...vatOf(total) };
      const [net, vat] = vatLines(finance, LABELS.en);
      expect(money(net!.amount) + money(vat!.amount)).toBeCloseTo(total, 6);
    }
  });

  test("no discount → no discount line", () => {
    const lines = financeLines(individualView(), LABELS.ka);
    expect(lines.map((l) => l.kind)).toEqual(["transport", "services"]);
    expect(lines[1]!.note).toBe("მტვირთავები 25.00 ₾");
  });

  test("service cells: pickup / delivery pairs, Yes/No, handling tags", () => {
    const en = serviceFields(individualView().services, LABELS.en);
    expect(en.map((f) => f.value)).toEqual([
      "1 / 0",
      "0 / 4",
      "Yes / No",
      "Yes",
      "Fragile, Upright only",
      "0 min",
    ]);
    const ka = serviceFields(businessView().services, LABELS.ka);
    expect(ka[2]!.value).toBe("არა / დიახ");
    expect(ka[4]!.value).toBe("არ არის საჭირო");
    expect(ka[5]!.value).toBe("30 წთ");
  });
});

// ---------------------------------------------------------------------------
// Rendering.
// ---------------------------------------------------------------------------

test.describe("order-details PDF rendering", () => {
  test("business customer + carrier company, English", async () => {
    const { pdf, pages, text } = await render(
      businessView(),
      "en",
      "business-company-en.pdf",
    );
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+IBMPlexSans/);
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+IBMPlexMono/);
    // "₾" is not in Plex: it must come from Noto Sans Georgian.
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+NotoSansGeorgian/);
    expect(raw).not.toContain("/Helvetica");
    expect(raw).toContain("/Lang (en)");
    expect(pages).toHaveLength(2);

    for (const needle of [
      "Order Details / Invoice",
      "GE-104857",
      "INV-2026-0012489",
      "Issued 22.10.2026, 18:42",
      "01Order information",
      "07Financial details",
      "Delivered",
      "Business",
      "Company identification number",
      "Company ID / VAT number",
      "Gela Trans LLC",
      "Mercedes-Benz Sprinter 516",
      "Contact: Giorgi Kapanadze · +995 555 21 43 65",
      "22.10.2026, 10:00",
      "14.2 km",
      "220 × 95 × 90",
      "pallets",
      "345 kg",
      "Helpers · pickup / delivery (max. 4)",
      "No / Yes",
      "Pooling · 10%",
      "−18.00 ₾",
      "237.00 ₾",
      "Amount excl. VAT 200.85 ₾",
      "VAT 18% 36.15 ₾",
      "Paid",
    ]) {
      expectText(text, needle);
    }
    expectNoText(text, "Individual carrier");
    expectNoText(text, "Preliminary");
    // The running footer, on every page, with the page count.
    pages.forEach((page, index) => {
      expectText(page, "ZOMO · GE-104857");
      expectText(
        page,
        `Generated automatically from order data · 22.10.2026, 18:42 · Page ${index + 1} of 2`,
      );
    });
  });

  test("business customer + carrier company, Georgian", async () => {
    const { pdf, pages, text } = await render(
      businessView(),
      "ka",
      "business-company-ka.pdf",
    );
    expect(pdf.toString("latin1")).toContain("/Lang (ka)");
    expect(pages).toHaveLength(2);
    for (const needle of [
      "შეკვეთის დეტალები / ინვოისი",
      "დოკუმენტის №",
      "მიწოდებულია",
      "იურიდიული პირი",
      "საიდენტიფიკაციო კოდი / დღგ-ს ნომერი",
      "საკონტაქტო პირი: Ana Lomidze",
      "14.2 კმ",
      "345 კგ",
      "გაერთიანებული · 10%",
      "თანხა დღგ-ს გარეშე 200.85 ₾",
      "დღგ 18% 36.15 ₾",
      "გადახდილია",
      "დოკუმენტი ავტომატურად შეიქმნა შეკვეთის მონაცემებით",
    ]) {
      expectText(text, needle);
    }
    expectNoText(text, "Order information");
  });

  test("individual + independent carrier, preliminary, pending, long cargo list", async () => {
    for (const locale of ["en", "ka"] as const) {
      const { pages, text } = await render(
        individualView(),
        locale,
        `individual-driver-${locale}.pdf`,
      );
      const L = LABELS[locale];
      expect(pages.length).toBeGreaterThanOrEqual(3);
      expectText(text, L.preliminary);
      expectText(text, L.carrierIndividual);
      expectText(text, L.carrierPersonalId);
      expectText(text, L.customerName);
      expectText(text, L.trailerPlate);
      expectText(text, L.orderStatuses.ACCEPTED);
      expectText(text, L.paymentStatuses.PENDING);
      expectText(
        text,
        `${L.handlingTags.FRAGILE}, ${L.handlingTags.UPRIGHT_ONLY}`,
      );
      expectNoText(text, L.discount);
      // The table header repeats on every page the table continues onto.
      const tablePages = pages.filter(
        (page) => page.includes("kitchenware") || page.includes("სამზარეულოს"),
      );
      expect(tablePages.length).toBeGreaterThanOrEqual(2);
      for (const page of tablePages) {
        expectText(page, L.goods);
      }
      for (const page of pages) {
        expectText(page, "ZOMO · GE-104857");
      }
      // Section 07 is kept whole: VAT lines, total and payment status share a
      // page; 127.12 + 22.88 = 150.00.
      const financePage = pages.find((page) => page.includes(squash(L.total)))!;
      expectText(financePage, L.paymentStatus);
      expectText(financePage, `${L.amountExclVat} 127.12 ₾`);
      expectText(financePage, `${L.vat(18)} 22.88 ₾`);
      expectText(financePage, `${L.total} 150.00 ₾`);
    }
  });

  test("missing values print a dash and do not throw", async () => {
    const view = businessView({
      preliminary: true,
      status: "PENDING",
      customer: {
        type: "INDIVIDUAL",
        name: null,
        idNumber: null,
        phone: null,
        email: null,
      },
      carrier: null,
      driver: { fullName: null, personalId: null, phone: null },
      vehicle: {
        category: null,
        make: null,
        model: null,
        plate: null,
        trailerPlate: null,
      },
      stops: {
        pickup: { address: "Tbilisi", contactName: null, contactPhone: null },
        delivery: { address: "Batumi", contactName: null, contactPhone: null },
      },
      scheduledPickupAt: null,
      estimatedDeliveryAt: null,
      cargo: [],
      totalWeightKg: null,
    });
    const { pages, text } = await render(view, "en", "missing-values-en.pdf");
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expectText(text, `Contact: ${PDF_DASH}`);
    expect(count(text, squash(PDF_DASH))).toBeGreaterThanOrEqual(15);
  });

  test("characters neither Plex nor Noto Georgian has fall back to Noto Sans", async () => {
    // Plex covers Latin, Cyrillic and Greek; the "ǅ" digraph it does not.
    const { pdf, text } = await render(
      businessView({
        driver: { fullName: "ǅemal Нино", personalId: null, phone: null },
      }),
      "en",
      "cyrillic-en.pdf",
    );
    expect(pdf.toString("latin1")).toMatch(
      /\/BaseFont\s*\/[A-Z]{6}\+NotoSans-(Regular|Bold)/,
    );
    expectText(text, "ǅemal Нино");
  });
});
