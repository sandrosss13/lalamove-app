"use client";

import { useCallback, useEffect, useState } from "react";

import type { DriverApplicationDocumentType } from "@prisma/client";

// Type-only imports, so nothing of the server routes (Prisma, Better Auth,
// Supabase) is pulled into this client bundle — they are erased at compile
// time. Sharing the shapes with the endpoints that produce them is what stops
// this panel and the API drifting apart.
import type {
  AdminDriverApplicationDetail,
  AdminDriverApplicationDocument,
} from "@/app/api/admin/driver-applications/[id]/route";
import type { AdminDocumentReviewResponse } from "@/app/api/admin/driver-applications/[id]/documents/[docId]/route";
import { Button } from "@/components/ui/button";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

/** Placeholder for a field the application has nothing to show for. */
const EMPTY_VALUE = "—";

/**
 * The three documents every submitted application carries, in the order the
 * design lists them. The API returns them by upload time, which is the order
 * the driver happened to take the photos in — reviewers work the same three
 * rows all day, so the panel imposes its own fixed order instead.
 */
const DOCUMENT_ORDER: readonly DriverApplicationDocumentType[] = [
  "PROFILE_PHOTO",
  "LICENCE_FRONT",
  "LICENCE_BACK",
];

/** Labels matching the driver's own status screen, so both name the same photo
 *  the same way when a reviewer reads a flag reason back to a driver. */
const DOCUMENT_LABELS: Record<DriverApplicationDocumentType, string> = {
  PROFILE_PHOTO: "Profile photo",
  LICENCE_FRONT: "Licence — front",
  LICENCE_BACK: "Licence — back",
};

/**
 * The six flag reasons from the design, verbatim. A chip click *is* the flag
 * action (there is no confirm step), so this exact text is what the driver
 * reads on their status screen — which is why it is a fixed list rather than
 * free text: six reviewers phrasing "too blurry" six ways helps nobody.
 */
const FLAG_REASONS: readonly string[] = [
  "Photo is blurry",
  "Glare — details unreadable",
  "Face not clearly visible",
  "Wrong document uploaded",
  "Document expired",
  "Does not match the ID",
];

/**
 * Display names for the three cargo body types, matching the design's step-3a
 * cards. Held here rather than imported from a wizard step, for the same
 * reason step 4 keeps its own copy: a read-only summary must not depend on a
 * driver-facing *screen* staying mounted or keeping its constants exported.
 * Keyed loosely because the API sends `chassisType` as a plain string (blank
 * for a vehicle registered before the field was collected).
 */
const CHASSIS_LABELS: Record<string, string> = {
  DRY_BOX: "Dry Box",
  REFRIGERATED: "Refrigerated Vehicle",
  OPEN_CHASSIS: "Open Chassis",
};

/** Short month names, so dates format identically in every reviewer's browser. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The design's "approved" green. Inline rather than a token in `globals.css`
 * for the same reason the driver's status screen keeps its own copy: it is used
 * on this one surface, so a token would be a palette of one. Flagged reuses the
 * shadcn `--destructive` token, which already covers the design's red.
 */
const STATUS_GREEN = "oklch(0.5 0.13 145)";

const LOAD_ERROR_FALLBACK = "Could not load this application.";
const REVIEW_ERROR_FALLBACK = "Could not save that verdict.";
const REQUEST_CHANGES_ERROR_FALLBACK = "Could not request changes.";
const APPROVE_ERROR_FALLBACK = "Could not approve this driver.";

/**
 * Which request is in flight. One value for all three kinds of mutation rather
 * than a boolean each: every button on the panel is disabled while any of them
 * is running, so a double-click cannot send two `approve` calls, and flagging a
 * document cannot race the request-changes call that reads its verdict.
 */
type PendingAction =
  | { kind: "document"; documentId: string }
  | { kind: "request-changes" }
  | { kind: "approve" };

type DriverApplicationDetailDrawerProps = {
  /** `DriverApplication.id` — the row the queue page opened. */
  applicationId: string;
  /** Dismissed — the parent drops its selection and unmounts this panel. */
  onClose: () => void;
  /** Something about the application changed; the queue should re-fetch. */
  onChanged: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response, so a reviewer
 * sees *why* an action was refused (a vehicle removed since submit, a document
 * already superseded) rather than the same generic failure every time. Falls
 * back when the body is missing or shaped unexpectedly, which is the case for
 * an infrastructure-level failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }

  return fallback;
}

/**
 * Formats an ISO date for display by reading the parts out of the string rather
 * than through `Date`.
 *
 * Deliberate, and the same choice the wizard's review step makes: a date of
 * birth or a licence expiry is stored as a date, serialized as UTC midnight, so
 * formatting it in any timezone west of Greenwich renders the *previous* day —
 * an off-by-one on exactly the two fields a reviewer is checking against a
 * document.
 */
function formatDate(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;

  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return null;

  return `${Number(day)} ${monthName} ${year}`;
}

/** "TBILISI" → "Tbilisi". Falls back to the stored value for a profile whose
 *  city predates the enum-backed picker. */
function formatCity(value: string): string | null {
  if (value === "") return null;

  const option = GEORGIAN_CITY_OPTIONS.find((entry) => entry.value === value);
  return option?.label ?? value;
}

/** Renders `value` if it is usable, otherwise the design's em-dash placeholder. */
function orPlaceholder(value: string | null | undefined): string {
  return value !== null && value !== undefined && value !== ""
    ? value
    : EMPTY_VALUE;
}

/**
 * The three documents in the design's order, with any type this build does not
 * know about kept at the end rather than dropped — an unreviewable document
 * that is invisible would block "Approve driver" with no explanation on screen.
 */
function sortDocuments(
  documents: AdminDriverApplicationDocument[],
): AdminDriverApplicationDocument[] {
  const rank = (type: DriverApplicationDocumentType) => {
    const index = DOCUMENT_ORDER.indexOf(type);
    return index === -1 ? DOCUMENT_ORDER.length : index;
  };

  return [...documents].sort((a, b) => rank(a.type) - rank(b.type));
}

/**
 * The 520px review panel opened from a row of `/admin/drivers/applications`:
 * the whole application, a verdict on each of its three documents, and the two
 * decisions that end the review.
 *
 * It fetches its own detail rather than receiving it from the queue, because
 * the queue's row carries only the summary columns, and because the panel has
 * to re-read the application after every verdict anyway.
 *
 * The structure (fixed backdrop, right-anchored panel, Escape/backdrop
 * dismissal) follows `src/components/dashboard/ops/ops-drawer-shell.tsx`, but
 * the markup is this component's own: that shell is painted in the ops
 * console's dark `--ops-*` palette and is wired to the ops dashboard context,
 * neither of which exists in the back office's light shadcn surface.
 */
export function DriverApplicationDetailDrawer({
  applicationId,
  onClose,
  onChanged,
}: DriverApplicationDetailDrawerProps) {
  const [data, setData] = useState<AdminDriverApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped to re-run the load effect after a failed load, so "Try again" does
  // not need a second copy of the fetch.
  const [reloadToken, setReloadToken] = useState(0);

  const [pending, setPending] = useState<PendingAction | null>(null);
  // Kept separate from the footer's error so a failed flag does not clear the
  // message explaining why an approval was refused, and vice versa.
  const [documentError, setDocumentError] = useState<{
    documentId: string;
    message: string;
  } | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  /** Which document's reason chips are expanded, if any. */
  const [reasonDocumentId, setReasonDocumentId] = useState<string | null>(null);

  const isBusy = pending !== null;

  useEffect(() => {
    const controller = new AbortController();

    // Cleared rather than left in place: `applicationId` changing means a
    // different driver, and showing the previous one's data under the new
    // reference for a moment is worse than a brief loading state.
    setData(null);
    setLoading(true);
    setLoadError(null);
    setDocumentError(null);
    setVerdictError(null);
    setReasonDocumentId(null);

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/driver-applications/${applicationId}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setLoadError(await readErrorMessage(response, LOAD_ERROR_FALLBACK));
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminDriverApplicationDetail);
        setLoading(false);
      } catch {
        // An abort is this effect being cleaned up (the panel closed, or a
        // different application was opened), not a failure worth showing.
        if (controller.signal.aborted) {
          return;
        }

        setLoadError(LOAD_ERROR_FALLBACK);
        setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [applicationId, reloadToken]);

  /**
   * Re-reads the detail after a verdict, without touching `loading` — the panel
   * must not blank out and lose the reviewer's scroll position mid-review.
   *
   * Best-effort by design: the caller has already applied the endpoint's own
   * response to the document it acted on, so a failure here leaves the panel
   * correct but slightly stale rather than wrong, and reporting it would show
   * an error for an action that actually succeeded.
   */
  const refreshDetail = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/driver-applications/${applicationId}`,
      );
      if (!response.ok) return;

      setData((await response.json()) as AdminDriverApplicationDetail);
    } catch {
      // Deliberately swallowed — see this function's doc comment.
    }
  }, [applicationId]);

  const documents = data ? sortDocuments(data.documents) : [];
  const reviewedCount = documents.filter(
    (document) => document.status !== "PENDING",
  ).length;
  const flaggedCount = documents.filter(
    (document) => document.status === "FLAGGED",
  ).length;
  // Every required document approved, checked the same way the approve
  // endpoint checks it: a document that was never uploaded fails this exactly
  // as a pending one does, so the button cannot enable on a short list.
  const allApproved = DOCUMENT_ORDER.every((type) =>
    documents.some(
      (document) => document.type === type && document.status === "APPROVED",
    ),
  );

  // `APPROVED` is terminal — all three mutation endpoints reject it — so the
  // panel opens read-only for an application reached through the queue's
  // Approved filter rather than offering buttons that can only 400.
  const isReadOnly = data?.status === "APPROVED";
  const canActOnDocuments = data !== null && !isReadOnly;

  // `ACTION_REQUIRED` means changes were requested and the driver has not
  // resubmitted yet. Retaking a flagged document supersedes it but does *not*
  // go through the submit endpoint, so an application can sit here with all
  // three documents approved and still never have had the driver's age or
  // licence expiry re-checked — which is why the approve endpoint refuses this
  // status outright. Documents stay reviewable (a reviewer clearing a retaken
  // photo is exactly what should happen here); only the final approval is off.
  const isAwaitingDriver = data?.status === "ACTION_REQUIRED";

  /** Records a verdict on one document. A chip click flags; Approve approves. */
  async function reviewDocument(
    documentId: string,
    body: { action: "approve" } | { action: "flag"; reason: string },
  ) {
    setPending({ kind: "document", documentId });
    setDocumentError(null);
    setVerdictError(null);

    try {
      const response = await fetch(
        `/api/admin/driver-applications/${applicationId}/documents/${documentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        setDocumentError({
          documentId,
          message: await readErrorMessage(response, REVIEW_ERROR_FALLBACK),
        });
        return;
      }

      const verdict = (await response.json()) as AdminDocumentReviewResponse;

      // Applied from the endpoint's own response so the state line updates on
      // this render, whatever the follow-up re-read does.
      setData((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              documents: previous.documents.map((document) =>
                document.documentId === verdict.documentId
                  ? {
                      ...document,
                      status: verdict.status,
                      flagReason: verdict.flagReason,
                    }
                  : document,
              ),
            },
      );
      setReasonDocumentId(null);

      // The queue row's Docs count and status chip are derived from these
      // verdicts, so the table has to hear about it too.
      onChanged();
      await refreshDetail();
    } catch {
      setDocumentError({ documentId, message: REVIEW_ERROR_FALLBACK });
    } finally {
      setPending(null);
    }
  }

  /**
   * The two decisions that end the review. Both take no body, both close the
   * panel on success: the application has left the reviewer's current bucket,
   * and a detail view of a row that is no longer in the list it was opened from
   * is stale by definition.
   */
  async function submitVerdict(
    kind: "request-changes" | "approve",
    fallbackMessage: string,
  ) {
    setPending(
      kind === "approve" ? { kind: "approve" } : { kind: "request-changes" },
    );
    setDocumentError(null);
    setVerdictError(null);

    try {
      const response = await fetch(
        `/api/admin/driver-applications/${applicationId}/${kind}`,
        { method: "POST" },
      );

      if (!response.ok) {
        // Covers the vehicle-removed refusal from the approve endpoint the same
        // way it covers any other rejection: the message is shown inline and
        // the panel stays open with its verdicts intact.
        setVerdictError(await readErrorMessage(response, fallbackMessage));
        setPending(null);
        return;
      }

      onChanged();
      // `pending` is deliberately left set: the parent unmounts this panel on
      // `onClose()`, and a button that flicks back to life in between invites a
      // second request.
      onClose();
    } catch {
      setVerdictError(fallbackMessage);
      setPending(null);
    }
  }

  /** Escape closes, except while a request is in flight. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isBusy, onClose]);

  // Ordered so the awaiting-driver case wins over "all documents approved":
  // both are true once a reviewer clears a retaken document, and the one that
  // matters is why the Approve button next to this line is still disabled.
  const footerHint = isReadOnly
    ? "This application is approved — the driver's account is active."
    : isAwaitingDriver
      ? "Changes were requested — waiting on the driver to resubmit before this application can be approved."
      : allApproved
        ? "All documents approved — ready to approve this driver."
        : flaggedCount > 0
          ? `${flaggedCount} document${flaggedCount === 1 ? "" : "s"} flagged. Requesting changes sends the driver back for re-upload.`
          : `${reviewedCount} of ${documents.length} documents reviewed.`;

  return (
    <>
      {/* Dismissal is also on Escape and the close button, so this backdrop is
          a redundant affordance rather than the only way out. */}
      <div
        onClick={() => {
          if (!isBusy) onClose();
        }}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/20"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          data ? `Application ${data.reference}` : "Driver application"
        }
        className="animate-in slide-in-from-right-6 fade-in-0 fixed top-0 right-0 z-50 flex h-full w-[520px] max-w-full flex-col border-l border-border bg-card duration-150"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-[22px] py-5">
          <div className="min-w-0">
            <p className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
              {data?.reference ?? "Application"}
            </p>
            <h2 className="mt-[3px] truncate text-[17px] font-semibold tracking-[-0.01em]">
              {data?.driver.name ?? "Loading…"}
            </h2>
            <p className="mt-[3px] text-[12.5px] text-muted-foreground">
              {data ? describeVehicle(data) : " "}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
          >
            ×
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-[22px] py-[18px]">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Loading application…
            </p>
          ) : loadError !== null ? (
            <div className="flex flex-col items-start gap-3">
              <p role="alert" className="text-sm text-destructive">
                {loadError}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReloadToken((token) => token + 1)}
              >
                Try again
              </Button>
            </div>
          ) : data !== null ? (
            <div className="flex flex-col gap-5">
              <FieldSection
                title="Applicant"
                fields={[
                  { label: "ID number", value: data.driver.idNumber },
                  {
                    label: "Date of birth",
                    value: formatDate(data.driver.dateOfBirth),
                  },
                  { label: "Mobile", value: data.driver.mobile },
                  { label: "City", value: formatCity(data.driver.city) },
                ]}
              />

              <FieldSection
                title="Licence"
                fields={[
                  { label: "Licence no.", value: data.licence.number },
                  {
                    label: "Licence expiry",
                    value: formatDate(data.licence.expiresAt),
                  },
                  {
                    label: "Categories",
                    value: data.licence.categories.join(", "),
                  },
                ]}
              />

              {data.vehicle !== null ? (
                <FieldSection
                  title="Vehicle"
                  fields={[
                    { label: "Class", value: data.vehicle.vehicleClassName },
                    {
                      label: "Body type",
                      value: CHASSIS_LABELS[data.vehicle.chassisType] ?? null,
                    },
                    {
                      label: "Make / model",
                      value: `${data.vehicle.make} ${data.vehicle.model}`,
                    },
                    {
                      label: "Year / colour",
                      value: `${data.vehicle.year} · ${orPlaceholder(data.vehicle.colour)}`,
                    },
                    { label: "Plate", value: data.vehicle.plateNumber },
                    {
                      label: "Payload",
                      value:
                        data.vehicle.payloadKg === null
                          ? null
                          : `${data.vehicle.payloadKg.toLocaleString("en-US")} kg`,
                    },
                    {
                      label: "Cargo hold",
                      value: formatCargoHold(data.vehicle),
                    },
                  ]}
                />
              ) : (
                // The vehicle can disappear between submit and this review:
                // `DriverApplication.vehicleId` is `SetNull`, so a driver
                // removing it from their own dashboard leaves the application
                // standing without one. Said outright rather than rendered as a
                // grid of em-dashes, which reads as missing data instead of a
                // removed vehicle — and it is also why the approve endpoint
                // refuses this application.
                <section>
                  <SectionTitle>Vehicle</SectionTitle>
                  <div className="mt-[9px] rounded-[11px] border border-destructive/40 bg-destructive/5 p-[13px]">
                    <p className="text-[13px] font-semibold text-destructive">
                      Vehicle no longer on file
                    </p>
                    <p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
                      The driver removed this vehicle after submitting. They
                      cannot be approved until a vehicle is registered again.
                    </p>
                  </div>
                </section>
              )}

              <section>
                <SectionTitle>Documents ({documents.length})</SectionTitle>
                <div className="mt-[9px] flex flex-col gap-[9px]">
                  {documents.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                      No documents on this application.
                    </p>
                  ) : (
                    documents.map((document) => (
                      <DocumentRow
                        key={document.documentId}
                        document={document}
                        disabled={!canActOnDocuments || isBusy}
                        pending={
                          pending?.kind === "document" &&
                          pending.documentId === document.documentId
                        }
                        readOnly={isReadOnly}
                        error={
                          documentError?.documentId === document.documentId
                            ? documentError.message
                            : null
                        }
                        reasonsOpen={reasonDocumentId === document.documentId}
                        onToggleReasons={() =>
                          setReasonDocumentId((current) =>
                            current === document.documentId
                              ? null
                              : document.documentId,
                          )
                        }
                        onApprove={() =>
                          void reviewDocument(document.documentId, {
                            action: "approve",
                          })
                        }
                        onPickReason={(reason) =>
                          void reviewDocument(document.documentId, {
                            action: "flag",
                            reason,
                          })
                        }
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-border bg-muted/40 px-[22px] py-3.5">
          <p className="mb-2.5 text-xs text-muted-foreground">
            {data === null ? " " : footerHint}
          </p>

          {verdictError !== null ? (
            <p role="alert" className="mb-2.5 text-[13px] text-destructive">
              {verdictError}
            </p>
          ) : null}

          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="destructive"
              size="lg"
              className="h-[42px] flex-1 text-[13.5px]"
              // Requesting changes with nothing flagged would send the driver an
              // "action required" screen listing nothing to fix — the endpoint
              // refuses it for the same reason.
              disabled={
                data === null || isReadOnly || flaggedCount === 0 || isBusy
              }
              onClick={() =>
                void submitVerdict(
                  "request-changes",
                  REQUEST_CHANGES_ERROR_FALLBACK,
                )
              }
            >
              {pending?.kind === "request-changes"
                ? "Requesting…"
                : flaggedCount > 0
                  ? `Request changes (${flaggedCount})`
                  : "Request changes"}
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-[42px] flex-1 text-[13.5px]"
              // `isAwaitingDriver` mirrors the approve endpoint's own refusal:
              // an `ACTION_REQUIRED` application has not been through the
              // resubmit path that re-checks age and licence expiry.
              disabled={
                data === null ||
                isReadOnly ||
                isAwaitingDriver ||
                !allApproved ||
                isBusy
              }
              onClick={() =>
                void submitVerdict("approve", APPROVE_ERROR_FALLBACK)
              }
            >
              {pending?.kind === "approve" ? "Approving…" : "Approve driver"}
            </Button>
          </div>
        </footer>
      </div>
    </>
  );
}

/** The vehicle line under the driver's name in the header. */
function describeVehicle(data: AdminDriverApplicationDetail): string {
  if (data.vehicle === null) {
    return "No vehicle on file";
  }

  return [
    data.vehicle.vehicleClassName,
    CHASSIS_LABELS[data.vehicle.chassisType],
    data.vehicle.plateNumber,
  ]
    .filter((part): part is string => part !== undefined && part !== "")
    .join(" · ");
}

/** `"4.2 × 2.1 × 2.3 m"`, or null unless all three dimensions are declared —
 *  two out of three is not a cargo hold, it is a half-filled form. */
function formatCargoHold(vehicle: {
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
}): string | null {
  const { cargoLengthM, cargoWidthM, cargoHeightM } = vehicle;

  if (cargoLengthM === null || cargoWidthM === null || cargoHeightM === null) {
    return null;
  }

  return `${cargoLengthM} × ${cargoWidthM} × ${cargoHeightM} m`;
}

/** The small uppercase heading each block of the panel opens with. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/** One titled block of the two-column applicant grid. */
function FieldSection({
  title,
  fields,
}: {
  title: string;
  fields: { label: string; value: string | null }[];
}) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <dl className="mt-[9px] grid grid-cols-2 gap-x-[18px] gap-y-3">
        {fields.map((field) => (
          <div key={field.label} className="min-w-0">
            <dt className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              {field.label}
            </dt>
            <dd className="mt-[3px] text-[13.5px] font-medium break-words">
              {orPlaceholder(field.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * One document: its thumbnail, the reviewer's verdict so far, and the controls
 * that set it. Flag expands the reason chips rather than acting immediately —
 * picking a chip is the flag, which is what the design specifies and what keeps
 * the driver's status screen from ever showing a reasonless rejection.
 */
function DocumentRow({
  document,
  disabled,
  pending,
  readOnly,
  error,
  reasonsOpen,
  onToggleReasons,
  onApprove,
  onPickReason,
}: {
  document: AdminDriverApplicationDocument;
  /** True while any request is in flight, or when the application is terminal. */
  disabled: boolean;
  /** True while *this* document's own verdict is being saved. */
  pending: boolean;
  readOnly: boolean;
  error: string | null;
  reasonsOpen: boolean;
  onToggleReasons: () => void;
  onApprove: () => void;
  onPickReason: (reason: string) => void;
}) {
  const label = DOCUMENT_LABELS[document.type] ?? document.type;
  const isApproved = document.status === "APPROVED";
  const isFlagged = document.status === "FLAGGED";

  const stateLine = isApproved
    ? "Approved"
    : isFlagged
      ? `Flagged — ${orPlaceholder(document.flagReason)}`
      : "Pending review";

  return (
    <div
      className={`rounded-[11px] border p-[11px] ${
        isFlagged
          ? "border-destructive bg-destructive/5"
          : isApproved
            ? "bg-card"
            : "border-border bg-card"
      }`}
      // The approved border is the design's green at low opacity, which has no
      // token; the flagged and default cases use classes above.
      style={
        isApproved
          ? { borderColor: `color-mix(in oklch, ${STATUS_GREEN} 45%, white)` }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        {document.signedUrl !== null ? (
          <>
            {/*
              Plain <img> rather than next/image: driver documents live in a
              private Supabase bucket behind a short-lived signed URL, on a host
              configured per deployment, so it cannot be pinned in
              `remotePatterns` at build time.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={document.signedUrl}
              alt={`${label} uploaded by the applicant`}
              loading="lazy"
              className="h-11 w-[60px] shrink-0 rounded-[7px] border border-border object-cover"
            />
          </>
        ) : (
          // The document exists but its read URL could not be signed. A neutral
          // tile keeps the row's shape without a broken image.
          <div
            aria-hidden="true"
            className="h-11 w-[60px] shrink-0 rounded-[7px] bg-muted"
          />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{label}</p>
          <p
            className={`mt-0.5 text-[11.5px] font-medium ${
              isFlagged
                ? "text-destructive"
                : isApproved
                  ? ""
                  : "text-muted-foreground"
            }`}
            style={isApproved ? { color: STATUS_GREEN } : undefined}
          >
            {stateLine}
          </p>
        </div>

        {readOnly ? null : (
          <div className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              variant={isApproved ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              onClick={onApprove}
            >
              {pending ? "Saving…" : "Approve"}
            </Button>
            <Button
              type="button"
              variant={isFlagged ? "destructive" : "outline"}
              size="sm"
              disabled={disabled}
              aria-expanded={reasonsOpen}
              onClick={onToggleReasons}
            >
              Flag
            </Button>
          </div>
        )}
      </div>

      {reasonsOpen && !readOnly ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
          {FLAG_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={disabled}
              onClick={() => onPickReason(reason)}
              className="cursor-pointer rounded-full border border-border bg-card px-[11px] py-[5px] text-[11.5px] transition-colors hover:border-destructive hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {reason}
            </button>
          ))}
        </div>
      ) : null}

      {error !== null ? (
        <p role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
