/**
 * Password reset by email — every decision the reset flow makes, as pure
 * functions, so `tests/password-reset-email.spec.ts` can pin them without a
 * server or a database. `src/lib/auth.ts` wires them into Better Auth's
 * `emailAndPassword.sendResetPassword`.
 *
 * What Better Auth does on its own, and what this module adds on top:
 *
 * - `POST /api/auth/request-password-reset` looks the address up, mints a
 *   one-time token for a known account, calls `sendResetPassword`, and answers
 *   **the same** `{ status: true }` whether or not the account exists. It also
 *   swallows (and logs) anything `sendResetPassword` throws. Both properties
 *   are what keep the endpoint from being an account-existence oracle, and
 *   nothing here may weaken them: every refusal below is a silent "do not
 *   send", never an error, and the only error the endpoint can raise
 *   (`EMAIL_NOT_CONFIGURED`, see `auth.ts`) is decided before the lookup and is
 *   identical for every address.
 * - Who gets a link (`passwordResetSkipReason`). Three kinds of account never
 *   do:
 *     1. Phone-only driver accounts, whose address is the synthetic
 *        `…@phone.driver-app.invalid` placeholder (`@/lib/phone-auth`). It can
 *        never be delivered to, and those accounts have no password to reset —
 *        they sign in by SMS code.
 *     2. Back-office accounts — `role === "ADMIN"` *or* any account holding a
 *        `SystemUserProfile`, active or not, since the admin guard keys on the
 *        profile rather than the role. Staff passwords are reset by their
 *        administrator (the sign-in screen says so); a self-service link would
 *        make the mailbox of every staff member a way into the back office.
 *     3. Suspended accounts. `databaseHooks.session.create` refuses them a
 *        session anyway, so a new password could not get them back in — and a
 *        working reset email would read as "your account is fine". They are
 *        told nothing different from anyone else; support is the channel, as
 *        it is for the suspension itself. Lifting the suspension makes the
 *        account eligible again with no other change.
 *   An account with `mustChangePassword` (a driver whose company set a
 *   temporary password) *is* sent a link: forgetting the temporary password is
 *   exactly the case reset exists for, and following a link sent to the
 *   account's own address is at least as strong as knowing a password the
 *   company read out to them. On success the flag is cleared
 *   (`emailAndPassword.onPasswordReset` in `auth.ts`), because the temporary
 *   password it guards against no longer exists.
 * - Where the link lands (`resetLinkOrigin`, `passwordResetLink`). Better
 *   Auth's own `url` points at `BETTER_AUTH_URL` — always the client host —
 *   which would hand a driver a reset page on the host that cannot sign them
 *   in. Instead the link is built on the origin of the host that serves the
 *   account: the merchant host for DRIVER/COMPANY while the host split is on,
 *   the client host otherwise. That is the host every legitimate request comes
 *   from (the sign-in form on each host only accepts its own audience), and it
 *   is derived from configuration, never from a request header, so a spoofed
 *   `Host` cannot point the link at somebody else's site. The link still goes
 *   through Better Auth's `GET /api/auth/reset-password/:token` callback, which
 *   checks the token and redirects to the reset page with `?token=` — or with
 *   `?error=INVALID_TOKEN` when it has expired or been used — so an expired
 *   link says so before the user types a new password.
 * - The message itself (`renderPasswordResetEmail`): plain HTML plus a text
 *   part, in the reader's language, with no template library. The copy comes
 *   from the `auth.passwordResetEmail` catalog, passed in already translated.
 */

import { isPhonePlaceholderEmail } from "@/lib/phone-auth";

/**
 * How long a reset link stays valid. Thirty minutes — shorter than Better
 * Auth's one-hour default because the "Reset your password" screen has always
 * promised 30 (`signInForm.enterTheEmailOnYourAccount`), and a shorter window
 * is the safer side to make the promise true on.
 */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 30 * 60;

/** The reset page, unprefixed (`src/app/[locale]/reset-password`). */
export const RESET_PASSWORD_PAGE_PATH = "/reset-password";

/** Better Auth's token-check-then-redirect endpoint, under `/api/auth`. */
const RESET_CALLBACK_PATH = "/api/auth/reset-password";

export type PasswordResetCandidate = {
  email: string;
  role: string | null | undefined;
  isSuspended: boolean | null | undefined;
  /** Whether a `SystemUserProfile` row exists for the user, active or not. */
  hasSystemUserProfile: boolean;
};

export type PasswordResetSkipReason =
  "PHONE_PLACEHOLDER_EMAIL" | "BACK_OFFICE_ACCOUNT" | "SUSPENDED";

/** Why no link is sent to this account, or `null` when one is. */
export function passwordResetSkipReason(
  candidate: PasswordResetCandidate,
): PasswordResetSkipReason | null {
  if (isPhonePlaceholderEmail(candidate.email)) {
    return "PHONE_PLACEHOLDER_EMAIL";
  }

  if (candidate.role === "ADMIN" || candidate.hasSystemUserProfile) {
    return "BACK_OFFICE_ACCOUNT";
  }

  if (candidate.isSuspended) {
    return "SUSPENDED";
  }

  return null;
}

/** Roles whose portal is the merchant host while the split is on. */
const MERCHANT_ROLES = new Set(["DRIVER", "COMPANY"]);

/**
 * The origin a reset link is built on. `merchantOrigin` is `null` while the
 * merchant split is off — there is then one host, the client one.
 */
export function resetLinkOrigin({
  role,
  clientOrigin,
  merchantOrigin,
}: {
  role: string | null | undefined;
  clientOrigin: string;
  merchantOrigin: string | null;
}): string {
  if (merchantOrigin !== null && role && MERCHANT_ROLES.has(role)) {
    return merchantOrigin;
  }

  return clientOrigin;
}

/**
 * The link the email carries: Better Auth's callback on `origin`, which
 * redirects to `origin/<locale>/reset-password?token=…` (or `?error=…`).
 * `callbackURL` is absolute so the redirect cannot fall back to
 * `BETTER_AUTH_URL`'s host; Better Auth's origin check accepts it because both
 * hosts are in `trustedOrigins`.
 */
export function passwordResetLink({
  origin,
  locale,
  token,
}: {
  origin: string;
  locale: string;
  token: string;
}): string {
  const base = origin.replace(/\/+$/, "");
  const callbackURL = `${base}/${locale}${RESET_PASSWORD_PAGE_PATH}`;

  return `${base}${RESET_CALLBACK_PATH}/${encodeURIComponent(
    token,
  )}?callbackURL=${encodeURIComponent(callbackURL)}`;
}

/** The `auth.passwordResetEmail` catalog, already translated. */
export type PasswordResetEmailCopy = {
  subject: string;
  heading: string;
  intro: string;
  button: string;
  expiry: string;
  ignore: string;
  linkFallback: string;
  signature: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Light-theme `--landing-accent` (`src/app/globals.css`) rather than the
 * brighter `BRAND_THEME_COLOR`: white button text on `#ff5a1f` falls short of
 * WCAG AA contrast, on `#c03d09` it passes. Email clients ignore CSS
 * variables, so the value is spelled out.
 */
const ACCENT = "#c03d09";

/**
 * One table-based column, inline styles only — the subset of HTML that renders
 * the same in Gmail, Outlook and Apple Mail. Every piece of copy is escaped:
 * none of it is user input today, but the catalog is edited by hand and the
 * link is built from configuration, and an email is not the place to find out
 * one of them contained a `<`.
 */
export function renderPasswordResetEmail({
  copy,
  link,
  locale,
}: {
  copy: PasswordResetEmailCopy;
  link: string;
  locale: string;
}): RenderedEmail {
  const href = escapeHtml(link);

  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Georgian',Arial,sans-serif;color:#1c1b19;">
<tr><td style="padding:28px 32px 0;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${ACCENT};">zomo</td></tr>
<tr><td style="padding:20px 32px 0;font-size:20px;font-weight:600;line-height:1.3;">${escapeHtml(copy.heading)}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.6;">${escapeHtml(copy.intro)}</td></tr>
<tr><td style="padding:24px 32px 0;">
<a href="${href}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(copy.button)}</a>
</td></tr>
<tr><td style="padding:20px 32px 0;font-size:13px;line-height:1.6;color:#5f5a52;">${escapeHtml(copy.expiry)}</td></tr>
<tr><td style="padding:8px 32px 0;font-size:13px;line-height:1.6;color:#5f5a52;">${escapeHtml(copy.ignore)}</td></tr>
<tr><td style="padding:20px 32px 0;font-size:12px;line-height:1.6;color:#5f5a52;">${escapeHtml(copy.linkFallback)}<br><a href="${href}" style="color:${ACCENT};word-break:break-all;">${href}</a></td></tr>
<tr><td style="padding:24px 32px 28px;font-size:13px;line-height:1.6;color:#5f5a52;">${escapeHtml(copy.signature)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    copy.heading,
    "",
    copy.intro,
    "",
    `${copy.button}: ${link}`,
    "",
    copy.expiry,
    copy.ignore,
    "",
    copy.signature,
  ].join("\n");

  return { subject: copy.subject, html, text };
}
