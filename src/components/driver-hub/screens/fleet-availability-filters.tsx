"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react";

import {
  AVAILABILITY_STATUS,
  AVAILABILITY_STATUS_ORDER,
  CAPACITY_BUCKETS,
  ZOOM_STEPS,
  formatHour,
} from "@/components/driver-hub/screens/fleet-availability-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HubAvailabilityStatus } from "@/lib/dashboard/hub/fleet-availability";
import { toHubDayKey } from "@/lib/dashboard/hub/timezone";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { cn } from "@/lib/utils";

/**
 * The Fleet Availability board's control block: the day, the visible window,
 * the five narrowing filters, the driver search, the plate search, the zoom,
 * and the legend that reads the result back.
 *
 * ## Stateless on purpose
 *
 * Every value here is a prop and every change is a callback. The card above
 * (`fleet-availability-card.tsx`) owns the whole filter tuple because three
 * other things read it: the board's geometry, the summary line, and the export
 * dialog's row count. A filter that lived here would have to be lifted the
 * first time any of those needed it, and the export would be free to disagree
 * with the screen — which is the one failure this section cannot have, since a
 * dispatcher acts on the spreadsheet.
 *
 * The single exception is the driver combobox's *substring match*, which is
 * computed here. That is a view of `driverOptions` and `driverQuery`, not a
 * piece of state: it never outlives a keystroke and nothing else reads it.
 *
 * ## Why the colours are variables and the widths are classes
 *
 * The status swatches are painted from `AVAILABILITY_STATUS`, whose values are
 * `var(--hub-avail-*)` names defined twice in `globals.css` — once per theme.
 * The handoff's literal `#eef7f1` fills are deliberately not used: this app has
 * an app-wide light/dark toggle, and a pale tint carrying dark text becomes an
 * unreadable white smear the moment `html.dark` is set. They therefore arrive
 * as inline styles (a CSS variable is not a class Tailwind could scan).
 *
 * The control widths, by contrast, are the handoff's fixed pixel values and
 * never vary at runtime, so they stay as ordinary arbitrary-value classes that
 * Tailwind sees at build time. Anything data-driven in this section is an
 * inline style; anything constant is a class. That split is the rule the board
 * file follows too.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/** The sentinel every "no filter" select carries, per the handoff. */
export const ALL_FILTER_VALUE = "ALL";

/** One driver in the searchable combobox. */
export type DriverFilterOption = {
  /** `HubAvailabilityRow.driverId`. */
  id: string;
  name: string;
  /**
   * The right-hand meta on the option row — the driver's current plate, or a
   * muted note when they have no vehicle. Built by the card, because only it
   * knows whether the pairing exists.
   */
  meta: string;
};

/**
 * One legend entry, already counted and worded by the card.
 *
 * The count arrives as a **string** rather than a number because "Available"
 * does not always mean the same thing: on today it reads `{n} now`, and on any
 * other day there is no "now" to count against, so it names free stretches
 * instead. Deciding that here would put a second copy of the "is this today"
 * rule in the view layer, where it could drift from the summary line's copy.
 */
export type AvailabilityLegendEntry = {
  status: HubAvailabilityStatus;
  count: string;
};

export type FleetAvailabilityFiltersProps = {
  /** `YYYY-MM-DD`, the Tbilisi day on screen. */
  dayKey: string;
  onDayKeyChange: (dayKey: string) => void;

  fromHour: number;
  toHour: number;
  onFromHourChange: (hour: number) => void;
  onToHourChange: (hour: number) => void;

  /** `GeorgianCity` enum value, or {@link ALL_FILTER_VALUE}. */
  city: string;
  onCityChange: (city: string) => void;
  /** `VehicleClassId`, or {@link ALL_FILTER_VALUE}. */
  vehicleClass: string;
  onVehicleClassChange: (vehicleClass: string) => void;
  /** A `CAPACITY_BUCKETS` value. */
  capacity: string;
  onCapacityChange: (capacity: string) => void;
  /** A `HubAvailabilityStatus`, or {@link ALL_FILTER_VALUE}. */
  status: string;
  onStatusChange: (status: string) => void;

  /** The selected driver id, or {@link ALL_FILTER_VALUE}. */
  driverId: string;
  onDriverIdChange: (driverId: string) => void;
  /** Every driver on the *unfiltered* roster — see the combobox's comment. */
  driverOptions: readonly DriverFilterOption[];
  driverOpen: boolean;
  onDriverOpenChange: (open: boolean) => void;
  driverQuery: string;
  onDriverQueryChange: (query: string) => void;

  plate: string;
  onPlateChange: (plate: string) => void;

  /** Index into {@link ZOOM_STEPS}. */
  zoomIndex: number;
  onZoomIndexChange: (index: number) => void;

  legend: readonly AvailabilityLegendEntry[];
  /** Decimal hour of now, or `null` when the day on screen is not today. */
  nowHour: number | null;
};

/* -------------------------------------------------------------------------- */
/* Geometry constants                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The handoff's control widths, and the one rule that makes them responsive.
 *
 * `max-[720px]:w-full` is the handoff's "below ~720px stack the filter controls
 * full-width" written as a variant rather than a media query in a stylesheet.
 * It rides on the *wrapper* of each control, not the control, so a select and
 * its uppercase label stretch together.
 */
const FIELD_CLASSES = "flex min-w-0 flex-col gap-[5px] max-[720px]:w-full";

/** The uppercase 11px/600 caption above every control. */
const FIELD_LABEL_CLASSES =
  "text-[11px] font-semibold tracking-[0.04em] uppercase text-muted-foreground";

/**
 * `SelectTrigger` writes its own height as `data-[size=default]:h-8`. A bare
 * `h-9` loses to that attribute selector on specificity — the trigger keeps its
 * 32px and sits a step shorter than the `Input` beside it — so the override has
 * to be written at the same specificity. Same trap `drivers-add-panel.tsx`
 * documents for its `h-auto`.
 */
const SELECT_TRIGGER_CLASSES = "w-full data-[size=default]:h-9";

/** Hour values the From select offers: 00:00–23:00. */
const FROM_HOURS = Array.from({ length: 24 }, (_, index) => index);

/** Hour values the To select offers: 01:00–24:00. */
const TO_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);

/* -------------------------------------------------------------------------- */
/* Day arithmetic                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Steps a `YYYY-MM-DD` day key by whole days.
 *
 * Done on the *calendar* through `Date.UTC`, not on an instant in the hub's
 * zone: a day key names a date, and "the day after 2026-03-28" is a question
 * about the calendar that no time zone can change the answer to. Going via a
 * real Tbilisi instant would be more machinery for the same result, and would
 * make this function depend on the clock — so stepping back and forth across a
 * boundary could fail to round-trip.
 *
 * An unparseable key (the native date input can hand back `""` when the field
 * is cleared) is returned untouched rather than silently becoming today, so a
 * half-typed date cannot yank the board onto another day.
 */
function shiftDayKey(dayKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);

  if (match === null) {
    return dayKey;
  }

  const [, year, month, day] = match;
  const shifted = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day) + days),
  );

  return shifted.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

export function FleetAvailabilityFilters({
  dayKey,
  onDayKeyChange,
  fromHour,
  toHour,
  onFromHourChange,
  onToHourChange,
  city,
  onCityChange,
  vehicleClass,
  onVehicleClassChange,
  capacity,
  onCapacityChange,
  status,
  onStatusChange,
  driverId,
  onDriverIdChange,
  driverOptions,
  driverOpen,
  onDriverOpenChange,
  driverQuery,
  onDriverQueryChange,
  plate,
  onPlateChange,
  zoomIndex,
  onZoomIndexChange,
  legend,
  nowHour,
}: FleetAvailabilityFiltersProps) {
  // `useId` rather than literal ids: this card is rendered once today, but a
  // duplicated id breaks only the label→control association, and it breaks it
  // silently and only for screen readers. Same reasoning as `loads-filters.tsx`.
  const fieldId = React.useId();

  const pixelsPerHour = ZOOM_STEPS[zoomIndex] ?? ZOOM_STEPS[2];

  // Substring, case-insensitive, recomputed on every keystroke — the handoff's
  // "live" filtering. No debounce: the roster is one fleet's drivers (tens, not
  // thousands), so the work is a single `includes` per row and a delay would
  // only make the list feel laggy.
  const query = driverQuery.trim().toLowerCase();
  const driverMatches =
    query === ""
      ? driverOptions
      : driverOptions.filter((option) =>
          option.name.toLowerCase().includes(query),
        );

  const selectedDriver = driverOptions.find((option) => option.id === driverId);

  return (
    <div className="flex flex-col gap-[14px] rounded-xl border border-border bg-card px-4 py-[14px]">
      <div className="flex flex-wrap items-end gap-4">
        {/* ---------------------------------------------------------------- */}
        {/* Date                                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className={FIELD_CLASSES}>
          <label className={FIELD_LABEL_CLASSES} htmlFor={`${fieldId}-date`}>
            Date
          </label>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              // Spelled out rather than left to the glyph: a chevron announces
              // as nothing at all, and "previous" without a noun is a guess.
              aria-label="Previous day"
              onClick={() => onDayKeyChange(shiftDayKey(dayKey, -1))}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Input
              id={`${fieldId}-date`}
              type="date"
              value={dayKey}
              onChange={(event) => onDayKeyChange(event.target.value)}
              // `md:text-[13px]` is not redundant: `Input`'s own base classes
              // end in `md:text-sm`, which would quietly restore 14px above the
              // `md` breakpoint. Same note as `MONO_INPUT_CLASSES` in
              // `drivers-add-panel.tsx`.
              className="h-9 w-[158px] font-price text-[13px] tabular-nums max-[720px]:w-full md:text-[13px]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Next day"
              onClick={() => onDayKeyChange(shiftDayKey(dayKey, 1))}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              // `new Date()` is read inside the handler, never during render:
              // this tree server-renders and then hydrates, and a clock read at
              // render time is the classic way to get two different markups and
              // a hydration mismatch. In a click handler there is only ever a
              // browser.
              onClick={() => onDayKeyChange(toHubDayKey(new Date()))}
            >
              Today
            </Button>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Window                                                           */}
        {/* ---------------------------------------------------------------- */}
        <HourField
          id={`${fieldId}-from`}
          label="From"
          value={fromHour}
          hours={FROM_HOURS}
          onChange={onFromHourChange}
        />
        <HourField
          id={`${fieldId}-to`}
          label="To"
          value={toHour}
          hours={TO_HOURS}
          onChange={onToHourChange}
        />

        {/* ---------------------------------------------------------------- */}
        {/* Narrowing filters                                                */}
        {/* ---------------------------------------------------------------- */}
        <SelectField
          id={`${fieldId}-city`}
          label="City"
          width="w-[148px]"
          value={city}
          onChange={onCityChange}
        >
          <SelectItem value={ALL_FILTER_VALUE}>All cities</SelectItem>
          {/* All 63 `GeorgianCity` values, not the handoff's 8. The eight in
              the prototype were its own generated mock fleet, not a shortlist:
              a driver registered in Akhalkalaki would otherwise be unreachable
              by this filter while still occupying a row on the board. */}
          {GEORGIAN_CITY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id={`${fieldId}-class`}
          label="Vehicle type"
          width="w-[176px]"
          value={vehicleClass}
          onChange={onVehicleClassChange}
        >
          <SelectItem value={ALL_FILTER_VALUE}>All types</SelectItem>
          {VEHICLE_CLASSES.map((entry) => (
            <SelectItem key={entry.id} value={entry.id}>
              {entry.name}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id={`${fieldId}-capacity`}
          label="Capacity"
          width="w-[150px]"
          value={capacity}
          onChange={onCapacityChange}
        >
          {/* `CAPACITY_BUCKETS` already carries its own "Any capacity" row as
              the `ALL` bucket, so there is no separate sentinel to prepend. */}
          {CAPACITY_BUCKETS.map((bucket) => (
            <SelectItem key={bucket.value} value={bucket.value}>
              {bucket.label}
            </SelectItem>
          ))}
        </SelectField>

        <SelectField
          id={`${fieldId}-status`}
          label="Status"
          width="w-[168px]"
          value={status}
          onChange={onStatusChange}
        >
          <SelectItem value={ALL_FILTER_VALUE}>All statuses</SelectItem>
          {/* Four statuses, not the handoff's five. `Unavailable` has no source
              in this schema — there is no shift, rest or unavailability model
              to derive one from — so offering it would be a filter that can
              only ever return nothing. See the module comment on
              `@/lib/dashboard/hub/fleet-availability`. */}
          {AVAILABILITY_STATUS_ORDER.map((entry) => (
            <SelectItem key={entry} value={entry}>
              {AVAILABILITY_STATUS[entry].label}
            </SelectItem>
          ))}
        </SelectField>

        {/* ---------------------------------------------------------------- */}
        {/* Driver combobox                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className={FIELD_CLASSES}>
          <span className={FIELD_LABEL_CLASSES} id={`${fieldId}-driver-label`}>
            Driver
          </span>
          <div className="w-[200px] max-[720px]:w-full">
            <Popover open={driverOpen} onOpenChange={onDriverOpenChange}>
              <PopoverTrigger
                // A searchable list is a combobox, not a menu: `role` tells
                // assistive tech that typing narrows the choices, and Radix
                // supplies `aria-expanded` and `aria-controls` from the open
                // state. Labelled by the caption above rather than an
                // `aria-label`, so the visible word and the announced one are
                // the same string.
                role="combobox"
                aria-labelledby={`${fieldId}-driver-label`}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm font-normal outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <span className="truncate">
                  {selectedDriver?.name ?? "All drivers"}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </PopoverTrigger>
              {/* Radix portals this to `document.body`, outside the hub shell's
                  subtree — which is where `data-admin-surface` normally sits.
                  Without the attribute here the popover's `--muted`/`--accent`
                  resolve to the *landing* palette and the selected row paints
                  brand orange. Nothing errors; the colours are just quietly
                  wrong. Same trap as `drivers-add-panel.tsx`. */}
              <PopoverContent
                data-admin-surface=""
                align="start"
                className="w-64 gap-0 p-0"
              >
                <div className="border-b border-border p-2">
                  <Input
                    value={driverQuery}
                    onChange={(event) =>
                      onDriverQueryChange(event.target.value)
                    }
                    placeholder="Type a driver name"
                    // Radix moves focus to the first focusable child on open,
                    // which is this box — so the dispatcher can type
                    // immediately without a manual `autoFocus`.
                    className="h-8 w-full"
                    aria-label="Search drivers by name"
                  />
                </div>
                <div
                  role="listbox"
                  aria-labelledby={`${fieldId}-driver-label`}
                  className="max-h-[216px] overflow-auto p-1"
                >
                  {/* Always first, and always present — even when the query
                      matches no driver. The prototype hides it unless the query
                      happens to be a substring of "all drivers", which leaves a
                      mistyped search with no way back to the full board except
                      clearing the box character by character. */}
                  <DriverOptionRow
                    label="All drivers"
                    meta={`${driverOptions.length} drivers`}
                    selected={driverId === ALL_FILTER_VALUE}
                    onSelect={() => onDriverIdChange(ALL_FILTER_VALUE)}
                  />
                  {driverMatches.map((option) => (
                    <DriverOptionRow
                      key={option.id}
                      label={option.name}
                      meta={option.meta}
                      selected={option.id === driverId}
                      onSelect={() => onDriverIdChange(option.id)}
                    />
                  ))}
                  {driverMatches.length === 0 ? (
                    <p className="px-[10px] py-3 text-xs text-muted-foreground">
                      No driver matches that name.
                    </p>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Plate                                                            */}
        {/* ---------------------------------------------------------------- */}
        <div className={FIELD_CLASSES}>
          <label className={FIELD_LABEL_CLASSES} htmlFor={`${fieldId}-plate`}>
            Plate
          </label>
          <Input
            id={`${fieldId}-plate`}
            value={plate}
            // Upper-cased on the way in rather than only at match time, so the
            // box shows the dispatcher the same string the filter is using.
            // Georgian plates are upper-case; a lower-case box would look like
            // it had not registered the keystroke.
            onChange={(event) =>
              onPlateChange(event.target.value.toUpperCase())
            }
            placeholder="Search plate"
            className="h-9 w-[150px] font-price text-[13px] tabular-nums max-[720px]:w-full md:text-[13px]"
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Zoom                                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className={FIELD_CLASSES}>
          <span className={FIELD_LABEL_CLASSES}>Zoom</span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Zoom out"
              disabled={zoomIndex <= 0}
              onClick={() => onZoomIndexChange(Math.max(0, zoomIndex - 1))}
            >
              <Minus aria-hidden="true" />
            </Button>
            {/* `aria-live` because the number is the only feedback the two
                buttons give: the board's width changes, but a screen-reader
                user has no way to perceive that. */}
            <span
              aria-live="polite"
              className="min-w-[62px] text-center font-price text-xs text-muted-foreground tabular-nums"
            >
              {pixelsPerHour} px/h
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Zoom in"
              disabled={zoomIndex >= ZOOM_STEPS.length - 1}
              onClick={() =>
                onZoomIndexChange(
                  Math.min(ZOOM_STEPS.length - 1, zoomIndex + 1),
                )
              }
            >
              <Plus aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Legend                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-[18px] border-t border-border pt-3">
        {legend.map((entry) => {
          const meta = AVAILABILITY_STATUS[entry.status];

          return (
            <div key={entry.status} className="flex items-center gap-[7px]">
              <span
                aria-hidden="true"
                className="inline-block size-[14px] rounded-[4px] border-solid box-border"
                // Inline because these are CSS variable names, and a variable
                // is not something Tailwind can emit as a class.
                style={{
                  background: meta.background,
                  border: meta.border,
                }}
              />
              <span className="text-xs">{meta.label}</span>
              <span className="font-price text-xs text-muted-foreground tabular-nums">
                {entry.count}
              </span>
            </div>
          );
        })}

        {/* Omitted outright when the board is not showing today. A "Now 14:20"
            caption on Thursday's board would be a claim about a marker that is
            not drawn, and the marker is not drawn because there is no "now"
            inside that day. */}
        {nowHour === null ? null : (
          <div className="ml-auto flex items-center gap-[7px]">
            <span
              aria-hidden="true"
              className="inline-block h-[14px] w-0.5"
              style={{ background: "var(--hub-avail-now)" }}
            />
            <span className="text-xs text-muted-foreground">
              Now{" "}
              <span className="font-price tabular-nums">
                {formatHour(nowHour)}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A labelled `Select`. Six of these differ only in their options and their
 * width, so they are one component called six times rather than six near-copies
 * of the same twelve lines of Radix scaffolding.
 */
function SelectField({
  id,
  label,
  width,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  /** A literal Tailwind width class — see the file comment on the class/style split. */
  width: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className={FIELD_CLASSES}>
      <label className={FIELD_LABEL_CLASSES} htmlFor={id}>
        {label}
      </label>
      <div className={cn(width, "max-[720px]:w-full")}>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className={SELECT_TRIGGER_CLASSES}>
            <SelectValue />
          </SelectTrigger>
          {/* Portalled out of the shell, so it carries the surface flag itself
              — see the driver combobox above for what goes wrong without it.
              `max-h-72` matters here because City lists 63 rows. */}
          <SelectContent data-admin-surface="" className="max-h-72">
            {children}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * The From/To pair.
 *
 * Kept separate from {@link SelectField} rather than folded into it because its
 * value is a *number* and its options are generated, and threading a
 * number↔string conversion through the shared component would put a cast at
 * both ends of every other field for the benefit of these two.
 *
 * The clamping (`from ≤ to − 1`, `to ≥ from + 1`) lives in the card, not here:
 * each select can only see its own half of the pair, and a rule enforced in two
 * places is a rule that will eventually be enforced differently in each.
 */
function HourField({
  id,
  label,
  value,
  hours,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  hours: readonly number[];
  onChange: (hour: number) => void;
}) {
  return (
    <div className={FIELD_CLASSES}>
      <label className={FIELD_LABEL_CLASSES} htmlFor={id}>
        {label}
      </label>
      <div className="w-[104px] max-[720px]:w-full">
        <Select
          value={String(value)}
          onValueChange={(next) => onChange(Number(next))}
        >
          <SelectTrigger
            id={id}
            className={cn(SELECT_TRIGGER_CLASSES, "font-price tabular-nums")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent data-admin-surface="" className="max-h-72">
            {hours.map((hour) => (
              <SelectItem
                key={hour}
                value={String(hour)}
                className="font-price tabular-nums"
              >
                {formatHour(hour)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * One row of the driver list.
 *
 * A real `<button role="option">` rather than the prototype's clickable `div`:
 * the rows are the only way to change this filter, and a div with an `onClick`
 * is invisible to the keyboard and announces as nothing. `aria-selected` is
 * what carries the current pick to assistive tech, since the visual tell is a
 * background tint and a heavier weight.
 */
function DriverOptionRow({
  label,
  meta,
  selected,
  onSelect,
}: {
  label: string;
  meta: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-2.5 rounded-md px-[9px] py-[7px] text-left text-[13px] outline-none hover:bg-secondary focus-visible:bg-secondary",
        // `bg-secondary`, not `bg-muted` or `bg-accent`. Inside a portalled
        // surface those two resolve through the `--admin-*` fallback chain and
        // can land on the landing palette's brand orange; `--secondary` has no
        // chain and is declared to the same value as `--muted` in both themes.
        // The canonical note is at the top of `src/components/ui/button.tsx`.
        selected && "bg-secondary font-semibold",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 font-price text-[11px] text-muted-foreground tabular-nums">
        {meta}
      </span>
    </button>
  );
}
