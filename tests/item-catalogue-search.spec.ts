/**
 * `searchCatalogue`, `shapeCatalogueEntry`, `parseCatalogueLocale` and
 * `toLoadLine` — the pure parts of the item catalogue API and client module.
 * No browser or database: the route is a thin `findMany` around these.
 */
import { expect, test } from "@playwright/test";

import {
  parseCatalogueLocale,
  searchCatalogue,
  shapeCatalogueEntry,
  toLoadLine,
  type CatalogueItem,
  type CatalogueRow,
} from "@/lib/item-catalogue";
import { planLoad } from "@/lib/orders/load-plan";

function item(
  code: string,
  label: string,
  synonyms: string[] = [],
): CatalogueItem {
  return {
    code,
    group: "LIVING_ROOM",
    label,
    synonyms,
    weightKg: 40,
    lengthM: 2,
    widthM: 0.9,
    heightM: 0.8,
    stackable: false,
    needsTwoPeople: true,
    requiredBody: null,
    handlingTags: ["FRAGILE"],
    cargoCategory: "FURNITURE_FURNISHINGS",
  };
}

const codes = (items: CatalogueItem[]) => items.map((i) => i.code);

test.describe("searchCatalogue", () => {
  const items = [
    item("ARMCHAIR", "Armchair", ["seat"]),
    item("CHAIR", "Dining chair"),
    item("CHAIR_FIRST", "Chair, folding"),
    item("CAFE", "Café table", ["bistro"]),
    item("SOFA", "Sofa", ["couch", "დივანი"]),
  ];

  test("empty query returns everything in order", () => {
    expect(codes(searchCatalogue(items, "  "))).toEqual(codes(items));
  });

  test("is case- and diacritic-insensitive", () => {
    expect(codes(searchCatalogue(items, "CAFE"))).toEqual(["CAFE"]);
    expect(codes(searchCatalogue(items, "café"))).toEqual(["CAFE"]);
  });

  test("prefix ranks above word-start above substring", () => {
    expect(codes(searchCatalogue(items, "chair"))).toEqual([
      "CHAIR_FIRST",
      "CHAIR",
      "ARMCHAIR",
    ]);
  });

  test("matches synonyms, including the other locale's", () => {
    expect(codes(searchCatalogue(items, "couch"))).toEqual(["SOFA"]);
    expect(codes(searchCatalogue(items, "დივ"))).toEqual(["SOFA"]);
  });

  test("a label match outranks a synonym match of the same quality", () => {
    const list = [item("A", "Lamp", ["table"]), item("B", "Table")];
    expect(codes(searchCatalogue(list, "table"))).toEqual(["B", "A"]);
  });

  test("no match is empty and input is not mutated", () => {
    const copy = [...items];
    expect(searchCatalogue(items, "zzz")).toEqual([]);
    expect(items).toEqual(copy);
  });
});

test.describe("shaping", () => {
  const row: CatalogueRow = {
    ...item("SOFA", "ignored"),
    labelEn: "Sofa",
    labelKa: "დივანი",
    synonymsEn: ["couch", "settee"],
    synonymsKa: ["სავარძელი", "couch"],
  };

  test("label is the request locale's only; synonyms are both, deduplicated", () => {
    const en = shapeCatalogueEntry(row, "en");
    expect(en.label).toBe("Sofa");
    expect(en.synonyms).toEqual(["couch", "settee", "სავარძელი"]);
    const ka = shapeCatalogueEntry(row, "ka");
    expect(ka.label).toBe("დივანი");
    expect(ka.synonyms).toEqual(["სავარძელი", "couch", "settee"]);
    expect(en).not.toHaveProperty("labelEn");
    expect(en).not.toHaveProperty("synonymsKa");
  });

  test("locale parsing defaults to en", () => {
    expect(parseCatalogueLocale("ka")).toBe("ka");
    expect(parseCatalogueLocale("en")).toBe("en");
    expect(parseCatalogueLocale("fr")).toBe("en");
    expect(parseCatalogueLocale(null)).toBe("en");
  });
});

test("toLoadLine maps per-unit figures and feeds planLoad", () => {
  const line = toLoadLine(item("SOFA", "Sofa"), 2);
  expect(line).toMatchObject({
    quantity: 2,
    unitWeightKg: 40,
    lengthM: 2,
    stackable: false,
    needsTwoPeople: true,
    cargoCategory: "FURNITURE_FURNISHINGS",
  });
  const plan = planLoad([line]);
  expect(plan?.totalWeightKg).toBe(80);
  expect(plan?.suggestedCrew).toBe(2);
});
