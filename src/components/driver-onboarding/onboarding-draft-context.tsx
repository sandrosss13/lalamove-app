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
  ONBOARDING_DRAFT_VERSION,
  ONBOARDING_FIRST_STEP,
  ONBOARDING_LAST_STEP,
  type OnboardingDraftV1,
} from "@/lib/driver-onboarding/draft-schema";
import {
  OnboardingToast,
  type OnboardingToastState,
} from "@/components/driver-onboarding/onboarding-toast";

/** The three documents an application collects, mirroring `DriverApplicationDocumentType`. */
export type OnboardingDocumentType =
  "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK";

/** One live document, exactly as `GET /api/driver-profile/onboarding` returns it. */
export type OnboardingDocument = {
  type: OnboardingDocumentType;
  status: "PENDING" | "APPROVED" | "FLAGGED";
  flagReason: string | null;
  /** Null when signing failed — render a broken thumbnail, not a crash. */
  signedUrl: string | null;
  uploadedAt: string;
};

/** Application lifecycle state, mirroring `DriverApplicationStatus`. */
export type OnboardingApplicationStatus =
  "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED";

/**
 * Every screen the wizard can be on, as the numbers `goToStep` takes and
 * `draftStep` reports. The full scheme — in particular why step 3's three
 * sub-screens are `3` and `3.5` rather than three integers — is documented at
 * the top of `onboarding-wizard-shell.tsx`. Steps import the names from here
 * rather than hard-coding the numbers, and rather than importing them from the
 * shell, which imports the steps (that would be a cycle).
 */
export const ONBOARDING_SCREENS = {
  /** Step 1 — authorisation & personal details. */
  personal: 1,
  /** Step 2 — licence verification. */
  licence: 2,
  /** Step 3a/3b — cargo body type, then vehicle class. */
  vehicleBodyAndClass: 3,
  /** Step 3c — technical details (make, plate, colour, payload, dimensions). */
  vehicleTechnical: 3.5,
  /** Step 4 — review & submit. */
  review: 4,
} as const;

export type OnboardingState = {
  /** True until the first `GET` settles. Steps are not rendered before then. */
  loading: boolean;
  /**
   * Why the initial load failed, if it did. Deliberately distinct from
   * `saveError`: a failed load means there is nothing on screen to work with
   * and the only action is "retry", whereas a failed save means the driver's
   * visible answers simply aren't stored yet.
   */
  loadError: string | null;
  /** Why the most recent draft save failed, if it did; cleared by the next success. */
  saveError: string | null;
  /** True while a `PATCH` is in flight, for an unobtrusive "Saving…" indicator. */
  saving: boolean;
  status: OnboardingApplicationStatus | null;
  reference: string | null;
  /** The current *screen* number — see `ONBOARDING_SCREENS`, and the shell's header comment. */
  draftStep: number;
  draftUpdatedAt: string | null;
  draft: OnboardingDraftV1;
  documents: OnboardingDocument[];
  submittedSummary: Record<string, unknown> | null;
  /**
   * Merges `patch` into the current draft (shallow at the section level — e.g.
   * `updateDraft({ personal: {...} })` replaces the whole `personal` object,
   * matching how each step owns exactly one section) and schedules a debounced
   * `PATCH`.
   */
  updateDraft: (patch: Partial<OnboardingDraftV1>) => void;
  /** Navigate to a screen from `ONBOARDING_SCREENS`, saving immediately. */
  goToStep: (step: number) => void;
  refetch: () => Promise<void>;
  /**
   * "Start a new application": clears the draft and retires every uploaded
   * document server-side, then reloads. Resolves `false` (having raised a
   * toast) if the reset failed, so the caller can stay where it is rather than
   * navigating into a state the server never actually created.
   */
  resetApplication: () => Promise<boolean>;
  /**
   * Folds a just-uploaded document into `documents` without a full refetch —
   * the response of `POST .../documents` is already the new row.
   */
  recordDocument: (document: OnboardingDocument) => void;
  showToast: (message: string, tone?: "default" | "error") => void;
};

const OnboardingDraftContext = createContext<OnboardingState | null>(null);

const ONBOARDING_ENDPOINT = "/api/driver-profile/onboarding";
const RESET_ENDPOINT = `${ONBOARDING_ENDPOINT}/reset`;

/**
 * How long after the last `updateDraft` call the wizard actually saves. Short
 * enough that a driver who closes the tab a second after typing keeps their
 * work, long enough that typing a name is one request rather than eight —
 * the same idiom as `SEARCH_DEBOUNCE_MS` in the admin client list.
 */
const SAVE_DEBOUNCE_MS = 300;

/** How long a toast stays on screen, per the design's 2.2s. */
const TOAST_DURATION_MS = 2200;

const LOAD_ERROR_FALLBACK =
  "We couldn't load your application. Check your connection and try again.";
const SAVE_ERROR_FALLBACK =
  "We couldn't save your progress. Your latest answers aren't stored yet.";
const RESET_ERROR_FALLBACK =
  "We couldn't start a new application. Please try again.";

/** A brand-new, empty draft — also what a failed load falls back to. */
const EMPTY_DRAFT: OnboardingDraftV1 = { version: ONBOARDING_DRAFT_VERSION };

/** The `GET /api/driver-profile/onboarding` response body. */
type OnboardingGetResponse = {
  status: OnboardingApplicationStatus;
  reference: string;
  draftStep: number;
  draftUpdatedAt: string | null;
  draft: OnboardingDraftV1 | null;
  documents: OnboardingDocument[];
  submittedSummary: Record<string, unknown> | null;
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
 * an integer in [1, 4], so step 3's `3.5` sub-screen persists as plain `3` —
 * see the shell's header comment for why that is the right trade.
 */
function persistedStep(screen: number): number {
  return Math.min(
    Math.max(Math.trunc(screen), ONBOARDING_FIRST_STEP),
    ONBOARDING_LAST_STEP,
  );
}

/**
 * Owns every byte of onboarding state: the application row's status, the draft
 * blob, the uploaded documents, the current screen, and the toast slot. Steps
 * read and write exclusively through `useOnboardingDraft()` rather than
 * prop-drilling, which is what lets each wave-4 step component take no props at
 * all.
 *
 * Saving is debounced on edits and immediate on navigation. Those are different
 * on purpose: an edit is one of many in a burst of typing, whereas a step-rail
 * click is a single deliberate act whose new `draftStep` must not be lost to a
 * debounce timer that a route change is about to discard.
 */
export function OnboardingDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OnboardingApplicationStatus | null>(
    null,
  );
  const [reference, setReference] = useState<string | null>(null);
  const [draftStep, setDraftStep] = useState<number>(
    ONBOARDING_SCREENS.personal,
  );
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<OnboardingDraftV1>(EMPTY_DRAFT);
  const [documents, setDocuments] = useState<OnboardingDocument[]>([]);
  const [submittedSummary, setSubmittedSummary] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [toast, setToast] = useState<OnboardingToastState>(null);

  // The three values a save needs, mirrored into refs so the save callbacks can
  // stay identity-stable (and therefore not re-trigger every consumer's effects)
  // while still reading the newest values from inside a timer.
  const draftRef = useRef<OnboardingDraftV1>(EMPTY_DRAFT);
  const stepRef = useRef<number>(ONBOARDING_SCREENS.personal);
  const statusRef = useRef<OnboardingApplicationStatus | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  // Whether a debounced save is still owed. Read by the unmount flush below, so
  // leaving the wizard within the debounce window doesn't silently drop an edit.
  const savePending = useRef(false);
  // Monotonic id of the newest save. An earlier `PATCH` that resolves after a
  // later one must not overwrite the later one's error state.
  const saveSequence = useRef(0);

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
    async (screen: number, nextDraft: OnboardingDraftV1): Promise<void> => {
      // `PATCH` rejects a submitted application with a 400, and the wizard is
      // not even rendered for one — but a submit landing in another tab while
      // a debounce is in flight would otherwise produce a spurious save error.
      if (statusRef.current !== "DRAFT") {
        savePending.current = false;
        return;
      }

      savePending.current = false;
      const sequence = saveSequence.current + 1;
      saveSequence.current = sequence;
      setSaving(true);

      try {
        const response = await fetch(ONBOARDING_ENDPOINT, {
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

  const refetch = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);

    try {
      const response = await fetch(ONBOARDING_ENDPOINT);

      if (!response.ok) {
        setLoadError(await readErrorMessage(response, LOAD_ERROR_FALLBACK));
        return;
      }

      const body = (await response.json()) as OnboardingGetResponse;
      // `draft` is null once the application is submitted — there is nothing
      // left to resume — so the wizard's own state falls back to empty and the
      // status screen takes over rendering.
      const loadedDraft = body.draft ?? EMPTY_DRAFT;

      draftRef.current = loadedDraft;
      // The API only ever stores the four integer steps, so a resumed session
      // lands on the *first* screen of the step it left off in.
      stepRef.current = body.draftStep;
      statusRef.current = body.status;

      setStatus(body.status);
      setReference(body.reference);
      setDraftStep(body.draftStep);
      setDraftUpdatedAt(body.draftUpdatedAt);
      setDraft(loadedDraft);
      setDocuments(body.documents);
      setSubmittedSummary(body.submittedSummary);
      // A successful reload supersedes any earlier failed save: the state on
      // screen is now the server's, so there is no unsaved work to warn about.
      setSaveError(null);
    } catch {
      setLoadError(LOAD_ERROR_FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateDraft = useCallback(
    (patch: Partial<OnboardingDraftV1>) => {
      // Section-level merge, not a deep one: a step that clears a field sends
      // its whole section back without it, and a deep merge would resurrect it.
      // `version` is re-pinned last so a patch can never drop or downgrade it.
      const next: OnboardingDraftV1 = {
        ...draftRef.current,
        ...patch,
        version: ONBOARDING_DRAFT_VERSION,
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
      // sends the same draft.
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
    // `draftStep`, and the reset also retired every uploaded document.
    await refetch();
    return true;
  }, [refetch, showToast]);

  const recordDocument = useCallback((document: OnboardingDocument) => {
    setDocuments((current) => {
      const index = current.findIndex((entry) => entry.type === document.type);
      if (index === -1) return [...current, document];

      // Replace in place so the slots keep their order across a retake.
      const next = [...current];
      next[index] = document;
      return next;
    });
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

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

      void fetch(ONBOARDING_ENDPOINT, {
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

  const value = useMemo<OnboardingState>(
    () => ({
      loading,
      loadError,
      saveError,
      saving,
      status,
      reference,
      draftStep,
      draftUpdatedAt,
      draft,
      documents,
      submittedSummary,
      updateDraft,
      goToStep,
      refetch,
      resetApplication,
      recordDocument,
      showToast,
    }),
    [
      loading,
      loadError,
      saveError,
      saving,
      status,
      reference,
      draftStep,
      draftUpdatedAt,
      draft,
      documents,
      submittedSummary,
      updateDraft,
      goToStep,
      refetch,
      resetApplication,
      recordDocument,
      showToast,
    ],
  );

  return (
    <OnboardingDraftContext.Provider value={value}>
      {children}
      <OnboardingToast toast={toast} />
    </OnboardingDraftContext.Provider>
  );
}

/**
 * The wizard's single data hook. Throws rather than returning `undefined` so a
 * step component rendered outside the provider fails loudly at the point of the
 * mistake, instead of crashing later on a property of `undefined`.
 */
export function useOnboardingDraft(): OnboardingState {
  const ctx = useContext(OnboardingDraftContext);
  if (!ctx) {
    throw new Error(
      "useOnboardingDraft must be used within OnboardingDraftProvider.",
    );
  }
  return ctx;
}
