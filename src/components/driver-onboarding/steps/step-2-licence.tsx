"use client";

import { useId, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DocumentUploadDialog,
  SLOT_TO_DOCUMENT_TYPE,
  type DocumentSlot,
} from "@/components/driver-onboarding/document-upload-dialog";
import {
  ONBOARDING_SCREENS,
  useOnboardingDraft,
} from "@/components/driver-onboarding/onboarding-draft-context";
import type { OnboardingDraftLicenceCategory } from "@/lib/driver-onboarding/draft-schema";
import { isClassLockedByLicence } from "@/lib/driver-onboarding/vehicle-classes";

/** The two document slots this step owns, in the design's order. */
const LICENCE_SLOTS: { slot: DocumentSlot; title: string }[] = [
  { slot: "licFront", title: "Front of licence" },
  { slot: "licBack", title: "Back of licence" },
];

/**
 * The three categories the wizard offers, with the design's exact wording.
 * The array order is also the order a driver's selection is stored in, so the
 * saved draft reads B, C, CE regardless of which card was ticked first.
 */
const LICENCE_CATEGORIES: {
  code: OnboardingDraftLicenceCategory;
  description: string;
}[] = [
  { code: "B", description: "Cars and vans up to 3.5 t" },
  { code: "C", description: "Rigid trucks over 3.5 t" },
  { code: "CE", description: "Truck with trailer / articulated" },
];

/** The design's minimum for a plausible licence number. */
const MIN_LICENCE_NUMBER_LENGTH = 5;

/**
 * The design's success green (`GREEN` in the prototype). Written as an
 * arbitrary value rather than a theme token because `globals.css` defines no
 * success colour at all: the only green it ever had belonged to the retired ops
 * console's palette, which this surface never resolved. Adding a global token
 * for one pair of call sites is not worth it.
 */
const UPLOADED_TEXT_CLASS = "text-[oklch(0.5_0.13_145)]";
const UPLOADED_TILE_CLASS =
  "border-[oklch(0.5_0.13_145)] bg-[oklch(0.5_0.13_145)]/5";

/** Design-exact field chrome, shared by the two text inputs below. */
const FIELD_CLASS =
  "h-[46px] rounded-[10px] border-border bg-card px-[13px] text-[15px] focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15 md:text-[15px]";

/** One message per field, keyed so `aria-invalid` and the inline text agree. */
type LicenceFieldErrors = {
  photos?: string;
  licenceNumber?: string;
  expiresAt?: string;
  categories?: string;
};

/**
 * Today as `YYYY-MM-DD` in the *driver's own* timezone, for comparison against
 * a `<input type="date">` value (which is a bare calendar date, not an instant).
 * Deliberately not `toISOString()`, which is UTC: a driver in UTC+4 opening the
 * wizard before 04:00 would otherwise be judged against yesterday's date.
 */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Every rule the design's field table puts on this step. Pure, and evaluated on
 * every render so that once the messages are showing they correct themselves as
 * the driver types, rather than staying stale until the next Continue.
 *
 * Note that the expiry check is a UX convenience only: a resumed draft can be
 * days old, so `POST .../onboarding/submit` re-checks expiry against the actual
 * submit time and is the authoritative one.
 */
function validateLicence(input: {
  licenceNumber: string;
  expiresAt: string;
  categories: OnboardingDraftLicenceCategory[];
  hasFront: boolean;
  hasBack: boolean;
}): LicenceFieldErrors {
  const errors: LicenceFieldErrors = {};

  if (!input.hasFront || !input.hasBack) {
    errors.photos = "Both sides of the licence are required.";
  }

  const licenceNumber = input.licenceNumber.trim();
  if (!licenceNumber) {
    errors.licenceNumber = "Enter the licence number.";
  } else if (licenceNumber.length < MIN_LICENCE_NUMBER_LENGTH) {
    errors.licenceNumber = "That looks too short.";
  }

  if (!input.expiresAt) {
    errors.expiresAt = "Enter the expiry date.";
  } else if (input.expiresAt <= todayIsoDate()) {
    // Lexicographic comparison is exact for `YYYY-MM-DD`, and — unlike parsing
    // both sides into `Date`s — has no timezone edge to get wrong. A licence
    // expiring today is already unusable for a journey, so "must be in the
    // future" excludes today.
    errors.expiresAt = "This licence has expired. Renew it before applying.";
  }

  if (input.categories.length === 0) {
    errors.categories = "Select at least one category you hold.";
  }

  return errors;
}

/**
 * Step 2 — licence verification: the front and back photos, the licence number,
 * its expiry, and the categories held.
 *
 * The categories are the step's real payload: they decide which vehicle classes
 * step 3 will let the driver pick, which is why deselecting one has to reach
 * forward and clear an already-chosen class that depended on it (see
 * `applyCategories`).
 *
 * Every field is bound straight to the draft rather than mirrored into local
 * state. `updateDraft` is synchronous for the in-memory draft (only the `PATCH`
 * is debounced), so the inputs stay responsive while there is exactly one copy
 * of each answer — which is what makes a reload restore the step faithfully.
 */
export function Step2Licence() {
  const { draft, documents, updateDraft, goToStep, showToast } =
    useOnboardingDraft();

  // Which upload dialog is open, or null for none. One piece of state rather
  // than two booleans: the dialog is modal, so only ever one slot at a time.
  const [openSlot, setOpenSlot] = useState<DocumentSlot | null>(null);
  // Messages stay hidden until the first failed Continue, per the design's
  // "validate on continue, not on blur".
  const [showErrors, setShowErrors] = useState(false);

  const licenceNumberId = useId();
  const expiresAtId = useId();
  const licenceNumberErrorId = `${licenceNumberId}-error`;
  const expiresAtErrorId = `${expiresAtId}-error`;
  const photosErrorId = `${licenceNumberId}-photos-error`;
  const categoriesErrorId = `${licenceNumberId}-categories-error`;

  const licence = draft.licence ?? {};
  const licenceNumber = licence.licenceNumber ?? "";
  const expiresAt = licence.expiresAt ?? "";
  const categories = licence.categories ?? [];

  function documentForSlot(slot: DocumentSlot) {
    return documents.find(
      (document) => document.type === SLOT_TO_DOCUMENT_TYPE[slot],
    );
  }

  const problems = validateLicence({
    licenceNumber,
    expiresAt,
    categories,
    hasFront: documentForSlot("licFront") !== undefined,
    hasBack: documentForSlot("licBack") !== undefined,
  });
  const errors: LicenceFieldErrors = showErrors ? problems : {};

  /**
   * Writes a new category list, clearing an incompatible vehicle class in the
   * same patch. Both belong in one `updateDraft` call so the pair is saved
   * together — a driver who closes the tab between two calls must not be left
   * with a class their licence no longer supports.
   */
  function applyCategories(nextCategories: OnboardingDraftLicenceCategory[]) {
    const currentClassId = draft.vehicle?.classId;
    const shouldClearClass =
      currentClassId !== undefined &&
      isClassLockedByLicence(currentClassId, nextCategories);

    updateDraft({
      licence: { ...licence, categories: nextCategories },
      ...(shouldClearClass
        ? { vehicle: { ...draft.vehicle, classId: undefined } }
        : {}),
    });
  }

  /**
   * Sets one category's membership to an explicit value rather than toggling
   * it. A `<label>` click reaching the checkbox is one activation in every
   * browser, but an idempotent setter means even a doubled event lands on the
   * state the driver asked for instead of undoing itself.
   */
  function setCategorySelected(
    code: OnboardingDraftLicenceCategory,
    selected: boolean,
  ) {
    applyCategories(
      LICENCE_CATEGORIES.filter((category) =>
        category.code === code ? selected : categories.includes(category.code),
      ).map((category) => category.code),
    );
  }

  function handleContinue() {
    if (Object.keys(problems).length > 0) {
      setShowErrors(true);
      showToast("Fix the highlighted fields to continue.", "error");
      return;
    }

    goToStep(ONBOARDING_SCREENS.vehicleBodyAndClass);
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3.5">
        <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
          Scans or photos both work. All four corners must be visible and free
          of glare.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {LICENCE_SLOTS.map(({ slot, title }) => {
            const uploadedDocument = documentForSlot(slot);
            const uploaded = uploadedDocument !== undefined;

            return (
              <button
                key={slot}
                type="button"
                onClick={() => setOpenSlot(slot)}
                aria-describedby={
                  errors.photos !== undefined ? photosErrorId : undefined
                }
                className={`flex w-full cursor-pointer flex-col gap-2.5 rounded-xl border border-dashed p-3 text-left transition-colors hover:border-onboarding-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  uploaded
                    ? UPLOADED_TILE_CLASS
                    : errors.photos !== undefined
                      ? "border-destructive bg-card"
                      : "border-border bg-card"
                }`}
              >
                <span className="flex h-[104px] items-center justify-center overflow-hidden rounded-[9px] bg-muted font-price text-xs text-muted-foreground">
                  {uploadedDocument?.signedUrl != null ? (
                    <>
                      {/*
                        Plain <img> rather than next/image: these are short-lived
                        signed URLs on the project's own Supabase host, which is
                        configured per deployment and so can't be pinned in
                        `remotePatterns` at build time.
                      */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadedDocument.signedUrl}
                        alt={`${title}, uploaded`}
                        className="size-full object-cover"
                      />
                    </>
                  ) : uploaded ? (
                    // The row exists but its read URL could not be signed —
                    // say so rather than rendering a broken image.
                    "PREVIEW UNAVAILABLE"
                  ) : (
                    "Click to upload"
                  )}
                </span>

                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-semibold">{title}</span>
                  <span
                    className={`text-xs font-semibold ${
                      uploaded ? UPLOADED_TEXT_CLASS : "text-muted-foreground"
                    }`}
                  >
                    {uploaded ? "Uploaded" : "Not uploaded"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {errors.photos !== undefined ? (
          <p id={photosErrorId} className="text-xs text-destructive">
            {errors.photos}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={licenceNumberId}
            className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase"
          >
            Licence number
          </Label>
          <Input
            id={licenceNumberId}
            value={licenceNumber}
            onChange={(event) =>
              updateDraft({
                licence: { ...licence, licenceNumber: event.target.value },
              })
            }
            placeholder="D4419-88210"
            autoComplete="off"
            aria-invalid={errors.licenceNumber !== undefined}
            aria-describedby={
              errors.licenceNumber !== undefined
                ? licenceNumberErrorId
                : undefined
            }
            className={`${FIELD_CLASS} font-price tracking-[0.05em]`}
          />
          {errors.licenceNumber !== undefined ? (
            <p id={licenceNumberErrorId} className="text-xs text-destructive">
              {errors.licenceNumber}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor={expiresAtId}
            className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase"
          >
            Expiry date
          </Label>
          <Input
            id={expiresAtId}
            type="date"
            value={expiresAt}
            onChange={(event) =>
              updateDraft({
                licence: { ...licence, expiresAt: event.target.value },
              })
            }
            aria-invalid={errors.expiresAt !== undefined}
            aria-describedby={
              errors.expiresAt !== undefined ? expiresAtErrorId : undefined
            }
            className={FIELD_CLASS}
          />
          {errors.expiresAt !== undefined ? (
            <p id={expiresAtErrorId} className="text-xs text-destructive">
              {errors.expiresAt}
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <p className="text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          Categories held
        </p>
        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
          These decide the vehicle classes you can be dispatched for.
        </p>

        {LICENCE_CATEGORIES.map(({ code, description }) => {
          const checkboxId = `${licenceNumberId}-category-${code}`;
          const selected = categories.includes(code);

          return (
            // A label wrapping the checkbox, rather than a button containing
            // one: the card has to be clickable as a whole, and nesting an
            // interactive control inside a <button> would be invalid markup.
            <Label
              key={code}
              htmlFor={checkboxId}
              className={`w-full cursor-pointer items-center gap-3 rounded-[11px] border px-[13px] py-3 font-normal transition-colors ${
                selected
                  ? "border-onboarding-accent bg-onboarding-accent/5"
                  : "border-border bg-card hover:border-input"
              }`}
            >
              <Checkbox
                id={checkboxId}
                checked={selected}
                onCheckedChange={(checked) =>
                  setCategorySelected(code, checked === true)
                }
                aria-describedby={
                  errors.categories !== undefined
                    ? categoriesErrorId
                    : undefined
                }
                className="size-[19px] rounded-[5px] border-[1.5px] data-checked:border-onboarding-accent data-checked:bg-onboarding-accent data-checked:text-white"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-price text-sm font-semibold">
                  Category {code}
                </span>
                <span className="mt-px block text-xs text-muted-foreground">
                  {description}
                </span>
              </span>
            </Label>
          );
        })}

        {errors.categories !== undefined ? (
          <p id={categoriesErrorId} className="text-xs text-destructive">
            {errors.categories}
          </p>
        ) : null}
      </section>

      {/* Raw buttons rather than `src/components/ui/button.tsx`: the design's
          48px wizard CTA is well outside that primitive's size scale, and these
          match the accent/outline pair the shell's own welcome screen uses. */}
      <div className="mt-1 flex items-center gap-3.5 border-t border-border pt-[22px]">
        <button
          type="button"
          onClick={handleContinue}
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => goToStep(ONBOARDING_SCREENS.personal)}
          className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Back
        </button>
      </div>

      {openSlot !== null ? (
        <DocumentUploadDialog
          slot={openSlot}
          open
          onOpenChange={(open) => {
            if (!open) setOpenSlot(null);
          }}
          // The signed URL is deliberately not captured here. The dialog has
          // already folded the whole document — preview URL and all — into the
          // context's `documents`, which is what the tiles above read, so
          // holding a second copy would only give the two ways to disagree.
          onUploaded={() => setOpenSlot(null)}
        />
      ) : null}
    </div>
  );
}
