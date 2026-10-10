"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import type { VehicleDocumentStatus } from "@prisma/client";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type {
  AdminVehicleDocumentListResponse,
  AdminVehicleDocumentRow,
} from "@/app/api/admin/vehicle-documents/route";
import { APPLICATION_STATUS_CHIP_CLASSES } from "@/components/admin/application-status-colors";
import { readErrorMessage } from "@/components/admin/read-error-message";
import {
  VEHICLE_DOCUMENT_TYPE_LABEL_KEYS,
  VehicleDocumentReviewDialog,
  formatExpiryDate,
} from "@/components/admin/vehicle-document-review-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Columns in the table, so the full-width state rows can span all of them. */
const COLUMN_COUNT = 6;

/** Placeholder for a cell with nothing to show. */
const EMPTY_VALUE = "—";

/**
 * The filter pills. `"ALL"` is this page's own value — the absence of a
 * `?status=` param. The page opens on `PENDING`: the queue is what a reviewer
 * comes here for.
 */
type DocumentFilter = VehicleDocumentStatus | "ALL";

const FILTER_ORDER: readonly DocumentFilter[] = [
  "PENDING",
  "FLAGGED",
  "APPROVED",
  "ALL",
];

/** Each pill's label and the copy shown when that filter matches nothing. */
const FILTERS: Record<DocumentFilter, { labelKey: string; emptyKey: string }> =
  {
    ALL: {
      labelKey: "common.shared.all",
      emptyKey: "admin.adminVehicleDocuments.emptyAll",
    },
    PENDING: {
      labelKey: "admin.applicationReview.pendingReview",
      emptyKey: "admin.adminVehicleDocuments.emptyPending",
    },
    FLAGGED: {
      labelKey: "admin.adminVehicleDocuments.statusFlagged",
      emptyKey: "admin.adminVehicleDocuments.emptyFlagged",
    },
    APPROVED: {
      labelKey: "common.shared.approved",
      emptyKey: "admin.adminVehicleDocuments.emptyApproved",
    },
  };

/**
 * A row's chip colours. The three review verdicts map onto the application
 * palette rather than getting one of their own: pending is pending, approved is
 * approved, and a flagged document is the "action required" red.
 */
const STATUS_CHIP_CLASSES: Record<VehicleDocumentStatus, string> = {
  PENDING: APPLICATION_STATUS_CHIP_CLASSES.PENDING,
  FLAGGED: APPLICATION_STATUS_CHIP_CLASSES.ACTION_REQUIRED,
  APPROVED: APPLICATION_STATUS_CHIP_CLASSES.APPROVED,
};

/**
 * `/admin/drivers/documents` — the review queue for vehicle registration and
 * insurance: every live upload, filterable by verdict, opening the panel that
 * approves it with an expiry date or flags it with a reason.
 *
 * A client component reading the list endpoint, matching the other admin
 * listings. The section layout gates *viewing*; the endpoint re-checks the
 * `adminRole` on every request, which is the real boundary.
 */
export default function AdminVehicleDocumentsPage() {
  const t = useTranslations("admin.adminVehicleDocuments");
  const tShared = useTranslations("common.shared");
  const tRoot = useTranslations();
  const format = useFormatter();
  const [filter, setFilter] = useState<DocumentFilter>("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminVehicleDocumentListResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
  // Bumped after a verdict, purely to re-run the fetch below so the table
  // shows what the database now holds rather than a patched copy.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page) });
    if (filter !== "ALL") {
      params.set("status", filter);
    }

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/vehicle-documents?${params.toString()}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setError(
            await readErrorMessage(response, t("couldNotLoadDocuments")),
          );
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminVehicleDocumentListResponse);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setError(t("couldNotLoadDocuments"));
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [filter, page, reloadToken, t]);

  const items = data?.items ?? [];

  /** The Status cell's label: the verdict, sharpened by the calendar. */
  function statusLabel(document: AdminVehicleDocumentRow): string {
    if (document.status === "PENDING") {
      return tRoot("admin.applicationReview.pendingReview");
    }

    if (document.status === "FLAGGED") {
      return t("statusFlagged");
    }

    return document.validity === "EXPIRED"
      ? t("expired")
      : document.validity === "EXPIRING"
        ? t("expiringSoon")
        : tShared("approved");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTER_ORDER.map((candidate) => {
            const active = candidate === filter;

            return (
              <Button
                key={candidate}
                type="button"
                size="sm"
                variant={active ? "secondary" : "outline"}
                aria-pressed={active}
                onClick={() => {
                  setFilter(candidate);
                  // Page 3 of the previous filter says nothing about this one.
                  setPage(1);
                }}
              >
                {tRoot(FILTERS[candidate].labelKey)}
              </Button>
            );
          })}
        </div>
        {data ? (
          <p className="text-sm text-muted-foreground">
            {t("documentCount", { count: data.total })}
          </p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tShared("driver")}</TableHead>
              <TableHead>{tShared("vehicle")}</TableHead>
              <TableHead>{t("document")}</TableHead>
              <TableHead>{t("uploaded")}</TableHead>
              <TableHead>{tShared("expires")}</TableHead>
              <TableHead>{tShared("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-destructive"
                >
                  <span role="alert">{error}</span>
                </TableCell>
              </TableRow>
            ) : loading && data === null ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("loadingDocuments")}
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  className="py-10 text-center text-muted-foreground"
                >
                  {tRoot(FILTERS[filter].emptyKey)}
                </TableCell>
              </TableRow>
            ) : (
              items.map((document) => {
                const open = openDocumentId === document.documentId;

                return (
                  <TableRow
                    key={document.documentId}
                    data-state={open ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setOpenDocumentId(document.documentId)}
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        {/* The row's mouse target is the whole `<tr>`; this
                            button makes the same action reachable from the
                            keyboard, since a table row cannot be focused. */}
                        <button
                          type="button"
                          className="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                          aria-haspopup="dialog"
                          aria-expanded={open}
                        >
                          {document.driver?.name ?? t("companyVehicle")}
                        </button>
                        {document.driver === null ? null : (
                          <span className="font-mono text-xs text-muted-foreground">
                            {document.driver.phone}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono">
                          {document.vehicle.plateNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {document.vehicle.make} {document.vehicle.model}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>
                          {tRoot(
                            VEHICLE_DOCUMENT_TYPE_LABEL_KEYS[document.type],
                          )}
                        </span>
                        {document.status === "APPROVED" ? null : (
                          <span className="text-xs text-muted-foreground">
                            {document.isRenewal
                              ? t("renewal")
                              : t("firstUpload")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {format.dateTime(new Date(document.uploadedAt), {
                        dateStyle: "medium",
                      })}
                    </TableCell>
                    <TableCell>
                      {document.expiresAt === null
                        ? document.status === "APPROVED"
                          ? t("noExpiry")
                          : EMPTY_VALUE
                        : formatExpiryDate(format, document.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          document.validity === "EXPIRED"
                            ? STATUS_CHIP_CLASSES.FLAGGED
                            : document.validity === "EXPIRING"
                              ? STATUS_CHIP_CLASSES.PENDING
                              : STATUS_CHIP_CLASSES[document.status]
                        }
                      >
                        {statusLabel(document)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.pageCount > 1 ? (
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            {tShared("pageOf", {
              page: data.page,
              pageCount: data.pageCount,
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {tShared("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || data.page >= data.pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            {tShared("next")}
          </Button>
        </div>
      ) : null}

      {openDocumentId ? (
        <VehicleDocumentReviewDialog
          documentId={openDocumentId}
          onClose={() => setOpenDocumentId(null)}
          onChanged={() => setReloadToken((token) => token + 1)}
        />
      ) : null}
    </div>
  );
}
