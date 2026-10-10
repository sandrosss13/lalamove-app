"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  HOME_CARD,
  HOME_CONTAINER,
  HOME_SECTION_HEADING,
  HOME_SECTION_INTRO,
  HOME_SECTION_SPACING,
} from "@/components/landing/landing-home-styles";
import { LandingLink } from "@/components/landing/landing-link";
import {
  useLandingVehicleTypes,
  type LandingVehicleType,
} from "@/components/landing/landing-vehicle-types";
import { type VehicleTypesContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/** Where a card's Book button goes: booking starts with an account. */
const BOOK_HREF = "/sign-up";

/**
 * The two real `VehicleCategory` values, lightest first. The tab label is the
 * authored `mediumDutyLabel` / `heavyDutyLabel`, falling back to the same
 * duty-class names the back office uses for a row written before those fields
 * existed. The design's three placeholder groups (Vans / Trucks / Specialised)
 * do not exist in the taxonomy and are not used.
 */
const CATEGORIES: {
  category: LandingVehicleType["category"];
  labelKey: "mediumDutyLabel" | "heavyDutyLabel";
  fallbackLabelKey: "mediumDuty" | "heavyDuty";
}[] = [
  {
    category: "MEDIUM_DUTY",
    labelKey: "mediumDutyLabel",
    fallbackLabelKey: "mediumDuty",
  },
  {
    category: "HEAVY_DUTY",
    labelKey: "heavyDutyLabel",
    fallbackLabelKey: "heavyDuty",
  },
];

/** Drawn when a vehicle type has no photo uploaded yet. */
function VehicleGlyph() {
  return (
    <svg
      viewBox="0 0 48 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="h-12 w-24"
    >
      <path d="M1 18V4h25v14" />
      <path d="M26 9h9l6 6v3" />
      <path d="M1 18h4M15 18h13M38 18h9" />
      <circle cx="10" cy="18" r="3" />
      <circle cx="33" cy="18" r="3" />
    </svg>
  );
}

/**
 * The v4 vehicles section: heading and intro (authored), a pill tab per duty
 * class, and a card per vehicle type in the selected class — photo, name and a
 * Book button. Types and photos come from the live taxonomy
 * (`/api/vehicle-types`); no payloads and no prices, per the design.
 *
 * Hidden entirely when the taxonomy comes back empty or fails, so the page
 * never frames an empty catalogue.
 */
export function LandingVehicleCatalog({
  content,
}: {
  content: VehicleTypesContent;
}) {
  const t = useTranslations("landing.landingVehicleCatalog");
  const tDuty = useTranslations("admin.adminContentVehiclePhotos");
  const { vehicleTypes, loading } = useLandingVehicleTypes();
  const [selected, setSelected] =
    useState<LandingVehicleType["category"]>("MEDIUM_DUTY");

  const tabs = CATEGORIES.map((entry) => ({
    ...entry,
    label: content[entry.labelKey]?.trim() || tDuty(entry.fallbackLabelKey),
    types: vehicleTypes.filter(
      (vehicleType) => vehicleType.category === entry.category,
    ),
  })).filter((tab) => loading || tab.types.length > 0);

  if (!loading && tabs.length === 0) {
    return null;
  }

  // The selected class may have no types on this deployment; fall back to the
  // first class that does rather than showing an empty grid.
  const activeTab = tabs.find((tab) => tab.category === selected) ?? tabs[0];

  return (
    <section
      id="vehicles"
      className={cn(HOME_CONTAINER, HOME_SECTION_SPACING, "scroll-mt-28")}
    >
      <div
        data-reveal
        className="mb-6 flex flex-wrap items-end justify-between gap-[18px]"
      >
        <div>
          <h2 className={cn(HOME_SECTION_HEADING, "mb-2")}>
            {content.heading}
          </h2>
          {content.intro ? (
            <p className={cn(HOME_SECTION_INTRO, "max-w-[52ch]")}>
              {content.intro}
            </p>
          ) : null}
        </div>
        {tabs.length > 1 ? (
          <div
            role="tablist"
            aria-label={content.heading}
            className="inline-flex flex-wrap rounded-full border border-home-line bg-home-surface p-1"
          >
            {tabs.map((tab) => {
              const isActive = tab.category === activeTab?.category;
              return (
                <button
                  key={tab.category}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelected(tab.category)}
                  className={cn(
                    "rounded-full px-[18px] py-2.5 text-[14px] font-semibold transition-colors",
                    isActive
                      ? "bg-home-btn-bg text-home-btn-fg"
                      : "text-home-muted hover:text-home-ink",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <ul
        role="tabpanel"
        aria-busy={loading || undefined}
        className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
      >
        {loading
          ? // Three blank cards hold the section's height while the taxonomy
            // loads, so the page below does not jump when it arrives.
            [0, 1, 2].map((placeholder) => (
              <li
                key={placeholder}
                aria-hidden="true"
                className={cn(HOME_CARD, "h-[262px] animate-pulse")}
              >
                <div className="h-[190px] bg-home-slot" />
              </li>
            ))
          : activeTab?.types.map((vehicleType) => (
              <li
                key={vehicleType.code}
                className={cn(HOME_CARD, "flex flex-col")}
              >
                <div className="flex h-[190px] items-center justify-center bg-home-slot text-home-muted/50">
                  {vehicleType.imageUrl ? (
                    // Plain <img>: CMS photo URLs can point at any host.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={vehicleType.imageUrl}
                      alt={vehicleType.label}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <VehicleGlyph />
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 px-[22px] pt-[18px] pb-5">
                  <h3 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">
                    {vehicleType.label}
                  </h3>
                  <LandingLink
                    href={BOOK_HREF}
                    ariaLabel={t("bookVehicle", { vehicle: vehicleType.label })}
                    className="rounded-full bg-home-chip px-3.5 py-[9px] text-[13.5px] font-semibold whitespace-nowrap text-home-ink transition-colors hover:bg-home-line"
                  >
                    {t("book")}
                  </LandingLink>
                </div>
              </li>
            ))}
      </ul>
    </section>
  );
}
