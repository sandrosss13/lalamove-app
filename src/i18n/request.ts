import { hasLocale, IntlErrorCode } from "next-intl";
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

    /**
     * A key missing from *both* catalogs is a developer mistake, and the
     * default behaviour hides it: `next-intl` logs to the console and renders
     * the dotted key, so the first person to see `auth.signIn.heading` in
     * place of a heading is a customer.
     *
     * `loadMessages` already layers English under every other locale, so this
     * fires only when the English catalog is missing the key too — a key that
     * was typed wrong, or one whose source string was never extracted into
     * `translation/*.json`. In development that should stop you: the throw is
     * immediate and names the key. In production it must not, because one bad
     * key is not worth a 500 on a page that is otherwise fine — so it is
     * logged and rendering continues with whatever `getMessageFallback`
     * returns.
     */
    onError(error) {
      if (error.code === IntlErrorCode.MISSING_MESSAGE) {
        if (process.env.NODE_ENV === "development") {
          throw error;
        }

        console.error(`[i18n] missing message: ${error.message}`);
        return;
      }

      console.error(`[i18n] ${error.message}`);
    },

    /**
     * What renders when a message is missing everywhere.
     *
     * Still the dotted key, which is `next-intl`'s own default — there is no
     * honest copy to invent for a string nobody wrote, and a humanised key
     * ("Sign In Heading") would read as real text and so hide the bug that a
     * visible key path advertises. The value here is not the string, it is
     * that `onError` above has already thrown in development and logged in
     * production by the time anyone reads it.
     */
    getMessageFallback({ namespace, key }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});
