import { NextResponse } from "next/server";

import type {
  AdminRole,
  BusinessApplicationStatus,
  BusinessApplicationVehicleStatus,
  CompanyReviewStatus,
  VehicleClass,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { prisma } from "@/lib/prisma";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";

/**
 * Staff who may open one business application. Identical to the list endpoint's
 * gate, restated here rather than imported: a `route.ts` is a Next.js entry
 * point, and the gate on each endpoint should be readable — and auditable —
 * without following an import into another one.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * The statuses a reviewer can ever see. Restated rather than imported from the
 * list route for the same entry-point reason as `ALLOWED_ROLES`; only the
 * *type* is shared in spirit, and both derive it from the Prisma enum so
 * neither can drift from the schema.
 */
type AdminBusinessApplicationStatus = Exclude<
  BusinessApplicationStatus,
  "DRAFT"
>;

/**
 * One vehicle on the application, as the drawer's fleet cards render it.
 * Exported so the drawer imports the shape type-only — nothing of this server
 * module reaches the browser bundle — rather than restating it.
 */
export type AdminBusinessApplicationVehicle = {
  /** `BusinessApplicationVehicle.id` — the id the per-vehicle verdict endpoint takes. */
  applicationVehicleId: string;
  /** `Vehicle.id`, or null when the vehicle row was deleted after submit. */
  vehicleId: string | null;
  /** Raw `VehicleClass` enum value, e.g. "MEDIUM_TRUCK". */
  vehicleClass: string;
  /** The taxonomy's display name, e.g. "Medium Truck". */
  vehicleClassName: string;
  /** Raw `ChassisType` enum value: DRY_BOX · REFRIGERATED · OPEN_CHASSIS. */
  chassisType: string;
  /** Blank strings / nulls when `vehicleId` is null — see the note below. */
  make: string;
  model: string;
  year: number | null;
  colour: string;
  plateNumber: string;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  status: BusinessApplicationVehicleStatus;
  flagReason: string | null;
  /**
   * The driver currently behind this vehicle, from the single open
   * `DriverVehicleAssignment`. Null when nobody holds it — which submit does not
   * allow, but an admin unassignment afterwards does.
   */
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    /** Licence categories held, e.g. ["B", "C"]. Empty when no licence row. */
    categories: string[];
  } | null;
};

/**
 * One application in full, as `/admin/business/applications` opens it. Dates are
 * ISO strings because this crosses the wire; the drawer imports this type
 * (type-only, so no Prisma or Better Auth code reaches the browser) rather than
 * restating the shape, which is what keeps the two from drifting.
 */
export type AdminBusinessApplicationDetail = {
  applicationId: string;
  reference: string;
  status: AdminBusinessApplicationStatus;
  /** `lastSubmittedAt`, falling back to `createdAt`. */
  submittedAt: string;
  submissionCount: number;
  company: {
    companyId: string;
    companyName: string;
    /** VAT / tax ID — 9 digits. */
    vatId: string;
    registeredAddress: string;
    /** `LogisticsCompany.city`, the registered/primary city (enum value). */
    primaryCity: string;
    /** `citiesOfOperation` as raw `GeorgianCity` enum values, in stored order. */
    citiesOfOperation: string[];
    contactName: string;
    contactRole: string;
    /** The company's main line — also its account login. */
    phone: string;
    /** The contact person's company email. */
    email: string;
    bankAccountIban: string;
    /** Set once the fleet is activated; null while under review. */
    activatedAt: string | null;
  };
  companyReviewStatus: CompanyReviewStatus;
  companyFlagReason: string | null;
  vehicles: AdminBusinessApplicationVehicle[];
  /** Pre-computed so the drawer's "3 approved, 1 flagged, 3 pending" header
   *  and the activation rules read the same numbers the server did. */
  counts: {
    total: number;
    approved: number;
    flagged: number;
    pending: number;
  };
};

/**
 * The taxonomy's display name for a declared class.
 *
 * A **forward** lookup on `BusinessApplicationVehicle.vehicleClass`: unlike the
 * driver routes there is no need to reverse-map a `VehicleTypeSpec.code` back to
 * a class, because the declared class is stored on the review row — which is
 * precisely why that column exists. Falls back to the raw enum value rather than
 * blanking the field: an unmapped class must be visible to the reviewer, not
 * silently absent.
 */
function vehicleClassName(vehicleClass: VehicleClass): string {
  return (
    VEHICLE_CLASSES.find((entry) => entry.id === vehicleClass)?.name ??
    vehicleClass
  );
}

/**
 * The driver's display name: the profile name where the row has one, otherwise
 * the Better Auth account name, which is always populated. Never an empty
 * string, so the drawer has nothing to fall back to itself.
 * `firstName`/`lastName` are null for the company-created driver accounts this
 * flow produces, which is exactly the case `user.name` covers.
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
 * GET /api/admin/business-applications/[id] — one application in full, for the
 * review drawer.
 *
 * Read-only: verifying or flagging the company, recording a per-vehicle verdict
 * and activating the fleet all live in the separate mutation endpoints.
 *
 * A `DRAFT` application answers exactly as a nonexistent one does. That is not
 * only a "nothing to review" guard — a draft is unvalidated, half-entered
 * company data (VAT id, registered address, payout IBAN) the company has not
 * chosen to submit, and an admin should never be able to read it by guessing an
 * id. Answering identically also keeps the 404 from confirming that some id is a
 * real company's in-progress application.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const { id } = await params;

  const application = await prisma.businessApplication.findUnique({
    where: { id },
    // Explicit select rather than `include`: the drawer needs a defined set of
    // company and vehicle columns plus one column off `User`, and there is no
    // reason to carry whole rows — least of all the auth row — for a read this
    // sensitive.
    select: {
      id: true,
      reference: true,
      status: true,
      companyReviewStatus: true,
      companyFlagReason: true,
      submissionCount: true,
      lastSubmittedAt: true,
      createdAt: true,
      company: {
        select: {
          id: true,
          companyName: true,
          vatId: true,
          registeredAddress: true,
          city: true,
          citiesOfOperation: true,
          contactName: true,
          contactRole: true,
          phone: true,
          contactEmail: true,
          bankAccountIban: true,
          activatedAt: true,
        },
      },
      vehicles: {
        select: {
          id: true,
          vehicleId: true,
          vehicleClass: true,
          chassisType: true,
          status: true,
          flagReason: true,
          vehicle: {
            select: {
              make: true,
              model: true,
              year: true,
              colour: true,
              plateNumber: true,
              payloadKg: true,
              cargoLengthM: true,
              cargoWidthM: true,
              cargoHeightM: true,
              assignments: {
                where: { unassignedAt: null },
                select: {
                  driverProfile: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      phone: true,
                      user: { select: { name: true } },
                      licence: { select: { categories: true } },
                    },
                  },
                },
                // Defensive: the partial unique index makes two open rows
                // impossible, but the newest wins rather than an arbitrary one.
                orderBy: { assignedAt: "desc" },
                take: 1,
              },
            },
          },
        },
        // There is no `position` column: this `createdAt` ascending ordering
        // *is* the row order, and any 1-based row number the drawer shows is the
        // array index it computes itself. Stable across reloads and across a
        // verdict being recorded — the reviewer works down the same list of
        // cards all the way through.
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!application || application.status === "DRAFT") {
    return NextResponse.json(
      { error: "Application not found." },
      { status: 404 },
    );
  }

  const { company } = application;

  const vehicles: AdminBusinessApplicationVehicle[] = application.vehicles.map(
    (row) => {
      // At most one live assignment per vehicle, guaranteed by the partial
      // unique index on open `DriverVehicleAssignment` rows.
      const driverProfile = row.vehicle?.assignments[0]?.driverProfile;

      return {
        applicationVehicleId: row.id,
        // `vehicle` being null is not an error: `vehicleId` is `SetNull`, so
        // removing the vehicle from the fleet leaves the review row — and its
        // recorded verdict — standing. The drawer keys on `vehicleId === null`
        // to render an explicit "vehicle no longer on file" card instead of a
        // grid of blanks, which is why the specifications below blank out
        // individually rather than the whole entry being dropped.
        vehicleId: row.vehicleId,
        // Read from the review row's own denormalised columns rather than the
        // joined vehicle: that is precisely why those columns exist, since the
        // join returns nothing once `vehicleId` is null but the drawer must
        // still say what the company declared and what was reviewed.
        vehicleClass: row.vehicleClass,
        vehicleClassName: vehicleClassName(row.vehicleClass),
        chassisType: row.chassisType,
        make: row.vehicle?.make ?? "",
        model: row.vehicle?.model ?? "",
        year: row.vehicle?.year ?? null,
        colour: row.vehicle?.colour ?? "",
        plateNumber: row.vehicle?.plateNumber ?? "",
        payloadKg: row.vehicle?.payloadKg ?? null,
        cargoLengthM: row.vehicle?.cargoLengthM ?? null,
        cargoWidthM: row.vehicle?.cargoWidthM ?? null,
        cargoHeightM: row.vehicle?.cargoHeightM ?? null,
        status: row.status,
        flagReason: row.flagReason,
        driver: driverProfile
          ? {
              driverProfileId: driverProfile.id,
              name: driverDisplayName(driverProfile),
              phone: driverProfile.phone,
              // Empty when the driver has no licence on file — an older
              // company-created account predating licence capture.
              categories: driverProfile.licence?.categories ?? [],
            }
          : null,
      };
    },
  );

  const body: AdminBusinessApplicationDetail = {
    applicationId: application.id,
    reference: application.reference,
    status: application.status,
    // A submitted application always has `lastSubmittedAt`; `createdAt` is a
    // defensive fallback so one corrupt row cannot break the whole drawer.
    submittedAt: (
      application.lastSubmittedAt ?? application.createdAt
    ).toISOString(),
    submissionCount: application.submissionCount,
    company: {
      companyId: company.id,
      companyName: company.companyName,
      vatId: company.vatId,
      // The company scalars below are nullable in the schema (admin-created
      // companies predating this feature have none), but a submitted
      // application has necessarily filled them in. Empty strings keep a
      // half-written row from breaking the whole drawer, which already renders
      // `""` as the em-dash placeholder.
      registeredAddress: company.registeredAddress ?? "",
      primaryCity: company.city,
      citiesOfOperation: company.citiesOfOperation,
      contactName: company.contactName ?? "",
      contactRole: company.contactRole ?? "",
      phone: company.phone,
      email: company.contactEmail ?? "",
      bankAccountIban: company.bankAccountIban ?? "",
      activatedAt: company.activatedAt?.toISOString() ?? null,
    },
    companyReviewStatus: application.companyReviewStatus,
    companyFlagReason: application.companyFlagReason,
    vehicles,
    // Derived from the same array the response carries, so the drawer's header
    // can never disagree with the cards below it.
    counts: {
      total: vehicles.length,
      approved: vehicles.filter((vehicle) => vehicle.status === "APPROVED")
        .length,
      flagged: vehicles.filter((vehicle) => vehicle.status === "FLAGGED")
        .length,
      pending: vehicles.filter((vehicle) => vehicle.status === "PENDING")
        .length,
    },
  };

  return NextResponse.json(body, { status: 200 });
}
