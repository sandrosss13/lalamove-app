"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { formatGel } from "@/components/home/booking-format";
import {
  PICK_CARD_BASE_CLASSES,
  PICK_CARD_IDLE_CLASSES,
  PICK_CARD_SELECTED_CLASSES,
  SelectedTick,
  TruckGlyph,
  VanGlyph,
} from "@/components/home/booking-form-primitives";
import {
  formatVehicleDimensions,
  formatVehiclePayload,
  type OrderVehicleType,
} from "@/components/home/order-vehicle-types";
import type { VehicleChoice } from "@/lib/orders/load-plan";

/**
 * Step 5 of the booking form, as most clients see it: the vehicle the form
 * recommends for the listed items, and the one a size above it — two cards,
 * not the eleven-class grid.
 *
 * Presentation only. Which two classes these are is `recommendVehicles`'
 * answer (`src/lib/orders/load-plan.ts`), computed by the form over the classes
 * the booking could actually be placed against; this component neither ranks
 * nor filters. Which card is selected, and whether the form keeps following the
 * recommendation, is the form's state (`vehicle-selection.ts`) — a click here
 * only reports which class was picked.
 *
 * Native radios in a `fieldset`, each `sr-only` inside the card that draws it:
 * the newer house pattern the load-space and crew-size pickers use, for the
 * same free arrow-key handling and "1 of 2" announcement. The full grid behind
 * "Change vehicle" is the older `aria-pressed` button pattern, left as it is.
 */

/**
 * Which glyph stands for which duty class. Mirrors the form's own table; a
 * `Record` so a new duty class fails typecheck here as well.
 */
const CATEGORY_GLYPHS: Record<
  OrderVehicleType["category"],
  (props: { className?: string }) => React.ReactElement
> = {
  MEDIUM_DUTY: VanGlyph,
  HEAVY_DUTY: TruckGlyph,
};

/**
 * The pick-card geometry, plus what a `<label>` around an `sr-only` radio has
 * to draw for itself: the pointer, and a focus ring on the hidden input's
 * behalf. The same composition as the form's load-space cards.
 */
const OPTION_CLASSES = `${PICK_CARD_BASE_CLASSES} cursor-pointer has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20`;

/** The "Recommended" pill: the same treatment as the grid's `Best` pill. */
const RECOMMENDED_PILL_CLASSES =
  "rounded-full bg-emerald-600/10 px-2 py-0.5 text-[0.5625rem] font-semibold tracking-[0.1em] text-emerald-700 uppercase dark:bg-emerald-400/15 dark:text-emerald-300";

/** The "One size up" eyebrow: neutral, since it is an alternative, not advice. */
const ALTERNATIVE_EYEBROW_CLASSES =
  "text-[0.5625rem] font-semibold tracking-[0.1em] text-muted uppercase";

export function VehicleRecommendation({
  recommended,
  oneSizeUp,
  selectedCode,
  quotedPrice,
  vehicleLabel,
  onSelect,
}: {
  /** Never `null` here: the form shows its own alert when nothing is bookable. */
  recommended: VehicleChoice<OrderVehicleType>;
  oneSizeUp: VehicleChoice<OrderVehicleType> | null;
  selectedCode: string;
  /**
   * The quoted fare for the *selected* class, or `null` before Calculate. Only
   * the selected class can have one — any vehicle change drops the quote — so
   * it is printed on whichever of these two cards is selected, if either is.
   */
  quotedPrice: number | null;
  vehicleLabel: (vehicleType: OrderVehicleType) => string;
  /** Any click on a card, including on the one already selected. */
  onSelect: (code: string) => void;
}): React.ReactElement {
  const t = useTranslations("home.bookingForm");
  const groupName = useId();

  const mayNotFit = recommended.fit.verdict === "may_not_fit";

  const options: {
    choice: VehicleChoice<OrderVehicleType>;
    eyebrow: string;
    /** One line under the capacity, or `null`. */
    note: string | null;
    primary: boolean;
  }[] = [
    {
      choice: recommended,
      eyebrow: t("recommended"),
      // `may_not_fit` is the only way the recommendation can be soft: there is
      // no class that comfortably `fits`, and `recommendVehicles` then offers
      // no size up either. The card says so in the grid's own words, and the
      // sentence under the group says what to do about it.
      note: mayNotFit ? t("mayNotFitItems") : null,
      primary: true,
    },
    ...(oneSizeUp
      ? [
          {
            choice: oneSizeUp,
            eyebrow: t("oneSizeUp"),
            note: t("moreRoomForPeaceOfMind"),
            primary: false,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <fieldset>
        <legend className="sr-only">{t("recommendedVehicle")}</legend>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {options.map(({ choice, eyebrow, note, primary }) => {
            const vehicleType = choice.spec;
            const selected = vehicleType.code === selectedCode;
            const Glyph = CATEGORY_GLYPHS[vehicleType.category];
            const dimensions = formatVehicleDimensions(
              vehicleType.cargoLengthM,
              vehicleType.cargoWidthM,
              vehicleType.cargoHeightM,
            );
            const payload = t("specUpTo", {
              weight: formatVehiclePayload(vehicleType.maxPayloadKg),
            });
            const price =
              selected && quotedPrice !== null ? formatGel(quotedPrice) : null;

            // Spoken from the radio, with the card's visible text hidden, so
            // the lines arrive as one name in reading order — the load-space
            // cards' arrangement.
            const accessibleName = [
              `${eyebrow}: ${vehicleLabel(vehicleType)}`,
              dimensions,
              payload,
              note,
              price,
            ]
              .filter((part): part is string => Boolean(part))
              .join(" · ");

            return (
              <label
                key={vehicleType.code}
                className={`${OPTION_CLASSES} ${
                  selected ? PICK_CARD_SELECTED_CLASSES : PICK_CARD_IDLE_CLASSES
                }`}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={vehicleType.code}
                  checked={selected}
                  // Both handlers, deliberately. `change` alone never fires for
                  // the card already checked, and a click on it is still the
                  // client choosing it — the form stops following the
                  // recommendation on any click (`vehicleChosenByClient`).
                  // `onSelect` is idempotent, so the pair firing together on a
                  // fresh pick costs nothing.
                  onChange={() => onSelect(vehicleType.code)}
                  onClick={() => onSelect(vehicleType.code)}
                  aria-label={accessibleName}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="flex items-start justify-between gap-2"
                >
                  <Glyph
                    className={`h-6 w-12 shrink-0 ${
                      selected ? "text-accent" : "text-muted"
                    }`}
                  />
                  <span
                    className={`${
                      primary
                        ? RECOMMENDED_PILL_CLASSES
                        : ALTERNATIVE_EYEBROW_CLASSES
                    } ${selected ? "mr-5" : ""}`}
                  >
                    {eyebrow}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="mt-2.5 pr-4 text-[0.8125rem] leading-snug font-semibold text-paper"
                >
                  {vehicleLabel(vehicleType)}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-price text-[0.6875rem] text-muted"
                >
                  <span>{dimensions}</span>
                  <span>{payload}</span>
                </span>
                {note !== null ? (
                  <span
                    aria-hidden="true"
                    className="mt-1.5 text-[0.6875rem] leading-snug font-medium text-muted"
                  >
                    {note}
                  </span>
                ) : null}
                {price !== null ? (
                  <span
                    aria-hidden="true"
                    className="mt-2 font-price text-sm font-semibold text-paper tabular-nums"
                  >
                    {price}
                  </span>
                ) : null}
                {selected ? <SelectedTick /> : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* A status, not an alert: soft fit steers and never refuses, here or
          on the server, so it is worth hearing once without interrupting. */}
      {mayNotFit ? (
        <p
          role="status"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-snug text-muted"
        >
          {t("mayNotFitSplitBooking")}
        </p>
      ) : null}
    </div>
  );
}
