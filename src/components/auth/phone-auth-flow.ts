/**
 * The pure half of phone sign-up / sign-in on the website: which method a form
 * opens on, how a typed code is cleaned, what each server refusal means to the
 * person looking at the screen, and the request headers the two endpoints read.
 *
 * No runtime imports beyond other import-free modules, so
 * `tests/auth-phone-method.spec.ts` pins every rule here without a browser, a
 * server or a database. The network calls that use these live next door in
 * `phone-otp-client.ts`, and the screens in `phone-code-step.tsx`.
 *
 * The server side of the contract is `src/lib/phone-auth.ts` (body checks,
 * intent, error codes) and `src/lib/auth.ts` (role / host checks, account
 * creation). What this module restates from there is restated on purpose and
 * kept to names and codes — anything that decides *whether* a request is
 * allowed stays on the server.
 */

import type { AccountType } from "@/lib/account-types";
import type {
  PhoneAuthEmailHeader,
  PhoneAuthIntent,
  PhoneAuthIntentHeader,
  PhoneAuthRole,
  PhoneAuthRoleHeader,
} from "@/lib/mobile-api/contracts";
import { PHONE_OTP_LENGTH } from "@/lib/sms/otp-delivery";

/* -------------------------------------------------------------------------- */
/* Roles                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The two step-1 cards. Restated rather than imported from `@/lib/auth-flow`
 * because that module pulls in `next-intl` for its hooks, and this one has to
 * stay importable from a plain Node test.
 */
export type PhoneFlowRole = "CLIENT" | "DRIVER";

/**
 * Every portal the two picks can resolve to — the value of the
 * `x-phone-auth-role` header, and the role a phone sign-up creates.
 */
export type PortalRole = PhoneFlowRole | "COMPANY";

// Compile-time check that this set and the contract's `x-phone-auth-role`
// values are the same three roles.
const PORTAL_ROLES_MATCH_CONTRACT: [PortalRole] extends [PhoneAuthRole]
  ? [PhoneAuthRole] extends [PortalRole]
    ? true
    : never
  : never = true;
void PORTAL_ROLES_MATCH_CONTRACT;

/**
 * The Driver card plus the Business account type is a logistics company; every
 * other pair is the card's own role. The same resolution both forms already
 * make for the email path, in one place so the phone path cannot disagree.
 */
export function resolvePortalRole(
  role: PhoneFlowRole,
  accountType: AccountType,
): PortalRole {
  return role === "DRIVER" && accountType === "BUSINESS" ? "COMPANY" : role;
}

/* -------------------------------------------------------------------------- */
/* Which method a form opens on                                               */
/* -------------------------------------------------------------------------- */

/** The two ways into an account. Every account type may use either. */
export type AuthMethod = "phone" | "email";

/**
 * The method step 3 opens on, per account type — the product owner's table:
 *
 * | Card   | Account type            | Opens on      |
 * | ------ | ----------------------- | ------------- |
 * | Driver | Individual              | phone         |
 * | Driver | Individual entrepreneur | phone         |
 * | Driver | Business (= company)    | email         |
 * | Client | Business                | email         |
 * | Client | Individual              | `null` — none |
 *
 * Only the *default* differs; both methods stay one tap away on every row. A
 * person driving their own van signs in from a phone on the road, so the code
 * comes first; a company is an office with a shared mailbox, so the address
 * does. An individual client could be either, and the owner asked for them to
 * choose rather than be steered — `null` is that: the switch renders with
 * neither side selected and no fields beneath it until one is picked.
 *
 * Sign-up and sign-in share the table. The owner ruled out opening an
 * individual client's sign-in on phone, and a neutral choice is as feasible
 * there as on sign-up, so sign-in gets the same `null` rather than a silent
 * fall-back to email.
 */
export function defaultAuthMethod(
  role: PhoneFlowRole,
  accountType: AccountType,
): AuthMethod | null {
  if (accountType === "BUSINESS") {
    return "email";
  }

  if (role === "DRIVER") {
    return "phone";
  }

  // CLIENT + INDIVIDUAL. (CLIENT + INDIVIDUAL_ENTREPRENEUR is not a state step
  // 2 can produce; it falls here too, which is the cautious answer.)
  return null;
}

/** Narrows a Tabs `onValueChange` string to a method, ignoring anything else. */
export function parseAuthMethod(value: string): AuthMethod | null {
  return value === "phone" || value === "email" ? value : null;
}

/* -------------------------------------------------------------------------- */
/* The code                                                                   */
/* -------------------------------------------------------------------------- */

/** Digits in every code. The server's own constant, so the two cannot drift. */
export const PHONE_CODE_LENGTH = PHONE_OTP_LENGTH;

/**
 * What the code input keeps of whatever was typed or pasted: digits only, at
 * most `PHONE_CODE_LENGTH` of them.
 *
 * A pasted SMS line ("Your verification code is 123 456.") or a code copied
 * with a stray space is the normal case, not the edge one — so non-digits are
 * dropped rather than refused. The cut is taken *after* filtering, so a paste
 * of the whole message still yields the six digits it carries.
 */
export function sanitizePhoneCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, PHONE_CODE_LENGTH);
}

/** True once the input holds a full code — what enables the Verify button. */
export function isCompletePhoneCode(code: string): boolean {
  return new RegExp(`^\\d{${PHONE_CODE_LENGTH}}$`).test(code);
}

/* -------------------------------------------------------------------------- */
/* Resend cooldown                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Seconds before "Resend code" comes back after a send.
 *
 * The server's per-IP limiter allows three sends a minute and the per-number
 * one three per ten minutes (`src/lib/phone-auth.ts`), so a button that let
 * someone fire three resends in as many seconds would only spend their budget
 * and land them on a "too many attempts" wall. A minute is also about how long
 * an SMS can genuinely take to arrive.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Whole seconds left on the cooldown at `now`, never negative. Rounded up so
 * the countdown reads "1" — not "0" — during its last second.
 */
export function resendSecondsLeft(sentAtMs: number, nowMs: number): number {
  const remainingMs = sentAtMs + RESEND_COOLDOWN_SECONDS * 1000 - nowMs;
  return remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 1000);
}

/* -------------------------------------------------------------------------- */
/* Request headers                                                            */
/* -------------------------------------------------------------------------- */

/** Names the screen a verify came from. Typed against the native contract. */
export const PHONE_AUTH_INTENT_HEADER: PhoneAuthIntentHeader =
  "x-phone-auth-intent";

/**
 * The portal the request is for. Always sent from the website: for a number
 * with no account it decides which host may create it and with which role.
 *
 * The three names are typed against the contract's literal types (type-only
 * imports, so this module stays runtime-import-free for its spec) rather than
 * importing the contract's runtime constants.
 */
export const PHONE_AUTH_ROLE_HEADER: PhoneAuthRoleHeader = "x-phone-auth-role";

/**
 * The optional address a phone sign-up gives. Sent on send-otp too, so an
 * address that is malformed or already taken is refused *before* an SMS is
 * paid for, not after the person has typed the code.
 */
export const PHONE_AUTH_EMAIL_HEADER: PhoneAuthEmailHeader =
  "x-phone-auth-email";

export type PhoneAuthHeaderInput = {
  role: PortalRole;
  /** Verify only — send-otp has no use for it. */
  intent?: PhoneAuthIntent;
  /** Sign-up only. Blank or absent means "no email"; it is then not sent. */
  email?: string | null;
};

/**
 * The headers for one send or verify. The body carries only the documented
 * keys (the server refuses any other), which is why everything else travels
 * here.
 */
export function phoneAuthHeaders({
  role,
  intent,
  email,
}: PhoneAuthHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [PHONE_AUTH_ROLE_HEADER]: role,
  };

  if (intent) {
    headers[PHONE_AUTH_INTENT_HEADER] = intent;
  }

  const trimmedEmail = email?.trim() ?? "";
  if (trimmedEmail.length > 0) {
    headers[PHONE_AUTH_EMAIL_HEADER] = trimmedEmail;
  }

  return headers;
}

/* -------------------------------------------------------------------------- */
/* What a refusal means on screen                                             */
/* -------------------------------------------------------------------------- */

/**
 * Message keys in the `auth.phoneAuth` namespace, one per thing the person can
 * be told. Several server codes share one: the person's next move after "no
 * code pending" and "code expired" is the same — get a new code — so they read
 * the same.
 */
export type PhoneAuthErrorKey =
  | "errorInvalidCode"
  | "errorCodeExpired"
  | "errorTooManyAttempts"
  | "errorSmsUnavailable"
  | "errorInvalidPhone"
  | "errorInvalidRequest"
  | "errorRateLimited"
  | "errorSignUpHostNotAllowed"
  | "errorAccountNotFound"
  | "errorInvalidEmail"
  | "errorEmailTaken"
  | "errorAccountSuspended"
  | "errorNetwork"
  | "errorGeneric";

/**
 * What the screen offers alongside the message:
 *
 * - `signUp` — a link into sign-up (a number with no account, on sign-in).
 * - `driverSite` — a link to the merchant host, the only place drivers and
 *   companies can be created.
 * - `resend` — the current code is spent; the message says to get a new one,
 *   and the code input is cleared.
 * - `none` — retrying as-is is the answer.
 */
export type PhoneAuthRecovery = "signUp" | "driverSite" | "resend" | "none";

/**
 * Which part of the form the refusal is about: the code input, the number, the
 * optional email, or nothing in particular (a form-level alert).
 */
export type PhoneAuthErrorTarget = "code" | "phone" | "email" | "form";

export type PhoneAuthFailure = {
  messageKey: PhoneAuthErrorKey;
  recovery: PhoneAuthRecovery;
  target: PhoneAuthErrorTarget;
};

const FAILURES_BY_CODE = {
  // The plugin's own four.
  INVALID_OTP: {
    messageKey: "errorInvalidCode",
    recovery: "none",
    target: "code",
  },
  OTP_NOT_FOUND: {
    messageKey: "errorCodeExpired",
    recovery: "resend",
    target: "code",
  },
  OTP_EXPIRED: {
    messageKey: "errorCodeExpired",
    recovery: "resend",
    target: "code",
  },
  TOO_MANY_ATTEMPTS: {
    messageKey: "errorTooManyAttempts",
    recovery: "resend",
    target: "code",
  },
  // This app's.
  SMS_NOT_CONFIGURED: {
    messageKey: "errorSmsUnavailable",
    recovery: "none",
    target: "form",
  },
  INVALID_PHONE_NUMBER: {
    messageKey: "errorInvalidPhone",
    recovery: "none",
    target: "phone",
  },
  INVALID_REQUEST: {
    messageKey: "errorInvalidRequest",
    recovery: "none",
    target: "form",
  },
  RATE_LIMITED: {
    messageKey: "errorRateLimited",
    recovery: "none",
    target: "form",
  },
  SIGN_UP_HOST_NOT_ALLOWED: {
    messageKey: "errorSignUpHostNotAllowed",
    recovery: "driverSite",
    target: "form",
  },
  // The code was right and is now spent, so a sign-up needs a fresh one —
  // which the sign-up form sends itself.
  PHONE_ACCOUNT_NOT_FOUND: {
    messageKey: "errorAccountNotFound",
    recovery: "signUp",
    target: "form",
  },
  INVALID_EMAIL: {
    messageKey: "errorInvalidEmail",
    recovery: "none",
    target: "email",
  },
  EMAIL_TAKEN: {
    messageKey: "errorEmailTaken",
    recovery: "none",
    target: "email",
  },
  ACCOUNT_SUSPENDED: {
    messageKey: "errorAccountSuspended",
    recovery: "none",
    target: "form",
  },
} satisfies Record<string, PhoneAuthFailure>;

/** A refusal code this module knows how to explain. */
type KnownPhoneAuthCode = keyof typeof FAILURES_BY_CODE;

function isKnownPhoneAuthCode(code: string): code is KnownPhoneAuthCode {
  return Object.hasOwn(FAILURES_BY_CODE, code);
}

const GENERIC_FAILURE: PhoneAuthFailure = {
  messageKey: "errorGeneric",
  recovery: "none",
  target: "form",
};

/**
 * Maps a refusal to what the screen shows. `code` is the JSON body's `code`
 * (absent when the body was not JSON); `status` is the HTTP status, or `null`
 * when the request never got an answer.
 *
 * Better Auth's own per-IP limiter answers 429 with **no** `code`, so the
 * status is the fallback for that one. Anything unrecognised is the generic
 * "something went wrong" rather than the server's English `message`: every
 * string on this screen has a Georgian twin, and a raw server message would be
 * the one that does not.
 */
export function phoneAuthFailure(
  code: string | null | undefined,
  status: number | null,
): PhoneAuthFailure {
  if (code && isKnownPhoneAuthCode(code)) {
    return FAILURES_BY_CODE[code];
  }

  if (status === null) {
    return { messageKey: "errorNetwork", recovery: "none", target: "form" };
  }

  if (status === 429) {
    return FAILURES_BY_CODE.RATE_LIMITED;
  }

  return GENERIC_FAILURE;
}

/** Every key `phoneAuthFailure` can return — for the catalog parity spec. */
export const PHONE_AUTH_ERROR_KEYS: readonly PhoneAuthErrorKey[] = [
  ...new Set([
    ...Object.values(FAILURES_BY_CODE).map((failure) => failure.messageKey),
    "errorNetwork",
    "errorGeneric",
  ] as PhoneAuthErrorKey[]),
];

/* -------------------------------------------------------------------------- */
/* Display                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `+995555123456` → `+995 555 12 34 56`, the grouping the phone field's
 * placeholder uses, for the "we sent a code to …" line. Anything that is not a
 * twelve-digit Georgian number is returned as given.
 */
export function formatPhoneForDisplay(e164: string): string {
  const match = /^\+995(\d{3})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return match ? `+995 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : e164;
}
