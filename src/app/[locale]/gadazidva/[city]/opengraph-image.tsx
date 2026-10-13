import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { isCityLandingSlug } from "@/lib/seo/cities";
import {
  OG_IMAGE_ALT,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
  ogLocale,
  renderOgCard,
} from "@/lib/seo/og-template";

/**
 * Social card for a city landing page: the city's keyword as the headline, in
 * the route's language. Overrides the `[locale]` segment's generic card.
 */
export const alt = OG_IMAGE_ALT.city;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; city: string }>;
}) {
  const { locale: rawLocale, city } = await params;

  if (!isCityLandingSlug(city)) {
    notFound();
  }

  const t = await getTranslations({
    locale: ogLocale(rawLocale),
    namespace: "cityLanding",
  });

  return renderOgCard({
    headline: t(`cities.${city}.keyword`),
    subline: t("shared.og.subline"),
    host: "zomo.ge",
  });
}
