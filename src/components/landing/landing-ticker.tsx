"use client";

import { useLandingVehicleTypes } from "@/components/landing/landing-vehicle-types";

function TickerRun({ labels, hidden }: { labels: string[]; hidden?: boolean }) {
  return (
    <ul
      aria-hidden={hidden ? "true" : undefined}
      className="flex shrink-0 items-center"
    >
      {labels.map((label) => (
        <li
          key={label}
          className="flex items-center gap-7 pr-7 text-sm leading-6 font-medium text-muted"
        >
          {label}
          <span
            aria-hidden="true"
            className="h-1 w-1 shrink-0 rounded-full bg-accent/60"
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Scrolling strip of the real vehicle taxonomy. The run is rendered twice so
 * the -50% keyframe loops seamlessly; the duplicate is hidden from assistive
 * tech to avoid reading the list out twice.
 */
export function LandingTicker() {
  const { vehicleTypes } = useLandingVehicleTypes();
  const labels = vehicleTypes.map((vehicleType) => vehicleType.label);

  // The labels arrive after mount, so the strip reserves its filled height up
  // front and the sections below it don't jump when they land. The edge mask
  // fades each run out rather than letting labels clip against the viewport.
  return (
    <div className="min-h-[3.25rem] overflow-hidden border-b border-line bg-surface py-3.5 [mask-image:linear-gradient(to_right,transparent,black_5rem,black_calc(100%-5rem),transparent)]">
      <div className="flex w-max animate-ticker">
        <TickerRun labels={labels} />
        <TickerRun labels={labels} hidden />
      </div>
    </div>
  );
}
