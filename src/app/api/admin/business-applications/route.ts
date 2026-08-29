import { NextResponse } from "next/server";

import type {
  AdminRole,
  BusinessApplicationStatus,
  CompanyReviewStatus,
  Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Staff who may work the business-application review queue. Stated per route
 * rather than imported from one shared constant so the gate on each endpoint
 * can be read — and audited — without following an import: a `route.ts` is a
 * Next.js entry point, and the first thing a reviewer of one should be able to
 * see is who is allowed through it.
 *
 * The same two roles as the driver-application queue, and narrower than the
 * clients/sellers listings which also admit `SUPPORT`: those are lookup screens
 * for answering a ticket, whereas a business application carries a company's VAT
 * id, registered address and payout account, and exists only to be verified or
 * flagged. Read access here is therefore scoped to the same two roles that hold
 * the review actions.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

/**
 * The statuses a reviewer can ever see. `DRAFT` is deliberately absent: an
 * unsubmitted application is a half-entered wizard draft — unvalidated company
 * data the company has not chosen to submit — so it must not appear in the queue
 * with or without a `?status=` filter.
 */
export type AdminBusinessApplicationStatus = Exclude<
  BusinessApplicationStatus,
  "DRAFT"
>;

/**
 * The same three values as a runtime list, for validating `?status=`. Typed
 * against the `Exclude` above so adding a status to the Prisma enum without
 * deciding whether reviewers should see it is a type error here, not a silently
 * missing filter option.
 */
const REVIEWABLE_STATUSES: readonly AdminBusinessApplicationStatus[] = [
  "PENDING",
  "ACTION_REQUIRED",
  "APPROVED",
];

/**
 * One application as the review queue's table renders it. Dates are ISO strings
 * because this crosses the wire; the page imports this type (type-only, so
 * nothing of this server module — no Prisma, no Better Auth — reaches the
 * browser bundle) rather than restating the shape, which is what keeps the two
 * from drifting.
 */
export type AdminBusinessApplicationRow = {
  /** `BusinessApplication.id` — the id the detail endpoint takes. */
  applicationId: string;
  /** The short human-readable code, e.g. "BIZ-40219". Rendered mono. */
  reference: string;
  companyName: string;
  /**
   * `LogisticsCompany.city` — the registered/primary city, as the raw
   * `GeorgianCity` enum value (e.g. "TBILISI"). The page maps it to a label
   * through `GEORGIAN_CITY_OPTIONS`.
   */
  primaryCity: string;
  /**
   * How many *other* cities of operation the company declared, i.e.
   * `citiesOfOperation` minus the primary city. The design's City column reads
   * "Tbilisi +2"; this is the `2`. Zero renders as a bare city name.
   */
  otherCitiesCount: number;
  /** `BusinessApplicationVehicle` rows on this application. */
  fleetSize: number;
  /**
   * Vehicles with a driver currently assigned, out of `fleetSize` — the
   * design's `5/7`. Counted from open `DriverVehicleAssignment` rows, which is
   * the only place a company vehicle's driver lives (a company-owned `Vehicle`
   * physically cannot carry a `driverProfileId`).
   */
  driversAssignedCount: number;
  status: AdminBusinessApplicationStatus;
  /** Shown as a second chip so the queue distinguishes "company still
   *  unverified" from "vehicles still pending". */
  companyReviewStatus: CompanyReviewStatus;
  /** `lastSubmittedAt` — when this application last landed in the queue. */
  submittedAt: string;
};

/**
 * Body of `GET /api/admin/business-applications`. Imported type-only by the
 * queue page for the same reason as the row type above.
 */
export type AdminBusinessApplicationListResponse = {
  items: AdminBusinessApplicationRow[];
  /** The page actually returned (1-based). */
  page: number;
  pageSize: number;
  /** Matching applications across every page, for the "N applications" summary. */
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
};

/**
 * `?page=` → a 1-based page number. Anything absent, unparseable or below 1
 * falls back to the first page rather than erroring: a malformed page number in
 * a URL is not worth failing a read-only listing over.
 */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * `?status=` → one reviewable status, or null for "all of them". An
 * unrecognised value — including `DRAFT`, which is not reviewable — is treated
 * as absent for the same reason a bad `?page=` is: a filter chip that has
 * drifted out of sync with this enum should show the unfiltered queue, not a
 * 400 the reviewer cannot act on.
 */
function parseStatusFilter(
  raw: string | null,
): AdminBusinessApplicationStatus | null {
  return REVIEWABLE_STATUSES.find((status) => status === raw) ?? null;
}

/**
 * The `where` clause. `not: "DRAFT"` is stated unconditionally rather than
 * relying on the filter to imply it, so the exclusion holds no matter what
 * `?status=` says — that is the invariant this queue depends on, and Prisma
 * ANDs the two conditions of a single enum filter together.
 */
function buildWhere(
  statusFilter: AdminBusinessApplicationStatus | null,
): Prisma.BusinessApplicationWhereInput {
  return {
    status: {
      not: "DRAFT",
      ...(statusFilter ? { equals: statusFilter } : {}),
    },
  };
}

/**
 * GET /api/admin/business-applications?status=&page= — the paginated review
 * queue behind `/admin/business/applications`.
 *
 * Read-only. Verifying or flagging a company, recording a per-vehicle verdict
 * and activating a fleet all happen through the separate mutation endpoints,
 * which apply their own (identical) role gate.
 *
 * Everything a row shows is pulled in one query with an explicit `select`: the
 * company's name and cities, and — per application vehicle — nothing but whether
 * an open `DriverVehicleAssignment` exists, since the row needs the `5/7` count
 * and not a single driver's name. That keeps the listing at two queries
 * regardless of page size, rather than a per-row assignment count.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const statusFilter = parseStatusFilter(url.searchParams.get("status"));
  const where = buildWhere(statusFilter);

  const [total, applications] = await Promise.all([
    prisma.businessApplication.count({ where }),
    prisma.businessApplication.findMany({
      where,
      // Explicit select rather than `include`: the row needs three columns off
      // `LogisticsCompany` and one boolean-in-effect per vehicle, and there is
      // no reason for a listing to carry whole company, vehicle and assignment
      // rows per application.
      select: {
        id: true,
        reference: true,
        status: true,
        companyReviewStatus: true,
        lastSubmittedAt: true,
        createdAt: true,
        company: {
          select: { companyName: true, city: true, citiesOfOperation: true },
        },
        vehicles: {
          select: {
            // Only whether a driver holds it — the row needs a count, not a
            // name. `vehicle` is nullable (`vehicleId` is `SetNull`), so a
            // review row whose vehicle was removed simply counts as unassigned.
            vehicle: {
              select: {
                assignments: {
                  where: { unassignedAt: null },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
      orderBy: [
        // Newest submission first — the reviewer works the queue from the top.
        // `nulls: "last"` because Postgres sorts NULLs first on DESC, which
        // would otherwise float a row with no submission timestamp (only
        // reachable through data corruption) above every real application.
        { lastSubmittedAt: { sort: "desc", nulls: "last" } },
        // Deterministic tiebreak, so two applications submitted in the same
        // instant cannot swap places between two page requests and cause a row
        // to be shown twice or skipped entirely.
        { id: "desc" },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const items: AdminBusinessApplicationRow[] = applications.flatMap(
    (application) => {
      // `where` already excludes DRAFT; re-checking here is what narrows
      // Prisma's four-value enum to this response's three-value union without a
      // cast. The branch is unreachable in practice.
      if (application.status === "DRAFT") {
        return [];
      }

      const { company } = application;

      return [
        {
          applicationId: application.id,
          reference: application.reference,
          companyName: company.companyName,
          primaryCity: company.city,
          // Subtracts the primary city because step 1 lets a company tick its
          // own registered city in the cities-of-operation list, and "Tbilisi
          // +3" when only three cities were chosen would read as four.
          // Filtering rather than `length - 1` also handles the company that did
          // *not* tick its own city.
          otherCitiesCount: company.citiesOfOperation.filter(
            (city) => city !== company.city,
          ).length,
          fleetSize: application.vehicles.length,
          driversAssignedCount: application.vehicles.filter(
            (entry) => (entry.vehicle?.assignments.length ?? 0) > 0,
          ).length,
          status: application.status,
          companyReviewStatus: application.companyReviewStatus,
          // A submitted application always has `lastSubmittedAt`; `createdAt`
          // is a defensive fallback so one corrupt row cannot break the type
          // contract for the whole page.
          submittedAt: (
            application.lastSubmittedAt ?? application.createdAt
          ).toISOString(),
        },
      ];
    },
  );

  const body: AdminBusinessApplicationListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };

  return NextResponse.json(body, { status: 200 });
}
