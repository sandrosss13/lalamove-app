"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  FilterStrip,
  HubCard,
  type FilterStripItem,
} from "@/components/driver-hub/hub-primitives";
import { EarningsExportButton } from "@/components/driver-hub/screens/earnings-export-button";
import { Input } from "@/components/ui/input";
import type {
  HubEarningsPreset,
  ResolvedHubEarningsRange,
} from "@/lib/dashboard/hub/earnings";
import { cn } from "@/lib/utils";

/**
 * The Earnings screen's range control: four preset tabs, a Custom tab, two date
 * fields, the range caption and the export button.
 *
 * **The range lives in the URL, not in this component.** Every control here
 * ends in a `router.push` of the same route with new query params; Next
 * re-renders the page on the server and every tile, bar and breakdown line
 * comes back recomputed by `getHubEarnings`. That is what makes a range
 * shareable and bookmarkable, makes the browser's Back button step through the
 * ranges a driver looked at, and guarantees the export button is pointing at
 * exactly the window on screen — the same reasoning the back office's
 * `date-range-picker.tsx` states, and the reason `earnings.ts` is a server
 * module with no client fetching.
 *
 * The push runs inside a transition so the current figures stay on screen
 * (marked `aria-busy`) rather than blanking while the server works.
 *
 * Nothing is validated here beyond "is this a `YYYY-MM-DD` at all": the URL is
 * hand-editable regardless, so `resolveHubEarningsRange` is the one place that
 * decides what a pair of dates means, and it corrects inverted and over-long
 * ranges on the server where a hand-typed URL is corrected too.
 */

/** The tab the design shows selected whenever the dates did not come from a preset. */
const CUSTOM_TAB: FilterStripItem = { value: "custom", label: "Custom" };

/** The three params this bar owns; anything else in the URL is left alone. */
const RANGE_PARAMS = ["preset", "from", "to"] as const;

/** `YYYY-MM-DD`, the only shape worth putting in the URL. */
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The design's date field: mono 12px, 7×9 padding, 6px radius — and dimmed to
 * 55% while a preset is driving the range, so the fields read as a readout of
 * the preset rather than as the control in charge.
 *
 * The dimming lifts on focus: at 55% the text fails contrast, and the moment
 * someone is actually editing the field is the moment they need to read it.
 */
const DATE_INPUT_CLASSES =
  "h-auto w-auto rounded-md border-border px-[9px] py-[7px] font-price text-xs md:text-xs";

export type EarningsFilterBarProps = {
  /** The range the page resolved and rendered every other figure from. */
  range: ResolvedHubEarningsRange;
  /**
   * The loader's own preset list, so the strip can never offer a tab that
   * `resolveHubEarningsRange` does not resolve.
   *
   * Handed down from the page rather than imported here: it is exported by a
   * `server-only` module, and importing the value (rather than the type) would
   * pull Prisma into the browser bundle — which the build refuses outright.
   */
  presets: readonly HubEarningsPreset[];
};

export function EarningsFilterBar({ range, presets }: EarningsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const custom = range.preset === CUSTOM_TAB.value;

  // Memoised so `FilterStrip` is handed a stable list rather than a new array
  // on every render of this bar.
  const tabs = React.useMemo<readonly FilterStripItem[]>(
    () => [
      ...presets.map((preset) => ({ value: preset.id, label: preset.label })),
      CUSTOM_TAB,
    ],
    [presets],
  );

  /**
   * The current query string with this bar's three params cleared, ready for
   * whichever one the caller is about to set. Built from the live params rather
   * than from scratch so a param this screen does not own survives the push.
   */
  const clearedParams = React.useCallback((): URLSearchParams => {
    const params = new URLSearchParams(searchParams.toString());

    for (const name of RANGE_PARAMS) {
      params.delete(name);
    }

    return params;
  }, [searchParams]);

  const navigate = React.useCallback(
    (params: URLSearchParams) => {
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router],
  );

  const applyDates = React.useCallback(
    (from: string, to: string) => {
      const params = clearedParams();

      // Dates only, never alongside `preset`: the loader gives dates
      // precedence, and leaving a stale preset in the URL would mean a
      // shared link whose selected tab contradicts its own dates.
      params.set("from", from);
      params.set("to", to);
      navigate(params);
    },
    [clearedParams, navigate],
  );

  function handleTabChange(value: string): void {
    // Custom is not a resolvable preset — it is "stop letting a preset drive
    // this". Re-pushing the range as explicit dates is what switches the
    // loader into custom mode while keeping the window the driver is looking
    // at, and it is what un-dims the two fields.
    if (value === CUSTOM_TAB.value) {
      applyDates(range.from, range.to);
      return;
    }

    if (!presets.some((preset) => preset.id === value)) {
      return;
    }

    const params = clearedParams();
    params.set("preset", value);
    navigate(params);
  }

  function handleDateChange(field: "from" | "to", value: string): void {
    // A cleared or half-typed field fires `change` with "" or with a partial
    // value; there is no range to navigate to yet, so nothing happens until it
    // is a whole date.
    if (!DATE_PARAM_PATTERN.test(value)) {
      return;
    }

    applyDates(
      field === "from" ? value : range.from,
      field === "to" ? value : range.to,
    );
  }

  return (
    <HubCard
      className="px-[18px] py-4"
      contentClassName="flex flex-wrap items-center justify-between gap-x-4 gap-y-3"
      aria-busy={isPending}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <FilterStrip
          items={tabs}
          value={range.preset}
          onChange={handleTabChange}
          ariaLabel="Earnings date range"
        />

        <div className="flex items-center gap-2">
          {/* Uncontrolled, keyed on the resolved value. A controlled field
              would snap back to the old date for as long as the server takes
              to answer, since its `value` only changes once the new range has
              been resolved; keying on that value instead lets the browser keep
              what was picked and remounts the field if the server corrects it
              (an inverted or over-long range comes back normalised). */}
          <Input
            key={`from-${range.from}`}
            type="date"
            defaultValue={range.from}
            aria-label="Range start date"
            onChange={(event) => handleDateChange("from", event.target.value)}
            className={cn(
              DATE_INPUT_CLASSES,
              !custom && "opacity-55 focus-visible:opacity-100",
            )}
          />
          <span className="text-[13px] text-muted-foreground">to</span>
          <Input
            key={`to-${range.to}`}
            type="date"
            defaultValue={range.to}
            aria-label="Range end date"
            onChange={(event) => handleDateChange("to", event.target.value)}
            className={cn(
              DATE_INPUT_CLASSES,
              !custom && "opacity-55 focus-visible:opacity-100",
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-price">{range.from}</span> →{" "}
          <span className="font-price">{range.to}</span> ·{" "}
          <span className="font-price">{range.days}</span>{" "}
          {range.days === 1 ? "day" : "days"}
        </p>

        <EarningsExportButton from={range.from} to={range.to} />
      </div>
    </HubCard>
  );
}
