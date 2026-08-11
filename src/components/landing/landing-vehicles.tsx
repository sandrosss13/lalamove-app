"use client";

import type { ReactElement } from "react";

import {
  useLandingVehicleTypes,
  type LandingVehicleType,
} from "@/components/landing/landing-vehicle-types";

function TruckGlyph() {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-6 w-12"
    >
      <path d="M1 18V4h25v14" />
      <path d="M26 9h9l6 6v3" />
      <path d="M1 18h4M15 18h13M38 18h9" />
      <circle cx="10" cy="18" r="3" />
      <circle cx="33" cy="18" r="3" />
    </svg>
  );
}

function VanGlyph() {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-6 w-12"
    >
      <path d="M1 18V6h28l11 7v5" />
      <path d="M1 18h4M14 18h13M37 18h10" />
      <path d="M22 6v7h17" />
      <circle cx="9" cy="18" r="3" />
      <circle cx="32" cy="18" r="3" />
    </svg>
  );
}

/**
 * The duty classes as the page presents them: heading, glyph and the order they
 * are shown in, lightest first.
 */
const CATEGORIES: {
  category: LandingVehicleType["category"];
  heading: string;
  glyph: () => ReactElement;
}[] = [
  { category: "MEDIUM_DUTY", heading: "Medium-Duty", glyph: VanGlyph },
  { category: "HEAVY_DUTY", heading: "Heavy-Duty", glyph: TruckGlyph },
];

/**
 * Payload as a headline figure: tonnes once a type is rated in them, which is
 * how an operator would say it (a 3500 kg box truck is a 3.5-tonner).
 */
function formatPayload(maxPayloadKg: number): string {
  return maxPayloadKg >= 1000
    ? `${maxPayloadKg / 1000} t`
    : `${maxPayloadKg} kg`;
}

export function LandingVehicles() {
  const { vehicleTypes } = useLandingVehicleTypes();

  return (
    <section
      id="vehicles"
      className="relative scroll-mt-16 overflow-hidden border-b border-line bg-surface py-20 sm:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-32 h-[26rem] w-[26rem] rounded-full bg-accent/10 blur-[130px]"
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
          The fleet
        </p>
        <h2 className="mt-4 max-w-2xl font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-paper">
          Pick the vehicle the load actually needs
        </h2>

        {CATEGORIES.map(({ category, heading, glyph: Glyph }) => {
          const grouped = vehicleTypes.filter(
            (vehicleType) => vehicleType.category === category,
          );

          // Nothing to show until the taxonomy lands (or if it never does) —
          // the section keeps its heading rather than framing empty rows.
          if (grouped.length === 0) {
            return null;
          }

          return (
            <div key={category} className="mt-14">
              <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
                <h3 className="flex items-center gap-4 font-display text-xl leading-none font-semibold tracking-[-0.015em] text-paper sm:text-2xl">
                  <span className="text-accent">
                    <Glyph />
                  </span>
                  {heading}
                </h3>
                <span className="shrink-0 text-[0.8125rem] text-muted">
                  <span className="font-price">{grouped.length}</span> types
                </span>
              </div>

              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {grouped.map((vehicleType, index) => (
                  <li
                    key={vehicleType.code}
                    className="group relative overflow-hidden rounded-lg border border-line bg-ink px-4 py-5 transition-transform hover:-translate-y-1"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 h-0.5 w-0 bg-accent transition-[width] duration-500 group-hover:w-full"
                    />
                    <span
                      aria-hidden="true"
                      className="block font-price text-[0.8125rem] leading-none text-muted transition-colors group-hover:text-accent"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-3 block font-display text-lg leading-tight font-semibold tracking-[-0.015em] text-paper">
                      {vehicleType.label}
                    </span>
                    <span className="mt-2 block text-[0.8125rem] text-muted">
                      Up to{" "}
                      <span className="font-price">
                        {formatPayload(vehicleType.maxPayloadKg)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
