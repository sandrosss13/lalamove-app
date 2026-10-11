/**
 * Which phone verifications may create an account.
 *
 * The driver app has separate "Sign in" and "Sign up" entries and names the one
 * in use in the `x-phone-auth-intent` header. `resolvePhoneAuthIntent` is the
 * whole decision `src/lib/auth.ts` acts on when the phone plugin is about to
 * create a user, so it is pinned as a pure function: the endpoint itself needs
 * a server wired to a database, and `DATABASE_URL` on this project is
 * production (see `playwright.config.ts`).
 *
 * The property that matters is the default — everything that is not exactly
 * `sign-up` must resolve to `sign-in`, the intent that never creates anything.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import type { PhoneAuthErrorCode } from "@/lib/mobile-api/contracts";
import {
  PHONE_ACCOUNT_NOT_FOUND_MESSAGE,
  PHONE_ACCOUNT_NOT_FOUND_MESSAGE_KEY,
  PHONE_AUTH_ERROR,
  PHONE_AUTH_INTENT_HEADER,
  hasPhoneIdentityField,
  phoneAccountNotFound,
  phoneNumberCannotBeSet,
  phoneNumberCannotBeUpdated,
  resolvePhoneAuthIntent,
} from "@/lib/phone-auth";

function headersWithIntent(value: string): Headers {
  return new Headers({ [PHONE_AUTH_INTENT_HEADER]: value });
}

test.describe("resolvePhoneAuthIntent", () => {
  test("the header is named x-phone-auth-intent", () => {
    expect(PHONE_AUTH_INTENT_HEADER).toBe("x-phone-auth-intent");
  });

  test("honours an explicit sign-up", () => {
    expect(resolvePhoneAuthIntent(headersWithIntent("sign-up"))).toBe(
      "sign-up",
    );
  });

  test("honours an explicit sign-in", () => {
    expect(resolvePhoneAuthIntent(headersWithIntent("sign-in"))).toBe(
      "sign-in",
    );
  });

  test("ignores case and surrounding whitespace", () => {
    expect(resolvePhoneAuthIntent(headersWithIntent("  Sign-Up "))).toBe(
      "sign-up",
    );
  });

  test("reads the header whatever case its name was sent in", () => {
    expect(
      resolvePhoneAuthIntent(new Headers({ "X-Phone-Auth-Intent": "sign-up" })),
    ).toBe("sign-up");
  });

  const notASignUp: Record<string, Headers | null | undefined> = {
    "no headers at all": undefined,
    "null headers": null,
    "a missing header": new Headers(),
    "an empty header": headersWithIntent(""),
    "a near miss": headersWithIntent("signup"),
    "an underscore spelling": headersWithIntent("sign_up"),
    "a truthy flag": headersWithIntent("true"),
    "a prefix match": headersWithIntent("sign-up-please"),
    "a list containing sign-up": headersWithIntent("sign-in, sign-up"),
    "an unrelated header": new Headers({ "x-intent": "sign-up" }),
  };

  for (const [label, headers] of Object.entries(notASignUp)) {
    test(`falls back to sign-in for ${label}`, () => {
      expect(resolvePhoneAuthIntent(headers)).toBe("sign-in");
    });
  }
});

test.describe("phoneAccountNotFound", () => {
  test("is a 404 carrying the stable code and the given message", () => {
    const error = phoneAccountNotFound("localised text");
    const code: PhoneAuthErrorCode = PHONE_AUTH_ERROR.PHONE_ACCOUNT_NOT_FOUND;

    expect(error.statusCode).toBe(404);
    expect(error.body).toMatchObject({
      code,
      message: "localised text",
    });
    expect(code).toBe("PHONE_ACCOUNT_NOT_FOUND");
  });

  for (const locale of ["en", "ka"]) {
    test(`has a ${locale} catalog entry`, () => {
      const catalog = JSON.parse(
        readFileSync(
          join(process.cwd(), "src", "messages", locale, "auth.json"),
          "utf8",
        ),
      ) as { auth: Record<string, string> };
      const message = catalog.auth[PHONE_ACCOUNT_NOT_FOUND_MESSAGE_KEY];

      expect(message).toBeTruthy();
      if (locale === "en") {
        expect(message).toBe(PHONE_ACCOUNT_NOT_FOUND_MESSAGE);
      }
    });
  }
});

/**
 * The guard in front of email sign-up and `/update-user`: a sign-in number is
 * set by verifying it and by nothing else. Without it, anyone could create a
 * password account holding a stranger's number and wait for them to sign in.
 */
test.describe("hasPhoneIdentityField", () => {
  const refused: Record<string, unknown> = {
    "a phone number": { email: "a@b.c", phoneNumber: "+995555123456" },
    "a null phone number": { phoneNumber: null },
    "an empty phone number": { phoneNumber: "" },
    "the verified flag": { phoneNumberVerified: true },
    "a false verified flag": { phoneNumberVerified: false },
    both: { phoneNumber: "+995555123456", phoneNumberVerified: true },
  };

  for (const [label, body] of Object.entries(refused)) {
    test(`flags a body carrying ${label}`, () => {
      expect(hasPhoneIdentityField(body)).toBe(true);
    });
  }

  const allowed: Record<string, unknown> = {
    "an ordinary sign-up": { email: "a@b.c", password: "x", role: "DRIVER" },
    "an empty object": {},
    "a differently-cased key": { PhoneNumber: "+995555123456" },
    "the number as a value only": { name: "phoneNumber" },
    undefined: undefined,
    null: null,
    "a string": "phoneNumber",
  };

  for (const [label, body] of Object.entries(allowed)) {
    test(`passes ${label}`, () => {
      expect(hasPhoneIdentityField(body)).toBe(false);
    });
  }

  test("the refusals are 400s with stable codes", () => {
    expect(phoneNumberCannotBeSet().statusCode).toBe(400);
    expect(phoneNumberCannotBeSet().body).toMatchObject({
      code: "PHONE_NUMBER_CANNOT_BE_SET",
    });
    expect(phoneNumberCannotBeUpdated().statusCode).toBe(400);
    expect(phoneNumberCannotBeUpdated().body).toMatchObject({
      code: "PHONE_NUMBER_CANNOT_BE_UPDATED",
    });
  });
});
