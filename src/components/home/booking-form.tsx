"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { CargoCategory, ChassisType, ServiceLevel } from "@prisma/client";

import { Link, useRouter } from "@/i18n/navigation";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { takeBookingDraft } from "@/components/home/booking-draft";
import {
  bookButtonLabelKey,
  uploadCargoPhotoBlobs,
  type SubmitPhase,
} from "@/components/home/booking-submit";
import { formatDistanceKm, formatGel } from "@/components/home/booking-format";
import {
  HELPER_TIME_NOTE_VALUES,
  NO_LOCATION_HELP,
  helperTimeNoteValues,
  isQuoteExpired,
  locationHelpBody,
  locationHelpFromOrder,
  minimumFareApplied,
  pricingRefusalOf,
  quotedTotalChanged,
  transportCharge,
  type HelperTimeNoteValues,
  type LocationHelp,
} from "@/components/home/booking-pricing";
import {
  HelperLocationsField,
  type HelperEnd,
} from "@/components/home/helper-locations-field";
import {
  BreakdownRow,
  PICK_CARD_BASE_CLASSES,
  PICK_CARD_IDLE_CLASSES,
  PICK_CARD_SELECTED_CLASSES,
  SelectedTick,
  StepCard,
  TruckGlyph,
  VanGlyph,
} from "@/components/home/booking-form-primitives";
import {
  CargoPhotosField,
  MAX_CARGO_PHOTOS,
  useCargoPhotos,
} from "@/components/home/cargo-photos-field";
import {
  addPalletLine,
  activeLines,
  effectiveMode,
  inferPalletContents,
  linesFromOrderItems,
  toItemsPayload,
  toLoadLines,
  type PickerLine,
  type PickerMode,
  type StoredOrderItem,
} from "@/components/home/item-list-lines";
import { ItemListPicker } from "@/components/home/item-list-picker";
import {
  parseCatalogueLocale,
  useItemCatalogue,
} from "@/components/home/order-item-catalogue";
import {
  formatVehicleDimensions,
  formatVehiclePayload,
  useOrderVehicleTypes,
  vehicleOfferedToClient,
  vehicleOffersBody,
  type OrderVehicleType,
} from "@/components/home/order-vehicle-types";
import { RoutePreviewMap } from "@/components/home/route-preview-map";
import {
  StopContactDialog,
  type StopContact,
} from "@/components/home/stop-contact-dialog";
import { useClientAccountType } from "@/components/home/use-client-account-type";
import { VehicleRecommendation } from "@/components/home/vehicle-recommendation";
import {
  reconcileVehicleSelection,
  selectionOutsideRecommendation,
  type VehicleReleaseReason,
} from "@/components/home/vehicle-selection";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES } from "@/lib/cargo";
import type { CargoAxis } from "@/lib/orders/booking-fit";
// The one fit vocabulary this form and `POST /api/orders` share. Imported, never
// re-implemented here: a client-side copy of these comparisons is exactly how the
// form came to light a submit button for 15 m of cargo in a 4.5 m Box Truck while
// every server-side path went on refusing it. `planLoad` is the function the
// route re-runs on the items it is sent, and `assessFit` judges a class through
// `oversizeAxes(…, specCapability(spec))` — the route's own hard check, and the
// only sanctioned way to read a spec's four figures: it routes through
// `capabilityOf`, which translates `VehicleTypeSpec.cargoHeightM: 0` ("open bed,
// no height limit", seeded that way for FLATBED_TRUCK) into `Infinity`. Comparing
// against `vehicleType.cargoHeightM` directly would read that sentinel literally
// and block every flatbed booking on this page.
import {
  assessFit,
  planLoad,
  recommendVehicles,
  type FitAssessment,
  type LoadPlan,
} from "@/lib/orders/load-plan";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";
import {
  GOODS_SHORTCUTS,
  isGoodsShortcutCode,
  shortcutsFor,
  type GoodsShortcut,
  type GoodsShortcutCode,
} from "@/lib/goods-shortcuts";

/** A single map coordinate, as `AddressAutocomplete` reports it. Mirrors
 *  `LatLng` from `@/lib/geo`, duplicated here so this client component never
 *  imports the server-only geo module — the same reflex as
 *  `route-preview-map.tsx` and `address-autocomplete.tsx`. */
type LatLng = {
  lat: number;
  lng: number;
};

/**
 * The fare breakdown `/api/pricing/estimate` returns, together with the route
 * it was computed over.
 *
 * `routePath`, `durationMinutes`, `pickup` and `dropoff` are optional even
 * though the endpoint answers with all four, because the payload is *cast*
 * rather than parsed (see `handleCalculate`): the type is written for what this
 * form is prepared to do without, not for what a well-behaved server sends.
 * Nothing about the price reads them — every one is consumed through a `??`
 * fallback by the preview map alone, which draws the line and places the
 * markers.
 */
type Quote = {
  distanceKm: number;
  /**
   * The road geometry of the quoted route, or `null` when the server could not
   * route and priced on straight-line distance instead.
   */
  routePath?: LatLng[] | null;
  /** Driving time for the quoted route, on whichever of those two bases. */
  durationMinutes?: number | null;
  /**
   * The pickup/dropoff points LocationIQ resolved the addresses to — the exact
   * coordinates the route and the price are based on, which is not always what
   * Google's Places autocomplete pinned for the same address (a long street can
   * resolve to a different point along it). Once an estimate exists, the map
   * should show its markers here rather than at the Places pin, so the route
   * line drawn between them actually touches both markers.
   */
  pickup?: LatLng | null;
  dropoff?: LatLng | null;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  /**
   * Pricing model v1: the intercity return-leg charge. Optional because an
   * order row booked before v1 has 0 and older responses may omit it.
   */
  returnFare?: number;
  /**
   * Pricing model v1, all from `/api/pricing/estimate`: whether the trip is
   * priced as city or intercity, the transport charge as one figure (floored
   * at the city minimum), and the helper charge split by location.
   */
  tripType?: "CITY" | "INTERCITY";
  transportFare?: number;
  pickupHelperFee?: number;
  dropoffHelperFee?: number;
  helperFee: number;
  price: number;
  /**
   * The tariff version this quote was computed at — sent back with the
   * booking so the order endpoint can refuse it (409, `tariff_changed`) if an
   * admin retuned prices in between — and when the quote stops being honoured.
   */
  tariffVersion?: number;
  quoteExpiresAt?: string;
  /**
   * The live helper-time rules (`PricingConfig`) the "extra helper time" note
   * quotes — see `helperTimeNoteValues`. Absent on an older response.
   */
  helperRules?: {
    includedMinutes: number;
    overtimeIncrementMinutes: number;
    overtimeFeePerIncrement: number;
  };
};

/**
 * The fare at each service level, as `/api/pricing/estimate` returns it: three
 * totals derived from the one quote, so the tier cards can price themselves
 * without a request each.
 *
 * Read, never re-derived: the uplift and the discount are rates the server owns
 * (`serviceLevelAdjustment` in `src/lib/pricing.ts`), and a second copy of them
 * in this component would be free to drift from the figures the order is
 * actually written at.
 */
type ServiceLevelPrices = Record<ServiceLevel, number>;

/**
 * What `/api/pricing/estimate` answers with: the quote, plus a price per tier.
 *
 * Kept apart from `Quote` because `/api/orders` returns no such object — the
 * persisted row records the tier the order was booked at and what that tier
 * adjusted the fare by, not the three prices that were on offer at the time.
 */
type Estimate = Quote & { serviceLevels: ServiceLevelPrices };

/**
 * The one field of the created order this form reads back: its id.
 *
 * `POST /api/orders` answers with the whole persisted row — the itemised fare,
 * the tier and what that tier adjusted the fare by — but none of it is rendered
 * here. Booking ends in a navigation to `/checkout/<id>`, and that page reads
 * the order's figures off the row itself rather than being handed a copy that
 * would then have to be kept honest. Typing only the field that is used is what
 * keeps this form from acquiring a dependency on a response shape it does not
 * need.
 */
type CreatedOrder = { id: string };

/**
 * An unpaid order to re-open in this form, as `/orders/[id]/edit` loads it.
 *
 * Passing one puts the form in edit mode: every input below starts from the
 * order rather than from a blank booking, and Save sends the same payload Book
 * would have sent, as `PATCH /api/orders/<id>` instead of `POST /api/orders`.
 * The endpoint re-prices it from scratch, exactly as it priced the original —
 * nothing on this type is a figure, because no figure the form was handed
 * could be trusted to still be the price.
 *
 * Plain JSON on purpose (`scheduledAt` is an ISO string, not a `Date`): it
 * crosses the server → client component boundary as a prop, and a string is
 * the one shape that is serialised the same way by every version of that
 * boundary.
 *
 * What is *not* here, and why:
 *
 * - Weight, dimensions and cargo category. Goods-first booking derives all of
 *   them from the item list, so the order re-opens on its stored item lines
 *   (`items`) and the plan is re-run from those — `cargoCategory` below is
 *   only what seeds a pallet line's contents (`inferPalletContents`).
 * - Cargo photos. Those already on the order stay on it, untouched by Save;
 *   any added here are uploaded alongside them through the same
 *   `POST /api/orders/<id>/photos` a new booking uses.
 * - Payment. Edit mode, like booking, ends at checkout.
 */
export type BookingFormInitialOrder = {
  id: string;
  /** `GE-48210` — shown in the header so the client knows which order is open. */
  reference: string;
  /** ISO 8601, or `null` for an order placed before the date step existed. */
  scheduledAt: string | null;
  pickupAddress: string;
  /** Null when the address was typed rather than picked from autocomplete. */
  pickupLocation: LatLng | null;
  dropoffAddress: string;
  dropoffLocation: LatLng | null;
  /** Null where no contact was recorded for that stop. */
  pickupContact: StopContact | null;
  dropoffContact: StopContact | null;
  cargoCategory: CargoCategory;
  vehicleTypeCode: string;
  /** Null for an order placed before the load-space filter existed. */
  bodyType: ChassisType | null;
  /**
   * Legacy single crew size (pre pricing model v1), 0–4. Only read when the
   * per-location fields below are empty on a pre-v1 order — see
   * `locationHelpFromOrder`.
   */
  helperCount: number;
  /** Pricing model v1: helpers, floor and cargo elevator at each end. */
  pickupHelpers: number;
  pickupFloor: number;
  pickupCargoElevator: boolean;
  dropoffHelpers: number;
  dropoffFloor: number;
  dropoffCargoElevator: boolean;
  /** Null for an order priced before pricing model v1. */
  tariffVersion: number | null;
  serviceLevel: ServiceLevel;
  description: string | null;
  /**
   * The order's `OrderItem` rows (goods-first booking), seeded into the item
   * list through `linesFromOrderItems`. Empty for an order booked before the
   * item list existed: the client lists its goods again, since a save is a
   * re-booking and `PATCH /api/orders/[id]` re-derives the load from them.
   */
  items: StoredOrderItem[];
  /**
   * The client's account type, read server-side by the edit route, so the
   * vehicle list is right from the first render — see `useClientAccountType`.
   */
  accountType: "INDIVIDUAL" | "BUSINESS";
};

/**
 * The two ends of the route, in the order they are travelled — which is also
 * the order the delivery-info dialog numbers its badge by (`1` for the pickup,
 * `2` for the dropoff, from `stop`).
 */
const STOP_FIELDS = ["pickup", "dropoff"] as const;

type StopField = (typeof STOP_FIELDS)[number];

/** The delivery-info saved at each end, `null` where none was captured. */
type StopContacts = Record<StopField, StopContact | null>;

/**
 * No contact at either end — where a booking starts. Named rather than written
 * inline at the `useState` call so the empty case reads as a state the form has
 * rather than as two incidental nulls; never mutated, only ever replaced.
 */
const NO_STOP_CONTACTS: StopContacts = { pickup: null, dropoff: null };

/**
 * One stop's contact block as `POST /api/orders` takes it, or `undefined` when
 * there is nothing to record for that stop.
 *
 * Every field of the dialog is optional, so "saved" and "filled in" are not the
 * same thing: a client can open the dialog on selecting an address and press
 * Save without typing. That is a stop with no contact, and it is sent as an
 * omitted key rather than as three empty strings — the endpoint would store the
 * same three nulls either way, but only one of those shapes says what happened.
 */
function stopContactPayload(
  contact: StopContact | null,
): StopContact | undefined {
  if (!contact) {
    return undefined;
  }

  const anythingFilled = [contact.name, contact.phone, contact.details].some(
    (field) => field.trim().length > 0,
  );

  // Trimming and length-capping are the server's, not this form's — sending the
  // draft as typed keeps one place responsible for what is actually stored.
  return anythingFilled ? contact : undefined;
}

/**
 * Split a stored `scheduledAt` back into the two inputs it was built from: the
 * local calendar day and the "HH:MM" slot.
 *
 * Either half comes back empty when the form could not have offered it, rather
 * than being forced into the form: a day already in the past (the calendar
 * disables those, and a past pickup would be refused on save anyway), or a time
 * that is not one of `TIME_SLOTS` (an order written by something other than
 * this form). The schedule step then reads as unanswered, which is what it is.
 * A slot earlier today that has since passed is dropped by the form's own
 * stranded-slot effect, on the same terms as a client re-picking today.
 */
function scheduleFromIso(scheduledAt: string | null): {
  date: Date | null;
  time: string;
} {
  if (scheduledAt === null) {
    return { date: null, time: "" };
  }

  const at = new Date(scheduledAt);
  if (Number.isNaN(at.getTime()) || at < startOfDay(new Date())) {
    return { date: null, time: "" };
  }

  const time = `${String(at.getHours()).padStart(2, "0")}:${String(
    at.getMinutes(),
  ).padStart(2, "0")}`;

  return {
    date: startOfDay(at),
    time: TIME_SLOTS.some((slot) => slot.value === time) ? time : "",
  };
}

/**
 * The goods shortcut a code names, or `null` for none (or for a code that is
 * not in the table, which `HomeEntry`'s validation already rules out).
 */
function goodsShortcutByCode(
  code: GoodsShortcutCode | null,
): GoodsShortcut | null {
  return GOODS_SHORTCUTS.find((shortcut) => shortcut.code === code) ?? null;
}

/**
 * The item list the form opens with. Empty, except behind the business-only
 * Pallets shortcut, which opens on one pallet group to fill in — the same
 * first group the picker adds when a business flips to Pallets by hand, so the
 * two ways into pallets mode land on the same screen.
 *
 * Seeded before the account type is known. That is safe: an individual's
 * effective mode is always Items (`effectiveMode`), so a seeded pallet line is
 * never shown, planned or sent for them — it simply sits in state, inactive,
 * exactly as the picker's parent contract allows.
 */
function initialItemLines(shortcut: GoodsShortcut | null): PickerLine[] {
  return shortcut?.mode === "pallets" ? addPalletLine([]) : [];
}
/** Placeholder for a figure that isn't known yet. */
const EMPTY_STAT = "—";

/**
 * The subset of a `next-intl` translator the module-level helpers below need.
 * They sit outside the component, so they are handed the component's
 * `home.bookingForm` translator rather than calling a hook themselves.
 */
type BookingFormTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

const PANEL_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * The three load spaces a client can ask for, in the order they are offered.
 *
 * Copy only: which vehicle serves which body is never written down here. That
 * mapping lives on `VehicleTypeSpec.bodyTypes` and reaches this form through
 * `vehicleOffersBody`, so a newly seeded vehicle type becomes filterable
 * without touching this file.
 */
const BODY_TYPE_OPTIONS: {
  body: ChassisType;
  /** Keys under `home.bookingForm`, resolved at render — see `BookingForm`. */
  titleKey: "dryBox" | "refrigerated" | "openChassis";
  descriptionKey:
    | "enclosedAndWeatherProof"
    | "temperatureControlledLoadSpace"
    | "flatbedLoadableFromAnySide";
}[] = [
  {
    body: "DRY_BOX",
    titleKey: "dryBox",
    descriptionKey: "enclosedAndWeatherProof",
  },
  {
    body: "REFRIGERATED",
    titleKey: "refrigerated",
    descriptionKey: "temperatureControlledLoadSpace",
  },
  {
    body: "OPEN_CHASSIS",
    titleKey: "openChassis",
    descriptionKey: "flatbedLoadableFromAnySide",
  },
];

/**
 * The load space most goods travel in: an individual's body while nothing is
 * listed yet (`planLoad`'s own fallback once something is). Not where a
 * business starts — a business starts on no load space at all and has to
 * choose one (see `chosenBodyType`).
 */
const DEFAULT_BODY_TYPE: ChassisType = "DRY_BOX";

/**
 * Why a load-space card is disabled for a business, keyed by the body the
 * listed items *force* (every other card is then incompatible). Worded from
 * the items' side — the card is not wrong in general, only for this list.
 * A `Record` so a new body fails typecheck until it has a reason.
 */
const FORCED_BODY_CARD_REASON_KEYS: Record<
  ChassisType,
  | "bodyItemsNeedDryBox"
  | "bodyNotSuitableForChilled"
  | "bodyItemsNeedOpenChassis"
> = {
  DRY_BOX: "bodyItemsNeedDryBox",
  REFRIGERATED: "bodyNotSuitableForChilled",
  OPEN_CHASSIS: "bodyItemsNeedOpenChassis",
};

/**
 * The body an individual's items were given, in plain words, for the one
 * muted line under the recommendation. Individuals are never asked for a load
 * space, so this is what lets them see why a refrigerated van was suggested.
 * Plainer than the business picker's "Dry box" / "Open chassis": an individual
 * has not been taught the taxonomy and should not need to be.
 */
const DERIVED_BODY_LABEL_KEYS: Record<
  ChassisType,
  "derivedBodyDryBox" | "derivedBodyRefrigerated" | "derivedBodyOpenChassis"
> = {
  DRY_BOX: "derivedBodyDryBox",
  REFRIGERATED: "derivedBodyRefrigerated",
  OPEN_CHASSIS: "derivedBodyOpenChassis",
};

/**
 * The line shown when a vehicle the client picked by hand had to be let go
 * (`reconcileVehicleSelection`), by reason. Names the class, and says the form
 * moved to the recommendation, so the change is never silent.
 */
const VEHICLE_RELEASE_MESSAGE_KEYS: Record<
  VehicleReleaseReason,
  "vehicleReleasedCannotFit" | "vehicleReleasedUnavailable"
> = {
  cannot_fit: "vehicleReleasedCannotFit",
  unavailable: "vehicleReleasedUnavailable",
};

/**
 * One card of the load-space row. The pick-card geometry the goods and vehicle
 * grids use, plus the two things a `<label>` wrapping an `sr-only` radio has to
 * add for itself: the pointer affordance the `<button>`s get natively, and a
 * focus ring drawn on the hidden input's behalf (the same
 * `has-[:focus-visible]:` stand-in as the helper-count row below).
 */
const BODY_OPTION_CLASSES = `${PICK_CARD_BASE_CLASSES} cursor-pointer gap-1 has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20`;

/**
 * The three service levels, in the order they are offered.
 *
 * Copy only — no rate appears here, and none should. What a tier costs is
 * arithmetic the server owns, and it reaches this form as three finished
 * figures on the estimate (`serviceLevels`), so the uplift and the discount can
 * be re-tuned in one place without this file knowing they moved.
 *
 * The descriptions deliberately promise nothing about dispatch. Nothing in the
 * matching logic reads `Order.serviceLevel` — a job is offered to a company on
 * a bare vehicle-type match — so copy about matching faster or about a two-hour
 * collection window would be a promise the platform cannot keep. What is true,
 * and all these three claim, is that the level is recorded on the order and
 * shown to the driver and to ops.
 */
const SERVICE_LEVEL_OPTIONS: {
  level: ServiceLevel;
  /** Keys under `home.bookingForm`, resolved at render — see `BookingForm`. */
  titleKey: "priority" | "regular" | "pooling";
  descriptionKey:
    | "flaggedToDispatchAsTimeCritical"
    | "standardCollectionAndDeliveryWindow"
    | "youAcceptAWiderCollectionAnd";
  /**
   * The decorative mark in the card's top corner, or `null` for the tier that
   * carries none. Rendered `aria-hidden`: the title is what says which tier
   * this is, and a lightning bolt read aloud would only get in the way of it.
   * Palette utilities rather than landing tokens, as the codebase already does
   * for the "Best" badge — the landing set holds no semantic colour. Each one
   * is a light/dark pair, because a palette utility is a fixed hex that does
   * not follow the theme: both glyphs sit in a faint disc on the card, and the
   * mid-ramp light values go muddy against the dark card behind it.
   */
  badge: { glyph: string; className: string } | null;
}[] = [
  {
    level: "PRIORITY",
    titleKey: "priority",
    descriptionKey: "flaggedToDispatchAsTimeCritical",
    badge: { glyph: "⚡", className: "text-amber-500 dark:text-amber-300" },
  },
  {
    level: "REGULAR",
    titleKey: "regular",
    descriptionKey: "standardCollectionAndDeliveryWindow",
    badge: null,
  },
  {
    level: "POOLING",
    titleKey: "pooling",
    descriptionKey: "youAcceptAWiderCollectionAnd",
    badge: { glyph: "%", className: "text-teal-600 dark:text-teal-300" },
  },
];

/** The tier the quote itself is priced at, and so where the picker starts. */
const DEFAULT_SERVICE_LEVEL: ServiceLevel = "REGULAR";

/**
 * One card of the service-level row. The pick-card geometry again, given a
 * floor height so the three prices sit on one baseline whether a description
 * wraps to two lines or three, plus the pointer affordance and focus ring a
 * `<label>` around an `sr-only` radio has to draw for itself.
 */
const SERVICE_LEVEL_OPTION_CLASSES = `${PICK_CARD_BASE_CLASSES} min-h-32 cursor-pointer gap-1 has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20`;

/* -------------------------------------------------------------------------- */
/* Load fit (step 5)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The load as one complete set of four figures: the total weight and the
 * largest item's envelope, read off the load plan.
 *
 * These used to be four required number fields in the old cargo-details
 * step, typed by the client. Goods-first booking replaced them with the item list (step 4): the
 * same four figures are now *derived* by `planLoad`, here for the vehicle
 * cards and again by `POST /api/orders` from the items it is sent, so the
 * form and the route can never be measuring two different loads.
 *
 * `planLoad`'s envelope types its axes as nullable (it is a `LoadDimensions`,
 * shared with the vehicle-fit module), though a plan of at least one line
 * always fills all four; the `?? 0` in `loadEnvelope` only satisfies the type.
 */
type LoadEnvelope = {
  weightKg: number;
  lengthM: number;
  widthM: number;
  heightM: number;
};

function loadEnvelope(plan: LoadPlan): LoadEnvelope {
  return {
    weightKg: plan.totalWeightKg,
    lengthM: plan.envelope.lengthM ?? 0,
    widthM: plan.envelope.widthM ?? 0,
    heightM: plan.envelope.heightM ?? 0,
  };
}

/**
 * The badge on a step-5 vehicle card that cannot take the listed load: one
 * short phrase per offending axis, written from the *vehicle's* point of view
 * because the card is a vehicle ("Too short for 2.2 m", not "Your wardrobe is
 * 2.2 m long" — what the card has to say is what this class does with the
 * load).
 *
 * Separate copy from `cargoFitMessage`, deliberately, and the two are not
 * redundant. `cargoFitMessage` is the shared blocking sentence `POST
 * /api/orders` refuses with — it names the class, the axis and the limit. It
 * is a sentence, and a sentence does not fit inside a 2-up picker card without
 * wrapping to four lines and shoving the grid around. This is the label form
 * of the same fact, and it names only the load's own figure — no limit, no
 * class name (the card is already the class, and its figures are printed two
 * lines below) — so there is nothing here for the shared sentence to
 * contradict.
 *
 * **Figures go through the same formatters the card's own spec line uses.**
 * `formatVehiclePayload` for the weight, so a badge reading "Can't carry 3 t"
 * sits above a spec line reading "up to 1.5 t" in the same unit rather than
 * pairing "3000 kg" with "1.5 t" on one card. The three dimensions are written
 * as a bare number and " m" because that is exactly how
 * `formatVehicleDimensions` renders each of its own three figures. No
 * `toFixed` — rounding one of the two would reintroduce the contradiction.
 *
 * A `Record` keyed by `CargoAxis` rather than a `switch`: a fifth axis added to
 * the shared module fails typecheck here instead of falling through to a card
 * that says nothing about why it is disabled.
 */
const CARGO_AXIS_CARD_REASONS: Record<
  CargoAxis,
  (envelope: LoadEnvelope, t: BookingFormTranslate) => string
> = {
  weight: (envelope, t) =>
    t("cantCarry", { weight: formatVehiclePayload(envelope.weightKg) }),
  length: (envelope, t) => t("tooShortFor", { size: envelope.lengthM }),
  width: (envelope, t) => t("tooNarrowFor", { size: envelope.widthM }),
  height: (envelope, t) => t("tooLowFor", { size: envelope.heightM }),
};

/**
 * Every offending axis on one card, not just the first.
 *
 * A load can be over on more than one axis at once, and a card that named only
 * the length would send a client to a longer truck that is still too narrow.
 * Middot-joined in the order `oversizeAxes` reports (through `assessFit`'s
 * `hardAxes`), which is the fixed weight/length/width/height order the shared
 * module compares in, so two cards over on the same pair of axes always read
 * the same way round.
 */
function cargoFitCardReason(
  axes: CargoAxis[],
  envelope: LoadEnvelope,
  t: BookingFormTranslate,
): string {
  return axes
    .map((axis) => CARGO_AXIS_CARD_REASONS[axis](envelope, t))
    .join(" · ");
}
/**
 * The step-5 badge for a class no carrier on the platform operates: a short
 * verdict that fits one line beside the card's spec line. The full explanation,
 * with something to go and do about it, is the alert above the grid.
 *
 * "Carriers" and not "drivers" deliberately: what is missing is the vehicle
 * from the fleet, and "no drivers" would read as a queue to wait out.
 */
const NO_CARRIERS_CARD_REASON_KEY = "noCarriersRunThisClass";

/**
 * The same fact said once, with the fix attached, when it is true of *every*
 * card in the grid — a grid of uniformly disabled cards says what has happened
 * but not what to do.
 */
const NO_SERVICEABLE_VEHICLES_MESSAGE_KEY = "noServiceableVehicles";

/**
 * The fill state of a step-5 vehicle card no carrier runs. Deliberately *not*
 * `PICK_CARD_IDLE_CLASSES` plus an opacity: those carry hover styles, and a
 * card that lights up under the cursor and then refuses the click reads as a
 * broken button rather than an unavailable option.
 */
const PICK_CARD_UNAVAILABLE_CLASSES = "border-line opacity-60";

/** The reason badge inside such a card. */
const PICK_CARD_UNAVAILABLE_REASON_CLASSES =
  "mt-1.5 text-[0.6875rem] leading-snug font-semibold text-accent";

/** A short, neutral line inside a step that cannot list its options yet. */
const STEP_HINT_CLASSES = "text-[0.8125rem] leading-snug text-muted";

/**
 * The grid-wide line for the other way a grid can end up with nothing
 * bookable: every class on offer is too small for the listed load. Named
 * separately from the serviceability alert because the fix is different —
 * there is no carrier to wait for, the list itself has to change (or the
 * booking be split).
 */
const NO_VEHICLE_FITS_MESSAGE_KEY = "noVehicleFitsTheseItems";

/** Shared treatment for a non-blocking advisory line on this page. */
const FIELD_NOTICE_CLASSES =
  "rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-snug text-muted";

/**
 * The soft-fit line inside a card that *can* take the load but may be tight on
 * it — over its weight margin, its packed volume or its floor area
 * (`assessFit`'s `soft` reasons). Muted, not accent, and the card stays fully
 * selectable: these are estimates of estimates (`load-plan.ts`), so they warn
 * and never refuse, here or on the server.
 */
const PICK_CARD_SOFT_FIT_CLASSES =
  "mt-1.5 text-[0.6875rem] leading-snug font-medium text-muted";

/**
 * The vehicle step's two lines. It opens once the item list adds up to a load
 * one vehicle could take: "List at least one item first" while the list is
 * empty, and "Fix the item list first" while it holds a load the route would
 * refuse whatever vehicle were chosen — chilled goods with an open-chassis
 * item, or more than any class can carry. The picker already says which, in an
 * alert under the list; this line only points back at it.
 */
const LIST_ITEMS_FIRST_KEY = "listItemsFirst";
const FIX_ITEM_LIST_FIRST_KEY = "fixItemListFirst";
/**
 * Steps 6, 7 and the service level, for a business that has not chosen a load
 * space: there is no vehicle until there is a body, so "Choose a vehicle
 * first" would point at a choice step 5 cannot offer yet.
 */
const CHOOSE_LOAD_SPACE_FIRST_KEY = "chooseLoadSpaceFirst";

/**
 * How long the pricing inputs must sit still before the estimate is requested
 * automatically. Long enough that typing an address does not spend a request
 * (three geocoder lookups) per keystroke, short enough to feel immediate once
 * the client stops.
 */
const AUTO_ESTIMATE_DELAY_MS = 700;

/**
 * The sections a booking cannot be placed without, in the order they appear
 * on the page — which is also the order the first missing one is scrolled to.
 * Everything else (goods shortcut, photos, helpers, description, service
 * level) is optional or carries a default.
 *
 * Goods-first booking: staging's "cargo" (category) and "weight" (bracket)
 * sections are replaced by "items" — the item list, which must add up to a
 * load the route would accept on some vehicle (`planBookable`). The vehicle
 * section also covers a business's load space: no body, no vehicle.
 */
const REQUIRED_SECTIONS = ["schedule", "route", "items", "vehicle"] as const;

type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

/** Shared geometry for a native `<select>`/date-trigger styled to match the
 *  rest of this form's fields — the same treatment `account-profile-form.tsx`
 *  uses for its own native Gender `<select>`, and for the same reason: a
 *  small fixed option set isn't worth the shadcn `Select`'s portal, which
 *  renders outside this page's palette. */
const NATIVE_FIELD_CLASSES =
  "h-10 w-full rounded-lg border border-line bg-ink px-2.5 text-left text-sm text-paper transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/** "Sat, Aug 22" — compact enough for the date trigger button. */
/**
 * Options for the date triggers' label. The formatter itself is built per
 * locale inside the component (see `scheduledDateFormatter` there) from the
 * browser's own time zone, as before: the chosen day is a local calendar day,
 * and re-zoning it to the app's configured zone could shift it across midnight.
 */
const SCHEDULED_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

/** Options for a time-slot label: "8:00 AM" in English, "08:00" in Georgian. */
const TIME_SLOT_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

/** Selectable pickup times, half-hour apart across a normal working day. */
const TIME_SLOT_START_HOUR = 8;
const TIME_SLOT_END_HOUR = 20;
const TIME_SLOT_STEP_MINUTES = 30;

/**
 * One selectable start time. `value` is the wire format, "HH:MM"; the label is
 * formatted for the active locale at render (`formatTimeSlot`).
 */
type TimeSlot = { value: string; hour: number; minute: number };

/**
 * Every half-hour from 08:00 to 20:00, as both a sortable "HH:MM" value (what
 * gets combined with the chosen date) and a 12-hour display label. Built once
 * at module scope — the slot list itself never changes, only which of them are
 * still selectable (see `availableTimeSlots` in the component, which filters
 * this for a same-day pick).
 */
const TIME_SLOTS: TimeSlot[] = (() => {
  const slots: TimeSlot[] = [];

  for (
    let minutes = TIME_SLOT_START_HOUR * 60;
    minutes <= TIME_SLOT_END_HOUR * 60;
    minutes += TIME_SLOT_STEP_MINUTES
  ) {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const paddedMinute = String(minute).padStart(2, "0");

    slots.push({
      value: `${String(hour24).padStart(2, "0")}:${paddedMinute}`,
      hour: hour24,
      minute,
    });
  }

  return slots;
})();

/** Local midnight for `date` — the boundary the calendar disables before. */
function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Whether `a` and `b` fall on the same local calendar day. */
function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/**
 * `date` at the wall-clock time named by a `TIME_SLOTS` value ("14:30"), or
 * `null` if `time` isn't one of that shape — defensive against nothing more
 * exotic than a stale/cleared selection, since the dropdown only ever offers
 * valid values itself.
 */
function combineDateAndTime(date: Date, time: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }

  const combined = new Date(date);
  combined.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return combined;
}

/**
 * How many vehicles a load space would leave the client to choose from.
 * Pluralised rather than printed as a bare "1 vehicles".
 */
function vehicleCountLabel(count: number, t: BookingFormTranslate): string {
  return t("vehicleCount", { count });
}

/**
 * Which glyph stands for which duty class. A `Record` keyed by the category
 * union keeps this exhaustive: adding a duty class fails typecheck until it is
 * given a glyph here.
 */
const VEHICLE_CATEGORY_GLYPHS: Record<
  OrderVehicleType["category"],
  (props: { className?: string }) => React.ReactElement
> = {
  MEDIUM_DUTY: VanGlyph,
  HEAVY_DUTY: TruckGlyph,
};

/**
 * The client booking form: route, goods, vehicle and extras on the left, a
 * route preview on the right. Every step is editable at any time and in any
 * order. The price is quoted automatically against `/api/pricing/estimate` once
 * the pricing inputs are present (and again after any of them changes), and
 * the booking is placed through `POST /api/orders`. Pressing Book validates the
 * required sections (`REQUIRED_SECTIONS`) first and marks any that are missing.
 *
 * Booking is where this surface ends. It owns every piece of state it renders
 * from (`initialOrder`, below, only seeds it), because nothing about it is
 * decided elsewhere: the order it creates is unpaid, and the client is sent
 * straight to `/checkout/<id>` to settle it. Payment methods, saved cards and the business
 * purchase-order field are that page's, not this one's — a form that both
 * priced a job and collected payment for it made the client answer for the
 * money before there was an order to attach it to.
 *
 * The service level is the one input that does not invalidate the quote:
 * Priority and Pooling are arithmetic on the fare already quoted, so switching
 * tier re-prices from the estimate in hand rather than asking for a new one.
 *
 * Multi-stop routes are deliberately absent, because the backend has no concept
 * of them — an `Order` has exactly one pickup and one dropoff.
 *
 * `initialGoods` is the landing-page shortcut the visitor arrived through
 * (`?goods=`), already validated by `HomeEntry`; it only decides where the
 * goods step starts.
 *
 * `initialOrder` is optional: `/` renders this form with none and gets a
 * blank booking, exactly as before the prop existed. Given an
 * unpaid order (from `/orders/[id]/edit`), the form opens pre-filled from it and
 * Save re-prices that order in place — see `BookingFormInitialOrder` for what is
 * and is not carried over. Every input is still the form's own state; the prop
 * only decides where that state starts, and is read once, on mount.
 *
 * `guest` is set by `/book` for a signed-out visitor. The form is the same; it
 * only skips the reads that need an account (`/api/client-profile` — a guest is
 * booked as INDIVIDUAL, exactly as the order endpoint treats them) and swaps the
 * "My orders" link for sign-in. `POST /api/orders` answers a guest booking with
 * a cookie scoped to that order, which is what lets the photo upload and the
 * checkout page that follow recognise the same browser.
 *
 * Outside edit mode the form also picks up the homepage card's draft (route,
 * coordinates and goods shortcut — see `booking-draft.ts`) once, on mount.
 */
export function BookingForm({
  initialGoods = null,
  initialOrder,
  guest = false,
}: {
  /**
   * The goods shortcut to open on, or `null` for none. Validated against
   * `GOODS_SHORTCUTS` before it gets here, so it is always a real code. It is
   * an *initial* value: the form seeds its own state from it and never follows
   * it again.
   */
  initialGoods?: GoodsShortcutCode | null;
  initialOrder?: BookingFormInitialOrder;
  /** A signed-out visitor booking without an account. */
  guest?: boolean;
} = {}): React.ReactElement {
  const isEditing = initialOrder !== undefined;
  const t = useTranslations("home.bookingForm");
  const locale = useLocale();
  // Root-scoped, for shared helpers that take full keys.
  const tRoot = useTranslations();
  // A catalogue class's name in the reader's language, by its stable code; the
  // API's `label` is the seeded English and the fallback for an unknown code.
  const vehicleTypeLabel = (vehicleType: { code: string; label: string }) =>
    vehicleTypeSpecLabel(vehicleType.code, vehicleType.label, tRoot);
  // Built per locale rather than at module scope, so the date and time labels
  // follow the language toggle. No `timeZone`: see `SCHEDULED_DATE_FORMAT`.
  const scheduledDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, SCHEDULED_DATE_FORMAT),
    [locale],
  );
  const timeSlotFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, TIME_SLOT_FORMAT),
    [locale],
  );
  const formatTimeSlot = (slot: TimeSlot) =>
    // Any fixed date works: only the hour and minute are printed, in the same
    // local zone the `Date` is constructed in.
    timeSlotFormatter.format(new Date(2000, 0, 1, slot.hour, slot.minute));
  const tShared = useTranslations("common.shared");
  // The goods shortcuts' titles and descriptions, shared with the landing
  // page's tiles — one wording for the same shortcut wherever it appears.
  const tGoods = useTranslations("common.goodsShortcut");
  const router = useRouter();

  // The shared radio `name` binding the three load-space radios together, for
  // the browser's own arrow-key handling.
  const bodyTypeName = useId();
  // And the one binding the three service-level radios.
  const serviceLevelName = useId();
  // The "Change vehicle" grid, for its disclosure button's `aria-controls`.
  const vehicleGridId = useId();
  const descriptionId = useId();
  const formId = useId();
  const dateTriggerId = useId();
  const timeSelectId = useId();
  // Prefix for the required steps' card ids — see `sectionId`.
  const sectionIdPrefix = useId();

  // The order's schedule split back into its two inputs, computed once — the
  // two `useState` initialisers below each take their half. `null` outside
  // edit mode, and `useState` ignores it after the first render either way.
  const [initialSchedule] = useState(() =>
    scheduleFromIso(initialOrder?.scheduledAt ?? null),
  );

  // Null until both a day and a time slot are chosen — see `scheduledDateTime`,
  // the combined value everything downstream (submission, validation) reads.
  const [scheduledDate, setScheduledDate] = useState<Date | null>(
    initialSchedule.date,
  );
  const [scheduledTime, setScheduledTime] = useState(initialSchedule.time);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // In edit mode both addresses start as the order's own text, which is all the
  // estimate needs: `/api/pricing/estimate` geocodes the string server-side, so
  // a pre-filled route prices itself through the automatic estimate below
  // without the client re-picking either address from the autocomplete.
  const [pickupAddress, setPickupAddress] = useState(
    initialOrder?.pickupAddress ?? "",
  );
  const [dropoffAddress, setDropoffAddress] = useState(
    initialOrder?.dropoffAddress ?? "",
  );
  // Null until the matching address is *selected* from the autocomplete: these
  // gate the live estimate, so typing alone never spends a request. An edited
  // order seeds them from the coordinates stored on it, so the preview map has
  // its pins before the first estimate lands; `AddressAutocomplete` only ever
  // clears them on a keystroke, never on mount.
  const [pickupLocation, setPickupLocation] = useState<LatLng | null>(
    initialOrder?.pickupLocation ?? null,
  );
  const [dropoffLocation, setDropoffLocation] = useState<LatLng | null>(
    initialOrder?.dropoffLocation ?? null,
  );

  /**
   * Who the driver asks for at each end, and where in the building to find
   * them. Only *saved* contacts live here: the dialog owns its own draft, so a
   * cancelled edit never reaches this state and a re-opened stop shows whatever
   * was last saved for it.
   *
   * Nothing in the Route step renders from this — the card looks the same
   * before and after a contact is captured, by design.
   */
  const [contacts, setContacts] = useState<StopContacts>(() =>
    initialOrder
      ? {
          pickup: initialOrder.pickupContact,
          dropoff: initialOrder.dropoffContact,
        }
      : NO_STOP_CONTACTS,
  );

  /** Which stop's delivery-info dialog is open, or `null` when none is. */
  const [contactModalFor, setContactModalFor] = useState<StopField | null>(
    null,
  );

  // INDIVIDUAL until the profile says BUSINESS — see the hook. Edit mode knows
  // the answer already and starts from it.
  // A guest has no profile to read, so the request is skipped rather than left to
  // fail closed with a 401.
  const accountType = useClientAccountType(initialOrder?.accountType, {
    enabled: !guest,
  });

  /** Only an explicit BUSINESS unlocks the business-only controls; see above. */
  const isBusiness = accountType === "BUSINESS";

  /**
   * Edit mode: the order's stored item lines as picker lines, computed once.
   * `null` outside edit mode — see `BookingFormInitialOrder.items`.
   */
  const [initialItems] = useState(() =>
    initialOrder
      ? linesFromOrderItems(
          initialOrder.items,
          inferPalletContents(
            initialOrder.cargoCategory,
            initialOrder.bodyType,
          ),
        )
      : null,
  );

  /**
   * Goods-first booking: what the client is moving, as a list of items rather
   * than a cargo category and four typed figures.
   *
   * - `goodsShortcut` is the step-3 card last picked (seeded from
   *   `initialGoods`, the landing shortcut the visitor arrived through). It is
   *   an entry point and nothing more — which catalogue group the picker opens
   *   on and, for Pallets, which mode. It never fixes the order's cargo
   *   category; that is derived from the items (`plan.cargoCategory`).
   * - `loadMode` is the picker's Items/Pallets switch, as the client left it.
   *   What applies is `activeMode` below: pallets are business-only, so for
   *   anyone else (or while the account type is still loading) it reads as
   *   Items whatever this says.
   * - `itemLines` holds *both* modes' lines at once, per the picker's parent
   *   contract (`item-list-picker.tsx`): flipping to Pallets and back never
   *   loses the sofa. Only the active mode's lines are planned or sent.
   *
   * Picking a shortcut never clears the list. Switching from Furniture to
   * Appliances moves the picker to another catalogue group; the sofa already
   * listed stays listed.
   */
  const [goodsShortcut, setGoodsShortcut] = useState<GoodsShortcutCode | null>(
    initialGoods,
  );
  const [loadMode, setLoadMode] = useState<PickerMode>(
    () =>
      initialItems?.mode ?? goodsShortcutByCode(initialGoods)?.mode ?? "items",
  );
  const [itemLines, setItemLines] = useState<PickerLine[]>(
    () =>
      initialItems?.lines ??
      initialItemLines(goodsShortcutByCode(initialGoods)),
  );
  const activeMode = effectiveMode(loadMode, accountType);
  const selectedGoodsShortcut = goodsShortcutByCode(goodsShortcut);

  /** The item catalogue in the UI language, fetched once per page load. */
  const {
    items: catalogue,
    loading: catalogueLoading,
    error: catalogueError,
  } = useItemCatalogue(parseCatalogueLocale(locale));

  /**
   * The active lines as the load plan's input, built through exactly the
   * functions the route resolves each kind with (`toLoadLines`).
   */
  const loadLines = useMemo(
    () => toLoadLines(itemLines, activeMode, catalogue),
    [itemLines, activeMode, catalogue],
  );

  /**
   * What the list adds up to — total weight, largest item, cargo category,
   * body, implied handling tags — or `null` for an empty list.
   *
   * The same `planLoad` `POST /api/orders` re-runs on the items it is sent, so
   * every figure this form steers by (which classes are on offer, which cards
   * are too small, which body an individual books) is the figure the server
   * will write. Nothing the client typed is trusted in its place.
   */
  const plan = useMemo(() => planLoad(loadLines), [loadLines]);

  /**
   * A plan the route would accept on *some* vehicle: one body every line can
   * travel in, and no heavier than the biggest class on the platform. Either
   * failure is refused by `POST /api/orders` whatever vehicle is picked, and
   * the picker says which in an alert under the list, so the steps below stay
   * shut until it is fixed.
   */
  const planBookable =
    plan !== null && plan.body.kind === "derived" && !plan.overMaximum;

  /**
   * The order's cargo category, derived — never chosen. Still sent with the
   * estimate and the booking because the shared `parseQuoteFields` requires
   * it; on the items path the route overwrites it with its own derivation from
   * the same function, so the two agree.
   */
  const cargoCategory = plan?.cargoCategory ?? null;

  /**
   * The body some listed line *forces* (chilled goods ⇒ refrigerated), or
   * `null` when none does. Asked of the lines, not read off `plan.body`, for
   * the reason `decideItemsBooking` gives on the server: `plan.body` falls back
   * to a dry box when nothing is forced, and that fallback must not overrule a
   * business that chose an open chassis for ordinary goods.
   */
  const forcedBody = useMemo(
    () =>
      loadLines.find((line) => line.requiredBody !== null)?.requiredBody ??
      null,
    [loadLines],
  );

  /** A step-3 card: open the picker on its group, and on its mode. */
  function handleGoodsShortcut(shortcut: GoodsShortcut) {
    // Always true — every card is drawn from `GOODS_SHORTCUTS` — but
    // `GoodsShortcut` types its code as a plain string.
    if (isGoodsShortcutCode(shortcut.code)) {
      setGoodsShortcut(shortcut.code);
    }
    setLoadMode(shortcut.mode);
    // Pallets opens on one group to fill in, exactly as flipping the picker's
    // own switch does (`ItemListPicker`'s `handleModeChange`).
    if (
      shortcut.mode === "pallets" &&
      activeLines(itemLines, "pallets").length === 0
    ) {
      setItemLines(addPalletLine(itemLines));
    }
  }

  /**
   * The load space being booked. A filter on the vehicle list and nothing
   * more: it moves no price, because the catalogue already charges for the body
   * through each type's own pricing rule (a Refrigerated Van is priced above a
   * Closed Box Van), so a surcharge here would bill the same premium twice.
   *
   * Two sources, by account type, mirroring what `POST /api/orders` does with
   * it (`decideItemsBooking`):
   *
   * - **Individuals are never asked.** Their body is the plan's — a dry box,
   *   or the refrigerated body a chilled item forces — and the route ignores
   *   any body they send in favour of that same derivation. The load-space
   *   question is not rendered for them at all.
   * - **Businesses choose** (`chosenBodyType`, from the step-5 fieldset), since
   *   an open chassis for ordinary goods is a real business choice. There is
   *   no default: it starts `null`, step 5 offers no vehicle until a body is
   *   chosen, and the steps after it say "Choose a load space first." —
   *   `POST /api/orders` refuses a business order without one, so a default
   *   would only have been a choice the client never made, sent as theirs.
   *   The one exception is a body the items *force*: when every forcing line
   *   agrees (one forced body and no conflict), the effect below moves the
   *   choice there whenever that body changes — the route requires the match,
   *   and the step-5 picker disables every other card with the reason. When
   *   lines force different bodies nothing moves: that list is refused
   *   whatever is chosen, and step 5 is shut until the list is fixed.
   *
   * `accountType` still loading (`null`) reads as an individual — the same
   * reading `effectiveMode` and the route take. `bodyType` is `null` exactly
   * while a business has not chosen; every reader below treats that as "no
   * vehicle can be judged yet".
   */
  //
  // Edit mode starts a business on the order's stored body: it was the
  // client's own choice, and the route re-checks it against the items on save.
  const [chosenBodyType, setChosenBodyType] = useState<ChassisType | null>(
    initialOrder?.bodyType ?? null,
  );
  const derivedBodyType: ChassisType =
    plan?.body.kind === "derived" ? plan.body.body : DEFAULT_BODY_TYPE;
  const bodyType: ChassisType | null = isBusiness
    ? chosenBodyType
    : derivedBodyType;

  /**
   * The body the items force, only when that is unambiguous: one forcing body
   * across every line (`plan.body` derived, not in conflict). `forcedBody`
   * alone is the *first* forcing line's, which in a conflict is an arbitrary
   * pick between two bodies neither of which can take the whole list.
   */
  const unambiguousForcedBody =
    plan?.body.kind === "derived" ? forcedBody : null;

  useEffect(() => {
    if (isBusiness && unambiguousForcedBody !== null) {
      setChosenBodyType(unambiguousForcedBody);
    }
  }, [isBusiness, unambiguousForcedBody]);

  // The booked class, in edit mode.
  const [vehicleTypeCode, setVehicleTypeCode] = useState(
    initialOrder?.vehicleTypeCode ?? "",
  );
  /**
   * Whether the client picked `vehicleTypeCode` themselves. `false` — where a
   * booking starts, and where "Use recommended" returns it — means the form
   * picked it and keeps it on the recommendation as the item list changes;
   * `true`, set by any click on a vehicle card in either view, means no plan
   * change moves it. The full rule, and why, is `vehicle-selection.ts`.
   */
  //
  // Edit mode opens as chosen: the booked class was the client's decision, so
  // it stays put while the list is unchanged and is let go only if it can no
  // longer take the load (the same rule as any hand pick).
  const [vehicleChosenByClient, setVehicleChosenByClient] = useState(
    initialOrder !== undefined,
  );
  /**
   * The hand-picked class the form last had to let go, and why — shown as one
   * line in step 5 so the switch to the recommendation is never silent.
   * Cleared by the client's next vehicle or load-space choice.
   */
  const [releasedVehicle, setReleasedVehicle] = useState<{
    code: string;
    reason: VehicleReleaseReason;
  } | null>(null);
  /** The "Change vehicle" disclosure: the full annotated grid. Collapsed. */
  const [vehicleGridOpen, setVehicleGridOpen] = useState(false);
  // Pricing model v1: helpers beyond the driver, the floor and the cargo
  // elevator, asked separately at each end — exactly the six fields both the
  // pricing and the orders endpoint take (`locationHelpBody`). Kept as typed:
  // a floor entered and then hidden by going back to 0 helpers comes back
  // with the helper, and is sent as the ground floor meanwhile.
  const [initialPickupHelp, initialDropoffHelp] = useMemo(() => {
    if (!initialOrder) {
      return [NO_LOCATION_HELP, NO_LOCATION_HELP] as const;
    }
    const help = locationHelpFromOrder(initialOrder);
    return [help.pickup, help.dropoff] as const;
    // Read once, on mount, like every other `initialOrder` field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [pickupHelp, setPickupHelp] = useState<LocationHelp>(initialPickupHelp);
  const [dropoffHelp, setDropoffHelp] =
    useState<LocationHelp>(initialDropoffHelp);

  function handleHelpChange(end: HelperEnd, next: LocationHelp) {
    if (end === "pickup") {
      setPickupHelp(next);
    } else {
      setDropoffHelp(next);
    }
  }
  // The tier the displayed price is for. Alone among the form's inputs it never
  // invalidates the quote — see the invalidation effect below — because every
  // tier's price is arithmetic on the one fare the server already quoted.
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>(
    initialOrder?.serviceLevel ?? DEFAULT_SERVICE_LEVEL,
  );
  const [description, setDescription] = useState(
    initialOrder?.description ?? "",
  );

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  /**
   * The helper-time note's figures: the engine defaults until a quote lands,
   * then the live rules that quote carried. Kept apart from `estimate` (which
   * any input change clears) so the note under the helper inputs does not
   * flicker back to the defaults while the next quote is on its way.
   */
  const [helperNote, setHelperNote] = useState<HelperTimeNoteValues>(
    HELPER_TIME_NOTE_VALUES,
  );
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  /**
   * Set when the route is over the manual-quote distance
   * (`manual_quote_required`): there is no price to show and nothing to book,
   * only support to contact — with their number when one is configured.
   * Cleared, like `estimateError`, by any change to the pricing inputs.
   */
  const [manualQuote, setManualQuote] = useState<{
    supportPhone: string | null;
  } | null>(null);
  /**
   * A note above the breakdown saying the price just changed under the client
   * — after the order endpoint refused a stale tariff, or a re-quote of an
   * expired quote came back different — so they review the new figure and
   * press Book again rather than being charged it unseen.
   */
  const [priceNotice, setPriceNotice] = useState<string | null>(null);

  /**
   * Whether a booking is in flight — and it stays `true` once one succeeds,
   * deliberately, until the navigation to checkout unmounts this form. See
   * `handleSubmit`: the only paths that clear it are the ones that leave the
   * client on this page.
   */
  const [submitting, setSubmitting] = useState(false);
  /**
   * The synchronous twin of `submitting`, for `handleSubmit`'s re-entry guard.
   * State only reaches the handler on the next render, so two submits landing
   * before it (a double tap on a slow phone, Enter plus click) could both read
   * `false` and place two orders, each with its own copy of the photos.
   */
  const submitLockRef = useRef(false);
  /**
   * Which part of the booking is in flight, for the Book button's label:
   * pricing (when Book was pressed before an estimate existed), creating the
   * order, or uploading its photos — the last only while there are photos
   * actually being sent (see `booking-submit.ts`).
   */
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("booking");
  const [error, setError] = useState<string | null>(null);

  /**
   * Set by the first press of Book. Until then no step is marked as missing,
   * so the form does not open pre-scolded; after it, a required step is red
   * for exactly as long as it stays unanswered (see `missingSections`).
   */
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Optional step-6 photos, uploaded to the order once it exists.
  const cargoPhotos = useCargoPhotos();

  /**
   * The homepage card's draft, read once on mount and removed from storage as
   * it is read (see `takeBookingDraft`). An effect rather than a `useState`
   * initialiser because storage only exists in the browser: reading it during
   * render would make the server and the first client render disagree.
   * Edit mode never reads it — the order being edited is the prefill there.
   */
  useEffect(() => {
    if (isEditing) {
      return;
    }
    const draft = takeBookingDraft();
    if (!draft) {
      return;
    }
    if (draft.pickupAddress) {
      setPickupAddress(draft.pickupAddress);
      setPickupLocation(draft.pickupLocation);
    }
    if (draft.dropoffAddress) {
      setDropoffAddress(draft.dropoffAddress);
      setDropoffLocation(draft.dropoffLocation);
    }
    // The card's goods tile, applied the way a step-3 card click is — unless
    // the URL already named a shortcut (`?goods=`, which the card's CTA carries
    // too), which seeded the form at mount and wins. No vehicle travels: it is
    // recommended from the item list (step 5).
    if (draft.pickupHelp) {
      setPickupHelp(draft.pickupHelp);
    }
    if (draft.dropoffHelp) {
      setDropoffHelp(draft.dropoffHelp);
    }
    const draftShortcut =
      initialGoods === null ? goodsShortcutByCode(draft.goods) : null;
    if (draftShortcut) {
      handleGoodsShortcut(draftShortcut);
    }
    // Mount only: `isEditing` and `initialGoods` cannot change for the life of
    // the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The map is a companion to the form on desktop and an opt-in panel on
  // mobile. This only drives a `hidden`/`block` swap — the map is never
  // conditionally unmounted, or it would re-mount (and re-bill) the Google Maps
  // script every time it was toggled.
  const [mapVisible, setMapVisible] = useState(false);

  /**
   * The first listed item that needs two people to carry, by its catalogue
   * name, or `null` when the plan suggests no helper. Only catalogue lines
   * can say so (`needsTwoPeople` is a catalogue field; custom and pallet lines
   * never set it), so only they are searched, in list order — the same
   * `planLoad` `suggestedCrew` reads, asked one line at a time.
   *
   * Feeds a hint under the Helpers picker (a two-person crew is the driver
   * plus one helper) and nothing else: the helper count is the client's to
   * set, priced per helper, and the form never changes it for them.
   */
  const twoPersonItemLabel = useMemo(() => {
    if (plan?.suggestedCrew !== 2) {
      return null;
    }
    const byCode = new Map(catalogue.map((item) => [item.code, item]));
    for (const line of activeLines(itemLines, activeMode)) {
      if (line.kind === "CATALOGUE") {
        const item = byCode.get(line.code);
        if (item?.needsTwoPeople) {
          return item.label;
        }
      }
    }
    return null;
  }, [plan, catalogue, itemLines, activeMode]);

  const {
    vehicleTypes,
    loading: loadingVehicleTypes,
    error: vehicleTypesError,
  } = useOrderVehicleTypes();

  /**
   * The vehicle types this load may legally travel in, cheapest first — or
   * none at all while there is no plan, which keeps the vehicle step shut until
   * something is listed.
   *
   * Filtered by the plan's *derived* cargo category, the narrowest one any
   * listed line carries (`load-plan.ts`): one bag of cement among a home move
   * still needs a heavy-duty vehicle, which is the `cargo_vehicle_mismatch`
   * rule `POST /api/orders` applies to the same derivation.
   *
   * Cheapest-first is what makes `[0]` the cheapest candidate — the same
   * heuristic the landing page's quote calculator uses to pick a vehicle on the
   * visitor's behalf. `eligibleVehicleTypes` below narrows this by body.
   */
  const cargoEligibleVehicleTypes = useMemo(() => {
    if (cargoCategory === null) {
      return [];
    }
    const allowed = CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];

    return vehicleTypes
      .filter((vehicleType) => allowed.includes(vehicleType.category))
      .sort((a, b) => a.pricingRule.baseFare - b.pricingRule.baseFare);
  }, [vehicleTypes, cargoCategory]);

  /**
   * The three load-space cards, each carrying how many vehicles would be left
   * to choose from if it were picked. Business accounts only — see `bodyType`.
   *
   * Counted against the cargo-eligible set, not the fully filtered one: a card
   * has to say what picking it *would* give you, so the body currently selected
   * must not be allowed to shrink the other two cards' figures.
   */
  const bodyTypeCards = useMemo(
    () =>
      BODY_TYPE_OPTIONS.map((option) => ({
        ...option,
        vehicleCount: cargoEligibleVehicleTypes.filter(
          (vehicleType) =>
            vehicleOffersBody(vehicleType, option.body) &&
            vehicleOfferedToClient(vehicleType, option.body, accountType),
        ).length,
      })),
    [cargoEligibleVehicleTypes, accountType],
  );

  /**
   * Cargo-eligible vehicles that also offer the load space being booked. The
   * body predicate is the taxonomy's own (`vehicleOffersBody`); this file holds
   * no vehicle-to-body table.
   *
   * There is no weight filter any more. The weight bracket that used to sit in
   * step 4 is gone: how heavy and how big the load is now comes from the item
   * list, and is judged per card by `assessFit` (below) — annotated on the
   * grid, never filtered out of it.
   */
  //
  // Also narrowed by `vehicleOfferedToClient`: an individual booking a dry box
  // is not offered the freight classes (reefers, curtainsider, large freight)
  // — a staging product rule, applied on top of the body filter so it can only
  // ever remove a class.
  const eligibleVehicleTypes = useMemo(
    () =>
      // No body (a business that has not chosen) offers no vehicle at all.
      bodyType === null
        ? []
        : cargoEligibleVehicleTypes.filter(
            (vehicleType) =>
              vehicleOffersBody(vehicleType, bodyType) &&
              vehicleOfferedToClient(vehicleType, bodyType, accountType),
          ),
    [cargoEligibleVehicleTypes, bodyType, accountType],
  );

  /**
   * How well the listed load fits each eligible class, by code: the hard axes
   * the route would refuse on, the soft reasons it may be tight, and the
   * verdict. Judged against the body being booked, explicitly, so a business's
   * open chassis is judged as an open chassis rather than as the plan's
   * dry-box fallback. Empty while there is no plan to judge.
   */
  const vehicleFit = useMemo(() => {
    const fits = new Map<string, FitAssessment>();
    if (plan === null || bodyType === null) {
      return fits;
    }
    for (const vehicleType of eligibleVehicleTypes) {
      fits.set(vehicleType.code, assessFit(plan, vehicleType, bodyType));
    }
    return fits;
  }, [plan, eligibleVehicleTypes, bodyType]);

  /**
   * Is this class one a carrier on this platform actually operates *with the
   * load space being booked*?
   *
   * Per body, through `serviceableBodies`, not the body-agnostic `serviceable`
   * flag: `POST /api/orders` judges serviceability with
   * `serviceableSpecIds(bodyType)`, so a class a carrier runs dry but nobody
   * runs refrigerated is refused for a chilled load — and a form reading the
   * looser flag would recommend exactly the class the server then turns down.
   */
  const servesBody = (vehicleType: OrderVehicleType) =>
    bodyType !== null && vehicleType.serviceableBodies.includes(bodyType);

  /**
   * The eligible classes this booking could actually be *placed* against: a
   * carrier runs them with this body, and the listed load physically goes in.
   *
   * Four of the eleven seeded classes have nobody running them, and an order
   * booked against one is created, priced, charged for — and then invisible to
   * every driver on the load board forever. A class the load cannot fit is the
   * same failure by another door: the route refuses it outright on the hard
   * axes (`oversizeAxes`). So both are kept out of this list.
   *
   * A *derived* list and pointedly not a narrower `eligibleVehicleTypes`: the
   * grid keeps rendering the full eligible set and disables these cards in
   * place, for the reasons set out on the grid itself. What this list is for is
   * the places that put a class on the client's *behalf* — the recommendation
   * (and with it the `Best` pill) and the selection effect, none of which is a
   * click anyone made — and the test of whether a hand-picked class can stay.
   * `may_not_fit` classes stay in it: a soft-fit warning steers and never
   * refuses, here or on the server.
   *
   * Order is inherited, so `[0]` is still the cheapest.
   */
  const bookableVehicleTypes = useMemo(
    () =>
      eligibleVehicleTypes.filter(
        (vehicleType) =>
          bodyType !== null &&
          vehicleType.serviceableBodies.includes(bodyType) &&
          vehicleFit.get(vehicleType.code)?.verdict !== "cannot_fit",
      ),
    [eligibleVehicleTypes, bodyType, vehicleFit],
  );

  /**
   * Step 5's recommendation: the cheapest bookable class the load comfortably
   * `fits` — or, when every bookable class is only `may_not_fit`, the cheapest
   * of those — and the next strictly bigger class that also fits. Both are
   * `recommendVehicles`' answer, the same function the route's load plan comes
   * from, over `bookableVehicleTypes` (already cheapest-first and filtered to
   * what a carrier runs with this body and the load can physically take, as
   * that function requires). `null` choices when nothing is bookable.
   *
   * It is measured against the item list from the first paint: the load is
   * listed in step 4, before this step opens, so the recommendation moves only
   * when the list (or a business's load space) does — the client going back up
   * the form on purpose.
   *
   * The grid's `Best` pill is the recommended class, and the selection effect
   * below follows it while the client has not picked by hand. One rule for
   * both, so the form never wears `Best` on one card while standing on
   * another of its own choosing. When nothing is bookable no card wears it:
   * nothing here is best when nothing here can be had.
   */
  const recommendation = useMemo(
    () =>
      plan === null || bodyType === null
        ? { recommended: null, oneSizeUp: null }
        : recommendVehicles(plan, bookableVehicleTypes, bodyType),
    [plan, bookableVehicleTypes, bodyType],
  );
  const recommendedCode = recommendation.recommended?.spec.code ?? null;
  const oneSizeUpCode = recommendation.oneSizeUp?.spec.code ?? null;

  const selectedVehicleType =
    eligibleVehicleTypes.find(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    ) ?? null;

  /** The selected class's fit, or `null` while nothing is selected. */
  const selectedVehicleFit = selectedVehicleType
    ? (vehicleFit.get(selectedVehicleType.code) ?? null)
    : null;

  /**
   * Keep the selection where `vehicleChosenByClient` says it belongs, as the
   * load, the body or the taxonomy changes. The decision is
   * `reconcileVehicleSelection` (`vehicle-selection.ts`, specced in
   * `tests/vehicle-selection.spec.ts`); this only gathers its inputs and
   * applies the answer.
   *
   * - **Following** (the form picked): the selection moves to the
   *   recommendation whenever it moves. With nothing bookable it stays where
   *   it is rather than emptying — the card it sits on explains itself, the
   *   alert at the top of step 5 says what to change, and `handleSubmit` refuses
   *   it.
   * - **Chosen** (the client picked): a plan change re-annotates the cards but
   *   never moves the selection. That is the old grid argument made exact —
   *   never move a selection the client made, in a step they are not looking
   *   at (they are usually in step 4 when the plan changes). It is let go only
   *   when it cannot be booked at all: `cannot_fit`, or no longer on offer for
   *   this body and load. Then the form goes back to following, moves to the
   *   recommendation, and `releasedVehicle` says which class went and why.
   *
   * Nothing is judged while there is no settled load (`judged`): an emptied
   * list, a body conflict, an over-maximum load or a fetch in flight is a state
   * the client is passing through, not a verdict on what they picked. Every
   * source of a code is `bookableVehicleTypes` — never a class no carrier runs
   * or the load cannot fit — and the reconciler is idempotent, so this settles
   * after one extra render rather than looping.
   */
  const selectionJudged =
    planBookable &&
    bodyType !== null &&
    !loadingVehicleTypes &&
    !catalogueLoading;

  useEffect(() => {
    const next = reconcileVehicleSelection({
      code: vehicleTypeCode,
      chosenByClient: vehicleChosenByClient,
      judged: selectionJudged,
      bodyChosen: bodyType !== null,
      recommendedCode,
      bookableCodes: bookableVehicleTypes.map(
        (vehicleType) => vehicleType.code,
      ),
      cannotFitCodes: eligibleVehicleTypes
        .filter(
          (vehicleType) =>
            vehicleFit.get(vehicleType.code)?.verdict === "cannot_fit",
        )
        .map((vehicleType) => vehicleType.code),
    });

    if (next.code !== vehicleTypeCode) {
      setVehicleTypeCode(next.code);
    }
    if (next.chosenByClient !== vehicleChosenByClient) {
      setVehicleChosenByClient(next.chosenByClient);
    }
    if (next.released !== null) {
      setReleasedVehicle(next.released);
    }
  }, [
    vehicleTypeCode,
    vehicleChosenByClient,
    selectionJudged,
    bodyType,
    recommendedCode,
    bookableVehicleTypes,
    eligibleVehicleTypes,
    vehicleFit,
  ]);

  /**
   * Whether the selection sits on a class the two recommendation cards do not
   * show. Turning true opens the "Change vehicle" grid, so the selected card is
   * always on screen: a hand pick from the grid that the recommendation then
   * moved away from, or a selection left standing when nothing is bookable
   * (whose card carries the reason). The client can collapse it again.
   *
   * A *following* selection is excluded while a recommendation exists. When
   * the plan changes, `recommendedCode` moves one render before the
   * reconciling effect above moves the selection after it, so for that one
   * render a following selection sits "outside" both cards — and without this
   * guard every item added would throw the grid open under the client (seen in
   * the wave-5 end-to-end run: adding a fridge to one box opened it).
   */
  const selectionOutside =
    selectionJudged &&
    (vehicleChosenByClient || recommendedCode === null) &&
    selectionOutsideRecommendation(
      vehicleTypeCode,
      recommendedCode,
      oneSizeUpCode,
    );

  useEffect(() => {
    if (selectionOutside) {
      setVehicleGridOpen(true);
    }
  }, [selectionOutside]);

  /**
   * Any click on a vehicle card, in either view: the client has chosen, and
   * from here the plan re-annotates the cards without moving this one.
   */
  function handleVehicleChoice(code: string) {
    setVehicleTypeCode(code);
    setVehicleChosenByClient(true);
    setReleasedVehicle(null);
  }

  /** "Use recommended": back to following the recommendation. */
  function handleUseRecommended() {
    if (recommendedCode !== null) {
      setVehicleTypeCode(recommendedCode);
    }
    setVehicleChosenByClient(false);
    setReleasedVehicle(null);
  }

  /**
   * A business picks a load space, which clears the vehicle that hung off it.
   * Clearing rather than choosing, and back to following: no vehicle was ever
   * picked for this body, so the selection effect settles on the new body's
   * recommendation exactly as on first render.
   */
  function handleBodyTypeChange(body: ChassisType) {
    setChosenBodyType(body);
    setVehicleTypeCode("");
    setVehicleChosenByClient(false);
    setReleasedVehicle(null);
  }

  // The in-flight estimate request, if any — kept in a ref (not state) since
  // it's only ever read from event handlers and cleanup, never rendered.
  const estimateAbortRef = useRef<AbortController | null>(null);

  /**
   * A quote is only ever valid for the exact inputs it was computed from.
   * Rather than let a stale price sit under a since-changed route, goods,
   * load space, vehicle or helper count, any change to one of them invalidates it —
   * dropping any in-flight request too — and the automatic estimate below
   * prices the new inputs.
   *
   * `serviceLevel` is the one input deliberately missing from the dependency
   * list below, and its absence is not an oversight: a tier is a percentage of
   * the fare that was already quoted, so all three tier prices arrive with the
   * quote itself (`serviceLevels`). Switching tier re-reads one of them and
   * needs no new estimate, no geocoding and no round trip.
   */
  useEffect(() => {
    estimateAbortRef.current?.abort();
    setEstimate(null);
    setEstimateError(null);
    setManualQuote(null);
    setPriceNotice(null);
    setEstimating(false);
  }, [
    pickupAddress,
    dropoffAddress,
    pickupLocation,
    dropoffLocation,
    vehicleTypeCode,
    // The goods: the list itself, which half of the picker is in use, and the
    // shortcut that opened it. The estimate reads only the derived cargo
    // category from these, but a quote shown under a list it was not computed
    // for reads as a price for that list — so any edit to it drops the quote,
    // the same rule every other input here follows. `itemLines` is replaced,
    // never mutated, by every picker edit, so its identity is a faithful
    // "the list changed".
    itemLines,
    loadMode,
    goodsShortcut,
    cargoCategory,
    // Listed even though a body change always clears the vehicle code above
    // it: the quote must be invalidated by the input the user actually
    // changed, not as a side effect of how that change happens to cascade.
    bodyType,
    // Replaced, never mutated, by `handleHelpChange`, so identity is "changed".
    pickupHelp,
    dropoffHelp,
    // `serviceLevel` is absent on purpose — see above. So are the two stop
    // contacts: a name and a floor number are operational detail carried to the
    // driver, and no part of the fare reads them.
  ]);

  /** Local midnight today — the calendar's disabled-before boundary. */
  const todayStart = useMemo(() => startOfDay(new Date()), []);

  /**
   * `TIME_SLOTS`, narrowed to the ones still in the future when the chosen day
   * is today. A future day has no such constraint — every slot is available.
   */
  const availableTimeSlots = useMemo(() => {
    if (!scheduledDate || !isSameDay(scheduledDate, new Date())) {
      return TIME_SLOTS;
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    return TIME_SLOTS.filter((slot) => {
      const [hours, minutes] = slot.value.split(":").map(Number);
      // Both halves always exist — `slot.value` is always this module's own
      // well-formed "HH:MM" — but `noUncheckedIndexedAccess` can't know that.
      return (hours ?? 0) * 60 + (minutes ?? 0) >= nowMinutes;
    });
  }, [scheduledDate]);

  // A slot picked for a future day can be stranded by switching back to today
  // once the clock has passed it — drop it rather than let a submit combine a
  // day and a time into a moment that's already gone.
  useEffect(() => {
    if (
      scheduledTime &&
      !availableTimeSlots.some((slot) => slot.value === scheduledTime)
    ) {
      setScheduledTime("");
    }
  }, [availableTimeSlots, scheduledTime]);

  const scheduledDateTime =
    scheduledDate && scheduledTime
      ? combineDateAndTime(scheduledDate, scheduledTime)
      : null;

  /**
   * The vehicle the booking would be priced and placed against, as a code —
   * `""` while none is resolved. Read off `selectedVehicleType` rather than the
   * raw `vehicleTypeCode` state, which can hold a stale code for a moment after
   * a goods or weight change empties the eligible list.
   */
  const pricedVehicleTypeCode = selectedVehicleType?.code ?? "";

  /**
   * Is the class this booking is pointed at one a carrier actually operates,
   * with the load space being booked? True when nothing is selected: a missing
   * vehicle is reported as the vehicle step being required, not as this.
   *
   * Per body (`serviceableBodies`), because that is what the route checks
   * (`serviceableSpecIds(bodyType)`): a class run dry by some carrier but
   * refrigerated by none must not pass here and fail there.
   */
  const selectedVehicleIsServiceable =
    selectedVehicleType === null || servesBody(selectedVehicleType);

  /**
   * The listed load as the four figures the card badges quote, or `null`
   * while nothing is listed.
   */
  const plannedEnvelope = plan === null ? null : loadEnvelope(plan);

  /**
   * Does the listed load fit the vehicle the booking would actually be placed
   * against? True whenever nothing is selected. The hard axes only
   * (`assessFit`'s `hardAxes`, i.e. `oversizeAxes` — the route's own refusal);
   * a soft-fit warning never blocks.
   */
  const cargoFitsVehicle =
    selectedVehicleFit === null || selectedVehicleFit.hardAxes.length === 0;

  /**
   * The required sections that are still unanswered, in page order. Derived on
   * every render from the same state the order is built from, so a section's
   * red marking clears the moment it is filled in.
   *
   * The route counts as answered once both addresses are *typed*: pricing and
   * the order endpoint geocode the text server-side, so a client who never
   * takes an autocomplete suggestion (or a deployment without a Places key)
   * can still book.
   */
  const sectionAnswered: Record<RequiredSection, boolean> = {
    schedule: scheduledDateTime !== null,
    route: pickupAddress.trim().length > 0 && dropoffAddress.trim().length > 0,
    items: planBookable,
    vehicle: selectedVehicleType !== null,
  };
  const missingSections = REQUIRED_SECTIONS.filter(
    (section) => !sectionAnswered[section],
  );

  /** Whether a step should be drawn as missing right now. */
  function sectionInvalid(section: RequiredSection): boolean {
    return submitAttempted && !sectionAnswered[section];
  }

  /** DOM id of a required step's card, for scrolling to it. */
  const sectionId = (section: RequiredSection) =>
    `${sectionIdPrefix}-${section}`;

  // Keyed off the raw address *text*, not `pickupLocation`/`dropoffLocation`:
  // those only populate once a suggestion is picked from the browser-side
  // Google Places autocomplete, but `/api/pricing/estimate` geocodes whatever
  // address string it's given itself, server-side — it needs no client-side
  // resolution at all. The automatic estimate below is debounced instead, so
  // typing an address does not spend a request per keystroke.
  const pricingInputsReady =
    sectionAnswered.route &&
    cargoCategory !== null &&
    pricedVehicleTypeCode !== "";

  const canCalculate = !estimating && pricingInputsReady;

  /**
   * Quote the current inputs. Resolves with the estimate, or `null` when it
   * failed (the reason is in `estimateError`) or was superseded. The
   * `AbortController` guards against the input changing — and so invalidating
   * this very request, see above — while it's in flight.
   */
  async function handleCalculate(): Promise<Estimate | null> {
    if (!pricingInputsReady || cargoCategory === null) {
      return null;
    }

    estimateAbortRef.current?.abort();
    const controller = new AbortController();
    estimateAbortRef.current = controller;

    setEstimating(true);
    setEstimateError(null);
    setManualQuote(null);

    try {
      const response = await fetch("/api/pricing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          vehicleTypeCode: pricedVehicleTypeCode,
          cargoCategory,
          ...locationHelpBody(pickupHelp, dropoffHelp),
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as
        | Estimate
        | { error?: string; reason?: string; supportPhone?: string | null };

      // Superseded by an input change (and so already invalidated above) or
      // by a newer calculation — either way, this result has nothing to add.
      if (controller.signal.aborted) {
        return null;
      }

      if (!response.ok) {
        if (pricingRefusalOf(payload) === "manual_quote") {
          setManualQuote({
            supportPhone:
              "supportPhone" in payload &&
              typeof payload.supportPhone === "string"
                ? payload.supportPhone
                : null,
          });
        }
        setEstimateError(
          "error" in payload && payload.error
            ? payload.error
            : t("couldNotPriceThisLoad"),
        );
        return null;
      }

      const quoted = payload as Estimate;
      setEstimate(quoted);
      setHelperNote(helperTimeNoteValues(quoted.helperRules));
      return quoted;
    } catch {
      if (!controller.signal.aborted) {
        setEstimateError(tShared("networkErrorPleaseCheckYourConnection"));
      }
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setEstimating(false);
      }
    }
  }

  // The latest `handleCalculate`, for the debounced effect below to call
  // without listing a function that is re-created on every render.
  const calculateRef = useRef(handleCalculate);
  useEffect(() => {
    calculateRef.current = handleCalculate;
  });

  /**
   * Price automatically: once every pricing input is present and nothing is
   * quoted for them yet, request an estimate after the inputs have sat still
   * for `AUTO_ESTIMATE_DELAY_MS`.
   *
   * Runs once per set of inputs. A failed estimate leaves `estimateError` set,
   * which stops this re-firing in a loop; the invalidation effect clears it on
   * the next input change, and the Recalculate button retries by hand. Paused
   * while a booking is in flight, which prices for itself if it has to.
   */
  useEffect(() => {
    if (
      !pricingInputsReady ||
      submitting ||
      estimating ||
      estimate !== null ||
      estimateError !== null
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void calculateRef.current();
    }, AUTO_ESTIMATE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    pricingInputsReady,
    submitting,
    estimating,
    estimate,
    estimateError,
    // The pricing inputs themselves, so every edit restarts the debounce.
    pickupAddress,
    dropoffAddress,
    pricedVehicleTypeCode,
    cargoCategory,
    pickupHelp,
    dropoffHelp,
  ]);

  /** Bring a step into view, centred, as the place to act next. */
  function scrollToSection(section: RequiredSection) {
    document
      .getElementById(sectionId(section))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /**
   * Upload the step-6 photos to the order just created, each exactly once, one
   * after another (see `uploadCargoPhotoBlobs`). Switches the Book button to
   * "Uploading photos…" only when there is a photo to send, and back to
   * "Booking…"/"Saving…" once they are sent, for the hand-off to checkout.
   * Never throws: photos are optional, and a failed upload must not strand a
   * booking that already exists.
   *
   * Resolves with how many uploads failed.
   */
  async function uploadCargoPhotos(orderId: string): Promise<number> {
    const photos = await cargoPhotos.settledPhotos();
    const failed = await uploadCargoPhotoBlobs(
      orderId,
      photos.map((photo) => photo.blob),
      (input, init) => fetch(input, init),
      () => setSubmitPhase("uploading"),
    );
    setSubmitPhase("booking");
    return failed;
  }

  /**
   * Validate, price if needed, place the order, upload its photos, then hand
   * the client off to its checkout page.
   *
   * Nothing about money is decided here. `POST /api/orders` writes an unpaid
   * order from the inputs above, and `/checkout/<id>` is where the method, the
   * card and — for a business — the purchase-order reference are collected,
   * against an order that by then exists and has a total.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || submitLockRef.current) {
      return;
    }

    setError(null);
    setPriceNotice(null);
    setSubmitAttempted(true);

    // A route over the manual-quote distance has no price to book at; the
    // price panel already says so and how to reach support.
    if (manualQuote !== null) {
      return;
    }

    const firstMissing = missingSections[0];
    if (firstMissing !== undefined || !scheduledDateTime || !cargoCategory) {
      // The `scheduledDateTime`/`cargoCategory` tests only narrow the types:
      // both are covered by `missingSections`.
      if (firstMissing !== undefined) {
        scrollToSection(firstMissing);
      }
      return;
    }

    // Not a required-field miss but a class nobody can fulfil with this load
    // space, or one the listed load does not fit. The selection effect never
    // picks either, so these are guards rather than paths — and they say so
    // out loud instead of failing at the endpoint. Step 5 explains both on the
    // selected card in the "Change vehicle" grid.
    if (!selectedVehicleIsServiceable) {
      setError(t("selectedVehicleNotServiceable"));
      scrollToSection("vehicle");
      return;
    }
    if (!cargoFitsVehicle) {
      setError(t(NO_VEHICLE_FITS_MESSAGE_KEY));
      scrollToSection("vehicle");
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    // Book was pressed before the automatic estimate landed (or after it
    // failed): price now rather than asking for a second click. The order
    // endpoint re-prices on its own, so this is about the client having seen
    // a figure the checkout page will confirm, not about trusting this one.
    let quote: Estimate | null = estimate;
    if (quote === null) {
      setSubmitPhase("pricing");
      quote = await handleCalculate();
      if (quote === null) {
        // `estimateError` already says why, in the price panel.
        submitLockRef.current = false;
        setSubmitting(false);
        return;
      }
    } else if (isQuoteExpired(quote.quoteExpiresAt, Date.now())) {
      // The quote in hand has outlived its validity (`quoteExpiresAt`):
      // re-quote before sending. Silent when the price is unchanged; when it
      // moved, stop and show the new figure instead of booking it unseen.
      const shownTotal = quote.serviceLevels[serviceLevel];
      setSubmitPhase("pricing");
      quote = await handleCalculate();
      if (quote === null) {
        submitLockRef.current = false;
        setSubmitting(false);
        return;
      }
      if (quotedTotalChanged(shownTotal, quote.serviceLevels[serviceLevel])) {
        setPriceNotice(t("priceUpdatedReviewAndBook"));
        submitLockRef.current = false;
        setSubmitting(false);
        return;
      }
    }

    setSubmitPhase("booking");

    try {
      // The same body either way. Edit mode sends it to the order it is
      // editing, and `PATCH /api/orders/<id>` takes exactly what the create
      // endpoint takes, re-prices it the same way and answers with the same
      // shape — so nothing below this call knows which of the two it made.
      const response = await fetch(
        initialOrder
          ? `/api/orders/${encodeURIComponent(initialOrder.id)}`
          : "/api/orders",
        {
          method: initialOrder ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scheduledAt: scheduledDateTime.toISOString(),
            pickupAddress,
            dropoffAddress,
            // The delivery-info captured at each end. `JSON.stringify` drops an
            // `undefined` value entirely, which is exactly the "no contact for
            // this stop" the endpoint reads as an empty block.
            pickupContact: stopContactPayload(contacts.pickup),
            dropoffContact: stopContactPayload(contacts.dropoff),
            // The goods, as the list the client built: the active mode's lines
            // only, in exactly the shape `parseOrderItems` accepts. The route
            // resolves them against the catalogue, re-runs `planLoad` and
            // writes the derived weight, envelope, volume, category and body
            // itself — which is why no cargo figure is sent.
            items: toItemsPayload(itemLines, activeMode),
            // Still required by the shared `parseQuoteFields` the route parses
            // with, so still sent — as the plan's derivation, which the route
            // overwrites with its own from the same function.
            cargoCategory,
            vehicleTypeCode: pricedVehicleTypeCode,
            // Recorded on the order, not priced from: `/api/orders` re-checks it
            // against the chosen vehicle's own `bodyTypes` and stores it so the
            // driver knows which body the load was booked for. For an
            // individual it is the plan's body, and the route ignores it in
            // favour of the same derivation; a business's is its own choice.
            bodyType,
            // Helpers, floor and elevator at each end — priced by the route
            // itself, never by a figure from here.
            ...locationHelpBody(pickupHelp, dropoffHelp),
            // The tariff the client was shown. A stale one is refused (409,
            // `tariff_changed`) so they never book a price they did not see.
            tariffVersion: quote.tariffVersion,
            // The tier, never its price: `/api/orders` re-derives the adjustment
            // from the quote it computes itself.
            serviceLevel,
            // No payment fields: they are checkout's to send.
            description: description.trim() || undefined,
            // The handling the listed items imply (a fridge is upright-only,
            // chilled goods are cold-chain), so the load board and job sheet
            // show them. The form has no step to edit them any more — the
            // cargo-details step was removed — so these are the plan's alone.
            handlingTags: plan?.handlingTags ?? [],
            // No cargo measurements, packaging, pickup window or delivery
            // deadline: the form no longer asks for them, and the endpoint
            // treats every one as optional. (On the items path it fills
            // `itemQuantity`/`packagingDescription` with its own summary.)
          }),
        },
      );

      const payload = (await response.json()) as
        CreatedOrder | { error?: string; reason?: string };

      const refusal = response.ok ? null : pricingRefusalOf(payload);
      if (refusal === "tariff_changed") {
        // Prices were retuned since this quote: fetch the new one, show it,
        // and let the client press Book again on a figure they have seen.
        setSubmitPhase("pricing");
        await handleCalculate();
        setPriceNotice(t("priceUpdatedReviewAndBook"));
        submitLockRef.current = false;
        setSubmitting(false);
        return;
      }
      if (refusal === "manual_quote") {
        // Only reachable without a quote on screen (it would have refused
        // already), so there is no support number in hand to show.
        setManualQuote({ supportPhone: null });
      }

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : isEditing
              ? t("couldNotSaveChanges")
              : t("orderFailed");
        setError(message);
        // Cleared here rather than in a `finally`, so that the successful path
        // below keeps the button disabled for the whole of the navigation.
        submitLockRef.current = false;
        setSubmitting(false);
        return;
      }

      const order = payload as CreatedOrder;

      // The order exists from here on, so nothing below may send the client
      // back to this form: a failed photo upload is logged and the booking
      // proceeds to checkout regardless. The project has no toast surface
      // that would survive the navigation, so the failure is not shown here.
      // No phase change here: `uploadCargoPhotos` says "Uploading photos…"
      // only if there are photos, and only while they are being sent.
      const failedUploads = await uploadCargoPhotos(order.id);
      if (failedUploads > 0) {
        console.warn(
          `${failedUploads} cargo photo upload(s) failed for order ${order.id}`,
        );
      }

      // `submitting` is deliberately left set — `router.push` resolves long
      // before the new route paints, and clearing it here would flick "Book
      // delivery" back to enabled over an order that has already been placed.
      router.push(`/checkout/${order.id}`);
    } catch {
      setError(tShared("networkErrorPleaseCheckYourConnection"));
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  /**
   * Enter, pressed anywhere in the form other than the multi-line description,
   * prices the current inputs if nothing is quoted for them yet — and never
   * books: placing a real order isn't a side effect a stray Enter keypress
   * should be able to trigger. Handling it here (and always calling
   * `preventDefault()`) also removes the browser's implicit form submission.
   */
  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }

    // Enter inserts a newline in the description field; let it.
    if (event.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Already handled by the control it was pressed in — the item picker's
    // search adds the highlighted item on Enter, and its other fields swallow
    // it. Quoting here as well would spend a request on the list as it was
    // *before* the item went in.
    if (event.defaultPrevented) {
      return;
    }

    event.preventDefault();

    if (estimate === null && canCalculate) {
      void handleCalculate();
    }
  }

  /** The card copy for the tier in hand — the title the bottom bar names. */
  const selectedServiceLevelOption = SERVICE_LEVEL_OPTIONS.find(
    (option) => option.level === serviceLevel,
  );

  /**
   * The fare at the selected tier, or `null` before a quote exists. Read out of
   * the estimate rather than computed: see `ServiceLevelPrices`.
   */
  const serviceLevelPrice = estimate
    ? estimate.serviceLevels[serviceLevel]
    : null;

  /**
   * What the tier does to the quoted fare, as a signed amount — the breakdown's
   * Priority fee or Pooling discount line.
   *
   * Derived by subtracting the quoted fare from the tier's own price rather
   * than by applying a percentage here: both figures are the server's, so the
   * line can never disagree with the total printed under it.
   */
  const serviceLevelDelta = estimate
    ? estimate.serviceLevels[serviceLevel] - estimate.price
    : 0;

  /**
   * The line under the bottom bar's total, naming what that figure is for.
   * Built from the parts that exist: the tier is always chosen, but the vehicle
   * is only settled once the taxonomy has loaded and filtered.
   */
  const totalCaption = [
    selectedServiceLevelOption
      ? t(selectedServiceLevelOption.titleKey)
      : undefined,
    selectedVehicleType ? vehicleTypeLabel(selectedVehicleType) : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return (
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-5 pt-8 pb-28 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
              {initialOrder
                ? t("editingOrder", { reference: initialOrder.reference })
                : t("newDelivery")}
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              {isEditing ? t("editYourDelivery") : t("bookADelivery")}
            </h1>
          </div>
          {/* Back to the order being edited rather than to the whole list:
              that page is where the client chose Edit, and where they would
              look to see the order unchanged if they leave without saving. */}
          <Link
            href={
              initialOrder
                ? `/orders/${initialOrder.id}`
                : guest
                  ? "/sign-in"
                  : "/orders"
            }
            className="group inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
          >
            {isEditing
              ? t("backToOrder")
              : guest
                ? t("haveAnAccountSignIn")
                : tShared("myOrders")}
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </header>

        {/* No confirmation panel, and no `result` state behind one: a booked
            order is confirmed on its own checkout page, which is where the
            client is sent the moment `POST /api/orders` answers. Restating the
            fare here as well would mean two surfaces printing a total for the
            same order, and only one of them looking at the row. */}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
          {/* `noValidate`: the required steps are checked by `handleSubmit`,
              which marks every missing one, rather than by the browser's
              one-field-at-a-time bubbles. */}
          <form
            id={formId}
            noValidate
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            className="flex flex-col gap-5"
          >
            <StepCard
              step={1}
              id={sectionId("schedule")}
              title={t("deliveryDateTime")}
              description={t("whenShouldTheDriverComeBy")}
              invalid={sectionInvalid("schedule")}
              invalidMessage={t("required")}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={dateTriggerId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    {tShared("date")}
                  </Label>
                  <Popover
                    open={datePickerOpen}
                    onOpenChange={setDatePickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <button
                        id={dateTriggerId}
                        type="button"
                        className={`flex items-center gap-2 ${NATIVE_FIELD_CLASSES}`}
                      >
                        <CalendarDays
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted"
                        />
                        <span
                          className={
                            scheduledDate ? "text-paper" : "text-muted"
                          }
                        >
                          {scheduledDate
                            ? scheduledDateFormatter.format(scheduledDate)
                            : t("selectADate")}
                        </span>
                      </button>
                    </PopoverTrigger>

                    <PopoverContent
                      align="start"
                      className="w-auto border-line bg-ink p-0 text-paper ring-line"
                    >
                      {/* Retints the calendar's selected-day highlight from
                          shadcn's default near-black `--primary` to this app's
                          green accent, scoped to just this popover rather
                          than touching the token globally. */}
                      <div
                        style={
                          {
                            "--primary": "var(--landing-accent)",
                            "--primary-foreground": "var(--landing-ink)",
                          } as React.CSSProperties
                        }
                      >
                        <Calendar
                          mode="single"
                          selected={scheduledDate ?? undefined}
                          onSelect={(date) => {
                            setScheduledDate(date ?? null);
                            setDatePickerOpen(false);
                          }}
                          disabled={{ before: todayStart }}
                          autoFocus
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={timeSelectId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    {tShared("time")}
                  </Label>
                  <select
                    id={timeSelectId}
                    value={scheduledTime}
                    onChange={(event) => setScheduledTime(event.target.value)}
                    required
                    className={NATIVE_FIELD_CLASSES}
                  >
                    <option value="" disabled>
                      {scheduledDate ? t("selectATime") : t("pickADateFirst")}
                    </option>
                    {availableTimeSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {formatTimeSlot(slot)}
                      </option>
                    ))}
                  </select>
                  {scheduledDate && availableTimeSlots.length === 0 ? (
                    <p className="text-xs text-muted">
                      {t("noSlotsLeftTodayPickA")}
                    </p>
                  ) : null}
                </div>
              </div>
            </StepCard>

            <StepCard
              step={2}
              id={sectionId("route")}
              title={tShared("route")}
              invalid={sectionInvalid("route")}
              invalidMessage={t("required")}
            >
              <div className="flex flex-col gap-4">
                {/* No remount key on either field any more. Each one owns
                    state this form cannot reach — the suggestion list and the
                    coordinates it resolved — and while a booking reset the form
                    in place, a changing `key` was the only way to clear that
                    along with the address string. Booking now navigates to
                    checkout instead, so React unmounts the whole form and takes
                    both fields' state with it; a counter that could no longer
                    change would have been a remount that never happened. */}
                <AddressAutocomplete
                  id="pickup-address"
                  label={t("pickupAddress")}
                  value={pickupAddress}
                  onChange={setPickupAddress}
                  onLocationChange={setPickupLocation}
                  // Selection, not resolution: `onLocationChange` also fires on
                  // every keystroke, and its one non-null call is behind a
                  // details lookup that is allowed to fail quietly — either
                  // would open this dialog at the wrong moment, or never.
                  onPlaceSelected={() => setContactModalFor("pickup")}
                  placeholder={t("eGRustaveliAve12Tbilisi")}
                  required
                />

                <AddressAutocomplete
                  id="dropoff-address"
                  label={t("dropoffAddress")}
                  value={dropoffAddress}
                  onChange={setDropoffAddress}
                  onLocationChange={setDropoffLocation}
                  onPlaceSelected={() => setContactModalFor("dropoff")}
                  placeholder={t("eGAghmashenebeliAve88Tbilisi")}
                  required
                />
              </div>

              {/* One dialog per stop, both mounted for the life of the form
                  rather than swapped in and out of a single slot. Each one
                  re-seeds its draft on the closed → open transition, which only
                  happens for a component that stays mounted, and Radix gets to
                  run its own close sequence — exit animation, focus returned
                  outwards, scroll unlocked — instead of being torn out
                  mid-close. Closed, a `Dialog` portals nothing and renders
                  nothing, so the pair costs no markup between openings.

                  They sit inside the `<form>`, which is what makes the Enter
                  guard on `DialogContent` load-bearing: Radix portals the panel
                  to `document.body`, but React still dispatches its synthetic
                  events up this tree, so an un-stopped Enter would reach
                  `handleFormKeyDown` and fire a live estimate from inside an
                  open modal. */}
              {STOP_FIELDS.map((stop) => (
                <StopContactDialog
                  key={stop}
                  open={contactModalFor === stop}
                  // Only ever called with `false` — nothing inside the dialog
                  // opens it, and Cancel, Escape and a backdrop click all land
                  // here. The address the client picked stays in the field
                  // either way: closing discards the draft, not the selection.
                  onOpenChange={(open) => {
                    if (!open) {
                      setContactModalFor(null);
                    }
                  }}
                  stop={stop}
                  // The field's own value, not the label the selection carried:
                  // it already holds that label by this render, and it is the
                  // one that gets refined when the structured lookup lands, so
                  // reading it keeps the dialog's address line in step with the
                  // input behind it.
                  address={stop === "pickup" ? pickupAddress : dropoffAddress}
                  initialValue={contacts[stop]}
                  onSave={(contact) =>
                    setContacts((current) => ({ ...current, [stop]: contact }))
                  }
                />
              ))}
            </StepCard>

            {/* Goods shortcuts: the entry points into the item list below,
                the same table the landing page's tiles read
                (`GOODS_SHORTCUTS`). Picking one opens the picker on its
                catalogue group (or, for a business, on Pallets) and decides
                nothing else — the cargo category is derived from the items.
                `aria-pressed` buttons, matching the cargo-category grid this
                replaced and the vehicle grid below. */}
            <StepCard
              step={3}
              title={t("whatAreYouMoving")}
              description={t("pickTheClosestMatchYoullList")}
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {shortcutsFor(accountType).map((shortcut) => {
                  const { code, Icon } = shortcut;
                  const selected = code === goodsShortcut;

                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleGoodsShortcut(shortcut)}
                      className={`${PICK_CARD_BASE_CLASSES} gap-1.5 ${
                        selected
                          ? PICK_CARD_SELECTED_CLASSES
                          : PICK_CARD_IDLE_CLASSES
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`size-5 ${selected ? "text-accent" : "text-muted"}`}
                      />
                      <span className="pr-4 text-[0.8125rem] leading-snug font-semibold text-paper">
                        {tGoods(`${code}.title`)}
                      </span>
                      <span className="text-xs leading-snug text-muted">
                        {tGoods(`${code}.description`)}
                      </span>
                      {selected ? <SelectedTick /> : null}
                    </button>
                  );
                })}
              </div>
            </StepCard>

            <StepCard
              step={4}
              title={t("listYourItems")}
              description={t("roughIsFineWeUseIt")}
              id={sectionId("items")}
              invalid={sectionInvalid("items")}
              invalidMessage={
                plan === null ? t("required") : t(FIX_ITEM_LIST_FIRST_KEY)
              }
            >
              {/* Fully controlled: the form owns the mode and the lines,
                  because it plans them, invalidates the quote on them and
                  submits them. The picker keeps only presentation state. */}
              <ItemListPicker
                accountType={accountType}
                initialGroup={selectedGoodsShortcut?.group ?? null}
                mode={loadMode}
                onModeChange={setLoadMode}
                lines={itemLines}
                onLinesChange={setItemLines}
                catalogue={catalogue}
                catalogueLoading={catalogueLoading}
                catalogueError={catalogueError}
              />
            </StepCard>

            <StepCard
              step={5}
              title={t("yourVehicle")}
              description={t("pickedToFitYourItems")}
              id={sectionId("vehicle")}
              invalid={sectionInvalid("vehicle")}
              invalidMessage={
                bodyType === null
                  ? t(CHOOSE_LOAD_SPACE_FIRST_KEY)
                  : t("required")
              }
            >
              {/* Every step is open at any time (staging's unlocked steps), so
                  until the item list adds up to a load the route would accept
                  this step shows one muted line pointing back at the list
                  rather than judging a load that does not exist yet: with no
                  items the cargo-eligible list is empty and would read as "no
                  vehicle is available"; with a body conflict the plan's dry-box
                  fallback would be judged and read as "no carrier runs these
                  classes", on top of the picker's own conflict alert. */}
              {vehicleTypesError ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  {vehicleTypesError}
                </p>
              ) : !planBookable ? (
                <p className={STEP_HINT_CLASSES}>
                  {plan === null
                    ? t(LIST_ITEMS_FIRST_KEY)
                    : t(FIX_ITEM_LIST_FIRST_KEY)}
                </p>
              ) : loadingVehicleTypes ? (
                <p aria-busy="true" className="text-[0.8125rem] text-muted">
                  {tShared("loadingVehicleTypes")}
                </p>
              ) : (
                <>
                  {/* Native radios again, one per load space, each visually
                      replaced by the card wrapping it — the same trade the
                      helper-count picker in step 7 makes, and for the same
                      reasons: arrow-key navigation of the group and the "2 of
                      3" announcement, both free.

                      Business accounts only, and with no default: nothing is
                      checked until the client picks (see `chosenBodyType`).
                      An individual is never asked: the body is the one their
                      items need (see `bodyType`), named in one line under the
                      recommendation, and the route derives it the same way
                      whatever is sent.

                      A card the items rule out — every card but the one an
                      item forces — is disabled in place with the reason, the
                      vehicle grid's own treatment. Per-card vehicle counts stay
                      on every card, disabled ones included. */}
                  {isBusiness ? (
                    <fieldset className="mb-[18px]">
                      <legend className="mb-2.5 text-[0.8125rem] font-medium text-paper">
                        {t("whatKindOfLoadSpaceDo")}
                      </legend>

                      <div className="grid grid-cols-3 gap-2.5">
                        {bodyTypeCards.map((option) => {
                          const selected = option.body === bodyType;
                          const countLabel = vehicleCountLabel(
                            option.vehicleCount,
                            t,
                          );
                          const incompatibleReason =
                            unambiguousForcedBody !== null &&
                            option.body !== unambiguousForcedBody
                              ? t(
                                  FORCED_BODY_CARD_REASON_KEYS[
                                    unambiguousForcedBody
                                  ],
                                )
                              : null;

                          return (
                            <label
                              key={option.body}
                              className={`${BODY_OPTION_CLASSES} ${
                                selected
                                  ? PICK_CARD_SELECTED_CLASSES
                                  : incompatibleReason !== null
                                    ? `${PICK_CARD_UNAVAILABLE_CLASSES} cursor-not-allowed`
                                    : PICK_CARD_IDLE_CLASSES
                              }`}
                            >
                              <input
                                type="radio"
                                name={bodyTypeName}
                                value={option.body}
                                checked={selected}
                                disabled={incompatibleReason !== null}
                                onChange={() =>
                                  handleBodyTypeChange(option.body)
                                }
                                // The card's own text is hidden from assistive
                                // tech (below) and spoken from here instead, so
                                // the lines arrive as one name in one reading
                                // order rather than as loose text beside an
                                // unnamed radio.
                                aria-label={[
                                  `${t(option.titleKey)} — ${t(option.descriptionKey)}`,
                                  countLabel,
                                  incompatibleReason,
                                ]
                                  .filter((part): part is string =>
                                    Boolean(part),
                                  )
                                  .join(" · ")}
                                className="sr-only"
                              />
                              <span
                                aria-hidden="true"
                                className="pr-4 text-[0.8125rem] leading-snug font-semibold text-paper"
                              >
                                {t(option.titleKey)}
                              </span>
                              <span
                                aria-hidden="true"
                                className="text-xs leading-snug text-muted"
                              >
                                {t(option.descriptionKey)}
                              </span>
                              <span
                                aria-hidden="true"
                                className="font-price text-[0.6875rem] text-muted tabular-nums"
                              >
                                {countLabel}
                              </span>
                              {incompatibleReason !== null ? (
                                <span
                                  aria-hidden="true"
                                  className={
                                    PICK_CARD_UNAVAILABLE_REASON_CLASSES
                                  }
                                >
                                  {incompatibleReason}
                                </span>
                              ) : null}
                              {selected ? <SelectedTick /> : null}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  {bodyType === null ? (
                    // A business that has not chosen: there is no vehicle to
                    // recommend until there is a body. Muted, not an alert —
                    // nothing has gone wrong, a question is simply unanswered.
                    <p className="text-[0.8125rem] leading-snug text-muted">
                      {t(CHOOSE_LOAD_SPACE_FIRST_KEY)}
                    </p>
                  ) : cargoEligibleVehicleTypes.length === 0 ? (
                    <p role="alert" className="text-[0.8125rem] text-accent">
                      {t("noVehicleIsCurrentlyAvailableFor")}
                    </p>
                  ) : eligibleVehicleTypes.length === 0 ? (
                    // The body filter's branch: the item list cleared some
                    // class (the list above is not empty) but none of them
                    // offers the load space being booked. For a business that
                    // is the load-space choice, which the copy names; for an
                    // individual it means no class of the duty their items
                    // need offers the body those items force — nothing they
                    // can choose here fixes that, so their copy points at the
                    // list instead.
                    //
                    // The structure is exhaustive: no state reaches the
                    // recommendation with nothing in it and no message.
                    <p
                      role="alert"
                      className="rounded-lg border border-accent/30 bg-accent/[0.08] px-3.5 py-3 text-[0.8125rem] leading-snug text-accent"
                    >
                      {isBusiness
                        ? t("noVehicleMatchesThisBodyType")
                        : t("noVehicleOffersTheBodyYourItemsNeed")}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {/* The grid-wide line for when nothing at all can be
                          booked, in place of a recommendation there is nothing
                          to make. Above everything else in the step because it
                          is about all of it: the client's next move is
                          elsewhere — the item list or the load space — which
                          is a sentence no single card can carry.

                          `role="alert"` where the card badges pointedly have
                          none, and the two do not double up: the badges are
                          static content of buttons already announced as
                          disabled, this fires once, and only on an item-list or
                          load-space change the client just made. */}
                      {recommendation.recommended === null ? (
                        <p
                          role="alert"
                          className="rounded-lg border border-accent/30 bg-accent/[0.08] px-3.5 py-3 text-[0.8125rem] leading-snug text-accent"
                        >
                          {/* Which of the two ways the list emptied: every
                              class too small for the list, or every class that
                              fits run by no carrier with this body. */}
                          {eligibleVehicleTypes.every(
                            (vehicleType) =>
                              vehicleFit.get(vehicleType.code)?.verdict ===
                              "cannot_fit",
                          )
                            ? t(NO_VEHICLE_FITS_MESSAGE_KEY)
                            : t(NO_SERVICEABLE_VEHICLES_MESSAGE_KEY)}
                        </p>
                      ) : (
                        <VehicleRecommendation
                          recommended={recommendation.recommended}
                          oneSizeUp={recommendation.oneSizeUp}
                          selectedCode={vehicleTypeCode}
                          quotedPrice={serviceLevelPrice}
                          vehicleLabel={vehicleTypeLabel}
                          onSelect={handleVehicleChoice}
                        />
                      )}

                      {/* The hand-picked class the selection effect had to let
                          go, named, with why — a status rather than an alert:
                          it reports a change already made, and the client is
                          most likely in step 4 making the edit that caused it.
                          Hidden once the client is back on that class. */}
                      {releasedVehicle !== null &&
                      releasedVehicle.code !== vehicleTypeCode ? (
                        <p role="status" className={FIELD_NOTICE_CLASSES}>
                          {t(
                            VEHICLE_RELEASE_MESSAGE_KEYS[
                              releasedVehicle.reason
                            ],
                            {
                              vehicle: (() => {
                                const released = vehicleTypes.find(
                                  (vehicleType) =>
                                    vehicleType.code === releasedVehicle.code,
                                );
                                return released
                                  ? vehicleTypeLabel(released)
                                  : releasedVehicle.code;
                              })(),
                            },
                          )}
                        </p>
                      ) : null}

                      {/* Why an individual's vehicle has the body it has —
                          they are never asked, so this one line is where a
                          refrigerated van stops being a surprise. */}
                      {!isBusiness ? (
                        <p className="text-xs leading-snug text-muted">
                          {t("derivedLoadSpace", {
                            body: t(DERIVED_BODY_LABEL_KEYS[bodyType]),
                          })}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        {/* A disclosure, not a tab: the grid below is the same
                            choice in more detail, and stays mounted only while
                            open. Opens by itself when the selection sits on a
                            class the two cards above do not show. */}
                        <button
                          type="button"
                          aria-expanded={vehicleGridOpen}
                          aria-controls={vehicleGridId}
                          onClick={() => setVehicleGridOpen((open) => !open)}
                          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-paper underline-offset-4 transition-colors hover:text-accent hover:underline"
                        >
                          {t("changeVehicle")}
                          <span
                            aria-hidden="true"
                            className={`text-muted transition-transform ${
                              vehicleGridOpen ? "rotate-180" : ""
                            }`}
                          >
                            ▾
                          </span>
                        </button>

                        {/* Only while the client has picked away from a
                            recommendation that exists: in following mode the
                            selection already is the recommendation, and this
                            would be a button that does nothing. */}
                        {vehicleChosenByClient &&
                        recommendedCode !== null &&
                        vehicleTypeCode !== recommendedCode ? (
                          <button
                            type="button"
                            onClick={handleUseRecommended}
                            className="text-[0.8125rem] font-semibold text-accent underline-offset-4 hover:underline"
                          >
                            {t("useRecommended")}
                          </button>
                        ) : null}
                      </div>

                      {/* The full grid, as task-10 left it. Every card here is
                          measured against the listed load (`assessFit`,
                          through `vehicleFit`), and the ones that cannot take
                          it are disabled *in place*, with the reason printed
                          on the card. A card that can take it but may be tight
                          — over its weight margin, packed volume or floor area
                          — stays selectable with a muted warning line: soft
                          fit steers, it never refuses.

                          A class no carrier operates with this body is
                          disabled in the same way and in the same slot — see
                          `cardReason` below for which of the two speaks when
                          both apply.

                          Annotated, never filtered — the classes stay in
                          `eligibleVehicleTypes`, whichever reason disables
                          them. (What they are kept out of is
                          `bookableVehicleTypes`, which is only what the form
                          picks *for* the client: the recommendation, the
                          `Best` pill and the selection effect. Nothing leaves
                          this grid.) A card that stays where it is and says
                          "Too short for 2.2 m" tells the client what this
                          class cannot do and why the bigger one was
                          recommended, where a card that silently vanished
                          would leave them wondering where the cheap van went.

                          The grid used to have a second reason to annotate
                          rather than filter: dropping a newly unfit class would
                          have moved the client's selection under them, in a
                          step they were not looking at. That argument now has
                          its own mechanism, `vehicleChosenByClient`: a class
                          the client clicked — here or on the two cards above —
                          is never moved by a plan change while it can still be
                          booked. It is let go only when it becomes
                          `cannot_fit` or unavailable for the body, and then
                          the line above says which class went and why. A class
                          the form picked follows the recommendation instead. */}
                      {vehicleGridOpen ? (
                        <div id={vehicleGridId}>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {eligibleVehicleTypes.map((vehicleType) => {
                              const selected =
                                vehicleType.code === vehicleTypeCode;
                              const isBestFit =
                                recommendedCode === vehicleType.code;
                              const Glyph =
                                VEHICLE_CATEGORY_GLYPHS[vehicleType.category];

                              // Read from `vehicleFit`, judged once per plan by
                              // `assessFit` — whose hard axes are `oversizeAxes`
                              // through `specCapability`, never the spec's raw
                              // `cargoHeightM`: FLATBED_TRUCK is seeded with `0` for
                              // "open bed, no height limit", and a literal reading
                              // would disable the flatbed card for every load.
                              const fit =
                                vehicleFit.get(vehicleType.code) ?? null;
                              const unfitAxes: CargoAxis[] =
                                fit?.hardAxes ?? [];
                              const unfitReason =
                                plannedEnvelope !== null && unfitAxes.length > 0
                                  ? cargoFitCardReason(
                                      unfitAxes,
                                      plannedEnvelope,
                                      t,
                                    )
                                  : null;
                              // Soft fit: selectable, with one muted line. Never
                              // alongside a hard reason — a card that cannot take
                              // the load says that and only that.
                              const softFitWarning =
                                fit?.verdict === "may_not_fit"
                                  ? t("mayNotFitItems")
                                  : null;

                              // One badge, never two, and the same one slot for both
                              // states — this is a second reason for a card to be
                              // unavailable, not a second kind of unavailable.
                              //
                              // Unserviceable wins when both are true, and the
                              // precedence is not arbitrary. "No carriers run this
                              // class" is a fact about the fleet that nothing the
                              // client can do will change, while "Too short for
                              // 2.2 m" names an edit they could go and make. Leading
                              // with the cargo reason would send them back to step 4
                              // to drop an item in order to unlock a card that
                              // stays unbookable at the end of it — work
                              // done, no vehicle gained, and the real answer still
                              // unsaid. Told the other way round nothing is lost: a
                              // client who moves to a class someone does drive is
                              // measured against their cargo there, on that card, at
                              // the moment it can matter.
                              //
                              // Stacking both was considered and rejected on the same
                              // grounds these badges are terse for. Two lines of
                              // accent text per card, across a grid of them, buries
                              // the one line the client needs — and the second line
                              // would be advice about a hypothetical truck.
                              const cardReason = !servesBody(vehicleType)
                                ? t(NO_CARRIERS_CARD_REASON_KEY)
                                : unfitReason;

                              return (
                                <button
                                  key={vehicleType.code}
                                  type="button"
                                  aria-pressed={selected}
                                  // Really disabled, not `aria-disabled` with a no-op
                                  // handler: there is nothing here for a click to
                                  // achieve or for a keyboard user to reconsider, and
                                  // `handleSubmit` refuses this pairing regardless of
                                  // which control set it. The reason is rendered as
                                  // text *inside* the button rather than hung off an
                                  // `aria-describedby`, which is what keeps it
                                  // reachable — a disabled button is out of the tab
                                  // order, so a description attached to it is one a
                                  // screen-reader user would have to focus the button
                                  // to hear. Its own content is read in browse mode
                                  // along with the disabled state, so the badge
                                  // announces with the card exactly as it renders
                                  // with it. Both reasons travel this one route, so
                                  // an unserviceable class is announced as disabled
                                  // and reads out why on the same terms a cargo-unfit
                                  // one does.
                                  disabled={cardReason !== null}
                                  onClick={() =>
                                    handleVehicleChoice(vehicleType.code)
                                  }
                                  // A card that is both selected and unfit keeps the
                                  // selected fill and its tick rather than dimming:
                                  // it is still the class this booking is pointed at,
                                  // which is the first thing the client needs to see,
                                  // and the accent badge below is what says it cannot
                                  // stay that way. Dimming it would leave the client
                                  // hunting for which card was theirs at the moment
                                  // they most need to know.
                                  className={`${PICK_CARD_BASE_CLASSES} ${
                                    selected
                                      ? PICK_CARD_SELECTED_CLASSES
                                      : cardReason !== null
                                        ? PICK_CARD_UNAVAILABLE_CLASSES
                                        : PICK_CARD_IDLE_CLASSES
                                  }${cardReason !== null ? " cursor-not-allowed" : ""}`}
                                >
                                  <span className="flex items-start justify-between gap-2">
                                    <Glyph
                                      className={`h-6 w-12 shrink-0 ${
                                        selected ? "text-accent" : "text-muted"
                                      }`}
                                    />
                                    {/* Teal, never orange: "recommended" is a
                              different signal from "what you picked". The
                              same class as the "Recommended" card above. The
                              badge sits in flow at the top right, where the
                              selection tick is absolutely positioned — so on
                              a selected card it steps aside by the tick's
                              width plus its inset rather than sitting under
                              it. */}
                                    {isBestFit ? (
                                      <span
                                        className={`rounded-full bg-emerald-600/10 px-2 py-0.5 text-[0.5625rem] font-semibold tracking-[0.1em] text-emerald-700 uppercase dark:bg-emerald-400/15 dark:text-emerald-300 ${
                                          selected ? "mr-5" : ""
                                        }`}
                                      >
                                        {t("best")}
                                      </span>
                                    ) : null}
                                  </span>

                                  <span className="mt-2.5 pr-4 text-[0.8125rem] leading-snug font-semibold text-paper">
                                    {vehicleTypeLabel(vehicleType)}
                                  </span>
                                  <span className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-price text-[0.6875rem] text-muted">
                                    <span>
                                      {formatVehicleDimensions(
                                        vehicleType.cargoLengthM,
                                        vehicleType.cargoWidthM,
                                        vehicleType.cargoHeightM,
                                      )}
                                    </span>
                                    <span>
                                      {t("specUpTo", {
                                        weight: formatVehiclePayload(
                                          vehicleType.maxPayloadKg,
                                        ),
                                      })}
                                    </span>
                                  </span>

                                  {/* Below the spec line, not above it: the figures
                                are what the badge is a verdict on, so a client
                                reading top to bottom gets the class, its
                                capacity, and only then why their load exceeds
                                it. No `role` — this is static content of a
                                button that is already announced as disabled,
                                and an `alert` here would fire once per unfit
                                card every time an item is added. The one
                                interruption this deserves is the grid-wide
                                alert above, when nothing is left to book. */}
                                  {cardReason !== null ? (
                                    <span
                                      className={
                                        PICK_CARD_UNAVAILABLE_REASON_CLASSES
                                      }
                                    >
                                      {cardReason}
                                    </span>
                                  ) : null}

                                  {cardReason === null &&
                                  softFitWarning !== null ? (
                                    <span
                                      className={PICK_CARD_SOFT_FIT_CLASSES}
                                    >
                                      {softFitWarning}
                                    </span>
                                  ) : null}

                                  {selected ? <SelectedTick /> : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </StepCard>

            {/* Optional. Held in memory until the order exists, then uploaded
                to it in `handleSubmit` — see `uploadCargoPhotos`. */}
            <StepCard
              step={6}
              title={t("cargoPhotos")}
              description={
                isEditing
                  ? t("cargoPhotosEditDescription")
                  : t("cargoPhotosDescription", {
                      max: MAX_CARGO_PHOTOS,
                    })
              }
            >
              <CargoPhotosField state={cargoPhotos} disabled={submitting} />
            </StepCard>

            <StepCard step={7} title={t("additionalDetails")}>
              <div className="flex flex-col gap-4">
                <HelperLocationsField
                  pickup={pickupHelp}
                  dropoff={dropoffHelp}
                  onChange={handleHelpChange}
                  disabled={submitting}
                  timeNote={helperNote}
                  suggestion={
                    twoPersonItemLabel !== null
                      ? t("twoPeopleRecommended", { item: twoPersonItemLabel })
                      : null
                  }
                />

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={descriptionId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    {t("descriptionOptional")}
                  </Label>
                  <Textarea
                    id={descriptionId}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder={t("anythingTheDriverShouldKnow")}
                    className="border-line text-sm focus-visible:border-accent focus-visible:ring-accent/20"
                  />
                </div>
              </div>
            </StepCard>

            {/* Unnumbered, but wearing the step cards' chrome: the numbered
                steps above describe the job itself, and this is a choice about
                how that job is *handled* — one the form always has an answer
                for, since it opens on Regular. Numbering it would add a thing
                to answer that is already answered. The header note the handoff
                puts to the right of the title sits in the card's own
                description slot instead, which is where a step card keeps its
                subtitle. */}
            <StepCard
              title={tShared("serviceLevel")}
              description={
                estimate
                  ? t("pricesBelowForRoute")
                  : t("pricesAppearOncePriced")
              }
            >
              {/* Native radios again, for the third time in this form and for
                  the same reasons as the load-space and helper-count pickers:
                  three mutually exclusive options are what a radio group is
                  for, and the group's arrow-key navigation and its "1 of 3"
                  announcement both come free with the real inputs. */}
              <fieldset>
                {/* The card's title is this group's visible name; assistive
                    tech has no way to associate the two, so the legend says it
                    again rather than leaving the group unnamed. */}
                <legend className="sr-only">{tShared("serviceLevel")}</legend>

                <div className="grid grid-cols-3 gap-2.5">
                  {SERVICE_LEVEL_OPTIONS.map((option) => {
                    const selected = option.level === serviceLevel;
                    // Every tier prices off the same quote, so all three
                    // figures appear and disappear together.
                    const priceLabel = estimate
                      ? formatGel(estimate.serviceLevels[option.level])
                      : null;

                    return (
                      <label
                        key={option.level}
                        className={`${SERVICE_LEVEL_OPTION_CLASSES} ${
                          selected
                            ? PICK_CARD_SELECTED_CLASSES
                            : PICK_CARD_IDLE_CLASSES
                        }`}
                      >
                        <input
                          type="radio"
                          name={serviceLevelName}
                          value={option.level}
                          checked={selected}
                          onChange={() => setServiceLevel(option.level)}
                          // The card's text is hidden from assistive tech
                          // (below) and spoken from here instead, so the tier
                          // arrives as one name in one reading order — and the
                          // price arrives with it rather than as loose text.
                          aria-label={
                            priceLabel
                              ? `${t(option.titleKey)} — ${t(option.descriptionKey)} · ${priceLabel}`
                              : `${t(option.titleKey)} — ${t(option.descriptionKey)}`
                          }
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="pr-7 text-[0.9375rem] leading-snug font-semibold text-paper"
                        >
                          {t(option.titleKey)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="min-h-8 text-xs leading-[1.35] text-muted"
                        >
                          {t(option.descriptionKey)}
                        </span>
                        <span
                          aria-hidden="true"
                          className={
                            priceLabel
                              ? "mt-1.5 font-price text-[1.3125rem] leading-none font-semibold text-paper tabular-nums"
                              : "mt-1.5 font-price text-[0.9375rem] leading-none text-muted/60 tabular-nums"
                          }
                        >
                          {priceLabel ?? EMPTY_STAT}
                        </span>
                        {option.badge ? (
                          <span
                            aria-hidden="true"
                            // `bg-black/[0.04]` is a *light*-mode recess: 4% of
                            // black over a pale card. Over a dark card it is
                            // invisible, and darkening it further would only
                            // dig a hole. The dark half inverts the direction
                            // and lifts the disc off the card with 8% white
                            // instead — the same "one step from the surface"
                            // relationship, mirrored.
                            className={`absolute top-2.5 right-2.5 flex size-[22px] items-center justify-center rounded-full bg-black/[0.04] text-xs font-bold dark:bg-white/[0.08] ${option.badge.className}`}
                          >
                            {option.badge.glyph}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </StepCard>

            {/* Rendered before the first estimate too, so the column doesn't
                grow a whole new panel under the user's cursor when one lands. */}
            <section
              aria-live="polite"
              className="rounded-xl border border-line bg-surface px-4 py-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className={PANEL_LABEL_CLASSES}>{t("priceBreakdown")}</h2>
                <p className="text-[0.6875rem] text-muted">
                  {estimating ? t("calculating") : null}
                </p>
              </div>

              {priceNotice ? (
                <p
                  role="status"
                  className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
                >
                  {priceNotice}
                </p>
              ) : null}

              {estimate ? (
                <>
                  <dl className="mt-3 flex flex-col gap-1.5">
                    <BreakdownRow
                      label={tShared("distance")}
                      value={formatDistanceKm(estimate.distanceKm)}
                    />
                    {/* Transport — base, distance, time and (intercity) the
                        return-trip allowance as the one figure the server
                        calls `transportFare`. The tier below applies to this
                        line only. */}
                    <BreakdownRow
                      label={t("transport")}
                      value={formatGel(transportCharge(estimate))}
                    />
                    {/* Helpers, split by the end they work at, each only
                        when booked there. A response without the split (an
                        older server) falls back to the one combined line. */}
                    {estimate.pickupHelperFee === undefined ||
                    estimate.dropoffHelperFee === undefined ? (
                      estimate.helperFee > 0 ? (
                        <BreakdownRow
                          label={tShared("helperFee")}
                          value={formatGel(estimate.helperFee)}
                        />
                      ) : null
                    ) : (
                      <>
                        {estimate.pickupHelperFee > 0 ? (
                          <BreakdownRow
                            label={t("helpersAtPickupFee", {
                              count: pickupHelp.helpers,
                            })}
                            value={formatGel(estimate.pickupHelperFee)}
                          />
                        ) : null}
                        {estimate.dropoffHelperFee > 0 ? (
                          <BreakdownRow
                            label={t("helpersAtDropoffFee", {
                              count: dropoffHelp.helpers,
                            })}
                            value={formatGel(estimate.dropoffHelperFee)}
                          />
                        ) : null}
                      </>
                    )}
                    {/* What those lines add up to, and then what the chosen
                        tier does to it. The quoted fare has to be named before
                        an uplift or a discount can be shown against it, and the
                        total has to follow, or the panel would print a fee with
                        nothing for it to reconcile to — the reason this panel
                        used to end at the helper fee and defer its total to the
                        bar at the foot of the viewport.

                        Only when the tier actually moves the fare, though: on
                        Regular the quoted fare *is* the total, and `BreakdownRow`
                        gives every line the same weight, so the row would print
                        one figure twice with nothing to tell the two apart.
                        Priority and Pooling keep all three lines. */}
                    {serviceLevelDelta !== 0 ? (
                      <BreakdownRow
                        label={t("regularFare")}
                        value={formatGel(estimate.price)}
                      />
                    ) : null}
                    {/* Exactly one of these, or neither: Regular is the tier
                        the quote is already priced at, so it moves nothing. */}
                    {serviceLevel === "PRIORITY" ? (
                      <BreakdownRow
                        label={t("priorityFee")}
                        value={`+${formatGel(serviceLevelDelta)}`}
                      />
                    ) : serviceLevel === "POOLING" ? (
                      <BreakdownRow
                        label={t("poolingDiscount")}
                        // A real minus sign, not a hyphen: this sits beside a
                        // "+" of the same weight in the tier above it.
                        value={`−${formatGel(Math.abs(serviceLevelDelta))}`}
                      />
                    ) : null}
                    <BreakdownRow
                      label={tShared("total")}
                      value={formatGel(estimate.serviceLevels[serviceLevel])}
                    />
                  </dl>

                  {estimate.tripType === "INTERCITY" ? (
                    <p className="mt-2.5 text-xs text-muted">
                      {t("intercityIncludesReturn")}
                    </p>
                  ) : minimumFareApplied(estimate) ? (
                    <p className="mt-2.5 text-xs text-accent">
                      {t("minimumFareAppliedForThisVehicle")}
                    </p>
                  ) : null}
                  {serviceLevelDelta !== 0 ? (
                    <p className="mt-1.5 text-xs text-muted">
                      {t("tierAppliesToTransport")}
                    </p>
                  ) : null}
                  {estimate.helperFee > 0 ? (
                    <p className="mt-1.5 text-xs text-muted">
                      {t("helperOvertimeNote", {
                        minutes: helperNote.includedMinutes,
                        fee: helperNote.fee,
                        increment: helperNote.incrementMinutes,
                      })}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
                  {pricingInputsReady
                    ? estimating
                      ? t("calculating")
                      : t("priceUpdatesAutomatically")
                    : t("fillInBoth")}
                </p>
              )}

              {manualQuote ? (
                // Not an error to retry but a job priced by hand: the route
                // is over the online-quote distance. Book is disabled below.
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-paper"
                >
                  <p className="font-semibold text-accent">
                    {t("manualQuoteTitle")}
                  </p>
                  {/* The server's own sentence: names the distance limit and
                      says to contact support. */}
                  <p className="mt-1">
                    {estimateError ?? t("manualQuoteFallback")}
                  </p>
                  {manualQuote.supportPhone ? (
                    <a
                      href={`tel:${manualQuote.supportPhone.replace(/[^\d+]/g, "")}`}
                      className="mt-2 inline-block font-semibold text-accent underline underline-offset-2"
                    >
                      {t("manualQuoteCall", {
                        phone: manualQuote.supportPhone,
                      })}
                    </a>
                  ) : null}
                </div>
              ) : estimateError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
                >
                  {estimateError}
                </p>
              ) : null}
            </section>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[0.8125rem] leading-snug text-accent"
              >
                {error}
              </p>
            ) : null}
          </form>

          <div className="lg:sticky lg:top-6">
            <button
              type="button"
              onClick={() => setMapVisible((visible) => !visible)}
              aria-expanded={mapVisible}
              aria-controls="route-preview"
              className="w-full rounded-xl border border-line px-4 py-3 text-[0.8125rem] font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent lg:hidden"
            >
              {mapVisible ? t("hideRouteMap") : t("showRouteMap")}
            </button>

            <div
              id="route-preview"
              // A class swap rather than a conditional render: the map must
              // mount exactly once, whatever the viewport or the toggle state,
              // or the Google Maps script would load twice.
              className={`mt-3 lg:mt-0 lg:block ${mapVisible ? "block" : "hidden"}`}
            >
              <RoutePreviewMap
                // Once an estimate has resolved, its LocationIQ-geocoded points
                // are what the route line and the price are actually based on —
                // preferred here over the Places autocomplete pin so the
                // markers and the route line agree. Before that (or if pricing
                // fell back and returned none), the Places pin is the best
                // coordinate available.
                pickup={estimate?.pickup ?? pickupLocation}
                pickupLabel={pickupAddress}
                dropoff={estimate?.dropoff ?? dropoffLocation}
                dropoffLabel={dropoffAddress}
                distanceKm={estimate?.distanceKm ?? null}
                routePath={estimate?.routePath ?? null}
                durationMinutes={estimate?.durationMinutes ?? null}
                vehicleLabel={
                  selectedVehicleType
                    ? vehicleTypeLabel(selectedVehicleType)
                    : null
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* A genuinely `fixed` bar, not a `sticky` one: this form is several
          screens tall, and `position: sticky` pins an element to the viewport
          edge for the entire scroll of a tall container, not just once the
          user nears its natural position — which permanently buried the
          vehicle picker and everything below it under this bar. `fixed`
          floats it above the page instead, outside the scrolling column
          entirely; `formId` is what still lets its submit button act on the
          form even though it's no longer one of its descendants. The content
          column keeps `pb-28` above so the true end of the page always clears
          this bar once scrolled all the way down. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur supports-[backdrop-filter]:bg-ink/85">
        <div className="mx-auto max-w-7xl px-5 py-3.5 sm:px-8">
          <div className="flex items-end justify-between gap-4 lg:max-w-[40rem]">
            <div className="min-w-0">
              <p className={PANEL_LABEL_CLASSES}>{t("estimatedTotal")}</p>
              {/* The selected tier's figure, not the bare quote: this is the
                  number the client is agreeing to when they book. */}
              <p className="mt-1.5 font-price text-[2.125rem] leading-none font-semibold tracking-[-0.03em] text-accent tabular-nums">
                {serviceLevelPrice === null
                  ? EMPTY_STAT
                  : formatGel(serviceLevelPrice)}
              </p>
              {/* Gated on the price as well as on its own text: the caption
                  names what a figure is for, and before a quote exists there is
                  no figure for it to name — only the em dash standing in for
                  one. */}
              {serviceLevelPrice !== null && totalCaption ? (
                <p className="mt-1 truncate text-xs text-muted">
                  {totalCaption}
                </p>
              ) : null}
            </div>

            {/* Book is always available (bar an in-flight booking): pressing it
                validates the required steps and prices on the spot if no
                estimate exists yet. Recalculate stays beside it for a client
                who wants a fresh quote by hand, and only appears once there is
                something to price. */}
            <div className="flex shrink-0 items-center gap-2.5">
              {pricingInputsReady ? (
                <Button
                  type="button"
                  onClick={() => void handleCalculate()}
                  disabled={!canCalculate || submitting}
                  className="h-12 gap-2 rounded-full border-paper bg-transparent px-5 text-[0.9375rem] font-semibold text-paper transition-colors hover:bg-surface hover:text-paper"
                >
                  {estimating && !submitting
                    ? t("calculating")
                    : estimate
                      ? t("recalculate")
                      : t("calculate")}
                </Button>
              ) : null}

              <Button
                type="submit"
                form={formId}
                // A manual-quote route has no price to book at.
                disabled={submitting || manualQuote !== null}
                aria-busy={submitting}
                className="h-12 gap-2 rounded-full bg-accent px-6 text-[0.9375rem] font-semibold text-ink transition-transform hover:bg-accent hover:-translate-y-0.5 disabled:translate-y-0"
              >
                {t(
                  bookButtonLabelKey({
                    submitting,
                    phase: submitPhase,
                    isEditing,
                  }),
                )}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
