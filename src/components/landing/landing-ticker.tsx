import { VEHICLE_TYPE_GROUPS } from "@/lib/vehicle-types";

const VEHICLE_LABELS = VEHICLE_TYPE_GROUPS.flatMap((group) =>
  group.options.map((option) => option.label),
);

function TickerRun({ hidden }: { hidden?: boolean }) {
  return (
    <ul
      aria-hidden={hidden ? "true" : undefined}
      className="flex shrink-0 items-center"
    >
      {VEHICLE_LABELS.map((label) => (
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
  return (
    <div className="overflow-hidden border-b border-line bg-surface py-4">
      <div className="flex w-max animate-ticker">
        <TickerRun />
        <TickerRun hidden />
      </div>
    </div>
  );
}
