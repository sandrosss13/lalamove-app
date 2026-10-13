/**
 * The item list picker's pure state: `src/components/home/item-list-lines.ts`.
 *
 * The part that matters most is the last group: `toItemsPayload` is checked
 * against the server's own `parseOrderItems`, so the body the picker sends and
 * the shape `POST /api/orders` accepts cannot drift apart without this failing.
 * Like `tests/orders-items-parse.spec.ts`, no browser and no database: the
 * translator is a stand-in that echoes the key.
 */

import { expect, test } from "@playwright/test";

import {
  activeLines,
  addCatalogueItem,
  addCustomItem,
  addPalletLine,
  canAddLine,
  effectiveMode,
  inferPalletContents,
  linesFromOrderItems,
  nextLineId,
  removeLine,
  setLineQuantity,
  toItemsPayload,
  toLoadLines,
  updatePalletLine,
  type PickerLine,
  type StoredOrderItem,
} from "@/components/home/item-list-lines";
import type { Translator } from "@/i18n/translator";
import type { CatalogueItem } from "@/lib/item-catalogue";
import {
  CUSTOM_SIZE_PRESETS,
  customLine,
  MAX_LINE_QUANTITY,
  MAX_PALLET_COUNT,
  PALLET_CONTENTS,
  PALLET_WEIGHT_PRESETS,
  palletLine,
  planLoad,
} from "@/lib/orders/load-plan";
import {
  MAX_ITEM_LINES,
  parseOrderItems,
  resolveOrderItems,
  type CatalogueEntryForOrder,
} from "@/lib/orders/parse-items";

const t: Translator = (key, values) =>
  values === undefined ? key : `${key} ${JSON.stringify(values)}`;

const sofa: CatalogueItem = {
  code: "SOFA_3_SEAT",
  group: "LIVING_ROOM",
  label: "Sofa, 3-seat",
  synonyms: ["couch"],
  weightKg: 60,
  lengthM: 2.1,
  widthM: 0.9,
  heightM: 0.85,
  stackable: false,
  needsTwoPeople: true,
  requiredBody: null,
  handlingTags: [],
  cargoCategory: "FURNITURE_FURNISHINGS",
};

const box: CatalogueItem = {
  ...sofa,
  code: "BOX_MEDIUM",
  group: "BOXES_PARCELS",
  label: "Box, medium",
  synonyms: [],
  weightKg: 12,
  lengthM: 0.5,
  widthM: 0.4,
  heightM: 0.4,
  stackable: true,
  needsTwoPeople: false,
};

const catalogue = [sofa, box];

/** The same two entries as the route's `findMany` would return them. */
const catalogueRows: CatalogueEntryForOrder[] = catalogue.map((item) => ({
  id: `cat_${item.code}`,
  code: item.code,
  labelEn: item.label,
  labelKa: item.label,
  weightKg: item.weightKg,
  lengthM: item.lengthM,
  widthM: item.widthM,
  heightM: item.heightM,
  stackable: item.stackable,
  needsTwoPeople: item.needsTwoPeople,
  requiredBody: item.requiredBody,
  handlingTags: item.handlingTags,
  cargoCategory: item.cargoCategory,
}));

/** A list with every kind in it: two item lines and a pallet line. */
function mixedList(): PickerLine[] {
  let lines: PickerLine[] = [];
  lines = addCatalogueItem(lines, "SOFA_3_SEAT");
  lines = addCustomItem(lines, {
    label: "  Rowing machine ",
    quantity: 2,
    preset: "L",
  });
  lines = addPalletLine(lines);
  return lines;
}

test.describe("editing", () => {
  test("picking the same catalogue item twice increments one line", () => {
    let lines = addCatalogueItem([], "SOFA_3_SEAT");
    lines = addCatalogueItem(lines, "BOX_MEDIUM");
    lines = addCatalogueItem(lines, "SOFA_3_SEAT");
    expect(lines).toEqual([
      { id: "line-1", kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 2 },
      { id: "line-2", kind: "CATALOGUE", code: "BOX_MEDIUM", quantity: 1 },
    ]);
  });

  test("quantities clamp to each kind's range", () => {
    let lines = mixedList();
    const [item, custom, pallet] = lines;
    lines = setLineQuantity(lines, item!.id, 500);
    lines = setLineQuantity(lines, custom!.id, 0);
    lines = setLineQuantity(lines, pallet!.id, 40);
    expect(lines.map((line) => line.quantity)).toEqual([
      MAX_LINE_QUANTITY,
      1,
      MAX_PALLET_COUNT,
    ]);
    // Incrementing past the cap stays at the cap.
    for (let i = 0; i < 3; i += 1)
      lines = addCatalogueItem(lines, "SOFA_3_SEAT");
    expect(lines[0]!.quantity).toBe(MAX_LINE_QUANTITY);
  });

  test("ids stay unique across removals and remounts", () => {
    let lines = mixedList();
    lines = removeLine(lines, "line-2");
    expect(nextLineId(lines)).toBe("line-4");
    lines = addCatalogueItem(lines, "BOX_MEDIUM");
    expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
  });

  test("custom items are trimmed, never merged, and carry the preset's figures", () => {
    let lines = addCustomItem([], {
      label: " Lamp ",
      quantity: 1,
      preset: "S",
    });
    lines = addCustomItem(lines, { label: "Lamp", quantity: 1, preset: "S" });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      kind: "CUSTOM",
      label: "Lamp",
      preset: "S",
      ...CUSTOM_SIZE_PRESETS.S,
    });
  });

  test("a pallet weight preset sets its figure; an exact weight clears the preset", () => {
    let lines = addPalletLine([]);
    const id = lines[0]!.id;
    lines = updatePalletLine(lines, id, {
      weightPreset: "HEAVY",
      contents: "CHILLED",
    });
    expect(lines[0]).toMatchObject({
      weightPreset: "HEAVY",
      weightKg: PALLET_WEIGHT_PRESETS.HEAVY,
      contents: "CHILLED",
    });
    lines = updatePalletLine(lines, id, { weightPreset: null, weightKg: 615 });
    expect(lines[0]).toMatchObject({ weightPreset: null, weightKg: 615 });
  });

  test("no new line past the route's cap, but topping one up still works", () => {
    let lines: PickerLine[] = [];
    for (let i = 0; i < MAX_ITEM_LINES; i += 1) {
      lines = addCustomItem(lines, {
        label: `Item ${i}`,
        quantity: 1,
        preset: "M",
      });
    }
    expect(canAddLine(lines, "items")).toBe(false);
    expect(addCatalogueItem(lines, "SOFA_3_SEAT")).toHaveLength(MAX_ITEM_LINES);
    // Pallets are counted separately: the other mode's lines are never sent.
    expect(canAddLine(lines, "pallets")).toBe(true);
  });
});

test.describe("modes", () => {
  test("pallets apply only to business accounts", () => {
    expect(effectiveMode("pallets", "BUSINESS")).toBe("pallets");
    expect(effectiveMode("pallets", "INDIVIDUAL")).toBe("items");
    expect(effectiveMode("pallets", null)).toBe("items");
  });

  test("each mode sees only its own lines; the others are kept", () => {
    const lines = mixedList();
    expect(activeLines(lines, "items").map((line) => line.kind)).toEqual([
      "CATALOGUE",
      "CUSTOM",
    ]);
    expect(activeLines(lines, "pallets").map((line) => line.kind)).toEqual([
      "PALLET",
    ]);
    expect(lines).toHaveLength(3);
  });
});

test.describe("payload against the route's parser", () => {
  test("items mode round-trips through parseOrderItems unchanged", () => {
    const payload = toItemsPayload(mixedList(), "items");
    expect(payload).toEqual([
      { kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 1 },
      {
        kind: "CUSTOM",
        label: "Rowing machine",
        quantity: 2,
        weightKg: CUSTOM_SIZE_PRESETS.L.weightKg,
        lengthM: CUSTOM_SIZE_PRESETS.L.lengthM,
        widthM: CUSTOM_SIZE_PRESETS.L.widthM,
        heightM: CUSTOM_SIZE_PRESETS.L.heightM,
      },
    ]);
    // Through JSON, as the request body travels.
    expect(parseOrderItems(JSON.parse(JSON.stringify(payload)), t)).toEqual({
      value: payload,
    });
  });

  test("every pallet contents and weight choice is accepted", () => {
    let lines: PickerLine[] = [];
    for (const contents of Object.keys(
      PALLET_CONTENTS,
    ) as (keyof typeof PALLET_CONTENTS)[]) {
      lines = addPalletLine(lines);
      lines = updatePalletLine(lines, lines.at(-1)!.id, {
        contents,
        palletType: "INDUSTRIAL",
        heightM: 1.6,
      });
    }
    lines = updatePalletLine(lines, "line-1", {
      weightPreset: null,
      weightKg: 615.5,
    });
    const payload = toItemsPayload(lines, "pallets");
    expect(payload).toHaveLength(4);
    expect(
      payload.every((line) => line.kind === "PALLET" && "contents" in line),
    ).toBe(true);
    expect(parseOrderItems(JSON.parse(JSON.stringify(payload)), t)).toEqual({
      value: payload,
    });
  });

  test("a mixed list never sends mixed modes", () => {
    const lines = mixedList();
    for (const mode of ["items", "pallets"] as const) {
      const parsed = parseOrderItems(toItemsPayload(lines, mode), t);
      expect("value" in parsed).toBe(true);
    }
  });

  test("exact custom figures go through as typed", () => {
    const lines = addCustomItem([], {
      label: "Rowing machine",
      quantity: 1,
      exact: { lengthM: 0.6, widthM: 2.4, heightM: 0.5, weightKg: 35 },
    });
    const payload = toItemsPayload(lines, "items");
    expect(parseOrderItems(payload, t)).toEqual({ value: payload });
  });
});

test.describe("plan", () => {
  test("the picker plans exactly what the route resolves", () => {
    for (const mode of ["items", "pallets"] as const) {
      const lines = mixedList();
      const parsed = parseOrderItems(toItemsPayload(lines, mode), t);
      if (!("value" in parsed)) throw new Error(parsed.error);
      const resolved = resolveOrderItems(parsed.value, catalogueRows, "en", t);
      if (!("value" in resolved)) throw new Error(resolved.error);

      expect(toLoadLines(lines, mode, catalogue)).toEqual(
        resolved.value.map(({ load }) => load),
      );
    }
  });

  test("custom and pallet lines are built by load-plan's own builders", () => {
    const lines = mixedList();
    const [, custom, pallet] = lines;
    expect(toLoadLines([custom!], "items", catalogue)).toEqual([
      customLine({ quantity: 2, exact: CUSTOM_SIZE_PRESETS.L }),
    ]);
    expect(toLoadLines([pallet!], "pallets", catalogue)).toEqual([
      palletLine("EUR", "GENERAL", 1, 1.2, PALLET_WEIGHT_PRESETS.MEDIUM),
    ]);
  });

  test("a catalogue line missing from the catalogue is left out of the plan", () => {
    const lines = addCatalogueItem(
      addCatalogueItem([], "RETIRED"),
      "BOX_MEDIUM",
    );
    expect(toLoadLines(lines, "items", catalogue)).toHaveLength(1);
    expect(toLoadLines(lines, "items", [])).toEqual([]);
    expect(planLoad(toLoadLines(lines, "items", []))).toBeNull();
  });
});

/**
 * Edit mode: an unpaid order re-opens on the item lines it was booked with.
 * The rows are `OrderItem` snapshots, so what comes back must be a list the
 * route would accept again.
 */
test.describe("re-opening a booked order", () => {
  const stored = (overrides: Partial<StoredOrderItem>): StoredOrderItem => ({
    kind: "CATALOGUE",
    catalogueCode: "SOFA_3_SEAT",
    label: "Sofa, 3-seat",
    quantity: 2,
    unitWeightKg: 60,
    lengthM: 2.1,
    widthM: 0.9,
    heightM: 0.85,
    palletType: null,
    ...overrides,
  });

  test("an active catalogue line comes back by code", () => {
    const { lines, mode } = linesFromOrderItems([stored({})], "GENERAL");
    expect(mode).toBe("items");
    expect(lines).toEqual([
      { id: "line-1", kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 2 },
    ]);
  });

  test("a catalogue line no longer bookable comes back as a custom line with its snapshot", () => {
    const { lines } = linesFromOrderItems(
      [stored({ catalogueCode: null })],
      "GENERAL",
    );
    expect(lines).toEqual([
      {
        id: "line-1",
        kind: "CUSTOM",
        label: "Sofa, 3-seat",
        quantity: 2,
        preset: null,
        lengthM: 2.1,
        widthM: 0.9,
        heightM: 0.85,
        weightKg: 60,
      },
    ]);
  });

  test("pallet lines come back in pallets mode, with the preset re-selected", () => {
    const { lines, mode } = linesFromOrderItems(
      [
        stored({
          kind: "PALLET",
          catalogueCode: null,
          label: "EUR pallet",
          quantity: 4,
          unitWeightKg: PALLET_WEIGHT_PRESETS.HEAVY,
          lengthM: 1.2,
          widthM: 0.8,
          heightM: 1.5,
          palletType: "EUR",
        }),
        stored({
          kind: "PALLET",
          catalogueCode: null,
          quantity: 1,
          unitWeightKg: 333,
          palletType: "SOMETHING_NEW",
        }),
      ],
      "BUILDING",
    );
    expect(mode).toBe("pallets");
    expect(lines[0]).toMatchObject({
      kind: "PALLET",
      palletType: "EUR",
      contents: "BUILDING",
      quantity: 4,
      heightM: 1.5,
      weightPreset: "HEAVY",
      weightKg: PALLET_WEIGHT_PRESETS.HEAVY,
    });
    // An unknown pallet type falls back to EUR; an exact weight keeps no preset.
    expect(lines[1]).toMatchObject({
      palletType: "EUR",
      weightPreset: null,
      weightKg: 333,
    });
  });

  test("the re-opened list round-trips through the route's parser", () => {
    const { lines, mode } = linesFromOrderItems(
      [stored({}), stored({ catalogueCode: null, label: "Old lamp" })],
      "GENERAL",
    );
    const parsed = parseOrderItems(toItemsPayload(lines, mode), t);
    expect("error" in parsed).toBe(false);
  });

  test("pallet contents are inferred from the order's body and category", () => {
    expect(inferPalletContents("RETAIL_STOCK", "REFRIGERATED")).toBe("CHILLED");
    expect(inferPalletContents("CONSTRUCTION_MATERIALS", "DRY_BOX")).toBe(
      "BUILDING",
    );
    expect(inferPalletContents("INDUSTRIAL_SUPPLIES", "OPEN_CHASSIS")).toBe(
      "INDUSTRIAL",
    );
    expect(inferPalletContents("RETAIL_STOCK", null)).toBe("GENERAL");
    expect(inferPalletContents("FURNITURE_FURNISHINGS", "DRY_BOX")).toBe(
      "GENERAL",
    );
  });
});
