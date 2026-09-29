import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, routing } from "@/i18n/routing";
import { loadMessages } from "@/i18n/messages";

/**
 * Per-request i18n configuration, read by every `useTranslations` /
 * `getTranslations` call on the server.
 *
 * `requestLocale` is the `[locale]` segment of the matched route. It is
 * validated rather than trusted: the segment is part of the URL, so a crawler
 * or a hand-typed address can put anything there, and an unvalidated value
 * would be handed straight to `loadMessages` as a path fragment.
 *
 * An unknown locale falls back to `DEFAULT_LOCALE` here so the request still
 * renders; the route segment itself is what 404s on a bad locale, via
 * `hasLocale` in `src/app/[locale]/layout.tsx`.
 *
 * `timeZone` is pinned to Tbilisi rather than left to the server's own clock:
 * the platform operates in one country, and a Vercel region change must not
 * silently move every rendered pickup time by an hour. `now` is deliberately
 * left unset — `useNow` without it re-reads the clock, which is what the live
 * driver hub wants.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : DEFAULT_LOCALE;

  return {
    locale,
    timeZone: "Asia/Tbilisi",
    messages: await loadMessages(locale),
  };
});
