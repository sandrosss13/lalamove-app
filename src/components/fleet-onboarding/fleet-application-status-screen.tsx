"use client";

/**
 * What a logistics company sees once its application has been submitted at
 * least once: pending review, action required, and approved.
 *
 * `task-09`'s shell renders this in place of every wizard step whenever
 * `status !== "DRAFT"`, so it takes no props and reads everything from
 * `useFleetDraft()`. It also never calls `goToStep` — and that is the single
 * most load-bearing decision on this screen. The shell mounts this component
 * for *every* non-`DRAFT` status and its rail raises a toast instead of
 * navigating, so `goToStep(FLEET_SCREENS.company)` would change `draftStep` and
 * render nothing at all: the company block would be permanently uncorrectable,
 * `companyFlagReason` would never clear, and the resubmit endpoint would refuse
 * forever. **Both Fix affordances are therefore dialogs rendered over this
 * screen**, each writing through its own targeted endpoint.
 *
 * Unlike the driver flow's status screen, which reports one verdict on one
 * application, this one carries a company-level verdict *and* a verdict per
 * vehicle, and the layout has to make clear that the two move independently: a
 * flagged vehicle is corrected on its own without disturbing the rest of the
 * fleet, and an approved vehicle keeps its verdict across a resubmission (which
 * is `task-14`'s guarantee — this screen only promises it in copy).
 *
 * Nothing here ever clears a flag optimistically. The per-vehicle `PATCH` and
 * `POST /api/logistics-company` each clear their own flag server-side in the
 * same transaction as the edit, so this screen re-renders from `refetch()`
 * instead. An optimistic clear would enable Resubmit against state the server
 * may have rejected.
 *
 * The draft context polls in the background while the application is `PENDING`
 * or `ACTION_REQUIRED` (25s, silent), so an admin's decision reaches this screen
 * on its own. No second poller lives here.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  useFleetDraft,
  type FleetCompanyReviewStatus,
  type FleetSubmittedSummary,
  type FleetVehicleVerdict,
} from "@/components/fleet-onboarding/fleet-draft-context";
import { CompanyDetailsForm } from "@/components/fleet-onboarding/steps/step-1-company-details";
import {
  VehicleEditorDialog,
  type VehicleEditorValues,
} from "@/components/fleet-onboarding/vehicle-editor-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BODY_TYPES,
  VEHICLE_CLASSES,
} from "@/lib/driver-onboarding/vehicle-classes";
import type { FleetDraftCompany } from "@/lib/fleet-onboarding/draft-schema";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

/** `POST` with no body; answers `{ status, reference }` or `{ error }`. */
const SUBMIT_ENDPOINT = "/api/logistics-company/onboarding/submit";

/**
 * The per-vehicle correction endpoint, keyed on **`FleetVehicleVerdict.vehicleId`**
 * — the `Vehicle` — never on `FleetVehicleVerdict.id`, which is the
 * `BusinessApplicationVehicle` review row the admin routes address. The two are
 * different values on every row and swapping them produces a 404 rather than a
 * type error.
 */
const VEHICLES_ENDPOINT = "/api/logistics-company/onboarding/vehicles";

const RESUBMIT_ERROR_FALLBACK =
  "We couldn't resubmit your application. Please try again.";
const VEHICLE_SAVE_ERROR_FALLBACK =
  "We couldn't save this vehicle. Please try again.";

/** Raised after the server has cleared a vehicle's flag and we have re-read. */
const VEHICLE_SAVED_TOAST =
  "Vehicle updated. Resubmit when every flagged item is fixed.";

/**
 * The two status colours the design names that have no counterpart in the
 * shadcn token set (`--destructive` already covers its red). Applied inline
 * rather than added to `globals.css`, exactly as the driver flow's status screen
 * and the fleet step rail do: they are used on this one screen, so a token would
 * be a palette of one. Values are the design prototype's `GREEN` and `AMBER`.
 */
const STATUS_GREEN = "oklch(0.5 0.13 145)";
const STATUS_AMBER = "oklch(0.62 0.15 70)";

/** Shared chip geometry for the per-vehicle verdict column. */
const CHIP_CLASS =
  "inline-flex items-center rounded-md px-2.5 py-1 text-[11.5px] font-semibold whitespace-nowrap";

/**
 * The verdict chip's ink and tint per status, in the same arbitrary-value form
 * step 3's "Ready" pill uses — `color-mix` against `--card` so each tint lands
 * at the same strength regardless of which colour space its accent is in.
 */
const CHIP_TONE: Record<FleetVehicleVerdict["status"], string> = {
  APPROVED:
    "bg-[color-mix(in_oklch,oklch(0.5_0.13_145)_12%,var(--card))] text-[oklch(0.5_0.13_145)]",
  FLAGGED: "bg-destructive/10 text-destructive",
  PENDING:
    "bg-[color-mix(in_oklch,oklch(0.62_0.15_70)_14%,var(--card))] text-[oklch(0.62_0.15_70)]",
};

/** The human word for each verdict, as the design's chip reads it. */
const CHIP_LABEL: Record<FleetVehicleVerdict["status"], string> = {
  APPROVED: "Approved",
  FLAGGED: "Flagged",
  PENDING: "Pending",
};

/** The design's placeholder for a cell the verdict has nothing for. */
const EMPTY_VALUE = "—";

/** Stands in for the plate of a vehicle that has left the fleet out of band. */
const REMOVED_VEHICLE_LABEL = "Vehicle no longer on file";

/**
 * Reads an `{ error }` body without letting a non-JSON response (an HTML error
 * page from an unhandled crash, say) throw over the top of the real failure.
 * Defined here rather than imported: the context's copy is not exported, and it
 * is four lines — the same call step 1 and step 5 make.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return payload?.error ?? fallback;
}

/**
 * The class's display name, looked up rather than resolved through
 * `findVehicleClass`, which *throws* on an unknown id. A verdict's
 * `vehicleClass` is a denormalised database column, so a row written before a
 * taxonomy change must degrade to its raw value rather than blanking the whole
 * status screen. Same reasoning for the body label below.
 */
function classNameFor(id: string): string {
  return VEHICLE_CLASSES.find((entry) => entry.id === id)?.name ?? id;
}

function bodyLabelFor(id: string): string {
  return BODY_TYPES.find((entry) => entry.id === id)?.shortLabel ?? id;
}

/** "TBILISI" → "Tbilisi", via the same option list the city picker uses. */
function formatCity(value: string): string {
  return (
    GEORGIAN_CITY_OPTIONS.find((entry) => entry.value === value)?.label ?? value
  );
}

/** "2 vehicles", "1 vehicle". */
function vehicleCountLabel(count: number): string {
  return `${count} vehicle${count === 1 ? "" : "s"}`;
}

/**
 * The action-required title.
 *
 * The design names two of these — "Company details need correcting" and
 * "2 vehicles need correcting" — but says nothing about both being flagged at
 * once, which the admin drawer plainly allows. The third case is an explicit
 * extension, spelled out here rather than left to a nested ternary at the call
 * site because all three have to agree about pluralisation.
 */
function actionRequiredTitle(
  flaggedVehicles: number,
  companyFlagged: boolean,
): string {
  const vehicles = `${flaggedVehicles} vehicle${
    flaggedVehicles === 1 ? "" : "s"
  } need${flaggedVehicles === 1 ? "s" : ""} correcting`;

  if (companyFlagged && flaggedVehicles === 0) {
    return "Company details need correcting";
  }

  if (companyFlagged) {
    return `Company details and ${vehicles}`;
  }

  return vehicles;
}

/**
 * The Fix editor's starting values for one flagged vehicle. Seeded straight from
 * the verdict, which carries the full declared specification for exactly this
 * reason — there is no per-vehicle endpoint to fetch it from.
 *
 * `prefillSource` is null because nothing was prefilled from the reference table
 * on this pass: this is a correction, not a fresh vehicle. Picking a model
 * inside the dialog sets it as usual, and the field is never sent to the server
 * either way.
 */
function editorValuesFor(verdict: FleetVehicleVerdict): VehicleEditorValues {
  return {
    make: verdict.make ?? "",
    model: verdict.model ?? "",
    prefillSource: null,
    year: verdict.year ?? undefined,
    plateNumber: verdict.plateNumber ?? "",
    colour: verdict.colour ?? "",
    payloadKg: verdict.payloadKg ?? undefined,
    cargoLengthM: verdict.cargoLengthM ?? undefined,
    cargoWidthM: verdict.cargoWidthM ?? undefined,
    cargoHeightM: verdict.cargoHeightM ?? undefined,
  };
}

/**
 * The plates held by every *other* vehicle on the application, uppercased and
 * keyed to that vehicle's row number, so the editor's in-fleet duplicate check
 * still works when it is mounted here rather than inside step 3.
 *
 * Keyed on the review row's `id` to decide which row to exclude — that is the
 * identity of the row being edited, and it is present even when its `vehicleId`
 * is null.
 */
function otherPlatesFor(
  verdicts: FleetVehicleVerdict[],
  editing: FleetVehicleVerdict,
): Map<string, number> {
  const plates = new Map<string, number>();

  for (const verdict of verdicts) {
    if (verdict.id === editing.id || verdict.plateNumber === null) continue;
    plates.set(verdict.plateNumber.toUpperCase(), verdict.position);
  }

  return plates;
}

/**
 * The company fields as `CompanyDetailsForm` seeds from them.
 *
 * `bankAccountIban` is deliberately absent: the summary masks it to its last
 * four characters, so seeding it would post bullets over a good account number.
 * The form re-blanks the field in correction mode anyway; leaving it out here
 * means neither side depends on the other doing so.
 */
function companyFromSummary(summary: FleetSubmittedSummary): FleetDraftCompany {
  return {
    phone: summary.phone,
    companyName: summary.companyName,
    vatId: summary.vatId,
    registeredAddress: summary.registeredAddress,
    city: summary.city,
    citiesOfOperation: summary.citiesOfOperation,
    contactName: summary.contactName,
    contactRole: summary.contactRole,
    contactEmail: summary.contactEmail,
  };
}

export function FleetApplicationStatusScreen() {
  const {
    status,
    reference,
    companyReviewStatus,
    companyFlagReason,
    vehicleVerdicts,
    submittedSummary,
    refetch,
    showToast,
  } = useFleetDraft();

  const router = useRouter();

  /**
   * Which review row the Fix editor is showing. The *id* rather than the row
   * itself, so the dialog always renders against the freshest verdict the poll
   * has delivered rather than a snapshot taken when it opened. `editorOpen` is
   * what actually opens and closes it, which is what lets the dialog animate out
   * over a row that still exists.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [vehicleSaveError, setVehicleSaveError] = useState<string | null>(null);

  const [companyOpen, setCompanyOpen] = useState(false);
  /**
   * Bumped every time the company dialog opens, and used as the form's `key`.
   *
   * `CompanyDetailsForm` seeds its correction-mode state once, in a `useState`
   * initialiser, so a form left mounted across a close/reopen would come back
   * holding the previous session's edits — including a half-typed IBAN over an
   * account the company has since saved. Remounting is the same guarantee the
   * vehicle editor gets from its own re-seed-on-open effect.
   */
  const [companySession, setCompanySession] = useState(0);

  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

  // Guard rather than an assumption: the shell only mounts this component once
  // the application has been submitted, but rendering nothing is the right
  // answer if that ever changes, not a card describing the wrong state.
  if (status === null || status === "DRAFT") return null;

  // Ordered by `position` rather than trusted from the response: it is the
  // number the company saw in steps 3 and 4 and the one the reviewer sees, so
  // the rows are sorted by it here as well.
  const verdicts = [...vehicleVerdicts].sort((a, b) => a.position - b.position);

  const flaggedVehicles = verdicts.filter(
    (verdict) => verdict.status === "FLAGGED",
  );
  const approvedVehicles = verdicts.filter(
    (verdict) => verdict.status === "APPROVED",
  );
  const companyFlagged = companyReviewStatus === "FLAGGED";

  // A verdict whose vehicle has been removed still counts here. The server would
  // refuse the resubmission anyway, and the row cannot be corrected from this
  // screen — the company needs support, not a button that cannot work.
  const outstanding = flaggedVehicles.length + (companyFlagged ? 1 : 0);

  const editing = verdicts.find((verdict) => verdict.id === editingId) ?? null;

  function openEditor(verdict: FleetVehicleVerdict) {
    setEditingId(verdict.id);
    setVehicleSaveError(null);
    setEditorOpen(true);
  }

  function openCompanyDialog() {
    setCompanySession((session) => session + 1);
    setCompanyOpen(true);
  }

  /**
   * Writes one corrected vehicle. Resolves `false` on failure so the dialog
   * stays open over its own `saveError`, which is the contract that `saving` and
   * `saveError` exist for.
   */
  async function handleVehicleSave(
    verdict: FleetVehicleVerdict,
    values: VehicleEditorValues,
  ): Promise<boolean> {
    // Unreachable from the UI — a row with no vehicle renders no Fix button —
    // but there is nothing to address without it, so this never guesses an id.
    if (verdict.vehicleId === null) {
      setVehicleSaveError(VEHICLE_SAVE_ERROR_FALLBACK);
      return false;
    }

    setVehicleSaving(true);
    setVehicleSaveError(null);

    try {
      const response = await fetch(
        // `verdict.vehicleId`, never `verdict.id`: see `VEHICLES_ENDPOINT`.
        `${VEHICLES_ENDPOINT}/${verdict.vehicleId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // The editor collects no class or body — a correction cannot change
            // which cell of the fleet grid this vehicle sits in — so both are
            // carried through from the verdict, which is what the endpoint
            // re-resolves the spec from.
            classId: verdict.vehicleClass,
            chassisType: verdict.chassisType,
            make: values.make,
            model: values.model,
            year: values.year,
            plateNumber: values.plateNumber,
            colour: values.colour,
            payloadKg: values.payloadKg,
            cargoLengthM: values.cargoLengthM,
            cargoWidthM: values.cargoWidthM,
            cargoHeightM: values.cargoHeightM,
          }),
        },
      );

      if (!response.ok) {
        setVehicleSaveError(
          await readErrorMessage(response, VEHICLE_SAVE_ERROR_FALLBACK),
        );
        return false;
      }
    } catch {
      setVehicleSaveError(VEHICLE_SAVE_ERROR_FALLBACK);
      return false;
    } finally {
      setVehicleSaving(false);
    }

    // The row stays visibly flagged until this resolves: the *server* cleared
    // the flag, in the same transaction as the vehicle, and re-reading is what
    // moves the chip to Pending and takes one item off the Resubmit label.
    await refetch();
    showToast(VEHICLE_SAVED_TOAST);
    return true;
  }

  async function handleResubmit() {
    setResubmitting(true);
    setResubmitError(null);

    try {
      // No body on purpose: the endpoint validates its own saved state, so there
      // is nothing left for this screen to send.
      const response = await fetch(SUBMIT_ENDPOINT, { method: "POST" });

      if (!response.ok) {
        // A 400 here means the server disagrees that everything is fixed —
        // exactly the case the disabled state cannot prevent, since the 25s poll
        // can pick up a new flag between this render and the click.
        setResubmitError(
          await readErrorMessage(response, RESUBMIT_ERROR_FALLBACK),
        );
        return;
      }

      // The server decides the new status; re-reading it is what swaps this
      // screen over to the pending state.
      await refetch();
    } catch {
      setResubmitError(RESUBMIT_ERROR_FALLBACK);
    } finally {
      setResubmitting(false);
    }
  }

  return (
    <div className="max-w-[820px]">
      <header className="border-b border-border pb-5">
        <p className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          Application {reference ?? EMPTY_VALUE}
        </p>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
          {submittedSummary?.companyName ?? "Your application"}
        </h1>
      </header>

      <div className="flex flex-col gap-4 pt-[22px]">
        {status === "PENDING" ? (
          <>
            <StatusCard
              tag="Pending verification"
              accent={STATUS_AMBER}
              title="Fleet under review"
              // The design splits this exactly here: the title is "Fleet under
              // review" and the body starts at "Our team…". The handoff README
              // prints the pair as one sentence, which is where the apparent
              // duplicate leading sentence comes from — rendering it would
              // repeat the title verbatim one line below itself.
              body="Our team is checking the company registration, then each vehicle and its driver. Vehicles are cleared individually — you can start dispatching as soon as the company is approved and at least one vehicle passes."
            />
            <CompanyRegistrationRow reviewStatus={companyReviewStatus} />
          </>
        ) : null}

        {status === "ACTION_REQUIRED" ? (
          <>
            <StatusCard
              tag="Action required"
              accent="var(--destructive)"
              title={actionRequiredTitle(
                flaggedVehicles.length,
                companyFlagged,
              )}
              body="The rest of the fleet is unaffected and stays in review. Fix what is flagged below and resubmit — approved vehicles keep their verdict."
            />

            {companyFlagged ? (
              <section className="rounded-[14px] border border-destructive bg-destructive/4 p-[18px]">
                <h2 className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
                  Company details
                </h2>
                {companyFlagReason !== null ? (
                  <p className="mt-2 text-[13.5px] leading-[1.5] text-destructive">
                    {companyFlagReason}
                  </p>
                ) : null}
                {/* A dialog, never `goToStep`: the shell has no editable step
                    left to route back to. See this file's header comment. */}
                <button
                  type="button"
                  onClick={openCompanyDialog}
                  className="mt-3.5 h-10 cursor-pointer rounded-[9px] bg-destructive px-4 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Fix company details
                </button>
              </section>
            ) : null}
          </>
        ) : null}

        {status === "APPROVED" ? (
          <>
            <StatusCard
              tag="Approved"
              accent={STATUS_GREEN}
              title="Your fleet is live."
              body="The company account is active and every approved vehicle can be dispatched. Assign new vehicles or drivers any time from the dispatch dashboard."
            />
            {submittedSummary !== null ? (
              <ApprovedSummary summary={submittedSummary} />
            ) : null}
          </>
        ) : null}

        <FleetStatusTable
          verdicts={verdicts}
          approved={approvedVehicles.length}
          flagged={flaggedVehicles.length}
          // Corrections are only open in ACTION_REQUIRED — the endpoint refuses
          // every other status with "This application isn't open for
          // corrections." — so no other state renders a Fix button.
          canFix={status === "ACTION_REQUIRED"}
          onFix={openEditor}
        />

        {status === "APPROVED" && flaggedVehicles.length > 0 ? (
          // Activation requires every vehicle *decided*, not every vehicle
          // approved, so a flagged vehicle can legitimately survive into a live
          // fleet — and it cannot be corrected from here any more.
          <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
            Flagged vehicles cannot be dispatched. Contact support to have one
            re-reviewed.
          </p>
        ) : null}

        {status === "ACTION_REQUIRED" ? (
          <div className="flex flex-col gap-2.5">
            {resubmitError !== null ? (
              <p role="alert" className="text-[13px] text-destructive">
                {resubmitError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleResubmit()}
              disabled={outstanding > 0 || resubmitting}
              className="h-12 w-fit cursor-pointer rounded-[11px] bg-onboarding-accent px-[26px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              {outstanding > 0
                ? `Resubmit (${outstanding} to fix)`
                : resubmitting
                  ? "Resubmitting…"
                  : "Resubmit application"}
            </button>
          </div>
        ) : null}

        {status === "APPROVED" ? (
          <button
            type="button"
            onClick={() => {
              router.push("/dashboard");
              router.refresh();
            }}
            style={{ backgroundColor: STATUS_GREEN }}
            className="h-[50px] w-fit cursor-pointer rounded-xl px-[26px] text-[15.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Open the dispatch dashboard
          </button>
        ) : null}

        <Footnote>
          {status === "PENDING"
            ? "Typical review time is 24–48 hours for a fleet this size."
            : status === "ACTION_REQUIRED"
              ? "Resubmitted applications are usually reviewed within 4 hours."
              : "Licences and cooling-unit records are re-checked 30 days before expiry."}
        </Footnote>
      </div>

      {editing !== null ? (
        <VehicleEditorDialog
          // Keyed on the row so a different vehicle can never inherit the
          // previous one's field state, on top of the dialog's own re-seed.
          key={editing.id}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          index={editing.position}
          classId={editing.vehicleClass}
          chassisType={editing.chassisType}
          initial={editorValuesFor(editing)}
          otherPlates={otherPlatesFor(verdicts, editing)}
          onToast={showToast}
          saving={vehicleSaving}
          saveError={vehicleSaveError}
          onSave={(values) => handleVehicleSave(editing, values)}
        />
      ) : null}

      {submittedSummary !== null ? (
        <Dialog open={companyOpen} onOpenChange={setCompanyOpen}>
          <DialogContent
            // The content portals to `document.body`, outside the wizard's own
            // `[data-onboarding-surface]` element, so it carries the marker
            // itself — without it the `src/components/ui` primitives inside
            // resolve `border`/`muted`/`accent` against the landing palette.
            data-onboarding-surface=""
            // The primitive defaults to `sm:max-w-sm`, so this is an override
            // rather than an addition; 680px is the width the form is designed
            // at inside the wizard column.
            className="w-full gap-0 rounded-2xl p-0 sm:max-w-[680px]"
          >
            <DialogHeader className="gap-1 border-b border-border px-[22px] pt-5 pb-4">
              <DialogTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
                Correct the company details
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-[1.5]">
                {companyFlagReason ??
                  "Save the corrected details to send them back for review."}
              </DialogDescription>
            </DialogHeader>

            {/* The body scrolls so a short viewport can still reach Continue. */}
            <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-[22px] py-5">
              <CompanyDetailsForm
                key={companySession}
                mode="correction"
                // Seeded from the submitted summary rather than the draft: the
                // draft is null once an application has been submitted.
                initial={companyFromSummary(submittedSummary)}
                // `onBack` is deliberately omitted — there is no email
                // sub-screen behind this dialog, so no Back button renders.
                // That is also why the form renders its own Company email field
                // in correction mode: nothing else here asks for one, and
                // "Contact person unreachable" is a flag reason.
                //
                // Closing is all this does. The form already raises "Company
                // details updated." and awaits `refetch()` itself in correction
                // mode; repeating either here would double the toast and fire a
                // second load. The flag is cleared by
                // `POST /api/logistics-company`, never by this screen.
                onSaved={() => setCompanyOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * The one card at the top of every state. `accent` colours the dot and the tag
 * and, at low opacity, the border and background — one value per state rather
 * than three, so a state can't end up with a red border and an amber dot.
 */
function StatusCard({
  tag,
  accent,
  title,
  body,
}: {
  tag: string;
  accent: string;
  title: string;
  body: string;
}) {
  return (
    <section
      className="animate-onboarding-fade-up rounded-2xl border p-[18px]"
      style={{
        borderColor: accent,
        // `color-mix` rather than a hard-coded tint: `accent` is a different
        // colour space per state (a token here, an oklch literal there), and
        // this keeps every state's wash the same strength regardless.
        backgroundColor: `color-mix(in oklch, ${accent} 5%, var(--card))`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <p
          className="font-price text-[11px] font-semibold tracking-[0.08em] uppercase"
          style={{ color: accent }}
        >
          {tag}
        </p>
      </div>
      <h2 className="mt-2.5 text-[22px] leading-[1.2] font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      <p className="mt-[7px] max-w-[620px] text-[13.5px] leading-[1.55] text-muted-foreground">
        {body}
      </p>
    </section>
  );
}

/**
 * The company block's own state while the application is pending, shown as its
 * own row because the card above promises the company clears separately — a
 * company already verified should be able to see that.
 *
 * `FLAGGED` renders nothing: a flagged company block moves the application to
 * `ACTION_REQUIRED`, where the company card carries the reason and the Fix
 * button, so nothing is lost by staying quiet in the one state where the pair
 * would contradict each other.
 */
function CompanyRegistrationRow({
  reviewStatus,
}: {
  reviewStatus: FleetCompanyReviewStatus | null;
}) {
  if (reviewStatus !== "VERIFIED" && reviewStatus !== "PENDING") return null;

  const verified = reviewStatus === "VERIFIED";

  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-border bg-card px-[18px] py-3.5">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: verified ? STATUS_GREEN : STATUS_AMBER }}
      />
      <p className="text-[13px]">
        Company registration:{" "}
        <span
          className="font-semibold"
          style={{ color: verified ? STATUS_GREEN : STATUS_AMBER }}
        >
          {verified ? "verified" : "in review"}
        </span>
      </p>
    </div>
  );
}

/**
 * One row per vehicle, in `position` order, with its own verdict chip — the
 * surface where per-vehicle review shows its value.
 *
 * `Table` renders its own `overflow-x-auto` container, so these seven columns
 * scroll inside this card rather than making the whole page scroll sideways;
 * the rounded box around it only clips the corners.
 */
function FleetStatusTable({
  verdicts,
  approved,
  flagged,
  canFix,
  onFix,
}: {
  verdicts: FleetVehicleVerdict[];
  approved: number;
  flagged: number;
  /** False in every state but `ACTION_REQUIRED`; see the call site. */
  canFix: boolean;
  onFix: (verdict: FleetVehicleVerdict) => void;
}) {
  const pending = verdicts.length - approved - flagged;

  return (
    <section className="overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="flex items-center justify-between gap-3.5 border-b border-border bg-muted/40 px-4 py-3">
        <h2 className="text-[12.5px] font-semibold">Fleet status</h2>
        <p className="font-price text-[11.5px] text-muted-foreground">
          {approved} approved · {flagged} flagged · {pending} pending
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[52px] pl-4">#</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Plate</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4">
              <span className="sr-only">Correct a flagged vehicle</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {verdicts.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="px-4 py-5 text-[13px] text-muted-foreground"
              >
                No vehicles on this application.
              </TableCell>
            </TableRow>
          ) : null}

          {verdicts.map((verdict) => {
            const flaggedRow = verdict.status === "FLAGGED";
            // A vehicle removed from the fleet through an unrelated flow: the
            // `SetNull` FK keeps the verdict so the history is not lost, but
            // there is nothing left to correct, so the row renders without a Fix
            // button and says so in place of its plate.
            const removed = verdict.vehicleId === null;

            return (
              <TableRow
                key={verdict.id}
                className={flaggedRow ? "bg-destructive/3" : undefined}
              >
                <TableCell className="pl-4 font-price text-[12.5px] text-muted-foreground">
                  {verdict.position}
                </TableCell>

                <TableCell>
                  <span className="block text-[13px] font-semibold">
                    {classNameFor(verdict.vehicleClass)}
                  </span>
                  <span className="mt-px block text-[11.5px] text-muted-foreground">
                    {bodyLabelFor(verdict.chassisType)}
                  </span>
                </TableCell>

                <TableCell
                  className={
                    removed
                      ? "text-[12.5px] text-muted-foreground"
                      : "font-price text-[12.5px] font-semibold tracking-[0.06em] uppercase"
                  }
                >
                  {removed
                    ? REMOVED_VEHICLE_LABEL
                    : (verdict.plateNumber ?? EMPTY_VALUE)}
                </TableCell>

                <TableCell>
                  <span className="block text-[12.5px]">
                    {verdict.driver?.name ?? EMPTY_VALUE}
                  </span>
                  {verdict.driver !== null &&
                  verdict.driver.categories.length > 0 ? (
                    <span className="mt-px block text-[11.5px] text-muted-foreground">
                      {verdict.driver.categories.join(", ")}
                    </span>
                  ) : null}
                </TableCell>

                <TableCell
                  className={`max-w-[240px] text-[11.5px] leading-[1.4] whitespace-normal ${
                    flaggedRow ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {verdict.flagReason ?? EMPTY_VALUE}
                </TableCell>

                <TableCell>
                  <span
                    className={`${CHIP_CLASS} ${CHIP_TONE[verdict.status]}`}
                  >
                    {CHIP_LABEL[verdict.status]}
                  </span>
                </TableCell>

                <TableCell className="pr-4 text-right">
                  {canFix && flaggedRow && !removed ? (
                    <button
                      type="button"
                      onClick={() => onFix(verdict)}
                      className="cursor-pointer rounded-[7px] bg-destructive px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      Fix
                      <span className="sr-only">
                        {" "}
                        vehicle {verdict.position}
                      </span>
                    </button>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

/**
 * What was approved, built from the GET's own summary of the normalized rows.
 * `bankAccountIban` arrives already masked to its last four characters and is
 * never re-derived here.
 */
function ApprovedSummary({ summary }: { summary: FleetSubmittedSummary }) {
  const rows: { key: string; label: string; value: string; mono?: true }[] = [
    { key: "companyName", label: "Company", value: summary.companyName },
    { key: "vatId", label: "VAT / tax ID", value: summary.vatId, mono: true },
    {
      key: "citiesOfOperation",
      label: "Cities of operation",
      value:
        summary.citiesOfOperation.map(formatCity).join(", ") || EMPTY_VALUE,
    },
    {
      key: "bankAccountIban",
      label: "Payout account",
      value: summary.bankAccountIban || EMPTY_VALUE,
      mono: true,
    },
    {
      key: "vehicleCount",
      label: "Fleet",
      value: vehicleCountLabel(summary.vehicleCount),
      mono: true,
    },
    // One row per cargo body that actually has vehicles, keyed and labelled by
    // the body's own short label — which is exactly what the GET counts by.
    ...Object.entries(summary.countsByBodyType).map(([label, count]) => ({
      key: `body-${label}`,
      label,
      value: vehicleCountLabel(count),
      mono: true as const,
    })),
  ];

  return (
    <section className="rounded-[14px] border border-border bg-card p-[15px]">
      <h2 className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
        Approved for dispatch
      </h2>
      <dl className="mt-[11px] flex flex-col gap-[9px]">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-3.5"
          >
            <dt className="shrink-0 text-[12.5px] text-muted-foreground">
              {row.label}
            </dt>
            <dd
              className={`text-right text-[12.5px] font-medium ${
                row.mono ? "font-price" : ""
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The line of small print each state closes with. */
function Footnote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs leading-[1.5] text-muted-foreground">{children}</p>
  );
}
