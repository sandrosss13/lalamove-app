/**
 * Everything the Driver Hub's **header** renders, fetched and shaped in one
 * server pass.
 *
 * The header is the shell, not a screen: it sits above all seven hub pages and
 * shows the same three things on every one of them — the active-job pill, the
 * notification bell, and which persona is signed in. Those come from here so
 * that the shell resolves them once per request rather than each page resolving
 * them again on the way to its own data, which is the same reason
 * `resolveHubAccount()` exists one level up.
 *
 * ## Real vs sample
 *
 * The same rule the sibling loaders follow: everything at the top level of
 * `HubHeaderData` is derived from `Order` and is true, and everything under
 * `sampled` comes from `@/lib/dashboard/hub/sample` and must be rendered with a
 * `<SampleNote />` beside it. The split is a nesting level rather than a naming
 * convention on purpose — a screen cannot read a fictional value without typing
 * the word `sampled` on the way to it.
 *
 * Only the notification surface is sampled here, and it is sampled whole: the
 * schema has no `Notification` model, so there is nothing to count and nothing
 * to list. The job pill is entirely real, including its ETA — see
 * `HubHeaderJob.eta`, which is honest about being a delivery deadline counted
 * down rather than a live routing estimate.
 *
 * ## Relationship to `today.ts`
 *
 * The pill's jobs are very nearly `HubTodayData.jobsInProgress`, and the query
 * behind them is deliberately a *duplicate* rather than an import: the two
 * surfaces select different columns for different reasons (the header needs a
 * reference and a deadline, Today needs stops, fares and a vehicle class), and
 * the hub loaders already duplicate `hubOrderScope()` five times over on the
 * same reasoning. What must not diverge is the *definition* of "in progress" —
 * `ACTIVE_JOB_STATUSES` and the ordering below — because a pill saying "3 jobs
 * in progress" over a Today screen listing two is a bug a user reports. If you
 * change either here, change it in `today.ts`, `jobs.ts`, `earnings.ts` and
 * `performance.ts` too.
 *
 * Server-only: it talks to Prisma directly. The object it returns is handed
 * from a server component into a `"use client"` tree, so every value in it is
 * plain serialisable data — no `Date`, no Prisma model instance.
 */
import "server-only";

import { OrderStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
import { SAMPLE_HEADER_NOTIFICATIONS } from "@/lib/dashboard/hub/sample";
import { prisma } from "@/lib/prisma";

/**
 * Statuses that mean a job is running right now — the pill's whole definition
 * of "in progress".
 *
 * Verbatim from `today.ts`, and it must stay verbatim: the header pill sits
 * directly above the Today screen's own in-progress list, so the two counting
 * different sets of orders is visible on one page. If you change it here,
 * change it there.
 */
const ACTIVE_JOB_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT];

/**
 * A company id no cuid can ever equal, used only to make a missing
 * `HubAccount.companyId` fail closed. See `hubOrderScope` below.
 */
const UNMATCHABLE_COMPANY_ID = "__hub-account-has-no-company__";

/**
 * How many in-flight jobs the pill's dropdown lists for a fleet.
 *
 * Three is the design's own figure — the handoff's fleet pill lists three live
 * jobs and then links out with "View all jobs in progress" (`UI:UX/Registered
 * Driver account (New)/Driver dashboard header alignment/Driver Header.dc.html`,
 * `liveJobs: jobs.slice(0, 3)`) — and it is the same cap `today.ts` applies to
 * its own preview, so the pill and the card beneath it never show a different
 * number of rows for the same fleet.
 */
const FLEET_JOB_PREVIEW_LIMIT = 3;

/**
 * How many the dropdown lists for a single driver: one, because the design
 * gives that persona a singular pill ("Job in progress · TB4821") rather than a
 * count, and because an individual driver holds at most one job in flight
 * anyway — the same assumption `driver-dashboard-data.ts` makes for its
 * `activeOrderId`.
 *
 * It is still a `take` on the query rather than an assumption about the data:
 * `Order.driverId` is written by the accept and dispatch routes and nothing in
 * the schema enforces the "at most one" rule, so a driver holding two would
 * otherwise widen the dropdown instead of being counted honestly by
 * `jobsInProgressCount` and previewed by one row.
 */
const SINGLE_DRIVER_JOB_PREVIEW_LIMIT = 1;

/** The design's separator between the two halves of the job sub-line. */
const WHO_SEPARATOR = " · ";

/**
 * The separator between the two ends of a route. The same arrow
 * `formatStopRoute()` renders on the Today screen, so a job reads identically
 * in the pill and in the card below it.
 */
const ROUTE_SEPARATOR = " → ";

/**
 * What stands in for a driver's name on a company-claimed order that has not
 * been dispatched to a person yet. Matches the Today screen's current-job card,
 * which prints exactly this for the same `null`.
 */
const UNASSIGNED_DRIVER_LABEL = "Unassigned";

/** Printed instead of a countdown once the delivery deadline has passed. */
const OVERDUE_ETA_LABEL = "Overdue";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** One job in flight, as the header pill's dropdown lists it. */
export type HubHeaderJob = {
  /** `Order.id` — the key for the row and for the link it opens. */
  id: string;
  /**
   * `Order.reference`, the human-readable "GE-48210" the load board shows and
   * support reads down the phone. It stands where the design's invented
   * "TB4821" codes stand.
   *
   * Deliberately the real column rather than `jobs.ts`'s
   * `order.id.slice(-6).toUpperCase()`: that derivation predates
   * `Order.reference`, which was added with the load board, and it is neither
   * unique by construction nor a string anybody can dictate aloud. Migrating
   * the Jobs screen onto the same column is worth doing, but it is not this
   * file's change to make.
   */
  shortId: string;
  /**
   * "<pickup> → <dropoff>", from the two free-text address columns.
   *
   * The design's "Vake → Saburtalo" is a *district* pair and this schema cannot
   * produce one. `Order.pickupCity`/`dropoffCity` are the 63-value
   * `GeorgianCity` enum, which stops at TBILISI and holds no districts, so
   * building the route from them would render "Tbilisi → Tbilisi" for exactly
   * the intra-city job the design illustrates. The addresses are longer than
   * the mock but they are true; the dropdown truncates them with CSS, the way
   * the Today card already truncates the identical string.
   */
  route: string;
  /**
   * The design's `job.who` sub-line: "<driver name> · <reference>" for a fleet,
   * and `null` for an independent or roster driver, who is looking at their own
   * job and does not need to be told whose it is. Same reasoning, same
   * persona-gating, as `HubTodayCurrentJob.driverName`.
   *
   * A fleet's row falls back to "Unassigned" for the name: `Order.driverId` is
   * nullable and stays unset between a company claiming an order and
   * dispatching it to a person, and that row is precisely the one a dispatcher
   * most needs to see rather than one we quietly hid.
   */
  who: string | null;
  /**
   * How long until the load is due, e.g. "18 min" or "1 h 05", or "Overdue"
   * once the moment has passed. `null` when the order names no deadline.
   *
   * **Real, and worth being precise about what it is.** It counts down
   * `Order.deliveryDeadline` — "the time it must arrive by", agreed with the
   * client at booking — and not a live routing estimate, which this schema has
   * no source for: `DriverProfile.currentLat`/`currentLng` give a position but
   * nothing gives a route or a traffic model. The two answer the same
   * dispatcher's question ("is this one going to be late?") and the honest one
   * is available, so it is used rather than a fabricated minute count badged as
   * sampled.
   *
   * `null` is common and not a fault: the column is nullable because every
   * order placed before the load board existed has no deadline to backfill
   * from. The dropdown shows no time for those rows, the same way the Today
   * card shows an undelivered stop as pending rather than inventing an arrival.
   *
   * Computed against the server's clock at render, like
   * `HubLicenceAlert.daysRemaining`, so it is accurate to the moment the page
   * was built and does not tick. A pill that must tick needs the deadline
   * itself, and that is a field to add when a consumer actually wants it.
   */
  eta: string | null;
};

/** One row of the header bell's dropdown. */
export type HubHeaderNotification = {
  /** Stable key for the row; see `SampleHeaderNotification.id`. */
  id: string;
  /** The bold first line, e.g. "New job offer · Vake → Saburtalo". */
  title: string;
  /** The muted second line, e.g. "2 minutes ago". */
  timeLabel: string;
};

export type HubHeaderData = {
  /**
   * Which of the three account shapes is reading the header.
   *
   * Echoed from `HubAccount.persona` rather than re-derived, so the header can
   * branch between the fleet's "N jobs in progress" pill and the single
   * driver's "Job in progress · GE-48210" without reaching back into
   * `kind`/`companyId`. `resolveHubAccount()` owns that derivation and a second
   * copy of it is one refactor away from disagreeing with the nav and the page
   * guards. Same role it plays on `HubTodayData`.
   */
  persona: HubPersona;
  /**
   * How many jobs are in flight **in total**, uncapped — the number the fleet's
   * pill prints. Its own `COUNT(*)`, never `jobsInProgress.length`, which would
   * silently pin a fifty-van fleet's pill at the preview cap.
   */
  jobsInProgressCount: number;
  /**
   * The jobs in flight, newest-booked first, capped at
   * `FLEET_JOB_PREVIEW_LIMIT` for a fleet and at
   * `SINGLE_DRIVER_JOB_PREVIEW_LIMIT` otherwise. Empty when nothing is running,
   * which is the header's cue to drop the pill entirely (`showActiveJob` in the
   * design) rather than render an empty dropdown.
   */
  jobsInProgress: readonly HubHeaderJob[];
  /** Everything below this line is fictional — badge it. */
  sampled: {
    /**
     * The number over the bell. Equal to `notifications.length` by
     * construction, because two fictional rows and a separately stated count
     * could only ever disagree with each other. A real unread count would be a
     * filtered `COUNT(*)` and would legitimately exceed the previewed rows;
     * that difference arrives with the model, not before it.
     */
    notificationCount: number;
    /** The bell's dropdown rows, newest first. */
    notifications: readonly HubHeaderNotification[];
  };
};

/**
 * The one clause that scopes every `Order` query in this file to the signed-in
 * account: a fleet sees the orders it holds, a driver sees the orders assigned
 * to them.
 *
 * Repeated verbatim in `today.ts`, `jobs.ts`, `earnings.ts` and
 * `performance.ts` rather than lifted into a shared module. Five loaders, five
 * independent server passes, and a clause this small is not worth a sixth file
 * that all five have to be read alongside — but it *is* the tenancy boundary,
 * so if you change it here, change it in all five.
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
 * Renders the gap between now and a delivery deadline the way the design's ETA
 * column reads: "18 min" under the hour, "1 h 05" over it.
 *
 * The over-an-hour form pads its minutes to two digits because the design's own
 * example does ("1 h 05", not "1 h 5"), and because the column is set in the
 * mono face where ragged widths are what that face exists to avoid.
 */
function formatEta(deadline: Date | null, now: Date): string | null {
  if (deadline === null) {
    return null;
  }

  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs < 0) {
    // A job still in flight past its deadline is the row a dispatcher most
    // needs to see, so it is named rather than blanked — a null here would read
    // as "no deadline agreed", which is a different and much calmer fact.
    return OVERDUE_ETA_LABEL;
  }

  // Floored, not rounded: a load due in 59 seconds has not got a minute left,
  // and rounding it up to "1 min" would be the one direction that reassures.
  const remainingMinutes = Math.floor(remainingMs / MS_PER_MINUTE);
  if (remainingMinutes < MINUTES_PER_HOUR) {
    return `${remainingMinutes} min`;
  }

  const hours = Math.floor(remainingMinutes / MINUTES_PER_HOUR);
  const minutes = remainingMinutes % MINUTES_PER_HOUR;

  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

/**
 * Fetches and shapes everything the hub header renders, for all three personas.
 * `hubOrderScope()` resolves the *scope* difference between them and the
 * returned `persona` lets the header resolve the *shape* difference.
 *
 * Total by design — there is no `null` return. The account was already resolved
 * (and its missing-profile case already handled) by `resolveHubAccount()` in
 * the hub layout, so by the time this runs there is always a header to draw,
 * even if that is one with no pill and nothing behind the bell.
 *
 * **The `sampled` half retires with a `Notification` model.** That model —
 * rows owned by a user, each with a title, a created-at and a read-at — is the
 * single schema change that turns `sampled.notifications` into a scoped
 * `findMany` and `sampled.notificationCount` into a `count` of the unread ones,
 * at which point both move to the top level of `HubHeaderData` and
 * `SAMPLE_HEADER_NOTIFICATIONS` is deleted.
 */
export async function getHubHeader(
  account: HubAccount,
): Promise<HubHeaderData> {
  const scope = hubOrderScope(account);

  // Read once so the branches below are obviously keyed on the same fact, and
  // never re-derived from `kind`/`companyId` — `resolveHubAccount()` owns that
  // derivation. See `HubHeaderData.persona`.
  const { persona } = account;
  const isBusiness = persona === "BUSINESS";

  // One `now` for the whole pass, so every row's countdown is measured from the
  // same instant even though the query returns them one after another.
  const now = new Date();

  const [inProgressOrders, jobsInProgressCount] = await Promise.all([
    // Newest-booked first, which is the order the design's own live list uses
    // and the order `today.ts` returns the same jobs in — the pill and the card
    // below it would otherwise disagree about which three of a fleet's dozen
    // jobs are worth previewing.
    prisma.order.findMany({
      where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
      select: {
        id: true,
        reference: true,
        pickupAddress: true,
        dropoffAddress: true,
        deliveryDeadline: true,
        // Nullable relation: `Order.driverId` is set at accept or dispatch, so
        // an order a company has claimed but not yet handed to a person has
        // none. Selecting only `name` keeps the driver's email and phone off a
        // payload that crosses into a client component.
        driver: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: isBusiness
        ? FLEET_JOB_PREVIEW_LIMIT
        : SINGLE_DRIVER_JOB_PREVIEW_LIMIT,
    }),

    // Uncapped, and the number the fleet's "N jobs in progress" pill prints.
    // Deriving it from the list above would cap it at the preview limit, which
    // for a single driver would also be indistinguishable from the truth and so
    // would hide the bug until a fleet hit it. Filters on `status` plus the
    // scope's `driverId`/`companyId`, which is the shape
    // `@@index([status, driverId, companyId])` on `Order` was added for.
    prisma.order.count({
      where: { ...scope, status: { in: ACTIVE_JOB_STATUSES } },
    }),
  ]);

  const jobsInProgress: readonly HubHeaderJob[] = inProgressOrders.map(
    (order) => ({
      id: order.id,
      shortId: order.reference,
      route: `${order.pickupAddress}${ROUTE_SEPARATOR}${order.dropoffAddress}`,
      // Only a fleet is told whose job this is — see `HubHeaderJob.who`.
      who: isBusiness
        ? `${order.driver?.name ?? UNASSIGNED_DRIVER_LABEL}${WHO_SEPARATOR}${order.reference}`
        : null,
      eta: formatEta(order.deliveryDeadline, now),
    }),
  );

  return {
    persona,
    jobsInProgressCount,
    jobsInProgress,
    sampled: {
      // Length rather than a stated constant — see the field's own comment.
      notificationCount: SAMPLE_HEADER_NOTIFICATIONS.length,
      // Mapped field by field rather than passed through, so that
      // `HubHeaderNotification` is this module's own contract with the header
      // and survives `SampleHeaderNotification` being deleted along with the
      // rest of the sampled surface.
      notifications: SAMPLE_HEADER_NOTIFICATIONS.map((notification) => ({
        id: notification.id,
        title: notification.title,
        timeLabel: notification.timeLabel,
      })),
    },
  };
}
