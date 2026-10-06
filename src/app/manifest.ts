import type { MetadataRoute } from "next";

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
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    start_url: "/",
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
