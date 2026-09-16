"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  HUB_STATUS_TONE_CLASSES,
  hubStatusTone,
} from "@/components/driver-hub/hub-status";
import { cn } from "@/lib/utils";

/**
 * The small shared vocabulary the seven driver-hub screens compose from.
 *
 * Every piece here is a thin layer over a `src/components/ui/` primitive, not
 * hand-rolled markup: the design's surfaces are the shadcn `Card`, `Badge` and
 * `Button` with the handoff's own padding, radii and type scale applied on top.
 * Doing it once means the Earnings chart and the Performance chart are the same
 * component rather than two near-copies, and a spacing correction lands in one
 * place.
 *
 * Colour rule throughout: anything that exists as a token is a token
 * (`text-muted-foreground`, `border-border`, `bg-muted`, `bg-foreground`), and
 * only the handoff's un-tokenised values — the accent orange and the delta
 * greens/ambers — are written as Tailwind arbitrary values, the same approach
 * `hub-status.ts` and the admin tables already take. `globals.css` gains
 * nothing for this surface.
 *
 * That rule is what makes this file mostly theme-proof: every token above flips
 * with `html.dark` for free, so a `HubCard` is white on grey in light and
 * `--card` on `--background` in dark without a single `dark:` class. Only the
 * arbitrary values need attention, and they split two ways — see the two
 * constants below, which are the only places on this surface where a colour is
 * chosen rather than looked up.
 *
 * All numeric text (money, counts, ids, plates, dates) uses `font-price`, the
 * repo's IBM Plex Mono variable — the handoff's "mono".
 */

/**
 * The brand orange. It has no `--color-*` token, so it is spelled out.
 *
 * Deliberately has no `dark:` counterpart, and must not grow one. At 64%
 * lightness it clears both grounds this surface ever paints — the light
 * artboard's white card and dark mode's `oklch(0.205 0 0)` — and the whole
 * point of a brand colour is that it is the one thing on the page that does
 * *not* change when the theme does. The same call is made for the mid-green
 * `oklch(59.6% 0.145 163.225)` used for timeline dots and success fills across
 * the screens.
 */
const ACCENT_BG = "bg-[oklch(64%_0.19_48)]";

/**
 * Delta text colours: green when the movement is good, amber when it is not.
 *
 * Unlike the accent above, these two are *dark text meant for a light card* —
 * 44.8% and 47.6% lightness — so on a dark card they are very nearly the card
 * itself. The `dark:` halves are the same hue at the other end of the scale,
 * and are quoted verbatim from `success` and `warning` in
 * `HUB_STATUS_TONE_CLASSES` (`hub-status.ts`), which owns the hub's six-tone
 * vocabulary. A delta reading "+12%" in green and a "Completed" pill in green
 * are the same green in both themes because of that, rather than by
 * coincidence — so a tone correction lands in `hub-status.ts` once.
 */
const DELTA_TONE_CLASSES: Record<MetricDeltaTone, string> = {
  good: "text-[oklch(44.8%_0.119_151.328)] dark:text-[oklch(84%_0.13_156.743)]",
  bad: "text-[oklch(47.6%_0.114_61.907)] dark:text-[oklch(88%_0.12_85)]",
};

/** Progress-fill colours, matching the delta tone above. */
const PROGRESS_TONE_CLASSES: Record<MetricDeltaTone, string> = {
  good: "bg-[oklch(59.6%_0.145_163.225)]",
  bad: ACCENT_BG,
};

/** Bar fills: ink for the primary series, accent for the highlighted one. */
const BAR_TONE_CLASSES: Record<HubBarTone, string> = {
  ink: "bg-foreground",
  accent: ACCENT_BG,
};

/* -------------------------------------------------------------------------- */
/* HubCard                                                                    */
/* -------------------------------------------------------------------------- */

export type HubCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** The 15px/600 card title. Omit for a card that carries no heading. */
  title?: React.ReactNode;
  /** Right-aligned slot on the title row — a note, a filter or a button. */
  action?: React.ReactNode;
  /** Extra classes for the body wrapper, e.g. to set its own layout. */
  contentClassName?: string;
  /**
   * Gap between the title row and the body. `default` is the design's 16px,
   * which nearly every card uses; `chart` is the 22px its two plot cards set
   * (`margin-bottom:22px` on the "Daily earnings" and "Online hours vs jobs
   * completed" title rows) to give the bars room to breathe.
   */
  titleGap?: HubCardTitleGap;
  /**
   * Vertical alignment inside the title row. The design centres a title
   * against its action almost everywhere (`align-items:center`); the Today
   * screen's zone card sets the pair on a shared baseline instead
   * (`display:flex; align-items:baseline` on "Where the demand is").
   */
  titleAlign?: HubCardTitleAlign;
};

/** Title→body gaps the design uses. */
export type HubCardTitleGap = "default" | "chart";

/** Title-row cross-axis alignments the design uses. */
export type HubCardTitleAlign = "center" | "baseline";

/**
 * Per-card overrides rather than a change to the shared default: 16px/centred
 * is right for the great majority of the design's cards, and one card wanting
 * something else is not a reason to move all of them.
 */
const CARD_TITLE_GAP_CLASSES: Record<HubCardTitleGap, string> = {
  default: "gap-4",
  chart: "gap-[22px]",
};

const CARD_TITLE_ALIGN_CLASSES: Record<HubCardTitleAlign, string> = {
  center: "items-center",
  baseline: "items-baseline",
};

/**
 * The design's card surface: white, 1px border, 14px radius, 22px padding.
 *
 * `Card` ships an 12px-radius, ring-bordered, `--card-spacing`-padded box, so
 * this zeroes that variable and restates the padding — which also neutralises
 * the horizontal padding `CardHeader`/`CardContent` inherit from it, letting
 * the whole card share one 22px inset instead of two nested ones.
 */
export function HubCard({
  title,
  action,
  contentClassName,
  titleGap = "default",
  titleAlign = "center",
  className,
  children,
  ...props
}: HubCardProps) {
  return (
    <Card
      className={cn(
        "min-w-0 rounded-[14px] border border-border p-[22px] ring-0 [--card-spacing:0px]",
        CARD_TITLE_GAP_CLASSES[titleGap],
        className,
      )}
      {...props}
    >
      {title || action ? (
        <CardHeader
          className={cn("gap-0", CARD_TITLE_ALIGN_CLASSES[titleAlign])}
        >
          {title ? (
            <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
          ) : null}
          {action ? (
            <CardAction className="text-xs text-muted-foreground">
              {action}
            </CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("min-w-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* MetricTile                                                                 */
/* -------------------------------------------------------------------------- */

/** Whether a period-over-period movement is the direction the driver wants. */
export type MetricDeltaTone = "good" | "bad";

export type MetricTileProps = {
  /** Uppercase 11px label. */
  label: string;
  /** The headline number. Always rendered in `font-price`. */
  value: React.ReactNode;
  /** Muted line under the value — 12px, or 13px on a `hero` tile. */
  note?: React.ReactNode;
  /** Renders the value at the hero size — the Today screen's "Earned today". */
  hero?: boolean;
  /** Period-over-period movement, coloured by its own tone. */
  delta?: { label: string; tone: MetricDeltaTone };
  /** 0–1. Renders the 4px track the Performance tiles carry. Clamped. */
  progress?: number;
  /**
   * Fill colour for that track. Defaults to the delta's tone (the Performance
   * tiles colour the bar the same way they colour the delta), and to `good`
   * for a tile that states no tone at all — the design's track is
   * `background: p.good ? OK : ACCENT`, so it is green or orange but never
   * ink. A tile whose metric is moving the wrong way must say so with an
   * explicit `progressTone="bad"`; nothing here can infer it, because a tile
   * may carry its delta as `children` rather than through `delta`.
   */
  progressTone?: MetricDeltaTone;
  /** Anything below the note — the hero tile's links, or a `<SampleNote />`. */
  children?: React.ReactNode;
  className?: string;
};

export function MetricTile({
  label,
  value,
  note,
  hero = false,
  delta,
  progress,
  progressTone,
  children,
  className,
}: MetricTileProps) {
  // A ratio outside 0–1 would paint a bar wider than its track; callers derive
  // these from live data, so clamp here rather than trusting every call site.
  const filled =
    progress === undefined
      ? undefined
      : Math.round(Math.min(1, Math.max(0, progress)) * 100);

  // `good` rather than nothing when neither is given: the Performance tiles
  // pass their delta as `children` (so it can sit *below* the track), which
  // left `trackTone` undefined and painted all five tracks ink.
  const trackTone = progressTone ?? delta?.tone ?? "good";

  return (
    <Card
      className={cn(
        "min-w-0 gap-0 rounded-[14px] border border-border p-5 ring-0 [--card-spacing:0px]",
        className,
      )}
    >
      {/* No weight: every tile label in the design is a bare `font-size:11px;
          text-transform:uppercase; letter-spacing:0.08em` with the inherited
          400, so a `font-medium` here read a step heavier than the artboard. */}
      <p className="text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          // The design gives its tiles three shapes and two bottom margins:
          // `margin:8px 0 4px` under the hero's 38px number ("Earned today")
          // and under the Performance tiles that carry a track, `8px 0 3px`
          // under the plain value-plus-note tiles every other screen uses.
          // `progress` is what distinguishes the second from the third — the
          // Performance tiles are exactly the tiles with a track.
          "mt-2 font-price leading-none font-semibold",
          hero || progress !== undefined ? "mb-1" : "mb-[3px]",
          hero ? "text-[38px] tracking-[-0.02em]" : "text-[26px]",
        )}
      >
        {value}
      </p>
      {/* 13px under the hero tile, 12px under every other one. */}
      {note ? (
        <p
          className={cn(
            "text-muted-foreground",
            hero ? "text-[13px]" : "text-xs",
          )}
        >
          {note}
        </p>
      ) : null}
      {delta ? (
        <p className={cn("text-xs", DELTA_TONE_CLASSES[delta.tone])}>
          {delta.label}
        </p>
      ) : null}
      {filled === undefined ? null : (
        <div
          // `progressbar` rather than a bare div: the bar is the only place
          // some of these tiles express how close the metric is to full.
          role="progressbar"
          aria-label={label}
          aria-valuenow={filled}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3.5 h-1 overflow-hidden rounded-full bg-border"
        >
          <div
            className={cn(
              "h-full rounded-full",
              PROGRESS_TONE_CLASSES[trackTone],
            )}
            style={{ width: `${filled}%` }}
          />
        </div>
      )}
      {children}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* FilterStrip                                                                */
/* -------------------------------------------------------------------------- */

export type FilterStripItem = {
  /** The value handed back to `onChange`. */
  value: string;
  label: string;
};

export type FilterStripProps = {
  items: readonly FilterStripItem[];
  /** The selected `value`. A value not in `items` simply selects nothing. */
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the group, e.g. "Filter jobs by status". */
  ariaLabel: string;
  className?: string;
};

/**
 * The design's "Tabs": a row of pills inside a grey track.
 *
 * Built from `aria-pressed` buttons rather than the Radix `Tabs` primitive.
 * Radix wires each trigger to a `TabsContent` panel through `aria-controls`,
 * and these strips filter a table that lives *outside* the strip's own subtree
 * — so a real tablist would either need a dummy panel per filter or would ship
 * a dangling `aria-controls`. Toggle buttons describe what these actually are,
 * and they match the admin tables' filter rows
 * (`src/app/admin/(sections)/drivers/applications/page.tsx`).
 *
 * Keyboard navigation is the plain one: every pill is in the tab order, so
 * Tab/Shift-Tab moves between them and Space/Enter selects.
 */
export function FilterStrip({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: FilterStripProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      // `min-w-0` + `overflow-x-auto` let a narrow pane scroll the strip
      // instead of crushing the first pill; `flex-none` on the pills keeps
      // them at their natural width inside that scroller.
      className={cn(
        "flex min-w-0 gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px]",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;

        return (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            // The selected pill is the design's white chip lifted off the grey
            // track. Both halves of that — `bg-background` and the 6%-black
            // drop shadow — are light-mode statements of one idea, "this pill
            // is raised", and neither survives the flip: in dark, `background`
            // is `oklch(0.145 0 0)` and `muted` is `oklch(0.269 0 0)`, so the
            // token pair *inverts* and the selected pill sinks into a hole,
            // while a black shadow on a near-black track is invisible.
            //
            // `dark:bg-[oklch(0.37_0_0)]` restores the direction rather than
            // the literal: one step lighter than the track, which is how a dark
            // UI says "raised" at all — elevation there is lightness, not
            // shadow. The shadow is left in place unconditionally because it
            // costs nothing and simply stops being perceptible; deleting it
            // would lose the light artboard's own value for no gain.
            className={cn(
              "h-auto flex-none rounded-md px-[13px] py-1.5 text-[13px] whitespace-nowrap",
              active
                ? "bg-background font-semibold text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-background hover:text-foreground dark:bg-[oklch(0.37_0_0)] dark:hover:bg-[oklch(0.37_0_0)]"
                : "bg-transparent font-normal text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HubStatusBadge                                                             */
/* -------------------------------------------------------------------------- */

export type HubStatusBadgeProps = {
  /** The status word — display text, a Prisma enum value or a slug. */
  status: string;
  /** Display override, for when `status` is an enum like `IN_TRANSIT`. */
  label?: string;
  className?: string;
};

/** A status pill: `Badge` wearing the shared tone classes from `hub-status`. */
export function HubStatusBadge({
  status,
  label,
  className,
}: HubStatusBadgeProps) {
  return (
    <Badge
      // `outline` rather than the default so no variant background survives
      // the merge if a tone class is ever missing.
      variant="outline"
      className={cn(
        "h-auto rounded-full border-transparent px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em]",
        HUB_STATUS_TONE_CLASSES[hubStatusTone(status)],
        className,
      )}
    >
      {label ?? status}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* MasterDetailSplit                                                          */
/* -------------------------------------------------------------------------- */

export type MasterDetailSplitProps = {
  /** The table (or list) side. Always rendered. */
  master: React.ReactNode;
  /** The panel. `undefined`/`null` collapses the layout to one column. */
  detail?: React.ReactNode;
  /** Names the panel region and the close button, e.g. "job TB4821". */
  detailLabel: string;
  onCloseDetail: () => void;
  className?: string;
};

/**
 * The design's in-page master/detail split, replacing the old slide-over
 * drawer: a two-column grid whose right panel sticks below the 112px-tall
 * sidebar-plus-header chrome, collapsing to a single column when nothing is
 * selected.
 *
 * The two-column rule is gated at `lg` because the design targets a ≥1180px
 * content column: below that the `minmax(300px, …) minmax(260px, …)` tracks
 * would force a 580px floor and push the page into horizontal scroll, so a
 * narrow viewport stacks the panel under the table instead. Sticky is gated
 * with it — a stuck panel above a stacked table would cover it.
 *
 * The ✕ lives here rather than in each panel so all seven screens dismiss the
 * same way; a panel's own header should leave room for it at its top-right.
 */
export function MasterDetailSplit({
  master,
  detail,
  detailLabel,
  onCloseDetail,
  className,
}: MasterDetailSplitProps) {
  const open = Boolean(detail);

  return (
    <div
      className={cn(
        "grid items-start gap-5",
        open && "lg:grid-cols-[minmax(300px,1.5fr)_minmax(260px,1fr)]",
        className,
      )}
    >
      <div className="min-w-0">{master}</div>
      {open ? (
        <aside
          aria-label={detailLabel}
          className="relative min-w-0 lg:sticky lg:top-[112px]"
        >
          {detail}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            // Spelled out: "✕" alone announces as "multiplication x", which
            // tells a screen-reader user nothing about what closes.
            aria-label={`Close ${detailLabel}`}
            onClick={onCloseDetail}
            className="absolute top-[22px] right-[22px] z-10 rounded-md text-muted-foreground"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </aside>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* SampleNote                                                                 */
/* -------------------------------------------------------------------------- */

export type SampleNoteProps = {
  /**
   * What would make this real — the schema change or endpoint that is
   * missing. Shown on hover as a `title` and read out by assistive tech.
   */
  note: string;
  /** Badge text. Defaults to "Sample data". */
  label?: string;
  className?: string;
};

/**
 * The honesty marker. Anything on these screens fed by
 * `src/lib/dashboard/hub/sample.ts` carries one, so a placeholder number is
 * never mistaken for the driver's own.
 *
 * Deliberately quiet — muted, dashed, 10px — but never invisible: the accent
 * dot is the tell that separates it from a normal caption. The explanation
 * rides along as both a `title` (for a mouse) and screen-reader-only text,
 * because `title` is not reliably announced on its own.
 */
export function SampleNote({
  note,
  label = "Sample data",
  className,
}: SampleNoteProps) {
  return (
    <Badge
      variant="outline"
      title={note}
      className={cn(
        "h-auto gap-1.5 rounded-full border-dashed border-border bg-transparent px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] uppercase text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", ACCENT_BG)}
      />
      {label}
      <span className="sr-only"> — {note}</span>
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* HubEmptyState                                                              */
/* -------------------------------------------------------------------------- */

export type HubEmptyStateProps = {
  /** Why there is nothing here, e.g. "No days in the selected range". */
  message: string;
  /** Optional follow-up — a hint, or an action that would fill the view. */
  children?: React.ReactNode;
  className?: string;
};

/**
 * The empty row for a table or a filtered range, matching the admin tables'
 * `py-10 text-center text-muted-foreground` idiom so an empty driver table and
 * an empty admin table read the same.
 */
export function HubEmptyState({
  message,
  children,
  className,
}: HubEmptyStateProps) {
  return (
    <div className={cn("py-10 text-center text-muted-foreground", className)}>
      <p className="text-sm">{message}</p>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* HubBarChart                                                                */
/* -------------------------------------------------------------------------- */

/** Bar fills the design uses. */
export type HubBarTone = "ink" | "accent";

export type HubBarSeries = {
  /** Legend text, and the name of this series in the chart's text summary. */
  label: string;
  tone: HubBarTone;
};

export type HubBarColumn = {
  /** The muted 12px label under the column — a weekday, a date, a week. */
  label: string;
  /** One number per series, in the same order as `series`. */
  values: readonly number[];
  /**
   * The mono 11px text above the column. Pre-formatted by the caller, since
   * only it knows the unit (₾143, 7.2h, 9) — the design shows "—" for an
   * empty column rather than a zero.
   */
  valueLabel: string;
};

export type HubBarChartProps = {
  columns: readonly HubBarColumn[];
  /** Defaults to a single ink series. Two series draw side by side. */
  series?: readonly HubBarSeries[];
  /**
   * Paint the tallest column's bar in accent. Single-series only — with two
   * series the tone already distinguishes them. Defaults to `true`.
   */
  highlightPeak?: boolean;
  /** Defaults to `true` when there is more than one series. */
  showLegend?: boolean;
  /** Accessible name, e.g. "Daily earnings". */
  ariaLabel: string;
  className?: string;
};

const DEFAULT_SERIES: readonly HubBarSeries[] = [
  { label: "Value", tone: "ink" },
];

/** Above this many columns the design tightens the gap so bars stay legible. */
const DENSE_COLUMN_COUNT = 10;

/** Plot height in px, and the px height a full two-series bar reaches. */
const PLOT_HEIGHT = 190;
const PAIRED_BAR_MAX_HEIGHT = 150;

/**
 * The bar plot shared by Earnings ("Daily earnings" / "Weekly earnings") and
 * Performance ("Online hours vs jobs completed").
 *
 * One component rather than two because the only real difference is the series
 * count: Earnings draws one bar per column and highlights the peak, Performance
 * draws two 14px bars side by side and labels them in a legend. Each series is
 * scaled against *its own* maximum, so hours and jobs — different units — both
 * use the full height instead of the smaller one flattening against the larger.
 */
export function HubBarChart({
  columns,
  series = DEFAULT_SERIES,
  highlightPeak = true,
  showLegend,
  ariaLabel,
  className,
}: HubBarChartProps) {
  const paired = series.length > 1;
  const legend = showLegend ?? paired;

  // Per-series maxima, floored at 1 so an all-zero series divides safely.
  const seriesMax = series.map((_, seriesIndex) =>
    Math.max(1, ...columns.map((column) => column.values[seriesIndex] ?? 0)),
  );

  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        className="grid items-end"
        style={{
          // Column count and gap are data-driven, so they cannot be classes.
          gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(0, 1fr))`,
          gap: columns.length > DENSE_COLUMN_COUNT ? 6 : 14,
          height: PLOT_HEIGHT,
        }}
      >
        {columns.map((column, columnIndex) => {
          const bars = series.map((entry, seriesIndex) => {
            const value = column.values[seriesIndex] ?? 0;
            const max = seriesMax[seriesIndex] ?? 1;
            const empty = value <= 0;

            // Single series fills its column and scales as a percentage of the
            // plot; a pair is fixed-width and scales in px, both as the design
            // specifies. An empty column still draws a sliver so the day is
            // visibly present rather than missing.
            const style: React.CSSProperties = paired
              ? {
                  width: 14,
                  height: empty ? 3 : (value / max) * PAIRED_BAR_MAX_HEIGHT,
                  opacity: empty ? 0.12 : 1,
                }
              : {
                  height: empty ? "2%" : `${(value / max) * 100}%`,
                  minHeight: 3,
                  opacity: empty ? 0.12 : 1,
                };

            // Only a lone series gets the peak highlight; a pair is already
            // colour-coded by series.
            const tone =
              !paired && highlightPeak && !empty && value >= max
                ? "accent"
                : entry.tone;

            return (
              <div
                key={entry.label}
                className={cn(
                  // The design rounds the two chart shapes differently: the
                  // wide single-series earnings bar is `borderRadius: 5`, the
                  // 14px paired hours/jobs bars are `borderRadius: 4`.
                  paired ? "flex-none rounded-[4px]" : "w-full rounded-[5px]",
                  BAR_TONE_CLASSES[tone],
                )}
                style={style}
              />
            );
          });

          return (
            <div
              // Labels repeat across weeks ("Mon"), so the index is part of
              // the key.
              key={`${column.label}-${columnIndex}`}
              className="flex h-full min-w-0 flex-col justify-end gap-2"
            >
              <div className="text-center font-price text-[11px] text-muted-foreground">
                {column.valueLabel}
              </div>
              {paired ? (
                <div className="flex items-end justify-center gap-[3px]">
                  {bars}
                </div>
              ) : (
                bars
              )}
              <div className="truncate text-center text-xs text-muted-foreground">
                {column.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* The plot is `role="img"`, so its numbers reach assistive tech only
          through this list. Cheaper and more accurate than describing 30 bars
          inside a single aria-label. */}
      <ul className="sr-only">
        {columns.map((column, columnIndex) => (
          <li key={`${column.label}-${columnIndex}`}>
            {column.label}:{" "}
            {series
              .map(
                (entry, seriesIndex) =>
                  `${entry.label} ${column.values[seriesIndex] ?? 0}`,
              )
              .join(", ")}
          </li>
        ))}
      </ul>

      {legend ? (
        <ul className="mt-[18px] flex flex-wrap gap-[18px] text-xs text-muted-foreground">
          {series.map((entry) => (
            <li key={entry.label} className="flex items-center gap-[7px]">
              <span
                aria-hidden="true"
                className={cn(
                  "size-[9px] rounded-[2px]",
                  BAR_TONE_CLASSES[entry.tone],
                )}
              />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
