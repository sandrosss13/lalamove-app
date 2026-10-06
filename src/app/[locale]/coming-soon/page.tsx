import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveRouteLocale, type LocaleRouteParams } from "@/i18n/server";
import { LOCALE_LABELS, LOCALES, withLocalePrefix } from "@/i18n/routing";
import { ZomoLockupThemed } from "@/components/brand/zomo-logo";
import { clientOrigin } from "@/lib/host";
import { JsonLd, siteJsonLdGraph } from "@/lib/seo/json-ld";
import { alternatesFor } from "@/lib/seo/urls";
import { cn } from "@/lib/utils";

/**
 * Indexed, unlike the rest of the gated site. While `CLIENT_UNDER_CONSTRUCTION`
 * is on, this page is what `/ka` and `/en` actually serve, so it carries the
 * landing page's search presence until launch: keyword title and description,
 * and a canonical pointing at the bare locale root rather than at
 * `/coming-soon` — the URL a searcher should land on, and the one that keeps
 * its ranking when the real landing page replaces this one.
 *
 * Every other gated path still gets `X-Robots-Tag: noindex` from
 * `src/middleware.ts`, so the rewrite does not make each of them a duplicate of
 * this page in the index.
 */
export async function generateMetadata({
  params,
}: {
  params: LocaleRouteParams;
}): Promise<Metadata> {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "common.seo" });

  return {
    title: { absolute: t("comingSoon.title") },
    description: t("comingSoon.description"),
    alternates: alternatesFor(clientOrigin(), "/", locale),
    robots: { index: true, follow: true },
  };
}

/**
 * `/coming-soon` — the client host's pre-launch screen.
 *
 * Visitors do not normally arrive at this URL: while `CLIENT_UNDER_CONSTRUCTION`
 * is on, `src/middleware.ts` *rewrites* every page request on the client host
 * here, leaving the address bar on whatever they typed (see
 * `src/lib/under-construction.ts`).
 *
 * It is a dead end by design. `data-hide-site-header` hides the global header
 * from `src/app/[locale]/layout.tsx` (the rule lives in `globals.css`), so
 * nothing here links into the app — every such link would only be rewritten
 * back to this page anyway. The one control is the language switch, written as
 * plain `<a>` tags to the bare prefix (`/ka`, `/en`) rather than the
 * `LanguageToggle` component: that component is a client-side navigation that
 * swaps the prefix on the current route, and on a rewritten request "the
 * current route" is ambiguous (the visitor's URL, or `/coming-soon`?). A plain
 * document navigation to a prefixed root is unambiguous — the gate rewrites it
 * straight back here in the chosen language.
 *
 * Styled with the landing page's tokens (`bg-ink`, `text-paper`, `accent`), so
 * it follows the light/dark theme the root layout's inline script resolves,
 * and is visibly the same brand as the site that will replace it.
 */
export default async function ComingSoonPage({
  params,
}: {
  params: LocaleRouteParams;
}) {
  const locale = await resolveRouteLocale(params);
  const [t, jsonLd] = await Promise.all([
    getTranslations({ locale, namespace: "common.comingSoon" }),
    siteJsonLdGraph(clientOrigin(), locale),
  ]);

  return (
    <div
      data-landing-page=""
      data-hide-site-header=""
      className="flex min-h-screen flex-col bg-ink font-body text-paper antialiased"
    >
      <JsonLd data={jsonLd} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
        <ZomoLockupThemed className="h-7 w-auto self-start" />

        <div className="flex flex-col gap-4">
          {/* `leading-[1.15]` rather than the size's default of 1: Mkhedruli's
              deep descenders (the tail of `ლ` in `მალე`) otherwise touch the
              line below. */}
          <h1 className="font-display text-5xl leading-[1.15] font-bold tracking-tight sm:text-7xl">
            {t("heading")}
          </h1>
          <p className="max-w-md text-lg text-subtle">{t("body")}</p>
          {/* What zomo is, in the words people search for — the one line on
              this page that tells a crawler (and a visitor) what is launching. */}
          <p className="max-w-md text-sm text-faint">{t("tagline")}</p>
        </div>

        <span aria-hidden className="h-1 w-16 rounded-full bg-accent" />
      </main>

      <footer className="mx-auto w-full max-w-2xl px-6 pb-10">
        <nav aria-label={t("chooseLanguage")} className="flex gap-2">
          {LOCALES.map((option) => (
            <a
              key={option}
              href={withLocalePrefix(option, "/")}
              hrefLang={option}
              lang={option}
              aria-current={option === locale ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                option === locale
                  ? "border-line-stronger text-paper"
                  : "border-line-hairline text-faint hover:text-paper",
              )}
            >
              {LOCALE_LABELS[option]}
            </a>
          ))}
        </nav>
      </footer>
    </div>
  );
}
