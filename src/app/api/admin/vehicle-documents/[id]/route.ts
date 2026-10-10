import { NextResponse } from "next/server";

import type {
  AdminRole,
  Prisma,
  VehicleDocumentStatus,
  VehicleDocumentType,
} from "@prisma/client";

import {
  getRequestTranslations,
  type RequestTranslator,
} from "@/i18n/request-locale";
import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";
import { getVehicleDocumentSignedUrls } from "@/lib/vehicle-document-storage";
import { documentsToday } from "@/lib/vehicle-documents/driver-documents";
import {
  expiryDateToInstant,
  expiryRefusalFor,
  instantToExpiryDate,
  parseExpiryDate,
  validityOf,
  type DocumentValidity,
} from "@/lib/vehicle-documents/rules";

/**
 * Staff who may review vehicle documents. Stated per route rather than
 * imported from one shared constant so the gate on each endpoint can be read —
 * and audited — without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/**
 * Cap on the stored flag reason — the driver sees it verbatim in the app. The
 * same figure the onboarding-document review uses.
 */
const MAX_FLAG_REASON_LENGTH = 500;

/** One upload as the review panel shows it. */
export type AdminVehicleDocumentEntry = {
  documentId: string;
  status: VehicleDocumentStatus;
  /** The stored (English) reason; the panel localises it. */
  flagReason: string | null;
  /** `YYYY-MM-DD`. */
  expiresAt: string | null;
  validity: DocumentValidity | null;
  uploadedAt: string;
  reviewedAt: string | null;
  reviewedByName: string | null;
  supersededAt: string | null;
  /**
   * A read URL valid for five minutes; null when signing failed, or when the
   * object was discarded (a never-approved upload the driver replaced).
   */
  signedUrl: string | null;
};

/** Body of `GET /api/admin/vehicle-documents/[id]`. */
export type AdminVehicleDocumentDetail = {
  type: VehicleDocumentType;
  /** The document that was opened. */
  document: AdminVehicleDocumentEntry;
  /**
   * The approved document currently on file for the same vehicle and type,
   * when the opened one is a different row — what a renewal would replace.
   */
  onFile: AdminVehicleDocumentEntry | null;
  /** Every other upload for this vehicle and type, newest first. */
  history: AdminVehicleDocumentEntry[];
  vehicle: {
    id: string;
    plateNumber: string;
    make: string;
    model: string;
    year: number;
  };
  driver: { name: string; phone: string } | null;
};

/** Body `PATCH` answers with, so the queue can update in place. */
export type AdminVehicleDocumentReviewResponse = {
  documentId: string;
  status: VehicleDocumentStatus;
  flagReason: string | null;
  expiresAt: string | null;
};

const ENTRY_SELECT = {
  id: true,
  status: true,
  flagReason: true,
  expiresAt: true,
  storagePath: true,
  createdAt: true,
  reviewedAt: true,
  supersededAt: true,
  reviewedBy: { select: { name: true } },
} as const;

type EntryRow = {
  id: string;
  status: VehicleDocumentStatus;
  flagReason: string | null;
  expiresAt: Date | null;
  storagePath: string;
  createdAt: Date;
  reviewedAt: Date | null;
  supersededAt: Date | null;
  reviewedBy: { name: string } | null;
};

function toEntry(
  row: EntryRow,
  signedUrls: Record<string, string>,
  today: string,
): AdminVehicleDocumentEntry {
  const expiresAt =
    row.expiresAt === null ? null : instantToExpiryDate(row.expiresAt);

  return {
    documentId: row.id,
    status: row.status,
    flagReason: row.flagReason,
    expiresAt,
    validity: row.status === "APPROVED" ? validityOf(expiresAt, today) : null,
    uploadedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedByName: row.reviewedBy?.name ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    signedUrl: signedUrls[row.storagePath] ?? null,
  };
}

/**
 * GET /api/admin/vehicle-documents/[id] — one upload with a signed image URL,
 * the document it would replace, and the slot's history.
 *
 * The storage path never leaves the server: the panel is handed short-lived
 * signed URLs, re-minted on every request.
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

  const opened = await prisma.vehicleDocument.findUnique({
    where: { id },
    select: {
      ...ENTRY_SELECT,
      type: true,
      vehicle: {
        select: {
          id: true,
          plateNumber: true,
          make: true,
          model: true,
          year: true,
          driverProfile: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              user: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!opened) {
    const t = await getRequestTranslations();
    return NextResponse.json(
      { error: t("errors.adminDriverApplicationsDocuments.documentNotFound") },
      { status: 404 },
    );
  }

  const siblings = await prisma.vehicleDocument.findMany({
    where: {
      vehicleId: opened.vehicle.id,
      type: opened.type,
      id: { not: opened.id },
    },
    select: ENTRY_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const signedUrls = await getVehicleDocumentSignedUrls(
    [opened, ...siblings].map((row) => row.storagePath),
  );
  const today = documentsToday();

  const onFileRow = siblings.find(
    (row) => row.status === "APPROVED" && row.supersededAt === null,
  );

  const body: AdminVehicleDocumentDetail = {
    type: opened.type,
    document: toEntry(opened, signedUrls, today),
    onFile:
      onFileRow === undefined ? null : toEntry(onFileRow, signedUrls, today),
    history: siblings
      .filter((row) => row !== onFileRow)
      .map((row) => toEntry(row, signedUrls, today)),
    vehicle: {
      id: opened.vehicle.id,
      plateNumber: opened.vehicle.plateNumber,
      make: opened.vehicle.make,
      model: opened.vehicle.model,
      year: opened.vehicle.year,
    },
    driver:
      opened.vehicle.driverProfile === null
        ? null
        : {
            name: driverDisplayName(opened.vehicle.driverProfile),
            phone: opened.vehicle.driverProfile.phone,
          },
  };

  return NextResponse.json(body, { status: 200 });
}

/** The reviewer's verdict on one upload. */
type DocumentReview =
  | { action: "approve"; expiresAt: string | null }
  | { action: "flag"; reason: string };

/**
 * Hand-rolled body validation, consistent with the rest of the API (the project
 * deliberately uses no validation library).
 *
 * `expiresAt` is `YYYY-MM-DD`, or null/absent/blank for "no expiry"; whether
 * that is acceptable for this document type is decided later, against the row.
 */
function parseReviewBody(
  body: unknown,
  t: RequestTranslator,
): { value: DocumentReview } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: t("common.shared.requestBodyMustBeAJson") };
  }

  const { action, reason, expiresAt } = body as Record<string, unknown>;

  if (action === "approve") {
    if (expiresAt === undefined || expiresAt === null || expiresAt === "") {
      return { value: { action: "approve", expiresAt: null } };
    }

    const parsed = parseExpiryDate(expiresAt);

    return parsed === null
      ? { error: t("errors.adminVehicleDocuments.expiryDateInvalid") }
      : { value: { action: "approve", expiresAt: parsed } };
  }

  if (action !== "flag") {
    return {
      error: t(
        "errors.adminDriverApplicationsDocuments.actionMustBeApproveOrFlag",
      ),
    };
  }

  if (typeof reason !== "string" || reason.trim() === "") {
    return {
      error: t(
        "errors.adminDriverApplicationsDocuments.aReasonIsRequiredToFlag",
      ),
    };
  }

  const trimmedReason = reason.trim();

  if (trimmedReason.length > MAX_FLAG_REASON_LENGTH) {
    return {
      error: t("common.shared.reasonMaxLength", {
        max: MAX_FLAG_REASON_LENGTH,
      }),
    };
  }

  return { value: { action: "flag", reason: trimmedReason } };
}

/** What the review transaction decided. */
type ReviewOutcome =
  | { error: string; status: number }
  | {
      updated: AdminVehicleDocumentReviewResponse;
      audit: {
        action: string;
        metadata: Record<string, string | null>;
      };
    };

/**
 * PATCH /api/admin/vehicle-documents/[id] — record the reviewer's verdict.
 *
 * - `{ action: "approve", expiresAt? }` — accepts the upload **and records its
 *   expiry date**. The reviewer is who writes that date, not the driver: the
 *   app's renew flow captures a photograph and nothing else, and the date that
 *   decides whether a vehicle is insured should be read off the document by
 *   staff. Required for insurance, optional for a registration, never in the
 *   past. The slot's previous document on file is superseded in the same
 *   transaction — that moment, not the upload, is when a renewal takes over.
 *   On a document that is already approved this corrects its expiry date.
 * - `{ action: "flag", reason }` — refuses the upload. The document on file,
 *   if any, is untouched and stays valid; the driver is shown the reason and
 *   uploads again.
 *
 * Only a **live** row can be reviewed. A superseded one is an upload the
 * driver has already replaced, and judging it would act on a photo nobody is
 * waiting on.
 *
 * This route changes what the driver is *told*. It enforces nothing: no
 * endpoint refuses a driver for a missing, flagged or expired document.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const t = await getRequestTranslations();
  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: t("common.shared.requestBodyMustBeValidJson") },
      { status: 400 },
    );
  }

  const parsed = parseReviewBody(rawBody, t);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const review = parsed.value;
  const { actorId } = authorized.context;

  const decide = async (
    tx: Prisma.TransactionClient,
  ): Promise<ReviewOutcome> => {
    const target = await tx.vehicleDocument.findUnique({
      where: { id },
      select: { vehicleId: true },
    });

    if (!target) {
      return {
        error: t("errors.adminDriverApplicationsDocuments.documentNotFound"),
        status: 404,
      };
    }

    // The lock the driver's register route takes too, so an approval cannot
    // interleave with a new upload for the same slot.
    await tx.$queryRaw`SELECT "id" FROM "Vehicle" WHERE "id" = ${target.vehicleId} FOR UPDATE`;

    const document = await tx.vehicleDocument.findUnique({
      where: { id },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        status: true,
        supersededAt: true,
      },
    });

    if (!document) {
      return {
        error: t("errors.adminDriverApplicationsDocuments.documentNotFound"),
        status: 404,
      };
    }

    if (document.supersededAt !== null) {
      return {
        error: t("errors.adminVehicleDocuments.documentWasReplaced"),
        status: 409,
      };
    }

    const now = new Date();
    const base = {
      vehicleId: document.vehicleId,
      documentType: document.type,
    };

    if (review.action === "flag") {
      // Flagging the document on file would leave the vehicle with nothing
      // valid by a reviewer's click — a consequence for the driver that is
      // not this endpoint's to decide.
      if (document.status === "APPROVED") {
        return {
          error: t("errors.adminVehicleDocuments.cannotFlagDocumentOnFile"),
          status: 409,
        };
      }

      const updated = await tx.vehicleDocument.update({
        where: { id: document.id },
        data: {
          status: "FLAGGED",
          flagReason: review.reason,
          expiresAt: null,
          reviewedAt: now,
          reviewedById: actorId,
        },
        select: { id: true, status: true, flagReason: true },
      });

      return {
        updated: {
          documentId: updated.id,
          status: updated.status,
          flagReason: updated.flagReason,
          expiresAt: null,
        },
        audit: {
          action: "vehicle_document.flag",
          metadata: { ...base, reason: review.reason },
        },
      };
    }

    const refusal = expiryRefusalFor(
      document.type,
      review.expiresAt,
      documentsToday(now),
    );

    if (refusal !== null) {
      return {
        error:
          refusal === "EXPIRY_REQUIRED"
            ? t("errors.adminVehicleDocuments.expiryDateRequired")
            : t("errors.adminVehicleDocuments.expiryDateInPast"),
        status: 400,
      };
    }

    const expiresAt =
      review.expiresAt === null ? null : expiryDateToInstant(review.expiresAt);
    const wasApproved = document.status === "APPROVED";

    // Retire the previous document on file *before* this row becomes the
    // approved one: `vehicle_document_live_approved_unique` allows one live
    // approved row per slot and is checked per statement.
    const superseded = wasApproved
      ? { count: 0 }
      : await tx.vehicleDocument.updateMany({
          where: {
            vehicleId: document.vehicleId,
            type: document.type,
            status: "APPROVED",
            supersededAt: null,
            id: { not: document.id },
          },
          data: { supersededAt: now },
        });

    const updated = await tx.vehicleDocument.update({
      where: { id: document.id },
      data: {
        status: "APPROVED",
        // Cleared, not left behind: an approved document showing a stale
        // reason would keep asking the driver for a new upload.
        flagReason: null,
        expiresAt,
        reviewedAt: now,
        reviewedById: actorId,
      },
      select: { id: true, status: true, flagReason: true },
    });

    return {
      updated: {
        documentId: updated.id,
        status: updated.status,
        flagReason: updated.flagReason,
        expiresAt: review.expiresAt,
      },
      audit: {
        action: wasApproved
          ? "vehicle_document.update_expiry"
          : "vehicle_document.approve",
        metadata: {
          ...base,
          expiresAt: review.expiresAt,
          replacedDocumentOnFile: superseded.count > 0 ? "yes" : "no",
        },
      },
    };
  };

  // The verdict and its audit row are one transaction: a review that changes
  // what a driver is told must never exist without the record of who gave it,
  // and an audit write that fails must take the verdict down with it rather
  // than answer 500 for a change that has already been made.
  const outcome = await prisma.$transaction(async (tx) => {
    const decided = await decide(tx);

    if (!("error" in decided)) {
      await writeAuditLog(
        {
          actorId,
          action: decided.audit.action,
          entityType: "VehicleDocument",
          entityId: decided.updated.documentId,
          metadata: decided.audit.metadata,
        },
        tx,
      );
    }

    return decided;
  });

  if ("error" in outcome) {
    return NextResponse.json(
      { error: outcome.error },
      { status: outcome.status },
    );
  }

  return NextResponse.json(outcome.updated, { status: 200 });
}
