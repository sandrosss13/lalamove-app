"use client";

import type { CargoCategory } from "@prisma/client";
import { useTranslations } from "next-intl";

import { CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES } from "@/lib/cargo";
import { formatGel } from "@/components/landing/landing-format";
import {
  LANDING_GOODS_SHORTCUTS,
  SHORTCUT_ESTIMATE_CARGO_CATEGORY,
  preselectLandingGoods,
} from "@/components/landing/landing-goods";
import {
  useLandingVehicleTypes,
  type LandingVehicleType,
} from "@/components/landing/landing-vehicle-types";
import { type CategoryTilesContent } from "@/lib/admin/home-page-content";
import type { GoodsShortcutCode } from "@/lib/goods-shortcuts";

/**
 * A short cross-town hop, used only to turn a pricing rule into a single
 * headline figure. Nothing is served at this distance — see `fromPrice`.
 */
const INDICATIVE_DISTANCE_KM = 5;

/** Stands in for a figure that needs the taxonomy, before the taxonomy lands. */
const EMPTY_FIGURE = "—";

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
 * The goods shortcuts as a shop window: what a visitor might be moving, the
 * lightest vehicle typically rated for it, and what it starts at. Each tile is
 * an anchor to the booking card that also selects its shortcut there
 * (`preselectLandingGoods`), so the visitor lands on a card already asking
 * about the right goods and only has to type the route.
 *
 * The vehicle and "from" figure are priced on a stand-in cargo category per
 * shortcut (`SHORTCUT_ESTIMATE_CARGO_CATEGORY`); the order's real category is
 * still derived from the items at booking time.
 *
 * Not part of the default page (`DEFAULT_HOME_PAGE_SECTION_ORDER`) — this only
 * renders for a CMS row authored against an earlier design. Only the framing
 * copy is authored: `content` comes from that row, and the tiles themselves are
 * always generated from the shortcut table and the live vehicle taxonomy.
 */
export function LandingCategoryTiles({
  content,
}: {
  content: CategoryTilesContent;
}) {
  const t = useTranslations("landing.landingCategoryTiles");
  const tGoods = useTranslations("common.goodsShortcut");
  const { vehicleTypes } = useLandingVehicleTypes();

  return (
    <section
      id="ship"
      className="scroll-mt-28 border-b border-line bg-ink py-20 sm:py-28"
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
          {LANDING_GOODS_SHORTCUTS.map((shortcut) => {
            const code = shortcut.code as GoodsShortcutCode;
            const { Icon } = shortcut;
            const vehicleType = cheapestEligibleVehicleType(
              vehicleTypes,
              SHORTCUT_ESTIMATE_CARGO_CATEGORY[code],
            );

            return (
              <li key={code}>
                <a
                  href="#price-a-load"
                  // The default action still runs: the anchor scrolls to the
                  // booking card, which has just been told which tile to select.
                  onClick={() => preselectLandingGoods(code)}
                  className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 transition-transform hover:-translate-y-1"
                >
                  <span className="text-muted transition-colors group-hover:text-accent">
                    <Icon
                      aria-hidden="true"
                      strokeWidth={1.5}
                      className="h-7 w-7"
                    />
                  </span>
                  <span className="mt-2 font-display text-[0.9375rem] leading-snug font-semibold text-paper">
                    {tGoods(`${code}.title`)}
                  </span>
                  <span className="text-[0.8125rem] leading-snug text-muted">
                    {vehicleType ? vehicleType.label : EMPTY_FIGURE}
                  </span>
                  <span className="mt-auto pt-3 text-[0.8125rem] text-muted">
                    {/* Rich rather than plain so the figure keeps its own
                        weight: where it sits in the sentence differs by
                        language ("from ₾40" / "₾40-დან"). */}
                    {t.rich("fromPriceEmphasised", {
                      price: vehicleType
                        ? formatGel(fromPrice(vehicleType))
                        : EMPTY_FIGURE,
                      figure: (chunks) => (
                        <span className="font-price font-semibold text-paper">
                          {chunks}
                        </span>
                      ),
                    })}
                    <span className="sr-only"> {t("priceYourOwnRoute")}</span>
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
