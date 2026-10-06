import {
  OG_IMAGE_ALT,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
  ogLocale,
  renderOgImage,
} from "@/lib/seo/og-template";

/**
 * Social card for every client page under `/[locale]` (landing, coming-soon,
 * static pages). Segments that need a different card — the driver sign-up —
 * ship their own `opengraph-image.tsx`, which Next prefers over this one.
 */
export const alt = OG_IMAGE_ALT.client;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderOgImage("client", ogLocale(locale));
}
