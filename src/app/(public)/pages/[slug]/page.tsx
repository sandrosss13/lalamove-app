import { notFound } from "next/navigation";

import type { ContentLocale } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * The locale served when the visitor asks for nothing in particular.
 *
 * The site has no locale mechanism yet — no path prefix, no cookie, no
 * `Accept-Language` negotiation — so this route reads an optional `?locale=`
 * query parameter as a stopgap until one exists. When that mechanism lands,
 * this is the one place that has to change.
 */
const DEFAULT_LOCALE: ContentLocale = "EN";

/** `?locale=` values accepted, lowercased, mapped to the schema's enum. */
const LOCALE_BY_QUERY_VALUE: Record<string, ContentLocale> = {
  en: "EN",
  ka: "KA",
};

/**
 * Resolves `?locale=` to a `ContentLocale`, or null when the visitor asked for
 * a locale the site does not have.
 *
 * Null rather than a silent fall back to English: serving English content under
 * `?locale=fr` would tell a visitor — and a crawler — that a translation exists
 * when it does not. A repeated parameter (`?locale=ka&locale=en`) arrives as an
 * array and is treated the same way as an unknown value.
 */
function resolveLocale(
  raw: string | string[] | undefined,
): ContentLocale | null {
  if (raw === undefined) {
    return DEFAULT_LOCALE;
  }

  if (typeof raw !== "string") {
    return null;
  }

  return LOCALE_BY_QUERY_VALUE[raw.trim().toLowerCase()] ?? null;
}

/**
 * `/pages/[slug]` — the public face of the back office's Static Pages section:
 * Terms, Privacy, About and whatever else staff publish there.
 *
 * Only published rows are reachable. An unpublished page, an unknown slug and
 * an unknown locale all produce the same `notFound()`, so a draft in progress
 * is indistinguishable from a page that was never written — the URL never
 * confirms that a draft exists.
 */
export default async function StaticContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);

  const locale = resolveLocale(query.locale);

  if (locale === null) {
    notFound();
  }

  const page = await prisma.staticPage.findUnique({
    // Slugs are stored lowercase (the admin API canonicalises them), so the
    // incoming segment is lowered to match rather than 404 on `/pages/Terms`.
    where: { slug_locale: { slug: slug.toLowerCase(), locale } },
    select: { title: true, bodyHtml: true, isPublished: true },
  });

  if (!page || !page.isPublished) {
    notFound();
  }

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
