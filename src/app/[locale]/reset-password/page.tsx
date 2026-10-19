import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { resolveRouteLocale, type LocaleRouteParams } from "@/i18n/server";

/**
 * Never indexed, and — unlike sign-in — not followed either: the URL carries a
 * live reset token, and nothing on the page is worth a crawler's visit.
 */
export async function generateMetadata({
  params,
}: {
  params: LocaleRouteParams;
}): Promise<Metadata> {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "common.seo" });

  return {
    title: t("resetPassword.title"),
    description: t("resetPassword.description"),
    robots: { index: false, follow: false },
    // The token is in the query string; keep it out of the Referer sent to
    // anything this page loads.
    referrer: "no-referrer",
  };
}

/** Better Auth's marker for an expired, used or unknown token. */
const INVALID_TOKEN_ERROR = "INVALID_TOKEN";

/**
 * Where an emailed reset link ends up, after Better Auth's
 * `GET /api/auth/reset-password/:token` has checked the token and redirected
 * here with `?token=…` (still valid) or `?error=INVALID_TOKEN` (expired or
 * used). See `@/lib/email/password-reset` for how the link is built — on the
 * host that serves the account, in the reader's language.
 *
 * Routing: like `/sign-in` and `/change-password`, this path is not classified
 * by `src/middleware.ts`, so it is served on the client and merchant hosts
 * alike, and bounced off the admin host (back-office accounts are never sent
 * a link). Under `CLIENT_UNDER_CONSTRUCTION` the client host rewrites it to
 * "coming soon" exactly as it does `/sign-in` — consistent, because a client
 * could not sign in there afterwards anyway — while the merchant host, where
 * driver and company links land, is never gated.
 *
 * A repeated or missing `token` is treated as no token: two tokens is a
 * hand-edited URL, and guessing which one was meant would only fail later.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token =
    params.error === INVALID_TOKEN_ERROR || typeof params.token !== "string"
      ? null
      : params.token.trim() || null;

  return <ResetPasswordForm token={token} />;
}
