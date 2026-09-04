"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays } from "lucide-react";
import type { CargoCategory, ChassisType, ServiceLevel } from "@prisma/client";

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
import { CARGO_OPTIONS } from "@/components/home/order-cargo-options";
import {
  formatVehicleDimensions,
  formatVehiclePayload,
  useOrderVehicleTypes,
  vehicleOffersBody,
  type OrderVehicleType,
} from "@/components/home/order-vehicle-types";
import { RoutePreviewMap } from "@/components/home/route-preview-map";
import {
  StopContactDialog,
  type StopContact,
} from "@/components/home/stop-contact-dialog";
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
 * The first cargo category the taxonomy declares, used as the initial
 * selection so the vehicle step always has something to filter against.
 *
 * The `??` is not dead code to TypeScript: `noUncheckedIndexedAccess` types an
 * indexed read as possibly `undefined`, and there is no type-level guarantee
 * that `CARGO_OPTIONS` is non-empty. The fallback names the category the form
 * defaulted to before this rewrite, so an (impossible) empty taxonomy degrades
 * to the previous behavior rather than to a crash.
 */
const DEFAULT_CARGO_CATEGORY: CargoCategory =
  CARGO_OPTIONS[0]?.category ?? "FURNITURE_FURNISHINGS";

/**
 * Tolerance, in currency units, for comparing a total against the sum of its
 * parts: half a cent absorbs floating-point drift without ever masking a real
 * difference, which is at least one whole cent.
 */
const CURRENCY_EPSILON = 0.005;

/** Placeholder for a figure that isn't known yet. */
const EMPTY_STAT = "—";

const QUOTE_FAILED_MESSAGE = "Could not price this load. Please try again.";

const ORDER_FAILED_MESSAGE = "Could not create the order. Please try again.";

const NETWORK_ERROR_MESSAGE =
  "Network error. Please check your connection and try again.";

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
  title: string;
  description: string;
}[] = [
  {
    body: "DRY_BOX",
    title: "Dry box",
    description: "Enclosed and weather-proof",
  },
  {
    body: "REFRIGERATED",
    title: "Refrigerated",
    description: "Temperature-controlled load space",
  },
  {
    body: "OPEN_CHASSIS",
    title: "Open chassis",
    description: "Flatbed, loadable from any side",
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
  title: string;
  description: string;
  /**
   * The decorative mark in the card's top corner, or `null` for the tier that
   * carries none. Rendered `aria-hidden`: the title is what says which tier
   * this is, and a lightning bolt read aloud would only get in the way of it.
   * Palette utilities rather than landing tokens, as the codebase already does
   * for the "Best" badge — the landing set holds no semantic colour.
   */
  badge: { glyph: string; className: string } | null;
}[] = [
  {
    level: "PRIORITY",
    title: "Priority",
    description: "Flagged to dispatch as time-critical.",
    badge: { glyph: "⚡", className: "text-amber-500" },
  },
  {
    level: "REGULAR",
    title: "Regular",
    description: "Standard collection and delivery window.",
    badge: null,
  },
  {
    level: "POOLING",
    title: "Pooling",
    description: "You accept a wider collection and delivery window.",
    badge: { glyph: "%", className: "text-teal-600" },
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
 * Why a step is not answerable yet — one line per gate, each naming the thing to
 * go and do rather than the thing that is missing.
 *
 * Each is worded for the state its card is actually in, which is not always the
 * step directly above: the goods and weight cards share `ENTER_ADDRESSES_FIRST`
 * because they share a gate (`weightStepEnabled` *is* `goodsStepEnabled`), so
 * naming the goods step on the weight card would point a client at a step that
 * is itself still shut. A disabled step that merely stopped responding would
 * leave a client with nothing to act on, so the reason is rendered in the card
 * and referenced by its `aria-describedby` (see `StepCard`).
 */
const CHOOSE_DATE_FIRST = "Choose a date and time first.";
const ENTER_ADDRESSES_FIRST = "Enter both addresses first.";
/**
 * The vehicle step's line, and the one gate with no action behind it: the weight
 * effect settles on a capacity the moment any exists, so this card is shut only
 * while the weight step is shut too or while there is no capacity to settle on
 * at all (the vehicle types are still loading, their fetch failed, or the chosen
 * goods clear no vehicle). "Choose a total weight first" would name a choice
 * that is not on offer in any of them.
 */
const WEIGHT_UNAVAILABLE = "Available once a total weight can be chosen above.";
const CHOOSE_VEHICLE_FIRST = "Choose a vehicle first.";

/** Shared geometry for a native `<select>`/date-trigger styled to match the
 *  rest of this form's fields — the same treatment `account-profile-form.tsx`
 *  uses for its own native Gender `<select>`, and for the same reason: a
 *  small fixed option set isn't worth the shadcn `Select`'s portal, which
 *  renders outside this page's palette. */
const NATIVE_FIELD_CLASSES =
  "h-10 w-full rounded-lg border border-line bg-ink px-2.5 text-left text-sm text-paper transition-colors outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/** "Sat, Aug 22" — compact enough for the date trigger button. */
const scheduledDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

/** Selectable pickup times, half-hour apart across a normal working day. */
const TIME_SLOT_START_HOUR = 8;
const TIME_SLOT_END_HOUR = 20;
const TIME_SLOT_STEP_MINUTES = 30;

type TimeSlot = { value: string; label: string };

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

    const period = hour24 < 12 ? "AM" : "PM";
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

    slots.push({
      value: `${String(hour24).padStart(2, "0")}:${paddedMinute}`,
      label: `${hour12}:${paddedMinute} ${period}`,
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
function crewSizeDescription(size: CrewSize): string {
  if (size === 1) {
    return "1 person — the driver alone";
  }

  const helpers = size - 1;
  return `${size} people — the driver and ${helpers} helper${helpers === 1 ? "" : "s"}`;
}

/**
 * How many vehicles a load space would leave the client to choose from.
 * Pluralised rather than printed as a bare "1 vehicles", the same reflex as
 * `crewSizeDescription` above.
 */
function vehicleCountLabel(count: number): string {
  return `${count} vehicle${count === 1 ? "" : "s"}`;
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
 * route preview on the right. Priced on demand — the user presses Calculate to
 * quote against `/api/pricing/estimate`, and any further edit to the route,
 * goods, load space, vehicle or crew size invalidates that quote until it's
 * recalculated — then booked through `POST /api/orders`.
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

  // Null until both a day and a time slot are chosen — see `scheduledDateTime`,
  // the combined value everything downstream (submission, validation) reads.
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledTime, setScheduledTime] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Null until the taxonomy hands back at least one eligible vehicle to size
  // this against — see `weightOptions`.
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

  const [cargoCategory, setCargoCategory] = useState<CargoCategory>(
    DEFAULT_CARGO_CATEGORY,
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
  const [error, setError] = useState<string | null>(null);

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
   * below narrows it further by the weight step.
   */
  const cargoEligibleVehicleTypes = useMemo(() => {
    const allowed = CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES[cargoCategory];

    return vehicleTypes
      .filter((vehicleType) => allowed.includes(vehicleType.category))
      .sort((a, b) => a.pricingRule.baseFare - b.pricingRule.baseFare);
  }, [vehicleTypes, cargoCategory]);

  /**
   * The weight dropdown's options: every payload capacity actually present
   * among the cargo-eligible vehicles, smallest first — so each option reads
   * as "up to what this vehicle can carry" and every option is guaranteed to
   * leave at least one vehicle standing once picked.
   */
  const weightOptions = useMemo(() => {
    const capacities = cargoEligibleVehicleTypes.map(
      (vehicleType) => vehicleType.maxPayloadKg,
    );
    return [...new Set(capacities)].sort((a, b) => a - b);
  }, [cargoEligibleVehicleTypes]);

  /**
   * Default (and re-default, on a goods change) to the smallest capacity —
   * the least restrictive option, so an untouched weight step never hides a
   * vehicle the goods step alone would have shown. Mirrors the vehicle
   * auto-select effect below: replace a selection that's no longer one of the
   * current options rather than clear it to empty.
   */
  useEffect(() => {
    const smallest = weightOptions[0];
    if (smallest === undefined) {
      return;
    }

    if (maxWeightKg === null || !weightOptions.includes(maxWeightKg)) {
      setMaxWeightKg(smallest);
    }
  }, [weightOptions, maxWeightKg]);

  /**
   * The three load-space cards, each carrying how many vehicles would be left
   * to choose from if it were picked.
   *
   * Counted against the cargo-eligible set, not the fully filtered one: a card
   * has to say what picking it *would* give you, so the body currently selected
   * must not be allowed to shrink the other two cards' figures. The weight step
   * is left out of the count for the same reason it is left out of the cards
   * themselves — it re-defaults on a body change (see `handleBodyTypeChange`),
   * so a figure narrowed by it would be describing a weight about to be
   * discarded.
   */
  const bodyTypeCards = useMemo(
    () =>
      BODY_TYPE_OPTIONS.map((option) => ({
        ...option,
        vehicleCount: cargoEligibleVehicleTypes.filter((vehicleType) =>
          vehicleOffersBody(vehicleType, option.body),
        ).length,
      })),
    [cargoEligibleVehicleTypes],
  );

  /**
   * Cargo-eligible vehicles that also offer the chosen load space and can carry
   * the declared weight — the three filters of the vehicle step, applied
   * together. The body predicate is the taxonomy's own (`vehicleOffersBody`);
   * this file holds no vehicle-to-body table.
   */
  const eligibleVehicleTypes = useMemo(() => {
    return cargoEligibleVehicleTypes.filter(
      (vehicleType) =>
        vehicleOffersBody(vehicleType, bodyType) &&
        (maxWeightKg === null || vehicleType.maxPayloadKg >= maxWeightKg),
    );
  }, [cargoEligibleVehicleTypes, bodyType, maxWeightKg]);

  const bestFitVehicleType = eligibleVehicleTypes[0] ?? null;

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
   */
  useEffect(() => {
    const bestFit = eligibleVehicleTypes[0];
    if (!bestFit) {
      return;
    }

    const stillEligible = eligibleVehicleTypes.some(
      (vehicleType) => vehicleType.code === vehicleTypeCode,
    );

    if (!stillEligible) {
      setVehicleTypeCode(bestFit.code);
    }
  }, [eligibleVehicleTypes, vehicleTypeCode]);

  /**
   * Pick a load space, and clear the two steps that hang off it.
   *
   * A goods change performs this same reset without being asked to: it rebuilds
   * `weightOptions`, which re-defaults the weight, and shrinks the eligible
   * list, which re-picks the vehicle. A body change reaches neither — the
   * weight options are deliberately cargo-derived (see `weightOptions`), so
   * they do not move — hence doing it here by hand. Clearing rather than
   * choosing: both effects then settle on their first-render defaults, the
   * smallest capacity and the cheapest eligible vehicle.
   */
  function handleBodyTypeChange(body: ChassisType) {
    setBodyType(body);
    setMaxWeightKg(null);
    setVehicleTypeCode("");
  }

  // The in-flight estimate request, if any — kept in a ref (not state) since
  // it's only ever read from event handlers and cleanup, never rendered.
  const estimateAbortRef = useRef<AbortController | null>(null);

  /**
   * A quote is only ever valid for the exact inputs it was computed from.
   * Rather than let a stale price sit under a since-changed route, goods,
   * load space, vehicle or crew size, any change to one of them invalidates it —
   * dropping any in-flight request too — so "Book delivery" disappears and
   * "Recalculate" is the only way back to a price.
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
   * Progressive gating: a step opens only once every step above it is answered.
   *
   * Each flag is built on the one before it rather than testing its own input
   * alone, so a step can never light up over a gap in the chain — the vehicle
   * card is not answerable just because a weight defaulted, if no address has
   * been typed yet.
   *
   * Every flag reads the state the rest of the form already reads. There is no
   * separate record of which steps have been "completed", deliberately: a second
   * copy of that would be free to disagree with the values the order is actually
   * built from. It follows that a step whose input carries a default (the goods
   * category, the weight, the vehicle — all three settle themselves) opens as
   * soon as the chain reaches it, because by then it genuinely is answered.
   *
   * This is presentation and nothing else. `canCalculate` and `canSubmit` below
   * are untouched: what a quote and a booking actually require already lives
   * there, and restating any of it here would be two predicates free to drift
   * apart.
   */
  const routeStepEnabled = scheduledDateTime !== null;

  /**
   * Both addresses *typed*, not both resolved to coordinates.
   *
   * The same call `canCalculate` makes just below, for the same reason:
   * `pickupLocation`/`dropoffLocation` only populate when a suggestion is picked
   * from the browser-side Places autocomplete, and pricing does not need them —
   * `/api/pricing/estimate` geocodes the address text itself, server-side,
   * through a different provider. Gating on the resolved points would strand
   * every step below this one for a client who typed a full address without
   * taking a suggestion, and strand them permanently on a deployment where the
   * Places key is not configured.
   */
  const goodsStepEnabled =
    routeStepEnabled &&
    pickupAddress.trim().length > 0 &&
    dropoffAddress.trim().length > 0;

  // No condition of its own: the goods grid opens on `DEFAULT_CARGO_CATEGORY`
  // and there is no way to deselect a category, so a cargo category is chosen
  // from the first render onwards and this step follows the one above it
  // directly.
  const weightStepEnabled = goodsStepEnabled;

  /**
   * A weight is answered the moment there is one to answer with: the weight
   * effect selects the smallest capacity as soon as the options exist, and
   * re-selects it whenever a goods or load-space change clears the old one.
   *
   * Reading `maxWeightKg` directly would say the same thing in the steady state
   * and blink this step off in between — `handleBodyTypeChange` clears the
   * weight, and the effect that puts one back runs after the browser has
   * painted, so a client changing the load space would watch this very card grey
   * out under their cursor for a frame.
   */
  const vehicleStepEnabled = weightStepEnabled && weightOptions.length > 0;

  /**
   * Step 6 and the service-level card, which open together on the one
   * condition: a vehicle is settled. Neither is a successor to the other — they
   * are siblings describing the job the chosen vehicle will do — and neither
   * gates the booking, since both carry an answer from the moment they open.
   *
   * Still its own flag rather than folded into `vehicleStepEnabled`, because
   * the two conditions are genuinely different: the vehicle *step* opens once
   * there is a weight to filter by, and these two open only once that filtering
   * has left a vehicle standing.
   *
   * The eligible list rather than `selectedVehicleType`, for the same reason and
   * on the same guarantee as the weight above: the auto-select effect keeps a
   * vehicle picked whenever one is on offer, so an empty list is the only state
   * in which none is — and it is exactly the state where the vehicle card is
   * showing its "no vehicle matches" alert. `canSubmit` still reads the resolved
   * vehicle itself, which is the check that has to be exact.
   */
  const vehicleChosenStepsEnabled =
    vehicleStepEnabled && eligibleVehicleTypes.length > 0;

  // Deliberately keyed off the raw address *text*, not `pickupLocation`/
  // `dropoffLocation`: those only populate once a suggestion is picked from
  // the browser-side Google Places autocomplete, but `/api/pricing/estimate`
  // geocodes whatever address string it's given itself, server-side, through
  // a separate provider (LocationIQ) — it needs no client-side resolution at
  // all. Gating on the resolved location would leave Calculate permanently
  // disabled on any deployment where the Places key isn't configured, even
  // though pricing works fine. (Requiring resolved coordinates made sense for
  // the old *automatic* per-keystroke estimate, to avoid spending a request
  // per character typed — it doesn't apply to an explicit button click.)
  const canCalculate =
    !estimating &&
    pickupAddress.trim().length > 0 &&
    dropoffAddress.trim().length > 0 &&
    vehicleTypeCode !== "";

  /**
   * Quote the current inputs on demand. The `AbortController` guards against
   * the input changing (and so invalidating this very request, see above)
   * while it's in flight — the same pattern `address-autocomplete.tsx` uses
   * for its suggestion lookups.
   */
  async function handleCalculate() {
    if (!canCalculate) {
      return;
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
          vehicleTypeCode,
          cargoCategory,
          helperCount,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as Estimate | { error?: string };

      // Superseded by an input change (and so already invalidated above) or
      // by a newer calculation — either way, this result has nothing to add.
      if (controller.signal.aborted) {
        return;
      }

      if (!response.ok) {
        setEstimateError(
          "error" in payload && payload.error
            ? payload.error
            : QUOTE_FAILED_MESSAGE,
        );
        return;
      }

      setEstimate(payload as Estimate);
    } catch {
      if (!controller.signal.aborted) {
        setEstimateError(NETWORK_ERROR_MESSAGE);
      }
    } finally {
      if (!controller.signal.aborted) {
        setEstimating(false);
      }
    }
  }

  /**
   * Place the order, then hand the client off to its checkout page.
   *
   * Nothing about money is decided here. `POST /api/orders` writes an unpaid
   * order from the inputs above, and `/checkout/<id>` is where the method, the
   * card and — for a business — the purchase-order reference are collected,
   * against an order that by then exists and has a total. That is the whole
   * reason this form has no payment step: a choice made before the order was
   * created had nothing to be attached to, and had to be carried through the
   * submit to acquire one.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Guards the type, not the UX: "Book delivery" is disabled without a
    // scheduled time (see `canSubmit`), so this only ever fires if that
    // somehow raced — same defensive shape as the vehicle-type check the
    // landing page's calculator uses before its own submit.
    if (!scheduledDateTime) {
      setError("Please choose a delivery date and time.");
      return;
    }

    setSubmitting(true);

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
          vehicleTypeCode,
          // Recorded on the order, not priced from: `/api/orders` re-checks it
          // against the chosen vehicle's own `bodyTypes` and stores it so the
          // driver knows which body the load was booked for. The estimate
          // endpoint is deliberately not told — body type moves no price.
          bodyType,
          helperCount,
          // The tier, never its price: `/api/orders` re-derives the adjustment
          // from the quote it computes itself, so a figure sent from here would
          // be ignored at best and trusted at worst.
          serviceLevel,
          // No `paymentMethodType`, no `savedCardId` and no `purchaseOrderRef`:
          // all three are checkout's to send, and every one is optional on the
          // endpoint. An order created here is simply one nobody has said how
          // they will settle yet.
          description: description.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as
        CreatedOrder | { error?: string };

      if (!response.ok) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : ORDER_FAILED_MESSAGE;
        setError(message);
        // Cleared here rather than in a `finally`, so that the one path that
        // does not clear it — the successful one below — keeps the button
        // disabled and reading "Booking…" for the whole of the navigation.
        setSubmitting(false);
        return;
      }

      const order = payload as CreatedOrder;

      // The form is not reset in place, because it does not survive this call:
      // the client leaves for checkout and every input above is unmounted with
      // it. `submitting` is deliberately left set — `router.push` resolves long
      // before the new route paints, and clearing it here would flick "Book
      // delivery" back to enabled over an order that has already been placed,
      // which is an invitation to book the same job twice.
      router.push(`/checkout/${order.id}`);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setSubmitting(false);
    }
  }

  /**
   * Enter, pressed anywhere in the form other than the multi-line
   * description, does the same thing clicking the accent button in the bottom
   * bar would — Calculate, or Recalculate once a quote exists. Never Book: see
   * the closing comment.
   *
   * Without this, the browser's own implicit-submission behavior takes over:
   * a lone text `<input>` inside a `<form>` submits that form on Enter even
   * with no visible submit button on screen, because "Book delivery" is still
   * form-associated (via `form={formId}`) the moment it exists at all. Before
   * a quote exists it isn't rendered — so that implicit submit had nothing to
   * click, and Chrome fell back to just running constraint validation, which
   * surfaces as a confusing "Please fill in this field" bubble on whichever
   * required field is empty, for someone who never touched a submit button.
   * Explicitly handling Enter here — and always calling `preventDefault()` —
   * removes that native behavior entirely rather than trying to out-guess it.
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

    void handleCalculate();

    // Never the submit, at any quote state: placing a real order isn't a side
    // effect a stray Enter keypress should be able to trigger — that stays a
    // deliberate click on "Book delivery".
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
    selectedServiceLevelOption?.title,
    selectedVehicleType?.label,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  // Booking requires a calculated price for the exact inputs being booked —
  // the whole point of the Calculate step — plus a valid vehicle type and a
  // chosen delivery time, so the submit cannot race the fetch that supplies
  // the vehicle, or reach the server with nothing scheduled. The address
  // fields keep their own native `required` validation, which still runs
  // because the button is only disabled for reasons the user cannot fix by
  // filling the form in.
  const canSubmit =
    !submitting &&
    selectedVehicleType !== null &&
    estimate !== null &&
    scheduledDateTime !== null;

  return (
    <main className="min-h-screen bg-ink text-paper">
      <div className="mx-auto max-w-7xl px-5 pt-8 pb-28 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
              New delivery
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              Book a delivery
            </h1>
          </div>
          <Link
            href="/orders"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-paper transition-colors hover:text-accent"
          >
            My orders
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
          <form
            id={formId}
            onSubmit={handleSubmit}
            onKeyDown={handleFormKeyDown}
            className="flex flex-col gap-5"
          >
            <StepCard
              step={1}
              title="Delivery date & time"
              description="When should the driver come by?"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={dateTriggerId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Date
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
                            : "Select a date"}
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
                    Time
                  </Label>
                  <select
                    id={timeSelectId}
                    value={scheduledTime}
                    onChange={(event) => setScheduledTime(event.target.value)}
                    required
                    className={NATIVE_FIELD_CLASSES}
                  >
                    <option value="" disabled>
                      {scheduledDate ? "Select a time" : "Pick a date first"}
                    </option>
                    {availableTimeSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  {scheduledDate && availableTimeSlots.length === 0 ? (
                    <p className="text-xs text-muted">
                      No slots left today — pick a later date.
                    </p>
                  ) : null}
                </div>
              </div>
            </StepCard>

            {/* Disabling this card mutes its two address fields, not the pair
                of dialogs mounted below them: Radix portals a `DialogContent` to
                `document.body`, so it is nowhere inside the `pointer-events-none`
                content region and stays fully operable. The only route into
                either dialog is selecting a suggestion in a field that is itself
                inside that region, so a disabled step cannot open one; and the
                step cannot shut under one that is already open either, since
                everything that gates it — the date and the time — sits behind
                the modal's overlay for as long as it is up. The portal is what
                keeps the second half of that from mattering: even reached some
                other way, an open dialog stays saveable and cancellable rather
                than trapping the client. */}
            <StepCard
              step={2}
              title="Route"
              disabled={!routeStepEnabled}
              disabledReason={CHOOSE_DATE_FIRST}
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
                  label="Pickup address"
                  value={pickupAddress}
                  onChange={setPickupAddress}
                  onLocationChange={setPickupLocation}
                  // Selection, not resolution: `onLocationChange` also fires on
                  // every keystroke, and its one non-null call is behind a
                  // details lookup that is allowed to fail quietly — either
                  // would open this dialog at the wrong moment, or never.
                  onPlaceSelected={() => setContactModalFor("pickup")}
                  placeholder="e.g. Rustaveli Ave 12, Tbilisi"
                  required
                />

                <AddressAutocomplete
                  id="dropoff-address"
                  label="Dropoff address"
                  value={dropoffAddress}
                  onChange={setDropoffAddress}
                  onLocationChange={setDropoffLocation}
                  onPlaceSelected={() => setContactModalFor("dropoff")}
                  placeholder="e.g. Aghmashenebeli Ave 88, Tbilisi"
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
              title="What are you moving?"
              description="Pick the closest match — it decides which vehicles can take the job."
              disabled={!goodsStepEnabled}
              disabledReason={ENTER_ADDRESSES_FIRST}
            >
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CARGO_OPTIONS.map((option) => {
                  const { category, label, Icon } = option;
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
                        {label}
                      </span>
                      <span className="text-xs leading-snug text-muted">
                        {option.description}
                      </span>
                      {selected ? <SelectedTick /> : null}
                    </button>
                  );
                })}
              </div>
            </StepCard>

            <StepCard
              step={4}
              title="Total weight"
              description="Roughly how much is being moved — we'll only recommend vehicles that can carry it."
              disabled={!weightStepEnabled}
              // The addresses, not the goods step: this card and the goods card
              // open on the identical predicate, so the goods step is never a
              // thing to go and do while this line is on screen.
              disabledReason={ENTER_ADDRESSES_FIRST}
            >
              {weightOptions.length === 0 ? (
                <p className="text-[0.8125rem] text-muted">
                  Pick what you&rsquo;re moving first — weight options depend on
                  the vehicles cleared for it.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5 sm:max-w-xs">
                  <Label
                    htmlFor={weightSelectId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Total weight
                  </Label>
                  <select
                    id={weightSelectId}
                    value={maxWeightKg ?? ""}
                    onChange={(event) =>
                      setMaxWeightKg(Number(event.target.value))
                    }
                    className={NATIVE_FIELD_CLASSES}
                  >
                    {weightOptions.map((capacity) => (
                      <option key={capacity} value={capacity}>
                        Up to {formatVehiclePayload(capacity)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </StepCard>

            <StepCard
              step={5}
              title="Recommended vehicle"
              description="Only vehicles cleared for your goods, load space and weight are shown, cheapest first."
              disabled={!vehicleStepEnabled}
              // The fetch error is the reason *and* is given in the header,
              // because the header is the only part of a disabled step that
              // stays reachable: the content region goes `inert`, so the
              // `alert` below is out of the accessibility tree exactly when it
              // has something to say. And it always coincides — `weightOptions`
              // derives from the fetched types, so a failed fetch empties it and
              // shuts this step every time. Nothing competes with anything: one
              // string, in the one place a screen reader can still reach.
              disabledReason={vehicleTypesError ?? WEIGHT_UNAVAILABLE}
            >
              {vehicleTypesError ? (
                <p role="alert" className="text-[0.8125rem] text-accent">
                  {vehicleTypesError}
                </p>
              ) : loadingVehicleTypes ? (
                <p aria-busy="true" className="text-[0.8125rem] text-muted">
                  Loading vehicle types…
                </p>
              ) : (
                <>
                  {/* Native radios again, one per load space, each visually
                      replaced by the card wrapping it — the same trade the
                      crew-size picker in step 6 makes, and for the same
                      reasons: arrow-key navigation of the group and the "2 of
                      3" announcement, both free. (The goods and vehicle grids
                      above and below are older `aria-pressed` buttons; they
                      are left alone.) */}
                  <fieldset className="mb-[18px]">
                    <legend className="mb-2.5 text-[0.8125rem] font-medium text-paper">
                      What kind of load space do you need?
                    </legend>

                    <div className="grid grid-cols-3 gap-2.5">
                      {bodyTypeCards.map((option) => {
                        const selected = option.body === bodyType;
                        const countLabel = vehicleCountLabel(
                          option.vehicleCount,
                        );

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
                              aria-label={`${option.title} — ${option.description} · ${countLabel}`}
                              className="sr-only"
                            />
                            <span
                              aria-hidden="true"
                              className="pr-4 text-[0.8125rem] leading-snug font-semibold text-paper"
                            >
                              {option.title}
                            </span>
                            <span
                              aria-hidden="true"
                              className="text-xs leading-snug text-muted"
                            >
                              {option.description}
                            </span>
                            <span
                              aria-hidden="true"
                              className="font-price text-[0.6875rem] text-muted tabular-nums"
                            >
                              {countLabel}
                            </span>
                            {selected ? <SelectedTick /> : null}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  {cargoEligibleVehicleTypes.length === 0 ? (
                    <p role="alert" className="text-[0.8125rem] text-accent">
                      No vehicle is currently available for these goods. Pick a
                      different category.
                    </p>
                  ) : eligibleVehicleTypes.length === 0 ? (
                    // On the catalogue as seeded, this branch is the body
                    // filter's: every weight option is a capacity some
                    // cargo-eligible vehicle actually has (see
                    // `weightOptions`), so goods and weight alone do not empty
                    // the list. Two caveats keep that an observation rather
                    // than a guarantee.
                    //
                    // One: the weight re-default is an effect, so the render
                    // immediately after a goods change still holds the previous
                    // `maxWeightKg` against the new `weightOptions`. This alert
                    // can therefore flash for a frame with the body filter
                    // blameless.
                    //
                    // Two: the copy can misattribute. If the heaviest weight
                    // option belongs only to a vehicle outside the selected
                    // body, lowering the weight would work as well as changing
                    // the load space, but only the load space is offered. That
                    // depends on the catalogue, not on the structure — it does
                    // not arise on the current seed for the default DRY_BOX.
                    //
                    // The structure itself is exhaustive: no state reaches the
                    // grid with nothing in it and no alert.
                    <p
                      role="alert"
                      className="rounded-lg border border-accent/30 bg-accent/[0.08] px-3.5 py-3 text-[0.8125rem] leading-snug text-accent"
                    >
                      No vehicle matches this body type for your goods and
                      weight. Pick a different load space.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      {eligibleVehicleTypes.map((vehicleType) => {
                        const selected = vehicleType.code === vehicleTypeCode;
                        const isBestFit =
                          bestFitVehicleType?.code === vehicleType.code;
                        const Glyph =
                          VEHICLE_CATEGORY_GLYPHS[vehicleType.category];

                        return (
                          <button
                            key={vehicleType.code}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setVehicleTypeCode(vehicleType.code)}
                            className={`${PICK_CARD_BASE_CLASSES} ${
                              selected
                                ? PICK_CARD_SELECTED_CLASSES
                                : PICK_CARD_IDLE_CLASSES
                            }`}
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
                                  className={`rounded-full bg-emerald-600/10 px-2 py-0.5 text-[0.5625rem] font-semibold tracking-[0.1em] text-emerald-700 uppercase ${
                                    selected ? "mr-5" : ""
                                  }`}
                                >
                                  Best
                                </span>
                              ) : null}
                            </span>

                            <span className="mt-2.5 pr-4 text-[0.8125rem] leading-snug font-semibold text-paper">
                              {vehicleType.label}
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
                                up to{" "}
                                {formatVehiclePayload(vehicleType.maxPayloadKg)}
                              </span>
                            </span>

                            {selected ? <SelectedTick /> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </StepCard>

            <StepCard
              step={6}
              title="Additional details"
              disabled={!vehicleChosenStepsEnabled}
              disabledReason={CHOOSE_VEHICLE_FIRST}
            >
              <div className="flex flex-col gap-4">
                {/* Native radios, one per crew size, each visually replaced by
                    the cell wrapping it. Keeping the real inputs — `sr-only`
                    rather than removed — is what gives the group its arrow-key
                    handling and its "3 of 4" announcement for free, the same
                    trade the driver hub's radio rows make. */}
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[0.8125rem] font-medium text-paper">
                    People for loading / unloading
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
                            aria-label={crewSizeDescription(size)}
                            className="sr-only"
                          />
                          <span aria-hidden="true">{size}</span>
                        </label>
                      );
                    })}
                  </div>

                  <p className="text-xs leading-snug text-muted">
                    1 is the driver on their own. Every person after that is a
                    helper for loading and unloading, charged as a flat fee on
                    top of the fare.
                  </p>
                </fieldset>

                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor={descriptionId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    Description (optional)
                  </Label>
                  <Textarea
                    id={descriptionId}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Anything the driver should know"
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
              title="Service level"
              description={
                estimate
                  ? "Prices below are for this route"
                  : "Prices appear after you calculate"
              }
              // The third sibling of the vehicle choice, and never a gate on the
              // quote: the tier it opens on is the one the fare is quoted at, so
              // a client who never reaches this card still books at Regular.
              disabled={!vehicleChosenStepsEnabled}
              disabledReason={CHOOSE_VEHICLE_FIRST}
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
                <legend className="sr-only">Service level</legend>

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
                              ? `${option.title} — ${option.description} · ${priceLabel}`
                              : `${option.title} — ${option.description}`
                          }
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className="pr-7 text-[0.9375rem] leading-snug font-semibold text-paper"
                        >
                          {option.title}
                        </span>
                        <span
                          aria-hidden="true"
                          className="min-h-8 text-xs leading-[1.35] text-muted"
                        >
                          {option.description}
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
                            className={`absolute top-2.5 right-2.5 flex size-[22px] items-center justify-center rounded-full bg-black/[0.04] text-xs font-bold ${option.badge.className}`}
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
                <h2 className={PANEL_LABEL_CLASSES}>Price breakdown</h2>
                <p className="text-[0.6875rem] text-muted">
                  {estimating ? "Calculating…" : null}
                </p>
              </div>

              {estimate ? (
                <>
                  <dl className="mt-3 flex flex-col gap-1.5">
                    <BreakdownRow
                      label="Distance"
                      value={formatDistanceKm(estimate.distanceKm)}
                    />
                    <BreakdownRow
                      label="Transportation cost"
                      value={formatGel(transportationCost(estimate))}
                    />
                    {/* Only worth a line when at least one was actually
                        requested. */}
                    {estimate.helperFee > 0 ? (
                      <BreakdownRow
                        label="Helper Fee"
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
                        label="Regular fare"
                        value={formatGel(estimate.price)}
                      />
                    ) : null}
                    {/* Exactly one of these, or neither: Regular is the tier
                        the quote is already priced at, so it moves nothing. */}
                    {serviceLevel === "PRIORITY" ? (
                      <BreakdownRow
                        label="Priority fee"
                        value={`+${formatGel(serviceLevelDelta)}`}
                      />
                    ) : serviceLevel === "POOLING" ? (
                      <BreakdownRow
                        label="Pooling discount"
                        // A real minus sign, not a hyphen: this sits beside a
                        // "+" of the same weight in the tier above it.
                        value={`−${formatGel(Math.abs(serviceLevelDelta))}`}
                      />
                    ) : null}
                    <BreakdownRow
                      label="Total"
                      value={formatGel(estimate.serviceLevels[serviceLevel])}
                    />
                  </dl>

                  {minimumFareApplied(estimate) ? (
                    <p className="mt-2.5 text-xs text-accent">
                      Minimum fare applied for this vehicle type.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-2 text-[0.8125rem] leading-snug text-muted">
                  {canCalculate
                    ? "Press Calculate to see your price."
                    : "Fill in both addresses and choose a vehicle, then press Calculate to see your price."}
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
              {mapVisible ? "Hide route map" : "Show route map"}
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
                vehicleLabel={selectedVehicleType?.label ?? null}
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
              <p className={PANEL_LABEL_CLASSES}>Estimated total</p>
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

            {/* Once a quote exists the two actions coexist rather than swap:
                the tier cards invite comparison, and every comparison that ends
                in a changed vehicle or crew size needs the price back. Booking
                takes the outline treatment and recalculating keeps the accent
                fill, per the handoff. */}
            <div className="flex shrink-0 items-center gap-2.5">
              {estimate ? (
                <Button
                  type="submit"
                  form={formId}
                  disabled={!canSubmit}
                  className="h-12 gap-2 rounded-full border-paper bg-transparent px-6 text-[0.9375rem] font-semibold text-paper transition-colors hover:bg-surface hover:text-paper"
                >
                  {submitting ? "Booking…" : "Book delivery"}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : null}

              <Button
                type="button"
                onClick={() => void handleCalculate()}
                disabled={!canCalculate}
                className="h-12 gap-2 rounded-full bg-accent px-6 text-[0.9375rem] font-semibold text-ink transition-transform hover:bg-accent hover:-translate-y-0.5 disabled:translate-y-0"
              >
                {estimating
                  ? "Calculating…"
                  : estimate
                    ? "Recalculate"
                    : "Calculate"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
