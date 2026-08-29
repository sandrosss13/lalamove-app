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
        <div
          key={entry.step}
          className="h-[3px] flex-1 overflow-hidden rounded-sm bg-border"
        >
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
