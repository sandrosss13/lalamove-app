/**
 * The driver personal-ID rule a logistics company is held to
 * (`src/lib/logistics-company/register-driver-input.ts`), shared by
 * `POST /api/logistics-company/drivers/register` (required) and
 * `PATCH /api/logistics-company/drivers/[userId]`.
 *
 * Pure, like `tests/service-document.spec.ts`: no browser, no server, no database.
 * The routes map the two reason codes onto their own catalog keys, so the keys
 * they use are checked against both catalogs here too — a typo'd key would be
 * rendered raw to a company admin.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { parseDriverPersonalId } from "@/lib/logistics-company/register-driver-input";

test.describe("parseDriverPersonalId", () => {
  test("accepts exactly 11 digits, trimmed, keeping leading zeros", () => {
    expect(parseDriverPersonalId("01001011234")).toEqual({
      idNumber: "01001011234",
    });
    expect(parseDriverPersonalId("  12345678901\n")).toEqual({
      idNumber: "12345678901",
    });
  });

  test("absent, null and blank are 'required'", () => {
    for (const value of [undefined, null, "", "   "]) {
      expect(parseDriverPersonalId(value)).toEqual({ error: "required" });
    }
  });

  test("anything else that is not 11 digits is 'invalid'", () => {
    for (const value of [
      "1234567890", // 10
      "123456789012", // 12
      "0100101123a",
      "010 0101123",
      "0100-101123",
      "０１００１０１１２３４", // full-width digits
      1001011234, // a JSON number has lost its leading zero
      12345678901,
      true,
      {},
      ["01001011234"],
    ]) {
      expect(parseDriverPersonalId(value)).toEqual({ error: "invalid" });
    }
  });
});

test.describe("personal-ID catalog keys", () => {
  const keys = [
    ["errors", "logisticsCompanyDriversRegister", "personalIdRequired"],
    ["errors", "logisticsCompanyDriversRegister", "personalIdInvalid"],
    ["errors", "logisticsCompanyDrivers", "personalIdInvalid"],
    ["errors", "logisticsCompanyDrivers", "personalIdLockedVerified"],
    [
      "errors",
      "logisticsCompanyDrivers",
      "onlyLogisticsCompaniesCanEditDrivers",
    ],
    ["driverHub", "driversAddPanel", "personalId"],
    ["driverHub", "driversAddPanel", "personalIdHint"],
    ["driverHub", "driversAddPanel", "personalIdPlaceholder"],
    ["driverHub", "driversDetailPanel", "personalId"],
    ["driverHub", "driversDetailPanel", "personalIdMissing"],
    ["driverHub", "driversDetailPanel", "editPersonalId"],
    ["driverHub", "driversDetailPanel", "savePersonalId"],
    ["driverHub", "driversDetailPanel", "cancelPersonalId"],
    ["driverHub", "driversDetailPanel", "savingPersonalId"],
    ["driverHub", "driversDetailPanel", "personalIdHint"],
    ["driverHub", "driversDetailPanel", "personalIdLockedNote"],
    ["driverHub", "driversDetailPanel", "couldNotSavePersonalId"],
    ["driverHub", "driversDetailPanel", "networkError"],
  ] as const;

  for (const locale of ["en", "ka"]) {
    test(`every key exists in ${locale}`, () => {
      const catalogs: Record<
        string,
        Record<string, Record<string, unknown>>
      > = {};
      for (const [namespace, group, key] of keys) {
        catalogs[namespace] ??= JSON.parse(
          readFileSync(
            join(process.cwd(), "src/messages", locale, `${namespace}.json`),
            "utf8",
          ),
        );
        const value = catalogs[namespace]?.[group]?.[key];
        expect(typeof value, `${locale} ${namespace}.${group}.${key}`).toBe(
          "string",
        );
      }
    });
  }
});
