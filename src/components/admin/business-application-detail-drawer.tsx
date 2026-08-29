"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Type-only imports, so nothing of the server routes (Prisma, Better Auth) is
// pulled into this client bundle — they are erased at compile time. Sharing the
// shapes with the endpoints that produce them is what stops this panel and the
// API drifting apart.
import type {
  AdminBusinessApplicationDetail,
  AdminBusinessApplicationVehicle,
} from "@/app/api/admin/business-applications/[id]/route";
import type { AdminBusinessCompanyReviewResponse } from "@/app/api/admin/business-applications/[id]/company/route";
import type { AdminBusinessVehicleReviewResponse } from "@/app/api/admin/business-applications/[id]/vehicles/[vehicleId]/route";
import { Button } from "@/components/ui/button";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

/** Placeholder for a field the application has nothing to show for. */
const EMPTY_VALUE = "—";

/**
 * The four company-level flag reasons from the design, verbatim. A chip click
 * *is* the flag action (there is no confirm step), so this exact text is what
 * the company reads on its status screen — and the list is closed on the server
 * too, so an off-list reason is a 400. These four must stay byte for byte
 * identical to `COMPANY_FLAG_REASONS` in
 * `src/app/api/admin/business-applications/[id]/company/route.ts`.
 */
const COMPANY_FLAG_REASONS: readonly string[] = [
  "VAT ID not found in the registry",
  "Address does not match registration",
  "Bank account not held by the entity",
  "Contact person unreachable",
];

/**
 * The six per-vehicle flag reasons from the design, verbatim. Closed on the
 * server for the same reason as the company list — see
 * `src/app/api/admin/business-applications/[id]/vehicles/[vehicleId]/route.ts`.
 */
const VEHICLE_FLAG_REASONS: readonly string[] = [
  "Plate does not match the documents",
  "Payload above the class limit",
  "Dimensions look wrong",
  "Vehicle too old for the platform",
  "Duplicate plate on another fleet",
  "Cooling unit record missing",
];

/**
 * Display names for the three cargo body types. The short "Refrigerated" label
 * rather than the driver drawer's "Refrigerated Vehicle": this surface lists a
 * body type inside a one-line summary, which is where the design uses the short
 * form. Keyed loosely because the API sends `chassisType` as a plain string.
 */
const CHASSIS_LABELS: Record<string, string> = {
  DRY_BOX: "Dry Box",
  REFRIGERATED: "Refrigerated",
  OPEN_CHASSIS: "Open Chassis",
};

/**
 * The design's "approved" green. Inline rather than a token in `globals.css`
 * for the same reason the driver drawer keeps its own copy: it is used on this
 * one surface, so a token would be a palette of one. Flagged reuses the shadcn
 * `--destructive` token, which already covers the design's red.
 */
const STATUS_GREEN = "oklch(0.5 0.13 145)";

/**
 * The reading the header, the fleet heading and the footer fall back to for the
 * whole of the first load, when `data` is still null. A zeroed, unverified
 * reading is exactly what the footer wants: every decision button is already
 * disabled on `data === null`.
 */
const EMPTY_COUNTS = {
  total: 0,
  approved: 0,
  flagged: 0,
  pending: 0,
} as const;

const LOAD_ERROR_FALLBACK = "Could not load this application.";
const COMPANY_VERDICT_ERROR_FALLBACK = "Could not save that verdict.";
const VEHICLE_VERDICT_ERROR_FALLBACK = "Could not save that verdict.";
const REQUEST_CHANGES_ERROR_FALLBACK = "Could not request changes.";
const ACTIVATE_ERROR_FALLBACK = "Could not activate this fleet.";

/**
 * Which request is in flight. One value for all four kinds of mutation rather
 * than a boolean each: every button on the panel is disabled while any of them
 * is running, so a double-click cannot send two `activate` calls, and flagging
 * a vehicle cannot race the request-changes call that reads its verdict.
 */
type PendingAction =
  | { kind: "company" }
  | { kind: "vehicle"; applicationVehicleId: string }
  | { kind: "request-changes" }
  | { kind: "activate" };

type BusinessApplicationDetailDrawerProps = {
  /** `BusinessApplication.id` — the row the queue page opened. */
  applicationId: string;
  /** Dismissed — the parent drops its selection and unmounts this panel. */
  onClose: () => void;
  /** Something about the application changed; the queue should re-fetch. */
  onChanged: () => void;
};

/**
 * Pulls the API's `{ error }` message out of a failed response, so a reviewer
 * sees *why* an action was refused (the company still unverified, a vehicle
 * still pending) rather than the same generic failure every time. Falls back
 * when the body is missing or shaped unexpectedly, which is the case for an
 * infrastructure-level failure.
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

/** `"TBILISI"` → `"Tbilisi"`. Falls back to the stored value for a city that
 *  predates the enum-backed picker, rather than rendering nothing. */
function formatCity(value: string): string {
  return (
    GEORGIAN_CITY_OPTIONS.find((option) => option.value === value)?.label ??
    value
  );
}

/** Renders `value` if it is usable, otherwise the design's em-dash placeholder. */
function orPlaceholder(value: string | null | undefined): string {
  return value !== null && value !== undefined && value !== ""
    ? value
    : EMPTY_VALUE;
}

/**
 * The header's city line — the registered city plus how many *other* cities of
 * operation the company declared, the design's "Tbilisi +2". Same rule as the
 * queue's City column, so a reviewer reads the same string in the row they
 * clicked and in the panel it opened.
 */
function formatCityLine(
  company: AdminBusinessApplicationDetail["company"],
): string {
  if (company.primaryCity === "") return EMPTY_VALUE;

  const label = formatCity(company.primaryCity);
  const otherCitiesCount = company.citiesOfOperation.filter(
    (city) => city !== company.primaryCity,
  ).length;

  return otherCitiesCount > 0 ? `${label} +${otherCitiesCount}` : label;
}

/**
 * The 560px review panel opened from a row of `/admin/business/applications`:
 * the whole application in one scrollable column — the company block with its
 * verify/flag control, one card per vehicle with its own approve/flag control
 * and its assigned driver, and the two decisions that end the review.
 *
 * It fetches its own detail rather than receiving it from the queue, because
 * the queue's row carries only the summary columns, and because the panel has
 * to re-read the application after every verdict anyway.
 *
 * Structurally it follows `driver-application-detail-drawer.tsx`: a hand-rolled
 * backdrop plus right-anchored panel, because there is no Sheet primitive in
 * `src/components/ui` and the two review panels must stay consistent.
 */
export function BusinessApplicationDetailDrawer({
  applicationId,
  onClose,
  onChanged,
}: BusinessApplicationDetailDrawerProps) {
  const router = useRouter();

  const [data, setData] = useState<AdminBusinessApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped to re-run the load effect after a failed load, so "Try again" does
  // not need a second copy of the fetch.
  const [reloadToken, setReloadToken] = useState(0);

  const [pending, setPending] = useState<PendingAction | null>(null);
  // Held separately so one failure does not clear another's explanation: a
  // failed vehicle flag must not wipe the message saying why activation was
  // refused, and vice versa.
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<{
    applicationVehicleId: string;
    message: string;
  } | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  /** Whether the company block's reason chips are expanded. */
  const [companyReasonsOpen, setCompanyReasonsOpen] = useState(false);
  /** Which vehicle card's reason chips are expanded, if any. */
  const [reasonVehicleId, setReasonVehicleId] = useState<string | null>(null);

  const isBusy = pending !== null;

  useEffect(() => {
    const controller = new AbortController();

    // Cleared rather than left in place: `applicationId` changing means a
    // different company, and showing the previous one's VAT id under the new
    // reference for a moment is worse than a brief loading state.
    setData(null);
    setLoading(true);
    setLoadError(null);
    setCompanyError(null);
    setVehicleError(null);
    setVerdictError(null);
    setCompanyReasonsOpen(false);
    setReasonVehicleId(null);

    async function load() {
      try {
        const response = await fetch(
          `/api/admin/business-applications/${applicationId}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setLoadError(await readErrorMessage(response, LOAD_ERROR_FALLBACK));
          setLoading(false);
          return;
        }

        setData((await response.json()) as AdminBusinessApplicationDetail);
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
   * must not blank out and lose the reviewer's scroll position halfway down a
   * forty-vehicle fleet.
   *
   * Best-effort by design: the caller has already applied the endpoint's own
   * response to the thing it acted on, so a failure here leaves the panel
   * slightly stale rather than wrong, and reporting it would show an error for
   * an action that actually succeeded.
   */
  const refreshDetail = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/business-applications/${applicationId}`,
      );
      if (!response.ok) return;

      setData((await response.json()) as AdminBusinessApplicationDetail);
    } catch {
      // Deliberately swallowed — see this function's doc comment.
    }
  }, [applicationId]);

  // `data` is null for the whole of the first load, so the values the header,
  // the fleet heading and the footer all read are derived once here rather than
  // repeated as `data?.…` at every use site. `counts` and `companyReviewStatus`
  // sit at the *top level* of the detail response; only the company's own
  // fields are nested under `data.company`.
  const counts = data?.counts ?? EMPTY_COUNTS;
  const companyReviewStatus = data?.companyReviewStatus ?? "PENDING";
  const companyFlagged = companyReviewStatus === "FLAGGED";
  const isCompanyVerified = companyReviewStatus === "VERIFIED";
  const isCompanyFlagged = companyFlagged;

  // `APPROVED` is terminal — every mutation endpoint refuses an activated
  // fleet — so the panel opens read-only rather than offering buttons that can
  // only 400.
  const isReadOnly = data?.status === "APPROVED";

  // `ACTION_REQUIRED` means changes were requested and the company has not
  // resubmitted yet. Verdicts stay recordable (clearing a corrected vehicle is
  // exactly what should happen here); only activation is off, mirroring the
  // activate endpoint's own refusal — the resubmit path is the only place the
  // fleet is re-validated server-side.
  const isAwaitingCompany = data?.status === "ACTION_REQUIRED";

  /** Records the verdict on the company block. A chip click flags. */
  async function reviewCompany(
    body: { verdict: "VERIFIED" } | { verdict: "FLAGGED"; reason: string },
  ) {
    setPending({ kind: "company" });
    setCompanyError(null);
    setVerdictError(null);

    try {
      const response = await fetch(
        `/api/admin/business-applications/${applicationId}/company`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        setCompanyError(
          await readErrorMessage(response, COMPANY_VERDICT_ERROR_FALLBACK),
        );
        return;
      }

      const verdict =
        (await response.json()) as AdminBusinessCompanyReviewResponse;

      // Applied from the endpoint's own response so the state line updates on
      // this render, whatever the follow-up re-read does.
      setData((previous) =>
        previous === null
          ? previous
          : {
              ...previous,
              companyReviewStatus: verdict.companyReviewStatus,
              companyFlagReason: verdict.companyFlagReason,
            },
      );
      setCompanyReasonsOpen(false);

      // The queue row's status chip is derived from this verdict, so the table
      // has to hear about it too.
      onChanged();
      await refreshDetail();
    } catch {
      setCompanyError(COMPANY_VERDICT_ERROR_FALLBACK);
    } finally {
      setPending(null);
    }
  }

  /**
   * Records the verdict on one vehicle.
   *
   * `applicationVehicleId` is a `BusinessApplicationVehicle.id`, never a
   * `Vehicle.id` — the review row is what carries the verdict and it outlives
   * the vehicle. The route's dynamic segment is spelled `[vehicleId]` only
   * because Next.js forbids two segments named `id` on one path.
   */
  async function reviewVehicle(
    applicationVehicleId: string,
    body: { verdict: "APPROVED" } | { verdict: "FLAGGED"; reason: string },
  ) {
    setPending({ kind: "vehicle", applicationVehicleId });
    setVehicleError(null);
    setVerdictError(null);

    try {
      const response = await fetch(
        `/api/admin/business-applications/${applicationId}/vehicles/${applicationVehicleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        setVehicleError({
          applicationVehicleId,
          message: await readErrorMessage(
            response,
            VEHICLE_VERDICT_ERROR_FALLBACK,
          ),
        });
        return;
      }

      const verdict =
        (await response.json()) as AdminBusinessVehicleReviewResponse;

      setData((previous) => {
        if (previous === null) return previous;

        const vehicles = previous.vehicles.map((entry) =>
          entry.applicationVehicleId === verdict.applicationVehicleId
            ? {
                ...entry,
                status: verdict.status,
                flagReason: verdict.flagReason,
              }
            : entry,
        );

        // Recomputed locally from the updated array so the fleet header line
        // and the footer hint move on this same render; `refreshDetail()` below
        // is what makes them correct if a second reviewer is working the same
        // application.
        return {
          ...previous,
          vehicles,
          counts: {
            total: vehicles.length,
            approved: vehicles.filter((entry) => entry.status === "APPROVED")
              .length,
            flagged: vehicles.filter((entry) => entry.status === "FLAGGED")
              .length,
            pending: vehicles.filter((entry) => entry.status === "PENDING")
              .length,
          },
        };
      });
      setReasonVehicleId(null);

      // The queue row's fleet counts and status chip are derived from these
      // verdicts, so the table has to hear about it too.
      onChanged();
      await refreshDetail();
    } catch {
      setVehicleError({
        applicationVehicleId,
        message: VEHICLE_VERDICT_ERROR_FALLBACK,
      });
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
    kind: "request-changes" | "activate",
    fallbackMessage: string,
  ) {
    setPending(
      kind === "activate" ? { kind: "activate" } : { kind: "request-changes" },
    );
    setCompanyError(null);
    setVehicleError(null);
    setVerdictError(null);

    try {
      const response = await fetch(
        `/api/admin/business-applications/${applicationId}/${kind}`,
        { method: "POST" },
      );

      if (!response.ok) {
        // The endpoint's own refusal, verbatim: a reviewer whose disabled
        // button was working from a stale reading reads the same sentence the
        // hover would have told them.
        setVerdictError(await readErrorMessage(response, fallbackMessage));
        setPending(null);
        return;
      }

      onChanged();
      // Activation writes `LogisticsCompany.activatedAt`, which changes what
      // server-rendered surfaces show; called after both decisions for
      // consistency with the project's rule on server-rendered data.
      router.refresh();
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

  /** What the company will be asked to fix: each flagged vehicle, plus the
   *  company block itself when that is flagged. */
  const flaggedItemCount = counts.flagged + (companyFlagged ? 1 : 0);

  // Evaluated in this order so the hint explains the *currently binding*
  // blocker rather than an earlier one. If an arm ever disagrees with a server
  // guard, the guard is right and the hint is the bug.
  const footerHint = isReadOnly
    ? "This fleet is active — the company can dispatch its approved vehicles."
    : isAwaitingCompany
      ? "Changes were requested — waiting on the company to resubmit before this fleet can be activated."
      : companyReviewStatus === "PENDING"
        ? "Verify the company's details before this fleet can be activated."
        : counts.pending > 0
          ? `${counts.pending} vehicle${counts.pending === 1 ? "" : "s"} still to review.`
          : companyFlagged || counts.flagged > 0
            ? `${flaggedItemCount} item${flaggedItemCount === 1 ? "" : "s"} flagged. Requesting changes sends the fleet back for correction.`
            : counts.approved === 0
              ? "Every vehicle is flagged — approve at least one before activating the fleet."
              : "Company verified and every vehicle decided — ready to activate the fleet.";

  // Mirrors the request-changes endpoint's guards exactly, so a disabled button
  // is never unexplained: the reason is surfaced as the hint, as the button's
  // `title`, and as `verdictError` if the server refuses anyway.
  const requestChangesBlockedReason = isReadOnly
    ? "This fleet has already been activated."
    : isAwaitingCompany
      ? "Changes have already been requested on this application."
      : flaggedItemCount === 0
        ? "Flag the company's details or at least one vehicle before requesting changes."
        : null;

  // The activate endpoint's five refusal messages, verbatim and in its order.
  const activateBlockedReason = isReadOnly
    ? "This fleet has already been activated."
    : isAwaitingCompany
      ? "This application is still waiting on the company to resubmit."
      : companyReviewStatus !== "VERIFIED"
        ? "Verify the company's details before activating the fleet."
        : counts.pending > 0
          ? `${counts.pending} vehicle${counts.pending === 1 ? " is" : "s are"} still pending review. Decide every vehicle before activating the fleet.`
          : counts.approved === 0
            ? "At least one vehicle must be approved before activating the fleet."
            : null;

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
          data ? `Fleet application ${data.reference}` : "Fleet application"
        }
        className="animate-in slide-in-from-right-6 fade-in-0 fixed top-0 right-0 z-50 flex h-full w-[560px] max-w-full flex-col border-l border-border bg-card duration-150"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-[22px] py-5">
          <div className="min-w-0">
            <p className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
              {data?.reference ?? "Application"}
            </p>
            <h2 className="mt-[3px] truncate text-[17px] font-semibold tracking-[-0.01em]">
              {data?.company.companyName ?? "Loading…"}
            </h2>
            <p className="mt-[3px] text-[12.5px] text-muted-foreground">
              {data === null
                ? " "
                : `${counts.total} vehicles · ${formatCityLine(data.company)}`}
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
              <CompanyBlock
                company={data.company}
                companyFlagReason={data.companyFlagReason}
                isCompanyVerified={isCompanyVerified}
                isCompanyFlagged={isCompanyFlagged}
                readOnly={isReadOnly}
                disabled={isBusy}
                saving={pending?.kind === "company"}
                reasonsOpen={companyReasonsOpen}
                error={companyError}
                onToggleReasons={() => setCompanyReasonsOpen((open) => !open)}
                onVerify={() => void reviewCompany({ verdict: "VERIFIED" })}
                onPickReason={(reason) =>
                  void reviewCompany({ verdict: "FLAGGED", reason })
                }
              />

              <section>
                <SectionTitle>
                  Fleet &amp; drivers ({counts.total})
                </SectionTitle>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {`${counts.approved} approved, ${counts.flagged} flagged, ${counts.pending} pending`}
                </p>

                <div className="mt-[9px] flex flex-col gap-[9px]">
                  {data.vehicles.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">
                      No vehicles on this application.
                    </p>
                  ) : (
                    // In the order the endpoint returned them (`createdAt`
                    // ascending) — stable across reloads and across a verdict
                    // being recorded, so the reviewer works down the same list.
                    data.vehicles.map((vehicle) => (
                      <VehicleCard
                        key={vehicle.applicationVehicleId}
                        vehicle={vehicle}
                        readOnly={isReadOnly}
                        disabled={isBusy}
                        saving={
                          pending?.kind === "vehicle" &&
                          pending.applicationVehicleId ===
                            vehicle.applicationVehicleId
                        }
                        error={
                          vehicleError?.applicationVehicleId ===
                          vehicle.applicationVehicleId
                            ? vehicleError.message
                            : null
                        }
                        reasonsOpen={
                          reasonVehicleId === vehicle.applicationVehicleId
                        }
                        onToggleReasons={() =>
                          setReasonVehicleId((current) =>
                            current === vehicle.applicationVehicleId
                              ? null
                              : vehicle.applicationVehicleId,
                          )
                        }
                        onApprove={() =>
                          void reviewVehicle(vehicle.applicationVehicleId, {
                            verdict: "APPROVED",
                          })
                        }
                        onPickReason={(reason) =>
                          void reviewVehicle(vehicle.applicationVehicleId, {
                            verdict: "FLAGGED",
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
            {data === null ? " " : footerHint}
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
              disabled={
                data === null ||
                isReadOnly ||
                isAwaitingCompany ||
                flaggedItemCount === 0 ||
                isBusy
              }
              title={requestChangesBlockedReason ?? undefined}
              onClick={() =>
                void submitVerdict(
                  "request-changes",
                  REQUEST_CHANGES_ERROR_FALLBACK,
                )
              }
            >
              {pending?.kind === "request-changes"
                ? "Requesting…"
                : flaggedItemCount > 0
                  ? `Request changes (${flaggedItemCount})`
                  : "Request changes"}
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-[42px] flex-1 text-[13.5px]"
              disabled={
                data === null || activateBlockedReason !== null || isBusy
              }
              title={activateBlockedReason ?? undefined}
              onClick={() =>
                void submitVerdict("activate", ACTIVATE_ERROR_FALLBACK)
              }
            >
              {pending?.kind === "activate" ? "Activating…" : "Activate fleet"}
            </Button>
          </div>
        </footer>
      </div>
    </>
  );
}

/** The small uppercase heading each block of the panel opens with. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/**
 * The legal entity as the reviewer checks it against the registry, and the one
 * verdict that covers all of it.
 *
 * Every field here is read off the *nested* `data.company` the detail endpoint
 * returns — there is no top-level `data.vatId` or `data.bankAccountIban`.
 */
function CompanyBlock({
  company,
  companyFlagReason,
  isCompanyVerified,
  isCompanyFlagged,
  readOnly,
  disabled,
  saving,
  reasonsOpen,
  error,
  onToggleReasons,
  onVerify,
  onPickReason,
}: {
  company: AdminBusinessApplicationDetail["company"];
  /** Top-level on the detail response, not a property of `company`. */
  companyFlagReason: string | null;
  isCompanyVerified: boolean;
  isCompanyFlagged: boolean;
  readOnly: boolean;
  /** True while any request is in flight. */
  disabled: boolean;
  /** True while *this* verdict is being saved. */
  saving: boolean;
  reasonsOpen: boolean;
  error: string | null;
  onToggleReasons: () => void;
  onVerify: () => void;
  onPickReason: (reason: string) => void;
}) {
  const fields: {
    label: string;
    value: string | null;
    wide?: boolean;
    mono?: boolean;
  }[] = [
    { label: "VAT / tax ID", value: company.vatId },
    { label: "Registered address", value: company.registeredAddress },
    {
      label: "Cities of operation",
      value: company.citiesOfOperation.map(formatCity).join(", "),
      wide: true,
    },
    {
      label: "Contact",
      // Both halves are blank on a company row that predates this feature, in
      // which case the separator alone would render as a bare "·".
      value:
        company.contactName === "" && company.contactRole === ""
          ? ""
          : `${company.contactName} · ${company.contactRole}`,
    },
    { label: "Phone", value: company.phone },
    { label: "Email", value: company.email },
    { label: "Payout account", value: company.bankAccountIban, mono: true },
  ];

  const stateLine = isCompanyVerified
    ? "Verified"
    : isCompanyFlagged
      ? `Flagged — ${orPlaceholder(companyFlagReason)}`
      : "Pending review";

  return (
    <section>
      <SectionTitle>Company</SectionTitle>

      <dl className="mt-[9px] grid grid-cols-2 gap-x-[18px] gap-y-3">
        {fields.map((field) => (
          <div
            key={field.label}
            className={field.wide === true ? "col-span-2 min-w-0" : "min-w-0"}
          >
            <dt className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
              {field.label}
            </dt>
            <dd
              className={`mt-[3px] text-[13.5px] font-medium break-words ${
                field.mono === true ? "font-price" : ""
              }`}
            >
              {orPlaceholder(field.value)}
            </dd>
          </div>
        ))}
      </dl>

      <p
        className={`mt-3 text-[12.5px] font-medium ${
          isCompanyFlagged
            ? "text-destructive"
            : isCompanyVerified
              ? ""
              : "text-muted-foreground"
        }`}
        // The design's approved green has no token — see `STATUS_GREEN`.
        style={isCompanyVerified ? { color: STATUS_GREEN } : undefined}
      >
        {stateLine}
      </p>

      {readOnly ? null : (
        <div className="mt-3 flex gap-1.5">
          <Button
            type="button"
            variant={isCompanyVerified ? "default" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={onVerify}
          >
            {saving ? "Saving…" : "Company details verified"}
          </Button>
          <Button
            type="button"
            variant={isCompanyFlagged ? "destructive" : "outline"}
            size="sm"
            disabled={disabled}
            aria-expanded={reasonsOpen}
            onClick={onToggleReasons}
          >
            Flag company details
          </Button>
        </div>
      )}

      {/* Flag expands the reasons rather than acting immediately — picking a
          chip *is* the flag, which is what keeps the company's status screen
          from ever showing a reasonless rejection. */}
      {reasonsOpen && !readOnly ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
          {COMPANY_FLAG_REASONS.map((reason) => (
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
    </section>
  );
}

/**
 * One vehicle in the fleet: what the company declared, who drives it, the
 * verdict so far and the controls that set it.
 *
 * A row whose `vehicleId` is null is still reviewable — the company removed the
 * vehicle after submitting, and flagging it is exactly what a reviewer should
 * do — which is why only the specification lines are replaced, never the
 * controls.
 */
function VehicleCard({
  vehicle,
  readOnly,
  disabled,
  saving,
  error,
  reasonsOpen,
  onToggleReasons,
  onApprove,
  onPickReason,
}: {
  vehicle: AdminBusinessApplicationVehicle;
  readOnly: boolean;
  /** True while any request is in flight. */
  disabled: boolean;
  /** True while *this* vehicle's own verdict is being saved. */
  saving: boolean;
  error: string | null;
  reasonsOpen: boolean;
  onToggleReasons: () => void;
  onApprove: () => void;
  onPickReason: (reason: string) => void;
}) {
  const isApproved = vehicle.status === "APPROVED";
  const isFlagged = vehicle.status === "FLAGGED";
  const isMissing = vehicle.vehicleId === null;

  // Body · model · year · payload, with absent parts dropped rather than
  // rendered as em-dashes inside a joined line.
  const specLine = [
    CHASSIS_LABELS[vehicle.chassisType] ?? vehicle.chassisType,
    `${vehicle.make} ${vehicle.model}`.trim(),
    vehicle.year === null ? "" : String(vehicle.year),
    vehicle.payloadKg === null
      ? ""
      : `${vehicle.payloadKg.toLocaleString("en-US")} kg`,
  ]
    .filter((part) => part !== "")
    .join(" · ");

  const stateLine = isApproved
    ? "Approved"
    : isFlagged
      ? `Flagged — ${orPlaceholder(vehicle.flagReason)}`
      : "Pending review";

  return (
    <div
      className={`rounded-[11px] border p-[11px] ${
        isFlagged
          ? "border-destructive bg-destructive/5"
          : "border-border bg-card"
      }`}
      // The approved border is the design's green at low opacity, which has no
      // token; the flagged and default cases use the classes above.
      style={
        isApproved
          ? { borderColor: `color-mix(in oklch, ${STATUS_GREEN} 45%, white)` }
          : undefined
      }
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {isMissing ? (
            // Said outright rather than rendered as a line of blanks, which
            // reads as missing data instead of a removed vehicle.
            <div className="rounded-[9px] border border-destructive/40 bg-destructive/5 p-[9px]">
              <p className="text-[13px] font-semibold text-destructive">
                Vehicle no longer on file
              </p>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
                This vehicle was removed after the fleet was submitted. Flag it
                so the company can correct the application.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-[13px] font-semibold">
                  {vehicle.vehicleClassName}
                </p>
                <p className="font-price text-[12px] uppercase">
                  {orPlaceholder(vehicle.plateNumber)}
                </p>
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {orPlaceholder(specLine)}
              </p>
            </>
          )}

          <p
            className={`mt-[3px] text-[11.5px] font-medium ${
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
          {vehicle.driver === null ? (
            // Submit does not allow this, but an admin unassignment afterwards
            // does — and a vehicle nobody drives is a review finding, not a
            // blank line.
            <p className="mt-0.5 text-[11.5px] text-destructive">
              No driver assigned
            </p>
          ) : (
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              {[
                vehicle.driver.name,
                vehicle.driver.phone,
                vehicle.driver.categories.join(", "),
              ]
                .filter((part) => part !== "")
                .join(" · ")}
            </p>
          )}
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
              {saving ? "Saving…" : "Approve"}
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
          {VEHICLE_FLAG_REASONS.map((reason) => (
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
