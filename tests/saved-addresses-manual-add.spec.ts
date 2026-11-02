/**
 * The manage page's "Add address" rule, pinned without a server or a
 * database: a hand-added address must be a picked suggestion with real
 * coordinates, and must not already be saved.
 *
 * `manualAddressProblem` in
 * `src/components/saved-addresses/saved-address-format.ts` is the single
 * statement of it.
 */

import { expect, test } from "@playwright/test";

import { manualAddressProblem } from "@/components/saved-addresses/saved-address-format";

const TBILISI = { lat: 41.7151, lng: 44.8271 };

test("a picked suggestion with coordinates can be saved", () => {
  expect(
    manualAddressProblem("Rustaveli Ave 12, Tbilisi", TBILISI, []),
  ).toBeNull();
});

test("a blank address is required first", () => {
  expect(manualAddressProblem("   ", TBILISI, [])).toBe("addressRequired");
  expect(manualAddressProblem("", null, [])).toBe("addressRequired");
});

test("free text without coordinates is refused", () => {
  expect(manualAddressProblem("Rustaveli Ave 12", null, [])).toBe(
    "pickSuggestion",
  );
});

test("coordinates that are not a real position are refused", () => {
  for (const location of [
    { lat: Number.NaN, lng: 44.8 },
    { lat: 41.7, lng: Number.POSITIVE_INFINITY },
    { lat: 91, lng: 44.8 },
    { lat: 41.7, lng: -181 },
  ]) {
    expect(manualAddressProblem("Rustaveli Ave 12", location, [])).toBe(
      "pickSuggestion",
    );
  }
});

test("an address already saved is refused, ignoring case and whitespace", () => {
  expect(
    manualAddressProblem("  rustaveli  ave 12, tbilisi ", TBILISI, [
      "Agmashenebeli Ave 88",
      "Rustaveli Ave 12, Tbilisi",
    ]),
  ).toBe("alreadySaved");
  expect(
    manualAddressProblem("Rustaveli Ave 14, Tbilisi", TBILISI, [
      "Rustaveli Ave 12, Tbilisi",
    ]),
  ).toBeNull();
});
