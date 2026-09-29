import { notFound } from "next/navigation";

import { resolveContentLocale, type LocaleRouteParams } from "@/i18n/server";
import { prisma } from "@/lib/prisma";

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
}: {
  params: LocaleRouteParams & Promise<{ slug: string }>;
}) {
  // One `params` promise carries both segments, so the locale is validated (and
  // 404s when unknown) by the same call that reads it. The old `?locale=` form
  // had to hand-roll that check; the prefix gets it from the route.
  const [locale, { slug }] = await Promise.all([
    resolveContentLocale(params),
    params,
  ]);

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
