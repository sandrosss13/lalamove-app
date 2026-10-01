/**
 * Phone-number sign-in for the native driver app: the options handed to Better
 * Auth's `phoneNumber` plugin, and the request checks `src/lib/auth.ts` runs in
 * front of the plugin's endpoints.
 *
 * The driver signs in **and** up with a mobile number and a six-digit SMS code —
 * no email, no password. Two endpoints carry that:
 *
 * - `POST /api/auth/phone-number/send-otp` `{ phoneNumber }`
 * - `POST /api/auth/phone-number/verify`   `{ phoneNumber, code }`, plus the
 *   `x-phone-auth-intent` header saying which of the app's two entries the
 *   driver used. Only `sign-up` may create an account (`resolvePhoneAuthIntent`).
 *
 * The plugin also registers a password-based sign-in and a password reset by
 * phone. Neither has a screen, so both are refused (`BLOCKED_PHONE_PLUGIN_PATHS`).
 *
 * How the code is delivered — a real SMS, the development test code, or not at
 * all — is decided by `@/lib/sms/otp-delivery`.
 */

import { APIError } from "better-auth/api";
import type { PhoneNumberOptions } from "better-auth/plugins/phone-number";

import type {
  PhoneAuthIntent,
  PhoneAuthIntentHeader,
} from "@/lib/mobile-api/contracts";
import { isE164PhoneNumber, normalizePhoneNumber } from "@/lib/phone-number";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  PHONE_OTP_LENGTH,
  resolveOtpDelivery,
  type OtpDelivery,
} from "@/lib/sms/otp-delivery";
import { getSmsSender } from "@/lib/sms/sender";

export const PHONE_SEND_OTP_PATH = "/phone-number/send-otp";
export const PHONE_VERIFY_PATH = "/phone-number/verify";

/**
 * Plugin endpoints this app does not offer. A phone account has no password,
 * so password sign-in can never succeed and a password reset by phone would
 * only be a way to attach one; refusing them outright keeps the reachable
 * surface to the two endpoints above.
 */
export const BLOCKED_PHONE_PLUGIN_PATHS: readonly string[] = [
  "/sign-in/phone-number",
  "/phone-number/request-password-reset",
  "/phone-number/reset-password",
];

/**
 * Machine-readable refusal codes added by this app on top of the plugin's own
 * (`INVALID_OTP`, `OTP_NOT_FOUND`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`). Mirrored
 * for the native client in `@/lib/mobile-api/contracts` (`PhoneAuthErrorCode`).
 */
export const PHONE_AUTH_ERROR = {
  SMS_NOT_CONFIGURED: "SMS_NOT_CONFIGURED",
  INVALID_PHONE_NUMBER: "INVALID_PHONE_NUMBER",
  INVALID_REQUEST: "INVALID_REQUEST",
  RATE_LIMITED: "RATE_LIMITED",
  SIGN_UP_HOST_NOT_ALLOWED: "SIGN_UP_HOST_NOT_ALLOWED",
  PHONE_ACCOUNT_NOT_FOUND: "PHONE_ACCOUNT_NOT_FOUND",
  PHONE_NUMBER_CANNOT_BE_SET: "PHONE_NUMBER_CANNOT_BE_SET",
  PHONE_NUMBER_CANNOT_BE_UPDATED: "PHONE_NUMBER_CANNOT_BE_UPDATED",
} as const;

/* ------------------------------------------------------------------------- */
/* The sign-in number is set by verifying it, and by nothing else            */
/* ------------------------------------------------------------------------- */

/**
 * The two user columns that together mean "this account is signed in to with
 * this number". The plugin declares `phoneNumber` as an ordinary client-settable
 * field, so Better Auth would accept it on email sign-up and on `/update-user`.
 */
export const PHONE_IDENTITY_FIELDS: readonly string[] = [
  "phoneNumber",
  "phoneNumberVerified",
];

/**
 * Whether a request body names either column, whatever value it carries —
 * `null`, `""` and `false` included, since clearing a number is as unwanted as
 * claiming one.
 *
 * Without this check anyone could create a password account holding a
 * stranger's number; the plugin looks a verified number up by that column
 * alone, so the stranger's later phone sign-in would land them in an account
 * whose password somebody else knows.
 */
export function hasPhoneIdentityField(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    PHONE_IDENTITY_FIELDS.some((field) => Object.hasOwn(body, field))
  );
}

/** Refusal for an account being created with a number it has not verified. */
export function phoneNumberCannotBeSet(): APIError {
  return new APIError("BAD_REQUEST", {
    message: "A phone number can only be set by verifying it.",
    code: PHONE_AUTH_ERROR.PHONE_NUMBER_CANNOT_BE_SET,
  });
}

/** Refusal for an existing account's number being changed or cleared. */
export function phoneNumberCannotBeUpdated(): APIError {
  return new APIError("BAD_REQUEST", {
    message: "Phone number cannot be updated.",
    code: PHONE_AUTH_ERROR.PHONE_NUMBER_CANNOT_BE_UPDATED,
  });
}

/* ------------------------------------------------------------------------- */
/* Intent: sign in, or sign up                                               */
/* ------------------------------------------------------------------------- */

/**
 * The verify request header carrying the intent. Typed against the contract
 * the native app is built from, so the two cannot drift apart.
 */
export const PHONE_AUTH_INTENT_HEADER: PhoneAuthIntentHeader =
  "x-phone-auth-intent";

/** The intent assumed whenever the client does not clearly say `sign-up`. */
const DEFAULT_PHONE_AUTH_INTENT: PhoneAuthIntent = "sign-in";

/**
 * Which of the app's two entries a verify request came from.
 *
 * The app offers "Sign in" and "Sign up" separately, and only the second may
 * create an account: a driver who already has an email account and types their
 * number under "Sign in" must be told there is no account for it, not handed a
 * second, empty one. The intent travels in a header because the verify body is
 * closed to extra keys (see `parsePhoneAuthBody`).
 *
 * Anything other than exactly `sign-up` — a missing header, an empty one, a
 * typo, a client that predates the header — is `sign-in`, so an account is
 * never created implicitly.
 */
export function resolvePhoneAuthIntent(
  headers: Headers | null | undefined,
): PhoneAuthIntent {
  const declared = headers?.get(PHONE_AUTH_INTENT_HEADER)?.trim().toLowerCase();

  return declared === "sign-up" ? "sign-up" : DEFAULT_PHONE_AUTH_INTENT;
}

/** English text of the refusal below; the localised one is keyed in `auth.auth`. */
export const PHONE_ACCOUNT_NOT_FOUND_MESSAGE =
  "No account is registered with this mobile number. Sign up to create one.";

/** Catalog key (`auth.auth` namespace) of `PHONE_ACCOUNT_NOT_FOUND_MESSAGE`. */
export const PHONE_ACCOUNT_NOT_FOUND_MESSAGE_KEY =
  "noAccountIsRegisteredWithThis";

/**
 * The refusal for a correct code, sign-in intent and a number with no account.
 * Only ever thrown after the code has been checked and consumed — see the
 * `databaseHooks.user.create.before` in `src/lib/auth.ts` for why that matters.
 */
export function phoneAccountNotFound(message: string): APIError {
  return new APIError("NOT_FOUND", {
    message,
    code: PHONE_AUTH_ERROR.PHONE_ACCOUNT_NOT_FOUND,
  });
}

/** How long a code stays valid, in seconds. */
const OTP_EXPIRES_IN_SECONDS = 300;

/** Wrong guesses allowed per issued code. Counted by the plugin, in the database. */
const OTP_ALLOWED_ATTEMPTS = 3;

/**
 * The domain of the placeholder address a phone account is created with.
 *
 * Better Auth requires every user to have a unique email and the driver app
 * collects none, so one is derived from the number. `.invalid` is reserved by
 * RFC 2606 and can never resolve, which guarantees nothing is ever delivered to
 * it. Email sign-up refuses addresses on this domain (see `src/lib/auth.ts`) so
 * nobody can pre-register a number's placeholder and block its owner.
 */
export const PHONE_PLACEHOLDER_EMAIL_DOMAIN = "phone.driver-app.invalid";

/** `+995555123456` → `995555123456@phone.driver-app.invalid`. */
export function placeholderEmailForPhone(phoneNumber: string): string {
  return `${phoneNumber.replace(/^\+/, "")}@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`;
}

export function isPhonePlaceholderEmail(email: unknown): boolean {
  return (
    typeof email === "string" &&
    email.trim().toLowerCase().endsWith(`@${PHONE_PLACEHOLDER_EMAIL_DOMAIN}`)
  );
}

/**
 * Read per call rather than once at import, so the answer always reflects the
 * running process. `process.env.NODE_ENV` is inlined by Next at build time,
 * which makes the test-code branch dead code in a production bundle.
 */
export function currentOtpDelivery(): OtpDelivery {
  return resolveOtpDelivery({
    nodeEnv: process.env.NODE_ENV,
    devPhoneOtpCode: process.env.DEV_PHONE_OTP_CODE,
    hasSmsProvider: getSmsSender() !== null,
  });
}

function smsNotConfigured(): APIError {
  return new APIError("SERVICE_UNAVAILABLE", {
    message: "Phone sign-in is not available: no SMS provider is configured.",
    code: PHONE_AUTH_ERROR.SMS_NOT_CONFIGURED,
  });
}

/** Refuses the request unless a code can actually be delivered. */
export function assertOtpDeliveryConfigured(): void {
  if (currentOtpDelivery().mode === "UNCONFIGURED") {
    throw smsNotConfigured();
  }
}

/* ------------------------------------------------------------------------- */
/* Request body                                                              */
/* ------------------------------------------------------------------------- */

const CODE_PATTERN = new RegExp(`^\\d{${PHONE_OTP_LENGTH}}$`);

/**
 * The only keys each endpoint accepts.
 *
 * The plugin's verify endpoint takes *any* extra key and feeds it to user
 * creation — and `role` is a client-settable field on this app's user, so an
 * unfiltered body could mint an account of any role, `ADMIN` included. It also
 * accepts `updatePhoneNumber`, which would attach a number to whatever account
 * is signed in. Neither is wanted, so anything outside this list is a 400
 * rather than being silently dropped.
 */
const ALLOWED_BODY_KEYS: Record<string, readonly string[]> = {
  [PHONE_SEND_OTP_PATH]: ["phoneNumber"],
  [PHONE_VERIFY_PATH]: ["phoneNumber", "code"],
};

export type PhoneAuthBody = { phoneNumber: string; code: string | null };

/**
 * Validates a send/verify body and returns it with the number normalised to
 * E.164. Throws a 400 `APIError` for anything else.
 */
export function parsePhoneAuthBody(path: string, body: unknown): PhoneAuthBody {
  const allowedKeys = ALLOWED_BODY_KEYS[path] ?? [];

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowedKeys.includes(key))
  ) {
    throw new APIError("BAD_REQUEST", {
      message: `Request body must be a JSON object with only: ${allowedKeys.join(", ")}.`,
      code: PHONE_AUTH_ERROR.INVALID_REQUEST,
    });
  }

  const fields = body as Record<string, unknown>;
  const phoneNumber = normalizePhoneNumber(fields.phoneNumber);

  if (phoneNumber === null) {
    throw new APIError("BAD_REQUEST", {
      message: "Enter a valid mobile number, e.g. +995 555 12 34 56.",
      code: PHONE_AUTH_ERROR.INVALID_PHONE_NUMBER,
    });
  }

  if (path !== PHONE_VERIFY_PATH) {
    return { phoneNumber, code: null };
  }

  const code = typeof fields.code === "string" ? fields.code.trim() : "";

  if (!CODE_PATTERN.test(code)) {
    throw new APIError("BAD_REQUEST", {
      message: `The code must be ${PHONE_OTP_LENGTH} digits.`,
      code: PHONE_AUTH_ERROR.INVALID_REQUEST,
    });
  }

  return { phoneNumber, code };
}

/* ------------------------------------------------------------------------- */
/* Abuse limits                                                              */
/* ------------------------------------------------------------------------- */

const MINUTE_MS = 60_000;

/**
 * Per-number and per-caller budgets, on top of the two limits Better Auth
 * applies itself (its per-IP request limiter, and `OTP_ALLOWED_ATTEMPTS` wrong
 * guesses per issued code).
 *
 * **These are weak on serverless.** `checkRateLimit` counts in process memory,
 * so each warm instance keeps its own tally and a cold start forgets it — and
 * Better Auth's limiter uses in-memory storage here too. Only the
 * attempts-per-code limit lives in the database. Before a paid SMS provider is
 * switched on, the send budget needs a shared store; until then these blunt
 * casual abuse and nothing more. `checkRateLimit` is also a no-op outside
 * production, by its own design.
 */
const SEND_LIMITS = {
  perPhoneShort: { limit: 3, windowMs: 10 * MINUTE_MS },
  perPhoneDaily: { limit: 10, windowMs: 24 * 60 * MINUTE_MS },
  perCaller: { limit: 10, windowMs: 60 * MINUTE_MS },
} as const;

const VERIFY_LIMITS = {
  perPhone: { limit: 10, windowMs: 10 * MINUTE_MS },
  perCaller: { limit: 30, windowMs: 10 * MINUTE_MS },
} as const;

/** Bucket used when no proxy header identifies the caller (e.g. local dev). */
const UNKNOWN_CALLER_KEY = "unknown-caller";

/**
 * Best-effort caller identity — the same reading of the proxy headers the
 * pricing and geocode routes use: the first `x-forwarded-for` hop is the
 * original client behind a trusted proxy (Vercel overwrites the header).
 */
function callerKey(request: Request | undefined): string {
  const firstHop = request?.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (firstHop) {
    return firstHop;
  }

  return request?.headers.get("x-real-ip")?.trim() || UNKNOWN_CALLER_KEY;
}

/** Throws a 429 once any send or verify budget for this number/caller is spent. */
export function enforcePhoneOtpLimits(
  path: string,
  phoneNumber: string,
  request: Request | undefined,
): void {
  const caller = callerKey(request);
  const allowed =
    path === PHONE_SEND_OTP_PATH
      ? checkRateLimit(
          `phone-otp:send:phone:${phoneNumber}`,
          SEND_LIMITS.perPhoneShort,
        ) &&
        checkRateLimit(
          `phone-otp:send:phone-daily:${phoneNumber}`,
          SEND_LIMITS.perPhoneDaily,
        ) &&
        checkRateLimit(`phone-otp:send:caller:${caller}`, SEND_LIMITS.perCaller)
      : checkRateLimit(
          `phone-otp:verify:phone:${phoneNumber}`,
          VERIFY_LIMITS.perPhone,
        ) &&
        checkRateLimit(
          `phone-otp:verify:caller:${caller}`,
          VERIFY_LIMITS.perCaller,
        );

  if (!allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please wait a few minutes and try again.",
      code: PHONE_AUTH_ERROR.RATE_LIMITED,
    });
  }
}

/**
 * Better Auth's own per-IP limiter, tightened for the two endpoints (the plugin
 * default is 10 a minute for both). Production only, like the rest of it.
 */
export const PHONE_AUTH_RATE_LIMIT_RULES = {
  [PHONE_SEND_OTP_PATH]: { window: 60, max: 3 },
  [PHONE_VERIFY_PATH]: { window: 60, max: 10 },
};

/* ------------------------------------------------------------------------- */
/* Plugin options                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Test-mode verification: the configured code is the only one accepted, and
 * only for a number that was sent a code which has not expired — so the app
 * exercises the same send-then-verify sequence it will in production.
 *
 * Re-resolves the delivery mode on every call instead of trusting that it was
 * installed: if this ever runs outside test mode it accepts nothing.
 */
const verifyDevOtp: NonNullable<PhoneNumberOptions["verifyOTP"]> = async (
  { phoneNumber, code },
  ctx,
) => {
  const delivery = currentOtpDelivery();

  if (delivery.mode !== "DEV_FIXED_CODE" || !ctx) {
    return false;
  }

  const pending =
    await ctx.context.internalAdapter.findVerificationValue(phoneNumber);

  if (!pending || pending.expiresAt < new Date()) {
    return false;
  }

  return code === delivery.code;
};

/**
 * `verifyOTP` replaces the plugin's own check entirely, so it is installed
 * **only** when this process booted in test mode. In every other process the
 * option is absent and the plugin verifies against the random code it stored.
 */
export const phoneNumberPluginOptions: PhoneNumberOptions = {
  otpLength: PHONE_OTP_LENGTH,
  expiresIn: OTP_EXPIRES_IN_SECONDS,
  allowedAttempts: OTP_ALLOWED_ATTEMPTS,

  // The `hooks.before` in `src/lib/auth.ts` has already normalised the number;
  // this refuses anything that reached the plugin without passing through it.
  phoneNumberValidator: isE164PhoneNumber,

  signUpOnVerification: {
    getTempEmail: placeholderEmailForPhone,
  },

  /**
   * The code is never logged, in any mode. In test mode it is simply dropped:
   * the plugin has stored its random code, and `verifyDevOtp` ignores it.
   */
  sendOTP: async ({ phoneNumber, code }) => {
    const delivery = currentOtpDelivery();

    if (delivery.mode === "DEV_FIXED_CODE") {
      return;
    }

    const sender = getSmsSender();

    if (delivery.mode === "UNCONFIGURED" || !sender) {
      throw smsNotConfigured();
    }

    await sender.send({
      to: phoneNumber,
      body: `Your verification code is ${code}. It expires in ${OTP_EXPIRES_IN_SECONDS / 60} minutes.`,
    });
  },

  ...(currentOtpDelivery().mode === "DEV_FIXED_CODE"
    ? { verifyOTP: verifyDevOtp }
    : {}),
};
