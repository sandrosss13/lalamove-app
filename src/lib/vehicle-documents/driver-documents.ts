/**
 * A driver's view of their documents, read from the database: the
 * registration and insurance of each vehicle they own, and the attention
 * summary the hub shows on Home.
 *
 * Server-only (Prisma). Every decision about what the rows *mean* is
 * `./rules`'s; this module only fetches them and reduces them to the plain data
 * those rules take.
 *
 * ## Who sees what
 *
 * Documents are shown — and uploadable — for vehicles the driver **owns**
 * (`Vehicle.driverProfileId`). A `ROSTER` driver drives a company vehicle
 * reached through an assignment, and gets nothing for it here: the company
 * owns that vehicle's compliance, no company-side upload flow exists yet, and
 * a "Missing" pill the reader cannot act on would be a warning with no way to
 * clear it. A roster driver's summary therefore carries their own licence only.
 */
import "server-only";

import type { VehicleDocument } from "@prisma/client";

import type { Translator } from "@/i18n/translator";
import { toHubDayKey } from "@/lib/dashboard/hub/timezone";
import { prisma } from "@/lib/prisma";
import { flagReasonLabel } from "@/lib/review-flag-reasons";
import {
  attentionForLicence,
  attentionForSlot,
  instantToExpiryDate,
  summarizeVehicleDocuments,
  toAttentionSummary,
  type DocumentAttentionItem,
  type DocumentAttentionSummary,
  type LiveVehicleDocument,
  type VehicleDocumentReviewStatus,
  type VehicleDocumentSlot,
  type VehicleDocumentType,
} from "@/lib/vehicle-documents/rules";

/** The columns every reader here needs — never the storage path. */
const DOCUMENT_ROW_SELECT = {
  id: true,
  type: true,
  status: true,
  flagReason: true,
  expiresAt: true,
  createdAt: true,
  reviewedAt: true,
  supersededAt: true,
} as const;

type DocumentRow = Pick<VehicleDocument, keyof typeof DOCUMENT_ROW_SELECT>;

/** One upload in a vehicle's history, as plain data. */
export type VehicleDocumentHistoryEntry = {
  id: string;
  type: VehicleDocumentType;
  status: VehicleDocumentReviewStatus;
  flagReason: string | null;
  expiresAt: string | null;
  uploadedAt: string;
  reviewedAt: string | null;
  supersededAt: string | null;
};

/** The Tbilisi calendar day every expiry is measured against. */
export function documentsToday(now: Date = new Date()): string {
  return toHubDayKey(now);
}

/**
 * A stored flag reason in the reader's language. The stored value is the
 * English the reviewer picked (see `review-flag-reasons.ts`); one typed by hand
 * is shown as written.
 */
function localizedFlagReason(
  reason: string | null,
  t: Translator | undefined,
): string | null {
  return reason === null || t === undefined
    ? reason
    : flagReasonLabel(reason, t);
}

function toHistoryEntry(
  row: DocumentRow,
  t: Translator | undefined,
): VehicleDocumentHistoryEntry {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    flagReason: localizedFlagReason(row.flagReason, t),
    expiresAt:
      row.expiresAt === null ? null : instantToExpiryDate(row.expiresAt),
    uploadedAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
  };
}

function toLiveDocument(
  row: DocumentRow,
  t: Translator | undefined,
): LiveVehicleDocument {
  const entry = toHistoryEntry(row, t);

  return {
    id: entry.id,
    type: entry.type,
    status: entry.status,
    flagReason: entry.flagReason,
    expiresAt: entry.expiresAt,
    uploadedAt: entry.uploadedAt,
    reviewedAt: entry.reviewedAt,
  };
}

/**
 * The document slots of every vehicle this driver owns, keyed by vehicle id.
 * A vehicle that is not in the map is not the driver's — the caller shows no
 * documents for it rather than "missing" ones.
 */
export async function getOwnedVehicleDocumentSlots(
  driverProfileId: string,
  t?: Translator,
): Promise<Map<string, VehicleDocumentSlot[]>> {
  const vehicles = await prisma.vehicle.findMany({
    where: { driverProfileId },
    select: {
      id: true,
      documents: {
        where: { supersededAt: null },
        select: DOCUMENT_ROW_SELECT,
      },
    },
  });

  const today = documentsToday();

  return new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      summarizeVehicleDocuments(
        vehicle.documents.map((row) => toLiveDocument(row, t)),
        today,
      ),
    ]),
  );
}

/**
 * One vehicle's documents and their whole history, newest upload first. The
 * caller has already established that the reader owns the vehicle.
 */
export async function getVehicleDocuments(
  vehicleId: string,
  t?: Translator,
): Promise<{
  documents: VehicleDocumentSlot[];
  history: VehicleDocumentHistoryEntry[];
}> {
  const rows = await prisma.vehicleDocument.findMany({
    where: { vehicleId },
    select: DOCUMENT_ROW_SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return {
    documents: summarizeVehicleDocuments(
      rows
        .filter((row) => row.supersededAt === null)
        .map((row) => toLiveDocument(row, t)),
      documentsToday(),
    ),
    history: rows.map((row) => toHistoryEntry(row, t)),
  };
}

/**
 * The "documents needing attention" summary for a hub account: the driver's
 * licence, and the registration and insurance of each vehicle they own.
 *
 * Empty for a `BUSINESS` account (`driverProfileId: null`) — a company has no
 * driving licence and its fleet's documents are not collected here.
 */
export async function getDocumentsAttention(
  driverProfileId: string | null,
  t?: Translator,
): Promise<DocumentAttentionSummary> {
  if (driverProfileId === null) {
    return toAttentionSummary([]);
  }

  const profile = await prisma.driverProfile.findUnique({
    where: { id: driverProfileId },
    select: {
      licence: { select: { expiresAt: true } },
      vehicles: {
        select: {
          id: true,
          plateNumber: true,
          documents: {
            where: { supersededAt: null },
            select: DOCUMENT_ROW_SELECT,
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (profile === null) {
    return toAttentionSummary([]);
  }

  const today = documentsToday();
  const items: DocumentAttentionItem[] = [];

  const licenceItem = attentionForLicence(
    profile.licence === null
      ? null
      : instantToExpiryDate(profile.licence.expiresAt),
    today,
  );
  if (licenceItem !== null) {
    items.push(licenceItem);
  }

  for (const vehicle of profile.vehicles) {
    const slots = summarizeVehicleDocuments(
      vehicle.documents.map((row) => toLiveDocument(row, t)),
      today,
    );

    for (const slot of slots) {
      const item = attentionForSlot(slot, vehicle);
      if (item !== null) {
        items.push(item);
      }
    }
  }

  return toAttentionSummary(items);
}
