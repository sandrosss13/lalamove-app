"use client";

import { ONBOARDING_RAIL } from "@/components/driver-onboarding/onboarding-step-rail";

/**
 * Four thin segments above the step heading, filled orange up to and including
 * the current step. Each segment's fill animates its own width rather than the
 * track's, so advancing a step wipes the next segment in over 0.35s instead of
 * snapping — the design's specified transition.
 *
 * `currentStep` is the whole-number step (1–4); step 3's sub-screens share one
 * segment, which is why moving from 3b to 3c deliberately does not move the bar.
 */
export function OnboardingProgressBar({
  currentStep,
}: {
  currentStep: number;
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={ONBOARDING_RAIL.length}
      aria-valuenow={currentStep}
      aria-valuetext={`Step ${currentStep} of ${ONBOARDING_RAIL.length}`}
      className="flex gap-[5px]"
    >
      {ONBOARDING_RAIL.map((entry) => (
        // The unfilled track needs a dark-only lift for the same reason the
        // rail's pending disc does, and slightly more urgently: this is a 3px
        // hairline, so it has far less area to make its case with. `bg-border`
        // is `oklch(1 0 0 / 10%)` in dark, which over the wizard `<main>`'s
        // `bg-muted` composites to rgb(60,60,60) on rgb(38,38,38) — workable at
        // 1.37:1, and in fact ahead of light mode's 1.16:1, but thin enough
        // that the unreached segments read as gaps rather than as a track. 15%
        // of the surface's own foreground takes it to 1.60:1 without touching
        // light mode, where `bg-border` is the design's own value.
        //
        // The trap to avoid here — and the reason this is a translucent
        // foreground rather than a solid token — is reaching for an opaque
        // neutral like `dark:bg-secondary` on the theory that `--border` is
        // "too faint" in dark. `--border` is translucent, so it does not
        // replace the ground, it lightens it; swapping in an opaque token
        // discards that gain instead of adding to it. On this element it is
        // fatal rather than merely worse: dark `--secondary` and dark `--muted`
        // are both `oklch(0.269 0 0)`, so a `bg-secondary` track on this
        // `bg-muted` ground would be the exact same colour as the ground and
        // the track would disappear outright.
        <div
          key={entry.step}
          className="h-[3px] flex-1 overflow-hidden rounded-sm bg-border dark:bg-foreground/15"
        >
          {/* Brand orange, unthemed on purpose: `--onboarding-accent` is a
              fixed brand value, and it clears both the light track and the dark
              one comfortably, so the fill is the same colour in both themes. */}
          <div
            className={`h-full bg-onboarding-accent transition-[width] duration-350 ease-out ${
              entry.step <= currentStep ? "w-full" : "w-0"
            }`}
          />
        </div>
      ))}
    </div>
  );
}
