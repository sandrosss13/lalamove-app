/**
 * Trailer-plate validation: optional, trimmed, 2-15 chars of [A-Za-z0-9- ],
 * stored upper-case. Pure function, no server.
 */

import { expect, test } from "@playwright/test";

import { parseTrailerPlate } from "@/lib/vehicles/trailer-plate";

test.describe("parseTrailerPlate", () => {
  test("absent and blank values mean no trailer", () => {
    for (const raw of [undefined, null, "", "   "]) {
      expect(parseTrailerPlate(raw)).toEqual({ value: null });
    }
  });

  test("trims and upper-cases", () => {
    expect(parseTrailerPlate("  ab-123 cd ")).toEqual({ value: "AB-123 CD" });
  });

  test("accepts the length bounds", () => {
    expect(parseTrailerPlate("A1")).toEqual({ value: "A1" });
    expect(parseTrailerPlate("A".repeat(15))).toEqual({ value: "A".repeat(15) });
  });

  test("rejects out-of-range lengths", () => {
    expect(parseTrailerPlate("A")).toEqual({ error: true });
    expect(parseTrailerPlate("A".repeat(16))).toEqual({ error: true });
  });

  test("rejects other characters and non-strings", () => {
    for (const raw of ["AB_123", "AB.123", "ÄB-123", "AB/123", 123, {}, []]) {
      expect(parseTrailerPlate(raw)).toEqual({ error: true });
    }
  });
});
