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
          className="flex items-center gap-6 pr-6 font-display text-xl leading-none tracking-[0.08em] text-paper uppercase sm:text-2xl"
        >
          {label}
          <span aria-hidden="true" className="text-accent">
            {"///"}
          </span>
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
  // front and the sections below it don't jump when they land.
  return (
    <div className="min-h-[3.25rem] overflow-hidden border-b border-line bg-surface py-4 sm:min-h-[3.5rem]">
      <div className="flex w-max animate-ticker">
        <TickerRun labels={labels} />
        <TickerRun labels={labels} hidden />
      </div>
    </div>
  );
}
