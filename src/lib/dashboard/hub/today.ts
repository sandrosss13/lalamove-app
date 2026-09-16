/**
 * Everything the Driver Hub's **Today** screen renders, fetched and shaped in
 * one server pass.
 *
 * The screen answers four questions at a glance — what was earned today, what
 * job is running right now, where the demand is, and what needs acting on — so
 * one aggregation function is both cheaper and far easier to keep consistent
 * than each card running its own query. This mirrors the structure of
 * `src/lib/driver-dashboard-data.ts`, which is the convention every hub module
 * follows.
 *
 * ## Real vs sample
 *
 * Everything at the top level of `HubTodayData` is derived from `Order`,
 * `DriverLicence` and `Vehicle`, and is true. Everything under `sampled` comes
 * from `@/lib/dashboard/hub/sample` and must be rendered with a `<SampleNote />`
 * beside it. The split is a nesting level rather than a naming convention on
 * purpose: a screen cannot read a fictional number without typing the word
 * `sampled` on the way to it, which makes an accidental un-badged placeholder a
 * visible mistake in review rather than an invisible one.
 *
 * One deliberate departure from the brief's screen matrix: the glance card's
 * **completion rate** is real here rather than sampled. `sample.ts` exports no
 * completion figure — precisely because the number *is* derivable from
 * `Order.status` — and the honesty rule makes that module the only place a
 * placeholder may live, so inventing one locally is not an option. It is
 * computed over the same Monday-anchored Tbilisi week `performance.ts` uses, so
 * the two screens can never disagree. The other three glance rows stay sampled for
 * reasons the schema, not this file, decides: acceptance needs a `JobOffer`
 * model (a declined offer leaves no row at all), rating needs an `OrderRating`
 * model, and a cancellation cannot be attributed to anyone because `Order`
 * records no actor for it.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — in particular every timestamp is an ISO string,
 * never a `Date`. Numbers are returned unformatted; the screen owns currency
 * and date presentation.
 *
 * Time boundaries: every "today" boundary here is a **Tbilisi** day, via
 * `@/lib/dashboard/hub/timezone`. This used to be UTC, following the convention
 * `driver-dashboard-data.ts` set, and that was wrong in a way the screen made
 * visible: "Earned today" covered a UTC day — 04:00 to 04:00 in Tbilisi — while
 * the header beside it named the Tbilisi date, so for four hours every night the
 * tile and its own label described different days. The hub is a single-country
 * product, so the day it buckets by is now the day a driver would call today.
 * The zone is fixed rather than read from the host, so the figures do not depend
 * on where the deploy landed; the timezone module explains the choice at length.
 */
import "server-only";

import { OrderStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
import {
  SAMPLE_ACCEPTANCE_RATE_PERCENT,
  SAMPLE_AVG_RATING,
  SAMPLE_CANCELLATIONS_TODAY,
  SAMPLE_ONLINE_TIME_TODAY_LABEL,
  SAMPLE_RATED_JOB_COUNT,
  SAMPLE_ZONE_DEMAND,
  SAMPLE_ZONE_DEMAND_CAPTION,
  sampleVehicleFacts,
} from "@/lib/dashboard/hub/sample";
import type {
  SampleComplianceStatus,
  SampleZoneDemandRow,
} from "@/lib/dashboard/hub/sample";
import {
  differenceInHubDays,
  startOfHubDay,
  startOfHubDayPlus,
  startOfHubWeek,
} from "@/lib/dashboard/hub/timezone";
import { totalDriverEarnings } from "@/lib/orders/payout";
import { prisma } from "@/lib/prisma";

/**
 * Statuses that mean a job is running right now. An individual driver holds at
 * most one of these at a time — the same assumption `driver-dashboard-data.ts`
 * makes for its `activeOrderId`.
 *
 * That singular assumption holds for an individual driver and **not** for a
 * fleet, which can legitimately have a dozen vans on the road at once. So this
 * loader returns a capped list (`jobsInProgress`) beside an uncapped real count
 * (`jobsInProgressCount`) rather than the one arbitrary job it used to: for an
 * individual the two agree and the list is 0 or 1 long, and for a fleet the
 * count is the honest number and the list is a preview of it.
 */
const ACTIVE_JOB_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT];

/** The two outcomes a job can finish in; the basis of the completion rate. */
const TERMINAL_JOB_STATUSES = [OrderStatus.COMPLETED, OrderStatus.CANCELLED];

/**
 * Days in the completion rate's window: one Monday-anchored Tbilisi week, the same
 * window `performance.ts` uses for the identically-derived figure on its own
 * tile. Two screens showing two different completion rates would be a bug the
 * user reports, so the window is a week here for the reason it is a week there
 * — see `HUB_PERFORMANCE_WINDOW_DAYS`. Change one, change both.
 */
const COMPLETION_WINDOW_DAYS = 7;

/**
 * A company id no cuid can ever equal, used only to make a missing
 * `HubAccount.companyId` fail closed. See `hubOrderScope` below.
 */
const UNMATCHABLE_COMPANY_ID = "__hub-account-has-no-company__";

/**
 * How many in-flight jobs the Today screen previews.
 *
 * The count beside the list is uncapped and real, so this is purely how much of
 * the fleet's current work fits on one card without turning Today into a second
 * Jobs screen. Three is the design's own figure: the handoff's fleet job pill
 * lists three live jobs and then links out with "View all jobs in progress"
 * (`UI:UX/Registered Driver account (New)/Driver dashboard header alignment/
 * Driver Dashboard v2.dc.html`, `livePillJobs`). An individual driver holds at
 * most one in-flight job anyway — the same assumption `driver-dashboard-data.ts`
 * makes for its `activeOrderId` — so the cap only ever bites a fleet.
 */
const IN_PROGRESS_JOB_PREVIEW_LIMIT = 3;

/**
 * How many of a fleet's vehicles the sampled compliance rows cover.
 *
 * Two rows are emitted per vehicle (insurance and inspection), so this is a cap
 * on a card, not on a fleet. It exists because of a property of the sample
 * module rather than of the design: `sampleVehicleFacts()` only has entries for
 * the handoff's seven demo plates, so in any real database every plate falls
 * through to `SAMPLE_VEHICLE_FACTS_FALLBACK` and yields the *same* two rows —
 * "MTPL insurance not on file", "Technical inspection not on file". Uncapped, a
 * twelve-van fleet would render twenty-four identical rows saying nothing. The
 * card names how many vehicles it covered and how many exist
 * (`vehicleAlertVehicleCount` against the real `fleetVehicleCount`) and links to
 * the Vehicles screen, which is where the whole fleet's compliance belongs.
 *
 * Retire this cap along with the sampled rows themselves: with a real
 * `VehicleCompliance` model the loader would filter to the vehicles that
 * actually have something expiring, and a cap on a filtered list is a different
 * question from a cap on an unfiltered one.
 */
const FLEET_COMPLIANCE_VEHICLE_LIMIT = 3;

/**
 * The stops of the current job. Exactly two are ever returned: `Order` models a
 * single pickup → single dropoff booking and has no multi-stop table, so the
 * design's three-stop example has no equivalent in this schema and no third
 * stop is synthesised to fill the gap.
 */
export type HubTodayStop = {
  kind: "PICKUP" | "DROPOFF";
  address: string;
  /**
   * When the leg was actually served, ISO, or `null` while it is still ahead —
   * `inTransitAt` for the pickup (the load is aboard), `completedAt` for the
   * drop-off. A job in progress therefore always has a null drop-off time,
   * which is where the design shows an ETA; nothing in the schema can supply
   * one, so the screen shows the stop as pending instead.
   */
  at: string | null;
};

/** One job in flight right now, as the "Current job" card renders it. */
export type HubTodayCurrentJob = {
  id: string;
  /** Narrowed to the two in-flight statuses — see `ACTIVE_JOB_STATUSES`. */
  status: "ACCEPTED" | "IN_TRANSIT";
  /** Exactly two entries: `[0]` pickup, `[1]` drop-off. */
  stops: readonly HubTodayStop[];
  distanceKm: number;
  /**
   * `driverPayout + overtimeDriverPayout` — the **carrier's** commissioned
   * earnings on the job in flight, never `price + overtimeFee`, which is what
   * the client pays for it. Same figure, same reasoning, as `HubJob.fare` and
   * the Earnings screen's totals; see `src/lib/orders/payout.ts`.
   *
   * `Order.serviceLevelAdjustment` is deliberately not a term in it: the
   * Priority uplift and Pooling discount are already inside the basis
   * `driverPayout` was commissioned from at booking
   * (`roundCurrency(price + serviceLevelAdjustment)`), so adding the adjustment
   * here would pay it twice.
   */
  fare: number;
  /** Vehicle class the job was booked for, e.g. "Cargo Van". */
  vehicleTypeLabel: string;
  /** When the job was created; the design's "accepted HH:MM". */
  createdAt: string;
  inTransitAt: string | null;
  completedAt: string | null;
  /**
   * `User.name` of the driver running this job, or `null` when `Order.driverId`
   * is still unset (a company-claimed order that has not been dispatched to a
   * person yet — `Order.driverId` is nullable and set at accept or dispatch).
   *
   * Only a fleet renders it: an independent or roster driver is looking at
   * their own job and does not need to be told whose it is. It is `User.name`
   * rather than a name assembled from `DriverProfile.firstName`/`lastName`
   * because that is exactly what the Drivers screen's own **Driver** column
   * shows (`drivers.ts` reads `driver.user.name`), so the same person reads
   * character-for-character the same on both screens.
   */
  driverName: string | null;
};

/**
 * The driver's licence expiry, the one attention row on this screen with real
 * data behind it (`DriverLicence.expiresAt` is written at onboarding submit).
 */
export type HubLicenceAlert = {
  /** ISO timestamp of `DriverLicence.expiresAt`. */
  expiresAt: string;
  /**
   * Whole Tbilisi days from today until the expiry day; negative once past. Lets
   * the screen print "expires in N days" without re-deriving a day count from
   * the ISO string against a browser clock in another timezone.
   */
  daysRemaining: number;
  /** True once `expiresAt` is in the past — the screen's expired styling. */
  isExpired: boolean;
};

/** A sampled compliance row in the "Needs your attention" card. */
export type HubTodayVehicleAlert = {
  kind: "INSURANCE" | "INSPECTION";
  /** The real `Vehicle.plateNumber` the sampled facts were looked up by. */
  vehiclePlate: string;
  status: SampleComplianceStatus;
  /** Human due date from `sample.ts`, or its "not on file" fallback. */
  due: string;
};

export type HubTodayData = {
  /**
   * Which of the three account shapes is reading this screen.
   *
   * Echoed from `HubAccount.persona` rather than re-derived, because
   * `resolveHubAccount()` is the single place the derivation lives and a screen
   * that re-derives it from `kind`/`companyId` is one refactor away from
   * disagreeing with the nav and the page guards. Same role `kind` plays on
   * `HubVehiclesData`.
   */
  persona: HubPersona;
  /**
   * `SUM(driverPayout + overtimeDriverPayout)` over jobs completed in today's
   * Tbilisi day — the hero tile on this screen, and the account's **own
   * earnings**, never `SUM(price + overtimeFee)`, which is what the platform
   * billed the clients for those jobs.
   *
   * The distinction is the whole point of the tile: it is labelled as what the
   * driver earned today, and the client's total is roughly 18% larger than that.
   * See `src/lib/orders/payout.ts`, and `HubTodayCurrentJob.fare` for why no
   * `serviceLevelAdjustment` term belongs in the sum.
   */
  earnedToday: number;
  jobsCompletedToday: number;
  /** `earnedToday / jobsCompletedToday`, or 0 when nothing was completed. */
  averagePerJob: number;
  /**
   * The jobs in flight right now, newest-booked first, capped at
   * `IN_PROGRESS_JOB_PREVIEW_LIMIT`. Empty when nothing is running.
   *
   * A list rather than the single job this used to be — see
   * `ACTIVE_JOB_STATUSES` and `jobsInProgressCount` below. A fleet's row may
   * carry `driverName: null`: a company-claimed order sits with `companyId` set
   * and `driverId` still unset until it is dispatched to a person, and such an
   * order genuinely is in progress, so it is neither filtered out of this list
   * nor out of the count.
   */
  jobsInProgress: readonly HubTodayCurrentJob[];
  /**
   * How many jobs are in flight **in total**, uncapped. Equal to
   * `jobsInProgress.length` for an individual driver (who holds at most one)
   * and for a small fleet; larger than it for a fleet with more than
   * `IN_PROGRESS_JOB_PREVIEW_LIMIT` on the road. Its own `COUNT(*)`, never
   * `jobsInProgress.length`, which would silently pin a fifty-van fleet's pill
   * at the preview cap.
   */
  jobsInProgressCount: number;
  /**
   * Share of finished jobs that completed rather than cancelled, as a
   * percentage over the current Monday-anchored Tbilisi week, or `null` when no job
   * finished in that week — a rate with no denominator is not zero, and the
   * screen prints "—" for it. Same derivation, same week, as the Performance
   * screen's completion tile.
   */
  completionRatePercent: number | null;
  /** Jobs behind `completionRatePercent`; 0 means the rate is `null`. */
  completedOrCancelledCount: number;
  /**
   * The signed-in driver's licence expiry, or `null` when there is none to
   * report. **Null for a BUSINESS account by design**, for three reasons that
   * are worth stating in full because "the fleet's licences are missing" reads
   * like an oversight otherwise:
   *
   * 1. A company has no licence. `DriverLicence` hangs off `DriverProfile`, and
   *    `resolveHubAccount()`'s COMPANY branch sets `driverProfileId: null` —
   *    there is no profile row to read an expiry from, so a fleet's Today
   *    screen cannot show "your licence" because there is no "your".
   * 2. Its drivers' licences belong where they can be named. An unattributed
   *    "Driving licence expires in 8 days" on a fleet's screen is unactionable:
   *    the owner cannot tell whose, cannot call them and cannot reassign the
   *    van. The Drivers screen already carries the attributed version —
   *    `drivers.ts` exposes `HubDriverLicence` on each `HubDriver` row next to
   *    that driver's name, phone and vehicle — and a worse duplicate here would
   *    give the owner two places to look, one of them useless.
   * 3. It is not a data gap. The rows *are* derivable, which is what makes this
   *    a deliberate product decision rather than a schema limitation, and why
   *    the field is `null` rather than sampled.
   *
   * The attention card is still made fleet-wide — through its *vehicle* rows,
   * in `sampled.vehicleAlerts` below.
   */
  licenceAlert: HubLicenceAlert | null;
  /**
   * The employing company's name, for a ROSTER driver only; `null` for the
   * other two personas. Lets the screen frame the day as dispatched work rather
   * than as self-employment.
   */
  employerName: string | null;
  /**
   * How many vehicles the fleet has registered, for a BUSINESS account only;
   * `null` for the other two personas. Real — a `COUNT(*)` on `Vehicle` — which
   * is why it sits here rather than under `sampled` beside the compliance rows
   * it gives context to.
   */
  fleetVehicleCount: number | null;
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /**
     * Today's online time, e.g. "6h 12m". Needs an `OnlineSession` model.
     * **`null` for a BUSINESS account**, which has no online state at all.
     */
    onlineTimeLabel: string | null;
    glance: {
      acceptanceRatePercent: number;
      cancellationsToday: number;
      averageRating: number;
      ratedJobCount: number;
    };
    /**
     * Where demand is and what it pays extra. **`null` for a ROSTER driver**,
     * for whom neither half is actionable: an employed driver does not choose
     * where to position themselves, and would not keep the surge bonus if they
     * did. `null` rather than empty rows, so the screen drops the card instead
     * of rendering an empty table under a heading that promised one.
     */
    zoneDemand: {
      caption: string;
      rows: readonly SampleZoneDemandRow[];
    } | null;
    /**
     * Insurance and inspection rows — two per vehicle covered, or empty when
     * the account has no vehicle to hang them off; an empty card beats a row
     * about a vehicle that does not exist. For a BUSINESS account this covers
     * up to `FLEET_COMPLIANCE_VEHICLE_LIMIT` vehicles rather than the one
     * arbitrary vehicle it used to.
     *
     * **Rows are unique on `(vehiclePlate, kind)`, not on `kind`.** A renderer
     * keying them on `alert.kind` alone was correct while there was a single
     * plate and collides across plates now.
     */
    vehicleAlerts: readonly HubTodayVehicleAlert[];
    /**
     * How many **distinct vehicles** `vehicleAlerts` covers, so the screen can
     * say "covering 3 of 12 vehicles" against the real `fleetVehicleCount`
     * without counting plates itself.
     */
    vehicleAlertVehicleCount: number;
  };
};

/**
 * The one clause that scopes every `Order` query in this file to the signed-in
 * account: a fleet sees the orders it holds, a driver sees the orders assigned
 * to them.
 *
 * Repeated verbatim in `jobs.ts`, `earnings.ts` and `performance.ts` rather than
 * lifted into a shared module. Four screens, four independent server passes, and
 * a clause this small is not worth a fifth file that all four have to be read
 * alongside — but it *is* the tenancy boundary, so if you change it here, change
 * it in all four.
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

/** One decimal place, the precision the design's rate figures are shown at. */
function roundRate(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The compliance facts the "Needs your attention" card is built from: the
 * driver's licence expiry (real), the plates to attach the sampled insurance and
 * inspection rows to, and — for a fleet — how many vehicles it actually has.
 *
 * All of them come from one round trip per account kind, so the card does not
 * cost a query per row.
 */
async function loadComplianceSource(account: HubAccount): Promise<{
  licenceExpiresAt: Date | null;
  /**
   * Plates to hang the sampled compliance rows off. At most one for an
   * individual driver (their own vehicle, or the fleet vehicle assigned to
   * them); up to `FLEET_COMPLIANCE_VEHICLE_LIMIT` for a company.
   */
  vehiclePlates: readonly string[];
  /**
   * How many vehicles the fleet has, uncapped and real, or `null` for an
   * account that is not a fleet. Lets the card say how much of the fleet the
   * capped rows above actually cover instead of implying they are all of it.
   */
  fleetVehicleCount: number | null;
}> {
  if (account.kind === "BUSINESS") {
    // A company with no `companyId` cannot happen — `resolveHubAccount()`
    // always sets one for a BUSINESS — but the type permits null and the
    // failure mode of guessing would be reading another tenant's vehicles, so
    // this fails closed the same way `hubOrderScope` does.
    if (account.companyId === null) {
      return {
        licenceExpiresAt: null,
        vehiclePlates: [],
        // `null`, not `0`, for the same reason the driver branch below returns
        // it: this account is in an impossible state, not an empty one, and a
        // `0` would reach the attention card as the assertion "No vehicles
        // registered yet." The honest answer to a question that cannot be
        // asked is "not applicable".
        fleetVehicleCount: null,
      };
    }

    // Oldest first, because that is the vehicle most likely to have something
    // expiring, and because a stable order means the card does not reshuffle
    // between two renders of the same fleet. The rows themselves are still
    // per-plate placeholders and the Vehicles screen is still where the whole
    // fleet's compliance belongs — what changes is that the card now covers
    // several vehicles and says how many of the fleet that was.
    const [vehicles, fleetVehicleCount] = await Promise.all([
      prisma.vehicle.findMany({
        where: { companyId: account.companyId },
        select: { plateNumber: true },
        orderBy: { createdAt: "asc" },
        take: FLEET_COMPLIANCE_VEHICLE_LIMIT,
      }),
      prisma.vehicle.count({ where: { companyId: account.companyId } }),
    ]);

    return {
      // A company holds no licence of its own — see `HubTodayData.licenceAlert`.
      licenceExpiresAt: null,
      vehiclePlates: vehicles.map((vehicle) => vehicle.plateNumber),
      fleetVehicleCount,
    };
  }

  // A driver mid-onboarding may have no profile row yet, in which case there is
  // nothing to report and no query worth running.
  if (account.driverProfileId === null) {
    return {
      licenceExpiresAt: null,
      vehiclePlates: [],
      fleetVehicleCount: null,
    };
  }

  // Own vehicles first, then the fleet vehicle currently assigned to them —
  // the same two-place lookup `resolveHubAccount` does for the header subline,
  // and for the same reason: the two kinds of driver hold vehicles differently.
  const driverProfile = await prisma.driverProfile.findUnique({
    where: { id: account.driverProfileId },
    select: {
      licence: { select: { expiresAt: true } },
      vehicles: {
        select: { plateNumber: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      assignments: {
        where: { unassignedAt: null },
        select: { vehicle: { select: { plateNumber: true } } },
        orderBy: { assignedAt: "desc" },
        take: 1,
      },
    },
  });

  // `noUncheckedIndexedAccess` — both lists are `take: 1` and may be empty.
  const plate =
    driverProfile?.vehicles[0]?.plateNumber ??
    driverProfile?.assignments[0]?.vehicle.plateNumber ??
    null;

  return {
    licenceExpiresAt: driverProfile?.licence?.expiresAt ?? null,
    // A driver has one vehicle in play at a time, so this list is 0 or 1 long.
    // It is a list anyway so the caller has one shape to map over rather than a
    // branch per account kind.
    vehiclePlates: plate === null ? [] : [plate],
    // Not a fleet: there is no fleet size to report, and 0 would read as an
    // empty fleet rather than as "this question does not apply".
    fleetVehicleCount: null,
  };
}

/**
 * The sampled insurance and inspection rows for each real plate — two rows per
 * plate, in that order, so a card rendering them in sequence groups a vehicle's
 * two documents together.
 *
 * Rows are unique on `(vehiclePlate, kind)` rather than on `kind`: a renderer
 * that keys them on the kind alone was correct while a single plate came
 * through here and collides now that a fleet contributes several.
 *
 * The empty case needs no guard — an empty plate list flat-maps to an empty row
 * list, which is exactly the "no vehicle to hang rows off" outcome.
 */
function vehicleAlertsFor(
  plateNumbers: readonly string[],
): readonly HubTodayVehicleAlert[] {
  // The explicit callback return type is what keeps the literals below
  // assignable to the union members instead of widening to `string`.
  return plateNumbers.flatMap((plateNumber): HubTodayVehicleAlert[] => {
    const facts = sampleVehicleFacts(plateNumber);

    return [
      {
        kind: "INSURANCE",
        vehiclePlate: plateNumber,
        status: facts.insuranceStatus,
        due: facts.insuranceDue,
      },
      {
        // `Vehicle` stores no inspection state at all, so unlike insurance
        // there is not even a sampled status to report — "Pending" is the
        // honest reading of "nothing has been recorded".
        kind: "INSPECTION",
        vehiclePlate: plateNumber,
        status: "Pending",
        due: facts.inspectionDue,
      },
    ];
  });
}

/**
 * Fetches and shapes every figure the Today screen shows, for all three
 * personas. `hubOrderScope()` resolves the *scope* difference between them and
 * the returned `persona` lets the screen resolve the *shape* difference.
 *
 * Total by design — there is no `null` return. Unlike
 * `getDriverDashboardData()`, the account was already resolved (and its missing
 * -profile case already handled) by `resolveHubAccount()` in the hub layout, so
 * by the time this runs there is always something to render, even if that is a
 * screen of zeroes for a driver who has not started yet.
 */
export async function getHubToday(account: HubAccount): Promise<HubTodayData> {
  const scope = hubOrderScope(account);

  // Every boundary is derived from one `now`, so all four cards refer to the
  // same instant even if the queries straddle midnight.
  const now = new Date();
  const startOfToday = startOfHubDay(now);
  const completionWindowStart = startOfHubWeek(now);
  const completionWindowEnd = startOfHubDayPlus(
    completionWindowStart,
    COMPLETION_WINDOW_DAYS,
  );

  const [
    earnedTodayAgg,
    inProgressOrders,
    jobsInProgressCount,
    terminalCounts,
    compliance,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: {
        ...scope,
        status: OrderStatus.COMPLETED,
        completedAt: { gte: startOfToday },
      },
      // The two **payout** columns, never `price` and `overtimeFee`. Those
      // are the client's money; this tile answers "what did I earn today",
      // and asking the database for the client's figures at all is how a
      // later edit ends up rendering one. See `HubTodayData.earnedToday`.
      _sum: { driverPayout: true, overtimeDriverPayout: true },
      _count: true,
    }),

    // A fleet can legitimately have several jobs in flight at once, unlike a
    // single driver, so this is a capped preview rather than the one arbitrary
    // job it used to be — `IN_PROGRESS_JOB_PREVIEW_LIMIT` explains the number,
    // and the uncapped total is counted separately below so the screen's pill
    // is never the cap wearing a count's clothes. Newest-booked first, which is
    // the order the design's own live list uses.
    prisma.order.findMany({
      where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
      select: {
        id: true,
        status: true,
        pickupAddress: true,
        dropoffAddress: true,
        distanceKm: true,
        // Same rule as the aggregate above: the carrier's two payout columns,
        // never the client's `price`/`overtimeFee`.
        driverPayout: true,
        overtimeDriverPayout: true,
        createdAt: true,
        inTransitAt: true,
        completedAt: true,
        vehicleTypeSpec: { select: { label: true } },
        // Nullable relation: `Order.driverId` is set at accept or dispatch, so
        // an order a company has claimed but not yet handed to a person has
        // none. Selecting only `name` keeps the driver's email and phone off a
        // payload that crosses into a client component.
        driver: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: IN_PROGRESS_JOB_PREVIEW_LIMIT,
    }),

    // Uncapped, and the number the fleet's "N jobs in progress" pill prints.
    // Deriving it from the list above would cap it at the preview limit, which
    // is precisely the arbitrariness this change exists to remove. Filters on
    // `status` plus the scope's `driverId`/`companyId`, which is the shape
    // `@@index([status, driverId, companyId])` on `Order` was added for.
    prisma.order.count({
      where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
    }),

    // Keyed on `createdAt`, not `completedAt`: `Order` has no `cancelledAt`,
    // so a cancellation cannot be dated by when it happened and the only
    // timestamp both outcomes share is when the job was booked. The rate is
    // therefore "of the jobs taken on this week that have since finished,
    // what share completed" — stated here because a reader would otherwise
    // assume it matched the completion-dated figures above. `performance.ts`
    // derives its completion tile the same way, over the same week.
    prisma.order.groupBy({
      by: ["status"],
      where: {
        ...scope,
        status: { in: TERMINAL_JOB_STATUSES },
        createdAt: { gte: completionWindowStart, lt: completionWindowEnd },
      },
      _count: { _all: true },
    }),

    loadComplianceSource(account),
  ]);

  // Rounded rather than passed through `totalDriverEarnings`: these are aggregate
  // sums over many orders, not one order's two columns, and that helper takes an
  // order shape by design so a caller cannot transpose its arguments. Same
  // arithmetic either way — `Float` sums carry binary-fraction dust and money
  // crossing this boundary is snapped to the tetri it will be printed at.
  //
  // Both `?? 0`s are the empty-day case: Prisma returns `null` for a sum over no
  // rows, which is not zero earnings but it is what the tile prints for one.
  const earnedToday = roundCurrency(
    (earnedTodayAgg._sum.driverPayout ?? 0) +
      (earnedTodayAgg._sum.overtimeDriverPayout ?? 0),
  );
  const jobsCompletedToday = earnedTodayAgg._count;

  let completedCount = 0;
  let cancelledCount = 0;
  for (const bucket of terminalCounts) {
    if (bucket.status === OrderStatus.COMPLETED) {
      completedCount += bucket._count._all;
    } else {
      cancelledCount += bucket._count._all;
    }
  }
  const completedOrCancelledCount = completedCount + cancelledCount;

  const jobsInProgress: readonly HubTodayCurrentJob[] = inProgressOrders.map(
    (order) => ({
      id: order.id,
      // The `where` above admits only these two, but Prisma types `status` as
      // the whole enum; narrowing here is what lets the client type be the
      // honest two-member union.
      status:
        order.status === OrderStatus.IN_TRANSIT ? "IN_TRANSIT" : "ACCEPTED",
      stops: [
        {
          kind: "PICKUP",
          address: order.pickupAddress,
          at: order.inTransitAt?.toISOString() ?? null,
        },
        {
          kind: "DROPOFF",
          address: order.dropoffAddress,
          at: order.completedAt?.toISOString() ?? null,
        },
      ],
      distanceKm: order.distanceKm,
      // One order's two payout columns, so this one *does* go through the
      // shared helper — `src/lib/orders/payout.ts` is the single definition of
      // what a job pays its carrier.
      fare: totalDriverEarnings(order),
      vehicleTypeLabel: order.vehicleTypeSpec.label,
      createdAt: order.createdAt.toISOString(),
      inTransitAt: order.inTransitAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
      // Null for a company-claimed order not yet dispatched to a person; the
      // row stays in the list either way, because an in-flight job with nobody
      // on it is exactly what a fleet owner needs to see.
      driverName: order.driver?.name ?? null,
    }),
  );

  const licenceAlert: HubLicenceAlert | null =
    compliance.licenceExpiresAt === null
      ? null
      : {
          expiresAt: compliance.licenceExpiresAt.toISOString(),
          // Day-to-day rather than instant-to-instant: a licence expiring later
          // today should read "expires in 0 days", not round up to one. Counted
          // in whole Tbilisi calendar days rather than by dividing a millisecond
          // gap, so the answer stays right if the zone ever gains a 23-hour day.
          daysRemaining: differenceInHubDays(now, compliance.licenceExpiresAt),
          // Compared at full precision, so a licence that lapsed earlier today
          // reads as expired even while `daysRemaining` is still 0.
          isExpired: compliance.licenceExpiresAt.getTime() <= now.getTime(),
        };

  // Read once so the branches below are obviously keyed on the same fact, and
  // never re-derived from `kind`/`companyId` — `resolveHubAccount()` owns that
  // derivation and a second copy of it is one refactor away from disagreeing
  // with the nav and the page guards.
  const { persona } = account;
  const isRoster = persona === "ROSTER";
  const isBusiness = persona === "BUSINESS";

  return {
    persona,
    // Unchanged for every persona, including ROSTER. Suppressing this figure
    // for an employed driver — whose fares are paid to their employer, which is
    // why the Wallet is hidden from them — was raised during spec-writing,
    // argued and deliberately settled in favour of leaving it alone. It is an
    // accepted, known inconsistency rather than an oversight; do not add a
    // persona branch here without reopening that decision.
    earnedToday,
    jobsCompletedToday,
    averagePerJob:
      jobsCompletedToday === 0
        ? 0
        : roundCurrency(earnedToday / jobsCompletedToday),
    jobsInProgress,
    jobsInProgressCount,
    completionRatePercent:
      completedOrCancelledCount === 0
        ? null
        : roundRate((completedCount / completedOrCancelledCount) * 100),
    completedOrCancelledCount,
    licenceAlert,
    // `HubAccount.companyName` is the employer's name for a driver and the
    // company's *own* name for a COMPANY session, which is why this is gated on
    // the persona rather than on `companyName !== null`.
    employerName: isRoster ? account.companyName : null,
    fleetVehicleCount: compliance.fleetVehicleCount,
    sampled: {
      // A company has no online state to report even in sampled form:
      // `resolveHubAccount()` sets `isOnline: null` and `canToggleOnline: false`
      // for a COMPANY session because a fleet has no toggle at all, and
      // `PATCH /api/driver-profile/status` rejects a COMPANY session outright.
      // A fleet-wide "6h 12m online" would therefore be a fabricated aggregate
      // of a quantity that does not exist for this account even in principle,
      // which is a step beyond the sampled figures elsewhere on this screen —
      // those stand in for something the schema cannot yet compute, not for
      // something that has no meaning.
      onlineTimeLabel: isBusiness ? null : SAMPLE_ONLINE_TIME_TODAY_LABEL,
      glance: {
        acceptanceRatePercent: SAMPLE_ACCEPTANCE_RATE_PERCENT,
        cancellationsToday: SAMPLE_CANCELLATIONS_TODAY,
        averageRating: SAMPLE_AVG_RATING,
        ratedJobCount: SAMPLE_RATED_JOB_COUNT,
      },
      // Suppressed for a salaried employee: they neither choose where to
      // position themselves — their employer's dispatch does — nor would keep
      // the surge bonus if they did, because the fare on their jobs is paid to
      // their employer. Where a sampled card is meaningless for a persona this
      // feature hides it rather than making it real.
      zoneDemand: isRoster
        ? null
        : {
            caption: SAMPLE_ZONE_DEMAND_CAPTION,
            rows: SAMPLE_ZONE_DEMAND,
          },
      vehicleAlerts: vehicleAlertsFor(compliance.vehiclePlates),
      vehicleAlertVehicleCount: compliance.vehiclePlates.length,
    },
  };
}
