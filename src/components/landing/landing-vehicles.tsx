"use client";

import Link from "next/link";
import type { ReactElement } from "react";

import {
  useLandingVehicleTypes,
  type LandingVehicleType,
} from "@/components/landing/landing-vehicle-types";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type VehicleTypesContent,
} from "@/lib/admin/home-page-content";

const CARD_CLASSES =
  "overflow-hidden rounded-3xl border border-line bg-surface";

const GROUP_LABEL_CLASSES =
  "font-price text-[11px] tracking-[.18em] text-accent uppercase";

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
 * The two real `VehicleCategory` values, in the order the page shows them —
 * lightest first — each with the glyph a card falls back to when its type has
 * no photograph yet.
 *
 * The design's three groups over nine placeholder types are not used: the
 * catalogue has exactly two duty classes, and the types inside them come from
 * `/api/vehicle-types` at runtime rather than from a list typed here.
 *
 * The enum value is fixed — it drives matching and pricing — but the heading a
 * visitor reads above each group is authored copy, taken from
 * `VehicleTypesContent`'s `mediumDutyLabel` / `heavyDutyLabel`. `fallbackLabel`
 * is what renders when a row predates those fields (both are optional so an
 * older row still parses).
 */
const CATEGORY_ORDER: {
  category: LandingVehicleType["category"];
  fallbackLabel: string;
  labelKey: "mediumDutyLabel" | "heavyDutyLabel";
  glyph: () => ReactElement;
}[] = [
  {
    category: "MEDIUM_DUTY",
    fallbackLabel: "Medium duty",
    labelKey: "mediumDutyLabel",
    glyph: VanGlyph,
  },
  {
    category: "HEAVY_DUTY",
    fallbackLabel: "Heavy duty",
    labelKey: "heavyDutyLabel",
    glyph: TruckGlyph,
  },
];

/**
 * Only the framing copy is authored: `content` comes from the matching
 * `HomePageSection` row when one exists, and falls back to the copy the page
 * has today otherwise. The duty classes and their vehicles always come from the
 * live taxonomy.
 *
 * A card shows a name and a photograph and nothing else — no payload, no
 * dimensions and above all no price. The platform does not quote a fare until a
 * route is entered, so this section must not read as a rate card.
 */
export function LandingVehicles({
  content = DEFAULT_HOME_PAGE_CONTENT.vehicle_types,
}: {
  content?: VehicleTypesContent;
}) {
  const { vehicleTypes } = useLandingVehicleTypes();
  const businessPanel = content.businessPanel;

  return (
    <section
      id="vehicles"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[clamp(32px,3.6vw,52px)]">
        <div
          data-reveal
          className="flex flex-wrap items-end justify-between gap-8"
        >
          <div className="flex flex-col gap-4">
            <p className={GROUP_LABEL_CLASSES}>{content.eyebrow}</p>
            <h2 className="max-w-[16ch] font-display text-[clamp(30px,4.6vw,62px)] leading-none font-semibold tracking-[-.045em] text-balance text-paper">
              {content.heading}
            </h2>
          </div>
          {content.intro ? (
            <p className="max-w-[44ch] text-[16px] leading-[1.6] text-pretty text-muted">
              {content.intro}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-[clamp(26px,3vw,40px)]">
          {CATEGORY_ORDER.map(
            ({ category, fallbackLabel, labelKey, glyph: Glyph }) => {
              const label = content[labelKey] ?? fallbackLabel;
              const grouped = vehicleTypes.filter(
                (vehicleType) => vehicleType.category === category,
              );

              // Nothing to show until the taxonomy lands (or if it never does) —
              // the section keeps its heading rather than framing empty rows.
              if (grouped.length === 0) {
                return null;
              }

              return (
                <div key={category} data-reveal>
                  <div className="flex items-center gap-4">
                    <h3 className={GROUP_LABEL_CLASSES}>{label}</h3>
                    <span
                      aria-hidden="true"
                      className="h-px flex-1 bg-line-strong"
                    />
                  </div>

                  <ul className="mt-5 grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                    {grouped.map((vehicleType) => (
                      <li key={vehicleType.code} className={CARD_CLASSES}>
                        <div className="relative h-[140px] border-b border-line-hairline">
                          {vehicleType.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={vehicleType.imageUrl}
                              alt={vehicleType.label}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            // No photo uploaded for this type yet — the section's
                            // own glyph rather than an empty box, so an
                            // unphotographed catalogue still reads as one.
                            <div className="flex h-full items-center justify-center text-accent/40">
                              <span className="block scale-[2.2]">
                                <Glyph />
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="px-[22px] pt-[18px] pb-[22px] text-[17px] font-semibold tracking-[-.02em] text-paper">
                          {vehicleType.label}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            },
          )}
        </div>

        {businessPanel ? (
          <div
            data-reveal
            className={`${CARD_CLASSES} flex flex-wrap items-center justify-between gap-6 p-[clamp(24px,2.8vw,34px)]`}
          >
            <div className="flex flex-col gap-2">
              <h3 className="text-[18px] font-semibold text-paper">
                {businessPanel.title}
              </h3>
              <p className="max-w-[52ch] text-[14.5px] leading-[1.6] text-pretty text-muted">
                {businessPanel.body}
              </p>
            </div>
            <Link
              href={businessPanel.ctaHref}
              className="inline-flex shrink-0 items-center rounded-full bg-paper px-6 py-3 text-[15px] font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              {businessPanel.ctaLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
