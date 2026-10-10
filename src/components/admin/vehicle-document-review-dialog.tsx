"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

// Type-only imports, so nothing of the server routes (Prisma, Better Auth,
// Supabase) is pulled into this client bundle — they are erased at compile
// time. Sharing the shapes with the endpoint that produces them is what stops
// this panel and the API drifting apart.
import type {
  AdminVehicleDocumentDetail,
  AdminVehicleDocumentEntry,
} from "@/app/api/admin/vehicle-documents/[id]/route";
import { APPLICATION_APPROVED_TEXT_CLASSES } from "@/components/admin/application-status-colors";
import { readErrorMessage } from "@/components/admin/read-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  VEHICLE_DOCUMENT_FLAG_REASONS,
  flagReasonLabel,
} from "@/lib/review-flag-reasons";
import {
  isExpiryRequired,
  type VehicleDocumentType,
} from "@/lib/vehicle-documents/rules";

/** Matches the server's cap on a stored flag reason. */
const MAX_FLAG_REASON_LENGTH = 500;

/** Message path of each document type's name. */
export const VEHICLE_DOCUMENT_TYPE_LABEL_KEYS: Record<
  VehicleDocumentType,
  string
> = {
  REGISTRATION: "admin.adminVehicleDocuments.typeRegistration",
  INSURANCE: "admin.adminVehicleDocuments.typeInsurance",
};

type Translator = ReturnType<typeof useTranslations>;
type Formatter = ReturnType<typeof useFormatter>;

/** An upload instant, as a medium date with the time. */
function formatInstant(format: Formatter, iso: string): string {
  return format.dateTime(new Date(iso), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * A `YYYY-MM-DD` expiry as a medium date. Formatted in UTC because the value
 * is a calendar date, not an instant — the reader's zone must not move it.
 */
export function formatExpiryDate(format: Formatter, date: string): string {
  return format.dateTime(new Date(`${date}T00:00:00Z`), {
    dateStyle: "medium",
    timeZone: "UTC",
  });
}

/** The one-line state of an upload: its verdict, and the expiry where it has one. */
function describeEntry(
  t: Translator,
  format: Formatter,
  entry: AdminVehicleDocumentEntry,
): string {
  if (entry.status === "FLAGGED") {
    return t("admin.applicationReview.flaggedWithReason", {
      reason:
        entry.flagReason === null ? "—" : flagReasonLabel(entry.flagReason, t),
    });
  }

  if (entry.status === "PENDING") {
    return t("admin.applicationReview.pendingReview");
  }

  const expiry =
    entry.expiresAt === null
      ? t("admin.adminVehicleDocuments.noExpiry")
      : `${t("common.shared.expires")} ${formatExpiryDate(format, entry.expiresAt)}`;

  return `${t("common.shared.approved")} · ${expiry}`;
}

/** One upload: its image, when it was uploaded, and where its review stands. */
function EntryCard({
  title,
  entry,
  alt,
}: {
  title: string;
  entry: AdminVehicleDocumentEntry;
  alt: string;
}) {
  const t = useTranslations();
  const format = useFormatter();

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-[13px] font-semibold">{title}</p>
      {entry.signedUrl === null ? (
        // The row exists but there is no image to show: signing failed, or the
        // object was discarded when the driver replaced an unapproved upload.
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
          {t("admin.adminVehicleDocuments.imageUnavailable")}
        </div>
      ) : (
        <a
          href={entry.signedUrl}
          target="_blank"
          rel="noreferrer"
          title={t("admin.adminVehicleDocuments.openFullSize")}
        >
          {/*
            Plain <img> rather than next/image: documents live in a private
            Supabase bucket behind a short-lived signed URL, on a host
            configured per deployment, so it cannot be pinned in
            `remotePatterns` at build time.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.signedUrl}
            alt={alt}
            className="aspect-[4/3] w-full rounded-lg border border-border object-contain"
          />
        </a>
      )}
      <p
        className={`text-xs font-medium ${
          entry.status === "FLAGGED"
            ? "text-destructive"
            : entry.status === "APPROVED"
              ? APPLICATION_APPROVED_TEXT_CLASSES
              : "text-muted-foreground"
        }`}
      >
        {describeEntry(t, format, entry)}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("admin.adminVehicleDocuments.uploaded")}{" "}
        {formatInstant(format, entry.uploadedAt)}
        {entry.reviewedByName === null
          ? null
          : ` · ${t("admin.adminVehicleDocuments.reviewedBy", { name: entry.reviewedByName })}`}
      </p>
    </div>
  );
}

/**
 * The review panel for one vehicle document: the upload, the document on file
 * it would replace, the expiry date the reviewer records, and the two verdicts.
 *
 * The expiry field is the reviewer's to fill — the driver's app sends a
 * photograph and nothing else — and the server refuses an insurance approval
 * without one, so the Approve button is disabled until it is set.
 */
export function VehicleDocumentReviewDialog({
  documentId,
  onClose,
  onChanged,
}: {
  documentId: string;
  onClose: () => void;
  /** Called after a verdict is saved, so the queue behind can re-fetch. */
  onChanged: () => void;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const [data, setData] = useState<AdminVehicleDocumentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/vehicle-documents/${documentId}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setLoadError(
            await readErrorMessage(
              response,
              t("admin.adminVehicleDocuments.couldNotLoadDocument"),
            ),
          );
          return;
        }

        const detail = (await response.json()) as AdminVehicleDocumentDetail;
        setData(detail);
        // Pre-filled with the stored date when correcting an approved one.
        setExpiresAt(detail.document.expiresAt ?? "");
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(t("admin.adminVehicleDocuments.couldNotLoadDocument"));
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [documentId, t]);

  async function submit(
    body:
      | { action: "approve"; expiresAt: string | null }
      | { action: "flag"; reason: string },
  ) {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/vehicle-documents/${documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        setError(
          await readErrorMessage(
            response,
            t("admin.applicationReview.couldNotSaveVerdict"),
          ),
        );
        setPending(false);
        return;
      }

      onChanged();
      onClose();
    } catch {
      setError(t("admin.applicationReview.couldNotSaveVerdict"));
      setPending(false);
    }
  }

  const typeLabel = data ? t(VEHICLE_DOCUMENT_TYPE_LABEL_KEYS[data.type]) : "";
  const isApproved = data?.document.status === "APPROVED";
  // A superseded row is history: shown, never judged.
  const isReadOnly = data ? data.document.supersededAt !== null : true;
  const expiryMissing =
    data !== null && isExpiryRequired(data.type) && expiresAt === "";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {data
              ? `${typeLabel} · ${data.vehicle.plateNumber}`
              : t("admin.adminVehicleDocuments.reviewDocument")}
          </DialogTitle>
          <DialogDescription>
            {data
              ? [
                  `${data.vehicle.make} ${data.vehicle.model} ${data.vehicle.year}`,
                  data.driver === null
                    ? t("admin.adminVehicleDocuments.companyVehicle")
                    : `${data.driver.name} · ${data.driver.phone}`,
                ].join(" — ")
              : (loadError ??
                t("admin.adminVehicleDocuments.loadingDocuments"))}
          </DialogDescription>
        </DialogHeader>

        {loadError !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        {data ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <EntryCard
                title={t("admin.adminVehicleDocuments.thisUpload")}
                entry={data.document}
                alt={t("admin.adminVehicleDocuments.documentImageAlt", {
                  type: typeLabel,
                  plate: data.vehicle.plateNumber,
                })}
              />
              {data.onFile === null ? null : (
                <EntryCard
                  title={t("admin.adminVehicleDocuments.documentOnFile")}
                  entry={data.onFile}
                  alt={t("admin.adminVehicleDocuments.documentImageAlt", {
                    type: typeLabel,
                    plate: data.vehicle.plateNumber,
                  })}
                />
              )}
            </div>

            {data.onFile !== null && !isApproved && !isReadOnly ? (
              <p className="text-xs text-muted-foreground">
                {t("admin.adminVehicleDocuments.approvingReplaces")}
              </p>
            ) : null}

            {isReadOnly ? null : (
              <>
                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <Label htmlFor="vehicle-document-expiry">
                    {t("admin.adminVehicleDocuments.expiryDate")}
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="vehicle-document-expiry"
                      type="date"
                      className="w-44"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                      disabled={pending}
                    />
                    <Button
                      type="button"
                      disabled={pending || expiryMissing}
                      onClick={() =>
                        void submit({
                          action: "approve",
                          expiresAt: expiresAt === "" ? null : expiresAt,
                        })
                      }
                    >
                      {pending
                        ? t("common.shared.saving")
                        : isApproved
                          ? t("admin.adminVehicleDocuments.updateExpiryDate")
                          : t("admin.applicationReview.approve")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isExpiryRequired(data.type)
                      ? t("admin.adminVehicleDocuments.expiryHintInsurance")
                      : t("admin.adminVehicleDocuments.expiryHintRegistration")}
                  </p>
                </div>

                {isApproved ? null : (
                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <p className="text-[13px] font-semibold">
                      {t("common.shared.flag")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {VEHICLE_DOCUMENT_FLAG_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            void submit({ action: "flag", reason })
                          }
                          className="cursor-pointer rounded-full border border-border bg-card px-[11px] py-[5px] text-[11.5px] transition-colors hover:border-destructive hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                        >
                          {flagReasonLabel(reason, t)}
                        </button>
                      ))}
                    </div>
                    <Label htmlFor="vehicle-document-other-reason">
                      {t("admin.adminVehicleDocuments.otherReason")}
                    </Label>
                    <Textarea
                      id="vehicle-document-other-reason"
                      value={otherReason}
                      onChange={(event) => setOtherReason(event.target.value)}
                      maxLength={MAX_FLAG_REASON_LENGTH}
                      placeholder={t(
                        "admin.adminVehicleDocuments.otherReasonPlaceholder",
                      )}
                      disabled={pending}
                    />
                    <div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={pending || otherReason.trim() === ""}
                        onClick={() =>
                          void submit({
                            action: "flag",
                            reason: otherReason.trim(),
                          })
                        }
                      >
                        {t("admin.adminVehicleDocuments.flagWithThisReason")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {error !== null ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            {data.history.length > 0 ? (
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <p className="text-[13px] font-semibold">
                  {t("admin.adminVehicleDocuments.earlierUploads")}
                </p>
                <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {data.history.map((entry) => (
                    <li key={entry.documentId}>
                      {formatInstant(format, entry.uploadedAt)} —{" "}
                      {describeEntry(t, format, entry)}
                      {entry.supersededAt === null
                        ? null
                        : ` · ${t("admin.adminVehicleDocuments.replaced")}`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
