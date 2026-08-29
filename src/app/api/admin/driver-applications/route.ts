import { NextResponse } from "next/server";

import type {
  AdminRole,
  ChassisType,
  DriverApplicationStatus,
  Prisma,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";

/**
 * Staff who may work the driver-application review queue. Stated per route
 * rather than imported from one shared constant so the gate on each endpoint
 * can be read — and audited — without following an import.
 *
 * Narrower than the clients/sellers listings, which also admit `SUPPORT`: those
 * are lookup screens for answering a ticket, whereas an application carries a
 * driver's ID number, date of birth and identity documents, and exists only to
 * be approved or rejected. Read access here is therefore scoped to the same two
 * roles that hold the review actions.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

/**
 * The statuses a reviewer can ever see. `DRAFT` is deliberately absent: an
 * unsubmitted application has never been validated and is not reviewable, so it
 * must not appear in the queue with or without a `?status=` filter.
 */
export type AdminDriverApplicationStatus = Exclude<
  DriverApplicationStatus,
  "DRAFT"
>;

/**
 * The same three values as a runtime list, for validating `?status=`. Typed
 * against the `Exclude` above so adding a status to the Prisma enum without
 * deciding whether reviewers should see it is a type error here, not a silently
 * missing filter option.
 */
const REVIEWABLE_STATUSES: readonly AdminDriverApplicationStatus[] = [
  "PENDING",
  "ACTION_REQUIRED",
  "APPROVED",
];

/**
 * One application as the review queue's table renders it. Dates are ISO strings
 * because this crosses the wire; the page imports this type (type-only, so
 * nothing of this server module reaches the browser) rather than restating the
 * shape, which is what keeps the two from drifting.
 */
export type AdminDriverApplicationRow = {
  /** `DriverApplication.id` — the id the detail endpoint takes. */
  applicationId: string;
  /** The short human-readable code shown to driver and reviewer, e.g. "APP-40219". */
  reference: string;
  /** Profile name where the wizard has collected one, else the auth account name. */
  driverName: string;
  /**
   * The wizard's presentation class for the registered vehicle. Null when the
   * application has no vehicle row — either it has not been submitted yet
   * (unreachable here, `DRAFT` is excluded) or the vehicle was retired after
   * approval, which nulls `vehicleId` rather than cascading.
   */
  vehicleClassName: string | null;
  chassisType: string | null;
  plateNumber: string | null;
  /** Licence categories held, e.g. `["B", "C"]`. Empty until a licence is on file. */
  categories: string[];
  /** Live documents already approved, out of `documentsTotalCount`. */
  documentsApprovedCount: number;
  /**
   * Live (non-superseded) documents on the application — always 3 for a
   * submitted one, since submit refuses to proceed without all three.
   */
  documentsTotalCount: number;
  status: AdminDriverApplicationStatus;
  /** `lastSubmittedAt` — when this application last landed in the queue. */
  submittedAt: string;
};

/** Body of `GET /api/admin/driver-applications`. */
export type AdminDriverApplicationListResponse = {
  items: AdminDriverApplicationRow[];
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
 * unrecognised value is treated as absent for the same reason a bad `?page=`
 * is: a filter chip that has drifted out of sync with this enum should show the
 * unfiltered queue, not a 400 the reviewer cannot act on.
 */
function parseStatusFilter(
  raw: string | null,
): AdminDriverApplicationStatus | null {
  return REVIEWABLE_STATUSES.find((status) => status === raw) ?? null;
}

/**
 * The `where` clause. `not: "DRAFT"` is stated unconditionally rather than
 * relying on the filter to imply it, so the exclusion holds no matter what
 * `?status=` says — that is the invariant this queue depends on, and Prisma
 * ANDs the two conditions of a single enum filter together.
 */
function buildWhere(
  statusFilter: AdminDriverApplicationStatus | null,
): Prisma.DriverApplicationWhereInput {
  return {
    status: {
      not: "DRAFT",
      ...(statusFilter ? { equals: statusFilter } : {}),
    },
  };
}

/**
 * Recovers the wizard's presentation class from the spec the submit resolved it
 * to — the reverse of `resolveVehicleTypeSpecCode`. Matched on the vehicle's own
 * chassis type where it has one, since the same spec code could in principle be
 * reachable from more than one class; the un-keyed scan is the fallback for a
 * vehicle registered before `chassisType` was collected. Returns `null` when
 * nothing matches (for example a vehicle added through the older "add a vehicle"
 * form, whose spec no class maps to) so the caller can fall back to the spec's
 * own label rather than showing an empty class name.
 *
 * Deliberately a local copy rather than an export off
 * `@/lib/driver-onboarding/vehicle-classes`: the reverse direction is needed
 * only by this queue and by the driver's own status screen
 * (`/api/driver-profile/onboarding`), and a `route.ts` is a Next.js entry point
 * that should not become a module other entry points import runtime values
 * from.
 */
function findVehicleClassNameBySpecCode(
  specCode: string,
  chassisType: ChassisType | null,
): string | null {
  const matched = VEHICLE_CLASSES.find((vehicleClass) =>
    chassisType
      ? vehicleClass.specCodeByChassis[chassisType] === specCode
      : Object.values(vehicleClass.specCodeByChassis).includes(specCode),
  );

  return matched?.name ?? null;
}

/**
 * The driver's display name: the wizard-collected profile name where it exists,
 * otherwise the Better Auth account name, which is always populated. Never an
 * empty string, so the table has nothing to fall back to itself.
 */
function driverDisplayName(profile: {
  firstName: string | null;
  lastName: string | null;
  user: { name: string };
}): string {
  const profileName = [profile.firstName, profile.lastName]
    .filter((part): part is string => part !== null && part.trim() !== "")
    .join(" ");

  return profileName !== "" ? profileName : profile.user.name;
}

/**
 * GET /api/admin/driver-applications?status=&page= — the paginated review queue
 * behind `/admin/drivers/applications`.
 *
 * Read-only. Approving or flagging anything happens through the separate
 * mutation endpoints, which apply their own (identical) role gate.
 *
 * Everything a row shows is pulled in one query with an explicit `select`: the
 * driver's name and licence categories, the vehicle joined through to its spec
 * so the class name can be recovered, and the *live* documents only, whose
 * statuses are counted in application code. That keeps the listing at two
 * queries regardless of page size, rather than a per-row document count.
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
    prisma.driverApplication.count({ where }),
    prisma.driverApplication.findMany({
      where,
      // Explicit select rather than `include`: the row needs one column off
      // `User`, one off `DriverLicence` and two off `VehicleTypeSpec`, and there
      // is no reason for a listing to carry three whole rows per application —
      // least of all the auth row.
      select: {
        id: true,
        reference: true,
        status: true,
        lastSubmittedAt: true,
        createdAt: true,
        driverProfile: {
          select: {
            firstName: true,
            lastName: true,
            user: { select: { name: true } },
            licence: { select: { categories: true } },
          },
        },
        vehicle: {
          select: {
            plateNumber: true,
            chassisType: true,
            vehicleTypeSpec: { select: { code: true, label: true } },
          },
        },
        documents: {
          // Only the current version of each document. A retake supersedes the
          // previous row rather than overwriting it, so the un-superseded rows
          // are the ones — and the only ones — the counts should reflect.
          where: { supersededAt: null },
          select: { status: true },
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

  const items: AdminDriverApplicationRow[] = applications.flatMap(
    (application) => {
      // `where` already excludes DRAFT; re-checking here is what narrows
      // Prisma's four-value enum to this response's three-value union without a
      // cast. The branch is unreachable in practice.
      if (application.status === "DRAFT") {
        return [];
      }

      const { driverProfile, vehicle } = application;

      return [
        {
          applicationId: application.id,
          reference: application.reference,
          driverName: driverDisplayName(driverProfile),
          vehicleClassName: vehicle
            ? // Falls back to the spec's own label for a vehicle whose spec no
              // wizard class maps to, matching what the driver is shown on
              // their status screen.
              (findVehicleClassNameBySpecCode(
                vehicle.vehicleTypeSpec.code,
                vehicle.chassisType,
              ) ?? vehicle.vehicleTypeSpec.label)
            : null,
          chassisType: vehicle?.chassisType ?? null,
          plateNumber: vehicle?.plateNumber ?? null,
          categories: driverProfile.licence?.categories ?? [],
          documentsApprovedCount: application.documents.filter(
            (document) => document.status === "APPROVED",
          ).length,
          documentsTotalCount: application.documents.length,
          status: application.status,
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

  const body: AdminDriverApplicationListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };

  return NextResponse.json(body, { status: 200 });
}
