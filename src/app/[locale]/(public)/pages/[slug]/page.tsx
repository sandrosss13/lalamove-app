import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { resolveRouteLocale, type LocaleRouteParams } from "@/i18n/server";
import { LOCALES, toContentLocale, type AppLocale } from "@/i18n/routing";
import { clientOrigin } from "@/lib/host";
import { prisma } from "@/lib/prisma";
import { plainTextExcerpt } from "@/lib/seo/text";
import { alternatesFor } from "@/lib/seo/urls";

type StaticPageParams = LocaleRouteParams & Promise<{ slug: string }>;

/**
 * Every *published* translation of a slug, read once per request.
 *
 * Wrapped in React's `cache` so `generateMetadata` and the page share one query.
 * It reads all locales rather than just the requested one because the metadata
 * needs to know which other languages exist — an `hreflang` alternate is only
 * advertised for a translation that is actually published, never for one that
 * would 404.
 *
 * Slugs are stored lowercase (the admin API canonicalises them), so the
 * incoming segment is lowered to match rather than 404 on `/pages/Terms`.
 */
const loadPublishedTranslations = cache(async (slug: string) => {
  return prisma.staticPage.findMany({
    where: { slug, isPublished: true },
    select: { locale: true, title: true, bodyHtml: true },
  });
});

/**
 * The requested translation plus the app locales it is published in, or
 * `notFound()`. An unpublished page, an unknown slug and an unknown locale all
 * produce the same 404, so a draft in progress is indistinguishable from a page
 * that was never written — the URL never confirms that a draft exists.
 */
async function loadPage(params: StaticPageParams) {
  // One `params` promise carries both segments, so the locale is validated (and
  // 404s when unknown) by the same call that reads it.
  const [locale, { slug: rawSlug }] = await Promise.all([
    resolveRouteLocale(params),
    params,
  ]);
  const slug = rawSlug.toLowerCase();

  const translations = await loadPublishedTranslations(slug);
  const page = translations.find(
    (row) => row.locale === toContentLocale(locale),
  );

  if (!page) {
    notFound();
  }

  const publishedLocales: AppLocale[] = LOCALES.filter((option) =>
    translations.some((row) => row.locale === toContentLocale(option)),
  );

  return { locale, slug, page, publishedLocales };
}

/**
 * Title and description come from the row itself — staff write the title, and
 * the description is the opening of the body as plain text. The canonical is
 * on the client origin regardless of which host served the request: these are
 * client-facing pages.
 */
export async function generateMetadata({
  params,
}: {
  params: StaticPageParams;
}): Promise<Metadata> {
  const { locale, slug, page, publishedLocales } = await loadPage(params);

  return {
    title: page.title,
    description: plainTextExcerpt(page.bodyHtml),
    alternates: alternatesFor(
      clientOrigin(),
      `/pages/${slug}`,
      locale,
      publishedLocales,
    ),
  };
}

/**
 * `/pages/[slug]` — the public face of the back office's Static Pages section:
 * Terms, Privacy, About and whatever else staff publish there.
 */
export default async function StaticContentPage({
  params,
}: {
  params: StaticPageParams;
}) {
  const { page } = await loadPage(params);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>

      {/* Trusted content: `bodyHtml` can only be written through
          /admin/content/pages, which requires an active SystemUserProfile with
          the SUPER_ADMIN or CONTENT_MANAGER role. It is authored markup, never
          user submission, so it is rendered rather than escaped. */}
      <div
        className="flex flex-col gap-4 text-sm leading-relaxed [&_a]:underline [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-medium [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc"
        dangerouslySetInnerHTML={{ __html: page.bodyHtml }}
      />
    </main>
  );
}
