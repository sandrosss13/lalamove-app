import type { ContentLocale } from "@prisma/client";

import {
  HOME_HERO_BANNER_PLACEMENT,
  MAX_HERO_BANNERS,
} from "@/lib/admin/home-page-content";
import { prisma } from "@/lib/prisma";

/**
 * The one rule both banner write paths share, in a plain sibling module rather
 * than in either `route.ts`: a route module is a Next.js entry point and must
 * not export runtime values for another route to import (the same reason
 * `@/app/api/admin/content/pages/validation` exists). The two routes keep
 * duplicating their *field* validation on purpose; this is a database count,
 * which would be genuinely wrong to write twice.
 */

/**
 * Whether one more active hero banner would fit in a locale's carousel.
 *
 * The landing carousel renders at most `MAX_HERO_BANNERS` slides, so a seventh
 * active `home_hero` banner is invisible: it saves cleanly and does nothing,
 * which is the one failure a content editor cannot debug from the UI. This is
 * the guard that turns it into a message.
 *
 * Counted on `isActive` alone, ignoring `startsAt`/`endsAt`: a window-aware
 * count would happily accept twelve banners whose windows overlap and put the
 * page right back where it started, and the display window is a scheduling
 * tool, not a slot reservation. Excluding `ignoreId` is what lets an existing
 * hero banner be edited without counting itself.
 *
 * Returns `null` when there is room, or the message to return with a 409.
 */
export async function checkHeroBannerCapacity({
  locale,
  placement,
  isActive,
  ignoreId,
}: {
  locale: ContentLocale;
  placement: string;
  isActive: boolean;
  ignoreId?: string;
}): Promise<string | null> {
  if (!isActive || placement !== HOME_HERO_BANNER_PLACEMENT) {
    return null;
  }

  const active = await prisma.banner.count({
    where: {
      locale,
      placement: HOME_HERO_BANNER_PLACEMENT,
      isActive: true,
      ...(ignoreId === undefined ? {} : { id: { not: ignoreId } }),
    },
  });

  if (active < MAX_HERO_BANNERS) {
    return null;
  }

  return (
    `The ${locale} hero carousel already has ${MAX_HERO_BANNERS} active banners, ` +
    `which is the maximum it can show. Switch one off before adding another.`
  );
}
