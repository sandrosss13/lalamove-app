/**
 * The pure rules behind phone sign-up / sign-in on the website
 * (`src/components/auth/phone-auth-flow.ts`): which method step 3 opens on for
 * each account type, what each server refusal tells the person, how a typed
 * code is cleaned, and the request headers. No browser, no server, no
 * database — see `playwright.config.ts` on why the suite has one runner.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  defaultAuthMethod,
  formatPhoneForDisplay,
  isCompletePhoneCode,
  parseAuthMethod,
  PHONE_AUTH_EMAIL_HEADER,
  PHONE_AUTH_ERROR_KEYS,
  PHONE_AUTH_INTENT_HEADER,
  PHONE_AUTH_ROLE_HEADER,
  PHONE_CODE_LENGTH,
  phoneAuthFailure,
  phoneAuthHeaders,
  RESEND_COOLDOWN_SECONDS,
  resendSecondsLeft,
  resolvePortalRole,
  sanitizePhoneCode,
} from "@/components/auth/phone-auth-flow";

test.describe("defaultAuthMethod — the owner's table", () => {
  const table = [
    { role: "DRIVER", accountType: "INDIVIDUAL", expected: "phone" },
    {
      role: "DRIVER",
      accountType: "INDIVIDUAL_ENTREPRENEUR",
      expected: "phone",
    },
    // The Driver card + Business is a logistics company.
    { role: "DRIVER", accountType: "BUSINESS", expected: "email" },
    { role: "CLIENT", accountType: "BUSINESS", expected: "email" },
    // An individual client chooses; nothing is pre-picked.
    { role: "CLIENT", accountType: "INDIVIDUAL", expected: null },
  ] as const;

  for (const { role, accountType, expected } of table) {
    test(`${role} + ${accountType} opens on ${expected ?? "no method"}`, () => {
      expect(defaultAuthMethod(role, accountType)).toBe(expected);
    });
  }

  test("resolvePortalRole maps Driver + Business to COMPANY only", () => {
    expect(resolvePortalRole("DRIVER", "BUSINESS")).toBe("COMPANY");
    expect(resolvePortalRole("DRIVER", "INDIVIDUAL")).toBe("DRIVER");
    expect(resolvePortalRole("DRIVER", "INDIVIDUAL_ENTREPRENEUR")).toBe(
      "DRIVER",
    );
    expect(resolvePortalRole("CLIENT", "BUSINESS")).toBe("CLIENT");
    expect(resolvePortalRole("CLIENT", "INDIVIDUAL")).toBe("CLIENT");
  });

  test("parseAuthMethod accepts the two tab values only", () => {
    expect(parseAuthMethod("phone")).toBe("phone");
    expect(parseAuthMethod("email")).toBe("email");
    expect(parseAuthMethod("")).toBeNull();
    expect(parseAuthMethod("Phone")).toBeNull();
  });
});

test.describe("phoneAuthFailure — refusal → message", () => {
  const cases = [
    ["INVALID_OTP", 400, "errorInvalidCode", "none", "code"],
    ["OTP_NOT_FOUND", 400, "errorCodeExpired", "resend", "code"],
    ["OTP_EXPIRED", 400, "errorCodeExpired", "resend", "code"],
    ["TOO_MANY_ATTEMPTS", 403, "errorTooManyAttempts", "resend", "code"],
    ["SMS_NOT_CONFIGURED", 503, "errorSmsUnavailable", "none", "form"],
    ["INVALID_PHONE_NUMBER", 400, "errorInvalidPhone", "none", "phone"],
    ["INVALID_REQUEST", 400, "errorInvalidRequest", "none", "form"],
    ["RATE_LIMITED", 429, "errorRateLimited", "none", "form"],
    [
      "SIGN_UP_HOST_NOT_ALLOWED",
      403,
      "errorSignUpHostNotAllowed",
      "driverSite",
      "form",
    ],
    ["PHONE_ACCOUNT_NOT_FOUND", 404, "errorAccountNotFound", "signUp", "form"],
    ["INVALID_EMAIL", 400, "errorInvalidEmail", "none", "email"],
    ["EMAIL_TAKEN", 409, "errorEmailTaken", "none", "email"],
    ["ACCOUNT_SUSPENDED", 403, "errorAccountSuspended", "none", "form"],
  ] as const;

  for (const [code, status, messageKey, recovery, target] of cases) {
    test(code, () => {
      expect(phoneAuthFailure(code, status)).toEqual({
        messageKey,
        recovery,
        target,
      });
    });
  }

  test("Better Auth's own 429 carries no code and still reads as rate-limited", () => {
    expect(phoneAuthFailure(null, 429).messageKey).toBe("errorRateLimited");
  });

  test("no answer at all is a network failure", () => {
    expect(phoneAuthFailure(null, null).messageKey).toBe("errorNetwork");
  });

  test("an unknown code is the generic message, never the raw server text", () => {
    expect(phoneAuthFailure("SOMETHING_NEW", 500)).toEqual({
      messageKey: "errorGeneric",
      recovery: "none",
      target: "form",
    });
    // An inherited property name must not be read as a known code.
    expect(phoneAuthFailure("toString", 400).messageKey).toBe("errorGeneric");
  });

  test("every message key exists in both catalogs", () => {
    for (const locale of ["en", "ka"]) {
      const catalog = JSON.parse(
        readFileSync(
          join(process.cwd(), "src", "messages", locale, "auth.json"),
          "utf8",
        ),
      ) as { phoneAuth: Record<string, string> };

      for (const key of PHONE_AUTH_ERROR_KEYS) {
        expect(catalog.phoneAuth[key], `${locale}: ${key}`).toBeTruthy();
      }
    }
  });
});

test.describe("the code input", () => {
  test("is six digits", () => {
    expect(PHONE_CODE_LENGTH).toBe(6);
  });

  test("keeps digits only, at most six", () => {
    expect(sanitizePhoneCode("123456")).toBe("123456");
    expect(sanitizePhoneCode("12 34 56")).toBe("123456");
    expect(sanitizePhoneCode("1234567")).toBe("123456");
    expect(sanitizePhoneCode("abc")).toBe("");
    expect(sanitizePhoneCode("Your verification code is 482 913.")).toBe(
      "482913",
    );
  });

  test("is complete at exactly six digits", () => {
    expect(isCompletePhoneCode("123456")).toBe(true);
    expect(isCompletePhoneCode("12345")).toBe(false);
    expect(isCompletePhoneCode("12345a")).toBe(false);
    expect(isCompletePhoneCode("")).toBe(false);
  });
});

test.describe("resend cooldown", () => {
  const sentAt = 1_000_000;

  test("is a minute", () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
  });

  test("counts down in whole seconds, rounding up, never below zero", () => {
    expect(resendSecondsLeft(sentAt, sentAt)).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt + 500)).toBe(60);
    expect(resendSecondsLeft(sentAt, sentAt + 59_001)).toBe(1);
    expect(resendSecondsLeft(sentAt, sentAt + 60_000)).toBe(0);
    expect(resendSecondsLeft(sentAt, sentAt + 120_000)).toBe(0);
  });
});

test.describe("request headers", () => {
  test("always name the role; intent and email only when given", () => {
    expect(phoneAuthHeaders({ role: "DRIVER" })).toEqual({
      "Content-Type": "application/json",
      [PHONE_AUTH_ROLE_HEADER]: "DRIVER",
    });

    expect(
      phoneAuthHeaders({
        role: "COMPANY",
        intent: "sign-up",
        email: "  ops@fleet.ge ",
      }),
    ).toEqual({
      "Content-Type": "application/json",
      [PHONE_AUTH_ROLE_HEADER]: "COMPANY",
      [PHONE_AUTH_INTENT_HEADER]: "sign-up",
      [PHONE_AUTH_EMAIL_HEADER]: "ops@fleet.ge",
    });
  });

  test("a blank email is not sent", () => {
    expect(
      phoneAuthHeaders({ role: "CLIENT", intent: "sign-in", email: "   " }),
    ).not.toHaveProperty(PHONE_AUTH_EMAIL_HEADER);
  });

  test("header names match the server contract", () => {
    expect(PHONE_AUTH_INTENT_HEADER).toBe("x-phone-auth-intent");
    expect(PHONE_AUTH_ROLE_HEADER).toBe("x-phone-auth-role");
    expect(PHONE_AUTH_EMAIL_HEADER).toBe("x-phone-auth-email");
  });
});

test("formatPhoneForDisplay groups a Georgian number and leaves others alone", () => {
  expect(formatPhoneForDisplay("+995555123456")).toBe("+995 555 12 34 56");
  expect(formatPhoneForDisplay("+447700900123")).toBe("+447700900123");
});
