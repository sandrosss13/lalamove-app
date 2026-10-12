/**
 * The order-details PDF, rendered without a server, a session or a database.
 *
 * `renderServiceDocumentPdf` (`src/lib/waybill/render-pdf.ts`) takes a
 * `ServiceDocumentView` and a plain labels object, so this suite builds the
 * labels from the real JSON catalogs — the same strings the route gets from
 * `next-intl` — and checks what can be checked without a text extractor: that
 * the output is a PDF, that the Noto fonts are embedded (a Georgian document in
 * a standard font is a page of empty boxes), that both provider kinds render,
 * and that missing values never throw.
 *
 * Set `SERVICE_DOCUMENT_PDF_DIR` to also write the rendered PDFs there for a
 * visual check.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  computeServiceAmounts,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";
import {
  PDF_BLANK,
  formatPdfDate,
  formatPdfMoney,
  orBlank,
  providerIdIsPersonalId,
  renderServiceDocumentPdf,
  serviceAmountRows,
  serviceDocumentPdfLocaleLabels,
  type ServiceDocumentPdfLabels,
} from "@/lib/waybill/render-pdf";

/** A stand-in for a root `getTranslations({ locale })`: full key paths. */
function catalogTranslator(locale: "ka" | "en") {
  const catalog: Record<string, unknown> = Object.fromEntries(
    ["orderDocument", "common"].map((namespace) => [
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

const LABELS: ServiceDocumentPdfLabels = {
  ka: serviceDocumentPdfLocaleLabels(catalogTranslator("ka")),
  en: serviceDocumentPdfLocaleLabels(catalogTranslator("en")),
};

const GENERATED_AT = new Date("2026-10-12T09:30:00Z");

function companyView(
  overrides: Partial<ServiceDocumentView> = {},
): ServiceDocumentView {
  return {
    reference: "GE-48240",
    documentDate: "2026-10-11T21:30:00Z",
    preliminary: false,
    client: {
      name: "Tegeta",
      taxId: "204999999",
      address: "თბილისი, აკაკი ბელიაშვილის 133",
    },
    seller: {
      name: "შპს ზომო / Zomo LLC",
      taxId: "405000000",
      address: "Tbilisi, Georgia",
    },
    provider: {
      kind: "COMPANY",
      name: "Diplomat Georgia LLC",
      taxId: "204123456",
      address: "Tbilisi, 5 Tsereteli Avenue",
    },
    driver: {
      firstName: "Nino",
      lastName: "Beridze",
      personalId: "01001012345",
    },
    vehicle: {
      make: "Hino",
      model: "916",
      plate: "PS-FLT-001",
      trailerPlate: "TR-123-AB",
    },
    route: {
      pickupAddress: "Tbilisi, 14 Kakheti Highway",
      dropoffAddress: "ბათუმი, ჭავჭავაძის 50",
    },
    cargo: { category: "RETAIL_STOCK", description: "Tyres, 40 boxes" },
    amounts: computeServiceAmounts(245.5),
    ...overrides,
  };
}

function independentDriverView(): ServiceDocumentView {
  return companyView({
    preliminary: true,
    provider: {
      kind: "DRIVER",
      name: "Giorgi Maisuradze",
      taxId: "01024054321",
      address: null,
    },
    driver: {
      firstName: "Giorgi",
      lastName: "Maisuradze",
      personalId: "01024054321",
    },
    vehicle: {
      make: "Ford",
      model: "Transit",
      plate: "AB-123-CD",
      trailerPlate: null,
    },
  });
}

function pageCount(pdf: Buffer): number {
  return pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

function maybeWrite(name: string, pdf: Buffer): void {
  const dir = process.env.SERVICE_DOCUMENT_PDF_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), pdf);
  }
}

test.describe("order-details PDF formatting", () => {
  test("dates print as DD/MM/YYYY on the Tbilisi calendar", () => {
    // 21:30 UTC is 01:30 the next day in Tbilisi (UTC+4).
    expect(formatPdfDate("2026-10-11T21:30:00Z")).toBe("12/10/2026");
    expect(formatPdfDate(null)).toBe(PDF_BLANK);
    expect(formatPdfDate("not a date")).toBe(PDF_BLANK);
  });

  test("money has two decimals and GEL; blanks fill missing values", () => {
    expect(formatPdfMoney(1234.5)).toBe("1,234.50 GEL");
    expect(orBlank(null)).toBe(PDF_BLANK);
    expect(orBlank("  ")).toBe(PDF_BLANK);
    expect(orBlank(" PS-FLT-001 ")).toBe("PS-FLT-001");
  });

  test("amount rows: net, VAT 18%, VAT-inclusive grand total", () => {
    const rows = serviceAmountRows(companyView(), LABELS);
    expect(rows.map((r) => r.kind)).toEqual(["net", "vat", "grandTotal"]);
    expect(rows[0]!.amount).toBe("208.05 GEL");
    expect(rows[1]!.label).toBe("დღგ (18%) / VAT (18%)");
    expect(rows[1]!.amount).toBe("37.45 GEL");
    expect(rows[2]!.amount).toBe("245.50 GEL");
  });

  test("an independent driver is identified by their personal ID", () => {
    expect(providerIdIsPersonalId(independentDriverView())).toBe(true);
    expect(providerIdIsPersonalId(companyView())).toBe(false);
  });
});

test.describe("order-details PDF rendering", () => {
  test("renders a one-page PDF with the Noto fonts embedded (company provider)", async () => {
    const pdf = await renderServiceDocumentPdf(companyView(), LABELS, {
      generatedAt: GENERATED_AT,
    });
    maybeWrite("company.pdf", pdf);
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+NotoSansGeorgian-Regular/);
    expect(raw).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+NotoSansGeorgian-Bold/);
    expect(raw).toContain("/FontFile2");
    expect(raw).not.toContain("/Helvetica");
    expect(pageCount(pdf)).toBe(1);
  });

  test("renders an independent driver provider with the preliminary banner", async () => {
    const pdf = await renderServiceDocumentPdf(
      independentDriverView(),
      LABELS,
      {
        generatedAt: GENERATED_AT,
      },
    );
    maybeWrite("independent-driver.pdf", pdf);
    expect(pdf.toString("latin1", 0, 5)).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  });

  test("missing provider, driver, vehicle and party values do not throw", async () => {
    const pdf = await renderServiceDocumentPdf(
      companyView({
        preliminary: true,
        client: { name: "Tegeta", taxId: null, address: null },
        seller: { name: null, taxId: null, address: null },
        provider: null,
        driver: { firstName: null, lastName: null, personalId: null },
        vehicle: { make: null, model: null, plate: null, trailerPlate: null },
        cargo: { category: "APPLIANCES", description: null },
      }),
      LABELS,
      { generatedAt: GENERATED_AT },
    );
    maybeWrite("missing-values.pdf", pdf);
    expect(pdf.toString("latin1", 0, 5)).toBe("%PDF-");
  });

  test("non-Georgian scripts fall back to Noto Sans", async () => {
    const pdf = await renderServiceDocumentPdf(
      companyView({
        driver: {
          firstName: "Нино",
          lastName: null,
          personalId: "01001012345",
        },
      }),
      LABELS,
      { generatedAt: GENERATED_AT },
    );
    expect(pdf.toString("latin1")).toMatch(
      /\/BaseFont\s*\/[A-Z]{6}\+NotoSans-(Regular|Bold)/,
    );
  });
});
