"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Banknote, CalendarDays, Check } from "lucide-react";
import type { CargoCategory, ChassisType, ServiceLevel } from "@prisma/client";

import { AddressAutocomplete } from "@/components/address-autocomplete";
import {
  AddCardDialog,
  type NewCardInput,
} from "@/components/home/add-card-dialog";
import {
  formatBookedDistanceKm,
  formatDistanceKm,
  formatGel,
} from "@/components/home/booking-format";
import {
  CARD_BRAND_CHIP_BASE_CLASSES,
  cardBrandChipClasses,
  cardBrandChipLabel,
} from "@/components/home/card-brand";
import {
  formatCardExpiry,
  maskedCardNumber,
  PAY_LATER_OPTION_VALUE,
  readErrorMessage,
  type BookingPaymentOptions,
  type SavedCardSummary,
} from "@/components/home/payment-methods";
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
 * The fare breakdown both `/api/pricing/estimate` and `/api/orders` return.
 * The estimate endpoint returns exactly this; the orders endpoint returns it
 * alongside the created order's id (see `CreatedOrder`).
 *
 * `routePath`, `durationMinutes`, `pickup` and `dropoff` are optional because
 * only the estimate endpoint carries them: `/api/orders` answers with the
 * persisted `Order` row, which stores the price and the distance it was booked
 * at but has no column for the route geometry, its duration, or the resolved
 * points themselves (those live on the row as separate `pickupLat`/`pickupLng`
 * fields, not this shape).
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
 * Fields of the created order the form surfaces back to the user — the itemised
 * quote it was booked at, not just the total.
 *
 * The tier and its effect on the fare are read back off the row rather than
 * from this component's own state: `POST /api/orders` derives the adjustment
 * from the quote it computes server-side, and the confirmation has to itemise
 * what was actually written, not what the browser last had in hand.
 *
 * They are two columns and not one because `price` stays the unadjusted fare —
 * that is what keeps the itemisation reconcilable and the minimum-fare note
 * honest (see `minimumFareApplied`). The booked total is their sum.
 */
type CreatedOrder = Quote & {
  id: string;
  serviceLevel: ServiceLevel;
  serviceLevelAdjustment: number;
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
 * No contact at either end — where a booking starts, and what it is returned to
 * once one is placed. Shared between the initial state and the reset because
 * both mean the same thing; never mutated, only ever spread from.
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
 * How the client said they will settle, as the payment step holds it.
 *
 * `savedCardId` is present on both arms rather than only on the card one, so
 * the submit reads one field instead of narrowing a union — and `null` on the
 * Pay later arm is exactly what `POST /api/orders` requires: it refuses a card
 * id sent alongside anything but `CARD`.
 *
 * There is no `PAY_LATER` method. Pay later *is* `CASH`, under the label the
 * client is shown — see `PaymentMethod` for why a fourth enum value would be
 * the wrong way to say it.
 */
type PaymentChoice =
  | { method: "CARD"; savedCardId: string }
  | { method: "CASH"; savedCardId: null };

/**
 * One row of the payment step. The pick-card border and fill states again, laid
 * out horizontally this time — chip, then title and note, then the tick — plus
 * the pointer affordance and the focus ring a `<label>` around an `sr-only`
 * radio has to draw on the hidden input's behalf.
 */
const PAYMENT_OPTION_CLASSES =
  "flex cursor-pointer items-center gap-3.5 rounded-xl border p-[14px_16px] transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20";

/** The dashed full-width control that opens the add-card dialog. */
const ADD_CARD_BUTTON_CLASSES =
  "mt-3 w-full rounded-lg border border-dashed border-line px-4 py-[11px] text-sm font-medium text-paper transition-colors hover:border-accent hover:text-accent";

/** The purchase-order field, taller than the form's other native inputs. */
const PURCHASE_ORDER_FIELD_CLASSES =
  "h-12 w-full rounded-lg border border-line bg-ink px-3.5 text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

/**
 * Longest purchase-order reference the field accepts, mirroring the
 * `FREE_TEXT_MAX_LENGTH` cap `POST /api/orders` applies to the same value. Held
 * here so an over-long reference is stopped at the keyboard rather than sent and
 * bounced — the server stays the authority either way.
 */
const PURCHASE_ORDER_REF_MAX_LENGTH = 200;

/** Shown when a rejected card save carries no message of its own. */
const SAVE_CARD_FAILED_MESSAGE = "Could not save the card. Try again.";

/**
 * The accent tick marking the chosen payment row.
 *
 * Not the shared `SelectedTick`: that one is absolutely positioned for the
 * corner of a pick card, and these rows are horizontal, so theirs sits in flow
 * and is pushed to the right edge by `ml-auto`.
 */
function PaymentSelectedTick(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-ink"
    >
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  );
}

/**
 * The client's default card as a payment choice, or `null` when there is
 * nothing to pre-select — no card of theirs is the default, or admin has the
 * card method switched off, in which case no card row is rendered at all.
 *
 * Never falls back to Pay later. The step is optional and books happily with
 * nothing chosen, so pre-selecting a settlement method the client did not pick
 * would put a choice on their order that they never made.
 */
function defaultPaymentChoice(
  cards: SavedCardSummary[],
  cardPaymentEnabled: boolean,
): PaymentChoice | null {
  if (!cardPaymentEnabled) {
    return null;
  }

  const preferred = cards.find((card) => card.isDefault);

  return preferred ? { method: "CARD", savedCardId: preferred.id } : null;
}

/**
 * `cards` with a newly saved one folded in, in the order the server would have
 * returned them: the default first, then newest first.
 *
 * The demotion is not cosmetic. `POST /api/saved-cards` promotes the new card in
 * the same transaction whenever the client asked for it — or whenever it is
 * their first — so a list that kept the old default's flag would print two
 * "Default" notes for a client who has one.
 */
function withSavedCard(
  cards: SavedCardSummary[],
  saved: SavedCardSummary,
): SavedCardSummary[] {
  const existing = saved.isDefault
    ? cards.map((card) => ({ ...card, isDefault: false }))
    : cards;

  // `filter` preserves order, so the non-default tail keeps its newest-first
  // sort with the new card at its head.
  const next = [saved, ...existing];

  return [
    ...next.filter((card) => card.isDefault),
    ...next.filter((card) => !card.isDefault),
  ];
}

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
 * It owns all of its own state; the only things handed to it are the three the
 * browser is in no position to decide for itself — which payment methods admin
 * has switched on, the client's saved cards, and whether the client is a
 * business — all resolved server-side by `loadBookingPaymentOptions` and passed
 * down through `HomeEntry`.
 *
 * The service level is the one input that does not invalidate the quote:
 * Priority and Pooling are arithmetic on the fare already quoted, so switching
 * tier re-prices from the estimate in hand rather than asking for a new one.
 *
 * Multi-stop routes are deliberately absent, because the backend has no concept
 * of them — an `Order` has exactly one pickup and one dropoff.
 */
export function BookingForm({
  enabledPaymentMethods,
  savedCards,
  accountType,
}: BookingPaymentOptions): React.ReactElement {
  const router = useRouter();

  // Not an element id but a shared radio `name`: it is what binds the four
  // crew-size inputs into one group for the browser's own arrow-key handling.
  const crewSizeName = useId();
  // Likewise the shared `name` binding the three load-space radios together.
  const bodyTypeName = useId();
  // And the one binding the three service-level radios.
  const serviceLevelName = useId();
  // And the one binding the saved-card rows and Pay later into one group.
  const paymentMethodName = useId();
  const descriptionId = useId();
  const purchaseOrderRefId = useId();
  const purchaseOrderNoteId = `${purchaseOrderRefId}-note`;
  const formId = useId();
  const dateTriggerId = useId();
  const timeSelectId = useId();
  const weightSelectId = useId();

  /**
   * Which of the three methods the payment step may offer. Read from the prop
   * rather than from an endpoint: admin owns this switchboard, and
   * `POST /api/orders` refuses a disabled method outright, so a row for one
   * would be an error the client cannot act on.
   *
   * `BANK_TRANSFER` has no row of its own. The handoff's payment step is saved
   * cards and Pay later, and inventing a third kind of row for a method with no
   * design would be building past the brief — an admin who switches it on gets
   * no client-facing option until one is designed.
   */
  const cardPaymentEnabled = enabledPaymentMethods.includes("CARD");
  const payLaterEnabled = enabledPaymentMethods.includes("CASH");

  /** The purchase-order field is a business client's, and nobody else's. */
  const isBusinessClient = accountType === "BUSINESS";

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

  /**
   * The client's saved cards, seeded from the server and then owned here.
   *
   * Local rather than read straight off the prop because a card added from
   * inside this form has to appear *and be selected* in the same paint: waiting
   * for `router.refresh()` to bring the list back would leave the group with a
   * selected id that is not yet in it, which renders as nothing selected. The
   * refresh still runs — it keeps the router cache's copy of this page honest
   * for a later navigation back to it — it simply is not what this list waits
   * on.
   */
  const [cards, setCards] = useState<SavedCardSummary[]>(savedCards);

  // How the client says they will settle, or `null` while they have not said.
  // Never gates anything: see `canSubmit`, which does not read it.
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice | null>(() =>
    defaultPaymentChoice(savedCards, cardPaymentEnabled),
  );

  const [addCardOpen, setAddCardOpen] = useState(false);

  // The client's own finance reference, carried on the order for them. Held for
  // every client but only ever rendered — and only ever sent — for a business
  // one, so an individual's booking cannot carry a value they were never shown.
  const [purchaseOrderRef, setPurchaseOrderRef] = useState("");

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreatedOrder | null>(null);

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

  // A remount key for the two address fields. Booking clears the addresses, but
  // each field also owns a structured breakdown of the place behind it; without
  // this the sub-form would linger under a now-empty input.
  const [addressFieldsKey, setAddressFieldsKey] = useState(0);

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
   * Save a card typed into the add-card dialog, then select it.
   *
   * Receives display metadata only — brand, last four, expiry, holder name and
   * the default flag. The card number and the security code never leave the
   * dialog, and `POST /api/saved-cards` refuses outright any body carrying
   * either, so there is nothing here to send even by accident.
   *
   * Throwing is how the dialog is told: it catches, renders the message inline
   * under its own fields and stays open. Resolving is what closes it.
   */
  async function handleAddCard(card: NewCardInput) {
    const response = await fetch("/api/saved-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, SAVE_CARD_FAILED_MESSAGE),
      );
    }

    const payload = (await response.json()) as { card?: SavedCardSummary };
    const saved = payload.card;

    if (!saved) {
      throw new Error(SAVE_CARD_FAILED_MESSAGE);
    }

    setCards((current) => withSavedCard(current, saved));
    // Adding a card from inside the payment step is a choice of that card;
    // making the client pick it again would be asking twice.
    setPaymentChoice({ method: "CARD", savedCardId: saved.id });
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

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
          // How the client says they will settle, and — only when that is a
          // card — which of their own cards. `undefined` where nothing was
          // chosen: the step is optional, and `JSON.stringify` drops the key
          // entirely, which is the "no method recorded" the endpoint reads.
          // Sending a card id alongside anything but CARD is refused outright,
          // which is why `PaymentChoice` carries `null` on the Pay later arm.
          paymentMethodType: paymentChoice?.method,
          savedCardId: paymentChoice?.savedCardId ?? undefined,
          // Business clients only, and enforced on both sides: the field is
          // never rendered for an individual, and `/api/orders` re-reads the
          // account type and drops the value for one anyway.
          purchaseOrderRef: isBusinessClient
            ? purchaseOrderRef.trim() || undefined
            : undefined,
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
        return;
      }

      setResult(payload as CreatedOrder);

      // The booked order is now the record of what was requested, so the form
      // goes back to empty rather than inviting an accidental re-submit of the
      // same route. The cargo and vehicle choices are kept: they describe the
      // kind of work this client does, not this one job.
      setScheduledDate(null);
      setScheduledTime("");
      setPickupAddress("");
      setDropoffAddress("");
      setPickupLocation(null);
      setDropoffLocation(null);
      // Cleared with the addresses they describe, and for the same reason the
      // fields are remounted below: a second booking down a different route
      // must not inherit the first one's contacts. The dialog is closed too,
      // in case a stray one is still open behind the confirmation.
      setContacts(NO_STOP_CONTACTS);
      setContactModalFor(null);
      setDescription("");
      setCrewSize(DEFAULT_CREW_SIZE);
      setServiceLevel(DEFAULT_SERVICE_LEVEL);
      // Back to the default card, exactly as the step opened — but against the
      // cards the client has *now*, one of which they may have just added. The
      // saved cards themselves are kept: they describe the client, not this job.
      setPaymentChoice(defaultPaymentChoice(cards, cardPaymentEnabled));
      // The reference belongs to the order just placed, not to the next one.
      setPurchaseOrderRef("");
      setAddCardOpen(false);
      setEstimate(null);
      setEstimateError(null);
      setAddressFieldsKey((key) => key + 1);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
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

        {result ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-600/30 bg-emerald-50 p-4"
          >
            <p className="font-display text-base font-semibold text-emerald-900">
              Order booked
            </p>
            <p className="mt-1 text-[0.8125rem] leading-snug text-emerald-800">
              We&rsquo;re matching your delivery with a driver now.
            </p>

            <dl className="mt-3.5 flex flex-col gap-1.5 border-t border-emerald-600/20 pt-3.5">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">Distance</dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  {formatBookedDistanceKm(result.distanceKm)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">
                  Transportation cost
                </dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900">
                  {formatGel(transportationCost(result))}
                </dd>
              </div>
              {/* Only worth a line when at least one was actually requested. */}
              {result.helperFee > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[0.8125rem] text-emerald-800">
                    Helper Fee
                  </dt>
                  <dd className="font-price text-[0.8125rem] text-emerald-900">
                    {formatGel(result.helperFee)}
                  </dd>
                </div>
              ) : null}
              {/* The same three closing lines the price breakdown showed
                  before the order was placed — quoted fare, what the tier did
                  to it, then the sum — so the confirmation reconciles against
                  the figure the client agreed to rather than restating the
                  unadjusted fare as a total. */}
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[0.8125rem] text-emerald-800">
                  Regular fare
                </dt>
                <dd className="font-price text-[0.8125rem] text-emerald-900 tabular-nums">
                  {formatGel(result.price)}
                </dd>
              </div>
              {/* Only Priority and Pooling move the fare; Regular is the tier
                  the quote is already priced at, so it books at a zero
                  adjustment and prints no line. */}
              {result.serviceLevelAdjustment !== 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-[0.8125rem] text-emerald-800">
                    {result.serviceLevel === "PRIORITY"
                      ? "Priority fee"
                      : "Pooling discount"}
                  </dt>
                  <dd className="font-price text-[0.8125rem] text-emerald-900 tabular-nums">
                    {result.serviceLevelAdjustment > 0
                      ? `+${formatGel(result.serviceLevelAdjustment)}`
                      : // A real minus sign, not a hyphen: it sits where a "+"
                        // of the same weight sits on a Priority order.
                        `−${formatGel(Math.abs(result.serviceLevelAdjustment))}`}
                  </dd>
                </div>
              ) : null}
              <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-emerald-600/20 pt-2.5">
                <dt className="text-[0.8125rem] font-semibold text-emerald-900">
                  Total
                </dt>
                <dd className="font-price text-base font-semibold text-emerald-900 tabular-nums">
                  {formatGel(result.price + result.serviceLevelAdjustment)}
                </dd>
              </div>
            </dl>

            {minimumFareApplied(result) ? (
              <p className="mt-2.5 text-xs text-emerald-800">
                Minimum fare applied for this vehicle type.
              </p>
            ) : null}

            <Link
              href="/orders"
              className="mt-3.5 inline-flex items-center gap-2 text-[0.8125rem] font-semibold text-emerald-900 underline underline-offset-4 hover:opacity-70"
            >
              View your orders
            </Link>
          </div>
        ) : null}

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

            <StepCard step={2} title="Route">
              <div className="flex flex-col gap-4">
                <AddressAutocomplete
                  // Remounted after a booking so the structured breakdown each
                  // field owns is cleared along with the address string.
                  key={`pickup-${addressFieldsKey}`}
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
                  key={`dropoff-${addressFieldsKey}`}
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

            <StepCard step={6} title="Additional details">
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

            {/* The one step that never blocks anything. `canCalculate` and
                `canSubmit` both ignore it by design: a client who says nothing
                here books an order with no method recorded, which is exactly
                what every order placed before this step existed carries. */}
            <StepCard
              step={7}
              title="Payment"
              description="Optional — you can book now and settle later."
            >
              {cardPaymentEnabled || payLaterEnabled ? (
                <>
                  {/* Native radios for the fourth time in this form, and for
                      the same reasons as the load-space, crew-size and
                      service-level pickers: the group's arrow-key navigation
                      and its "2 of 3" announcement both come free with the real
                      inputs. The handoff draws `aria-pressed` buttons; the
                      form's newer convention is radios. */}
                  <fieldset>
                    {/* The card's title is this group's visible name, and
                        assistive tech has no way to associate the two — so the
                        legend says it again rather than leaving the group
                        unnamed. */}
                    <legend className="sr-only">Payment method</legend>

                    <div className="flex flex-col gap-2.5">
                      {cardPaymentEnabled
                        ? cards.map((card) => {
                            const selected =
                              paymentChoice?.method === "CARD" &&
                              paymentChoice.savedCardId === card.id;
                            const expiry = formatCardExpiry(
                              card.expMonth,
                              card.expYear,
                            );
                            // The brand chip and the row's text are hidden from
                            // assistive tech (below) and spoken from here
                            // instead, so a card arrives as one name in one
                            // reading order rather than as four loose digits.
                            const cardLabel = `${card.brand} card ending ${card.last4} — expires ${expiry}${
                              card.isDefault ? " · Default" : ""
                            }`;

                            return (
                              <label
                                key={card.id}
                                className={`${PAYMENT_OPTION_CLASSES} ${
                                  selected
                                    ? PICK_CARD_SELECTED_CLASSES
                                    : PICK_CARD_IDLE_CLASSES
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={paymentMethodName}
                                  value={card.id}
                                  checked={selected}
                                  onChange={() =>
                                    setPaymentChoice({
                                      method: "CARD",
                                      savedCardId: card.id,
                                    })
                                  }
                                  aria-label={cardLabel}
                                  className="sr-only"
                                />
                                <span
                                  aria-hidden="true"
                                  className={cardBrandChipClasses(card.brand)}
                                >
                                  {cardBrandChipLabel(card.brand)}
                                </span>
                                <span aria-hidden="true" className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-paper">
                                    {card.brand}{" "}
                                    <span className="font-price tabular-nums">
                                      {maskedCardNumber(card.last4)}
                                    </span>
                                  </span>
                                  <span className="mt-0.5 block text-xs text-muted">
                                    Expires{" "}
                                    <span className="font-price tabular-nums">
                                      {expiry}
                                    </span>
                                    {card.isDefault ? " · Default" : null}
                                  </span>
                                </span>
                                {selected ? <PaymentSelectedTick /> : null}
                              </label>
                            );
                          })
                        : null}

                      {payLaterEnabled ? (
                        <label
                          className={`${PAYMENT_OPTION_CLASSES} ${
                            paymentChoice?.method === "CASH"
                              ? PICK_CARD_SELECTED_CLASSES
                              : PICK_CARD_IDLE_CLASSES
                          }`}
                        >
                          <input
                            type="radio"
                            name={paymentMethodName}
                            value={PAY_LATER_OPTION_VALUE}
                            checked={paymentChoice?.method === "CASH"}
                            onChange={() =>
                              setPaymentChoice({
                                method: "CASH",
                                savedCardId: null,
                              })
                            }
                            aria-label="Pay later — settle after the delivery"
                            className="sr-only"
                          />
                          {/* The brand chip's own geometry, so this row's glyph
                              lines up with the cards above it. A neutral fill
                              rather than a brand tone: nothing was issued. */}
                          <span
                            aria-hidden="true"
                            className={`${CARD_BRAND_CHIP_BASE_CLASSES} bg-surface text-muted`}
                          >
                            <Banknote className="size-4" />
                          </span>
                          <span aria-hidden="true" className="min-w-0">
                            <span className="block text-sm font-medium text-paper">
                              Pay later
                            </span>
                            <span className="mt-0.5 block text-xs text-muted">
                              Settle after the delivery
                            </span>
                          </span>
                          {paymentChoice?.method === "CASH" ? (
                            <PaymentSelectedTick />
                          ) : null}
                        </label>
                      ) : null}
                    </div>
                  </fieldset>

                  {/* `type="button"`, and it matters more here than anywhere
                      else on this page: this control sits inside the booking
                      `<form>`, where an unqualified `<button>` defaults to
                      `type="submit"` and would place a real order on the way to
                      opening a dialog. */}
                  {cardPaymentEnabled ? (
                    <button
                      type="button"
                      onClick={() => setAddCardOpen(true)}
                      className={ADD_CARD_BUTTON_CLASSES}
                    >
                      + Add card
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="text-[0.8125rem] leading-snug text-muted">
                  No payment method is available at the moment. You can still
                  book this delivery.
                </p>
              )}

              {/* Business clients only, and the check is the server's answer,
                  never a guess made here: `accountType` is read from the
                  client's own `ClientProfile` in `loadBookingPaymentOptions`.
                  An individual client is never sent this field at all. */}
              {isBusinessClient ? (
                <div className="mt-4 flex flex-col gap-1.5">
                  <Label
                    htmlFor={purchaseOrderRefId}
                    className="text-[0.8125rem] font-medium text-paper"
                  >
                    PO or cost-centre reference
                  </Label>
                  <input
                    id={purchaseOrderRefId}
                    type="text"
                    value={purchaseOrderRef}
                    onChange={(event) =>
                      setPurchaseOrderRef(event.target.value)
                    }
                    // Mirrors the server's own cap on the same field, so an
                    // over-long reference is stopped at the keyboard rather
                    // than sent and bounced.
                    maxLength={PURCHASE_ORDER_REF_MAX_LENGTH}
                    placeholder="e.g. PO-2026-0184"
                    aria-describedby={purchaseOrderNoteId}
                    className={PURCHASE_ORDER_FIELD_CLASSES}
                  />
                  <p
                    id={purchaseOrderNoteId}
                    className="text-xs leading-snug text-muted"
                  >
                    Optional. Appears on your order record for your own finance
                    team.
                  </p>
                </div>
              ) : null}

              {/* Mounted inside the booking `<form>` — the first time this
                  dialog has been — which is what makes its two
                  `stopPropagation` guards load-bearing rather than defensive.
                  Radix portals the panel to `document.body`, but React
                  dispatches synthetic events along the *React* tree, so without
                  them a click on "Save card" would raise a `submit` that walks
                  into `handleSubmit` and books a delivery, and a keypress in a
                  card field would reach `handleFormKeyDown` and fire a live
                  quote. Escape is unaffected: Radix listens for it in the
                  capture phase on the document, which runs before React's
                  bubble-phase dispatch ever reaches the guard. */}
              {cardPaymentEnabled ? (
                <AddCardDialog
                  open={addCardOpen}
                  onOpenChange={setAddCardOpen}
                  isFirstCard={cards.length === 0}
                  onSubmit={handleAddCard}
                />
              ) : null}
            </StepCard>

            {/* Unnumbered, but wearing the step cards' chrome: the numbered
                steps above describe the job and how it is paid for, and this is
                a choice about how the job is *handled* — one the form always
                has an answer for, since it opens on Regular. Numbering it would
                add a thing to answer that is already answered. The header note
                the handoff puts to the right of the title sits in the card's own
                description slot instead, which is where a step card keeps its
                subtitle. */}
            <StepCard
              title="Service level"
              description={
                estimate
                  ? "Prices below are for this route"
                  : "Prices appear after you calculate"
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
