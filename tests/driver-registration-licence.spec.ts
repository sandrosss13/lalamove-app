/**
 * The optional, all-or-nothing licence on a company's add-driver request.
 *
 * `parseOptionalLicence` is the whole rule `POST /api/logistics-company/
 * drivers/register` applies to the licence fields, pinned as a pure function
 * because the route needs a signed-in session and a database, and
 * `DATABASE_URL` on this project is production (see `playwright.config.ts`).
 * The translator echoes the key, so each assertion names the exact message.
 */

import { expect, test } from "@playwright/test";
import type { LicenceCategory } from "@prisma/client";

import { parseOptionalLicence } from "@/lib/driver-registration/licence";

const CATEGORIES: readonly LicenceCategory[] = ["B", "C", "CE"];
const NOW = Date.parse("2026-10-12T09:00:00.000Z");
const KEY = "errors.logisticsCompanyDriversRegister";

const t = (key: string) => key;

function parse(record: Record<string, unknown>) {
  return parseOptionalLicence(record, t, CATEGORIES, NOW);
}

test.describe("no licence", () => {
  test("absent fields are no licence", () => {
    expect(parse({})).toEqual({ licence: null });
  });

  test("null, blank and an empty category list are no licence", () => {
    expect(
      parse({
        licenceNumber: "  ",
        licenceExpiresAt: null,
        licenceCategories: [],
      }),
    ).toEqual({ licence: null });
    expect(
      parse({
        licenceNumber: null,
        licenceExpiresAt: "",
        licenceCategories: null,
      }),
    ).toEqual({ licence: null });
  });
});

test.describe("a full licence", () => {
  test("is parsed, trimmed and de-duplicated", () => {
    expect(
      parse({
        licenceNumber: " 01234567 ",
        licenceExpiresAt: "2030-01-31",
        licenceCategories: ["C", "B", "C"],
      }),
    ).toEqual({
      licence: {
        number: "01234567",
        expiresAt: new Date("2030-01-31"),
        categories: ["C", "B"],
      },
    });
  });
});

test.describe("a partly filled licence", () => {
  test("names the first missing field", () => {
    expect(
      parse({ licenceExpiresAt: "2030-01-31", licenceCategories: ["B"] }),
    ).toEqual({ error: `${KEY}.licencenumberIsRequiredAndMustBe` });
    expect(parse({ licenceNumber: "01234567" })).toEqual({
      error: `${KEY}.licenceexpiresatMustBeAValidIso`,
    });
    expect(
      parse({ licenceNumber: "01234567", licenceExpiresAt: "2030-01-31" }),
    ).toEqual({ error: `${KEY}.licencecategoriesMustBeAnArrayWith` });
  });

  test("a ticked category alone is a partial licence", () => {
    expect(parse({ licenceCategories: ["CE"] })).toEqual({
      error: `${KEY}.licencenumberIsRequiredAndMustBe`,
    });
  });
});

test.describe("an invalid licence", () => {
  test("an expiry today or earlier is refused", () => {
    for (const licenceExpiresAt of ["2026-10-12T09:00:00.000Z", "2025-01-01"]) {
      expect(
        parse({
          licenceNumber: "01234567",
          licenceExpiresAt,
          licenceCategories: ["B"],
        }),
      ).toEqual({ error: `${KEY}.theLicenceExpiryDateMustBe` });
    }
  });

  test("an unparseable expiry is refused", () => {
    expect(
      parse({
        licenceNumber: "01234567",
        licenceExpiresAt: "not a date",
        licenceCategories: ["B"],
      }),
    ).toEqual({ error: `${KEY}.licenceexpiresatMustBeAValidIso` });
  });

  test("an unknown category is refused", () => {
    expect(
      parse({
        licenceNumber: "01234567",
        licenceExpiresAt: "2030-01-31",
        licenceCategories: ["B", "D"],
      }),
    ).toEqual({ error: `${KEY}.licenceCategoriesMustContainOnly` });
  });
});
