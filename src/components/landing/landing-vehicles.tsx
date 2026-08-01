import type { ReactElement } from "react";

import { VEHICLE_TYPE_GROUPS } from "@/lib/vehicle-types";

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
 * Glyph per fleet category. Keyed on the category name from
 * `VEHICLE_TYPE_GROUPS` with a truck fallback, so adding a category can never
 * break the render.
 */
const CATEGORY_GLYPHS: Record<string, () => ReactElement> = {
  "Cargo Van": VanGlyph,
};

export function LandingVehicles() {
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
        <h2 className="mt-4 max-w-2xl font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.9] text-paper uppercase">
          Pick the vehicle the load actually needs
        </h2>

        {VEHICLE_TYPE_GROUPS.map((group) => {
          const Glyph = CATEGORY_GLYPHS[group.category] ?? TruckGlyph;

          return (
            <div key={group.category} className="mt-14">
              <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
                <h3 className="flex items-center gap-4 font-display text-2xl leading-none tracking-[0.06em] text-paper uppercase sm:text-3xl">
                  <span className="text-accent">
                    <Glyph />
                  </span>
                  {group.category}
                </h3>
                <span className="shrink-0 text-[0.625rem] font-semibold tracking-[0.16em] text-muted uppercase">
                  {group.options.length} types
                </span>
              </div>

              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {group.options.map((option, index) => (
                  <li
                    key={option.value}
                    className="group relative overflow-hidden border border-line bg-ink px-4 py-5 transition-transform hover:-translate-y-1"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-0 h-0.5 w-0 bg-accent transition-[width] duration-500 group-hover:w-full"
                    />
                    <span
                      aria-hidden="true"
                      className="block font-display text-sm leading-none tracking-[0.18em] text-muted transition-colors group-hover:text-accent"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="mt-3 block font-display text-xl leading-tight text-paper uppercase sm:text-2xl">
                      {option.label}
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
