import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  OG_IMAGE_ALT,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
  ogLocale,
  renderOgCard,
} from "@/lib/seo/og-template";
import { isServiceLandingSlug } from "@/lib/seo/services";

/**
 * Social card for a service landing page: the service's keyword as the
 * headline, in the route's language. Overrides the `[locale]` segment's
 * generic card.
 */
export const alt = OG_IMAGE_ALT.service;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; service: string }>;
}) {
  const { locale: rawLocale, service } = await params;

  if (!isServiceLandingSlug(service)) {
    notFound();
  }

  const t = await getTranslations({
    locale: ogLocale(rawLocale),
    namespace: "serviceLanding",
  });

  return renderOgCard({
    headline: t(`services.${service}.keyword`),
    subline: t("shared.og.subline"),
    host: "zomo.ge",
  });
}
