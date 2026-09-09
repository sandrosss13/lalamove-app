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
import { totalDriverEarnings } from "@/lib/orders/payout";
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
 * Four words for the six statuses this screen can show: the three pre-transit
 * statuses (`PENDING`, `CLAIMED`, `ACCEPTED`) all read as "Scheduled" because
 * they are the same thing to whoever is looking at the list — work that is
 * booked and has not started moving. The distinctions between them are dispatch
 * mechanics, and the design's filter tabs (All / Active / Completed /
 * Cancelled, where Active is "In transit" + "Scheduled") do not expose them.
 *
 * `OrderStatus` has a seventh member, `INITIATED`, and it deliberately has no
 * word here — see `toHubJobStatus`.
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
  /**
   * `driverPayout + overtimeDriverPayout` — the account's **commissioned
   * earnings** on this job, which is why the panel labels it "Paid to you".
   *
   * This used to be `price + overtimeFee`, described here as "what the job pays
   * the account reading this". That was exactly backwards, and the claim is
   * deleted rather than softened: `price` and `overtimeFee` are what the
   * **client** pays. The platform takes its cut of that and pays the rest to
   * whoever carries the load, so the client's total has never been the carrier's
   * earnings — this screen was showing a driver roughly 18% more than they were
   * ever going to receive, on a line labelled "Paid to you".
   *
   * Both columns are read as stored, never recomputed: `driverPayout` is
   * resolved at booking and `overtimeDriverPayout` at completion, each at the
   * `commissionRate` stamped on that order, so retuning the rate cannot rewrite
   * what a historical job paid. See `src/lib/orders/payout.ts`.
   *
   * **`Order.serviceLevelAdjustment` is deliberately not a term in this sum, and
   * its absence is not the old omission carried forward.** The Priority uplift
   * and Pooling discount are already *inside* the basis `driverPayout` was
   * commissioned from at booking — `roundCurrency(price +
   * serviceLevelAdjustment)` — so adding the adjustment again here would pay it
   * to the carrier twice, and subtracting a Pooling discount would take it off
   * twice. The question the old comment recorded as "a commercial split nobody
   * has decided" is decided: the carrier receives 85% of the adjustment along
   * with everything else the client pays, at booking, in this column.
   *
   * This is knowingly not the same number `/orders` shows the client for the
   * same job, and now that is by design rather than by accident: the client sees
   * what they paid, the carrier sees what they earn, and the difference is the
   * platform's commission.
   */
  fare: number;

  /**
   * The carrier's commissioned share of the client's quoted total, as stored on
   * the order at booking. The detail panel's "Payout" line.
   */
  driverPayout: number;
  /**
   * The carrier's commissioned share of `Order.overtimeFee`, written at
   * completion at the order's own stored rate. Zero on every job that finished
   * inside the free loading allowance, and on every job not yet completed.
   */
  overtimeDriverPayout: number;
  /**
   * Extra helpers booked *beyond* the driver, 0-3. Kept even though the
   * per-helper fee itself is gone from this type: a headcount is operational
   * context, not money, and a job booked with a crew should say so.
   */
  helperCount: number;
  /** Why `overtimeDriverPayout` is non-zero; null until the job is completed. */
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
 *
 * Note also what it does not filter on: **status**. Unlike the open-market
 * queries, which key on `status: PENDING` by equality and so cannot see a
 * pre-market state, this one reads every status a scoped order holds. What
 * keeps an off-market `INITIATED` order out of it is the clause above rather
 * than a status test — `POST /api/orders` creates an order with neither a
 * `driverId` (set at accept or dispatch) nor a `companyId` (set at claim), and
 * both of those only ever happen from `PENDING` onwards, so an unpaid order
 * matches neither branch. That is a real guarantee but a second-hand one: it is
 * a property of the write paths, not of this line. `toHubJobStatus` is where
 * this file stops depending on it.
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

/*
 * This module used to carry its own `roundCurrency`, repeated verbatim in the
 * sibling hub modules the way `hubOrderScope` is. It had exactly one caller —
 * the `fare` line — and that line now goes through `totalDriverEarnings`, which
 * rounds the two payout columns' sum identically and is the codebase's single
 * definition of what a job paid its carrier. A private copy kept alive for a
 * caller that no longer exists is a second answer waiting to drift from the
 * first, so it is gone rather than kept "for symmetry". The siblings keep theirs
 * because they round aggregate sums, which `totalDriverEarnings` does not take.
 */

/**
 * `OrderStatus` in the design's vocabulary, or **null for a row that is not a
 * job at all**. See `HubJobStatus`.
 *
 * The null is `INITIATED`, and it is the one arm here that is not a label. An
 * `INITIATED` order is created but unpaid, and the schema states the invariant
 * plainly: it is off-market, and a driver or a company must never see one. So
 * the question this arm answers is not "what word does a driver read for an
 * unpaid order" — there must not be one — but "what does this loader do if the
 * invariant it relies on ever fails". Null means *drop the row*, and
 * `getHubJobs` skips it out of the list and out of every count.
 *
 * The three arms not taken, so the next person adding an enum member can see
 * the shape of the choice rather than copy this one:
 *
 * - Returning "Scheduled", as `PENDING` does, is the naive fix and the worst
 *   outcome. It quietly asserts a driver could legitimately see an unpaid job,
 *   and if the invariant ever broke it would put that job in the Active tab
 *   looking like work to go and do — the exact harm the invariant exists to
 *   prevent.
 * - Throwing treats arrival as the bug it would be, but this runs in a server
 *   loader that renders the whole Job history screen: one stray row would take
 *   the screen down for that account entirely. A loud failure is worth having;
 *   an outage over a row that is by construction impossible is not.
 * - A fifth `HubJobStatus` word would need a filter tab to live in and a pill
 *   tone to be drawn with, and `hub-status.ts` is a closed set of six. Inventing
 *   both to render a state no reader may see is the wrong end of the problem.
 *
 * Dropping the row upholds the invariant instead of restating it: whether or
 * not `INITIATED` reaches here, a driver does not see it. The `console.warn`
 * at the skip is what makes it a reported anomaly rather than a silent one, and
 * follows `loadHomePageSections` in `src/lib/admin/home-page-data.ts`, which
 * skips an unparseable row the same way.
 *
 * The switch stays exhaustive with no `default`, so the next member added to
 * `OrderStatus` fails the build here and gets decided on deliberately.
 */
function toHubJobStatus(status: OrderStatus): HubJobStatus | null {
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
    case OrderStatus.INITIATED:
      return null;
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
      // The two payout columns and nothing else: `price`, `baseFare`,
      // `distanceFare`, `timeFare`, `helperFee` and `overtimeFee` are what the
      // CLIENT pays, and this screen answers a carrier — a driver or the company
      // fulfilling the job. Not asking the database for them is what makes the
      // leak impossible rather than merely unrendered; `HubJob` has no key to
      // put them in, so a future line reaching for `order.price` here fails the
      // build. See `HubJob.fare`.
      driverPayout: true,
      overtimeDriverPayout: true,
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

  // `all` counts the rows this loader *emits*, not the rows it fetched: a row
  // `toHubJobStatus` rejects is dropped below, and the "N of M shown" caption
  // must describe the list the reader is actually looking at.
  const counts: HubJobCounts = {
    all: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };

  const jobs: HubJob[] = [];

  for (const order of rawOrders) {
    const status = toHubJobStatus(order.status);

    // Not a job anybody here may see — `INITIATED`, and only `INITIATED`. It
    // cannot reach this query (an unpaid order has neither a `driverId` nor a
    // `companyId`, so `hubOrderScope` excludes it), which is exactly why
    // arriving here is worth a line in the server log rather than a silent
    // skip: it means an invariant the schema states has stopped holding.
    if (status === null) {
      console.warn(
        `Skipping order ${order.id} in the hub job history: status ${order.status} is off-market and must not reach a driver or a company.`,
      );
      continue;
    }

    counts.all += 1;

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

    jobs.push({
      id: order.id,
      shortId: order.id.slice(-SHORT_ID_LENGTH).toUpperCase(),
      status,
      pickupAddress: order.pickupAddress,
      dropoffAddress: order.dropoffAddress,
      distanceKm: order.distanceKm,
      // `totalDriverEarnings`, not a local addition: `src/lib/orders/payout.ts`
      // is the single definition of "what this job paid the carrier", and it
      // exists precisely so no read site re-adds the two columns and forgets the
      // second. It rounds the sum for the same reason this module's own
      // `roundCurrency` did — adding two `Float` columns reintroduces the
      // binary-fraction dust each was rounded free of when it was stored.
      fare: totalDriverEarnings(order),
      driverPayout: order.driverPayout,
      overtimeDriverPayout: order.overtimeDriverPayout,
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
    });
  }

  return { jobs, counts };
}
