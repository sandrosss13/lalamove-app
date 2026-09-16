"use client";

import * as React from "react";

import {
  AuthHeading,
  AuthSubheading,
  BackLink,
  Eyebrow,
} from "@/components/auth/auth-primitives";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";
import { accountTypeRowsForRole, type FlowRole } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

/**
 * Step 2: pick the legal account type, which decides what step 3 asks for —
 * personal details or company documents.
 *
 * Presentational: the caller owns `value` (it lives in the query string so back
 * and forward walk the wizard) and decides what selecting one does. In the
 * normal forward path selecting advances immediately, so the selected styling
 * is mostly what the user sees on the way *back*, when they return to change
 * their mind — which is exactly why it has to exist even though the prototype
 * only drew the unselected state.
 *
 * These are one-of-N options, so they are a real radio group rather than
 * buttons wearing radio dots: `role="radiogroup"` with `role="radio"` items,
 * arrow-key navigation, and a single tab stop for the whole set.
 *
 * One deliberate departure from the ARIA pattern's default: the arrow keys move
 * focus *without* selecting, and Space or Enter selects. Selection here
 * navigates to the next step, so selection-follows-focus would fire the moment
 * a keyboard user pressed ↓ and they could never reach the third option. The
 * APG allows exactly this when checking has a disruptive side effect.
 */

const ROW_CLASS =
  "flex items-center gap-3.5 rounded-xl border bg-[var(--landing-surface-raised)] px-5 py-[18px] text-left transition-colors hover:border-[var(--landing-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]";

export type AccountTypeStepProps = {
  /** Drivers get the Individual Entrepreneur row; clients do not. */
  role: FlowRole;
  /** The current pick, or `null` on the way forward through the wizard. */
  value: AccountType | null;
  onSelect: (accountType: AccountType) => void;
  onBack: () => void;
  className?: string;
};

export function AccountTypeStep({
  role,
  value,
  onSelect,
  onBack,
  className,
}: AccountTypeStepProps) {
  const headingId = React.useId();
  const rows = accountTypeRowsForRole(role);

  // Populated on render so the arrow keys have something to move focus to.
  // Indexed the same way as `rows`, which is stable for a given role.
  const rowRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const checkedIndex = rows.findIndex((row) => row.value === value);

  // A radio group is one tab stop. The checked option is the way in; with
  // nothing checked yet, the first one is.
  const tabStopIndex = checkedIndex === -1 ? 0 : checkedIndex;

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const currentIndex = rowRefs.current.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (currentIndex === -1) return;

    // Both axes: the group reads as a vertical list, but a radio group is
    // expected to answer either pair of arrows.
    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % rows.length;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + rows.length) % rows.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = rows.length - 1;
        break;
      default:
        return;
    }

    // Only now, once the key is known to be one we handle: an unhandled key
    // must keep its default (typing, Tab, shortcuts).
    event.preventDefault();
    rowRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <BackLink onClick={onBack} />

      <div className="flex flex-col gap-2.5">
        <Eyebrow>Step 2 of 3 · Type</Eyebrow>
        <AuthHeading id={headingId}>Which describes you?</AuthHeading>
        <AuthSubheading>
          This decides what we ask for next — personal details or company
          documents.
        </AuthSubheading>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={headingId}
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-2.5"
      >
        {rows.map((row, index) => {
          const checked = row.value === value;

          return (
            <button
              key={row.value}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === tabStopIndex ? 0 : -1}
              onClick={() => onSelect(row.value)}
              className={cn(
                ROW_CLASS,
                checked
                  ? "border-[var(--landing-accent)]"
                  : "border-[var(--landing-line)]",
              )}
            >
              {/* Decorative twice over: `aria-checked` on the button already
                  carries the state, and the dot is the picture of it. */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-[18px] flex-none items-center justify-center rounded-full border-[1.5px] transition-colors",
                  checked
                    ? "border-[var(--landing-accent)] bg-[var(--landing-accent)]"
                    : // The unchecked ring has to read as a control rather than
                      // as a hairline, so it takes `line-stronger` rather than
                      // the row's own `line`. Its light value resolves within a
                      // shade of the `#cfcac0` this used to spell literally.
                      "border-[var(--landing-line-stronger)]",
                )}
              >
                {/* `on-accent`, not white: in dark mode the fill behind this dot
                    is the brighter `#f58220`, where a white dot all but
                    disappears. `on-accent` is the palette's answer to "what goes
                    on top of accent" and is near-black there. */}
                {checked ? (
                  <span className="size-1.5 rounded-full bg-[var(--landing-on-accent)]" />
                ) : null}
              </span>

              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-medium text-[var(--landing-paper)]">
                  {ACCOUNT_TYPE_LABELS[row.value]}
                </span>
                <span className="text-[13px] text-[var(--landing-muted)]">
                  {row.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
