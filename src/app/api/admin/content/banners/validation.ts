import type { ContentLocale } from "@prisma/client";

import {
  HOME_HERO_BANNER_PLACEMENT,
  HOME_PARTNER_LOGO_BANNER_PLACEMENT,
  HOME_SECONDARY_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
  MAX_OFFER_BANNERS,
  MAX_PARTNER_LOGOS,
} from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";

/**
 * The rules both banner write paths share, in a plain sibling module rather
 * than in either `route.ts`: a route module is a Next.js entry point and must
 * not export runtime values for another route to import (the same reason
 * `@/app/api/admin/content/pages/validation` exists). The two routes keep
 * duplicating their *core* field validation on purpose; what lives here is a
 * database count, which would be genuinely wrong to write twice, and the parser
 * for the three optional card-copy fields, which both routes apply identically.
 */

type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/**
 * Length caps for the optional card copy the v4 offers row renders
 * (`home_secondary` banners). Sized to the card: a short kicker above the
 * title, a sentence or two of body, and a button label.
 */
export const BANNER_COPY_MAX_LENGTHS = {
  eyebrow: 60,
  body: 280,
  ctaLabel: 40,
} as const;

export type BannerCopyField = keyof typeof BANNER_COPY_MAX_LENGTHS;

export const BANNER_COPY_FIELDS = Object.keys(
  BANNER_COPY_MAX_LENGTHS,
) as BannerCopyField[];

/**
 * One optional copy field → the value to store.
 *
 * `null`, `undefined` and a blank string all mean "no copy" and become `null`:
 * an empty box in the admin form is not a value worth keeping, and the public
 * card checks for `null` alone. Anything stored is trimmed.
 */
export function parseBannerCopyField(
  raw: unknown,
  field: BannerCopyField,
  t: Translate,
): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined) {
    return { value: null };
  }

  if (typeof raw !== "string") {
    return {
      error: t("errors.adminContentBanners.copyFieldMustBeStringOrNull", {
        field,
      }),
    };
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return { value: null };
  }

  const max = BANNER_COPY_MAX_LENGTHS[field];
  if (trimmed.length > max) {
    return { error: t("common.shared.fieldMaxLength", { field, max }) };
  }

  return { value: trimmed };
}

/** Same cap the routes apply to `imageUrl` and `linkUrl`. */
const MAX_VIDEO_URL_LENGTH = 2048;

/**
 * Path every public object in the `site-media` bucket is served under, for
 * recognising an uploaded video's URL. Restated rather than imported because
 * `@/lib/site-media-storage` keeps it private; it is Supabase's fixed public
 * object URL shape, not something this app chooses.
 */
const SITE_MEDIA_PUBLIC_PATH = "/storage/v1/object/public/site-media/";

/**
 * Whether a string is a video source the public `<video>` may load.
 *
 * Mirrors the routes' `isUsableUrl` for `imageUrl` (a root-relative path on
 * this site, or an absolute URL — never `javascript:`/`data:`), but stricter on
 * the scheme: an off-site video must be `https:`, since a plain-`http:` source
 * on the https homepage is mixed content the browser blocks. The one `http:`
 * allowance is a `site-media` public URL, which is what a local Supabase stack
 * hands back from an upload.
 */
function isUsableVideoUrl(value: string): boolean {
  // A leading `//` is protocol-relative, i.e. off-site despite looking local.
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") {
    return true;
  }

  return (
    parsed.protocol === "http:" &&
    parsed.pathname.startsWith(SITE_MEDIA_PUBLIC_PATH)
  );
}

/**
 * `videoUrl` → the value to store. `null`, `undefined` and a blank string all
 * mean "no video" and become `null`, the same convention as the card copy.
 */
export function parseBannerVideoUrl(
  raw: unknown,
  t: Translate,
): { value: string | null } | { error: string } {
  if (raw === null || raw === undefined) {
    return { value: null };
  }

  if (typeof raw !== "string") {
    return {
      error: t("errors.adminContentBanners.videoUrlMustBeStringOrNull"),
    };
  }

  const trimmed = raw.trim();
  if (trimmed === "") {
    return { value: null };
  }

  if (trimmed.length > MAX_VIDEO_URL_LENGTH) {
    return {
      error: t("common.shared.fieldMaxLength", {
        field: "videoUrl",
        max: MAX_VIDEO_URL_LENGTH,
      }),
    };
  }

  if (!isUsableVideoUrl(trimmed)) {
    return { error: t("errors.adminContentBanners.videoUrlMustBeHttps") };
  }

  return { value: trimmed };
}

/**
 * Only the hero carousel renders a video, so a video on any other placement
 * would be stored and silently never shown. Checked against the placement the
 * row will *end up* with, so moving a banner with a video off `home_hero`
 * without clearing it is refused too. Returns the message for a 400, or `null`.
 */
export function checkBannerVideoPlacement(
  { placement, videoUrl }: { placement: string; videoUrl: string | null },
  t: Translate,
): string | null {
  if (videoUrl === null || placement === HOME_HERO_BANNER_PLACEMENT) {
    return null;
  }

  return t("errors.adminContentBanners.videoOnlyForHero", {
    placement: HOME_HERO_BANNER_PLACEMENT,
  });
}

/**
 * How many *active* banners each capped landing placement can show, and the
 * message to give when one more would not fit. Placements absent from this
 * table are uncapped.
 */
const PLACEMENT_CAPACITY: Readonly<
  Record<string, { max: number; messageKey: string }>
> = {
  [HOME_HERO_BANNER_PLACEMENT]: {
    max: MAX_HERO_BANNERS,
    messageKey: "errors.adminContentBanners.heroCarouselFull",
  },
  [HOME_SECONDARY_BANNER_PLACEMENT]: {
    max: MAX_OFFER_BANNERS,
    messageKey: "errors.adminContentBanners.offersRowFull",
  },
  [HOME_PARTNER_LOGO_BANNER_PLACEMENT]: {
    max: MAX_PARTNER_LOGOS,
    messageKey: "errors.adminContentBanners.partnerLogosFull",
  },
};

/**
 * Whether one more active banner would fit in a locale's capped landing
 * placement — the hero carousel (`MAX_HERO_BANNERS`), the offers row
 * (`MAX_OFFER_BANNERS`) or the partner marquee (`MAX_PARTNER_LOGOS`).
 *
 * Each component renders at most its cap (the loader slices too), so a banner
 * past it is invisible: it saves cleanly and does nothing, which is the one
 * failure a content editor cannot debug from the UI. This is the guard that
 * turns it into a message.
 *
 * Counted on `isActive` alone, ignoring `startsAt`/`endsAt`: a window-aware
 * count would happily accept twelve banners whose windows overlap and put the
 * page right back where it started, and the display window is a scheduling
 * tool, not a slot reservation. Excluding `ignoreId` is what lets an existing
 * banner be edited without counting itself.
 *
 * Returns `null` when there is room, or the message to return with a 409.
 */
export async function checkBannerPlacementCapacity(
  {
    locale,
    placement,
    isActive,
    ignoreId,
  }: {
    locale: ContentLocale;
    placement: string;
    isActive: boolean;
    ignoreId?: string;
  },
  t: Translate,
): Promise<string | null> {
  const capacity = Object.hasOwn(PLACEMENT_CAPACITY, placement)
    ? PLACEMENT_CAPACITY[placement]
    : undefined;

  if (!isActive || capacity === undefined) {
    return null;
  }

  const active = await prisma.banner.count({
    where: {
      locale,
      placement,
      isActive: true,
      ...(ignoreId === undefined ? {} : { id: { not: ignoreId } }),
    },
  });

  if (active < capacity.max) {
    return null;
  }

  return t(capacity.messageKey, { locale, max: capacity.max });
}
