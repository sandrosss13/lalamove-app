"use client";

import {
  HubCard,
  HubEmptyState,
  HubStatusBadge,
  SampleNote,
} from "@/components/driver-hub/hub-primitives";
import {
  EMPTY_VALUE,
  formatGel,
} from "@/components/driver-hub/screens/today-format";
import type { HubTodayData } from "@/lib/dashboard/hub/today";
import { cn } from "@/lib/utils";

/**
 * "Where the demand is" — the left card of Today's second row.
 *
 * **Every value on this card is invented.** There is no `Zone` model (the
 * `GeorgianCity` enum stops at TBILISI, so "Vake · Vera" has nowhere to live),
 * no live driver-position aggregate and no surge model to set a per-job bonus.
 * One `<SampleNote />` therefore sits on the card rather than one per row:
 * the placeholder is a property of the whole table, and four identical badges
 * would drown the four rows they are meant to qualify — the same call
 * `vehicles-screen.tsx` makes for its two sampled columns.
 *
 * The freshness line is `zoneDemand.caption`, used verbatim. `sample.ts`
 * deliberately makes it a literal ("Sample snapshot") rather than the design's
 * "Updated 2 min ago": a live-looking timestamp over rows that never refresh is
 * exactly the lie the honesty rule exists to prevent, so it is not recomputed
 * here either.
 */

/** What would make this table real, named on the card's one sample badge. */
const ZONE_DEMAND_NOTE =
  "Zones, driver counts and bonuses are placeholders. Retire with a Zone " +
  "model for districts below city level and a surge model that sets the " +
  "per-job bonus; the counts then come from DriverProfile.currentLat/currentLng.";

/**
 * The handoff's row grid, verbatim: zone, driver count, demand pill, bonus.
 * A static class string rather than an inline `gridTemplateColumns` so
 * Tailwind can see the tracks at build time.
 */
const ROW_COLUMNS = "grid-cols-[1.4fr_1fr_100px_90px]";

/**
 * The brand orange, spelled out: it has no `--color-*` token, and Tailwind
 * scans source text, so a class built from a shared variable would never be
 * generated. Same approach as `vehicles-screen.tsx`.
 */
const BONUS_ACCENT = "text-[oklch(64%_0.19_48)]";

export type TodayZoneDemandCardProps = {
  /**
   * Non-null by construction: `today-screen.tsx` omits the card entirely when
   * the loader returns `null` for a ROSTER driver, rather than handing this
   * component a null it would have to render an empty state for. A card that
   * says "no zone data" under a heading promising some is worse than no card.
   */
  zoneDemand: NonNullable<HubTodayData["sampled"]["zoneDemand"]>;
  className?: string;
};

export function TodayZoneDemandCard({
  zoneDemand,
  className,
}: TodayZoneDemandCardProps) {
  const { caption, rows } = zoneDemand;

  return (
    <HubCard
      className={cn("h-full", className)}
      title="Where the demand is"
      action={
        <span className="flex flex-wrap items-center justify-end gap-2">
          {caption}
          <SampleNote note={ZONE_DEMAND_NOTE} />
        </span>
      }
    >
      {rows.length === 0 ? (
        <HubEmptyState message="No zone data to show." />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {rows.map((row) => (
            <li
              key={row.zone}
              className={cn(
                "grid items-center gap-3 border-t border-muted py-[11px]",
                ROW_COLUMNS,
              )}
            >
              <span className="truncate text-sm font-medium">{row.zone}</span>

              <span className="truncate text-xs text-muted-foreground">
                <span className="font-price">{row.driversOnline}</span> drivers
                online
              </span>

              <span>
                {/* "High" is the one demand level with a tone of its own;
                    "Medium" and "Low" fall through to neutral, which is what
                    the design shows. */}
                <HubStatusBadge status={row.level} />
              </span>

              <span
                className={cn(
                  "text-right font-price text-[13px]",
                  // The design colours a live bonus in accent and greys the
                  // dash, so the colour itself carries "there is money here".
                  row.bonusGel === null
                    ? "text-muted-foreground"
                    : BONUS_ACCENT,
                )}
              >
                {row.bonusGel === null
                  ? EMPTY_VALUE
                  : `+${formatGel(row.bonusGel)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </HubCard>
  );
}
