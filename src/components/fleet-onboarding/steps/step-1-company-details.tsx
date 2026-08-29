"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  FLEET_SCREENS,
  type FleetCompanyOnRecord,
  type FleetSubmittedSummary,
  useFleetDraft,
} from "@/components/fleet-onboarding/fleet-draft-context";
import type { FleetDraftCompany } from "@/lib/fleet-onboarding/draft-schema";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

/**
 * The `company` section of the fleet draft. Imported rather than restated: these
 * spellings — `registeredAddress`, `citiesOfOperation`, `bankAccountIban` — are
 * the draft keys, the `LogisticsCompany` column names and this step's request
 * body keys all at once, so there is no rename layer anywhere in the chain.
 */
type CompanyDraft = FleetDraftCompany;

/** One entry of `GEORGIAN_CITY_OPTIONS`. */
type CityOption = (typeof GEORGIAN_CITY_OPTIONS)[number];

/**
 * Where this form's edits go, and what happens after a successful save.
 *
 * `"draft"` is the wizard: edits land in the draft blob through `updateDraft`
 * and Continue advances to step 2. `"correction"` is task-15's ACTION_REQUIRED
 * dialog: the draft is null in that state and the context's `persist` bails on
 * any non-DRAFT status, so edits are held locally and a save raises a toast and
 * refetches instead of navigating — a submitted application has no next step.
 */
type CompanyFormMode = "draft" | "correction";

/**
 * Every field that can carry an inline error. `city` is deliberately absent: it
 * is the registered city, displayed read-only and never editable here (§7), so
 * it can never light up red.
 *
 * `phone` is here but is mode-dependent: only correction mode renders a field
 * for it, and only correction mode validates it (see `collectProblems`). In the
 * wizard it is carried through untouched and cannot light up at all.
 */
type CompanyField =
  | "phone"
  | "companyName"
  | "vatId"
  | "registeredAddress"
  | "citiesOfOperation"
  | "contactName"
  | "contactRole"
  | "contactEmail"
  | "bankAccountIban";

type Problems = Partial<Record<CompanyField, string>>;

// ── Validation rules, straight from the design's field table ────────────────

const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
const MIN_COMPANY_NAME_LENGTH = 3;
/** Georgian VAT / tax identification numbers are exactly nine digits. */
const VAT_ID_PATTERN = /^\d{9}$/;
/** Shape check only — one `@`, something either side, a dot in the domain. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
/**
 * Counted after every space is stripped, because IBANs are conventionally
 * written in groups of four. The bound is 18 while the message names 22 on
 * purpose: 22 is the Georgian length and is what a company here should be
 * typing, but the looser floor stops a correctly-formed foreign IBAN from being
 * rejected outright. Mirrors the server's own bound in
 * `src/app/api/logistics-company/route.ts`.
 */
const MIN_IBAN_LENGTH = 18;

/** The design's max-height for the city list before it scrolls. */
const CITY_LIST_MAX_HEIGHT_CLASS = "max-h-[236px]";

/** The design's mono kicker above each group, distinct from the field labels. */
const GROUP_HEADING_CLASS =
  "font-price text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";

/** The shared uppercase field label. */
const FIELD_LABEL_CLASS =
  "font-price text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase";

/** The wizard's shared primary CTA. */
const PRIMARY_CTA_CLASS =
  "h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const COMPANY_ENDPOINT = "/api/logistics-company";
const SAVE_FALLBACK =
  "We couldn't save the company details. Check your connection and try again.";
const VALIDATION_TOAST = "Fix the highlighted fields to continue.";
const CORRECTION_SAVED_TOAST = "Company details updated.";

const CITY_PLACEHOLDER_EMPTY = "Start typing — Tbilisi, Batumi, Kutaisi…";
const CITY_PLACEHOLDER_MORE = "Add another city…";
const IBAN_PLACEHOLDER = "GE29 NB00 0000 0101 9049 17";
const PAYOUT_HINT =
  "Order revenue is settled to this account weekly. It must belong to the registered entity.";
/** Appended in correction mode, where the seeded value is masked (§8). */
const PAYOUT_REENTRY_HINT = "Re-enter the full account number to confirm it.";

/**
 * Reads an `{ error }` body without letting a non-JSON response (an HTML error
 * page from an unhandled crash, say) throw over the top of the real failure.
 * Defined here rather than imported: the context's copy is not exported, and it
 * is four lines.
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
 * The company email's own rule, kept separate from the rest because both
 * sub-screens gate on it: the email sub-screen's Continue reuses it, and the
 * seeding rule for which sub-screen opens first is "does the saved address
 * already pass this?". There is exactly one email predicate in this file, and
 * this is it — `collectProblems` calls it rather than restating the pattern.
 */
function emailProblem(value: string | undefined): string | undefined {
  const email = (value ?? "").trim();
  if (!email) return "Enter a company email.";
  if (!EMAIL_PATTERN.test(email)) {
    return "That does not look like an email address.";
  }
  return undefined;
}

/**
 * The phone's own rule — the design's, unchanged from when the wizard still
 * collected a number, down to both messages.
 *
 * It applies in correction mode only, which is the only mode with a phone
 * field: "Contact person unreachable" is one of the four company flag reasons,
 * and a wrong number is one of the ways a contact is unreachable, so a company
 * correcting that flag has to be able to retype it. The wizard still never asks
 * — sign-up owns the number there — which is why `collectProblems` takes the
 * mode rather than applying this unconditionally.
 */
function phoneProblem(value: string | undefined): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "Enter the company phone number.";
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return "That is not a valid number (10–15 digits).";
  }
  return undefined;
}

/**
 * Every rule this step enforces, evaluated together so a failed Continue can
 * light up *all* the offending fields at once rather than walking the company
 * through them one at a time. Messages are the design's, verbatim.
 *
 * `phone` is the one mode-dependent rule, and it is gated rather than always-on
 * for a reason. In `"draft"` the wizard never asks for a number — it is carried
 * through to the POST unedited, exactly as `city` is — so validating it would
 * let a value the company cannot see or reach block Continue, with a toast
 * pointing at no field. In `"correction"` there *is* a field, so the rule
 * applies. Either way the endpoint re-checks it, and its 400 (or its 409 on a
 * number another company already holds) is surfaced by the toast in
 * `handleContinue`.
 */
function collectProblems(
  company: CompanyDraft,
  mode: CompanyFormMode,
): Problems {
  const problems: Problems = {};

  if (mode === "correction") {
    const phone = phoneProblem(company.phone);
    if (phone !== undefined) {
      problems.phone = phone;
    }
  }

  const companyName = (company.companyName ?? "").trim();
  if (!companyName) {
    problems.companyName = "Enter the registered company name.";
  } else if (companyName.length < MIN_COMPANY_NAME_LENGTH) {
    problems.companyName = "That looks too short.";
  }

  const vatId = (company.vatId ?? "").trim();
  if (!vatId) {
    problems.vatId = "Enter the VAT or tax ID.";
  } else if (!VAT_ID_PATTERN.test(vatId)) {
    problems.vatId = "A Georgian tax ID is 9 digits.";
  }

  if (!(company.registeredAddress ?? "").trim()) {
    problems.registeredAddress = "Enter the registered address.";
  }

  if ((company.citiesOfOperation ?? []).length === 0) {
    problems.citiesOfOperation = "Select at least one city of operation.";
  }

  const contactName = (company.contactName ?? "").trim();
  const contactNameParts = contactName
    .split(/\s+/)
    .filter((part) => part !== "");
  if (!contactName) {
    problems.contactName = "Enter the contact person.";
  } else if (contactNameParts.length < 2) {
    problems.contactName = "First and last name.";
  }

  if (!(company.contactRole ?? "").trim()) {
    problems.contactRole = "Required.";
  }

  // Checked in both modes even though only correction mode renders a field for
  // it (see `CompanyDetailsForm`'s table): in the wizard the value arrives from
  // step 1's first sub-screen, and an unusable one must not reach the endpoint
  // just because the field that produced it is on the previous screen.
  const contactEmail = emailProblem(company.contactEmail);
  if (contactEmail !== undefined) {
    problems.contactEmail = contactEmail;
  }

  // Whitespace-free, matching how the server measures it.
  const bankAccountIban = (company.bankAccountIban ?? "").replace(/\s+/g, "");
  if (!bankAccountIban) {
    problems.bankAccountIban = "Enter the payout account.";
  } else if (bankAccountIban.length < MIN_IBAN_LENGTH) {
    problems.bankAccountIban = "A Georgian IBAN is 22 characters.";
  }

  return problems;
}

/**
 * The company fields as the submitted summary carries them — the normalised
 * `LogisticsCompany` columns the reviewer actually looked at, which is what a
 * correction has to start from once the draft is gone.
 *
 * `bankAccountIban` is deliberately not carried across: the summary masks it to
 * its last four characters, so seeding it would post asterisks over a good
 * account number. `CompanyDetailsForm` re-blanks it defensively as well.
 */
function companyFromSummary(
  summary: FleetSubmittedSummary | null,
): CompanyDraft {
  if (summary === null) return {};

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

/**
 * The company's own `LogisticsCompany` row behind whatever it has answered here.
 *
 * Field-by-field rather than a spread, and `??` rather than `||`: a draft value
 * of `""` is an answer — the company cleared the field — and must win over the
 * record, or a cleared field would refill itself on the next render. Only a key
 * the draft has never held falls through.
 *
 * This is what stops the wizard re-asking for what sign-up already persisted:
 * `companyName`, `vatId`, `phone` and `city` are written at sign-up but live
 * nowhere in a fresh draft, so before this the wizard opened with them blank
 * and rendered the read-only registered city as "—".
 *
 * Draft mode only. A correction seeds from `submittedSummary`, whose IBAN is
 * masked and whose values are what the reviewer saw (§8) — merging the raw row
 * into that would change what the correction dialog claims was submitted.
 */
function withRecordFallback(
  company: CompanyDraft,
  record: FleetCompanyOnRecord | null,
): CompanyDraft {
  if (record === null) return company;

  return {
    companyName: company.companyName ?? record.companyName,
    vatId: company.vatId ?? record.vatId,
    phone: company.phone ?? record.phone,
    city: company.city ?? record.city,
    registeredAddress: company.registeredAddress ?? record.registeredAddress,
    citiesOfOperation: company.citiesOfOperation ?? record.citiesOfOperation,
    contactName: company.contactName ?? record.contactName,
    contactRole: company.contactRole ?? record.contactRole,
    contactEmail: company.contactEmail ?? record.contactEmail,
    bankAccountIban: company.bankAccountIban ?? record.bankAccountIban,
  };
}

/**
 * Step 1 — the company's email on its own sub-screen, then its legal, contact
 * and payout details.
 *
 * A thin wrapper by design: everything below the email screen lives in
 * `CompanyDetailsForm`, which task-15's ACTION_REQUIRED dialog mounts on its own
 * to run the same form against the same endpoint without the wizard around it.
 *
 * The first sub-screen used to ask for the company phone, and the wizard no
 * longer asks for a phone number anywhere. Two reasons, both fatal to it:
 *
 * 1. Its copy told the company the number "becomes the account login", which was
 *    never true. Authentication here is Better Auth email/password (see
 *    `src/lib/auth.ts`) — the *email* is the login, and the phone authenticates
 *    nothing.
 * 2. It was redundant. `sign-up-form.tsx` already collects the phone *and* the
 *    email and POSTs `{ companyName, vatId, phone, city }` to
 *    `/api/logistics-company`, so this screen re-asked minutes later for a
 *    number the row already held.
 *
 * None of that changes the data model: `LogisticsCompany.phone` is still
 * non-null and unique, sign-up still collects it, and the POST in
 * `CompanyDetailsForm` still carries it — read-only here, like `city`, seeded
 * from `companyOnRecord` (see `withRecordFallback`).
 *
 * "Nowhere in the wizard" is exact: `CompanyDetailsForm` does render a phone
 * field in *correction* mode, where the company is answering an admin's
 * "Contact person unreachable" flag and the dialog is the only screen it gets.
 * That is not this wizard, and nothing on this path can reach it.
 *
 * There is no SMS code screen either. The design's six-box code screen is
 * bypassed in the prototype itself and dropped by `requirements.md` as an
 * explicit non-goal: this codebase has no SMS infrastructure, and with no phone
 * field left in the wizard there is nothing here for it to verify.
 */
export function Step1CompanyDetails() {
  const {
    draft,
    updateDraft,
    goToStep,
    showToast,
    status,
    submittedSummary,
    companyOnRecord,
  } = useFleetDraft();

  /**
   * task-09's shell puts `FleetApplicationStatusScreen` ahead of every wizard
   * step for all non-DRAFT statuses, so this is `"draft"` in every reachable
   * case. Derived rather than hard-coded because `updateDraft` is a silent
   * no-op outside DRAFT (the context's `persist` bails on the status), and a
   * form whose keystrokes vanish is worse than one that keeps them locally.
   */
  const mode: CompanyFormMode = status === "DRAFT" ? "draft" : "correction";

  /**
   * What the company has answered *for this application*: the draft while
   * editing, the submitted summary after submit. Deliberately un-merged with
   * the company row — this is the record of what was actually filled in here,
   * and the sub-screen gate below turns on exactly that distinction.
   */
  const answered = useMemo<CompanyDraft>(
    () =>
      mode === "draft"
        ? (draft.company ?? {})
        : companyFromSummary(submittedSummary),
    [mode, draft.company, submittedSummary],
  );

  /** The same answers with the company's persisted row behind them (draft only). */
  const seed = useMemo<CompanyDraft>(
    () =>
      mode === "draft"
        ? withRecordFallback(answered, companyOnRecord)
        : answered,
    [mode, answered, companyOnRecord],
  );

  /**
   * Which of the two sub-screens is showing. Local, not persisted: `draftStep`
   * is an integer 1–5 (see `fleet-wizard-shell.tsx`), so this is session-local
   * by design. Seeded to "details" when the *saved* email already passes
   * validation, so a company resuming step 1 is not made to re-confirm an
   * address it already gave us — and so a correction, whose seeded email comes
   * from a server-validated column and therefore always passes, opens straight
   * on the details with no special case.
   *
   * Keyed on `answered`, never on the seeded default: the record's fallback is
   * the account's own login address, which always passes validation, so keying
   * on `seed` would skip this sub-screen for every company and slip a seeded
   * answer past them unseen. A company confirms the address once, here; after
   * that its own draft value is what opens the details form directly.
   */
  const [phase, setPhase] = useState<"email" | "details">(() =>
    emailProblem(answered.contactEmail) === undefined ? "details" : "email",
  );

  /**
   * Whether the email has been through a failed Continue. A boolean rather than
   * the details form's `touched` record because this sub-screen has exactly one
   * field: validation fires on Continue, never on blur.
   */
  const [emailTouched, setEmailTouched] = useState(false);

  const fieldId = useId();
  const emailInputId = `${fieldId}-contact-email`;

  if (phase === "details") {
    return (
      <CompanyDetailsForm
        mode={mode}
        initial={seed}
        onBack={() => setPhase("email")}
        onSaved={() => {
          // Only the wizard has a next step. A correction has already been
          // toasted and refetched by the form itself.
          if (mode === "draft") {
            goToStep(FLEET_SCREENS.fleet);
          }
        }}
      />
    );
  }

  /**
   * What the field shows: the company's own answer if it has given one, and
   * otherwise the record's `contactEmail` — which the API seeds from the
   * address this account signs in with (see `buildCompanyOnRecord`). Seeded,
   * never locked: a company whose order mail should reach a shared dispatch
   * inbox rather than the address one person registered with types over it.
   */
  const email = seed.contactEmail ?? "";
  const emailError = emailTouched ? emailProblem(email) : undefined;

  function handleEmailContinue() {
    if (emailProblem(email) !== undefined) {
      setEmailTouched(true);
      showToast(VALIDATION_TOAST, "error");
      return;
    }

    // A seeded address lives on the company row, not in the draft, and every
    // later reader of this answer — the details form, the review step, the
    // POST — reads the draft. Writing it through here is what turns the seed
    // into the company's own answer, and it is also what makes the gate above
    // send them straight to the details form next time. A typed value is
    // already persisted by the debounced `updateDraft` below, so this is a
    // no-op for it.
    //
    // The whole merged section goes back, because `updateDraft` merges at the
    // section level and sending one key would drop the others. The record's
    // values riding along is harmless — they are the values the draft would
    // fall back to anyway, and the draft is scratch space, not the source of
    // truth for any of them.
    //
    // Not `goToStep`: this is a sub-screen of step 1, not a new step.
    if (answered.contactEmail !== email) {
      updateDraft({ company: { ...seed, contactEmail: email } });
    }

    setEmailTouched(false);
    setPhase("details");
  }

  return (
    <div className="flex max-w-[520px] flex-col gap-[18px]">
      <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
        The address this account signs in with. It is also where review
        decisions and order correspondence go — change it if a different inbox
        should receive them.
      </p>

      <Field label="Company email" htmlFor={emailInputId} error={emailError}>
        <Input
          id={emailInputId}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="dispatch@company.ge"
          value={email}
          aria-invalid={emailError !== undefined}
          aria-describedby={
            emailError !== undefined ? `${emailInputId}-error` : undefined
          }
          onChange={(event) =>
            updateDraft({
              company: { ...seed, contactEmail: event.target.value },
            })
          }
          // 48px and 16px rather than the shared 46/15: the design gives the
          // sole field on its own screen more presence.
          className={`h-12 rounded-[10px] bg-card px-[13px] text-base md:text-base ${
            emailError !== undefined
              ? ""
              : "focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15"
          }`}
        />
      </Field>

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={handleEmailContinue}
          className={PRIMARY_CTA_CLASS}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/**
 * The company's legal, contact and payout details in the design's three titled
 * groups, plus the POST that makes them authoritative on the `LogisticsCompany`
 * row.
 *
 * Exported separately from the step because task-15 mounts it in a dialog for
 * the ACTION_REQUIRED correction path, where there is no wizard to host it: the
 * shell renders the status screen ahead of every step once an application is
 * submitted, and its rail raises a toast rather than navigating, so `goToStep`
 * cannot reach step 1 again. The dialog is the only route in.
 *
 * **Which fields render, by mode.** The city picker and the request body are
 * identical in both; the Contact person group is the only one that differs:
 *
 * | Group          | `"draft"`                                      | `"correction"`                        |
 * | -------------- | ---------------------------------------------- | ------------------------------------- |
 * | Legal entity   | name, VAT id, address, cities (city read-only)  | same                                  |
 * | Contact person | full name, role                                | full name, role, **email**, **phone** |
 * | Payouts        | IBAN                                           | same (re-entry, §8)                   |
 *
 * The reason both extra fields are correction-only is the same. "Contact person
 * unreachable" is one of the four company flag reasons an admin can raise (see
 * `api/admin/business-applications/[id]/company/route.ts`), and it covers a
 * wrong name, role, email *or* number. The correction dialog mounts this form
 * alone — no wizard, no sub-screen behind it — so a field missing here is a
 * field the company cannot fix at all: it would resubmit identical details and
 * be flagged again. In `"draft"` neither belongs: step 1's first sub-screen
 * owns the email (asking twice is the duplicate that sub-screen exists to
 * remove), and the phone is never asked in the wizard at all — sign-up collects
 * it and this form carries it through unedited.
 *
 * Validation follows the fields: `contactEmail` is checked in both modes, since
 * in `"draft"` the value arrives from the sub-screen and an unusable one must
 * not reach the endpoint just because the field that produced it is on the
 * previous screen; `phone` is checked in `"correction"` only, so a number the
 * wizard never shows can never block its Continue. See `collectProblems`.
 */
export function CompanyDetailsForm({
  mode,
  initial,
  onBack,
  onSaved,
}: {
  mode: CompanyFormMode;
  /** Seed values. In correction mode these come from `submittedSummary`. */
  initial: CompanyDraft;
  /**
   * Returns to the email sub-screen. Omitted by task-15's dialog, which has no
   * sub-screen behind it and renders no Back button.
   */
  onBack?: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const {
    draft,
    updateDraft,
    showToast,
    refetch,
    submittedSummary,
    companyOnRecord,
  } = useFleetDraft();

  /**
   * The answers in correction mode, where `updateDraft` would be a silent
   * no-op. `bankAccountIban` is blanked on the way in whatever the caller
   * passed: the summary masks it to its last four characters, so posting it
   * back would overwrite a good IBAN with bullets. The ≥18-character rule then
   * forces a genuine re-entry.
   */
  const [localCompany, setLocalCompany] = useState<CompanyDraft>(() =>
    mode === "correction" ? { ...initial, bankAccountIban: "" } : initial,
  );

  /**
   * The draft's company section with the persisted row behind it, so a company
   * that has typed nothing yet still opens on its registered name, VAT id,
   * city and phone rather than on empty fields. Correction mode does not merge
   * — see `withRecordFallback`.
   */
  const draftCompany = useMemo<CompanyDraft>(
    () => withRecordFallback(draft.company ?? {}, companyOnRecord),
    [draft.company, companyOnRecord],
  );

  const company = mode === "draft" ? draftCompany : localCompany;

  const fieldId = useId();
  const cityListId = `${fieldId}-city-list`;

  /**
   * Fields that have been through a failed Continue. Not "has been edited" —
   * validation fires on Continue, never on blur.
   */
  const [touched, setTouched] = useState<Partial<Record<CompanyField, true>>>(
    {},
  );

  /** True while the POST is in flight, so Continue can't be double-fired. */
  const [submitting, setSubmitting] = useState(false);

  // The city box is a filter, never a display of the current answer — the chips
  // are the answer — so unlike the driver flow's single-select this starts
  // empty and is never seeded from the selection.
  const [cityQuery, setCityQuery] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  const [cityActiveIndex, setCityActiveIndex] = useState(0);

  const cityInputRef = useRef<HTMLInputElement>(null);
  const cityListRef = useRef<HTMLDivElement>(null);

  // Anything unrecognised is dropped rather than rendered: a draft written
  // before a value existed must not crash the step.
  const selectedCities = useMemo<CityOption[]>(() => {
    const values = company.citiesOfOperation ?? [];
    return values
      .map((value) =>
        GEORGIAN_CITY_OPTIONS.find((option) => option.value === value),
      )
      .filter((option): option is CityOption => option !== undefined);
  }, [company.citiesOfOperation]);

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

  const problems = collectProblems(company, mode);

  /** The message to show under `field`, or `undefined` while it stays quiet. */
  function errorFor(field: CompanyField): string | undefined {
    return touched[field] ? problems[field] : undefined;
  }

  function idFor(field: CompanyField): string {
    return `${fieldId}-${field}`;
  }

  /** The inline error element's id, for `aria-describedby`. */
  function describedBy(field: CompanyField): string | undefined {
    return errorFor(field) !== undefined ? `${idFor(field)}-error` : undefined;
  }

  /**
   * Writes one or more company fields back. The whole section is re-sent
   * because `updateDraft` merges at the *section* level — sending only the
   * changed key would drop every other answer.
   */
  function setCompany(patch: Partial<CompanyDraft>) {
    if (mode === "draft") {
      updateDraft({ company: { ...company, ...patch } });
      return;
    }
    setLocalCompany((current) => ({ ...current, ...patch }));
  }

  /**
   * Picking is a toggle and does not close the list — the whole point of a
   * multi-select, and the one behaviour that differs from the driver flow's
   * single-select. New cities are appended so the chips keep selection order.
   */
  function toggleCity(option: CityOption) {
    const current = company.citiesOfOperation ?? [];
    const next = current.includes(option.value)
      ? current.filter((value) => value !== option.value)
      : [...current, option.value];
    setCompany({ citiesOfOperation: next });
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
        // Only swallowed when it actually toggles something; otherwise Enter
        // stays available to submit the step. The list stays open and the query
        // untouched, so a second city is one more Enter away.
        event.preventDefault();
        toggleCity(option);
      }
      return;
    }

    if (event.key === "Escape" && cityOpen) {
      event.preventDefault();
      setCityOpen(false);
      return;
    }

    // Nothing else on a chip row is destructive, so this is the expected
    // affordance in a chip multi-select.
    if (event.key === "Backspace" && cityQuery === "") {
      const current = company.citiesOfOperation ?? [];
      if (current.length === 0) return;
      setCompany({ citiesOfOperation: current.slice(0, -1) });
    }
  }

  async function handleContinue() {
    const failing = Object.keys(problems) as CompanyField[];
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

    setSubmitting(true);
    try {
      const response = await fetch(COMPANY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: (company.companyName ?? "").trim(),
          vatId: (company.vatId ?? "").trim(),
          // One expression for two rather different values, which is the point
          // of reading `company` rather than a mode branch here.
          //
          // In the wizard both are carried through unchanged: set at sign-up,
          // never edited there, taken from the draft when it has them and from
          // the company's own row when it does not (`withRecordFallback`),
          // which is what lets the wizard stop asking for the phone without
          // ever posting an empty one. In a correction the phone is a field the
          // company may just have retyped, and this picks that edit up with no
          // special case because `company` is the local state that field
          // writes to.
          //
          // `city` is never editable in either mode and is never derived from
          // `citiesOfOperation` (§7). If either value is somehow absent the
          // endpoint 400s with its own message; a phone another company already
          // holds comes back as the 409 below. Both reach the company through
          // the same toast.
          phone: (company.phone ?? "").trim(),
          city: company.city,
          registeredAddress: (company.registeredAddress ?? "").trim(),
          citiesOfOperation: company.citiesOfOperation ?? [],
          contactName: (company.contactName ?? "").trim(),
          contactRole: (company.contactRole ?? "").trim(),
          contactEmail: (company.contactEmail ?? "").trim(),
          bankAccountIban: (company.bankAccountIban ?? "").trim(),
        }),
      });

      if (!response.ok) {
        // Shown as-is, so the 409 "This phone number is already registered to
        // another account." reaches the company rather than being swallowed.
        showToast(await readErrorMessage(response, SAVE_FALLBACK), "error");
        return; // Stay on the step; the details are not stored.
      }
    } catch {
      showToast(SAVE_FALLBACK, "error");
      return;
    } finally {
      setSubmitting(false);
    }

    // Saving is what clears a company-level flag: the route sets
    // `companyReviewStatus: "PENDING"` and `companyFlagReason: null` in the
    // same transaction, so the status screen has to re-read to see the
    // resubmit gate open.
    if (mode === "correction") {
      showToast(CORRECTION_SAVED_TOAST);
      await refetch();
    }

    onSaved();
  }

  const registeredCity = GEORGIAN_CITY_OPTIONS.find(
    (option) => option.value === company.city,
  );
  const cityPlaceholder =
    selectedCities.length > 0 ? CITY_PLACEHOLDER_MORE : CITY_PLACEHOLDER_EMPTY;
  const citiesError = errorFor("citiesOfOperation");

  return (
    <div className="flex max-w-[680px] flex-col gap-[22px]">
      <div className="flex flex-col gap-3.5">
        <p className={GROUP_HEADING_CLASS}>Legal entity</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
          <Field
            label="Company name"
            htmlFor={idFor("companyName")}
            error={errorFor("companyName")}
          >
            <Input
              id={idFor("companyName")}
              autoComplete="organization"
              placeholder="As registered"
              value={company.companyName ?? ""}
              aria-invalid={errorFor("companyName") !== undefined}
              aria-describedby={describedBy("companyName")}
              onChange={(event) =>
                setCompany({ companyName: event.target.value })
              }
              className={fieldClassName(errorFor("companyName") !== undefined)}
            />
          </Field>

          <Field
            label="VAT / tax ID"
            htmlFor={idFor("vatId")}
            error={errorFor("vatId")}
          >
            <Input
              id={idFor("vatId")}
              inputMode="numeric"
              placeholder="404123456"
              value={company.vatId ?? ""}
              aria-invalid={errorFor("vatId") !== undefined}
              aria-describedby={describedBy("vatId")}
              onChange={(event) => setCompany({ vatId: event.target.value })}
              // `font-price` is this codebase's IBM Plex Mono stack (see the
              // `--font-price` token) — the design's treatment for identifiers.
              className={`${fieldClassName(errorFor("vatId") !== undefined)} font-price tracking-[0.05em]`}
            />
          </Field>
        </div>

        <Field
          label="Registered address"
          htmlFor={idFor("registeredAddress")}
          error={errorFor("registeredAddress")}
        >
          <Input
            id={idFor("registeredAddress")}
            autoComplete="street-address"
            placeholder="Street, number, postcode"
            value={company.registeredAddress ?? ""}
            aria-invalid={errorFor("registeredAddress") !== undefined}
            aria-describedby={describedBy("registeredAddress")}
            onChange={(event) =>
              setCompany({ registeredAddress: event.target.value })
            }
            className={fieldClassName(
              errorFor("registeredAddress") !== undefined,
            )}
          />
        </Field>

        {/* Read-only, and not an `Input`: a disabled field invites a click and
            then does nothing. The value is posted back verbatim (§7) — a
            company may be registered in one city and operate out of others, so
            it is never derived from the selection below. */}
        <div className="flex flex-col gap-1.5">
          <p className={FIELD_LABEL_CLASS}>Registered city</p>
          <p className="text-[15px]">
            {registeredCity?.label ?? company.city ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            Set when the account was created. Contact operations to change it.
          </p>
        </div>

        <Field
          label="Cities of operation"
          htmlFor={idFor("citiesOfOperation")}
          error={citiesError}
          hint="Where the fleet picks up. Orders outside these cities are not offered to your drivers."
        >
          <div className="flex flex-col gap-2">
            {selectedCities.length > 0 ? (
              <div className="flex flex-wrap gap-[7px]">
                {selectedCities.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleCity(option)}
                    aria-label={`Remove ${option.label}`}
                    className="flex cursor-pointer items-center gap-2 rounded-[20px] border border-onboarding-accent bg-onboarding-accent/6 py-1.5 pr-2.5 pl-3 transition-colors hover:bg-onboarding-accent/12 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="text-[13px] font-semibold">
                      {option.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-sm leading-none text-onboarding-accent"
                    >
                      ×
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {/* Hand-built combobox, extending the driver wizard's single-select
                city picker: this codebase has no such primitive, and the design
                needs a filtered, region-annotated checkbox list. */}
            <Popover open={cityOpen} onOpenChange={setCityOpen}>
              <PopoverAnchor asChild>
                <Input
                  id={idFor("citiesOfOperation")}
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
                  placeholder={cityPlaceholder}
                  value={cityQuery}
                  aria-invalid={citiesError !== undefined}
                  aria-describedby={describedBy("citiesOfOperation")}
                  // Typing filters and nothing else: the query never clears the
                  // selection, because the chips are the answer.
                  onChange={(event) => {
                    setCityQuery(event.target.value);
                    setCityOpen(true);
                    setCityActiveIndex(0);
                  }}
                  onFocus={() => setCityOpen(true)}
                  // Both, deliberately: focusing opens the list, and clicking an
                  // already-focused box fires no focus event, so without this
                  // the list could not be reopened without leaving the field.
                  onClick={() => setCityOpen(true)}
                  onKeyDown={handleCityKeyDown}
                  className={fieldClassName(citiesError !== undefined)}
                />
              </PopoverAnchor>
              <PopoverContent
                align="start"
                sideOffset={6}
                // The list is an extension of the input, not a dialog: focus has
                // to stay in the box so typing keeps filtering, and has to stay
                // put when the list closes.
                onOpenAutoFocus={(event) => event.preventDefault()}
                onCloseAutoFocus={(event) => event.preventDefault()}
                // A click on the input itself is "outside" the portalled list,
                // and would otherwise close the list the click is meant to keep
                // open.
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
                <div
                  ref={cityListRef}
                  id={cityListId}
                  role="listbox"
                  aria-multiselectable="true"
                >
                  {cityMatches.length === 0 ? (
                    <p className="px-[13px] py-[11px] text-[13px] text-muted-foreground">
                      No city by that name. Check the spelling.
                    </p>
                  ) : (
                    cityMatches.map((option, index) => {
                      const active = index === activeIndex;
                      const selected = (
                        company.citiesOfOperation ?? []
                      ).includes(option.value);

                      return (
                        <button
                          key={option.value}
                          id={`${cityListId}-${index}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          data-active={active}
                          // `onMouseDown` rather than `onClick`: the input would
                          // otherwise lose focus first and close the list out
                          // from under the click.
                          onMouseDown={(event) => {
                            event.preventDefault();
                            toggleCity(option);
                          }}
                          onMouseEnter={() => setCityActiveIndex(index)}
                          className={`flex w-full items-center justify-between gap-2.5 border-b border-border px-[13px] py-2.5 text-left last:border-b-0 ${
                            selected
                              ? "bg-onboarding-accent/5"
                              : active
                                ? "bg-muted"
                                : "bg-transparent"
                          }`}
                        >
                          {/* The row's own `aria-selected` carries the state. */}
                          <span
                            aria-hidden="true"
                            className={`flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[10.5px] font-bold text-white ${
                              selected
                                ? "border-onboarding-accent bg-onboarding-accent"
                                : "border-input bg-card"
                            }`}
                          >
                            {selected ? <CheckIcon className="size-3" /> : null}
                          </span>
                          <span className="flex-1 text-sm font-medium">
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
          </div>
        </Field>
      </div>

      {/* The group the "Contact person unreachable" flag reason points at, and
          the one place the two modes' field sets differ — see this component's
          own doc comment for the table. A correction adds the email and the
          phone here because that flag covers every part of the contact and the
          dialog is the only screen the company gets; the wizard adds neither,
          since its first sub-screen owns the email and sign-up owns the
          number. */}
      <div className="flex flex-col gap-3.5 border-t border-border pt-5">
        <p className={GROUP_HEADING_CLASS}>Contact person</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
          <Field
            label="Full name"
            htmlFor={idFor("contactName")}
            error={errorFor("contactName")}
          >
            <Input
              id={idFor("contactName")}
              autoComplete="name"
              placeholder="Who we speak to"
              value={company.contactName ?? ""}
              aria-invalid={errorFor("contactName") !== undefined}
              aria-describedby={describedBy("contactName")}
              onChange={(event) =>
                setCompany({ contactName: event.target.value })
              }
              className={fieldClassName(errorFor("contactName") !== undefined)}
            />
          </Field>

          <Field
            label="Role"
            htmlFor={idFor("contactRole")}
            error={errorFor("contactRole")}
          >
            <Input
              id={idFor("contactRole")}
              autoComplete="organization-title"
              placeholder="Fleet manager"
              value={company.contactRole ?? ""}
              aria-invalid={errorFor("contactRole") !== undefined}
              aria-describedby={describedBy("contactRole")}
              onChange={(event) =>
                setCompany({ contactRole: event.target.value })
              }
              className={fieldClassName(errorFor("contactRole") !== undefined)}
            />
          </Field>
        </div>

        {/* Both seeded from `submittedSummary` like the rest of this mode's
            values — what the reviewer actually read — never from
            `companyOnRecord`. */}
        {mode === "correction" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]">
            <Field
              label="Company email"
              htmlFor={idFor("contactEmail")}
              error={errorFor("contactEmail")}
            >
              <Input
                id={idFor("contactEmail")}
                type="email"
                autoComplete="email"
                placeholder="dispatch@company.ge"
                value={company.contactEmail ?? ""}
                aria-invalid={errorFor("contactEmail") !== undefined}
                aria-describedby={describedBy("contactEmail")}
                onChange={(event) =>
                  setCompany({ contactEmail: event.target.value })
                }
                className={fieldClassName(
                  errorFor("contactEmail") !== undefined,
                )}
              />
            </Field>

            <Field
              label="Company phone"
              htmlFor={idFor("phone")}
              error={errorFor("phone")}
            >
              <Input
                id={idFor("phone")}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+995 322 555 010"
                value={company.phone ?? ""}
                aria-invalid={errorFor("phone") !== undefined}
                aria-describedby={describedBy("phone")}
                onChange={(event) => setCompany({ phone: event.target.value })}
                className={fieldClassName(errorFor("phone") !== undefined)}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3.5 border-t border-border pt-5">
        <p className={GROUP_HEADING_CLASS}>Payouts</p>

        <Field
          label="Bank account (IBAN)"
          htmlFor={idFor("bankAccountIban")}
          error={errorFor("bankAccountIban")}
          hint={
            mode === "correction"
              ? `${PAYOUT_HINT} ${PAYOUT_REENTRY_HINT}`
              : PAYOUT_HINT
          }
        >
          <Input
            id={idFor("bankAccountIban")}
            // In correction mode the masked value stands in as the placeholder:
            // it tells the company which account is on file without pretending
            // the bullets are a value it could submit.
            placeholder={
              mode === "correction" && submittedSummary?.bankAccountIban
                ? submittedSummary.bankAccountIban
                : IBAN_PLACEHOLDER
            }
            value={company.bankAccountIban ?? ""}
            aria-invalid={errorFor("bankAccountIban") !== undefined}
            aria-describedby={describedBy("bankAccountIban")}
            onChange={(event) =>
              setCompany({ bankAccountIban: event.target.value })
            }
            className={`${fieldClassName(errorFor("bankAccountIban") !== undefined)} font-price tracking-[0.06em]`}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3.5 border-t border-border pt-[22px]">
        {onBack ? (
          <button
            type="button"
            onClick={() => {
              setTouched({});
              onBack();
            }}
            className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-[22px] text-[15px] font-semibold hover:bg-muted"
          >
            Back
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void handleContinue()}
          disabled={submitting}
          className={PRIMARY_CTA_CLASS}
        >
          {submitting ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/**
 * The design's input treatment: 46px tall, 10px radius, card background, and an
 * orange focus ring. The focus colours are dropped while the field is invalid so
 * they cannot compete with the primitive's own `aria-invalid` red border, which
 * carries the same specificity — no red border class is ever written by hand.
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
 * order. Local to this step rather than shared: the other fleet steps' controls
 * are tables and steppers, which stack nothing like this.
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
      <Label htmlFor={htmlFor} className={FIELD_LABEL_CLASS}>
        {label}
      </Label>
      {children}
      {error !== undefined ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
      {hint !== undefined ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
