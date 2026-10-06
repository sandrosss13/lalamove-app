import type { Metadata } from "next";

/**
 * Brand constants and the favicon/app-icon metadata shared by every surface.
 *
 * The files under `public/brand/` are the production assets from
 * `logo and brandbook/design_handoff_zomo_rebrand/` (copied unchanged, except
 * that `favicon.svg` has its C2PA metadata block stripped to keep it small).
 */

/** The brand name. Always lowercase, never translated in Latin script. */
export const BRAND_NAME = "zomo";

/** Brand orange, used as the browser/PWA theme colour. */
export const BRAND_THEME_COLOR = "#ff5a1f";

const BRAND_ASSET_DIR = "/brand";

/** Apple touch icons: customer (orange) for zomo.ge, driver (dark) for the hub. */
export const APPLE_TOUCH_ICON = {
  customer: `${BRAND_ASSET_DIR}/app-icon-customer-180.png`,
  driver: `${BRAND_ASSET_DIR}/app-icon-driver-180.png`,
} as const;

export type BrandAudience = keyof typeof APPLE_TOUCH_ICON;

/**
 * The full `icons` block for a surface. A layout that overrides `icons`
 * replaces its parent's whole object (Next merges metadata shallowly), so a
 * segment that only wants a different touch icon still has to restate the
 * favicons — hence one builder rather than two hand-kept literals.
 */
export function brandIcons(
  audience: BrandAudience,
): NonNullable<Metadata["icons"]> {
  return {
    icon: [
      { url: `${BRAND_ASSET_DIR}/favicon.svg`, type: "image/svg+xml" },
      {
        url: `${BRAND_ASSET_DIR}/favicon-32.png`,
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: `${BRAND_ASSET_DIR}/favicon-16.png`,
        type: "image/png",
        sizes: "16x16",
      },
    ],
    apple: [{ url: APPLE_TOUCH_ICON[audience], sizes: "180x180" }],
  };
}
