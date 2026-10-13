"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

import {
  AddressAutocomplete,
  type AddressAutocompleteClassNames,
} from "@/components/address-autocomplete";
import { writeBookingDraft } from "@/components/home/booking-draft";
import { HOME_CONTAINER } from "@/components/landing/landing-home-styles";
import { LandingLink } from "@/components/landing/landing-link";
import {
  LANDING_GOODS_SHORTCUTS,
  subscribeLandingGoods,
} from "@/components/landing/landing-goods";
import { type QuoteCalculatorContent } from "@/lib/admin/home-page-content";
import { withGoodsParam } from "@/lib/goods-param-threading";
import {
  isGoodsShortcutCode,
  type GoodsShortcutCode,
} from "@/lib/goods-shortcuts";
import { cn } from "@/lib/utils";

/** Where the card's button goes when the section row names no target. */
const DEFAULT_CTA_HREF = "/book";

/**
 * The target the card used to send everyone to, before signed-out visitors
 * could book. A section row authored back then still stores it; it is read as
 * the booking page so the hand-off works without an admin edit.
 */
const LEGACY_CTA_HREF = "/sign-up";

type LatLng = { lat: number; lng: number };

/**
 * The anchor id older authored links use to reach this section ("Price your
 * route" → `#price-a-load`). Kept so those links still land somewhere.
 */
const SECTION_ANCHOR_ID = "price-a-load";

const FIELD_LABEL = "text-[12px] font-semibold text-home-muted";

const FIELD_CONTROL =
  "h-[50px] w-full min-w-0 rounded-xl border border-home-line bg-home-field px-3.5 text-[15px] text-home-ink outline-none placeholder:text-home-muted/80 focus-visible:border-home-accent disabled:opacity-60";

/**
 * Dresses the shared address autocomplete in the card's own field styles. The
 * suggestions list floats over the row (and the sections below) rather than
 * stretching the grid, and uses the `home-*` surface tokens so it reads in both
 * the light and dark landing themes.
 */
const ADDRESS_FIELD_CLASS_NAMES = {
  root: "flex min-w-0 flex-col",
  label: "flex min-w-0 flex-col gap-[7px]",
  labelText: FIELD_LABEL,
  input: FIELD_CONTROL,
  listbox:
    "max-h-60 overflow-y-auto rounded-xl border border-home-line bg-home-surface py-1 text-[14px] text-home-ink shadow-home-lift",
  option:
    "block w-full px-3.5 py-2.5 text-left hover:bg-home-chip focus-visible:bg-home-chip focus-visible:outline-none",
} satisfies AddressAutocompleteClassNames;

/**
 * The v4 "Book a Delivery" card, pinned directly under the hero carousel (see
 * `PINNED_UNDER_HERO`) and pulled up over its bottom edge when the hero is on
 * the page.
 *
 * Deliberately shows no price. The v3 widget called `/api/pricing/estimate`;
 * v4 removes rates from the homepage entirely, so the card only collects the
 * route and what is being moved, and hands them on.
 *
 * Goods-first booking (specs/goods-first-booking, task 07): the card asks what
 * the visitor is moving — the goods shortcuts — rather than which vehicle they
 * want, because the vehicle is recommended from their items at booking time.
 * The chosen shortcut rides on the CTA as `?goods=<code>` (only a validated
 * code travels, `goods-param-threading.ts`), which survives sign-up and sign-in
 * when a section row still points there.
 *
 * Guest checkout: the CTA leads to `/book` by default (a stored legacy
 * `/sign-up` is read as `/book`), and on the way the card also writes the
 * addresses, their coordinates and the shortcut to a `sessionStorage` draft
 * (see `booking-draft.ts`) so the booking form opens with them prefilled. The
 * draft is written only when the button actually leads to `/book`; a section
 * row pointing somewhere else just navigates there.
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
  const tGoods = useTranslations("common.goodsShortcut");
  const [pickup, setPickup] = useState("");
  const [pickupLocation, setPickupLocation] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState<LatLng | null>(null);
  // No default: a visitor who picks nothing books without a shortcut and starts
  // the booking form at step 3, as before.
  const [goods, setGoods] = useState<GoodsShortcutCode | null>(null);
  const fieldId = useId();

  // A category tile elsewhere on the page (a legacy CMS row) picked a
  // shortcut: select it here, as if the visitor had clicked it in this card.
  useEffect(() => subscribeLandingGoods(setGoods), []);

  const ctaLabel = content.ctaLabel?.trim() || t("defaultCta");
  const authoredHref = content.ctaHref?.trim() || DEFAULT_CTA_HREF;
  const baseHref =
    authoredHref === LEGACY_CTA_HREF ? DEFAULT_CTA_HREF : authoredHref;
  const leadsToBooking =
    baseHref === DEFAULT_CTA_HREF ||
    baseHref.startsWith(`${DEFAULT_CTA_HREF}?`);
  // `withGoodsParam` already leaves anything that is not a root-relative app
  // path untouched (and drops a code that fails validation). A path carrying a
  // fragment is left alone too, since a query appended after `#` would be
  // part of the fragment, not the query.
  const ctaHref = baseHref.includes("#")
    ? baseHref
    : withGoodsParam(baseHref, goods);

  // Runs on click, before the client-side navigation the link performs, so the
  // booking form finds the draft on its first mount.
  function handleCtaClick() {
    if (!leadsToBooking) {
      return;
    }
    writeBookingDraft({
      pickupAddress: pickup.trim(),
      pickupLocation,
      dropoffAddress: dropoff.trim(),
      dropoffLocation,
      goods,
    });
  }

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
      {/* No `overflow-hidden`: the address suggestions float out past the
          card's bottom edge and must not be clipped. Nothing inside paints a
          background into the rounded corners, so none is needed. */}
      <div className="rounded-[1.25rem] bg-home-surface shadow-home-card">
        <div className="border-b border-home-line">
          <h2 className="m-0 px-[clamp(18px,2.2vw,26px)] py-5 text-[20px] font-semibold tracking-[-0.02em]">
            {content.heading}
          </h2>
        </div>
        {/* One row on wide screens — Pickup, Drop-off, what is being moved,
            then the button — two columns on a tablet and a single stack on a
            phone. The button column is `auto` so its label never wraps; the
            goods select takes a little less than an address, since its longest
            option is a couple of words. */}
        <div className="grid grid-cols-1 items-end gap-3 p-[clamp(18px,2.2vw,26px)] sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
          <AddressAutocomplete
            id={`${fieldId}-pickup`}
            label={t("pickup")}
            value={pickup}
            onChange={setPickup}
            onLocationChange={setPickupLocation}
            placeholder={t("pickupPlaceholder")}
            classNames={ADDRESS_FIELD_CLASS_NAMES}
            overlaySuggestions
            showMapPreview={false}
          />
          <AddressAutocomplete
            id={`${fieldId}-dropoff`}
            label={t("dropoff")}
            value={dropoff}
            onChange={setDropoff}
            onLocationChange={setDropoffLocation}
            placeholder={t("dropoffPlaceholder")}
            classNames={ADDRESS_FIELD_CLASS_NAMES}
            overlaySuggestions
            showMapPreview={false}
          />
          {/* The goods shortcuts as a native select: a short fixed list, so
              the shadcn `Select` portal is not worth it, and the native popup
              follows the theme through the global `color-scheme` on
              `html.dark`. The placeholder stays choosable, so a visitor can
              go back to "nothing chosen" — the CTA then carries no shortcut.
              Picking one only decides which shortcut the CTA carries. */}
          <div className="flex min-w-0 flex-col gap-[7px]">
            <label htmlFor={`${fieldId}-goods`} className={FIELD_LABEL}>
              {t("whatAreYouMoving")}
            </label>
            <div className="relative">
              <select
                id={`${fieldId}-goods`}
                value={goods ?? ""}
                onChange={(event) => {
                  const { value } = event.target;
                  setGoods(isGoodsShortcutCode(value) ? value : null);
                }}
                className={cn(
                  FIELD_CONTROL,
                  "cursor-pointer appearance-none pr-10",
                  goods === null && "text-home-muted",
                )}
              >
                <option value="">{t("goodsPlaceholder")}</option>
                {LANDING_GOODS_SHORTCUTS.map((shortcut) => (
                  <option
                    key={shortcut.code}
                    value={shortcut.code}
                    className="text-home-ink"
                  >
                    {tGoods(`${shortcut.code as GoodsShortcutCode}.title`)}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 text-home-muted"
              />
            </div>
          </div>
          <LandingLink
            href={ctaHref}
            onClick={handleCtaClick}
            className="flex min-h-[50px] items-center justify-center rounded-xl bg-home-accent px-[22px] py-[15px] text-center text-[15.5px] font-semibold whitespace-nowrap text-home-night transition-colors hover:bg-home-accent-hover"
          >
            {ctaLabel}
          </LandingLink>
        </div>
      </div>
    </section>
  );
}
