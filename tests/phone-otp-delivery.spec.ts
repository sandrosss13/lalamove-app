/**
 * When the fixed phone sign-in test code is live — and, more to the point,
 * when it is not.
 *
 * `resolveOtpDelivery` is the whole decision `src/lib/phone-auth.ts` acts on:
 * test mode needs `NODE_ENV === "development"` *and* a well-formed
 * `DEV_PHONE_OTP_CODE`; everything else is a real provider or a refusal. It is
 * pinned as a pure function because the endpoints need a server wired to a
 * database, and `DATABASE_URL` on this project is production (see
 * `playwright.config.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { resolveDevOtpCode, resolveOtpDelivery } from "@/lib/sms/otp-delivery";

const CODE = "424242";

test.describe("resolveOtpDelivery", () => {
  test("enables the test code in development when one is configured", () => {
    expect(
      resolveOtpDelivery({
        nodeEnv: "development",
        devPhoneOtpCode: CODE,
        hasSmsProvider: false,
      }),
    ).toEqual({ mode: "DEV_FIXED_CODE", code: CODE });
  });

  for (const nodeEnv of ["production", "test", "", "Development", undefined]) {
    test(`ignores the test code when NODE_ENV is ${JSON.stringify(nodeEnv)}`, () => {
      expect(
        resolveOtpDelivery({
          nodeEnv,
          devPhoneOtpCode: CODE,
          hasSmsProvider: false,
        }),
      ).toEqual({ mode: "UNCONFIGURED" });

      // With a provider the real path is taken; the test code still is not.
      expect(
        resolveOtpDelivery({
          nodeEnv,
          devPhoneOtpCode: CODE,
          hasSmsProvider: true,
        }),
      ).toEqual({ mode: "SMS_PROVIDER" });
    });
  }

  const malformed: Record<string, string | undefined> = {
    unset: undefined,
    empty: "",
    blank: "   ",
    "five digits": "42424",
    "seven digits": "4242424",
    letters: "abcdef",
    "digits with a letter": "42424a",
    "a signed number": "-42424",
    "a decimal": "4242.4",
    "full-width digits": "４２４２４２",
  };

  for (const [name, devPhoneOtpCode] of Object.entries(malformed)) {
    test(`fails closed in development when the code is ${name}`, () => {
      expect(
        resolveDevOtpCode({ nodeEnv: "development", devPhoneOtpCode }),
      ).toBeNull();
      expect(
        resolveOtpDelivery({
          nodeEnv: "development",
          devPhoneOtpCode,
          hasSmsProvider: false,
        }),
      ).toEqual({ mode: "UNCONFIGURED" });
    });
  }

  test("tolerates whitespace around a well-formed code", () => {
    expect(
      resolveDevOtpCode({
        nodeEnv: "development",
        devPhoneOtpCode: " 424242 ",
      }),
    ).toBe(CODE);
  });

  test("prefers the test code over a provider, in development only", () => {
    expect(
      resolveOtpDelivery({
        nodeEnv: "development",
        devPhoneOtpCode: CODE,
        hasSmsProvider: true,
      }),
    ).toEqual({ mode: "DEV_FIXED_CODE", code: CODE });
  });

  test("uses the provider in development when no test code is set", () => {
    expect(
      resolveOtpDelivery({
        nodeEnv: "development",
        devPhoneOtpCode: undefined,
        hasSmsProvider: true,
      }),
    ).toEqual({ mode: "SMS_PROVIDER" });
  });
});

test.describe("phone-auth wiring", () => {
  const source = readFileSync(
    join(process.cwd(), "src/lib/phone-auth.ts"),
    "utf8",
  );

  test("reads the test code from the environment in exactly one place", () => {
    // Every use of the variable must go through `resolveOtpDelivery`, so the
    // NODE_ENV gate above cannot be routed around by a second reader.
    expect(source.match(/process\.env\.DEV_PHONE_OTP_CODE/g)).toHaveLength(1);
    expect(source).toContain("nodeEnv: process.env.NODE_ENV");
  });

  test("never logs", () => {
    // A one-time code passes through this module; nothing in it may print.
    expect(source).not.toMatch(/console\.|logger\./);
  });
});
