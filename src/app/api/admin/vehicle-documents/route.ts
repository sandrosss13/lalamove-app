import { NextResponse } from "next/server";

import type {
  AdminRole,
  Prisma,
  VehicleDocumentStatus,
  VehicleDocumentType,
} from "@prisma/client";

import { authorizeAdminApi } from "@/lib/admin/api-auth";
import { driverDisplayName } from "@/lib/admin/driver-name";
import { prisma } from "@/lib/prisma";
import { documentsToday } from "@/lib/vehicle-documents/driver-documents";
import {
  instantToExpiryDate,
  validityOf,
  type DocumentValidity,
} from "@/lib/vehicle-documents/rules";

/**
 * Staff who may review vehicle documents — the two roles that review a
 * driver's onboarding documents, for the same reason: these are compliance
 * papers that exist to be approved or flagged. Stated per route rather than
 * imported, so the gate on each endpoint can be read without following an
 * import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "USER_MANAGER"];

/** Rows per page. Matches the other admin listings so every table pages alike. */
const PAGE_SIZE = 25;

const STATUSES: readonly VehicleDocumentStatus[] = [
  "PENDING",
  "FLAGGED",
  "APPROVED",
];

/** One live vehicle document as the review queue's table renders it. */
export type AdminVehicleDocumentRow = {
  documentId: string;
  type: VehicleDocumentType;
  status: VehicleDocumentStatus;
  /** The stored (English) reason; the page localises it. */
  flagReason: string | null;
  /** `YYYY-MM-DD`; set at approval. */
  expiresAt: string | null;
  /** Where an approved document stands against the calendar; null otherwise. */
  validity: DocumentValidity | null;
  /**
   * True for an unapproved upload whose slot already has an approved document
   * on file — approving it replaces that document.
   */
  isRenewal: boolean;
  uploadedAt: string;
  vehicle: { id: string; plateNumber: string; make: string; model: string };
  /** Null for a company-owned vehicle, which no flow uploads for today. */
  driver: { name: string; phone: string } | null;
};

/** Body of `GET /api/admin/vehicle-documents`. */
export type AdminVehicleDocumentListResponse = {
  items: AdminVehicleDocumentRow[];
  page: number;
  pageSize: number;
  total: number;
  /** Always at least 1, so an empty list still renders as "Page 1 of 1". */
  pageCount: number;
};

/** `?page=` → a 1-based page number; anything unusable is the first page. */
function parsePage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** `?status=` → one status, or null for all of them (also for a bad value). */
function parseStatusFilter(raw: string | null): VehicleDocumentStatus | null {
  return STATUSES.find((status) => status === raw) ?? null;
}

/**
 * GET /api/admin/vehicle-documents?status=&page= — the paginated queue behind
 * `/admin/drivers/documents`: every **live** registration and insurance upload,
 * newest first.
 *
 * Superseded rows are history and are excluded unconditionally; they are shown
 * on the detail endpoint, beside the upload that replaced them. Read-only — the
 * verdicts go through `PATCH /api/admin/vehicle-documents/[id]`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorized = await authorizeAdminApi(ALLOWED_ROLES);
  if (!authorized.ok) {
    return authorized.response;
  }

  const url = new URL(request.url);
  const page = parsePage(url.searchParams.get("page"));
  const statusFilter = parseStatusFilter(url.searchParams.get("status"));

  const where: Prisma.VehicleDocumentWhereInput = {
    supersededAt: null,
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [total, documents] = await Promise.all([
    prisma.vehicleDocument.count({ where }),
    prisma.vehicleDocument.findMany({
      where,
      select: {
        id: true,
        type: true,
        status: true,
        flagReason: true,
        expiresAt: true,
        createdAt: true,
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            driverProfile: {
              select: {
                firstName: true,
                lastName: true,
                phone: true,
                user: { select: { name: true } },
              },
            },
            // The slot's document on file, if any — what makes an unapproved
            // row a renewal rather than a first upload.
            documents: {
              where: { supersededAt: null, status: "APPROVED" },
              select: { type: true },
            },
          },
        },
      },
      // Newest upload first, with the id as a deterministic tiebreak so two
      // rows cannot swap places between page requests.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const today = documentsToday();

  const items: AdminVehicleDocumentRow[] = documents.map((document) => {
    const { vehicle } = document;
    const expiresAt =
      document.expiresAt === null
        ? null
        : instantToExpiryDate(document.expiresAt);

    return {
      documentId: document.id,
      type: document.type,
      status: document.status,
      flagReason: document.flagReason,
      expiresAt,
      validity:
        document.status === "APPROVED" ? validityOf(expiresAt, today) : null,
      isRenewal:
        document.status !== "APPROVED" &&
        vehicle.documents.some((onFile) => onFile.type === document.type),
      uploadedAt: document.createdAt.toISOString(),
      vehicle: {
        id: vehicle.id,
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
      },
      driver:
        vehicle.driverProfile === null
          ? null
          : {
              name: driverDisplayName(vehicle.driverProfile),
              phone: vehicle.driverProfile.phone,
            },
    };
  });

  const body: AdminVehicleDocumentListResponse = {
    items,
    page,
    pageSize: PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };

  return NextResponse.json(body, { status: 200 });
}
