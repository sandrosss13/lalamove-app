/**
 * The admin item-catalogue editor's rules: what a create or an edit may carry,
 * how the synonym box is read, and how up/down renumbers a group.
 *
 * `src/app/api/admin/content/item-catalogue/validation.ts` is run by the API
 * routes (the real boundary) and by the edit dialog (for faster feedback), so
 * every rule asserted here holds on both sides.
 *
 * **Why this runs with no browser and no database**, as `tests/load-plan.spec.ts`
 * does: the module has no `server-only`, no Prisma runtime and no translator.
 * Errors are asserted by message key, which is also what the routes translate.
 */

import { expect, test } from "@playwright/test";

import {
  formatSynonymInput,
  isValidItemCode,
  nextSortOrder,
  parseCreateItemBody,
  parseMoveBody,
  parseSynonymInput,
  parseUpdateItemBody,
  planCatalogueMove,
  type OrderableEntry,
} from "@/app/api/admin/content/item-catalogue/validation";

const K = "admin.itemCatalogueValidation";

/** A valid create body, copied from the seeded `SOFA_2_SEAT` row. */
function sofa(overrides: Record<string, unknown> = {}) {
  return {
    code: "SOFA_2_SEAT",
    group: "LIVING_ROOM",
    labelEn: "Sofa, 2-seat",
    labelKa: "დივანი, ორადგილიანი",
    synonymsEn: ["couch", "settee", "loveseat"],
    synonymsKa: ["დივანი", "ტახტი"],
    weightKg: 45,
    lengthM: 1.6,
    widthM: 0.9,
    heightM: 0.85,
    stackable: false,
    needsTwoPeople: true,
    requiredBody: null,
    handlingTags: [],
    cargoCategory: "FURNITURE_FURNISHINGS",
    sortOrder: 10,
    active: true,
    ...overrides,
  };
}

function errorKey(result: { error: { key: string } } | { data: unknown }) {
  return "error" in result ? result.error.key : null;
}

test.describe("parseCreateItemBody", () => {
  test("accepts a seeded row unchanged", () => {
    const result = parseCreateItemBody(sofa());
    expect(result).toEqual({ data: sofa() });
  });

  test("trims labels and treats a blank sort order as end of group", () => {
    const result = parseCreateItemBody(
      sofa({ labelEn: "  Sofa  ", sortOrder: null }),
    );
    expect("data" in result && result.data.labelEn).toBe("Sofa");
    expect("data" in result && result.data.sortOrder).toBeNull();

    const absent = parseCreateItemBody(sofa({ sortOrder: undefined }));
    expect("data" in absent && absent.data.sortOrder).toBeNull();
  });

  test("requires an UPPER_SNAKE code", () => {
    expect(errorKey(parseCreateItemBody(sofa({ code: "" })))).toBe(
      `${K}.codeRequired`,
    );
    for (const code of [
      "sofa",
      "Sofa_2",
      "2_SOFA",
      "SOFA__2",
      "SOFA_",
      "SOFA-2",
    ]) {
      expect(errorKey(parseCreateItemBody(sofa({ code })))).toBe(
        `${K}.codeFormat`,
      );
    }
    expect(isValidItemCode("TV_UP_TO_55")).toBe(true);
    expect(isValidItemCode("A".repeat(65))).toBe(false);
  });

  test("holds every figure inside CARGO_MEASUREMENT_BOUNDS", () => {
    const cases: [string, number][] = [
      ["weightKg", 0.5],
      ["weightKg", 24_001],
      ["lengthM", 0.09],
      ["lengthM", 13.7],
      ["widthM", 0.05],
      ["widthM", 2.6],
      ["heightM", 0],
      ["heightM", 4.1],
      ["heightM", Number.NaN],
    ];

    for (const [field, value] of cases) {
      const result = parseCreateItemBody(sofa({ [field]: value }));
      expect(errorKey(result), `${field} = ${value}`).toBe(
        `${K}.figureOutOfBounds`,
      );
    }

    // The minimum itself is allowed: 0.1 m, as the seeded rows use.
    expect(
      "data" in parseCreateItemBody(sofa({ heightM: 0.1, widthM: 0.1 })),
    ).toBe(true);
  });

  test("refuses length below width", () => {
    expect(
      errorKey(parseCreateItemBody(sofa({ lengthM: 0.8, widthM: 0.9 }))),
    ).toBe(`${K}.lengthBelowWidth`);
    // Equal is fine: a square item.
    expect(
      "data" in parseCreateItemBody(sofa({ lengthM: 0.9, widthM: 0.9 })),
    ).toBe(true);
  });

  test("checks enums, tags and booleans", () => {
    expect(errorKey(parseCreateItemBody(sofa({ group: "GARAGE" })))).toBe(
      `${K}.fieldMustBeOneOf`,
    );
    expect(
      errorKey(parseCreateItemBody(sofa({ requiredBody: "FLATBED" }))),
    ).toBe(`${K}.fieldMustBeOneOf`);
    expect(
      errorKey(parseCreateItemBody(sofa({ handlingTags: ["SQUISHY"] }))),
    ).toBe(`${K}.handlingTagsMustBeList`);
    expect(errorKey(parseCreateItemBody(sofa({ stackable: "yes" })))).toBe(
      `${K}.fieldMustBeBoolean`,
    );

    const tagged = parseCreateItemBody(
      sofa({
        requiredBody: "REFRIGERATED",
        handlingTags: ["UPRIGHT_ONLY", "FRAGILE", "FRAGILE"],
      }),
    );
    expect("data" in tagged && tagged.data.handlingTags).toEqual([
      "FRAGILE",
      "UPRIGHT_ONLY",
    ]);
    expect("data" in tagged && tagged.data.requiredBody).toBe("REFRIGERATED");
  });

  test("refuses a non-object body", () => {
    for (const body of [null, "x", 1, []]) {
      expect(errorKey(parseCreateItemBody(body))).toBe(`${K}.bodyMustBeObject`);
    }
  });
});

test.describe("parseUpdateItemBody", () => {
  const existing = { code: "SOFA_2_SEAT", lengthM: 1.6, widthM: 0.9 };

  test("is partial: an active toggle carries only `active`", () => {
    expect(parseUpdateItemBody({ active: false }, existing)).toEqual({
      data: { active: false },
    });
  });

  test("refuses an empty patch", () => {
    expect(errorKey(parseUpdateItemBody({}, existing))).toBe(
      `${K}.nothingToUpdate`,
    );
  });

  test("never changes the code, but tolerates it unchanged", () => {
    expect(
      errorKey(parseUpdateItemBody({ code: "SOFA", active: true }, existing)),
    ).toBe(`${K}.codeCannotChange`);
    expect(
      "data" in
        parseUpdateItemBody({ code: "SOFA_2_SEAT", active: true }, existing),
    ).toBe(true);
  });

  test("checks length ≥ width against the figures the row ends up with", () => {
    // Only width sent, but it overtakes the stored length.
    expect(errorKey(parseUpdateItemBody({ widthM: 1.7 }, existing))).toBe(
      `${K}.lengthBelowWidth`,
    );
    expect("data" in parseUpdateItemBody({ widthM: 1.6 }, existing)).toBe(true);
  });

  test("applies the create rules field by field", () => {
    expect(errorKey(parseUpdateItemBody({ weightKg: -1 }, existing))).toBe(
      `${K}.figureOutOfBounds`,
    );
    expect(errorKey(parseUpdateItemBody({ sortOrder: 1.5 }, existing))).toBe(
      `${K}.sortOrderRange`,
    );
    expect(errorKey(parseUpdateItemBody({ labelKa: "  " }, existing))).toBe(
      `${K}.labelRequired`,
    );
  });
});

test.describe("synonyms", () => {
  test("reads the comma-separated box", () => {
    expect(parseSynonymInput(" couch,settee , ,Couch, loveseat,")).toEqual([
      "couch",
      "settee",
      "loveseat",
    ]);
    expect(parseSynonymInput("")).toEqual([]);
    expect(formatSynonymInput(["couch", "settee"])).toBe("couch, settee");
  });

  test("caps the list and each term", () => {
    const many = Array.from({ length: 31 }, (_, i) => `term${i}`);
    expect(errorKey(parseCreateItemBody(sofa({ synonymsEn: many })))).toBe(
      `${K}.tooManySynonyms`,
    );
    expect(
      errorKey(parseCreateItemBody(sofa({ synonymsKa: ["x".repeat(61)] }))),
    ).toBe(`${K}.synonymTooLong`);
    expect(errorKey(parseCreateItemBody(sofa({ synonymsEn: "couch" })))).toBe(
      `${K}.synonymsMustBeList`,
    );
  });
});

test.describe("reordering", () => {
  const group: OrderableEntry[] = [
    { code: "C", sortOrder: 30, active: true },
    { code: "A", sortOrder: 10, active: true },
    { code: "B", sortOrder: 20, active: false },
    { code: "D", sortOrder: 40, active: true },
  ];

  /** The group's codes in order after applying a plan. */
  function apply(plan: ReturnType<typeof planCatalogueMove>): string {
    const next = new Map(group.map((e) => [e.code, e.sortOrder]));
    for (const change of plan ?? []) next.set(change.code, change.to);
    return [...next]
      .sort((a, b) => a[1] - b[1])
      .map(([code]) => code)
      .join("");
  }

  test("moves one step among every entry", () => {
    expect(apply(planCatalogueMove(group, "C", "up", "all"))).toBe("ACBD");
    expect(apply(planCatalogueMove(group, "A", "down", "all"))).toBe("BACD");
  });

  test("steps past hidden inactive entries", () => {
    expect(apply(planCatalogueMove(group, "C", "up", "active"))).toBe("CABD");
    expect(apply(planCatalogueMove(group, "A", "down", "active"))).toBe("BCAD");
  });

  test("does nothing at either end or for an unknown code", () => {
    expect(planCatalogueMove(group, "A", "up", "all")).toBeNull();
    expect(planCatalogueMove(group, "D", "down", "active")).toBeNull();
    expect(planCatalogueMove(group, "Z", "up", "all")).toBeNull();
  });

  test("renumbers in steps of 10, resolving ties, and returns only changes", () => {
    const tied: OrderableEntry[] = [
      { code: "X", sortOrder: 0, active: true },
      { code: "Y", sortOrder: 0, active: true },
      { code: "Z", sortOrder: 30, active: true },
    ];
    expect(planCatalogueMove(tied, "Z", "up", "all")).toEqual([
      { code: "X", from: 0, to: 10 },
      { code: "Z", from: 30, to: 20 },
      { code: "Y", from: 0, to: 30 },
    ]);
  });

  test("puts a new entry after the group's last", () => {
    expect(nextSortOrder([])).toBe(10);
    expect(nextSortOrder([10, 20, 120])).toBe(130);
    expect(nextSortOrder([15])).toBe(20);
  });

  test("parses the move body", () => {
    expect(parseMoveBody({ direction: "up" })).toEqual({
      data: { direction: "up", scope: "all" },
    });
    expect(errorKey(parseMoveBody({ direction: "left" }))).toBe(
      `${K}.fieldMustBeOneOf`,
    );
    expect(errorKey(parseMoveBody({ direction: "up", scope: "x" }))).toBe(
      `${K}.fieldMustBeOneOf`,
    );
  });
});
