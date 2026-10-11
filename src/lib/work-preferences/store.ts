// Names Prisma columns; server code only.
import "server-only";

import type { Prisma } from "@prisma/client";

import type { WorkPreferences } from "@/lib/work-preferences/rules";

/** Exactly the columns `WorkPreferences` is built from. */
export const WORK_PREFERENCES_SELECT = {
  cities: true,
  intercity: true,
  maxTripKm: true,
  days: true,
  startMinute: true,
  endMinute: true,
  excludedHandlingTags: true,
  canBringHelper: true,
} as const;

type WorkPreferencesRow = Prisma.DriverWorkPreferencesGetPayload<{
  select: typeof WORK_PREFERENCES_SELECT;
}>;

/**
 * A stored row as the rules read it; null stays null — "never saved any",
 * which the offer matcher treats as "no preference at all".
 */
export function toWorkPreferences(
  row: WorkPreferencesRow | null,
): WorkPreferences | null {
  return row === null
    ? null
    : {
        cities: [...row.cities],
        intercity: row.intercity,
        maxTripKm: row.maxTripKm,
        days: [...row.days],
        startMinute: row.startMinute,
        endMinute: row.endMinute,
        excludedHandlingTags: [...row.excludedHandlingTags],
        canBringHelper: row.canBringHelper,
      };
}
