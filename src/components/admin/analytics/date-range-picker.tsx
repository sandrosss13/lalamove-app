"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Hoisted so re-renders don't rebuild them on every keystroke of navigation. */
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const dayWithYearFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * A `YYYY-MM-DD` param as local midnight.
 *
 * The explicit `T00:00:00` matters: a bare date string is specified to parse as
 * UTC, which would render as the *previous* day for anyone behind Greenwich and
 * so disagree with the server that produced the param. Both sides construct the
 * date the same way, so server render and hydration agree.
 *
 * The server hands these props down already canonicalised by
 * `resolveSalesRange`, so no validation is repeated here.
 */
function parseDateParam(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/** Local midnight formatted back into a `YYYY-MM-DD` param. */
function toDateParam(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/** Monday of `date`'s week. */
function startOfWeek(date: Date): Date {
  // `getDay()` is 0 for Sunday, so shift it to make Monday the 0th weekday —
  // a delivery business reads its week Monday-first.
  const offset = (date.getDay() + 6) % 7;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
}

/** The 1st of `date`'s month. */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * The three quick ranges, all ending *today* rather than at the end of the
 * calendar period: nothing is booked in the future, so a week- or month-to-date
 * window is the one that carries information, and the trigger label then never
 * advertises days that cannot have data.
 *
 * `today` is passed in (from the server) rather than read from `new Date()`
 * here — see `ResolvedSalesRange.todayParam`.
 */
const SHORTCUTS: {
  id: string;
  label: string;
  resolve: (today: Date) => { from: Date; to: Date };
}[] = [
  {
    id: "today",
    label: "Today",
    resolve: (today) => ({ from: today, to: today }),
  },
  {
    id: "week",
    label: "This Week",
    resolve: (today) => ({ from: startOfWeek(today), to: today }),
  },
  {
    id: "month",
    label: "This Month",
    resolve: (today) => ({ from: startOfMonth(today), to: today }),
  },
];

/** "Aug 3 – Aug 11, 2026", collapsing to one date when the range is a day. */
function formatRangeLabel(from: Date, to: Date): string {
  if (from.getTime() === to.getTime()) {
    return dayWithYearFormatter.format(from);
  }

  return `${dayFormatter.format(from)} – ${dayWithYearFormatter.format(to)}`;
}

export type DateRangePickerProps = {
  /** Currently applied first day, inclusive, as `YYYY-MM-DD`. */
  from: string;
  /** Currently applied last day, inclusive, as `YYYY-MM-DD`. */
  to: string;
  /** The server's today, as `YYYY-MM-DD`. */
  today: string;
};

/**
 * The dashboard's range control: three shortcut buttons plus a calendar popover
 * for anything else.
 *
 * The selected range lives in the URL, not in this component — picking one
 * `router.push`es `?from=&to=` and the server page re-renders the cards from the
 * new params. That keeps a range shareable and bookmarkable, keeps the Excel
 * export link pointing at exactly what is on screen, and means this component
 * holds no copy of the numbers that could go stale. The push runs inside a
 * transition so the current figures stay visible (dimmed) instead of blanking
 * while the server re-renders.
 */
export function DateRangePicker({ from, to, today }: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  /**
   * The in-progress calendar selection, which only exists while the popover is
   * open. Reset to `undefined` on every open so the first click starts a fresh
   * range: react-day-picker extends whatever `selected` it is given, so seeding
   * it with the applied range would make every click drag the range's end
   * around and leave the start unreachable.
   */
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);

  const todayDate = parseDateParam(today);
  const appliedFrom = parseDateParam(from);
  const appliedTo = parseDateParam(to);

  function applyRange(nextFrom: Date, nextTo: Date) {
    const params = new URLSearchParams({
      from: toDateParam(nextFrom),
      to: toDateParam(nextTo),
    });

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  /**
   * Opening and dismissing both discard the draft; only "Apply" commits it.
   * A calendar click alone can't be the trigger, because one click already
   * produces a complete range ("Aug 3 – Aug 3", a valid single-day report) and
   * navigating on it would make a two-day range impossible to pick. Dismissing
   * (outside click, Escape) therefore means cancel, as it does everywhere else.
   */
  function handleOpenChange(nextOpen: boolean) {
    setDraft(undefined);
    setOpen(nextOpen);
  }

  function handleApplyDraft() {
    if (!draft?.from || !draft.to) {
      return;
    }

    // Closed through state rather than through `handleOpenChange` — Radix only
    // calls `onOpenChange` for dismissals it handles itself, so there is no
    // second, conflicting update here.
    setOpen(false);
    setDraft(undefined);
    applyRange(draft.from, draft.to);
  }

  const draftLabel =
    draft?.from && draft.to
      ? formatRangeLabel(draft.from, draft.to)
      : draft?.from
        ? `${dayFormatter.format(draft.from)} – …`
        : "Pick a start and end day";

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-busy={isPending}>
      {SHORTCUTS.map((shortcut) => {
        const range = shortcut.resolve(todayDate);
        // Comparing the canonical params rather than timestamps: both sides are
        // local midnights derived the same way, and string equality can't be
        // thrown off by a stray millisecond.
        const active =
          toDateParam(range.from) === from && toDateParam(range.to) === to;

        return (
          <Button
            key={shortcut.id}
            type="button"
            size="sm"
            variant={active ? "secondary" : "outline"}
            aria-pressed={active}
            disabled={isPending}
            onClick={() => applyRange(range.from, range.to)}
          >
            {shortcut.label}
          </Button>
        );
      })}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
          >
            <CalendarDays data-icon="inline-start" />
            {formatRangeLabel(appliedFrom, appliedTo)}
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-auto">
          <PopoverHeader>
            <PopoverTitle>Custom range</PopoverTitle>
            <PopoverDescription>{draftLabel}</PopoverDescription>
          </PopoverHeader>

          <Calendar
            mode="range"
            selected={draft}
            onSelect={setDraft}
            defaultMonth={appliedFrom}
            // Orders can't be booked in the future, so a range ending after
            // today would only pad the report with empty days.
            disabled={{ after: todayDate }}
            numberOfMonths={2}
            autoFocus
          />

          <Button
            type="button"
            size="sm"
            className="self-end"
            disabled={!draft?.from || !draft.to}
            onClick={handleApplyDraft}
          >
            Apply
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
