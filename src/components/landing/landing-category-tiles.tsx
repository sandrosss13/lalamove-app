"use client";

import type { ReactElement } from "react";
import type { CargoCategory } from "@prisma/client";

import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  CARGO_CATEGORY_LABELS,
} from "@/lib/cargo";
import {
  useLandingVehicleTypes,
  type LandingVehicleType,
} from "@/components/landing/landing-vehicle-types";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type CategoryTilesContent,
} from "@/lib/admin/home-page-content";

/**
 * A short cross-town hop, used only to turn a pricing rule into a single
 * headline figure. Nothing is served at this distance — see `fromPrice`.
 */
const INDICATIVE_DISTANCE_KM = 5;

/** Stands in for a figure that needs the taxonomy, before the taxonomy lands. */
const EMPTY_FIGURE = "—";

function SofaGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M4 11V7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V11" />
      <path d="M4 11a2 2 0 0 1 2 2v2h12v-2a2 2 0 0 1 2-2" />
      <path d="M6 15v2.5M18 15v2.5" />
    </svg>
  );
}

function FridgeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
      <path d="M5.5 10h13" />
      <path d="M9 6v2M9 12.5v3" />
    </svg>
  );
}

function ShoppingBagGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M5 8h14l-1.2 12H6.2L5 8Z" />
      <path d="M9 8V6.2a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

function TrussGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M2.5 6.5h19" />
      <path d="M5 6.5V20M19 6.5V20" />
      <path d="M9 6.5v3M15 6.5v3" />
      <circle cx="9" cy="11.5" r="1.75" />
      <circle cx="15" cy="11.5" r="1.75" />
    </svg>
  );
}

function RelocationGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M2.5 10.5 9.5 4.5l7 6" />
      <path d="M4.5 12v7.5h10V12" />
      <path d="M7.5 19.5V14.5h4v5" />
      <path d="M18 15.5h3.5M19.75 13.75l1.75 1.75-1.75 1.75" />
    </svg>
  );
}

function DrumGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <ellipse cx="12" cy="5.5" rx="4" ry="1.75" />
      <path d="M8 5.5v8c0 1 1.8 1.75 4 1.75s4-.75 4-1.75v-8" />
      <path d="M8 9.75c0 1 1.8 1.75 4 1.75s4-.75 4-1.75" />
      <path d="M3 17.5h18" />
      <path d="M5 17.5V20M12 17.5V20M19 17.5V20" />
    </svg>
  );
}

function BricksGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
      <path d="M3 10h18M3 14h18" />
      <path d="M9 6v4M15 6v4M6.5 10v4M12 10v4M17.5 10v4M9 14v4M15 14v4" />
    </svg>
  );
}

/**
 * One glyph per cargo category. Written as an exhaustive `Record` so a new enum
 * member fails typecheck here rather than rendering a tile with no icon.
 */
const CATEGORY_GLYPHS: Record<CargoCategory, () => ReactElement> = {
  FURNITURE_FURNISHINGS: SofaGlyph,
  APPLIANCES: FridgeGlyph,
  RETAIL_STOCK: ShoppingBagGlyph,
  EVENT_EQUIPMENT: TrussGlyph,
  FULL_RELOCATION: RelocationGlyph,
  INDUSTRIAL_SUPPLIES: DrumGlyph,
  CONSTRUCTION_MATERIALS: BricksGlyph,
};

/** Cargo categories in the order the taxonomy declares them. */
const CARGO_CATEGORY_OPTIONS = Object.entries(CARGO_CATEGORY_LABELS) as [
  CargoCategory,
  string,
][];

/**
 * The cheapest vehicle type this cargo may legally travel in, or `null` while
 * the taxonomy is still loading.
 *
 * Same rule the quote calculator prices against, so a tile's "from" figure and
 * the vehicle the hero form would actually quote can never disagree.
 */
function cheapestEligibleVehicleType(
  vehicleTypes: LandingVehicleType[],
  cargoCategory: CargoCategory,
): LandingVehicleType | null {
  const allowedVehicleCategories =
    CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];
  const eligible = vehicleTypes.filter((vehicleType) =>
    allowedVehicleCategories.includes(vehicleType.category),
  );

  return eligible.length > 0
    ? eligible.reduce((cheapest, vehicleType) =>
        vehicleType.pricingRule.baseFare < cheapest.pricingRule.baseFare
          ? vehicleType
          : cheapest,
      )
    : null;
}

/**
 * An indicative floor, not a quote: the cheapest eligible vehicle's rule run
 * over a nominal short hop, with no driving time, helper or minimum fare in it.
 * The served price comes from `/api/pricing/estimate` against the real route,
 * which is what the hero calculator calls.
 */
function fromPrice(vehicleType: LandingVehicleType): number {
  const { baseFare, pricePerKm } = vehicleType.pricingRule;

  return Math.round(baseFare + pricePerKm * INDICATIVE_DISTANCE_KM);
}

/**
 * The cargo taxonomy as a shop window: every category the platform carries,
 * the lightest vehicle rated for it, and what it starts at. Each tile is a
 * plain anchor back to the hero calculator — the visitor prices their own route
 * there, so the tiles stay presentational rather than driving that form.
 *
 * Only the framing copy is authored: `content` comes from the matching
 * `HomePageSection` row when one exists, and falls back to the copy the page
 * has today when the locale has no rows yet. The tiles themselves are always
 * generated from the live cargo taxonomy.
 */
export function LandingCategoryTiles({
  content = DEFAULT_HOME_PAGE_CONTENT.category_tiles,
}: {
  content?: CategoryTilesContent;
}) {
  const { vehicleTypes } = useLandingVehicleTypes();

  return (
    <section
      id="ship"
      className="scroll-mt-16 border-b border-line bg-ink py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-accent uppercase">
          {content.eyebrow}
        </p>
        <h2 className="mt-4 max-w-2xl font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.025em] text-paper">
          {content.heading}
        </h2>
        <p className="mt-4 max-w-[54ch] text-base leading-relaxed text-muted">
          {content.intro}
        </p>

        <ul className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {CARGO_CATEGORY_OPTIONS.map(([cargoCategory, label]) => {
            const Glyph = CATEGORY_GLYPHS[cargoCategory];
            const vehicleType = cheapestEligibleVehicleType(
              vehicleTypes,
              cargoCategory,
            );

            return (
              <li key={cargoCategory}>
                <a
                  href="#price-a-load"
                  className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 transition-transform hover:-translate-y-1"
                >
                  <span className="text-muted transition-colors group-hover:text-accent">
                    <Glyph />
                  </span>
                  <span className="mt-2 font-display text-[0.9375rem] leading-snug font-semibold text-paper">
                    {label}
                  </span>
                  <span className="text-[0.8125rem] leading-snug text-muted">
                    {vehicleType ? vehicleType.label : EMPTY_FIGURE}
                  </span>
                  <span className="mt-auto pt-3 text-[0.8125rem] text-muted">
                    from{" "}
                    <span className="font-price font-semibold text-paper">
                      {vehicleType
                        ? `$${fromPrice(vehicleType)}`
                        : EMPTY_FIGURE}
                    </span>
                    <span className="sr-only"> — price your own route</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
