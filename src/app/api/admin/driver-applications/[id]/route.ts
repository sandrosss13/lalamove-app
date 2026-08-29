import { NextResponse } from "next/server";

import type {
  AdminRole,
  ChassisType,
  DriverApplicationDocumentStatus,
  DriverApplicationDocumentType,
  DriverApplicationStatus,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { getDriverDocumentSignedUrls } from "@/lib/driver-document-storage";
import { prisma } from "@/lib/prisma";
import { VEHICLE_CLASSES } from "@/lib/driver-onboarding/vehicle-classes";

/**
 * Staff who may open one driver application. Identical to the list endpoint's
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
type AdminDriverApplicationStatus = Exclude<DriverApplicationStatus, "DRAFT">;

/** One live document as the review drawer renders it. */
export type AdminDriverApplicationDocument = {
  /** `DriverApplicationDocument.id` — the id the approve/flag endpoints take. */
  documentId: string;
  type: DriverApplicationDocumentType;
  status: DriverApplicationDocumentStatus;
  /** The reviewer's reason from an earlier round, still shown after a retake. */
  flagReason: string | null;
  /**
   * Short-lived read URL for the private object. Null when signing failed — the
   * drawer renders a broken thumbnail beside the reviewable data, not a crash.
   */
  signedUrl: string | null;
  uploadedAt: string;
};

/**
 * One application in full, as `/admin/drivers/applications` opens it. Dates are
 * ISO strings because this crosses the wire; the page imports this type
 * (type-only, so nothing of this server module reaches the browser) rather than
 * restating the shape, which is what keeps the two from drifting.
 */
export type AdminDriverApplicationDetail = {
  applicationId: string;
  reference: string;
  status: AdminDriverApplicationStatus;
  driver: {
    name: string;
    idNumber: string;
    dateOfBirth: string;
    mobile: string;
    city: string;
  };
  licence: {
    number: string;
    expiresAt: string;
    categories: string[];
  };
  /**
   * The registered vehicle, or null when the application has no vehicle row —
   * `DriverApplication.vehicleId` is `SetNull`, so a driver removing the
   * vehicle from their own dashboard leaves the application standing without
   * one. Null rather than a block of blanked-out fields so the drawer can
   * render an explicit "no vehicle on file" state instead of something
   * indistinguishable from real-but-empty data. Mirrors how the list endpoint
   * models the same case (`vehicleClassName: string | null`).
   */
  vehicle: {
    vehicleClassName: string;
    chassisType: string;
    make: string;
    model: string;
    year: number;
    colour: string;
    plateNumber: string;
    payloadKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
  } | null;
  documents: AdminDriverApplicationDocument[];
};

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
 * only by the admin review screens and by the driver's own status screen
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
 * otherwise the Better Auth account name, which is always populated.
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
 * GET /api/admin/driver-applications/[id] — one application in full, for the
 * review drawer.
 *
 * Read-only: approving or flagging a document, requesting changes and approving
 * the driver all live in the separate mutation endpoints.
 *
 * A `DRAFT` application answers exactly as a nonexistent one does. That is not
 * only a "nothing to review" guard — a draft is unvalidated, half-entered
 * personal data the driver has not chosen to submit, and an admin should never
 * be able to read it by guessing an id. Answering identically also keeps the
 * 404 from confirming that some id is a real driver's in-progress application.
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

  const application = await prisma.driverApplication.findUnique({
    where: { id },
    // Explicit select rather than `include`: the drawer needs one column off
    // `User` and four off `VehicleTypeSpec`'s parent vehicle, and there is no
    // reason to carry whole rows — least of all the auth row — for a read this
    // sensitive.
    select: {
      id: true,
      reference: true,
      status: true,
      driverProfile: {
        select: {
          firstName: true,
          lastName: true,
          idNumber: true,
          dateOfBirth: true,
          phone: true,
          city: true,
          user: { select: { name: true } },
          licence: {
            select: {
              licenceNumber: true,
              expiresAt: true,
              categories: true,
            },
          },
        },
      },
      vehicle: {
        select: {
          make: true,
          model: true,
          year: true,
          colour: true,
          chassisType: true,
          plateNumber: true,
          payloadKg: true,
          cargoLengthM: true,
          cargoWidthM: true,
          cargoHeightM: true,
          vehicleTypeSpec: { select: { code: true, label: true } },
        },
      },
      documents: {
        // Only the current version of each document. A retake supersedes the
        // previous row rather than overwriting it, so the un-superseded rows are
        // the ones — and the only ones — the reviewer acts on.
        where: { supersededAt: null },
        select: {
          id: true,
          type: true,
          status: true,
          flagReason: true,
          storagePath: true,
          createdAt: true,
        },
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

  const { driverProfile, vehicle } = application;
  const { licence } = driverProfile;

  // One batch call for all three thumbnails rather than a round trip each. A
  // path that fails to sign is simply absent from the map and surfaces as
  // `signedUrl: null`; a failure of the batch call itself (Storage unreachable,
  // Supabase env vars absent) degrades to no URLs at all rather than
  // propagating, because the rest of the application — the identity, licence
  // and vehicle data the reviewer also checks — is still worth showing.
  const signedUrlByPath = await getDriverDocumentSignedUrls(
    application.documents.map((document) => document.storagePath),
  ).catch((error: unknown) => {
    console.error("Failed to sign driver application document URLs:", error);
    return {} as Record<string, string>;
  });

  const body: AdminDriverApplicationDetail = {
    applicationId: application.id,
    reference: application.reference,
    status: application.status,
    driver: {
      name: driverDisplayName(driverProfile),
      // The profile scalars below are nullable in the schema (the onboarding
      // wizard is what fills them in), but a submitted application has
      // necessarily set them. Empty strings keep a half-written row from
      // breaking the whole drawer — the same fallback the driver's own status
      // screen uses.
      idNumber: driverProfile.idNumber ?? "",
      dateOfBirth: driverProfile.dateOfBirth?.toISOString() ?? "",
      mobile: driverProfile.phone,
      city: driverProfile.city,
    },
    licence: {
      // Blank rather than a 404 when the licence row is missing: that is only
      // reachable for an application somehow past DRAFT without a completed
      // submit, and the reviewer is better served by the documents plus an
      // obviously empty licence panel than by no screen at all.
      number: licence?.licenceNumber ?? "",
      expiresAt: licence?.expiresAt.toISOString() ?? "",
      categories: licence?.categories ?? [],
    },
    // Null for an application whose vehicle is gone — `vehicleId` is
    // `SetNull`, so the application survives the vehicle. The whole block goes
    // rather than each field blanking individually, so the reviewer sees "no
    // vehicle on file" instead of a panel of empty make/model/plate that reads
    // as real data.
    vehicle: vehicle
      ? {
          // Falls back to the spec's own label for a vehicle whose spec no
          // wizard class maps to, matching what the driver is shown on their
          // status screen.
          vehicleClassName:
            findVehicleClassNameBySpecCode(
              vehicle.vehicleTypeSpec.code,
              vehicle.chassisType,
            ) ?? vehicle.vehicleTypeSpec.label,
          // Nullable on the vehicle itself for a row registered before
          // `chassisType` was collected; blank keeps that one field empty
          // without hiding the rest of the panel.
          chassisType: vehicle.chassisType ?? "",
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          colour: vehicle.colour ?? "",
          plateNumber: vehicle.plateNumber,
          payloadKg: vehicle.payloadKg,
          cargoLengthM: vehicle.cargoLengthM,
          cargoWidthM: vehicle.cargoWidthM,
          cargoHeightM: vehicle.cargoHeightM,
        }
      : null,
    documents: application.documents.map((document) => ({
      documentId: document.id,
      type: document.type,
      status: document.status,
      flagReason: document.flagReason,
      signedUrl: signedUrlByPath[document.storagePath] ?? null,
      uploadedAt: document.createdAt.toISOString(),
    })),
  };

  return NextResponse.json(body, { status: 200 });
}
