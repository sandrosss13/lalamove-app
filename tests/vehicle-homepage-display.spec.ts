/**
 * Homepage vehicle display — which types the public marketing surfaces show,
 * in what order, and how the admin reorder endpoint validates and plans a
 * reorder.
 *
 * Pure functions over plain objects, like `tests/class-substitution.spec.ts`:
 * `src/lib/vehicle-homepage-display.ts` has no Prisma or `server-only` import,
 * so no browser, database or server is involved.
 */

import { expect, test } from "@playwright/test";

import {
  MAX_VEHICLE_REORDER_IDS,
  orderForHomepage,
  planVehicleReorder,
} from "@/lib/vehicle-homepage-display";

type Row = {
  code: string;
  label: string;
  category: "MEDIUM_DUTY" | "HEAVY_DUTY";
  showOnHomepage?: boolean;
  homepageSortOrder?: number;
};

const codes = (rows: Row[]) => rows.map((row) => row.code);

test.describe("orderForHomepage", () => {
  test("drops hidden types and keeps visible ones", () => {
    const rows: Row[] = [
      {
        code: "MPV",
        label: "MPV",
        category: "MEDIUM_DUTY",
        showOnHomepage: false,
      },
      {
        code: "VAN",
        label: "Van",
        category: "MEDIUM_DUTY",
        showOnHomepage: true,
      },
    ];

    expect(codes(orderForHomepage(rows))).toEqual(["VAN"]);
  });

  test("orders by category, then homepageSortOrder, then label", () => {
    const rows: Row[] = [
      {
        code: "H_B",
        label: "Box",
        category: "HEAVY_DUTY",
        homepageSortOrder: 1,
      },
      {
        code: "M_Z",
        label: "Zeta",
        category: "MEDIUM_DUTY",
        homepageSortOrder: 0,
      },
      {
        code: "H_A",
        label: "Alpha",
        category: "HEAVY_DUTY",
        homepageSortOrder: 0,
      },
      {
        code: "M_B",
        label: "Beta",
        category: "MEDIUM_DUTY",
        homepageSortOrder: 1,
      },
      {
        code: "M_A",
        label: "Alpha",
        category: "MEDIUM_DUTY",
        homepageSortOrder: 1,
      },
    ];

    expect(codes(orderForHomepage(rows))).toEqual([
      "M_Z",
      "M_A",
      "M_B",
      "H_A",
      "H_B",
    ]);
  });

  test("a response without the display fields keeps the old category-then-label order", () => {
    const rows: Row[] = [
      { code: "TRUCK", label: "Truck", category: "HEAVY_DUTY" },
      { code: "VAN", label: "Van", category: "MEDIUM_DUTY" },
      { code: "MPV", label: "MPV", category: "MEDIUM_DUTY" },
    ];

    expect(codes(orderForHomepage(rows))).toEqual(["MPV", "VAN", "TRUCK"]);
  });

  test("does not mutate its input", () => {
    const rows: Row[] = [
      { code: "B", label: "B", category: "MEDIUM_DUTY", homepageSortOrder: 1 },
      { code: "A", label: "A", category: "MEDIUM_DUTY", homepageSortOrder: 0 },
    ];

    orderForHomepage(rows);

    expect(codes(rows)).toEqual(["B", "A"]);
  });
});

test.describe("planVehicleReorder", () => {
  const rows = [
    { id: "a", homepageSortOrder: 0 },
    { id: "b", homepageSortOrder: 1 },
    { id: "c", homepageSortOrder: 2 },
  ];

  test("rejects ids that are not a non-empty list of distinct strings", () => {
    for (const ids of [
      undefined,
      "a",
      [],
      ["a", "a"],
      ["a", ""],
      ["a", 3],
      Array.from({ length: MAX_VEHICLE_REORDER_IDS + 1 }, (_, i) => `x${i}`),
    ]) {
      expect(planVehicleReorder(rows, ids)).toEqual({
        ok: false,
        reason: "invalid_ids",
      });
    }
  });

  test("rejects an id that is not a row of the category", () => {
    expect(planVehicleReorder(rows, ["a", "z"])).toEqual({
      ok: false,
      reason: "foreign_ids",
    });
  });

  test("writes only the rows whose position changes", () => {
    expect(planVehicleReorder(rows, ["b", "a", "c"])).toEqual({
      ok: true,
      order: ["b", "a", "c"],
      moves: [
        { id: "b", from: 1, to: 0 },
        { id: "a", from: 0, to: 1 },
      ],
    });
  });

  test("appends unlisted rows in their current order", () => {
    expect(planVehicleReorder(rows, ["c"])).toEqual({
      ok: true,
      order: ["c", "a", "b"],
      moves: [
        { id: "c", from: 2, to: 0 },
        { id: "a", from: 0, to: 1 },
        { id: "b", from: 1, to: 2 },
      ],
    });
  });

  test("densifies tied positions even when the order is unchanged", () => {
    const tied = [
      { id: "a", homepageSortOrder: 0 },
      { id: "b", homepageSortOrder: 0 },
    ];

    expect(planVehicleReorder(tied, ["a", "b"])).toEqual({
      ok: true,
      order: ["a", "b"],
      moves: [{ id: "b", from: 0, to: 1 }],
    });
  });

  test("an unchanged dense order needs no writes", () => {
    expect(planVehicleReorder(rows, ["a", "b", "c"])).toMatchObject({
      ok: true,
      moves: [],
    });
  });
});
