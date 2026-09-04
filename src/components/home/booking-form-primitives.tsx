"use client";

import { useId } from "react";
import type * as React from "react";
import { Check } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The small shared vocabulary the booking form composes from: its numbered step
 * card, the tick that marks a picked card, one row of the fare breakdown, the
 * geometry both picker grids share, and the two duty-class glyphs.
 *
 * A plain module of named exports depending on nothing but `src/components/ui/*`,
 * `cn` and React — the same shape as `src/components/driver-hub/hub-primitives.tsx`,
 * and for the same reason: the booking form is the surface eight separate changes
 * land on, and a piece used by more than one of them belongs in one place rather
 * than being copied into each new sibling component.
 *
 * Colour rule throughout: only the landing token utilities (`bg-ink`,
 * `bg-surface`, `text-paper`, `text-muted`, `border-line`, the accent) — never a
 * hex literal, and never a `dark:` variant, which cannot match here because the
 * booking page carries no `data-landing-page` (see `globals.css`'s
 * `@custom-variant dark`).
 */

/* -------------------------------------------------------------------------- */
/* Picker geometry                                                            */
/* -------------------------------------------------------------------------- */

/** Shared geometry for the two pickable card grids (goods and vehicles). */
export const PICK_CARD_BASE_CLASSES =
  "relative flex flex-col rounded-xl border p-3.5 text-left transition-colors";

export const PICK_CARD_SELECTED_CLASSES = "border-accent bg-accent/[0.06]";

export const PICK_CARD_IDLE_CLASSES =
  "border-line hover:border-accent/40 hover:bg-surface";

/* -------------------------------------------------------------------------- */
/* StepCard                                                                   */
/* -------------------------------------------------------------------------- */

export type StepCardProps = {
  /** Omitted for a card that is not one of the form's numbered steps. */
  step?: number;
  title: string;
  description?: string;
  /**
   * Whether the step before this one is still unanswered. A disabled step stays
   * fully readable — it is what the user is being asked to work towards — so it
   * drops the badge's accent fill and mutes the title rather than fading the
   * whole card out.
   */
  disabled?: boolean;
  /**
   * Why this step cannot be answered yet — an imperative naming the fix wherever
   * there is one to name. Rendered in the header while `disabled` and pointed at
   * by the card's `aria-describedby`, so the reason travels with the step rather
   * than living in a `title` attribute a keyboard or screen-reader user has no
   * way to reach. Ignored while the step is enabled, where there is nothing to
   * explain.
   *
   * Omitted only by a step whose own content already carries the explanation —
   * the vehicle step while its type list failed to load renders that error in
   * an `alert`, and a vaguer line above it would be the first thing read.
   */
  disabledReason?: string;
  children: React.ReactNode;
};

/**
 * One numbered step of the form. The number is a decoration — the title
 * carries the meaning — so the badge is hidden from assistive tech.
 *
 * `aria-disabled` rather than a real `disabled`: a `Card` is a `div`, which has
 * no disabled state to set, and the controls inside it are of several kinds.
 * The content region stops taking pointer events; assistive tech is told the
 * step is not yet answerable by the attribute. The individual controls are
 * deliberately left alone — a step that is shown rather than hidden is one the
 * user is meant to be able to read ahead to, and `disabled` on each of them
 * would take that away.
 *
 * `role="group"` is what makes that wiring carry: ARIA in HTML supports neither
 * `aria-disabled` nor `aria-describedby` on a role-less generic, so a plain
 * `div` drops both and only the visible reason line survives. The role is also
 * the thing that gives the card a boundary to announce, so it takes its name
 * from the step's own title via `aria-labelledby` rather than announcing as an
 * unnamed group. Purely semantic — nothing about it renders.
 *
 * A step turned off this way says why (`disabledReason`) unless its content
 * already does, because the only thing on screen would otherwise be a control
 * that silently ignores the pointer.
 */
export function StepCard({
  step,
  title,
  description,
  disabled = false,
  disabledReason,
  children,
}: StepCardProps) {
  const titleId = useId();
  const reasonId = useId();
  // Only a disabled step has a reason to give: an enabled one carries neither
  // the line nor the `aria-describedby` pointing at it.
  const reason = disabled ? disabledReason : undefined;

  return (
    <Card
      role="group"
      aria-labelledby={titleId}
      aria-disabled={disabled ? "true" : undefined}
      aria-describedby={reason ? reasonId : undefined}
      className="gap-4 bg-ink text-paper ring-line"
    >
      <CardHeader>
        <CardTitle
          id={titleId}
          className={cn(
            "flex items-center gap-3 font-display text-base font-semibold",
            disabled ? "text-muted" : "text-paper",
          )}
        >
          {step === undefined ? null : (
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold",
                disabled ? "bg-surface text-muted" : "bg-accent text-ink",
              )}
            >
              {step}
            </span>
          )}
          {title}
        </CardTitle>
        {description ? (
          <CardDescription className="text-[0.8125rem] leading-snug text-muted">
            {description}
          </CardDescription>
        ) : null}
        {/* Visible as well as referenced: `aria-describedby` on a plain region
            is not announced by every screen reader, and a step that cannot be
            answered yet has to say so to everyone reading the card. */}
        {reason ? (
          <p id={reasonId} className="text-[0.8125rem] leading-snug text-muted">
            {reason}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className={cn(disabled && "pointer-events-none")}>
        {children}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* SelectedTick                                                               */
/* -------------------------------------------------------------------------- */

/** The orange tick that marks the selected card in either picker grid. */
export function SelectedTick() {
  return (
    <span
      aria-hidden="true"
      className="absolute top-2.5 right-2.5 flex size-4 items-center justify-center rounded-full bg-accent text-ink"
    >
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* BreakdownRow                                                               */
/* -------------------------------------------------------------------------- */

const BREAKDOWN_TERM_CLASSES = "text-[0.8125rem] text-muted";

const BREAKDOWN_VALUE_CLASSES = "font-price text-[0.8125rem] text-paper";

/** One `dt`/`dd` pair of the fare breakdown. */
export function BreakdownRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={BREAKDOWN_TERM_CLASSES}>{label}</dt>
      <dd className={BREAKDOWN_VALUE_CLASSES}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Duty-class glyphs                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Line-art glyphs for the two duty classes.
 *
 * Written fresh here rather than imported from `landing-vehicles.tsx`: that
 * module is the marketing page's, and these are sized and coloured for a
 * picker card. Small duplicated SVG helpers are this codebase's existing
 * convention (`landing-vehicles.tsx` keeps its own pair for the same reason).
 */
export function VanGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M1 18V6h28l11 7v5" />
      <path d="M1 18h4M14 18h13M37 18h10" />
      <path d="M22 6v7h17" />
      <circle cx="9" cy="18" r="3" />
      <circle cx="32" cy="18" r="3" />
    </svg>
  );
}

export function TruckGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
    >
      <path d="M1 18V4h25v14" />
      <path d="M26 9h9l6 6v3" />
      <path d="M1 18h4M15 18h13M38 18h9" />
      <circle cx="10" cy="18" r="3" />
      <circle cx="33" cy="18" r="3" />
    </svg>
  );
}
