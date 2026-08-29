"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, UploadIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  DocumentUploadDialog,
  SLOT_TO_DOCUMENT_TYPE,
} from "@/components/driver-onboarding/document-upload-dialog";
import {
  ONBOARDING_SCREENS,
  useOnboardingDraft,
} from "@/components/driver-onboarding/onboarding-draft-context";
import type { OnboardingDraftV1 } from "@/lib/driver-onboarding/draft-schema";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

/** The `personal` section of the draft, with its optionality unwrapped. */
type PersonalDraft = NonNullable<OnboardingDraftV1["personal"]>;

/** One entry of `GEORGIAN_CITY_OPTIONS`. */
type CityOption = (typeof GEORGIAN_CITY_OPTIONS)[number];

/**
 * Every input on this screen that can carry its own inline error. The profile
 * photo is in the list even though it is a button rather than a field: it fails
 * validation the same way and gets the same red-outlined, message-below
 * treatment.
 */
type PersonalField =
  "phone" | "fullName" | "idNumber" | "dateOfBirth" | "city" | "profilePhoto";

type Problems = Partial<Record<PersonalField, string>>;

// ── Validation rules, straight from the design's field table ────────────────

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
/** Letters, digits and hyphens only — no spaces, no other punctuation. */
const ID_NUMBER_PATTERN = /^[A-Za-z0-9-]{6,20}$/;
const MIN_DRIVER_AGE = 21;
const MAX_DRIVER_AGE = 75;

/** The design's max-height for the city list before it scrolls. */
const CITY_LIST_MAX_HEIGHT_CLASS = "max-h-[236px]";

/**
 * The design's "approved" green, used here for the filled photo slot. Written
 * as an arbitrary value rather than a token because `globals.css` defines no
 * green for this wizard and one step is the wrong place to introduce one — the
 * same call the toast makes for its single-use ink.
 */
const UPLOADED_BORDER_CLASS = "border-[oklch(0.5_0.13_145)]";
const UPLOADED_TINT_CLASS = "bg-[oklch(0.5_0.13_145)]/5";
const UPLOADED_TEXT_CLASS = "text-[oklch(0.5_0.13_145)]";

const VALIDATION_TOAST = "Fix the highlighted fields to continue.";

/**
 * Whole years between `isoDate` and `today`, or `null` if the string is not a
 * date at all.
 *
 * Parsed as local midnight (`T00:00:00`) rather than through `new Date(iso)`,
 * which reads a bare `YYYY-MM-DD` as *UTC* midnight — west of Greenwich that
 * lands on the previous day locally and would shift a birthday-eve applicant a
 * whole year. Calendar arithmetic, not a division by an average year length,
 * so a driver who turns 21 today passes on the day rather than a few hours late.
 */
function ageInYears(isoDate: string, today: Date): number | null {
  const born = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;

  const hadBirthdayThisYear =
    today.getMonth() > born.getMonth() ||
    (today.getMonth() === born.getMonth() && today.getDate() >= born.getDate());

  return (
    today.getFullYear() - born.getFullYear() - (hadBirthdayThisYear ? 0 : 1)
  );
}

/** The city whose label is exactly `label`, ignoring case, or `undefined`. */
function findCityByLabel(label: string): CityOption | undefined {
  const needle = label.trim().toLowerCase();
  if (!needle) return undefined;
  return GEORGIAN_CITY_OPTIONS.find(
    (option) => option.label.toLowerCase() === needle,
  );
}

/**
 * Every rule this step enforces, evaluated together so a failed Continue can
 * light up *all* the offending fields at once rather than walking the driver
 * through them one at a time. Messages are the design's, verbatim.
 *
 * `cityQuery` is separate from `personal.city` because the two answer different
 * questions: the draft holds the `GeorgianCity` enum value of a real selection,
 * while the query is whatever is currently typed in the box. A non-empty query
 * with no stored value means "typed something that isn't a city", which earns a
 * different sentence from an empty box.
 */
function collectProblems(
  personal: PersonalDraft,
  cityQuery: string,
  hasProfilePhoto: boolean,
  today: Date,
): Problems {
  const problems: Problems = {};

  const phoneDigits = (personal.phone ?? "").replace(/\D/g, "");
  if (!phoneDigits) {
    problems.phone = "Enter your mobile number.";
  } else if (
    phoneDigits.length < MIN_PHONE_DIGITS ||
    phoneDigits.length > MAX_PHONE_DIGITS
  ) {
    problems.phone = `That is not a valid mobile number (${MIN_PHONE_DIGITS}–${MAX_PHONE_DIGITS} digits).`;
  }

  const fullName = (personal.fullName ?? "").trim();
  if (!fullName) {
    problems.fullName = "Enter your full name.";
  } else if (fullName.split(/\s+/).length < 2) {
    problems.fullName = "Give first and last name, exactly as on your ID.";
  }

  const idNumber = (personal.idNumber ?? "").trim();
  if (!idNumber) {
    problems.idNumber = "Enter your ID or passport number.";
  } else if (!ID_NUMBER_PATTERN.test(idNumber)) {
    problems.idNumber = "6–20 letters, digits or hyphens, no spaces.";
  }

  const dateOfBirth = personal.dateOfBirth ?? "";
  const age = dateOfBirth ? ageInYears(dateOfBirth, today) : null;
  if (!dateOfBirth || age === null) {
    problems.dateOfBirth = "Enter your date of birth.";
  } else if (age < MIN_DRIVER_AGE) {
    problems.dateOfBirth = `Partner drivers must be ${MIN_DRIVER_AGE} or older.`;
  } else if (age > MAX_DRIVER_AGE) {
    problems.dateOfBirth = "Check the date — that does not look right.";
  }

  if (!personal.city) {
    problems.city = cityQuery.trim()
      ? "Pick a city from the list."
      : "Select the city you will drive in.";
  }

  if (!hasProfilePhoto) {
    problems.profilePhoto = "A profile photo is required for identity checks.";
  }

  return problems;
}

/**
 * Step 1 — authorisation & personal details: mobile number, full name, ID or
 * passport number, date of birth, city, and a profile photo. There is no SMS
 * code screen; the phone is a plain, unverified `tel` field (see
 * `requirements.md`'s Non-Goals).
 *
 * Two pieces of state that look like one, and must not be merged:
 *
 * - **The answers** live in the draft, written through `updateDraft` on every
 *   keystroke. That is what makes the wizard resumable, and it is deliberately
 *   indifferent to whether what was typed is valid yet — a half-typed name is
 *   still worth saving.
 * - **The errors** are derived, and shown only for fields the driver has
 *   already tried to submit (`touched`). So nothing is red before the first
 *   Continue, every failing field turns red on the same click, and a field goes
 *   quiet again the moment it is corrected — without a second Continue.
 */
export function Step1AuthPersonal() {
  const { draft, documents, updateDraft, goToStep, showToast } =
    useOnboardingDraft();

  const personal = useMemo<PersonalDraft>(
    () => draft.personal ?? {},
    [draft.personal],
  );

  const fieldId = useId();
  const cityListId = `${fieldId}-city-list`;

  // Which fields have been through a failed Continue. Not "has been edited":
  // validation fires on Continue, not on blur.
  const [touched, setTouched] = useState<Partial<Record<PersonalField, true>>>(
    {},
  );

  // The text in the city box. Seeded once from the saved selection — the shell
  // does not render a step until the initial `GET` has resolved, so the draft is
  // already populated on first render and there is nothing to sync later.
  const [cityQuery, setCityQuery] = useState<string>(
    () =>
      GEORGIAN_CITY_OPTIONS.find(
        (option) => option.value === draft.personal?.city,
      )?.label ?? "",
  );
  const [cityOpen, setCityOpen] = useState(false);
  const [cityActiveIndex, setCityActiveIndex] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);

  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityListRef = useRef<HTMLDivElement>(null);

  // The live `PROFILE_PHOTO` row, if one has been uploaded. The context keeps
  // exactly one entry per type, so this is either the current document or
  // nothing at all — there is no history to disambiguate here.
  const profilePhoto =
    documents.find((entry) => entry.type === SLOT_TO_DOCUMENT_TYPE.selfie) ??
    null;

  const cityMatches = useMemo(() => {
    const needle = cityQuery.trim().toLowerCase();
    if (!needle) return GEORGIAN_CITY_OPTIONS;
    return GEORGIAN_CITY_OPTIONS.filter((option) =>
      option.label.toLowerCase().includes(needle),
    );
  }, [cityQuery]);

  // Clamped rather than reset when the list shrinks under the cursor, so
  // narrowing a search never leaves the highlight pointing past the last row.
  const activeIndex = Math.min(
    cityActiveIndex,
    Math.max(cityMatches.length - 1, 0),
  );

  // Keeps the keyboard cursor inside the 236px scroll window. Queried by
  // attribute rather than held in a ref array, which would have to be rebuilt
  // on every keystroke as the filtered list changes length.
  useEffect(() => {
    if (!cityOpen) return;
    cityListRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cityOpen, activeIndex, cityMatches.length]);

  // Safe to read the clock during render: this component only ever mounts on
  // the client, after the wizard's own `GET` has resolved, so there is no
  // server-rendered markup for a differing "today" to disagree with.
  const problems = collectProblems(
    personal,
    cityQuery,
    profilePhoto !== null,
    new Date(),
  );

  /** The message to show under `field`, or `undefined` while it stays quiet. */
  function errorFor(field: PersonalField): string | undefined {
    return touched[field] ? problems[field] : undefined;
  }

  /**
   * Writes one or more personal fields back to the draft. The whole section is
   * re-sent because `updateDraft` merges at the section level — sending only the
   * changed key would drop every other answer.
   */
  function setPersonal(patch: Partial<PersonalDraft>) {
    updateDraft({ personal: { ...personal, ...patch } });
  }

  function handleCityQueryChange(value: string) {
    setCityQuery(value);
    setCityOpen(true);
    setCityActiveIndex(0);
    // Only an exact city name counts as a selection: the draft stores the
    // `GeorgianCity` enum value, so anything else has to clear it rather than
    // leave a stale city attached to text that no longer names it.
    setPersonal({ city: findCityByLabel(value)?.value });
  }

  function selectCity(option: CityOption) {
    setCityQuery(option.label);
    setPersonal({ city: option.value });
    setCityOpen(false);
    cityInputRef.current?.focus();
  }

  function handleCityKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!cityOpen) {
        setCityOpen(true);
        return;
      }
      if (cityMatches.length === 0) return;

      const delta = event.key === "ArrowDown" ? 1 : -1;
      // Wraps, so holding either arrow always reaches every row.
      setCityActiveIndex(
        (activeIndex + delta + cityMatches.length) % cityMatches.length,
      );
      return;
    }

    if (event.key === "Enter" && cityOpen) {
      const option = cityMatches[activeIndex];
      if (option) {
        // Only swallowed when it actually picks something; otherwise Enter
        // stays available to submit the step.
        event.preventDefault();
        selectCity(option);
      }
      return;
    }

    if (event.key === "Escape" && cityOpen) {
      event.preventDefault();
      setCityOpen(false);
    }
  }

  function handleContinue() {
    const failing = Object.keys(problems) as PersonalField[];

    if (failing.length > 0) {
      setTouched((current) => {
        const next = { ...current };
        for (const field of failing) next[field] = true;
        return next;
      });
      // An open dropdown would cover the fields the toast is pointing at.
      setCityOpen(false);
      showToast(VALIDATION_TOAST, "error");
      return;
    }

    goToStep(ONBOARDING_SCREENS.licence);
  }

  const photoUploaded = profilePhoto !== null;
  const photoError = errorFor("profilePhoto");

  return (
    <div className="flex flex-col gap-4">
      {/* The design's own intro sentence with its OTP clause removed — this
          feature sends no SMS code, so promising one would be a lie. */}
      <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
        This is the number couriers and dispatch will call. Everything here is
        checked against your ID by the review team.
      </p>

      <Field
        label="Mobile number"
        htmlFor={`${fieldId}-phone`}
        error={errorFor("phone")}
      >
        <Input
          id={`${fieldId}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+995 555 12 34 56"
          value={personal.phone ?? ""}
          aria-invalid={errorFor("phone") !== undefined}
          onChange={(event) => setPersonal({ phone: event.target.value })}
          className={fieldClassName(errorFor("phone") !== undefined)}
        />
      </Field>

      <Field
        label="Full name"
        htmlFor={`${fieldId}-name`}
        error={errorFor("fullName")}
      >
        <Input
          id={`${fieldId}-name`}
          autoComplete="name"
          placeholder="Exactly as printed on your ID"
          value={personal.fullName ?? ""}
          aria-invalid={errorFor("fullName") !== undefined}
          onChange={(event) => setPersonal({ fullName: event.target.value })}
          className={fieldClassName(errorFor("fullName") !== undefined)}
        />
      </Field>

      <Field
        label="ID or passport number"
        htmlFor={`${fieldId}-id-number`}
        error={errorFor("idNumber")}
      >
        <Input
          id={`${fieldId}-id-number`}
          placeholder="AB1234567"
          value={personal.idNumber ?? ""}
          aria-invalid={errorFor("idNumber") !== undefined}
          onChange={(event) => setPersonal({ idNumber: event.target.value })}
          // `font-price` is this codebase's IBM Plex Mono stack (see the
          // `--font-price` token) — the design's mono treatment for identifiers.
          className={`${fieldClassName(errorFor("idNumber") !== undefined)} font-price tracking-[0.06em]`}
        />
      </Field>

      <Field
        label="Date of birth"
        htmlFor={`${fieldId}-dob`}
        error={errorFor("dateOfBirth")}
      >
        <Input
          id={`${fieldId}-dob`}
          type="date"
          autoComplete="bday"
          value={personal.dateOfBirth ?? ""}
          aria-invalid={errorFor("dateOfBirth") !== undefined}
          onChange={(event) => setPersonal({ dateOfBirth: event.target.value })}
          className={fieldClassName(errorFor("dateOfBirth") !== undefined)}
        />
      </Field>

      <Field
        label="City"
        htmlFor={`${fieldId}-city`}
        error={errorFor("city")}
        hint="Where you will mostly pick up orders. Georgia only for now."
      >
        {/* Hand-built combobox: this codebase has no such primitive, and the
            design needs a filtered, region-annotated list rather than the flat
            63-entry `Select` the other city pickers use. */}
        <Popover open={cityOpen} onOpenChange={setCityOpen}>
          <PopoverAnchor asChild>
            <Input
              id={`${fieldId}-city`}
              ref={cityInputRef}
              role="combobox"
              autoComplete="off"
              aria-expanded={cityOpen}
              aria-controls={cityOpen ? cityListId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={
                cityOpen && cityMatches[activeIndex]
                  ? `${cityListId}-${activeIndex}`
                  : undefined
              }
              placeholder="Start typing — Tbilisi, Batumi, Kutaisi…"
              value={cityQuery}
              aria-invalid={errorFor("city") !== undefined}
              onChange={(event) => handleCityQueryChange(event.target.value)}
              onFocus={() => setCityOpen(true)}
              // Both, deliberately: focusing opens the list, and clicking an
              // already-focused box (after a selection closed it) fires no
              // focus event, so without this the list could not be reopened
              // without leaving the field first.
              onClick={() => setCityOpen(true)}
              onKeyDown={handleCityKeyDown}
              className={fieldClassName(errorFor("city") !== undefined)}
            />
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={6}
            // The list is an extension of the input, not a dialog: focus has to
            // stay in the box so typing keeps filtering, and has to stay put
            // when the list closes.
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // A click on the input itself is "outside" the portalled list, and
            // would otherwise close the list the click is meant to keep open.
            onInteractOutside={(event) => {
              if (
                event.target instanceof Node &&
                cityInputRef.current?.contains(event.target)
              ) {
                event.preventDefault();
              }
            }}
            className={`w-(--radix-popover-trigger-width) gap-0 overflow-y-auto p-0 ${CITY_LIST_MAX_HEIGHT_CLASS}`}
          >
            <div ref={cityListRef} id={cityListId} role="listbox">
              {cityMatches.length === 0 ? (
                <p className="px-[13px] py-[11px] text-[13px] text-muted-foreground">
                  No city by that name. Check the spelling.
                </p>
              ) : (
                cityMatches.map((option, index) => {
                  const active = index === activeIndex;

                  return (
                    <button
                      key={option.value}
                      id={`${cityListId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={option.value === personal.city}
                      data-active={active}
                      // `onMouseDown` rather than `onClick`: the input would
                      // otherwise lose focus first and close the list out from
                      // under the click.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectCity(option);
                      }}
                      onMouseEnter={() => setCityActiveIndex(index)}
                      className={`flex w-full items-baseline justify-between gap-2.5 border-b border-border px-[13px] py-2.5 text-left last:border-b-0 ${
                        active ? "bg-muted" : "bg-transparent"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {option.label}
                      </span>
                      <span className="text-[11.5px] text-muted-foreground">
                        {option.region}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </PopoverContent>
        </Popover>
      </Field>

      <div className="mt-1.5 flex flex-col gap-2">
        {/* A plain heading rather than a `Label`: the control below is a button
            that opens a dialog, and a label bound to it would only re-fire the
            click that opened the dialog in the first place. */}
        <p className="font-price text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          Profile photo
        </p>
        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
          A recent photo of your face, matched against your ID by the review
          team.
        </p>

        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          aria-describedby={
            photoError !== undefined ? `${fieldId}-photo-error` : undefined
          }
          className={`flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-dashed p-3.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
            photoError !== undefined
              ? "border-destructive bg-destructive/5"
              : photoUploaded
                ? `${UPLOADED_BORDER_CLASS} ${UPLOADED_TINT_CLASS}`
                : "border-border bg-card hover:border-onboarding-accent"
          }`}
        >
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
            {profilePhoto?.signedUrl ? (
              // Plain <img> rather than next/image: these are short-lived
              // signed Supabase URLs on a host this project has deliberately
              // never added to `images.remotePatterns`, matching every other
              // photo surface in the app.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profilePhoto.signedUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : photoUploaded ? (
              <CheckIcon className={`size-5 ${UPLOADED_TEXT_CLASS}`} />
            ) : (
              <UploadIcon className="size-5" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {photoUploaded
                ? "Profile photo uploaded"
                : "Upload a profile photo"}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {photoUploaded
                ? "Click to replace the file"
                : "JPG or PNG, max 10 MB"}
            </span>
          </span>

          <span
            className={`shrink-0 text-xs font-semibold ${
              photoUploaded ? UPLOADED_TEXT_CLASS : "text-muted-foreground"
            }`}
          >
            {photoUploaded ? "Uploaded" : "Required"}
          </span>
        </button>

        {photoError !== undefined ? (
          <p
            id={`${fieldId}-photo-error`}
            role="alert"
            className="text-xs text-destructive"
          >
            {photoError}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3.5 border-t border-border pt-[22px]">
        <button
          type="button"
          onClick={handleContinue}
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Continue
        </button>
      </div>

      <DocumentUploadDialog
        slot="selfie"
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        // Nothing to do: the dialog has already folded the document into the
        // context's `documents`, which is where this step reads the slot's
        // state from — so the inline error clears itself on the next render.
        onUploaded={() => {}}
      />
    </div>
  );
}

/**
 * The design's input treatment: 46px tall, 10px radius, card background, and an
 * orange focus ring. The focus colours are dropped while the field is invalid so
 * they cannot compete with the primitive's own `aria-invalid` red border, which
 * carries the same specificity.
 */
function fieldClassName(invalid: boolean): string {
  return `h-[46px] rounded-[10px] bg-card px-[13px] text-[15px] md:text-[15px] ${
    invalid
      ? ""
      : "focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15"
  }`;
}

/**
 * Label, control, error and optional helper text in the design's stacking
 * order. Local to this step rather than shared: the other steps' fields are
 * radio cards, checkbox cards and swatch grids, which stack nothing like this.
 */
function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="font-price text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase"
      >
        {label}
      </Label>
      {children}
      {error !== undefined ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
