"use client";

/**
 * ─── Draft-step numbering scheme (read this before building a step) ──────────
 *
 * The wizard has four *steps* but five *screens*, because step 3 (vehicle
 * registration) is three sub-screens in the design: 3a cargo body type, 3b
 * vehicle class, 3c technical details. `ONBOARDING_SCREENS` in
 * `onboarding-draft-context.tsx` is the single source of those numbers:
 *
 *     1    step 1   — authorisation & personal        step-1-auth-personal
 *     2    step 2   — licence verification            step-2-licence
 *     3    step 3a + 3b — cargo body type, class      step-3-chassis-class
 *     3.5  step 3c  — technical details               step-3c-technical-details
 *     4    step 4   — review & submit                 step-4-review-submit
 *
 * Two rules follow from that, and both are load-bearing:
 *
 * 1. **`goToStep` takes a screen number, `draftStep` reports one.** So 3b's
 *    Continue is `goToStep(ONBOARDING_SCREENS.vehicleTechnical)` — i.e. 3.5 —
 *    and 3c's Back is `goToStep(ONBOARDING_SCREENS.vehicleBodyAndClass)`.
 *    Import the names; never hard-code `3.5`.
 *
 * 2. **Only the integer part is persisted.** `PATCH /api/driver-profile/
 *    onboarding` validates `draftStep` as an *integer* in [1, 4], so the
 *    context floors the screen before sending it. A fractional screen number is
 *    therefore session-local: a driver who leaves on 3c and comes back resumes
 *    at 3a, not 3c. That is a deliberate trade — the alternative was widening a
 *    validated, already-migrated API contract so the wizard could remember one
 *    sub-screen — and it costs the driver two clicks over selections the draft
 *    has already restored for them.
 *
 * 3a and 3b share one screen number because they live in one component
 * (`step-3-chassis-class.tsx`) that switches between them internally; the shell
 * routes to that file and nothing more. The step rail and progress bar are fed
 * `Math.trunc(draftStep)`, so 3, 3a, 3b and 3c all read as "step 3" there.
 */

import { useState } from "react";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApplicationStatusScreen } from "@/components/driver-onboarding/application-status-screen";
import {
  ONBOARDING_SCREENS,
  useOnboardingDraft,
} from "@/components/driver-onboarding/onboarding-draft-context";
import { OnboardingProgressBar } from "@/components/driver-onboarding/onboarding-progress-bar";
import {
  ONBOARDING_RAIL,
  OnboardingStepRail,
} from "@/components/driver-onboarding/onboarding-step-rail";
import { Step1AuthPersonal } from "@/components/driver-onboarding/steps/step-1-auth-personal";
import { Step2Licence } from "@/components/driver-onboarding/steps/step-2-licence";
import { Step3ChassisClass } from "@/components/driver-onboarding/steps/step-3-chassis-class";
import { Step3cTechnicalDetails } from "@/components/driver-onboarding/steps/step-3c-technical-details";
import { Step4ReviewSubmit } from "@/components/driver-onboarding/steps/step-4-review-submit";

/**
 * The kicker/title pair above each screen, following the design's `STEP_META`.
 * Its step-1 phone and OTP screens are collapsed into one entry here, since
 * this feature drops the SMS code screen entirely and `task-09` builds the
 * remaining fields as a single step.
 */
const SCREEN_HEADERS: { screen: number; kicker: string; title: string }[] = [
  {
    screen: ONBOARDING_SCREENS.personal,
    kicker: "Step 1 of 4 · Authorisation & personal",
    title: "Who you are",
  },
  {
    screen: ONBOARDING_SCREENS.licence,
    kicker: "Step 2 of 4 · Licence",
    title: "Your licence",
  },
  {
    screen: ONBOARDING_SCREENS.vehicleBodyAndClass,
    kicker: "Step 3 of 4 · Vehicle",
    title: "Vehicle registration",
  },
  {
    screen: ONBOARDING_SCREENS.vehicleTechnical,
    kicker: "Step 3 of 4 · Vehicle",
    title: "Technical details",
  },
  {
    screen: ONBOARDING_SCREENS.review,
    kicker: "Step 4 of 4 · Review",
    title: "Check and submit",
  },
];

/** Screens in order, used for the shell's own Back button. */
const SCREEN_ORDER = SCREEN_HEADERS.map((header) => header.screen);

/**
 * "saved 2 days ago"-style phrasing for the welcome screen's resume banner,
 * built on `Intl.RelativeTimeFormat` rather than a date library — this is the
 * only relative timestamp in the app, and the platform already has one.
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

/** The step component for a screen number, or `null` for an unknown one. */
function renderScreen(screen: number) {
  switch (screen) {
    case ONBOARDING_SCREENS.personal:
      return <Step1AuthPersonal />;
    case ONBOARDING_SCREENS.licence:
      return <Step2Licence />;
    case ONBOARDING_SCREENS.vehicleBodyAndClass:
      return <Step3ChassisClass />;
    case ONBOARDING_SCREENS.vehicleTechnical:
      return <Step3cTechnicalDetails />;
    case ONBOARDING_SCREENS.review:
      return <Step4ReviewSubmit />;
    default:
      return null;
  }
}

/**
 * The client root of `/dashboard/onboarding`: the welcome screen, the step rail
 * and progress-bar chrome, and whichever step the driver is on. It owns exactly
 * one piece of state — which of the two phases is showing — because everything
 * else (the draft, the current screen, the toast) belongs to
 * `OnboardingDraftProvider`, which every step reads directly.
 *
 * The welcome screen is shown on every mount regardless of `draftStep`, per the
 * design: a driver returning to a half-finished application should be told what
 * they are returning to, and offered the choice between resuming it and
 * starting over, rather than being dropped back into a form mid-sentence.
 */
export function OnboardingWizardShell() {
  const {
    loading,
    loadError,
    saveError,
    saving,
    status,
    draftStep,
    draftUpdatedAt,
    goToStep,
    refetch,
    resetApplication,
    showToast,
  } = useOnboardingDraft();

  const [phase, setPhase] = useState<"welcome" | "step">("welcome");
  // Held so "Start a new application" can show progress and can't be
  // double-fired while the reset request is still in flight.
  const [resetting, setResetting] = useState(false);

  const currentStep = Math.trunc(draftStep);

  function handleSelectStep(step: number) {
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

  // A submitted application has no step left to edit — including one submitted
  // in another tab while this one sat on the welcome screen — so status wins
  // over both the welcome phase and any wizard step.
  if (status !== null && status !== "DRAFT") {
    return (
      <Surface>
        {/* The rail stays for continuity, but every entry is now a dead end:
            a submitted application has no editable step to jump back to. Say
            that rather than leaving four buttons that silently do nothing. */}
        <OnboardingStepRail
          currentStep={ONBOARDING_RAIL.length}
          onSelect={() =>
            showToast(
              "Your application is with the review team — there is nothing left to edit.",
            )
          }
        />
        <ContentColumn>
          <div className="animate-onboarding-fade-up py-10 pb-18">
            <ApplicationStatusScreen />
          </div>
        </ContentColumn>
      </Surface>
    );
  }

  if (phase === "welcome") {
    return (
      <Surface>
        <OnboardingStepRail
          currentStep={currentStep}
          onSelect={handleSelectStep}
        />
        <ContentColumn>
          <div className="max-w-[620px] pt-16 pb-18">
            <div
              aria-hidden="true"
              className="mb-[30px] size-11 rounded-xl bg-onboarding-accent"
            />
            <h1 className="text-[42px] leading-[1.08] font-semibold tracking-[-0.03em]">
              Become a partner driver
            </h1>
            <p className="mt-3.5 max-w-[520px] text-base leading-[1.55] text-muted-foreground">
              Four steps. Around 12 minutes if your licence and vehicle
              documents are to hand. Progress is saved as you go.
            </p>

            <ol className="mt-[34px] overflow-hidden rounded-[14px] border border-border">
              {ONBOARDING_RAIL.map((entry) => (
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
                    {currentStep} of {ONBOARDING_RAIL.length}.
                  </p>
                </div>
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
              {resetting ? "Starting…" : "Start a new application"}
            </button>
          </div>
        </ContentColumn>
      </Surface>
    );
  }

  const header = SCREEN_HEADERS.find((entry) => entry.screen === draftStep);

  return (
    <Surface>
      <OnboardingStepRail
        currentStep={currentStep}
        onSelect={handleSelectStep}
      />
      <ContentColumn>
        <div className="max-w-[680px] pt-10 pb-18">
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
            <OnboardingProgressBar currentStep={currentStep} />
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
 * subtree into the shadcn token set and the fixed light scheme (see
 * `globals.css`) — without it the `src/components/ui` primitives resolve
 * `accent`/`muted` against the landing page's palette instead.
 */
function Surface({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-onboarding-surface=""
      className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-muted font-body text-foreground md:flex-row"
    >
      {children}
    </main>
  );
}

/** The 900px centred reading column the design puts every screen inside. */
function ContentColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-6 md:px-12">{children}</div>
    </div>
  );
}
