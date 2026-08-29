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
