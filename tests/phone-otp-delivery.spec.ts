/**
 * When the fixed phone sign-in test code is live — and, more to the point,
 * when it is not.
 *
 * `resolveOtpDelivery` is the whole decision `src/lib/phone-auth.ts` acts on:
 * development test mode needs `NODE_ENV === "development"` *and* a well-formed
 * `DEV_PHONE_OTP_CODE`; the staging code needs `VERCEL_ENV === "preview"`, no
 * provider, a well-formed `STAGING_PHONE_OTP_CODE` *and* an allowlisted number;
 * everything else is a real provider or a refusal. It is
 * pinned as a pure function because the endpoints need a server wired to a
 * database, and `DATABASE_URL` on this project is production (see
 * `playwright.config.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  resolveDevOtpCode,
  resolveOtpDelivery,
  resolveStagingOtpCode,
  type OtpDeliveryEnvironment,
} from "@/lib/sms/otp-delivery";

const CODE = "424242";
const STAGING_CODE = "135791";
const LISTED = "+995555123456";
const UNLISTED = "+995555654321";

/** No fixed code configured anywhere; overrides switch one piece on. */
function environment(
  overrides: Partial<OtpDeliveryEnvironment>,
): OtpDeliveryEnvironment {
  return {
    nodeEnv: undefined,
    devPhoneOtpCode: undefined,
    vercelEnv: undefined,
    stagingPhoneOtpCode: undefined,
    stagingPhoneOtpNumbers: [],
    hasSmsProvider: false,
    ...overrides,
  };
}

/** A staging deployment with the test code configured for `LISTED`. */
const STAGING = {
  vercelEnv: "preview",
  stagingPhoneOtpCode: STAGING_CODE,
  stagingPhoneOtpNumbers: [LISTED],
} as const satisfies Partial<OtpDeliveryEnvironment>;

/** Values a fixed code must never be accepted as. */
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

test.describe("resolveOtpDelivery", () => {
  test("enables the test code in development when one is configured", () => {
    expect(
      resolveOtpDelivery(
        environment({
          nodeEnv: "development",
          devPhoneOtpCode: CODE,
          hasSmsProvider: false,
        }),
        LISTED,
      ),
    ).toEqual({ mode: "DEV_FIXED_CODE", code: CODE });
  });

  for (const nodeEnv of ["production", "test", "", "Development", undefined]) {
    test(`ignores the test code when NODE_ENV is ${JSON.stringify(nodeEnv)}`, () => {
      expect(
        resolveOtpDelivery(
          environment({
            nodeEnv,
            devPhoneOtpCode: CODE,
            hasSmsProvider: false,
          }),
          LISTED,
        ),
      ).toEqual({ mode: "UNCONFIGURED" });

      // With a provider the real path is taken; the test code still is not.
      expect(
        resolveOtpDelivery(
          environment({
            nodeEnv,
            devPhoneOtpCode: CODE,
            hasSmsProvider: true,
          }),
          LISTED,
        ),
      ).toEqual({ mode: "SMS_PROVIDER" });
    });
  }

  for (const [name, devPhoneOtpCode] of Object.entries(malformed)) {
    test(`fails closed in development when the code is ${name}`, () => {
      expect(
        resolveDevOtpCode({ nodeEnv: "development", devPhoneOtpCode }),
      ).toBeNull();
      expect(
        resolveOtpDelivery(
          environment({
            nodeEnv: "development",
            devPhoneOtpCode,
            hasSmsProvider: false,
          }),
          LISTED,
        ),
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
      resolveOtpDelivery(
        environment({
          nodeEnv: "development",
          devPhoneOtpCode: CODE,
          hasSmsProvider: true,
        }),
        LISTED,
      ),
    ).toEqual({ mode: "DEV_FIXED_CODE", code: CODE });
  });

  test("uses the provider in development when no test code is set", () => {
    expect(
      resolveOtpDelivery(
        environment({
          nodeEnv: "development",
          devPhoneOtpCode: undefined,
          hasSmsProvider: true,
        }),
        LISTED,
      ),
    ).toEqual({ mode: "SMS_PROVIDER" });
  });
});

test.describe("staging test code", () => {
  test("applies to a listed number on a preview deployment", () => {
    expect(resolveOtpDelivery(environment(STAGING), LISTED)).toEqual({
      mode: "STAGING_TEST_CODE",
      code: STAGING_CODE,
    });
  });

  test("refuses an unlisted number on a preview deployment", () => {
    expect(resolveOtpDelivery(environment(STAGING), UNLISTED)).toEqual({
      mode: "UNCONFIGURED",
    });
  });

  for (const vercelEnv of [
    "production",
    "development",
    undefined,
    "",
    "Preview",
    " preview",
    "staging",
  ]) {
    test(`is off when VERCEL_ENV is ${JSON.stringify(vercelEnv)}`, () => {
      expect(
        resolveStagingOtpCode(environment({ ...STAGING, vercelEnv })),
      ).toBeNull();
      expect(
        resolveOtpDelivery(environment({ ...STAGING, vercelEnv }), LISTED),
      ).toEqual({ mode: "UNCONFIGURED" });
    });
  }

  test("applies under NODE_ENV production, as staging runs `next start`", () => {
    // Staging runs `next start`, so NODE_ENV is "production" there; it must
    // neither enable nor block the staging code.
    expect(
      resolveOtpDelivery(
        environment({ ...STAGING, nodeEnv: "production" }),
        LISTED,
      ),
    ).toEqual({ mode: "STAGING_TEST_CODE", code: STAGING_CODE });
  });

  test("gives way to a configured SMS provider", () => {
    const withProvider = environment({ ...STAGING, hasSmsProvider: true });

    expect(resolveStagingOtpCode(withProvider)).toBeNull();
    expect(resolveOtpDelivery(withProvider, LISTED)).toEqual({
      mode: "SMS_PROVIDER",
    });
    expect(resolveOtpDelivery(withProvider, UNLISTED)).toEqual({
      mode: "SMS_PROVIDER",
    });
  });

  for (const [name, stagingPhoneOtpCode] of Object.entries(malformed)) {
    test(`fails closed when the staging code is ${name}`, () => {
      const configured = environment({ ...STAGING, stagingPhoneOtpCode });

      expect(resolveStagingOtpCode(configured)).toBeNull();
      expect(resolveOtpDelivery(configured, LISTED)).toEqual({
        mode: "UNCONFIGURED",
      });
    });
  }

  test("tolerates whitespace around a well-formed staging code", () => {
    expect(
      resolveOtpDelivery(
        environment({ ...STAGING, stagingPhoneOtpCode: " 135791 " }),
        LISTED,
      ),
    ).toEqual({ mode: "STAGING_TEST_CODE", code: STAGING_CODE });
  });

  test("is off when the allowlist is empty", () => {
    const empty = environment({ ...STAGING, stagingPhoneOtpNumbers: [] });

    expect(resolveStagingOtpCode(empty)).toBeNull();
    expect(resolveOtpDelivery(empty, LISTED)).toEqual({ mode: "UNCONFIGURED" });
  });

  test("matches the allowlist exactly, never by prefix or substring", () => {
    for (const phoneNumber of ["+99555512345", "+9955551234567", ""]) {
      expect(resolveOtpDelivery(environment(STAGING), phoneNumber)).toEqual({
        mode: "UNCONFIGURED",
      });
    }
  });

  test("development test mode still wins, for every number", () => {
    const both = environment({
      ...STAGING,
      nodeEnv: "development",
      devPhoneOtpCode: CODE,
    });

    for (const phoneNumber of [LISTED, UNLISTED]) {
      expect(resolveOtpDelivery(both, phoneNumber)).toEqual({
        mode: "DEV_FIXED_CODE",
        code: CODE,
      });
    }
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

  for (const name of [
    "STAGING_PHONE_OTP_CODE",
    "STAGING_PHONE_OTP_NUMBERS",
    "VERCEL_ENV",
  ]) {
    test(`reads ${name} from the environment in exactly one place`, () => {
      // Same reason: the VERCEL_ENV and provider gates live in
      // `resolveOtpDelivery`, and a second reader could route around them.
      expect(
        source.match(new RegExp(`process\\.env\\.${name}\\b`, "g")),
      ).toHaveLength(1);
    });
  }

  test("never logs", () => {
    // A one-time code passes through this module; nothing in it may print.
    expect(source).not.toMatch(/console\.|logger\./);
  });
});
