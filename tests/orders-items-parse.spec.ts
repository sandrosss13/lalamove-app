/**
 * The items half of `POST /api/orders`: `parseOrderItems`, `resolveOrderItems`,
 * `decideItemsBooking` and `describeLoad` from `src/lib/orders/parse-items.ts`.
 *
 * **Why this runs with no browser and no database**, as
 * `tests/load-plan.spec.ts` does: the route file imports `auth`, Prisma and
 * `next/headers`, so its items logic was lifted into a module that takes the
 * catalogue rows, the account type and the translator as arguments. Every
 * refusal the route can give on the items path, short of the hard-fit and
 * serviceability checks it already had, is asserted here with object literals.
 *
 * The translator is a stand-in that returns the key and its values, so an
 * assertion names the message key the route's existing copy uses rather than
 * its English wording.
 */

import { expect, test } from "@playwright/test";

import type { Translator } from "@/i18n/translator";
import { PALLET_CONTENTS, planLoad } from "@/lib/orders/load-plan";
import {
  CUSTOM_LABEL_MAX_LENGTH,
  decideItemsBooking,
  describeLoad,
  itemsError,
  MAX_ITEM_LINES,
  parseOrderItems,
  resolveOrderItems,
  type CatalogueEntryForOrder,
  type OrderItemRequest,
} from "@/lib/orders/parse-items";

const t: Translator = (key, values) =>
  values === undefined ? key : `${key} ${JSON.stringify(values)}`;

/** An items-path refusal as the stand-in translator renders it. */
const err = (
  key: Parameters<typeof itemsError>[1],
  values?: Record<string, string | number>,
) => itemsError(t, key, values);

const sofa: CatalogueEntryForOrder = {
  id: "cat_sofa",
  code: "SOFA_3_SEAT",
  labelEn: "Sofa, 3-seat",
  labelKa: "დივანი, 3-ადგილიანი",
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

const chilledCrate: CatalogueEntryForOrder = {
  id: "cat_chilled",
  code: "CHILLED_CRATE",
  labelEn: "Chilled crate",
  labelKa: "მაცივრის ყუთი",
  weightKg: 20,
  lengthM: 0.6,
  widthM: 0.4,
  heightM: 0.4,
  stackable: true,
  needsTwoPeople: false,
  requiredBody: "REFRIGERATED",
  handlingTags: ["COLD_CHAIN"],
  cargoCategory: "RETAIL_STOCK",
};

const rebar: CatalogueEntryForOrder = {
  id: "cat_rebar",
  code: "REBAR_BUNDLE",
  labelEn: "Rebar bundle",
  labelKa: "არმატურის შეკვრა",
  weightKg: 500,
  lengthM: 6,
  widthM: 0.3,
  heightM: 0.3,
  stackable: false,
  needsTwoPeople: false,
  requiredBody: "OPEN_CHASSIS",
  handlingTags: [],
  cargoCategory: "CONSTRUCTION_MATERIALS",
};

const catalogue = [sofa, chilledCrate, rebar];

function parseOk(value: unknown): OrderItemRequest[] {
  const parsed = parseOrderItems(value, t);
  if ("error" in parsed) {
    throw new Error(`expected a parse, got: ${parsed.error}`);
  }
  return parsed.value;
}

function parseError(value: unknown): string {
  const parsed = parseOrderItems(value, t);
  if (!("error" in parsed)) {
    throw new Error("expected a parse error");
  }
  return parsed.error;
}

function resolveOk(items: OrderItemRequest[]) {
  const resolved = resolveOrderItems(items, catalogue, "en", t);
  if ("error" in resolved) {
    throw new Error(`expected a resolve, got: ${resolved.error}`);
  }
  return resolved.value;
}

function decide(
  rawItems: unknown,
  accountType: "INDIVIDUAL" | "BUSINESS" | null,
  requestedBody: "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS" | null,
) {
  const resolved = resolveOk(parseOk(rawItems));
  const plan = planLoad(resolved.map(({ load }) => load));
  if (plan === null) {
    throw new Error("expected a plan");
  }
  return decideItemsBooking({
    resolved,
    plan,
    accountType,
    requestedBody,
    t,
  });
}

const eurPallets = (
  quantity: number,
  weightKg = 400,
  contents = "GENERAL",
) => ({
  kind: "PALLET",
  palletType: "EUR",
  contents,
  quantity,
  heightM: 1.2,
  weightKg,
});

test.describe("parseOrderItems", () => {
  test("refuses a missing, non-list or empty list", () => {
    expect(parseError(null)).toBe(err("itemsMustBeList"));
    expect(parseError({ kind: "CATALOGUE" })).toBe(err("itemsMustBeList"));
    expect(parseError([])).toBe(err("itemsEmpty"));
  });

  test("refuses more than the line limit", () => {
    const line = { kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 1 };
    expect(parseOk(Array(MAX_ITEM_LINES).fill(line))).toHaveLength(
      MAX_ITEM_LINES,
    );
    expect(parseError(Array(MAX_ITEM_LINES + 1).fill(line))).toBe(
      err("itemsTooMany"),
    );
  });

  test("refuses an unknown kind and a non-object line, naming the field", () => {
    expect(parseError([{ kind: "CRATE", quantity: 1 }])).toBe(
      err("unknownKind", { field: "items[0].kind" }),
    );
    expect(
      parseError([{ kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 1 }, 7]),
    ).toBe(err("lineMustBeObject", { field: "items[1]" }));
  });

  test("bounds item quantities to whole numbers from 1 to 99", () => {
    for (const quantity of [0, 100, 1.5, "2", -1]) {
      expect(
        parseError([{ kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity }]),
      ).toBe(
        err("quantityOutOfRange", { field: "items[0].quantity", max: 99 }),
      );
    }
    expect(
      parseOk([{ kind: "CATALOGUE", code: " SOFA_3_SEAT ", quantity: 99 }]),
    ).toEqual([{ kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 99 }]);
  });

  test("bounds pallet counts to 1–33 and requires type and contents", () => {
    expect(parseOk([eurPallets(33)])).toHaveLength(1);
    expect(parseError([eurPallets(34)])).toBe(
      err("quantityOutOfRange", { field: "items[0].quantity", max: 33 }),
    );
    expect(parseError([{ ...eurPallets(4), palletType: "US" }])).toBe(
      err("palletTypeInvalid", {
        field: "items[0].palletType",
        allowed: "EUR, INDUSTRIAL",
      }),
    );
    expect(parseError([{ ...eurPallets(4), contents: undefined }])).toBe(
      err("palletContentsInvalid", {
        field: "items[0].contents",
        allowed: Object.keys(PALLET_CONTENTS).join(", "),
      }),
    );
  });

  test("checks custom and pallet figures against CARGO_MEASUREMENT_BOUNDS", () => {
    const custom = {
      kind: "CUSTOM",
      label: "Piano",
      quantity: 1,
      weightKg: 250,
      lengthM: 1.6,
      widthM: 0.7,
      heightM: 1.3,
    };
    expect(parseOk([custom])).toHaveLength(1);
    expect(parseError([{ ...custom, weightKg: 24_001 }])).toBe(
      `errors.orders.fieldMeasurementOutOfRange ${JSON.stringify({
        field: "items[0].weightKg",
        max: 24_000,
        unit: "kg",
      })}`,
    );
    expect(parseError([{ ...custom, heightM: 0 }])).toContain(
      '"field":"items[0].heightM"',
    );
    // 2.6 × 1.0 is a 2.6 m long item, not a 2.6 m wide one…
    expect(parseOk([{ ...custom, lengthM: 1.0, widthM: 2.6 }])).toHaveLength(1);
    // …but 2.6 × 2.6 is wider than any hold.
    expect(parseError([{ ...custom, lengthM: 2.6, widthM: 2.6 }])).toContain(
      '"field":"items[0].widthM"',
    );
    expect(parseError([{ ...eurPallets(4), heightM: 4.5 }])).toContain(
      '"field":"items[0].heightM"',
    );
  });

  test("trims custom labels and bounds them to 1–80 characters", () => {
    const custom = {
      kind: "CUSTOM",
      quantity: 1,
      weightKg: 10,
      lengthM: 0.5,
      widthM: 0.4,
      heightM: 0.4,
    };
    expect(parseOk([{ ...custom, label: "  Lamp  " }])[0]).toMatchObject({
      label: "Lamp",
    });
    expect(parseError([{ ...custom, label: "   " }])).toBe(
      err("labelRequired", { field: "items[0].label" }),
    );
    expect(
      parseError([
        { ...custom, label: "x".repeat(CUSTOM_LABEL_MAX_LENGTH + 1) },
      ]),
    ).toContain("errors.orders.fieldTooLong");
  });

  test("refuses pallets and items in one list", () => {
    expect(
      parseError([
        eurPallets(4),
        { kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 1 },
      ]),
    ).toBe(err("mixedModes"));
  });
});

test.describe("resolveOrderItems", () => {
  test("refuses a code that is not in the active catalogue", () => {
    const resolved = resolveOrderItems(
      [{ kind: "CATALOGUE", code: "RETIRED_ITEM", quantity: 1 }],
      catalogue,
      "en",
      t,
    );
    expect(resolved).toEqual({ error: err("catalogueUnavailable") });
  });

  test("snapshots the catalogue label in the request locale", () => {
    const items = parseOk([
      { kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 2 },
    ]);
    const ka = resolveOrderItems(items, catalogue, "ka", t);
    expect("value" in ka && ka.value[0]?.snapshot).toEqual({
      kind: "CATALOGUE",
      catalogEntryId: "cat_sofa",
      label: "დივანი, 3-ადგილიანი",
      quantity: 2,
      unitWeightKg: 60,
      lengthM: 2.1,
      widthM: 0.9,
      heightM: 0.85,
      stackable: false,
      palletType: null,
    });
  });

  test("snapshots custom and pallet lines from the normalised load line", () => {
    const [custom] = resolveOk(
      parseOk([
        {
          kind: "CUSTOM",
          label: "Mirror",
          quantity: 1,
          weightKg: 15,
          lengthM: 0.1,
          widthM: 1.5,
          heightM: 1.2,
        },
      ]),
    );
    expect(custom?.snapshot).toMatchObject({
      kind: "CUSTOM",
      catalogEntryId: null,
      lengthM: 1.5,
      widthM: 0.1,
    });

    const [pallet] = resolveOk(parseOk([eurPallets(4)]));
    expect(pallet?.snapshot).toMatchObject({
      kind: "PALLET",
      label: "EUR pallet",
      lengthM: 1.2,
      widthM: 0.8,
      stackable: false,
      palletType: "EUR",
    });
  });
});

test.describe("decideItemsBooking", () => {
  const sofaLine = { kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 1 };
  const chilledLine = { kind: "CATALOGUE", code: "CHILLED_CRATE", quantity: 4 };
  const rebarLine = { kind: "CATALOGUE", code: "REBAR_BUNDLE", quantity: 1 };

  test("refuses pallets from an individual, or from a client with no profile", () => {
    expect(decide([eurPallets(4)], "INDIVIDUAL", "DRY_BOX")).toEqual({
      error: err("palletsBusinessOnly"),
    });
    expect(decide([eurPallets(4)], null, null)).toEqual({
      error: err("palletsBusinessOnly"),
    });
    expect(decide([eurPallets(4)], "BUSINESS", "DRY_BOX")).toEqual({
      value: "DRY_BOX",
    });
  });

  test("refuses chilled goods and open-chassis items together", () => {
    expect(decide([chilledLine, rebarLine], "INDIVIDUAL", null)).toEqual({
      error: err("bodyConflict"),
    });
  });

  test("ignores an individual's body and uses the derived one", () => {
    expect(decide([sofaLine], "INDIVIDUAL", "OPEN_CHASSIS")).toEqual({
      value: "DRY_BOX",
    });
    expect(decide([sofaLine, chilledLine], "INDIVIDUAL", "DRY_BOX")).toEqual({
      value: "REFRIGERATED",
    });
  });

  test("requires a business to choose a body, matching any forced one", () => {
    expect(decide([sofaLine], "BUSINESS", null)).toEqual({
      error: err("bodyRequired"),
    });
    expect(decide([sofaLine], "BUSINESS", "OPEN_CHASSIS")).toEqual({
      value: "OPEN_CHASSIS",
    });
    expect(decide([chilledLine], "BUSINESS", "DRY_BOX")).toEqual({
      error: err("bodyMismatch", {
        body: t("errors.orders.orderItems.bodyPhrase.refrigerated"),
      }),
    });
    expect(
      decide([eurPallets(2, 400, "CHILLED")], "BUSINESS", "REFRIGERATED"),
    ).toEqual({ value: "REFRIGERATED" });
  });

  test("refuses a load heavier than any vehicle can carry", () => {
    // 33 heavy pallets: 26,400 kg against a 24,000 kg platform maximum.
    expect(decide([eurPallets(33, 800)], "BUSINESS", "DRY_BOX")).toEqual({
      error: err("overMaximum"),
    });
  });
});

test.describe("describeLoad", () => {
  const typed = { packagingDescription: "Wrapped", itemQuantity: "96 cartons" };

  test("items mode writes the summary to itemQuantity only", () => {
    const resolved = resolveOk(
      parseOk([{ kind: "CATALOGUE", code: "SOFA_3_SEAT", quantity: 1 }]),
    );
    expect(describeLoad(resolved, typed, 200)).toEqual({
      packagingDescription: "Wrapped",
      itemQuantity: "1 × Sofa, 3-seat",
    });
  });

  test("pallets mode writes the summary to packagingDescription only", () => {
    const resolved = resolveOk(
      parseOk([eurPallets(4), { ...eurPallets(2), palletType: "INDUSTRIAL" }]),
    );
    expect(describeLoad(resolved, typed, 200)).toEqual({
      packagingDescription: "4 × EUR pallet, 2 × Industrial pallet",
      itemQuantity: "96 cartons",
    });
  });
});
