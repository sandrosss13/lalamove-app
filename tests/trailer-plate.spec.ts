/**
 * Plate normalisation and trailer-plate validation: hyphens and spaces are
 * dropped, letters upper-cased; a trailer plate is optional and 2-15 chars of
 * [A-Z0-9] after that. Pure functions, no server.
 */

import { expect, test } from "@playwright/test";

import { normalizePlate } from "@/lib/vehicles/plate";
import { parseTrailerPlate } from "@/lib/vehicles/trailer-plate";

test.describe("normalizePlate", () => {
  test("drops hyphens and spaces and upper-cases", () => {
    for (const raw of ["aa-123-bb", "AA 123 BB", " aa - 123 - bb ", "AA123BB"]) {
      expect(normalizePlate(raw)).toBe("AA123BB");
    }
  });
});

test.describe("parseTrailerPlate", () => {
  test("absent and blank values mean no trailer", () => {
    for (const raw of [undefined, null, "", "   "]) {
      expect(parseTrailerPlate(raw)).toEqual({ value: null });
    }
  });

  test("drops hyphens and spaces and upper-cases", () => {
    expect(parseTrailerPlate("  ab-123 cd ")).toEqual({ value: "AB123CD" });
  });

  test("a value of only hyphens and spaces means no trailer", () => {
    expect(parseTrailerPlate(" - - ")).toEqual({ value: null });
  });

  test("accepts the length bounds, counted without separators", () => {
    expect(parseTrailerPlate("A1")).toEqual({ value: "A1" });
    expect(parseTrailerPlate("A-1")).toEqual({ value: "A1" });
    expect(parseTrailerPlate("AAAAA-AAAAA-AAAAA")).toEqual({
      value: "A".repeat(15),
    });
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
