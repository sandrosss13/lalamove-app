"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  FLEET_DRAFT_VERSION,
  FLEET_FIRST_STEP,
  FLEET_LAST_STEP,
  type FleetDraftChassisType,
  type FleetDraftV1,
  type FleetDraftVehicleClassId,
} from "@/lib/fleet-onboarding/draft-schema";
import {
  FleetOnboardingToast,
  type FleetToastState,
} from "@/components/fleet-onboarding/fleet-onboarding-toast";

/**
 * Every screen the fleet wizard can be on, as the numbers `goToStep` takes and
 * `draftStep` reports. Unlike the driver wizard there are no fractional
 * screens: step 1 has two sub-screens in the design (company phone, then
 * company details) but both live inside `step-1-company-details.tsx` as plain
 * local state, so `draftStep` is an integer everywhere and matches the API's
 * validated [1, 5] range exactly.
 *
 * Steps import these names rather than hard-coding digits, and import them from
 * here rather than from the shell — the shell imports the steps, so the other
 * direction would be a cycle.
 */
export const FLEET_SCREENS = {
  /** Step 1 — company phone, then company details (both inside task-10's component). */
  company: 1,
  /** Step 2 — fleet composition. */
  fleet: 2,
  /** Step 3 — vehicle specifications. */
  vehicles: 3,
  /** Step 4 — drivers & assignment. */
  drivers: 4,
  /** Step 5 — review & submit. */
  review: 5,
} as const;

/** Application lifecycle state, mirroring `BusinessApplicationStatus`. */
export type FleetApplicationStatus =
  "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";

/** The company block's own review verdict, mirroring `CompanyReviewStatus`. */
export type FleetCompanyReviewStatus = "PENDING" | "VERIFIED" | "FLAGGED";

/**
 * One vehicle's review row, exactly as `GET /api/logistics-company/onboarding`
 * returns it — field for field, with no adapter on either side.
 *
 * Deliberately *not* narrowed to what a status list needs. It carries both ids
 * and the full declared specification because the status screen seeds its
 * per-vehicle "Fix" editor straight from this array: a flagged vehicle's
 * correction dialog opens pre-filled with the make, model, year, colour,
 * payload, the three cargo dimensions and the assigned driver, and it PATCHes
 * on `vehicleId` while the admin side decides on `id`. A verdict carrying only
 * a plate and a driver name would force a second per-vehicle fetch this feature
 * has no endpoint for.
 *
 * Note the two class field names differ on purpose: a *draft* vehicle's class
 * is `classId`, a *verdict*'s is `vehicleClass`, because the latter is the
 * denormalised `BusinessApplicationVehicle.vehicleClass` column read back.
 */
export type FleetVehicleVerdict = {
  /** `BusinessApplicationVehicle.id` — what the admin verdict mutations address. */
  id: string;
  /** `Vehicle.id` — what the company's Fix PATCH is keyed on. Null if the vehicle was removed. */
  vehicleId: string | null;
  /** 1-based, derived from `createdAt` ordering. Not a column. */
  position: number;
  status: "PENDING" | "APPROVED" | "FLAGGED";
  flagReason: string | null;
  chassisType: FleetDraftChassisType;
  vehicleClass: FleetDraftVehicleClassId;
  plateNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  colour: string | null;
  payloadKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  driver: {
    driverProfileId: string;
    name: string;
    phone: string;
    categories: ("B" | "C" | "CE")[];
  } | null;
};

/**
 * What was actually submitted, as the GET returns it — built from the
 * normalized `LogisticsCompany` columns and the `BusinessApplicationVehicle` →
 * `Vehicle` join, never from the draft. After submit the draft stops being the
 * source of truth, and a summary the company shows itself must match exactly
 * what the reviewer sees. Null while `status === "DRAFT"`.
 */
export type FleetSubmittedSummary = {
  companyName: string;
  vatId: string;
  registeredAddress: string;
  city: string;
  citiesOfOperation: string[];
  contactName: string;
  contactRole: string;
  contactEmail: string;
  phone: string;
  /** Masked to the last four characters, e.g. "•••• •••• •••• 4821". */
  bankAccountIban: string;
  vehicleCount: number;
  /** Body-type label -> count, for the status screen's fleet line. */
  countsByBodyType: Record<string, number>;
};

export type FleetDraftState = {
  /** True until the first foreground GET settles. No step renders before then. */
  loading: boolean;
  /**
   * Why the initial load failed. Deliberately distinct from `saveError`: a
   * failed load means nothing on screen can be trusted and the only action is
   * retry, whereas a failed save means the company's visible answers simply
   * aren't stored yet.
   */
  loadError: string | null;
  /** Why the most recent PATCH failed; cleared by the next success or reload. */
  saveError: string | null;
  /** True while a PATCH is in flight, for the header's quiet "Saving…" line. */
  saving: boolean;

  status: FleetApplicationStatus | null;
  reference: string | null;
  companyReviewStatus: FleetCompanyReviewStatus | null;
  companyFlagReason: string | null;
  vehicleVerdicts: FleetVehicleVerdict[];
  /**
   * The GET's own summary field, built from the normalized rows rather than the
   * draft, with `bankAccountIban` already masked to its last four characters.
   * Null while `status === "DRAFT"`. The approved status screen renders its
   * summary card from this, which is why it sits on this surface rather than
   * being fetched separately — there stays exactly one loader.
   */
  submittedSummary: FleetSubmittedSummary | null;

  /** The current screen — a `FLEET_SCREENS` value. */
  draftStep: number;
  /**
   * ISO timestamp of the last successful save, or null for a fresh draft.
   * Drives the welcome screen's resume banner, and is the only signal that a
   * draft exists at all.
   */
  draftUpdatedAt: string | null;
  draft: FleetDraftV1;

  /**
   * Merges `patch` into the current draft at the *section* level (`{ company }`,
   * `{ fleet }`, `{ vehicles }` — each step owns exactly one section) and
   * schedules a debounced PATCH. Not a deep merge; see `updateDraft` below.
   */
  updateDraft: (patch: Partial<FleetDraftV1>) => void;
  /** Navigate to a `FLEET_SCREENS` value, saving immediately. */
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  /**
   * "Start a new application": clears the draft server-side, then reloads.
   * Resolves `false` (having raised a toast) if the reset failed, so the caller
   * stays put rather than navigating into a state the server never created.
   */
  resetApplication: () => Promise<boolean>;
  showToast: (message: string, tone?: "default" | "error") => void;
};

const FleetDraftContext = createContext<FleetDraftState | null>(null);

const FLEET_ONBOARDING_ENDPOINT = "/api/logistics-company/onboarding";
const RESET_ENDPOINT = `${FLEET_ONBOARDING_ENDPOINT}/reset`;

/**
 * How long after the last `updateDraft` call the wizard actually saves. Short
 * enough that a company closing the tab a second after typing keeps its work,
 * long enough that typing a company name is one request rather than eighteen.
 */
const SAVE_DEBOUNCE_MS = 300;

/** How long a toast stays on screen, per the business design's 2.4s. */
const TOAST_DURATION_MS = 2400;

/**
 * How often a *submitted* application re-reads its own status while the company
 * watches the status screen, so a verdict reaches it without a manual reload.
 *
 * 25s rather than a few seconds: a human reviewer's decision is
 * minutes-to-hours away, so this is a low-urgency read whose only job is to
 * beat the company's patience. It runs *only* in `PENDING` and
 * `ACTION_REQUIRED` — a `DRAFT` has nothing to wait for and is the one status
 * the wizard writes to, and `APPROVED` is terminal.
 */
const STATUS_POLL_INTERVAL_MS = 25_000;

const LOAD_ERROR_FALLBACK =
  "We couldn't load your application. Check your connection and try again.";
const SAVE_ERROR_FALLBACK =
  "We couldn't save your progress. Your latest answers aren't stored yet.";
const RESET_ERROR_FALLBACK =
  "We couldn't start a new application. Please try again.";

/**
 * A brand-new, empty draft — also the client-side stand-in for the SQL NULL a
 * reset writes, and what a failed load falls back to.
 */
const EMPTY_DRAFT: FleetDraftV1 = { version: FLEET_DRAFT_VERSION };

/** The `GET /api/logistics-company/onboarding` response body. */
type FleetOnboardingGetResponse = {
  status: FleetApplicationStatus;
  reference: string;
  draftStep: number;
  draftUpdatedAt: string | null;
  draft: FleetDraftV1 | null;
  companyReviewStatus: FleetCompanyReviewStatus;
  companyFlagReason: string | null;
  vehicles: FleetVehicleVerdict[];
  submittedSummary: FleetSubmittedSummary | null;
};

/**
 * Reads an `{ error }` body without letting a non-JSON response (an HTML error
 * page from an unhandled crash, say) throw over the top of the real failure.
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
 * The screen number as the API will accept it. `PATCH` validates `draftStep` as
 * an integer in [1, 5] and rejects anything else with a 400, so this is the
 * single place that contract is enforced client-side. Kept as a function rather
 * than inlined for exactly that reason, even though every fleet screen number
 * is already an integer in range.
 */
function persistedStep(screen: number): number {
  return Math.min(
    Math.max(Math.trunc(screen), FLEET_FIRST_STEP),
    FLEET_LAST_STEP,
  );
}

/**
 * Owns every byte of fleet-wizard state: the application row's status and
 * reference, the company and per-vehicle review verdicts, the draft blob, the
 * current screen, the submitted summary, and the toast slot. Steps read and
 * write exclusively through `useFleetDraft()` rather than prop-drilling, which
 * is what lets every step component take no props at all.
 *
 * Saving is debounced on edits and immediate on navigation. Those are different
 * on purpose: an edit is one of many in a burst of typing, whereas a step-rail
 * click is a single deliberate act whose new `draftStep` must not be lost to a
 * debounce timer that a route change is about to discard.
 */
export function FleetDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FleetApplicationStatus | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [companyReviewStatus, setCompanyReviewStatus] =
    useState<FleetCompanyReviewStatus | null>(null);
  const [companyFlagReason, setCompanyFlagReason] = useState<string | null>(
    null,
  );
  const [vehicleVerdicts, setVehicleVerdicts] = useState<FleetVehicleVerdict[]>(
    [],
  );
  const [submittedSummary, setSubmittedSummary] =
    useState<FleetSubmittedSummary | null>(null);
  const [draftStep, setDraftStep] = useState<number>(FLEET_SCREENS.company);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<FleetDraftV1>(EMPTY_DRAFT);
  const [toast, setToast] = useState<FleetToastState>(null);

  // The three values a save needs, mirrored into refs so the save callbacks can
  // stay identity-stable (and therefore not re-trigger every consumer's effects)
  // while still reading the newest values from inside a timer.
  const draftRef = useRef<FleetDraftV1>(EMPTY_DRAFT);
  const stepRef = useRef<number>(FLEET_SCREENS.company);
  const statusRef = useRef<FleetApplicationStatus | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Whether a debounced save is still owed. Read by the unmount flush below, so
  // leaving the wizard within the debounce window doesn't silently drop an edit.
  const savePending = useRef(false);
  // Monotonic id of the newest save. An earlier `PATCH` that resolves after a
  // later one must not overwrite the later one's error state.
  const saveSequence = useRef(0);

  // Monotonic id of the newest load, and how many of those are foreground ones.
  // Same reasoning as `saveSequence`, one layer up: with a background poll in
  // play, a `GET` that resolves after a newer one must not write its older
  // answer over the newer one's — a poll fired just before a resubmit would
  // otherwise put `ACTION_REQUIRED` back on screen over the `PENDING` the
  // resubmit just read. The count is what keeps `loading` owned by exactly one
  // request, so no in-flight `GET` can strand the shell's spinner.
  const loadSequence = useRef(0);
  const foregroundLoads = useRef(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Clearing the previous timer first means a second toast raised while the
  // first is still showing gets a full display window, not the remainder of it.
  const showToast = useCallback(
    (message: string, tone: "default" | "error" = "default") => {
      clearTimeout(toastTimer.current);
      setToast({ message, tone });
      toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    },
    [],
  );

  const persist = useCallback(
    async (screen: number, nextDraft: FleetDraftV1): Promise<void> => {
      // The draft is writable only while the application is a DRAFT: `PATCH`
      // rejects every other status with a 400, and the wizard is not even
      // rendered for one — but a submit landing in another tab while a debounce
      // is in flight would otherwise produce a spurious save error. Tested
      // against `"DRAFT"` rather than a list of the other three statuses so a
      // future status is refused by default.
      if (statusRef.current !== "DRAFT") {
        savePending.current = false;
        return;
      }

      savePending.current = false;
      const sequence = saveSequence.current + 1;
      saveSequence.current = sequence;
      setSaving(true);

      try {
        const response = await fetch(FLEET_ONBOARDING_ENDPOINT, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draftStep: persistedStep(screen),
            draft: nextDraft,
          }),
        });

        // A stale response has nothing useful to say about the current state.
        if (sequence !== saveSequence.current) return;

        if (!response.ok) {
          setSaveError(await readErrorMessage(response, SAVE_ERROR_FALLBACK));
          return;
        }

        setSaveError(null);
        // `PATCH` returns 204, so the server's `draftUpdatedAt` isn't echoed
        // back; the client's own clock is close enough for the "saved at" line
        // and costs no extra round trip.
        setDraftUpdatedAt(new Date().toISOString());
      } catch {
        if (sequence !== saveSequence.current) return;
        setSaveError(SAVE_ERROR_FALLBACK);
      } finally {
        if (sequence === saveSequence.current) {
          setSaving(false);
        }
      }
    },
    [],
  );

  /**
   * The one reader of `GET /api/logistics-company/onboarding`, in two modes.
   *
   * Foreground (the default, what `refetch` exposes) owns the shell's
   * full-screen states: it raises `loading` while in flight and reports a
   * failure through `loadError`, because nothing on screen can be trusted until
   * it settles.
   *
   * Silent is for the background status poll, where both of those would be
   * wrong: a `loading` flip would blank the company's status screen every 25
   * seconds, and one dropped poll on a flaky connection would replace a
   * perfectly good screen with an error page. A silent failure therefore leaves
   * the last-known-good state exactly as it is and waits for the next tick.
   */
  const loadApplication = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<void> => {
      // A poll has nothing to add while a foreground load is already fetching
      // the very same thing.
      if (silent && foregroundLoads.current > 0) return;

      const sequence = loadSequence.current + 1;
      loadSequence.current = sequence;

      if (!silent) {
        foregroundLoads.current += 1;
        setLoading(true);
        setLoadError(null);
      }

      try {
        const response = await fetch(FLEET_ONBOARDING_ENDPOINT);

        // A stale response has nothing useful to say about the current state.
        if (sequence !== loadSequence.current) return;

        if (!response.ok) {
          if (silent) return;
          setLoadError(await readErrorMessage(response, LOAD_ERROR_FALLBACK));
          return;
        }

        const body = (await response.json()) as FleetOnboardingGetResponse;

        // Re-checked after the body is read: parsing is another await, and the
        // request that supersedes this one may only start during it.
        if (sequence !== loadSequence.current) return;

        // `draft` is null once the application is submitted — there is nothing
        // left to resume — so the wizard's own state falls back to empty and the
        // status screen takes over rendering.
        const loadedDraft = body.draft ?? EMPTY_DRAFT;

        draftRef.current = loadedDraft;
        stepRef.current = body.draftStep;
        statusRef.current = body.status;

        setStatus(body.status);
        setReference(body.reference);
        setCompanyReviewStatus(body.companyReviewStatus);
        setCompanyFlagReason(body.companyFlagReason);
        setVehicleVerdicts(body.vehicles);
        setSubmittedSummary(body.submittedSummary);
        setDraftStep(body.draftStep);
        setDraftUpdatedAt(body.draftUpdatedAt);
        setDraft(loadedDraft);
        // A successful reload supersedes any earlier failed save: the state on
        // screen is now the server's, so there is no unsaved work to warn about.
        setSaveError(null);
        // And it supersedes an earlier failed *load*, including one a silent
        // poll has just recovered from — leaving the retry screen up over data
        // that has since arrived would strand the company on it.
        setLoadError(null);
      } catch {
        if (silent || sequence !== loadSequence.current) return;
        setLoadError(LOAD_ERROR_FALLBACK);
      } finally {
        if (!silent) {
          foregroundLoads.current -= 1;
          // The last foreground load to finish is the one that hands the shell
          // back to the company, whether or not its own answer was the one used.
          if (foregroundLoads.current === 0) {
            setLoading(false);
          }
        }
      }
    },
    [],
  );

  const refetch = useCallback(
    (): Promise<void> => loadApplication(),
    [loadApplication],
  );

  const updateDraft = useCallback(
    (patch: Partial<FleetDraftV1>) => {
      // Section-level merge, not a deep one: a step that clears a field sends
      // its whole section back without it, and a deep merge would resurrect it.
      // This is also what lets step 2 write `{ fleet: { counts: next } }` — the
      // whole `fleet` section, counts and all — without disturbing
      // `draft.vehicles`. `version` is re-pinned last so a patch can never drop
      // or downgrade it.
      const next: FleetDraftV1 = {
        ...draftRef.current,
        ...patch,
        version: FLEET_DRAFT_VERSION,
      };

      draftRef.current = next;
      setDraft(next);

      clearTimeout(saveTimer.current);
      savePending.current = true;
      saveTimer.current = setTimeout(() => {
        void persist(stepRef.current, draftRef.current);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  const goToStep = useCallback(
    (screen: number) => {
      stepRef.current = screen;
      setDraftStep(screen);

      // Immediate, not debounced: navigation is a single deliberate act, and
      // the pending edit save is folded into this one request anyway since it
      // sends the same draft. The timer is cleared *first* so the new
      // `draftStep` cannot be lost to a timer a route change is about to
      // discard.
      clearTimeout(saveTimer.current);
      void persist(screen, draftRef.current);
    },
    [persist],
  );

  const resetApplication = useCallback(async (): Promise<boolean> => {
    // Cancel any owed save first: it would re-write the draft the reset is
    // about to clear.
    clearTimeout(saveTimer.current);
    savePending.current = false;
    // Invalidate any save already in flight for the same reason.
    saveSequence.current += 1;
    // That bump also means the in-flight `persist`'s `finally` will no longer
    // recognise itself as current and so will never clear `saving` — which
    // would strand the "Saving…" indicator on screen for good. The reset owns
    // the flag from here.
    setSaving(false);

    try {
      const response = await fetch(RESET_ENDPOINT, { method: "POST" });

      if (!response.ok) {
        showToast(
          await readErrorMessage(response, RESET_ERROR_FALLBACK),
          "error",
        );
        return false;
      }
    } catch {
      showToast(RESET_ERROR_FALLBACK, "error");
      return false;
    }

    // Re-read rather than reset locally: the server is what decides the new
    // `draftStep`, and it clears the blob to SQL NULL rather than to an empty
    // object.
    await refetch();
    return true;
  }, [refetch, showToast]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Keep a submitted application's status live. `status` is a dependency, so
  // the interval is torn down and not recreated the moment the poll itself
  // reads back `APPROVED` (or a reset drops the row back to `DRAFT`) — this
  // stops polling exactly when there is nothing left to wait for, and the
  // cleanup covers unmount for free.
  useEffect(() => {
    if (status !== "PENDING" && status !== "ACTION_REQUIRED") return;

    const poll = setInterval(() => {
      void loadApplication({ silent: true });
    }, STATUS_POLL_INTERVAL_MS);

    return () => clearInterval(poll);
  }, [status, loadApplication]);

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      clearTimeout(saveTimer.current);

      // Flush an owed save on the way out. A bare `fetch` with `keepalive`
      // rather than `persist`: the component is unmounting, so there is no
      // state left to update and nothing to report a failure to — the point is
      // only that the browser is allowed to finish the request after the page
      // has gone.
      if (!savePending.current || statusRef.current !== "DRAFT") return;
      savePending.current = false;

      void fetch(FLEET_ONBOARDING_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftStep: persistedStep(stepRef.current),
          draft: draftRef.current,
        }),
        keepalive: true,
      }).catch(() => {
        // Nothing to show: the wizard is already gone.
      });
    },
    [],
  );

  const value = useMemo<FleetDraftState>(
    () => ({
      loading,
      loadError,
      saveError,
      saving,
      status,
      reference,
      companyReviewStatus,
      companyFlagReason,
      vehicleVerdicts,
      submittedSummary,
      draftStep,
      draftUpdatedAt,
      draft,
      updateDraft,
      goToStep,
      refetch,
      resetApplication,
      showToast,
    }),
    [
      loading,
      loadError,
      saveError,
      saving,
      status,
      reference,
      companyReviewStatus,
      companyFlagReason,
      vehicleVerdicts,
      submittedSummary,
      draftStep,
      draftUpdatedAt,
      draft,
      updateDraft,
      goToStep,
      refetch,
      resetApplication,
      showToast,
    ],
  );

  return (
    <FleetDraftContext.Provider value={value}>
      {children}
      <FleetOnboardingToast toast={toast} />
    </FleetDraftContext.Provider>
  );
}

/**
 * The fleet wizard's single data hook. Throws rather than returning `undefined`
 * so a step component rendered outside the provider fails loudly at the point
 * of the mistake, instead of crashing later on a property of `undefined`.
 */
export function useFleetDraft(): FleetDraftState {
  const ctx = useContext(FleetDraftContext);
  if (!ctx) {
    throw new Error("useFleetDraft must be used within FleetDraftProvider.");
  }
  return ctx;
}
