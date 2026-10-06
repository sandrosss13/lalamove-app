import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

import { DEFAULT_LOCALE } from "@/i18n/routing";
import { BRAND_NAME, BRAND_THEME_COLOR } from "@/lib/brand";

/**
 * The web app manifest, served at `/manifest.webmanifest` (Next links it from
 * every page). It lives outside `[locale]` because it is one file for both
 * languages, and `src/middleware.ts` excludes its path from locale routing so
 * it is not redirected to `/ka/manifest.webmanifest`, where nothing is mounted.
 *
 * Customer icons on every host: a manifest cannot vary per subdomain without
 * reading the request, and the driver hub's home-screen icon is already
 * overridden by its apple-touch-icon (`dashboard/layout.tsx`).
 *
 * One file for both languages means one language for its text: Georgian, the
 * platform's default, declared in `lang` so the description is read as such.
 * `id` pins the app's identity to `/` so it survives a later `start_url` change.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({
    locale: DEFAULT_LOCALE,
    namespace: "common.seo",
  });

  return {
    id: "/",
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: t("home.description"),
    lang: DEFAULT_LOCALE,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: BRAND_THEME_COLOR,
    icons: [
      {
        src: "/brand/app-icon-customer-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/app-icon-customer-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
