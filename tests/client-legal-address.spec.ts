/**
 * The business client's legal-address rule (`src/lib/client-profile/
 * legal-address.ts`), shared by `POST /api/client-profile`, the sign-up form's
 * business step and the `/account` profile form.
 *
 * Pure, like `tests/driver-personal-id.spec.ts`: no browser, no server, no
 * database. The route and the two forms map the reason codes onto their own
 * catalog keys, so those keys are checked against both catalogs here too — a
 * typo'd key would be rendered raw to the client.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  LEGAL_ADDRESS_MAX_LENGTH,
  parseLegalAddress,
} from "@/lib/client-profile/legal-address";

test.describe("parseLegalAddress", () => {
  test("absent, null, empty and whitespace-only all mean 'no address'", () => {
    for (const value of [undefined, null, "", "   ", "\n\t"]) {
      expect(parseLegalAddress(value)).toEqual({ legalAddress: null });
    }
  });

  test("a value is trimmed and kept", () => {
    expect(parseLegalAddress("  12 Rustaveli Ave, Tbilisi 0108 \n")).toEqual({
      legalAddress: "12 Rustaveli Ave, Tbilisi 0108",
    });
    expect(parseLegalAddress("თბილისი, რუსთაველის გამზ. 12")).toEqual({
      legalAddress: "თბილისი, რუსთაველის გამზ. 12",
    });
  });

  test("the limit is measured after trimming, and is inclusive", () => {
    const atLimit = "a".repeat(LEGAL_ADDRESS_MAX_LENGTH);
    expect(parseLegalAddress(atLimit)).toEqual({ legalAddress: atLimit });
    expect(parseLegalAddress(`   ${atLimit}   `)).toEqual({
      legalAddress: atLimit,
    });
    expect(parseLegalAddress(`${atLimit}b`)).toEqual({ error: "tooLong" });
  });

  test("anything that is not a string is refused", () => {
    for (const value of [42, true, {}, ["street"]]) {
      expect(parseLegalAddress(value)).toEqual({ error: "notAString" });
    }
  });
});

test.describe("legal-address catalog keys", () => {
  const read = (locale: string, file: string) =>
    JSON.parse(
      readFileSync(
        join(process.cwd(), "src", "messages", locale, `${file}.json`),
        "utf8",
      ),
    );

  for (const locale of ["en", "ka"]) {
    test(`${locale}: every key the route and forms use exists`, () => {
      const errors = read(locale, "errors").clientProfile;
      expect(errors.legalAddressIsTooLong).toContain("{max}");
      expect(typeof errors.legalAddressMustBeText).toBe("string");

      for (const namespace of [
        read(locale, "account").accountProfileForm,
        read(locale, "auth").signUpForm,
      ]) {
        expect(typeof namespace.legalAddress).toBe("string");
        expect(typeof namespace.legalAddressHelper).toBe("string");
        expect(namespace.legalAddressTooLong).toContain("{max}");
      }
    });
  }
});
