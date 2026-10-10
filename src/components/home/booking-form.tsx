"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { CargoCategory, ChassisType, ServiceLevel } from "@prisma/client";

import { Link, useRouter } from "@/i18n/navigation";
import { AddressAutocomplete } from "@/components/address-autocomplete";
import { formatDistanceKm, formatGel } from "@/components/home/booking-format";
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
import { CARGO_OPTIONS } from "@/components/home/order-cargo-options";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES,
  useCargoCategoryLabel,
} from "@/lib/cargo";
import { vehicleTypeSpecLabel } from "@/lib/vehicle-type-spec-labels";

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
  helperFee: number;
  price: number;
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
 * Tolerance, in currency units, for comparing a total against the sum of its
 * parts: half a cent absorbs floating-point drift without ever masking a real
 * difference, which is at least one whole cent.
 */
const CURRENCY_EPSILON = 0.005;

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
 * Geometry for one cell of the crew-size row. Narrower than a pick card — it
 * holds a single numeral — but borrows that grid's border and fill states so
 * the two pickers read as the same control at different sizes.
 *
 * The radio inside each cell is `sr-only` (see the picker itself), so the cell
 * has to draw the focus ring on its behalf — the same `has-[:focus-visible]:`
 * stand-in the driver hub's radio rows use, in this palette's accent.
 */
const CREW_OPTION_CLASSES =
  "relative flex h-11 cursor-pointer items-center justify-center rounded-xl border font-price text-sm font-semibold transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20";

/**
 * Total people on the job, the driver included: 1 is the driver working alone
 * and 4 is the driver plus the three helpers pricing allows. Written out as a
 * literal tuple rather than derived from a range so `CrewSize` stays a union of
 * exactly these four numbers.
 */
const CREW_SIZE_OPTIONS = [1, 2, 3, 4] as const;

type CrewSize = (typeof CREW_SIZE_OPTIONS)[number];

/** Every booking starts with nobody but the driver. */
const DEFAULT_CREW_SIZE: CrewSize = 1;

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

/** The load space most goods travel in, and so what the picker starts on. */
const DEFAULT_BODY_TYPE: ChassisType = "DRY_BOX";

/**
 * One card of the load-space row. The pick-card geometry the goods and vehicle
 * grids use, plus the two things a `<label>` wrapping an `sr-only` radio has to
 * add for itself: the pointer affordance the `<button>`s get natively, and a
 * focus ring drawn on the hidden input's behalf (the same
 * `has-[:focus-visible]:` stand-in as the crew-size row below).
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
 * How long the pricing inputs must sit still before the estimate is requested
 * automatically. Long enough that typing an address does not spend a request
 * (three geocoder lookups) per keystroke, short enough to feel immediate once
 * the client stops.
 */
const AUTO_ESTIMATE_DELAY_MS = 700;

/**
 * The sections a booking cannot be placed without, in the order they appear
 * on the page — which is also the order the first missing one is scrolled to.
 * Everything else (photos, crew, description, service level) is optional or
 * carries a default.
 */
const REQUIRED_SECTIONS = [
  "schedule",
  "route",
  "cargo",
  "weight",
  "vehicle",
] as const;

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
 * What a crew size means, spelled out for assistive tech: the picker shows a
 * bare numeral, which on its own never says what is being counted — or that
 * the first of those people is the driver rather than a helper.
 */
function crewSizeDescription(size: CrewSize, t: BookingFormTranslate): string {
  if (size === 1) {
    return t("crewSizeOne");
  }

  return t("crewSizeMany", { size, helpers: size - 1 });
}

/**
 * How many vehicles a load space would leave the client to choose from.
 * Pluralised rather than printed as a bare "1 vehicles", the same reflex as
 * `crewSizeDescription` above.
 */
function vehicleCountLabel(count: number, t: BookingFormTranslate): string {
  return t("vehicleCount", { count });
}

/**
 * Everything the customer is charged for moving the load, as one figure: the
 * single line that stands in for the old base / distance / time itemisation.
 *
 * Derived by subtracting the helper fee from the quoted total rather than by
 * adding the three components it replaces, and the difference is not academic:
 * `price` is floored at the pricing rule's minimum fare, so on a short hop
 * those components sum to *less* than the total. Adding them would print two
 * lines that visibly fail to reach the total shown alongside them; subtracting
 * makes the breakdown reconcile at every distance.
 */
function transportationCost(quote: Quote): number {
  return quote.price - quote.helperFee;
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
 * Booking is where this surface ends. It takes no props and owns every piece of
 * state it renders from, because nothing about it is decided elsewhere: the
 * order it creates is unpaid, and the client is sent straight to
 * `/checkout/<id>` to settle it. Payment methods, saved cards and the business
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
 */
export function BookingForm(): React.ReactElement {
  const t = useTranslations("home.bookingForm");
  const locale = useLocale();
  // Root-scoped, for shared helpers that take full keys.
  const tRoot = useTranslations();
  // A catalogue class's name in the reader's language, by its stable code; the
  // API's `label` is the seeded English and the fallback for an unknown code.
  const vehicleTypeLabel = (vehicleType: { code: string; label: string }) =>
    vehicleTypeSpecLabel(vehicleType.code, vehicleType.label, tRoot);
  // The shared cargo taxonomy's labels in the reader's language; the English
  // maps in `@/lib/cargo` stay as the source for non-UI callers.
  const cargoCategoryLabel = useCargoCategoryLabel();
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
  const tCargo = useTranslations("home.orderCargoOptions");
  const router = useRouter();

  // Not an element id but a shared radio `name`: it is what binds the four
  // crew-size inputs into one group for the browser's own arrow-key handling.
  const crewSizeName = useId();
  // Likewise the shared `name` binding the three load-space radios together.
  const bodyTypeName = useId();
  // And the one binding the three service-level radios.
  const serviceLevelName = useId();
  const descriptionId = useId();
  const formId = useId();
  const dateTriggerId = useId();
  const timeSelectId = useId();
  const weightSelectId = useId();
  // Prefix for the required steps' card ids — see `sectionId`.
  const sectionIdPrefix = useId();

  // Null until both a day and a time slot are chosen — see `scheduledDateTime`,
  // the combined value everything downstream (submission, validation) reads.
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledTime, setScheduledTime] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Null until the client picks a bracket — required to book, and what the
  // vehicle list is filtered by. See `weightOptions`.
  const [maxWeightKg, setMaxWeightKg] = useState<number | null>(null);

  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  // Null until the matching address is *selected* from the autocomplete: these
  // gate the live estimate, so typing alone never spends a request.
  const [pickupLocation, setPickupLocation] = useState<LatLng | null>(null);
  const [dropoffLocation, setDropoffLocation] = useState<LatLng | null>(null);

  /**
   * Who the driver asks for at each end, and where in the building to find
   * them. Only *saved* contacts live here: the dialog owns its own draft, so a
   * cancelled edit never reaches this state and a re-opened stop shows whatever
   * was last saved for it.
   *
   * Nothing in the Route step renders from this — the card looks the same
   * before and after a contact is captured, by design.
   */
  const [contacts, setContacts] = useState<StopContacts>(NO_STOP_CONTACTS);

  /** Which stop's delivery-info dialog is open, or `null` when none is. */
  const [contactModalFor, setContactModalFor] = useState<StopField | null>(
    null,
  );

  // Null until the client picks one — required to book, and what both the
  // weight brackets and the vehicle list are derived from.
  const [cargoCategory, setCargoCategory] = useState<CargoCategory | null>(
    null,
  );
  // The load space the goods need. A filter on the vehicle list and nothing
  // more: it moves no price, because the catalogue already charges for the body
  // through each type's own pricing rule (a Refrigerated Van is priced above a
  // Closed Box Van), so a surcharge here would bill the same premium twice.
  const [bodyType, setBodyType] = useState<ChassisType>(DEFAULT_BODY_TYPE);
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");
  // Total people for loading and unloading, driver included — see
  // `helperCount` below for the figure the API is actually told.
  const [crewSize, setCrewSize] = useState<CrewSize>(DEFAULT_CREW_SIZE);
  // The tier the displayed price is for. Alone among the form's inputs it never
  // invalidates the quote — see the invalidation effect below — because every
  // tier's price is arithmetic on the one fare the server already quoted.
  const [serviceLevel, setServiceLevel] = useState<ServiceLevel>(
    DEFAULT_SERVICE_LEVEL,
  );
  const [description, setDescription] = useState("");

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  /**
   * Whether a booking is in flight — and it stays `true` once one succeeds,
   * deliberately, until the navigation to checkout unmounts this form. See
   * `handleSubmit`: the only paths that clear it are the ones that leave the
   * client on this page.
   */
  const [submitting, setSubmitting] = useState(false);
  /**
   * Which part of the booking is in flight, for the Book button's label:
   * pricing (when Book was pressed before an estimate existed), creating the
   * order, or uploading its photos.
   */
  const [submitPhase, setSubmitPhase] = useState<
    "pricing" | "booking" | "uploading"
  >("booking");
  const [error, setError] = useState<string | null>(null);

  /**
   * Set by the first press of Book. Until then no step is marked as missing,
   * so the form does not open pre-scolded; after it, a required step is red
   * for exactly as long as it stays unanswered (see `missingSections`).
   */
  const [submitAttempted, setSubmitAttempted] = useState(false);

  // Optional step-6 photos, uploaded to the order once it exists.
  const cargoPhotos = useCargoPhotos();

  // INDIVIDUAL until the profile says BUSINESS — see the hook.
  const accountType = useClientAccountType();

  /**
   * Extra helpers beyond the driver — the crew size the user picked, minus the
   * driver who is always there. This, not the crew size, is what both the
   * pricing and the orders endpoint take: the driver is not a line item.
   */
  const helperCount = crewSize - 1;

  // The map is a companion to the form on desktop and an opt-in panel on
  // mobile. This only drives a `hidden`/`block` swap — the map is never
  // conditionally unmounted, or it would re-mount (and re-bill) the Google Maps
  // script every time it was toggled.
  const [mapVisible, setMapVisible] = useState(false);

  const {
    vehicleTypes,
    loading: loadingVehicleTypes,
    error: vehicleTypesError,
  } = useOrderVehicleTypes();

  /**
   * The vehicle types this cargo may legally travel in, cheapest first.
   *
   * Cheapest-first is what makes `[0]` the best fit — the same heuristic the
   * landing page's quote calculator already uses to pick a vehicle on the
   * visitor's behalf. This is the *cargo*-eligible set; `eligibleVehicleTypes`
   * below narrows it further by the weight step. Empty until a cargo category
   * is chosen.
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
   * The weight dropdown's options: every payload capacity actually present
   * among the cargo-eligible vehicles this client may be offered, smallest
   * first — so each option reads as "up to what this vehicle can carry".
   *
   * Body-agnostic except for the account-type restriction: an INDIVIDUAL
   * client on DRY_BOX is not offered the freight classes in
   * `INDIVIDUAL_DRY_BOX_EXCLUDED_VEHICLE_CODES`, so a bracket only those
   * classes reach is not offered either.
   */
  const weightOptions = useMemo(() => {
    const capacities = cargoEligibleVehicleTypes
      .filter((vehicleType) =>
        vehicleOfferedToClient(vehicleType, bodyType, accountType),
      )
      .map((vehicleType) => vehicleType.maxPayloadKg);
    return [...new Set(capacities)].sort((a, b) => a - b);
  }, [cargoEligibleVehicleTypes, bodyType, accountType]);

  /**
   * Drop a chosen bracket that a goods or load-space change has taken off the
   * list, rather than silently swapping in a different weight the client never
   * picked. The weight step then reads as unanswered again. Skipped while the
   * vehicle types are still loading, when the list is empty for no reason the
   * client caused.
   */
  useEffect(() => {
    if (loadingVehicleTypes) {
      return;
    }

    if (maxWeightKg !== null && !weightOptions.includes(maxWeightKg)) {
      setMaxWeightKg(null);
    }
  }, [weightOptions, maxWeightKg, loadingVehicleTypes]);

  /**
   * The three load-space cards, each carrying how many vehicles would be left
   * to choose from if it were picked.
   *
   * Counted against the cargo-eligible set, not the fully filtered one: a card
   * has to say what picking it *would* give you, so the body currently selected
   * must not be allowed to shrink the other two cards' figures. The weight step
   * is left out of the count for the same reason: a body change can drop the
   * chosen bracket, so a figure narrowed by it could describe a weight about to
   * be discarded. The account-type restriction is applied per card, since it
   * depends on the body.
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
   * Cargo-eligible vehicles that also offer the chosen load space, may be
   * offered to this client, and can carry the chosen weight — the filters of
   * the vehicle step, applied together. Empty until a weight is chosen: the
   * list is a recommendation for *this* load, and without a weight there is
   * nothing to recommend against. The body predicate is the taxonomy's own
   * (`vehicleOffersBody`); this file holds no vehicle-to-body table.
   */
  const eligibleVehicleTypes = useMemo(() => {
    if (maxWeightKg === null) {
      return [];
    }

    return cargoEligibleVehicleTypes.filter(
      (vehicleType) =>
        vehicleOffersBody(vehicleType, bodyType) &&
        vehicleOfferedToClient(vehicleType, bodyType, accountType) &&
        vehicleType.maxPayloadKg >= maxWeightKg,
    );
  }, [cargoEligibleVehicleTypes, bodyType, maxWeightKg, accountType]);

  /**
   * The eligible classes a carrier on this platform actually operates.
   *
   * Some seeded classes have nobody running them, and an order booked against
   * one is created, priced, charged for — and then invisible to every driver on
   * the load board forever.
   *
   * A *derived* list and pointedly not a narrower `eligibleVehicleTypes`: the
   * grid keeps rendering the full eligible set and disables the unserviceable
   * cards in place, for the reasons set out on the grid itself — a class
   * removed from that list takes the client's selection with it and reprices
   * the booking under their cursor. What this list is for is the two places
   * that put a class on the client's *behalf*, the `Best` pill and the
   * auto-select effect, neither of which is a click anyone made.
   *
   * Order is inherited, so `[0]` is still the cheapest.
   */
  const bookableVehicleTypes = useMemo(
    () => eligibleVehicleTypes.filter((vehicleType) => vehicleType.serviceable),
    [eligibleVehicleTypes],
  );

  /**
   * The `Best` pill: the cheapest class this booking could actually be *placed*
   * against, not merely the cheapest one on offer.
   *
   * This is the rule the auto-select effect below picks by. Leaving the pill on the cheapest *eligible* class would put `Best`
   * on one card while the form quietly selected another — the form
   * contradicting its own recommendation, which is worse than no pill at all.
   * When nothing is bookable no card wears it, which is correct: nothing here
   * is best when nothing here can be had.
   */
  const bestFitVehicleType = bookableVehicleTypes[0] ?? null;

  const selectedVehicleType =
    eligibleVehicleTypes.find(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    ) ?? null;

  /**
   * Keep the picker on a vehicle the current cargo is actually allowed in.
   *
   * Runs on mount (once the taxonomy lands) and whenever the cargo category
   * changes. A selection that is no longer eligible is replaced by the best fit
   * rather than cleared: an empty picker would just be a dead end the user has
   * to resolve, and the cheapest eligible type is the one they would be offered
   * anyway. Setting the code makes the selection valid, so this settles after
   * one extra render rather than looping.
   *
   * It picks from `bookableVehicleTypes`, never from the full eligible list.
   * Auto-selecting a class no carrier runs would be the worst kind of default —
   * chosen by the form, not the client, on a step they may never scroll back
   * to, and unbookable from the moment it lands. Only the *source* narrows: the
   * grid still renders every eligible class, so nothing disappears from view.
   *
   * Membership is tested against the bookable list too, so a selection that is
   * merely unserviceable is replaced on the same terms as one that has become
   * ineligible. Nothing can put an unserviceable code in this state today — the
   * cards are `disabled`, this effect skips them, and the initial value is `""`
   * — so that arm is a guard rather than a path, and it is written this way so
   * the invariant survives whatever sets the code next.
   *
   * When nothing at all is bookable the effect returns and leaves the selection
   * where it is, rather than clearing it: clearing would trade a selection the
   * client can see explained on its own card for an empty picker explaining
   * nothing. That state is refused on submit and named by the alert above the
   * grid — see both before changing this.
   */
  useEffect(() => {
    const bestFit = bookableVehicleTypes[0];
    if (!bestFit) {
      return;
    }

    const stillSelectable = bookableVehicleTypes.some(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    );

    if (!stillSelectable) {
      setVehicleTypeCode(bestFit.code);
    }
  }, [bookableVehicleTypes, vehicleTypeCode]);

  /**
   * Pick a load space, and let the vehicle re-settle on the best fit for it.
   *
   * The weight is kept: it is the client's own answer, and the weight effect
   * above drops it only if the new body leaves that bracket unreachable.
   * Clearing the vehicle lets the auto-select effect pick the cheapest bookable
   * class for the new body rather than holding on to one chosen for the old.
   */
  function handleBodyTypeChange(body: ChassisType) {
    setBodyType(body);
    setVehicleTypeCode("");
  }

  // The in-flight estimate request, if any — kept in a ref (not state) since
  // it's only ever read from event handlers and cleanup, never rendered.
  const estimateAbortRef = useRef<AbortController | null>(null);

  /**
   * A quote is only ever valid for the exact inputs it was computed from.
   * Rather than let a stale price sit under a since-changed route, goods,
   * load space, vehicle or crew size, any change to one of them invalidates it —
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
    setEstimating(false);
  }, [
    pickupAddress,
    dropoffAddress,
    pickupLocation,
    dropoffLocation,
    vehicleTypeCode,
    // The resolved vehicle as well as the raw code: a weight or goods change
    // can leave the code in place while the vehicle it names drops out.
    selectedVehicleType,
    cargoCategory,
    // Listed even though a body change always clears the vehicle code above
    // it: the quote must be invalidated by the input the user actually
    // changed, not as a side effect of how that change happens to cascade.
    bodyType,
    helperCount,
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
   * Is the class this booking is pointed at one a carrier actually operates?
   * True when nothing is selected: a missing vehicle is reported as the
   * vehicle step being required, not as this.
   */
  const selectedVehicleIsServiceable =
    selectedVehicleType === null || selectedVehicleType.serviceable;

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
    cargo: cargoCategory !== null,
    weight: maxWeightKg !== null,
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

    try {
      const response = await fetch("/api/pricing/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupAddress,
          dropoffAddress,
          vehicleTypeCode: pricedVehicleTypeCode,
          cargoCategory,
          helperCount,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as Estimate | { error?: string };

      // Superseded by an input change (and so already invalidated above) or
      // by a newer calculation — either way, this result has nothing to add.
      if (controller.signal.aborted) {
        return null;
      }

      if (!response.ok) {
        setEstimateError(
          "error" in payload && payload.error
            ? payload.error
            : t("couldNotPriceThisLoad"),
        );
        return null;
      }

      const quoted = payload as Estimate;
      setEstimate(quoted);
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
    helperCount,
  ]);

  /** Bring a step into view, centred, as the place to act next. */
  function scrollToSection(section: RequiredSection) {
    document
      .getElementById(sectionId(section))
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  /**
   * Upload the step-6 photos to the order just created, one request each and
   * one after another. Never throws: photos are optional, and a failed upload
   * must not strand a booking that already exists.
   *
   * Resolves with how many uploads failed.
   */
  async function uploadCargoPhotos(orderId: string): Promise<number> {
    const photos = await cargoPhotos.settledPhotos();
    let failed = 0;

    for (const [index, photo] of photos.entries()) {
      const body = new FormData();
      body.append("file", photo.blob, `cargo-photo-${index + 1}.jpg`);

      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}/photos`,
          { method: "POST", body },
        );
        if (!response.ok) {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

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
    if (submitting) {
      return;
    }

    setError(null);
    setSubmitAttempted(true);

    const firstMissing = missingSections[0];
    if (firstMissing !== undefined || !scheduledDateTime || !cargoCategory) {
      // The `scheduledDateTime`/`cargoCategory` tests only narrow the types:
      // both are covered by `missingSections`.
      if (firstMissing !== undefined) {
        scrollToSection(firstMissing);
      }
      return;
    }

    // Not a required-field miss but a class nobody can fulfil. The auto-select
    // effect never picks one, so this is a guard rather than a path — and it
    // says so out loud instead of failing at the endpoint.
    if (!selectedVehicleIsServiceable) {
      setError(t("selectedVehicleNotServiceable"));
      scrollToSection("vehicle");
      return;
    }

    setSubmitting(true);

    // Book was pressed before the automatic estimate landed (or after it
    // failed): price now rather than asking for a second click. The order
    // endpoint re-prices on its own, so this is about the client having seen
    // a figure the checkout page will confirm, not about trusting this one.
    if (estimate === null) {
      setSubmitPhase("pricing");
      const quoted = await handleCalculate();
      if (quoted === null) {
        // `estimateError` already says why, in the price panel.
        setSubmitting(false);
        return;
      }
    }

    setSubmitPhase("booking");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
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
          cargoCategory,
          vehicleTypeCode: pricedVehicleTypeCode,
          // Recorded on the order, not priced from: `/api/orders` re-checks it
          // against the chosen vehicle's own `bodyTypes` and stores it so the
          // driver knows which body the load was booked for.
          bodyType,
          helperCount,
          // The tier, never its price: `/api/orders` re-derives the adjustment
          // from the quote it computes itself.
          serviceLevel,
          // No payment fields: they are checkout's to send.
          description: description.trim() || undefined,
          // No cargo measurements, packaging, handling tags, pickup window or
          // delivery deadline: the form no longer asks for them, and the
          // endpoint treats every one as optional.
        }),
      });

      const payload = (await response.json()) as
        CreatedOrder | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : t("orderFailed");
        setError(message);
        // Cleared here rather than in a `finally`, so that the successful path
        // below keeps the button disabled for the whole of the navigation.
        setSubmitting(false);
        return;
      }

      const order = payload as CreatedOrder;

      // The order exists from here on, so nothing below may send the client
      // back to this form: a failed photo upload is logged and the booking
      // proceeds to checkout regardless. The project has no toast surface
      // that would survive the navigation, so the failure is not shown here.
      setSubmitPhase("uploading");
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

    event.preventDefault();

    if (estimate === null && canCalculate) {
      void handleCalculate();
    }
  }

  /**
   * Whether the quoted total came out above the sum of the fare components,
   * which only happens when the vehicle type's minimum fare floored it. The
   * breakdown no longer prints those components — `transportationCost` is
   * derived from the total, so the lines always add up — but the floor is
   * still worth naming: it is why a two-block hop costs what a longer one
   * does. The half-cent margin keeps floating-point dust from reading as a
   * floor.
   *
   * Always the quoted fare, never the tier-adjusted total: the floor is a
   * property of the quote, and a Pooling discount is applied after it (see
   * `serviceLevelAdjustment`). Testing the adjusted figure would hide the note
   * on a discounted job that was floored, and invent it on a Priority one that
   * was not.
   */
  function minimumFareApplied(quote: Quote): boolean {
    return (
      quote.price - CURRENCY_EPSILON >
      quote.baseFare + quote.distanceFare + quote.timeFare + quote.helperFee
    );
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
              {t("newDelivery")}
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              {t("bookADelivery")}
            </h1>
          </div>
          <Link
            href="/orders"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
          >
            {tShared("myOrders")}
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
                          orange accent, scoped to just this popover rather
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

            <StepCard
              step={3}
              id={sectionId("cargo")}
              title={t("whatAreYouMoving")}
              description={t("pickTheClosestMatchItDecides")}
              invalid={sectionInvalid("cargo")}
              invalidMessage={t("required")}
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CARGO_OPTIONS.map((option) => {
                  const { category, Icon } = option;
                  const selected = category === cargoCategory;

                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setCargoCategory(category)}
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
                        {cargoCategoryLabel(category)}
                      </span>
                      <span className="text-xs leading-snug text-muted">
                        {tCargo(option.descriptionKey)}
                      </span>
                      {selected ? <SelectedTick /> : null}
                    </button>
                  );
                })}
              </div>
            </StepCard>

            <StepCard
              step={4}
              id={sectionId("weight")}
              title={t("totalWeight")}
              description={t("roughlyHowMuchIsBeingMoved")}
              invalid={sectionInvalid("weight")}
              invalidMessage={t("required")}
            >
              {cargoCategory === null ? (
                <p className={STEP_HINT_CLASSES}>
                  {t("pickWhatYoureMovingFirst")}
                </p>
              ) : vehicleTypesError ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  {vehicleTypesError}
                </p>
              ) : loadingVehicleTypes ? (
                <p aria-busy="true" className={STEP_HINT_CLASSES}>
                  {tShared("loadingVehicleTypes")}
                </p>
              ) : weightOptions.length === 0 ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  {t("noVehicleIsCurrentlyAvailableFor")}
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                  <Label
                    htmlFor={weightSelectId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    {t("totalWeight")}
                  </Label>
                  <select
                    id={weightSelectId}
                    value={maxWeightKg ?? ""}
                    onChange={(event) =>
                      setMaxWeightKg(
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                    className={NATIVE_FIELD_CLASSES}
                  >
                    <option value="" disabled>
                      {t("selectAWeight")}
                    </option>
                    {weightOptions.map((capacity) => (
                      <option key={capacity} value={capacity}>
                        {t("upToWeight", {
                          weight: formatVehiclePayload(capacity),
                        })}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </StepCard>

            <StepCard
              step={5}
              title={t("recommendedVehicle")}
              description={t("onlyVehiclesClearedForYourGoods")}
              id={sectionId("vehicle")}
              invalid={sectionInvalid("vehicle")}
              invalidMessage={t("required")}
            >
              {vehicleTypesError ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  {vehicleTypesError}
                </p>
              ) : loadingVehicleTypes ? (
                <p aria-busy="true" className={STEP_HINT_CLASSES}>
                  {tShared("loadingVehicleTypes")}
                </p>
              ) : (
                <>
                  {/* Native radios again, one per load space, each visually
                      replaced by the card wrapping it — the same trade the
                      crew-size picker in step 7 makes, and for the same
                      reasons: arrow-key navigation of the group and the "2 of
                      3" announcement, both free. (The goods and vehicle grids
                      above and below are older `aria-pressed` buttons; they
                      are left alone.) */}
                  <fieldset className="mb-[18px]">
                    <legend className="mb-2.5 text-[0.8125rem] font-medium text-paper">
                      {t("whatKindOfLoadSpaceDo")}
                    </legend>

                    <div className="grid grid-cols-3 gap-2.5">
                      {bodyTypeCards.map((option) => {
                        const selected = option.body === bodyType;
                        // Only meaningful once there are goods to count
                        // vehicles for.
                        const countLabel =
                          cargoCategory === null
                            ? null
                            : vehicleCountLabel(option.vehicleCount, t);

                        return (
                          <label
                            key={option.body}
                            className={`${BODY_OPTION_CLASSES} ${
                              selected
                                ? PICK_CARD_SELECTED_CLASSES
                                : PICK_CARD_IDLE_CLASSES
                            }`}
                          >
                            <input
                              type="radio"
                              name={bodyTypeName}
                              value={option.body}
                              checked={selected}
                              onChange={() => handleBodyTypeChange(option.body)}
                              // The card's own text is hidden from assistive
                              // tech (below) and spoken from here instead, so
                              // the three lines arrive as one name in one
                              // reading order rather than as loose text beside
                              // an unnamed radio.
                              aria-label={
                                countLabel === null
                                  ? `${t(option.titleKey)} — ${t(option.descriptionKey)}`
                                  : `${t(option.titleKey)} — ${t(option.descriptionKey)} · ${countLabel}`
                              }
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
                            {countLabel === null ? null : (
                              <span
                                aria-hidden="true"
                                className="font-price text-[0.6875rem] text-muted tabular-nums"
                              >
                                {countLabel}
                              </span>
                            )}
                            {selected ? <SelectedTick /> : null}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {cargoCategory === null || maxWeightKg === null ? (
                    <p className={STEP_HINT_CLASSES}>
                      {t("chooseGoodsAndWeightForVehicles")}
                    </p>
                  ) : cargoEligibleVehicleTypes.length === 0 ? (
                    <p role="alert" className="text-[0.8125rem] text-accent">
                      {t("noVehicleIsCurrentlyAvailableFor")}
                    </p>
                  ) : eligibleVehicleTypes.length === 0 ? (
                    // Goods and weight are both chosen, yet nothing on offer
                    // serves this load space at that weight.
                    <p
                      role="alert"
                      className="rounded-lg border border-accent/30 bg-accent/[0.08] px-3.5 py-3 text-[0.8125rem] leading-snug text-accent"
                    >
                      {t("noVehicleMatchesThisBodyType")}
                    </p>
                  ) : (
                    /* A class no carrier operates stays in the grid, disabled
                       in place with the reason on the card, rather than being
                       filtered out: removing it would fire the auto-select
                       effect and move the client's selection — and the price —
                       under their cursor. Only `bookableVehicleTypes` (the
                       `Best` pill and the auto-select source) leaves it out. */
                    <>
                      {/* About the grid as a whole: every card is disabled and
                          the client's next move is a different filter, which no
                          single card can say. */}
                      {bookableVehicleTypes.length === 0 ? (
                        <p
                          role="alert"
                          className="mb-2.5 rounded-lg border border-accent/30 bg-accent/[0.08] px-3.5 py-3 text-[0.8125rem] leading-snug text-accent"
                        >
                          {t(NO_SERVICEABLE_VEHICLES_MESSAGE_KEY)}
                        </p>
                      ) : null}

                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        {eligibleVehicleTypes.map((vehicleType) => {
                          const selected = vehicleType.code === vehicleTypeCode;
                          const isBestFit =
                            bestFitVehicleType?.code === vehicleType.code;
                          const Glyph =
                            VEHICLE_CATEGORY_GLYPHS[vehicleType.category];

                          const cardReason = vehicleType.serviceable
                            ? null
                            : t(NO_CARRIERS_CARD_REASON_KEY);

                          return (
                            <button
                              key={vehicleType.code}
                              type="button"
                              aria-pressed={selected}
                              // Really disabled: nothing here for a click to
                              // achieve. The reason is rendered as text inside
                              // the button so it is announced with it.
                              disabled={cardReason !== null}
                              onClick={() =>
                                setVehicleTypeCode(vehicleType.code)
                              }
                              // A selected card that is unavailable keeps the
                              // selected fill: it is still the class this
                              // booking points at, and the badge says why it
                              // cannot stay that way.
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
                                {/* Teal, never orange: "cheapest option" is a
                              different signal from "what you picked". The
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

                              {/* No `role`: static content of a button that
                                is already announced as disabled. */}
                              {cardReason !== null ? (
                                <span
                                  className={
                                    PICK_CARD_UNAVAILABLE_REASON_CLASSES
                                  }
                                >
                                  {cardReason}
                                </span>
                              ) : null}

                              {selected ? <SelectedTick /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </StepCard>

            {/* Optional. Held in memory until the order exists, then uploaded
                to it in `handleSubmit` — see `uploadCargoPhotos`. */}
            <StepCard
              step={6}
              title={t("cargoPhotos")}
              description={t("cargoPhotosDescription", {
                max: MAX_CARGO_PHOTOS,
              })}
            >
              <CargoPhotosField state={cargoPhotos} disabled={submitting} />
            </StepCard>

            <StepCard step={7} title={t("additionalDetails")}>
              <div className="flex flex-col gap-4">
                {/* Native radios, one per crew size, each visually replaced by
                    the cell wrapping it. Keeping the real inputs — `sr-only`
                    rather than removed — is what gives the group its arrow-key
                    handling and its "3 of 4" announcement for free, the same
                    trade the driver hub's radio rows make. */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[0.8125rem] font-medium text-paper">
                    {t("peopleForLoadingUnloading")}
                  </legend>

                  <div className="grid grid-cols-4 gap-2 sm:max-w-[17rem]">
                    {CREW_SIZE_OPTIONS.map((size) => {
                      const selected = size === crewSize;

                      return (
                        <label
                          key={size}
                          className={`${CREW_OPTION_CLASSES} ${
                            selected
                              ? `${PICK_CARD_SELECTED_CLASSES} text-accent`
                              : `${PICK_CARD_IDLE_CLASSES} text-paper`
                          }`}
                        >
                          <input
                            type="radio"
                            name={crewSizeName}
                            value={size}
                            checked={selected}
                            onChange={() => setCrewSize(size)}
                            aria-label={crewSizeDescription(size, t)}
                            className="sr-only"
                          />
                          <span aria-hidden="true">{size}</span>
                        </label>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-snug text-muted">
                    {t("1IsTheDriverOnTheir")}
                  </p>
                </fieldset>

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
                  the same reasons as the load-space and crew-size pickers:
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

              {estimate ? (
                <>
                  <dl className="mt-3 flex flex-col gap-1.5">
                    <BreakdownRow
                      label={tShared("distance")}
                      value={formatDistanceKm(estimate.distanceKm)}
                    />
                    <BreakdownRow
                      label={tShared("transportationCost")}
                      value={formatGel(transportationCost(estimate))}
                    />
                    {/* Only worth a line when at least one was actually
                        requested. */}
                    {estimate.helperFee > 0 ? (
                      <BreakdownRow
                        label={tShared("helperFee")}
                        value={formatGel(estimate.helperFee)}
                      />
                    ) : null}
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

                  {minimumFareApplied(estimate) ? (
                    <p className="mt-2.5 text-xs text-accent">
                      {t("minimumFareAppliedForThisVehicle")}
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

              {estimateError ? (
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
                disabled={submitting}
                aria-busy={submitting}
                className="h-12 gap-2 rounded-full bg-accent px-6 text-[0.9375rem] font-semibold text-ink transition-transform hover:bg-accent hover:-translate-y-0.5 disabled:translate-y-0"
              >
                {submitting
                  ? submitPhase === "pricing"
                    ? t("calculating")
                    : submitPhase === "uploading"
                      ? t("uploadingPhotos")
                      : t("booking")
                  : t("bookDelivery")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
