"use client";

/**
 * ─── Screen numbering scheme (read this before building a step) ──────────────
 *
 * Five steps, five *integer* screen numbers, and no fractional screens at all —
 * the opposite of the driver wizard, whose step 3 splits into `3` and `3.5`.
 * `FLEET_SCREENS` in `fleet-draft-context.tsx` is the single source of those
 * numbers:
 *
 *     1  step 1 — company & authorisation   step-1-company-details
 *     2  step 2 — fleet composition         step-2-fleet-composition
 *     3  step 3 — vehicle specifications    step-3-vehicle-specifications
 *     4  step 4 — drivers & assignment      step-4-drivers-assignment
 *     5  step 5 — review & submit           step-5-review-submit
 *
 * Step 1 does have two sub-screens (company email, then company details), but
 * they live inside `step-1-company-details.tsx` as plain local state — the same
 * call the driver wizard's `step-3-chassis-class.tsx` makes for its 3a/3b pair.
 * Keeping them out of the screen numbering is what keeps `draftStep` an integer
 * everywhere, matching the API's validated [1, 5] range with no flooring and no
 * session-local sub-screen that a reload silently loses.
 *
 * One consequence, and it is this task's deliberate trade: `SCREEN_HEADERS`
 * below has exactly one entry for step 1, "Company details", because the header
 * lives in the shell and the sub-screen lives in the step. No separate
 * sub-screen title is therefore modelled here. Step 1 instead leads its email
 * sub-screen with an intro sentence and an uppercase "Company email" field
 * label directly beneath the shared header, which reads correctly — the
 * alternative was pushing sub-screen state up into the shell to pick a title,
 * which would have put step 1's internals in two files.
 */

import { useState } from "react";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FleetApplicationStatusScreen } from "@/components/fleet-onboarding/fleet-application-status-screen";
import {
  FLEET_SCREENS,
  useFleetDraft,
} from "@/components/fleet-onboarding/fleet-draft-context";
import { FleetProgressBar } from "@/components/fleet-onboarding/fleet-progress-bar";
import {
  FLEET_RAIL,
  FleetStepRail,
  type FleetTallyRow,
} from "@/components/fleet-onboarding/fleet-step-rail";
import { Step1CompanyDetails } from "@/components/fleet-onboarding/steps/step-1-company-details";
import { Step2FleetComposition } from "@/components/fleet-onboarding/steps/step-2-fleet-composition";
import { Step3VehicleSpecifications } from "@/components/fleet-onboarding/steps/step-3-vehicle-specifications";
import { Step4DriversAssignment } from "@/components/fleet-onboarding/steps/step-4-drivers-assignment";
import { Step5ReviewSubmit } from "@/components/fleet-onboarding/steps/step-5-review-submit";
import type { FleetDraftVehicle } from "@/lib/fleet-onboarding/draft-schema";

/** The kicker/title pair above each screen, following the design's `STEPS` array. */
const SCREEN_HEADERS: { screen: number; kicker: string; title: string }[] = [
  {
    screen: FLEET_SCREENS.company,
    kicker: "Step 1 of 5 · Company & authorisation",
    title: "Company details",
  },
  {
    screen: FLEET_SCREENS.fleet,
    kicker: "Step 2 of 5 · Fleet",
    title: "Fleet composition",
  },
  {
    screen: FLEET_SCREENS.vehicles,
    kicker: "Step 3 of 5 · Vehicles",
    title: "Vehicle specifications",
  },
  {
    screen: FLEET_SCREENS.drivers,
    kicker: "Step 4 of 5 · Drivers",
    title: "Drivers & assignment",
  },
  {
    screen: FLEET_SCREENS.review,
    kicker: "Step 5 of 5 · Review",
    title: "Check and submit",
  },
];

/** Screens in order, used for the shell's own Back button. */
const SCREEN_ORDER = SCREEN_HEADERS.map((header) => header.screen);

/**
 * Inner panel width per screen, from the design's own `colWidth`. Steps 3 and 4
 * are tables — a numbered vehicle list and a driver-assignment list — and get
 * the full 1000px column; the form steps stay at a readable measure. Modelled
 * on the inner wrapper rather than by changing the outer column, so the column's
 * gutters and scroll behaviour stay identical across every screen.
 */
const CONTENT_WIDTH_CLASS: Record<number, string> = {
  [FLEET_SCREENS.company]: "max-w-[680px]",
  [FLEET_SCREENS.fleet]: "max-w-[760px]",
  [FLEET_SCREENS.vehicles]: "max-w-full",
  [FLEET_SCREENS.drivers]: "max-w-full",
  [FLEET_SCREENS.review]: "max-w-[680px]",
};

/**
 * The tone a completion row takes once every vehicle in a non-empty list is
 * done. Named here rather than inlined so the two completion rows below can
 * never drift apart; the rail owns what "success" actually renders as (the
 * design's green, written as an arbitrary `oklch` value because it has no token
 * in `globals.css` — the same call `step-1-auth-personal.tsx` makes).
 */
const COMPLETE_TONE: FleetTallyRow["tone"] = "success";

/**
 * "saved 2 days ago"-style phrasing for the welcome screen's resume banner,
 * built on `Intl.RelativeTimeFormat` rather than a date library — the platform
 * already has one.
 *
 * Copied from the driver wizard's shell rather than imported: it is not
 * exported there, and extracting a shared module would mean editing a file this
 * feature otherwise never touches.
 *
 * Safe to compute during render because `draftUpdatedAt` only exists after the
 * client-side `GET` has resolved, so there is no server-rendered value for a
 * clock difference to disagree with.
 */
function formatSavedAt(iso: string): string {
  const savedAt = new Date(iso);
  if (Number.isNaN(savedAt.getTime())) return "saved earlier";

  const elapsedSeconds = (savedAt.getTime() - Date.now()) / 1000;
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const units: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 },
  ];

  for (const { unit, seconds } of units) {
    if (Math.abs(elapsedSeconds) >= seconds) {
      return `saved ${formatter.format(Math.round(elapsedSeconds / seconds), unit)}`;
    }
  }

  return "saved just now";
}

/**
 * A vehicle counts as *specified* once every field step 3's editor collects is
 * filled in. Total on purpose (every field truthy, not "some of them"): the
 * rail's number is a promise that nothing is left to type, and a partial row
 * reads as done otherwise.
 *
 * Kept local rather than imported from a wave-4 file: the shell only counts,
 * step 3 owns the editor that fills these in, and a shared predicate would
 * couple the chrome to a step's internals.
 */
function isVehicleSpecified(vehicle: FleetDraftVehicle): boolean {
  return Boolean(
    vehicle.make &&
    vehicle.model &&
    vehicle.year &&
    vehicle.plateNumber &&
    vehicle.colour &&
    vehicle.payloadKg &&
    vehicle.cargoLengthM &&
    vehicle.cargoWidthM &&
    vehicle.cargoHeightM,
  );
}

/**
 * The step component for a screen number, or `null` for an unknown one. A
 * `switch` rather than a lookup object so adding a screen is a compile-time
 * question rather than a silently blank panel.
 */
function renderScreen(screen: number) {
  switch (screen) {
    case FLEET_SCREENS.company:
      return <Step1CompanyDetails />;
    case FLEET_SCREENS.fleet:
      return <Step2FleetComposition />;
    case FLEET_SCREENS.vehicles:
      return <Step3VehicleSpecifications />;
    case FLEET_SCREENS.drivers:
      return <Step4DriversAssignment />;
    case FLEET_SCREENS.review:
      return <Step5ReviewSubmit />;
    default:
      return null;
  }
}

/**
 * The client root of `/dashboard/fleet-onboarding`: the welcome screen, the
 * step rail and progress-bar chrome, and whichever step the company is on. It
 * owns exactly one piece of state — which of the two phases is showing —
 * because everything else (the draft, the current screen, the status, the
 * toast) belongs to `FleetDraftProvider`, which every step reads directly.
 *
 * The welcome screen is shown on every mount regardless of `draftStep`, per the
 * design: a company returning to a half-finished application should be told
 * what it is returning to, and offered the choice between resuming and starting
 * over, rather than being dropped back into a form mid-sentence.
 */
export function FleetWizardShell() {
  const {
    loading,
    loadError,
    saveError,
    saving,
    status,
    draft,
    draftStep,
    draftUpdatedAt,
    goToStep,
    refetch,
    resetApplication,
    showToast,
  } = useFleetDraft();

  const [phase, setPhase] = useState<"welcome" | "step">("welcome");
  // Held so "Start a new application" can show progress and can't be
  // double-fired while the reset request is still in flight.
  const [resetting, setResetting] = useState(false);

  const currentStep = Math.trunc(draftStep);

  // Counts are NESTED at `draft.fleet.counts` — `draft.fleet` is a
  // `FleetDraftFleet` object, not the count map itself. Summing
  // `Object.values(draft.fleet ?? {})` would add up objects, not numbers.
  const declared = Object.values(draft.fleet?.counts ?? {}).reduce(
    (a, b) => a + b,
    0,
  );
  const vehicles = draft.vehicles ?? [];
  const specified = vehicles.filter(isVehicleSpecified).length;
  const assigned = vehicles.filter((v) => Boolean(v.driverProfileId)).length;

  /** A "x/y" tally row, muted until every vehicle in a non-empty list is done. */
  function completionRow(key: string, done: number): FleetTallyRow {
    if (vehicles.length === 0) {
      return { key, value: "—", tone: "muted" };
    }

    return {
      key,
      value: `${done}/${vehicles.length}`,
      tone: done === vehicles.length ? COMPLETE_TONE : "muted",
    };
  }

  const tally: FleetTallyRow[] = [
    { key: "Declared", value: String(declared), tone: "default" },
    completionRow("Specified", specified),
    completionRow("Drivers assigned", assigned),
  ];

  function handleSelectStep(step: number) {
    // Steps 3, 4 and 5 are all generated from the declared fleet — an empty
    // vehicle table has nothing to specify, assign or review. The design
    // flashes this from step 3 onwards rather than disabling the entries, so
    // the company is told *why* the jump did nothing.
    //
    // Guarded on the declared count rather than on `draft.vehicles.length`:
    // step 2 writes the counts and step 3 materialises the vehicle list on
    // entry, so a company that has declared a fleet but not yet reached step 3
    // must still be allowed through.
    if (step >= FLEET_SCREENS.vehicles && declared === 0) {
      showToast("Declare your fleet first.", "error");
      return;
    }

    goToStep(step);
    setPhase("step");
  }

  async function handleStartFresh() {
    setResetting(true);
    const reset = await resetApplication();
    setResetting(false);
    // On failure `resetApplication` has already raised a toast; staying on the
    // welcome screen is correct, since the server never cleared anything.
    if (reset) setPhase("step");
  }

  function handleBack() {
    const previous = SCREEN_ORDER[SCREEN_ORDER.indexOf(draftStep) - 1];
    // Back from the first screen (or from a screen number we don't recognise,
    // where `indexOf` is -1) returns to the welcome screen rather than doing
    // nothing at all.
    if (previous === undefined) {
      setPhase("welcome");
      return;
    }
    goToStep(previous);
  }

  if (loading) {
    return (
      <Surface>
        <div className="flex flex-1 items-center justify-center p-16">
          <p className="text-sm text-muted-foreground">
            Loading your application…
          </p>
        </div>
      </Surface>
    );
  }

  if (loadError !== null) {
    return (
      <Surface>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-16 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      </Surface>
    );
  }

  // A submitted application has no step left to edit — the draft is writable
  // only while `status === "DRAFT"`, and `ACTION_REQUIRED` is no exception: a
  // flagged vehicle or company block is corrected through its own targeted
  // endpoint, from a dialog over this very screen, never by routing back into
  // the wizard. So the status screen wins over both the welcome phase and any
  // wizard step, including an application submitted in another tab while this
  // one sat on welcome.
  if (status !== null && status !== "DRAFT") {
    return (
      <Surface>
        {/* The rail stays for continuity, but every entry is now a dead end:
            a submitted application has no editable step to jump back to. Say
            that rather than leaving five buttons that silently do nothing. */}
        <FleetStepRail
          currentStep={FLEET_RAIL.length}
          tally={tally}
          onSelect={() =>
            showToast(
              "Your application is with the review team — there is nothing left to edit.",
            )
          }
        />
        <ContentColumn>
          <div className="animate-onboarding-fade-up py-10 pb-18">
            <FleetApplicationStatusScreen />
          </div>
        </ContentColumn>
      </Surface>
    );
  }

  if (phase === "welcome") {
    return (
      <Surface>
        <FleetStepRail
          currentStep={currentStep}
          tally={tally}
          onSelect={handleSelectStep}
        />
        <ContentColumn>
          <div className="max-w-[640px] pt-16 pb-18">
            <div
              aria-hidden="true"
              className="mb-[30px] size-11 rounded-xl bg-onboarding-accent"
            />
            <h1 className="text-[42px] leading-[1.08] font-semibold tracking-[-0.03em]">
              Register your fleet
            </h1>
            <p className="mt-3.5 max-w-[540px] text-base leading-[1.55] text-muted-foreground">
              For logistics companies running more than one vehicle. Register
              the company once, declare the fleet by body type and class, then
              put a driver behind every vehicle.
            </p>

            <ol className="mt-[34px] overflow-hidden rounded-[14px] border border-border">
              {FLEET_RAIL.map((entry) => (
                <li
                  key={entry.step}
                  className="flex items-center gap-3 border-b border-border bg-card px-3.5 py-3.5 last:border-b-0"
                >
                  <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted font-price text-[11px] font-semibold text-muted-foreground">
                    {entry.step}
                  </span>
                  <span className="text-sm font-medium">{entry.label}</span>
                </li>
              ))}
            </ol>

            {draftUpdatedAt !== null ? (
              <div className="mt-6 flex flex-wrap items-center gap-5 rounded-[14px] border border-onboarding-accent bg-onboarding-accent/6 px-[18px] py-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Unfinished application
                  </p>
                  <p className="mt-[3px] text-[13px] text-muted-foreground">
                    {formatSavedAt(draftUpdatedAt)} · you left off at step{" "}
                    {currentStep} of {FLEET_RAIL.length}
                    {declared > 0
                      ? ` · ${declared} ${declared === 1 ? "vehicle" : "vehicles"} declared`
                      : ""}
                  </p>
                </div>
                {/* Resumes without touching `draftStep`: the saved step is
                    already the one to return to. */}
                <button
                  type="button"
                  onClick={() => setPhase("step")}
                  className="h-11 shrink-0 cursor-pointer rounded-[10px] bg-onboarding-accent px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Resume
                </button>
              </div>
            ) : null}

            <button
              type="button"
              disabled={resetting}
              onClick={() => void handleStartFresh()}
              className="mt-4 h-[50px] cursor-pointer rounded-xl border border-border bg-card px-[26px] text-[15px] font-semibold transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting
                ? "Starting…"
                : draftUpdatedAt !== null
                  ? "Start a new application"
                  : // Nothing to discard yet, so the design drops the
                    // "new application" framing entirely.
                    "Start"}
            </button>
          </div>
        </ContentColumn>
      </Surface>
    );
  }

  const header = SCREEN_HEADERS.find((entry) => entry.screen === draftStep);

  return (
    <Surface>
      <FleetStepRail
        currentStep={currentStep}
        tally={tally}
        onSelect={handleSelectStep}
      />
      <ContentColumn>
        <div
          className={`${CONTENT_WIDTH_CLASS[draftStep] ?? "max-w-[680px]"} pt-10 pb-18`}
        >
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={handleBack}
              aria-label="Back"
              className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-onboarding-accent uppercase">
                {header?.kicker}
              </p>
              <h1 className="mt-0.5 text-[26px] font-semibold tracking-[-0.02em]">
                {header?.title}
              </h1>
            </div>
            {/* Save state, deliberately quiet: a working save is a footnote, a
                failed one is the only thing on this line worth reading. */}
            <p
              className={`shrink-0 text-xs ${
                saveError !== null
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
              role={saveError !== null ? "alert" : undefined}
            >
              {saveError ?? (saving ? "Saving…" : null)}
            </p>
          </div>

          <div className="mt-5">
            <FleetProgressBar currentStep={currentStep} />
          </div>

          {/* Keyed on the screen so each entering panel replays `fadeUp`
              instead of the content swapping inside a stationary box. */}
          <div key={draftStep} className="animate-onboarding-fade-up mt-7">
            {renderScreen(draftStep)}
          </div>
        </div>
      </ContentColumn>
    </Surface>
  );
}

/**
 * The wizard's outermost element. `data-onboarding-surface` is what opts this
 * subtree into the shadcn token set (see `globals.css`) — without it the
 * `src/components/ui` primitives resolve `accent`/`muted`/`border` against the
 * landing page's palette instead.
 *
 * That marker used to pin the subtree to a FIXED LIGHT SCHEME as well, because
 * the shadcn primitives only carried light token values and there was no `.dark`
 * class to flip. That is no longer true: `html.dark` declares the full shadcn
 * dark set and `html.dark body:has([data-onboarding-surface])` supplies this
 * surface's own dark `--background`/`--foreground`, so the marker now selects a
 * token set that themes like everything else. Every colour below this point is
 * expected to be a token or to carry a `dark:` counterpart.
 */
function Surface({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-onboarding-surface=""
      className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-muted font-body text-foreground md:flex-row"
    >
      {/*
        No `ThemeToggle` is mounted here, deliberately. Unlike the back office
        and the driver hub, the wizard does NOT ship its own header: it renders
        *below* the global site header (hence the `calc(100vh-3.5rem)` above),
        and `globals.css` only hides that header for `[data-hide-site-header]`
        and `[data-admin-surface]` — not for `[data-onboarding-surface]`. So the
        toggle in `src/app/layout.tsx` is already on screen on every wizard
        branch, and a second one here would stack two identical buttons at the
        same right edge.

        `onboarding-wizard-shell.tsx` is the same case for the same reason. If either
        wizard ever takes over the full viewport and hides the global header, it
        has to mount its own toggle at that point — every full-bleed surface in
        this app owns one.
      */}
      {children}
    </main>
  );
}

/**
 * The 1000px centred reading column the design puts every screen inside —
 * wider than the driver wizard's 900px because two of these five steps are
 * tables. How much of it a given screen actually uses is `CONTENT_WIDTH_CLASS`.
 */
function ContentColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1000px] px-6 md:px-12">{children}</div>
    </div>
  );
}
