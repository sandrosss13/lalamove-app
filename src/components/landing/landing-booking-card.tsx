"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { HOME_CONTAINER } from "@/components/landing/landing-home-styles";
import { LandingLink } from "@/components/landing/landing-link";
import {
  useLandingVehicleTypes,
  type LandingVehicleType,
} from "@/components/landing/landing-vehicle-types";
import { type QuoteCalculatorContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/** Where the card's button goes when the section row names no target. */
const DEFAULT_CTA_HREF = "/sign-up";

/**
 * The anchor id older authored links use to reach this section ("Price your
 * route" → `#price-a-load`). Kept so those links still land somewhere.
 */
const SECTION_ANCHOR_ID = "price-a-load";

const CATEGORY_ORDER: LandingVehicleType["category"][] = [
  "MEDIUM_DUTY",
  "HEAVY_DUTY",
];

const FIELD_LABEL = "text-[12px] font-semibold text-home-muted";

const FIELD_CONTROL =
  "h-[50px] w-full min-w-0 rounded-xl border border-home-line bg-home-field px-3.5 text-[15px] text-home-ink outline-none placeholder:text-home-muted/80 focus-visible:border-home-accent disabled:opacity-60";

/**
 * The v4 "Book a Delivery" card, pinned directly under the hero carousel (see
 * `PINNED_UNDER_HERO`) and pulled up over its bottom edge when the hero is on
 * the page.
 *
 * Deliberately shows no price. The v3 widget called `/api/pricing/estimate`;
 * v4 removes rates from the homepage entirely, so the card only collects the
 * route and vehicle as a prompt and hands the visitor to sign-up (or wherever
 * `ctaHref` points).
 */
export function LandingBookingCard({
  content,
  overlapsHero,
}: {
  content: QuoteCalculatorContent;
  /** True when the hero carousel renders directly above this card. */
  overlapsHero: boolean;
}) {
  const t = useTranslations("landing.landingBookingCard");
  const tDuty = useTranslations("admin.adminContentVehiclePhotos");
  const { vehicleTypes, loading } = useLandingVehicleTypes();
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [vehicle, setVehicle] = useState("");
  const fieldId = useId();

  const ctaLabel = content.ctaLabel?.trim() || t("defaultCta");
  const ctaHref = content.ctaHref?.trim() || DEFAULT_CTA_HREF;

  return (
    <section
      id={SECTION_ANCHOR_ID}
      className={cn(
        HOME_CONTAINER,
        "relative z-[5] scroll-mt-28",
        overlapsHero
          ? "-mt-[clamp(60px,6vw,84px)]"
          : "mt-[clamp(28px,4vw,48px)]",
      )}
    >
      <div className="overflow-hidden rounded-[1.25rem] bg-home-surface shadow-home-card">
        <div className="border-b border-home-line">
          <h2 className="m-0 px-[clamp(18px,2.2vw,26px)] py-5 text-[20px] font-semibold tracking-[-0.02em]">
            {content.heading}
          </h2>
        </div>
        <div className="grid items-end gap-3 p-[clamp(18px,2.2vw,26px)] [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          <label
            htmlFor={`${fieldId}-pickup`}
            className="flex min-w-0 flex-col gap-[7px]"
          >
            <span className={FIELD_LABEL}>{t("pickup")}</span>
            <input
              id={`${fieldId}-pickup`}
              type="text"
              autoComplete="off"
              value={pickup}
              onChange={(event) => setPickup(event.target.value)}
              placeholder={t("pickupPlaceholder")}
              className={FIELD_CONTROL}
            />
          </label>
          <label
            htmlFor={`${fieldId}-dropoff`}
            className="flex min-w-0 flex-col gap-[7px]"
          >
            <span className={FIELD_LABEL}>{t("dropoff")}</span>
            <input
              id={`${fieldId}-dropoff`}
              type="text"
              autoComplete="off"
              value={dropoff}
              onChange={(event) => setDropoff(event.target.value)}
              placeholder={t("dropoffPlaceholder")}
              className={FIELD_CONTROL}
            />
          </label>
          <label
            htmlFor={`${fieldId}-vehicle`}
            className="flex min-w-0 flex-col gap-[7px]"
          >
            <span className={FIELD_LABEL}>{t("vehicle")}</span>
            <select
              id={`${fieldId}-vehicle`}
              value={vehicle}
              disabled={loading}
              onChange={(event) => setVehicle(event.target.value)}
              className={cn(FIELD_CONTROL, "px-3")}
            >
              <option value="">
                {loading ? t("loadingVehicles") : t("anyVehicle")}
              </option>
              {/* Grouped by the real duty classes, the same two the
                  vehicles section tabs over. */}
              {CATEGORY_ORDER.map((category) => {
                const group = vehicleTypes.filter(
                  (vehicleType) => vehicleType.category === category,
                );
                if (group.length === 0) return null;
                return (
                  <optgroup
                    key={category}
                    label={tDuty(
                      category === "MEDIUM_DUTY" ? "mediumDuty" : "heavyDuty",
                    )}
                  >
                    {group.map((vehicleType) => (
                      <option key={vehicleType.code} value={vehicleType.code}>
                        {vehicleType.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
          <LandingLink
            href={ctaHref}
            className="flex min-h-[50px] items-center justify-center rounded-xl bg-home-accent px-[22px] py-[15px] text-center text-[15.5px] font-semibold text-home-night transition-colors hover:bg-home-accent-hover"
          >
            {ctaLabel}
          </LandingLink>
        </div>
      </div>
    </section>
  );
}
