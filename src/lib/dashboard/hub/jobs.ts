/**
 * Everything the Driver Hub's **Job history** screen renders, fetched and shaped
 * in one server pass.
 *
 * The list, its filter tabs, its "N of M shown" caption and the detail panel's
 * timeline and fare lines all come from the same `Order` rows, so they are read
 * once here rather than by the table and then again by whatever the reader
 * clicks. This mirrors `src/lib/driver-dashboard-data.ts`, the convention every
 * hub module follows.
 *
 * ## Real vs sample
 *
 * There is no `sampled` sub-object on `HubJobsData`, and that absence is the
 * point: this is the one hub screen with no placeholder data anywhere in it.
 * Every column, every timeline step and every fare line is a column on `Order`.
 * The design's **Tip** fare line is simply omitted — `Order` has no `tipAmount`,
 * and a per-order tip is exactly the kind of number that must not be invented,
 * so the line is absent rather than estimated. (`sample.ts` does carry a
 * range-level tip estimate; it is used on the Earnings screen, where it is
 * badged, and never here.) A screen built on this module should render no
 * `<SampleNote />` at all.
 *
 * `Order` is a single pickup → single dropoff booking with no multi-stop table,
 * so the design's three-stop routes and four-step timelines collapse to the two
 * real stops and the three real timestamps. Nothing is padded out to match.
 *
 * Server-only: it talks to Prisma directly. The object it returns crosses into
 * a `"use client"` tree, so every timestamp is an ISO string and never a `Date`,
 * and every number is returned unformatted for the screen to present.
 *
 * Completeness: the list is returned whole and unpaginated, matching the
 * convention `driver-dashboard-data.ts` and `company-dashboard-data.ts` both
 * state — the filter tabs and the "N of M shown" caption both need the full set
 * client-side, and a driver's own history is not an unbounded table.
 */
import "server-only";

import { ChassisType, OrderStatus, ServiceLevel } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import { prisma } from "@/lib/prisma";

/**
 * A company id no cuid can ever equal, used only to make a missing
 * `HubAccount.companyId` fail closed. See `hubOrderScope` below.
 */
const UNMATCHABLE_COMPANY_ID = "__hub-account-has-no-company__";

/** How many trailing characters of a cuid make up the display id. */
const SHORT_ID_LENGTH = 6;

/**
 * The status words the design uses, which are not `OrderStatus`.
 *
 * Four words for six statuses: the three pre-transit statuses (`PENDING`,
 * `CLAIMED`, `ACCEPTED`) all read as "Scheduled" because they are the same
 * thing to whoever is looking at the list — work that is booked and has not
 * started moving. The distinctions between them are dispatch mechanics, and the
 * design's filter tabs (All / Active / Completed / Cancelled, where Active is
 * "In transit" + "Scheduled") do not expose them.
 */
export type HubJobStatus =
  "In transit" | "Scheduled" | "Completed" | "Cancelled";

/**
 * The tier the client booked, in the words the panel prints.
 *
 * Recorded, not acted on: dispatch matches on `vehicleTypeSpecId` alone and
 * never reads `Order.serviceLevel`. Showing it to the driver and to ops is what
 * makes the client-facing tier copy honest — the order genuinely carries the
 * flag and the people running the job genuinely see it — without implying a
 * matching behaviour that does not exist.
 */
export type HubServiceLevel = "Priority" | "Regular" | "Pooling";

/**
 * The load space the client asked for, in the words the panel prints.
 *
 * `Order.bodyType` is null on every order placed before the filter existed and
 * there is nothing to derive one from, so the panel omits the pill rather than
 * guessing at "Dry box".
 */
export type HubBodyType = "Dry box" | "Refrigerated" | "Open chassis";

/**
 * Whoever the driver asks for at one end of the job.
 *
 * All three parts are optional at booking, so any of them may be null — but the
 * object itself is null when *none* of them was given, which is the distinction
 * the panel needs: a stop with no contact at all prints one em dash, while a
 * stop with a phone and nothing else prints the phone. Without the null object
 * the panel would have to render an empty row and call it a contact.
 */
export type HubStopContact = {
  name: string | null;
  phone: string | null;
  /** Block, floor or room — free text, as the schema stores it. */
  details: string | null;
};

/** One row of the job table, carrying everything its detail panel also needs. */
export type HubJob = {
  /** `Order.id` — the key for selection and for any action route. */
  id: string;
  /**
   * The last six characters of the cuid, uppercased: a readable stand-in for
   * the design's "TB4821" job codes, which no column in this schema holds.
   * Display only — it is derived, not stored, and not unique by construction,
   * so never key or link on it.
   */
  shortId: string;
  status: HubJobStatus;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  /** `price + overtimeFee` — what the job is worth in total. */
  fare: number;

  /* Fare lines, exactly as `Order` itemises them for the detail panel. They sum
     to `price` only up to the rule's `minimumFare` floor, which is why `price`
     is stored and shown rather than re-added from the parts. */
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  helperFee: number;
  overtimeFee: number;
  /** The up-front quoted total, floored at the pricing rule's minimum fare. */
  price: number;
  /**
   * Extra helpers booked *beyond* the driver, 0-3 — why `helperFee` is
   * non-zero, and how many people that one figure covers: the rule's flat
   * per-helper fee is already multiplied by this before it is stored.
   */
  helperCount: number;
  /** Why `overtimeFee` is non-zero; null until the job is completed. */
  waitingMinutes: number | null;

  /* Timeline. Three timestamps, not the design's four steps — see the module
     comment. `scheduledAt` is the client's requested slot and is null on every
     order booked before that field existed. */
  createdAt: string;
  scheduledAt: string | null;
  inTransitAt: string | null;
  completedAt: string | null;

  /** Vehicle class the job was booked for, e.g. "Cargo Van". */
  vehicleTypeLabel: string;
  /** Plate of the vehicle actually used; null until accept/dispatch. */
  vehiclePlate: string | null;

  /* Operational context the client gave at booking. `serviceLevel` always has a
     value — the column defaults to `REGULAR`, which is what every order placed
     before the picker existed was in fact served at — while the rest are null
     wherever the client left them, or the field, out. */
  serviceLevel: HubServiceLevel;
  bodyType: HubBodyType | null;
  pickupContact: HubStopContact | null;
  dropoffContact: HubStopContact | null;
  /**
   * A Business client's own purchase-order number or cost-centre code. Null for
   * every individual's order, which never sees the field, and for a business
   * order placed without one.
   */
  purchaseOrderRef: string | null;
};

/**
 * Row counts per filter tab, so the "N of M shown" caption and the tab labels
 * agree with the list without the screen counting it twice.
 */
export type HubJobCounts = {
  all: number;
  /** "In transit" + "Scheduled" — the design's Active tab. */
  active: number;
  completed: number;
  cancelled: number;
};

export type HubJobsData = {
  /** The complete, unpaginated list, newest first. */
  jobs: readonly HubJob[];
  counts: HubJobCounts;
};

/**
 * The one clause that scopes every `Order` query in this file to the signed-in
 * account: a fleet sees the orders it holds, a driver sees the orders assigned
 * to them.
 *
 * Repeated verbatim in `today.ts`, `earnings.ts` and `performance.ts` rather
 * than lifted into a shared module. Four screens, four independent server
 * passes, and a clause this small is not worth a fifth file that all four have
 * to be read alongside — but it *is* the tenancy boundary, so if you change it
 * here, change it in all four.
 *
 * Note what this deliberately does not include: the open-market rows
 * `driver-dashboard-data.ts` unions in for an activated independent driver.
 * This is a *history* screen, and unclaimed work nobody has taken is not part
 * of anyone's history.
 */
function hubOrderScope(account: HubAccount): Prisma.OrderWhereInput {
  if (account.kind === "BUSINESS") {
    // `{ companyId: null }` reads as `IS NULL` in Prisma, which would match
    // every unclaimed order on the platform. `resolveHubAccount` always sets
    // `companyId` for a BUSINESS so this branch is unreachable, but the type
    // permits null and the failure mode is a cross-tenant read rather than an
    // error, so it fails closed instead of being asserted away.
    return { companyId: account.companyId ?? UNMATCHABLE_COMPANY_ID };
  }

  return { driverId: account.userId };
}

/**
 * Prices are `Float` columns, so summing them accumulates binary-fraction dust;
 * money crossing this boundary is rounded to the cent it will be printed at.
 * Repeated in the sibling hub modules for the same reason `hubOrderScope` is.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `OrderStatus` in the design's vocabulary. See `HubJobStatus`. */
function toHubJobStatus(status: OrderStatus): HubJobStatus {
  switch (status) {
    case OrderStatus.IN_TRANSIT:
      return "In transit";
    case OrderStatus.COMPLETED:
      return "Completed";
    case OrderStatus.CANCELLED:
      return "Cancelled";
    case OrderStatus.PENDING:
    case OrderStatus.CLAIMED:
    case OrderStatus.ACCEPTED:
      return "Scheduled";
  }
}

/**
 * `ServiceLevel` in the design's vocabulary.
 *
 * An exhaustive switch rather than a title-casing transform, for the same
 * reason `toHubJobStatus` is one: the enum is the database's vocabulary and the
 * label is the product's, and a transform silently invents a label for any
 * value added to the enum later instead of failing the build.
 */
function toHubServiceLevel(serviceLevel: ServiceLevel): HubServiceLevel {
  switch (serviceLevel) {
    case ServiceLevel.PRIORITY:
      return "Priority";
    case ServiceLevel.REGULAR:
      return "Regular";
    case ServiceLevel.POOLING:
      return "Pooling";
  }
}

/** `ChassisType` in the design's vocabulary, passing null straight through. */
function toHubBodyType(bodyType: ChassisType | null): HubBodyType | null {
  if (bodyType === null) {
    return null;
  }

  switch (bodyType) {
    case ChassisType.DRY_BOX:
      return "Dry box";
    case ChassisType.REFRIGERATED:
      return "Refrigerated";
    case ChassisType.OPEN_CHASSIS:
      return "Open chassis";
  }
}

/**
 * A stored free-text value, or null when it holds nothing worth printing.
 *
 * The contact fields are optional inputs, so a submitted-but-empty field can
 * reach the column as `""` rather than as SQL NULL. Both mean "not given", and
 * the panel prints an em dash for a missing value — so they are collapsed to
 * one representation here rather than leaving the screen to render a blank line
 * that looks like a rendering fault.
 */
function textOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";

  return trimmed === "" ? null : trimmed;
}

/**
 * One stop's contact, or null when the client gave nothing for that stop.
 *
 * The null case is deliberate and is not the same as three null fields: it is
 * the only way the panel can tell "no contact here" from "a contact whose name
 * we do not have", and it is what stops an all-empty row being drawn.
 */
function toStopContact(
  name: string | null,
  phone: string | null,
  details: string | null,
): HubStopContact | null {
  const contact: HubStopContact = {
    name: textOrNull(name),
    phone: textOrNull(phone),
    details: textOrNull(details),
  };

  return contact.name === null &&
    contact.phone === null &&
    contact.details === null
    ? null
    : contact;
}

/**
 * Fetches and shapes the whole job history for either account kind.
 *
 * One query: the counts are tallied from the rows rather than asked for
 * separately, so the caption can never describe a different set than the table
 * is showing.
 */
export async function getHubJobs(account: HubAccount): Promise<HubJobsData> {
  const rawOrders = await prisma.order.findMany({
    where: hubOrderScope(account),
    select: {
      id: true,
      status: true,
      pickupAddress: true,
      dropoffAddress: true,
      distanceKm: true,
      baseFare: true,
      distanceFare: true,
      timeFare: true,
      helperFee: true,
      overtimeFee: true,
      price: true,
      helperCount: true,
      waitingMinutes: true,
      createdAt: true,
      scheduledAt: true,
      inTransitAt: true,
      completedAt: true,
      serviceLevel: true,
      bodyType: true,
      pickupContactName: true,
      pickupContactPhone: true,
      pickupContactDetails: true,
      dropoffContactName: true,
      dropoffContactPhone: true,
      dropoffContactDetails: true,
      purchaseOrderRef: true,
      vehicleTypeSpec: { select: { label: true } },
      vehicle: { select: { plateNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const counts: HubJobCounts = {
    all: rawOrders.length,
    active: 0,
    completed: 0,
    cancelled: 0,
  };

  const jobs = rawOrders.map((order): HubJob => {
    const status = toHubJobStatus(order.status);

    switch (status) {
      case "Completed":
        counts.completed += 1;
        break;
      case "Cancelled":
        counts.cancelled += 1;
        break;
      case "In transit":
      case "Scheduled":
        counts.active += 1;
        break;
    }

    return {
      id: order.id,
      shortId: order.id.slice(-SHORT_ID_LENGTH).toUpperCase(),
      status,
      pickupAddress: order.pickupAddress,
      dropoffAddress: order.dropoffAddress,
      distanceKm: order.distanceKm,
      fare: roundCurrency(order.price + order.overtimeFee),
      baseFare: order.baseFare,
      distanceFare: order.distanceFare,
      timeFare: order.timeFare,
      helperFee: order.helperFee,
      overtimeFee: order.overtimeFee,
      price: order.price,
      helperCount: order.helperCount,
      waitingMinutes: order.waitingMinutes,
      createdAt: order.createdAt.toISOString(),
      scheduledAt: order.scheduledAt?.toISOString() ?? null,
      inTransitAt: order.inTransitAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
      vehicleTypeLabel: order.vehicleTypeSpec.label,
      vehiclePlate: order.vehicle?.plateNumber ?? null,
      serviceLevel: toHubServiceLevel(order.serviceLevel),
      bodyType: toHubBodyType(order.bodyType),
      pickupContact: toStopContact(
        order.pickupContactName,
        order.pickupContactPhone,
        order.pickupContactDetails,
      ),
      dropoffContact: toStopContact(
        order.dropoffContactName,
        order.dropoffContactPhone,
        order.dropoffContactDetails,
      ),
      purchaseOrderRef: textOrNull(order.purchaseOrderRef),
    };
  });

  return { jobs, counts };
}
