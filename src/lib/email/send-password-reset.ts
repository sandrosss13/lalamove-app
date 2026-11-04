/**
 * The server half of password reset by email: the gate in front of
 * `POST /api/auth/request-password-reset`, and the `sendResetPassword`
 * callback Better Auth calls behind it. The decisions themselves — who is sent
 * a link, which host it lands on, what the message says — are pure functions
 * in `@/lib/email/password-reset`; this file only looks things up and hands
 * the result to the sender. Wired in `src/lib/auth.ts`.
 */

import { APIError } from "better-auth/api";
import { createTranslator } from "next-intl";

import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/routing";
import type { Translator } from "@/i18n/translator";
import { canDeliverEmail } from "@/lib/email/delivery";
import {
  passwordResetLink,
  passwordResetSkipReason,
  renderPasswordResetEmail,
  resetLinkOrigin,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  type PasswordResetEmailCopy,
} from "@/lib/email/password-reset";
import { runAfterResponse } from "@/lib/email/run-after-response";
import {
  getEmailDelivery,
  getEmailReplyTo,
  getEmailSender,
  type EmailMessage,
} from "@/lib/email/sender";
import { clientOrigin, merchantOrigin } from "@/lib/host";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

/** Better Auth's "email me a reset link" endpoint. */
export const REQUEST_PASSWORD_RESET_PATH = "/request-password-reset";

/** Machine-readable refusal when this deployment cannot send email at all. */
export const EMAIL_NOT_CONFIGURED_CODE = "EMAIL_NOT_CONFIGURED";

/**
 * Whether the reset form may be offered. Read by the sign-in page and passed
 * down as a plain boolean — the form never learns *why*, and no part of the
 * configuration leaves the server.
 */
export function isPasswordResetAvailable(): boolean {
  return canDeliverEmail(getEmailDelivery());
}

const MINUTE_MS = 60_000;

/**
 * Per-address budget, on top of Better Auth's own per-IP rule for this path
 * (3 a minute, production only). The per-IP rule cannot stop someone spreading
 * requests across addresses' worth of IPs at one victim's inbox; this can.
 * Same honest caveat as the phone limits: in-memory, so per instance.
 */
const RESET_LIMITS = {
  perAddressShort: { limit: 3, windowMs: 30 * MINUTE_MS },
  perAddressDaily: { limit: 10, windowMs: 24 * 60 * MINUTE_MS },
} as const;

/**
 * Runs in `hooks.before` for `/request-password-reset`, before Better Auth has
 * looked the address up. Both refusals therefore answer the same for an
 * address with an account and one without — neither is an existence oracle.
 *
 * 1. Fail closed: with nothing able to deliver the link, refuse with
 *    `EMAIL_NOT_CONFIGURED` rather than let the endpoint report success for a
 *    message that will never arrive. The UI already keeps the button disabled
 *    in this state; this is the backstop for a hand-rolled request.
 * 2. Per-address throttle (see `RESET_LIMITS`).
 */
export function assertPasswordResetRequestAllowed(body: unknown): void {
  if (!isPasswordResetAvailable()) {
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "Password reset by email is not available.",
      code: EMAIL_NOT_CONFIGURED_CODE,
    });
  }

  const email = (body as { email?: unknown } | null)?.email;
  if (typeof email !== "string") {
    // Better Auth's own body validation answers this one.
    return;
  }

  const address = email.trim().toLowerCase();
  const allowed =
    checkRateLimit(
      `password-reset:address:${address}`,
      RESET_LIMITS.perAddressShort,
    ) &&
    checkRateLimit(
      `password-reset:address-daily:${address}`,
      RESET_LIMITS.perAddressDaily,
    );

  if (!allowed) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: "Too many attempts. Please wait a few minutes and try again.",
    });
  }
}

/**
 * The email's copy in `locale`, English filling any gap (see `loadMessages`).
 * A plain `createTranslator` over the catalogs rather than `getTranslations`:
 * this runs after the response (see `runAfterResponse`), and it needs no
 * request scope to work in.
 */
async function passwordResetEmailCopy(
  locale: AppLocale,
): Promise<PasswordResetEmailCopy> {
  const { loadMessages } = await import("@/i18n/messages");
  // `loadMessages` returns the merged catalog untyped, so next-intl cannot
  // infer its keys; the structural `Translator` is what every other
  // non-component caller in the app uses for the same reason.
  const t = createTranslator({
    locale,
    messages: await loadMessages(locale),
    namespace: "auth.passwordResetEmail",
  }) as unknown as Translator;
  const minutes = PASSWORD_RESET_TOKEN_TTL_SECONDS / 60;

  return {
    subject: t("subject"),
    heading: t("heading"),
    intro: t("intro"),
    button: t("button"),
    expiry: t("expiry", { minutes }),
    ignore: t("ignore"),
    linkFallback: t("linkFallback"),
    signature: t("signature"),
  };
}

/**
 * The reader's language: the one they were reading the sign-in page in (the
 * `NEXT_LOCALE` cookie, else the Referer's prefix, else Georgian). `User` has
 * no stored language, and the request is the person who will open the mail.
 * Loaded lazily, as in `localizedSignUpRefusal`, because `request-locale`
 * imports `next/headers`.
 */
async function requestLocale(request: Request | undefined): Promise<AppLocale> {
  if (!request) {
    return DEFAULT_LOCALE;
  }

  const { resolveLocaleFromHeaders } = await import("@/i18n/request-locale");

  return resolveLocaleFromHeaders(request.headers);
}

/**
 * Why the email is sent after the response (see `runAfterResponse` in
 * `@/lib/email/run-after-response`), beyond speed: Better Auth already answers
 * an unknown address and a known one with the same body, but a known one
 * would otherwise also wait for this module's lookups and a Resend round trip
 * — a timing difference large enough to tell registered addresses apart.
 * Deferred, both cost the same up to the response (bar the one token write
 * Better Auth itself does). Errors end there, logged: the caller has already
 * been told "check your email", and a failure must not become a different
 * answer for real accounts.
 */
const RESET_LOG_LABEL = "[password-reset] email not delivered:";

/**
 * Better Auth's `sendResetPassword`. Never throws for an account-specific
 * reason — every "no" is a log line and a quiet return, and the endpoint's
 * response stays the generic one. Better Auth's `url` is not used; see
 * `passwordResetLink` for why the link is rebuilt on the account's own host.
 *
 * The locale is read before deferring, while the request is certainly still
 * in hand; everything else runs after the response (see `runAfterResponse`).
 */
export async function sendPasswordResetEmail(
  { user, token }: { user: { id: string; email: string }; token: string },
  request: Request | undefined,
): Promise<void> {
  const locale = await requestLocale(request);

  await runAfterResponse(
    () => deliverPasswordReset(user, token, locale),
    RESET_LOG_LABEL,
  );
}

async function deliverPasswordReset(
  user: { id: string; email: string },
  token: string,
  locale: AppLocale,
): Promise<void> {
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      role: true,
      isSuspended: true,
      systemUserProfile: { select: { id: true } },
    },
  });

  if (!account) {
    return;
  }

  const skip = passwordResetSkipReason({
    email: user.email,
    role: account.role,
    isSuspended: account.isSuspended,
    hasSystemUserProfile: account.systemUserProfile !== null,
  });

  if (skip) {
    // The user id, not the address: logs are not where addresses belong.
    console.warn(`[password-reset] no email sent to ${user.id}: ${skip}`);
    return;
  }

  const link = passwordResetLink({
    origin: resetLinkOrigin({
      role: account.role,
      clientOrigin: clientOrigin(),
      merchantOrigin: merchantOrigin(),
    }),
    locale,
    token,
  });
  const rendered = renderPasswordResetEmail({
    copy: await passwordResetEmailCopy(locale),
    link,
    locale,
  });
  const message: EmailMessage = {
    to: user.email,
    ...rendered,
    idempotencyKey: `password-reset/${token}`,
  };
  const replyTo = getEmailReplyTo();
  if (replyTo) {
    message.replyTo = replyTo;
  }

  const sender = getEmailSender();

  if (sender) {
    await sender.send(message);
    return;
  }

  if (getEmailDelivery().mode === "DEV_CONSOLE") {
    // Development only (see `resolveEmailDelivery`): the link is printed so a
    // reset can be finished without a mail provider.
    console.warn(
      [
        "[email:dev] RESEND_API_KEY is not set — this email was NOT sent.",
        `  to:      ${message.to}`,
        `  subject: ${message.subject}`,
        `  link:    ${link}`,
      ].join("\n"),
    );
    return;
  }

  // Unreachable while `assertPasswordResetRequestAllowed` runs first; kept so
  // a configuration that changes mid-request is logged rather than silent.
  console.error(
    `[password-reset] email delivery is not configured — nothing sent to ${user.id}.`,
  );
}
