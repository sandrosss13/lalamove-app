import {
  OG_IMAGE_ALT,
  OG_IMAGE_CONTENT_TYPE,
  OG_IMAGE_SIZE,
  ogLocale,
  renderOgImage,
} from "@/lib/seo/og-template";

/**
 * Driver-recruitment card for `/[locale]/sign-up` — the one page indexed on
 * driver.zomo.ge. Overrides the client card from `[locale]/opengraph-image`.
 */
export const alt = OG_IMAGE_ALT.driver;
export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return renderOgImage("driver", ogLocale(locale));
}
