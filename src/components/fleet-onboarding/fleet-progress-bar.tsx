"use client";

import { FLEET_RAIL } from "@/components/fleet-onboarding/fleet-step-rail";

/**
 * Five thin segments above the step heading, filled orange up to and including
 * the current step. Each segment's fill animates its own width rather than the
 * track's, so advancing a step wipes the next segment in over the design's
 * 0.35s instead of snapping.
 */
export function FleetProgressBar({ currentStep }: { currentStep: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={FLEET_RAIL.length}
      aria-valuenow={currentStep}
      aria-valuetext={`Step ${currentStep} of ${FLEET_RAIL.length}`}
      className="flex gap-[5px]"
    >
      {FLEET_RAIL.map((entry) => (
        // Same dark-only lift as the driver wizard's progress bar, which
        // carries the full reasoning: `bg-border` is `oklch(1 0 0 / 10%)` in
        // dark, and over the wizard `<main>`'s `bg-muted` a 3px hairline of it
        // is workable but too thin to read as a track, so the dark half goes to
        // 15% of the surface's own foreground. Light mode is untouched.
        //
        // Deliberately a translucent foreground and not an opaque neutral.
        // `--border` being translucent means it lightens the ground rather than
        // replacing it, so "fixing" a faint dark border by swapping in a solid
        // token throws that gain away instead of building on it — and here it
        // would delete the track entirely, because dark `--secondary` and dark
        // `--muted` are both `oklch(0.269 0 0)` and a `bg-secondary` track on
        // this `bg-muted` ground would be exactly the ground's own colour.
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
