"use client";

import * as React from "react";

import {
  ALL_CITIES,
  MAX_WEIGHT_FILTER_KG,
  MIN_WEIGHT_FILTER_KG,
  WEIGHT_FILTER_STEP_KG,
  useLoadsBoard,
} from "@/components/driver-hub/screens/loads-context";
import { HANDLING_TAG_LABELS } from "@/components/driver-hub/screens/loads-format";
import type { HandlingTag } from "@/components/driver-hub/screens/loads-format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The load board's filter panel: two city selects, a cargo-weight ceiling, the
 * handling chips, and Reset.
 *
 * Takes no props and owns no state — every value and every setter comes from
 * `useLoadsBoard()`. The panel is one of several places a filter can be
 * changed from (the table's own controls, a future saved-search), so the state
 * lives above all of them and this is a view of it.
 *
 * Open by default, per the design: the board's first job is to let a driver
 * narrow a long list, and a collapsed panel makes that an action they have to
 * discover. `loads-screen.tsx` owns the collapse.
 */

/**
 * The three filterable handling tags — the design's deliberately narrowed set,
 * not all six `CargoHandlingTag` values.
 *
 * All six still *render* as pills on the table and drawer; only these three are
 * offered as filters. The other three (Time critical, Upright only, Heavy item)
 * describe how a load is handled rather than whether a driver can take it at
 * all, and a six-chip row would not fit the design's track without wrapping.
 *
 * Derived from `HANDLING_TAG_LABELS` rather than restating the copy, so a
 * relabelled tag is relabelled here too — and filtered in declaration order, so
 * the chips sit in the same order as the pills they filter.
 */
const FILTERABLE_TAGS: readonly HandlingTag[] = [
  "FRAGILE",
  "COLD_CHAIN",
  "HAZMAT",
];

const HANDLING_FILTER_CHIPS = HANDLING_TAG_LABELS.filter((entry) =>
  FILTERABLE_TAGS.includes(entry.value),
);

/** `1200` → `"1,200"`. Module-scope so the panel does not rebuild it per render. */
const weightFormatter = new Intl.NumberFormat("en-GB");

export function LoadsFilters() {
  const {
    fPickup,
    setFPickup,
    fDrop,
    setFDrop,
    fWeight,
    setFWeight,
    fTags,
    toggleTag,
    resetFilters,
    pickupCityOptions,
    dropCityOptions,
  } = useLoadsBoard();

  // `useId` rather than hardcoded strings: the panel is rendered once today,
  // but a duplicated id is the kind of thing that only breaks the label→control
  // association, silently, for screen readers.
  const weightId = React.useId();

  return (
    <div className="grid grid-cols-[repeat(3,minmax(180px,240px))_1fr_auto] items-end gap-4 rounded-lg border border-border bg-card p-3.5">
      <CityFilter
        label="Pick-up city"
        value={fPickup}
        onChange={setFPickup}
        options={pickupCityOptions}
      />

      <CityFilter
        label="Drop-off city"
        value={fDrop}
        onChange={setFDrop}
        options={dropCityOptions}
      />

      <div className="flex flex-col gap-1.5">
        {/* The current value lives in the label rather than beside the track:
            a range input has no visible value of its own, and the design puts
            it here. `tabular-nums` keeps the label from reflowing as the
            number's width changes while the thumb is dragged. */}
        <label
          htmlFor={weightId}
          className="text-xs text-muted-foreground tabular-nums"
        >
          Cargo weight up to {weightFormatter.format(fWeight)} kg
        </label>
        <input
          id={weightId}
          type="range"
          min={MIN_WEIGHT_FILTER_KG}
          max={MAX_WEIGHT_FILTER_KG}
          step={WEIGHT_FILTER_STEP_KG}
          value={fWeight}
          onChange={(event) => setFWeight(Number(event.target.value))}
          className="h-[34px] w-full accent-foreground"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {/* A plain span, not a `<label>`: this titles a group of buttons, and a
            label pointing at nothing is worse than no label. The group carries
            the name instead. */}
        <span className="text-xs text-muted-foreground" id={`${weightId}-tags`}>
          Special handling
        </span>
        <div
          role="group"
          aria-labelledby={`${weightId}-tags`}
          className="flex gap-1.5"
        >
          {HANDLING_FILTER_CHIPS.map(({ value, label }) => {
            const selected = fTags.includes(value);

            return (
              <button
                key={value}
                type="button"
                // `aria-pressed` rather than a checkbox role: these are toggle
                // buttons in the design and they behave like it — no form, no
                // submission, immediate effect.
                aria-pressed={selected}
                onClick={() => toggleTag(value)}
                className={cn(
                  "h-[34px] rounded-md border px-2.5 text-xs font-medium transition-colors",
                  selected
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={resetFilters}
        className="h-[34px] text-muted-foreground"
      >
        Reset
      </Button>
    </div>
  );
}

/**
 * One city select. Both are the same control over a different field, so they
 * are one component called twice rather than the same fifteen lines written
 * out twice with `pickup`/`drop` swapped through them.
 */
function CityFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (city: string) => void;
  options: readonly string[];
}) {
  const id = React.useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="h-[34px] w-full">
          <SelectValue />
        </SelectTrigger>
        {/* `data-admin-surface` is load-bearing, not decoration. Radix portals
            this content to the document body — outside `DriverHubShell`'s root,
            which is where the attribute normally sits — and without it the
            `bg-accent`/`bg-muted`/border tokens resolve to the marketing
            palette instead of the hub's. Nothing errors; the colours are just
            quietly wrong. Same precedent as `drivers-add-panel.tsx`. */}
        <SelectContent data-admin-surface="" className="max-h-72">
          <SelectItem value={ALL_CITIES}>{ALL_CITIES}</SelectItem>
          {options.map((city) => (
            <SelectItem key={city} value={city}>
              {city}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
