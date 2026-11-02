/**
 * The two phone sign-up headers: `x-phone-auth-role` (which role a new account
 * gets) and `x-phone-auth-email` (which real address it carries instead of the
 * placeholder).
 *
 * `resolvePhoneAuthRole` and `resolvePhoneAuthEmail` are the whole of the
 * header reading `src/lib/auth.ts` acts on, so they are pinned as pure
 * functions: the endpoints themselves need a server wired to a database, and
 * `DATABASE_URL` on this project is production (see `playwright.config.ts`).
 *
 * The properties that matter: a missing role is `DRIVER` (the native driver
 * app sends none), nothing resolves to `ADMIN`, and a malformed value is
 * refused rather than quietly turned into some other account.
 */

import { expect, test } from "@playwright/test";
import { isAPIError } from "better-auth/api";

import {
  PHONE_AUTH_EMAIL_HEADER as CONTRACT_EMAIL_HEADER,
  PHONE_AUTH_ROLE_HEADER as CONTRACT_ROLE_HEADER,
  type PhoneAuthErrorCode,
} from "@/lib/mobile-api/contracts";
import {
  PHONE_AUTH_EMAIL_HEADER,
  PHONE_AUTH_ERROR,
  PHONE_AUTH_ROLE_HEADER,
  phoneAuthEmailTaken,
  placeholderEmailForPhone,
  resolvePhoneAuthEmail,
  resolvePhoneAuthRole,
} from "@/lib/phone-auth";

function withRole(value: string): Headers {
  return new Headers({ [PHONE_AUTH_ROLE_HEADER]: value });
}

function withEmail(value: string): Headers {
  return new Headers({ [PHONE_AUTH_EMAIL_HEADER]: value });
}

/** Runs `fn`, expecting a Better Auth `APIError`; returns its status and body. */
function refusal(fn: () => unknown): { status: number; code: unknown } {
  try {
    fn();
  } catch (error) {
    if (isAPIError(error)) {
      return {
        status: error.statusCode,
        code: (error.body as { code?: unknown } | undefined)?.code,
      };
    }
    throw error;
  }
  throw new Error("expected an APIError, but nothing was thrown");
}

test.describe("header names", () => {
  test("are x-phone-auth-role and x-phone-auth-email, shared with the contract", () => {
    expect(PHONE_AUTH_ROLE_HEADER).toBe("x-phone-auth-role");
    expect(PHONE_AUTH_EMAIL_HEADER).toBe("x-phone-auth-email");
    expect(CONTRACT_ROLE_HEADER).toBe(PHONE_AUTH_ROLE_HEADER);
    expect(CONTRACT_EMAIL_HEADER).toBe(PHONE_AUTH_EMAIL_HEADER);
  });
});

test.describe("resolvePhoneAuthRole", () => {
  test("a missing header is DRIVER", () => {
    expect(resolvePhoneAuthRole(new Headers())).toBe("DRIVER");
    expect(resolvePhoneAuthRole(null)).toBe("DRIVER");
    expect(resolvePhoneAuthRole(undefined)).toBe("DRIVER");
  });

  for (const role of ["CLIENT", "DRIVER", "COMPANY"] as const) {
    test(`honours ${role}`, () => {
      expect(resolvePhoneAuthRole(withRole(role))).toBe(role);
    });
  }

  test("reads the header whatever case its name was sent in", () => {
    expect(
      resolvePhoneAuthRole(new Headers({ "X-Phone-Auth-Role": "CLIENT" })),
    ).toBe("CLIENT");
  });

  for (const value of [
    "ADMIN",
    "admin",
    "client",
    "Driver",
    "COMPNAY",
    "",
    "CLIENT,DRIVER",
  ]) {
    test(`refuses ${JSON.stringify(value)} with 400 INVALID_REQUEST`, () => {
      expect(refusal(() => resolvePhoneAuthRole(withRole(value)))).toEqual({
        status: 400,
        code: PHONE_AUTH_ERROR.INVALID_REQUEST,
      });
    });
  }
});

test.describe("resolvePhoneAuthEmail", () => {
  test("absent or blank is null (the placeholder is used)", () => {
    expect(resolvePhoneAuthEmail(new Headers())).toBeNull();
    expect(resolvePhoneAuthEmail(null)).toBeNull();
    expect(resolvePhoneAuthEmail(withEmail(""))).toBeNull();
    expect(resolvePhoneAuthEmail(withEmail("   "))).toBeNull();
  });

  test("trims and lowercases", () => {
    expect(resolvePhoneAuthEmail(withEmail("  Nino.Beridze@Example.GE "))).toBe(
      "nino.beridze@example.ge",
    );
  });

  test("accepts an ordinary address with a plus tag and subdomain", () => {
    expect(resolvePhoneAuthEmail(withEmail("a+zomo@mail.example.co.uk"))).toBe(
      "a+zomo@mail.example.co.uk",
    );
  });

  for (const value of [
    "not-an-email",
    "missing-domain@",
    "@missing-local.ge",
    "no-dot@localhost",
    "two@@example.ge",
    "spaces in@example.ge",
  ]) {
    test(`refuses ${JSON.stringify(value)} with 400 INVALID_EMAIL`, () => {
      expect(refusal(() => resolvePhoneAuthEmail(withEmail(value)))).toEqual({
        status: 400,
        code: PHONE_AUTH_ERROR.INVALID_EMAIL,
      });
    });
  }

  test("refuses an address longer than 254 characters", () => {
    const local = "a".repeat(64);
    const domain = `${"b".repeat(200)}.ge`;
    const tooLong = `${local}@${domain}`;
    expect(tooLong.length).toBeGreaterThan(254);

    expect(refusal(() => resolvePhoneAuthEmail(withEmail(tooLong)))).toEqual({
      status: 400,
      code: PHONE_AUTH_ERROR.INVALID_EMAIL,
    });
  });

  test("refuses the phone placeholder domain, in any case", () => {
    const placeholder = placeholderEmailForPhone("+995555123456");

    for (const value of [placeholder, placeholder.toUpperCase()]) {
      expect(refusal(() => resolvePhoneAuthEmail(withEmail(value)))).toEqual({
        status: 400,
        code: PHONE_AUTH_ERROR.INVALID_EMAIL,
      });
    }
  });
});

test.describe("phoneAuthEmailTaken", () => {
  test("is a 409 EMAIL_TAKEN", () => {
    const error = phoneAuthEmailTaken();
    expect(error.statusCode).toBe(409);
    expect(error.body).toMatchObject({ code: PHONE_AUTH_ERROR.EMAIL_TAKEN });
  });
});

test.describe("error codes", () => {
  test("the new codes are part of the contract's PhoneAuthErrorCode", () => {
    // Fails to compile if either is missing from the contract union.
    const codes: PhoneAuthErrorCode[] = [
      PHONE_AUTH_ERROR.INVALID_EMAIL,
      PHONE_AUTH_ERROR.EMAIL_TAKEN,
    ];
    expect(codes).toEqual(["INVALID_EMAIL", "EMAIL_TAKEN"]);
  });
});
