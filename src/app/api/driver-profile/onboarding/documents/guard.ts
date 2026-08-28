/**
 * Shared request checks for the two onboarding-document endpoints (issuing a
 * signed upload URL, and recording a completed upload). Both need the exact
 * same session, profile, application and status guards, so they live here
 * rather than being written twice and drifting — the same reason
 * `../../vehicles/validation.ts` exists next to the vehicle routes.
 */

import {
  DriverApplicationDocumentType,
  DriverApplicationStatus,
} from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Valid `DriverApplicationDocumentType` values, from the generated enum. */
const DOCUMENT_TYPES = Object.values(DriverApplicationDocumentType);

/**
 * Statuses during which a document may still be uploaded: an untouched draft,
 * and an application sent back for changes (mid-retake). A submitted
 * application under review, or an approved one, is frozen.
 */
const UPLOADABLE_STATUSES = new Set<DriverApplicationStatus>([
  DriverApplicationStatus.DRAFT,
  DriverApplicationStatus.ACTION_REQUIRED,
]);

/** Everything both endpoints need once the caller has cleared every check. */
export type OnboardingDocumentContext = {
  /** Owner of the documents — also the Storage path prefix they live under. */
  driverProfileId: string;
  /** The application the new document row hangs off. */
  driverApplicationId: string;
};

/**
 * Discriminated result, matching the `{ data } | { error }` shape the rest of
 * this API's validation helpers return, with the HTTP status the caller should
 * use for the failure.
 */
export type OnboardingDocumentGuardResult =
  { context: OnboardingDocumentContext } | { error: string; status: number };

/**
 * Authenticates the caller and resolves their onboarding application.
 *
 * A missing profile and a missing application are both reported as the same
 * 404: the driver only ever reaches these endpoints through the wizard shell,
 * which calls `GET /api/driver-profile/onboarding` (and so creates the
 * application) before any upload slot renders, so either one means the caller
 * skipped that and should start the application first.
 *
 * Does not read the request body — callers parse their own body afterwards,
 * and a `Request` body can only be consumed once.
 */
export async function resolveOnboardingDocumentContext(
  request: Request,
): Promise<OnboardingDocumentGuardResult> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return { error: "Unauthorized.", status: 401 };
  }

  if (session.user.role !== "DRIVER") {
    return {
      error: "Only drivers can upload onboarding documents.",
      status: 403,
    };
  }

  const driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      application: { select: { id: true, status: true } },
    },
  });

  if (!driverProfile?.application) {
    return { error: "Start the application first.", status: 404 };
  }

  const { application } = driverProfile;

  if (!UPLOADABLE_STATUSES.has(application.status)) {
    return {
      error:
        application.status === DriverApplicationStatus.PENDING
          ? "Your application is under review — its documents cannot be changed until it comes back to you."
          : "Your application is already approved — its documents cannot be changed.",
      status: 400,
    };
  }

  return {
    context: {
      driverProfileId: driverProfile.id,
      driverApplicationId: application.id,
    },
  };
}

/**
 * Narrows a raw body field to a `DriverApplicationDocumentType`, or returns a
 * message naming the accepted values.
 */
export function parseDocumentType(
  value: unknown,
): { type: DriverApplicationDocumentType } | { error: string } {
  if (
    typeof value !== "string" ||
    !DOCUMENT_TYPES.includes(value as DriverApplicationDocumentType)
  ) {
    return { error: `type must be one of: ${DOCUMENT_TYPES.join(", ")}.` };
  }

  return { type: value as DriverApplicationDocumentType };
}

/** Trims a value and returns it only if it is a non-empty string, else null. */
export function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Reads a JSON body, mirroring the `{ data } | { error }` convention. */
export async function readJsonBody(
  request: Request,
): Promise<{ body: unknown } | { error: string }> {
  try {
    return { body: await request.json() };
  } catch {
    return { error: "Request body must be valid JSON." };
  }
}

/** A JSON body of `null`, an array, or a scalar has no fields to read. */
export function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}
