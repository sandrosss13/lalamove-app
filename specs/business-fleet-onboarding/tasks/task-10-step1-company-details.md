# Task 10: Step 1 — Company Details

## Status

pending

## Wave

4

## Description

Fills in `src/components/fleet-onboarding/steps/step-1-company-details.tsx`, the wizard's first step: the company's phone number on its own sub-screen, then the company's legal, contact and payout details in three titled groups. Everything the reviewer later verifies about the company as an entity is collected here — registered name, VAT/tax id, registered address, the cities the fleet operates out of, a named contact with a role and an email, and the IBAN order revenue settles to.

The one genuinely interesting control is **cities of operation**: a multi-select built on the hand-rolled combobox pattern from `src/components/driver-onboarding/steps/step-1-auth-personal.tsx`, with the chosen cities rendered as removable orange chips above the field and a checkbox list below it. Read that file's city picker end to end before starting — its keyboard handling, its `onMouseDown`/`preventDefault` focus trick and its `onInteractOutside` guard are all reused here, and the differences (multi-select, chips, a checkbox column, the list not closing on pick) are the whole of this control's design.

## Dependencies

**Depends on:** task-09-fleet-wizard-shell.md, task-06-company-details-api.md
**Blocks:** task-15-application-status-screen.md

**Context from dependencies:**

**From `task-09`** — `src/components/fleet-onboarding/fleet-draft-context.tsx` exports:

```ts
export const FLEET_SCREENS = {
  company: 1, fleet: 2, vehicles: 3, drivers: 4, review: 5,
} as const;

export function useFleetDraft(): FleetDraftState;   // throws outside the provider
```

The parts of `FleetDraftState` this step uses — field-for-field as `task-09` declares them, which is the one definition of the surface:

```ts
{
  draft: FleetDraftV1;
  updateDraft: (patch: Partial<FleetDraftV1>) => void;   // section-level merge, debounced 300 ms
  goToStep: (step: number) => void;                      // saves immediately
  showToast: (message: string, tone?: "default" | "error") => void;
  /** Needed only for the ACTION_REQUIRED re-entry in §8. */
  status: "DRAFT" | "PENDING" | "ACTION_REQUIRED" | "APPROVED" | null;
  submittedSummary: FleetSubmittedSummary | null;
  refetch: () => Promise<void>;
}
```

`updateDraft` merges at the **section** level: `updateDraft({ company: {...} })` replaces the whole `company` object, so this step must always spread its current section and re-send it in full. Sending only the changed key would drop every other answer.

The `company` section of the draft — `FleetDraftCompany` in `src/lib/fleet-onboarding/draft-schema.ts`, from `task-05`:

```ts
export type FleetDraftCompany = {
  phone?: string;
  companyName?: string;
  vatId?: string;
  registeredAddress?: string;
  city?: string;                    // the registered city, set at sign-up
  citiesOfOperation?: string[];     // GeorgianCity enum values, in selection order
  contactName?: string;
  contactRole?: string;
  contactEmail?: string;
  bankAccountIban?: string;
};
```

**These are the field names, everywhere.** `registeredAddress`, `citiesOfOperation` and `bankAccountIban` — never `address`, `cities` or `iban`. They are the draft keys, the `LogisticsCompany` column names and the request-body keys all at once, which is exactly the point: this step reads a value out of the draft under one name and posts it under the same name, with no translation layer to get wrong.

`draft.company.city` is the **registered/primary** city — a single `GeorgianCity` value, distinct from the `citiesOfOperation` array. See §7: this step does not collect it.

The shell renders this component inside `<div key={draftStep} className="animate-onboarding-fade-up mt-7">`, under a header it owns: kicker `"Step 1 of 5 · Company & authorisation"`, title `"Company details"`. There is **one** header for both sub-screens — the shell has no way to know which sub-screen this component is showing, and that is documented at the top of `fleet-wizard-shell.tsx`. The phone sub-screen therefore leads with the design's intro sentence and carries its own uppercase "Company phone" field label directly beneath the shared header, which reads correctly without a second heading. Do not try to push a title back up into the shell.

The shell renders this step in a `max-w-[680px]` column. The Back button, progress bar and save indicator are the shell's; this step renders only its own fields and its own Continue button.

**From `task-06`** — the company details endpoint. It is the project's **existing** company route, extended:

```
POST /api/logistics-company
```

There is no `PUT /api/logistics-company/onboarding/company` and no
`src/app/api/logistics-company/onboarding/company/route.ts`. Nothing in this feature creates that
file, so a call to it would 404. `task-06` extends
`src/app/api/logistics-company/route.ts` — the same route `task-08`'s sign-up already POSTs its
four fields to — and it is an **upsert keyed on `userId`**, which is what makes this step
re-submittable: a company that walks back into step 1 and edits its details re-POSTs the whole
object and updates the same row.

Body:

```ts
{
  companyName: string;
  vatId: string;
  phone: string;
  city: string;                    // GeorgianCity value — the registered city, see §7
  registeredAddress: string;
  citiesOfOperation: string[];     // GeorgianCity values, at least one
  contactName: string;
  contactRole: string;
  contactEmail: string;
  bankAccountIban: string;
}
```

The four original fields (`companyName`, `vatId`, `phone`, `city`) are required on every call. The
six new ones are validated whenever they are sent, and this step always sends all ten — a
half-filled company is what the draft is for, and the POST is only fired once the whole form
validates.

Responses: **201** with the created-or-updated `LogisticsCompany` row as its body — not a 204, and
not an empty body. This step ignores the body and branches only on `response.ok`. **400**
`{ error: string }` for a malformed body or a failed server-side re-validation (`task-06` re-checks
every rule in §2 with developer-facing copy). **401** `{ error: "Unauthorized." }` with no session.
**403** `{ error: "Only logistics companies can create a company profile." }` for a non-COMPANY
session. **409** `{ error: "This phone number is already registered to another account." }` —
`LogisticsCompany.phone` is `@unique`, so this is a real, reachable failure the UI must surface
rather than swallow.

The endpoint writes all ten values onto the caller's own `LogisticsCompany` row, normalising as it
goes: `contactEmail` lowercased, `bankAccountIban` whitespace-stripped and uppercased,
`citiesOfOperation` de-duplicated in the order sent, `phone` stored exactly as typed after
trimming. This step does **not** replicate any of that normalisation — it sends the trimmed values
and lets the server canonicalise.

This route is also the **only** thing that clears a company-level review flag: when the caller's
`BusinessApplication` is `ACTION_REQUIRED` with a non-null `companyFlagReason`, the same
transaction sets `companyReviewStatus: "PENDING"` and `companyFlagReason: null`. That is what makes
§7 work, and it is why the correction loop for a flagged company block comes back through this
step rather than through the draft.

## Files to Modify

- `src/components/fleet-onboarding/steps/step-1-company-details.tsx` — replace `task-09`'s stub with the real step.

## Technical Details

### 1. Component shape and state

`"use client"`. Two exports: `Step1CompanyDetails` (zero props — what the shell's `renderScreen` mounts) and `CompanyDetailsForm` (the form body, which task-15 mounts in a dialog for the ACTION_REQUIRED correction path). See §8 for the split; `Step1CompanyDetails` is a thin wrapper that renders the phone sub-screen and then `<CompanyDetailsForm mode="draft" ... />`.

Four pieces of local state, plus the draft:

```tsx
const { draft, updateDraft, goToStep, showToast } = useFleetDraft();

const company = useMemo<CompanyDraft>(() => draft.company ?? {}, [draft.company]);

/** Which of the design's two sub-screens is showing. Local, not persisted:
 *  `draftStep` is an integer 1–5 (see `fleet-wizard-shell.tsx`), so this is
 *  session-local by design. Seeded to "details" when the saved phone already
 *  passes validation, so a company resuming step 1 is not made to re-confirm
 *  a number it already gave us. */
const [phase, setPhase] = useState<"phone" | "details">(() =>
  phoneProblem(draft.company?.phone) === undefined ? "details" : "phone",
);

/** Fields that have been through a failed Continue. Not "has been edited" —
 *  validation fires on Continue, never on blur. */
const [touched, setTouched] = useState<Partial<Record<CompanyField, true>>>({});

/** True while the POST is in flight, so Continue can't be double-fired. */
const [submitting, setSubmitting] = useState(false);
```

`CompanyField` is the union of every field that can carry an inline error:

```ts
type CompanyField =
  | "phone" | "companyName" | "vatId" | "registeredAddress" | "citiesOfOperation"
  | "contactName" | "contactRole" | "contactEmail" | "bankAccountIban";
```

`CompanyDraft` is `FleetDraftCompany` from `draft-schema.ts` — import the type, do not restate it
locally. `city` is deliberately absent from `CompanyField`: it is not editable here and so can
never carry an inline error (§7).

Writing back always re-sends the whole section:

```tsx
function setCompany(patch: Partial<CompanyDraft>) {
  updateDraft({ company: { ...company, ...patch } });
}
```

Use `useId()` for the field id prefix; every input gets `id`, its `Label` gets `htmlFor`, `aria-invalid` is set from the error, and the error `<p>` is wired through `aria-describedby`.

### 2. Validation

One pure function computed on every render, returning `Partial<Record<CompanyField, string>>`. Messages are the design's, verbatim — do not reword them.

```ts
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
const MIN_COMPANY_NAME_LENGTH = 3;
const VAT_ID_PATTERN = /^\d{9}$/;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
const MIN_IBAN_LENGTH = 18;   // after stripping spaces
```

**Phone** — its own function, because the sub-screen gate reuses it:

```ts
function phoneProblem(value: string | undefined): string | undefined {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "Enter the company phone number.";
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return "That is not a valid number (10–15 digits).";
  }
  return undefined;
}
```

**The details fields:**

| Field | Rule | Message |
|---|---|---|
| `companyName` | empty | `Enter the registered company name.` |
| `companyName` | trimmed length < 3 | `That looks too short.` |
| `vatId` | empty | `Enter the VAT or tax ID.` |
| `vatId` | not exactly 9 digits, digits only | `A Georgian tax ID is 9 digits.` |
| `registeredAddress` | empty | `Enter the registered address.` |
| `citiesOfOperation` | none selected | `Select at least one city of operation.` |
| `contactName` | empty | `Enter the contact person.` |
| `contactName` | fewer than two whitespace-separated words | `First and last name.` |
| `contactRole` | empty | `Required.` |
| `contactEmail` | empty | `Enter a company email.` |
| `contactEmail` | fails `EMAIL_PATTERN` | `That does not look like an email address.` |
| `bankAccountIban` | empty | `Enter the payout account.` |
| `bankAccountIban` | fewer than 18 chars after stripping all whitespace | `A Georgian IBAN is 22 characters.` |

The IBAN rule deliberately checks ≥18 while the message names 22: 22 is the Georgian IBAN length and is what the company should be typing, but the stored bound is the looser one so a correctly-formed IBAN from another country is not rejected outright. Keep both exactly as written — this is the design's own copy and `requirements.md`'s own bound.

`errorFor(field)` returns `touched[field] ? problems[field] : undefined`, so nothing is red before the first Continue, every failing field lights up on the same click, and a field goes quiet the moment it is corrected without needing a second Continue.

### 3. The phone sub-screen

Panel: `flex max-w-[520px] flex-col gap-[18px]`.

- Intro, `text-[13.5px] leading-[1.5] text-muted-foreground`:
  > The company's main line. It becomes the account login and the number dispatch calls when an order needs a decision.
- Label: **Company phone**.
- `<Input type="tel" inputMode="tel" autoComplete="tel" placeholder="+995 322 555 010" />`. This one field is 48px tall and 16px, not the shared 46/15 — the design gives the sole field on its own screen more presence: `h-12 rounded-[10px] bg-card px-[13px] text-base md:text-base`, plus the shared orange focus treatment when valid.
- Continue: on a phone problem, mark `phone` touched, `showToast("Fix the highlighted fields to continue.", "error")` and stay put; otherwise `setPhase("details")` and clear `touched`. It does **not** call `goToStep` — this is a sub-screen of step 1, not a new step. The typed value is already persisted by the debounced `updateDraft` on each keystroke.
- Back from the details sub-screen returns here (see §6), so the shell's own Back button and this sub-phase must not fight: the shell's Back walks screens, this step's Back walks sub-screens, and they are two separate controls in two separate places.

**The SMS OTP screen from the prototype is deliberately not built.** The design's six-box code screen with its 30-second resend lock and its hardcoded `482913` is already bypassed in the prototype itself, and `requirements.md` drops it as an explicit non-goal: this codebase has no SMS infrastructure, and a fake code that verifies nothing is worse than no screen. The phone is a plain, unverified `tel` field, and the intro copy above is the design's own with nothing added about a code. Do not stub the screen, do not leave a commented-out block, and do not add an "unverified" badge next to the number.

### 4. The details sub-screen — three titled groups

Panel: `flex max-w-[680px] flex-col gap-[22px]`. Each group is `flex flex-col gap-3.5`; the second and third additionally carry `border-t border-border pt-5`. Group headings are the design's mono kicker, distinct from the field labels:

```
className="font-price text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
```

**Group 1 — `Legal entity`**

- A two-column grid, `grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]`:
  - **Company name** — `placeholder="As registered"`, `autoComplete="organization"`.
  - **VAT / tax ID** — `placeholder="404123456"`, `inputMode="numeric"`, and the design's mono treatment appended to the shared field class: `font-price tracking-[0.05em]`.
- **Registered address** — full width, `placeholder="Street, number, postcode"`, `autoComplete="street-address"`. Writes `registeredAddress`.
- **Registered city** — the read-only row described in §7. Not an input, not validated.
- **Cities of operation** — the multi-select in §5. Writes `citiesOfOperation`. Helper beneath it, `text-xs text-muted-foreground`:
  > Where the fleet picks up. Orders outside these cities are not offered to your drivers.

**Group 2 — `Contact person`**

- `grid grid-cols-1 gap-3 sm:grid-cols-[1.3fr_1fr]`:
  - **Full name** — `placeholder="Who we speak to"`, `autoComplete="name"`.
  - **Role** — `placeholder="Fleet manager"`, `autoComplete="organization-title"`.
- **Company email** — full width, `type="email"`, `placeholder="dispatch@company.ge"`, `autoComplete="email"`.

**Group 3 — `Payouts`**

- **Bank account (IBAN)** — writes `bankAccountIban`. `placeholder="GE29 NB00 0000 0101 9049 17"`, mono: `font-price tracking-[0.06em]`. Helper beneath:
  > Order revenue is settled to this account weekly. It must belong to the registered entity.

Field labels are the shared uppercase style — `font-price text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase` — and the inputs are the shared chrome:

```ts
function fieldClassName(invalid: boolean): string {
  return `h-[46px] rounded-[10px] bg-card px-[13px] text-[15px] md:text-[15px] ${
    invalid ? "" : "focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15"
  }`;
}
```

The orange focus colours are dropped while a field is invalid so they cannot compete with the primitive's own `aria-invalid` red border, which carries the same specificity. **Never write a red border class on `Input`** — set `aria-invalid` and let `src/components/ui/input.tsx`'s own `aria-invalid:` variants do it.

Build a local `Field` helper (label → control → error → hint) exactly like the one at the bottom of `step-1-auth-personal.tsx`. Keep it local to this file rather than shared: the other fleet steps' controls are tables and steppers that stack nothing like this.

### 5. Cities of operation — the multi-select

Reuse `GEORGIAN_CITY_OPTIONS` from `@/lib/georgian-cities`. **Do not introduce a new city list.** The design names 36 cities; all 36 already exist in that 63-entry constant, each with the `region` label this control renders ("Batumi · Adjara" is `label` + `region`). The design's "Tsqaltubo" is the constant's `TSKALTUBO` / "Tskaltubo".

```ts
type CityOption = (typeof GEORGIAN_CITY_OPTIONS)[number];

const CITY_LIST_MAX_HEIGHT_CLASS = "max-h-[236px]";   // the design's own max-height
```

**Local state:** `cityQuery: string` (starts `""`, not seeded from the selection — unlike the driver flow's single-select, the input here is a filter box, never a display of the current answer), `cityOpen: boolean`, `cityActiveIndex: number`. Refs: `cityInputRef`, `cityListRef`.

**Selected chips render ABOVE the field**, in selection order, only when at least one city is chosen:

```tsx
<div className="flex flex-wrap gap-[7px]">
  {selectedCities.map((option) => (
    <button
      key={option.value}
      type="button"
      onClick={() => toggleCity(option)}
      aria-label={`Remove ${option.label}`}
      className="flex cursor-pointer items-center gap-2 rounded-[20px] border border-onboarding-accent bg-onboarding-accent/6 py-1.5 pr-2.5 pl-3 transition-colors hover:bg-onboarding-accent/12 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="text-[13px] font-semibold">{option.label}</span>
      <span aria-hidden="true" className="text-sm leading-none text-onboarding-accent">×</span>
    </button>
  ))}
</div>
```

`selectedCities` maps `company.citiesOfOperation ?? []` through `GEORGIAN_CITY_OPTIONS`, dropping anything unrecognised — a draft written before a value existed must not crash the step.

**The input.** `placeholder` is `"Start typing — Tbilisi, Batumi, Kutaisi…"` while nothing is chosen and becomes `"Add another city…"` once at least one city is. `role="combobox"`, `autoComplete="off"`, `aria-expanded`, `aria-controls` when open, `aria-autocomplete="list"`, `aria-activedescendant` pointing at the active row's id. `onFocus` and `onClick` both open the list — clicking an already-focused box fires no focus event, so without both the list could not be reopened without leaving the field.

**The dropdown** is a `Popover` + `PopoverAnchor` around the `Input`, with `PopoverContent` carrying `align="start" sideOffset={6}`, `onOpenAutoFocus`/`onCloseAutoFocus` both `preventDefault`ed (the list is an extension of the input; focus must stay in the box so typing keeps filtering), and the same `onInteractOutside` guard the driver picker uses — a click on the input itself is "outside" the portalled list and would otherwise close the list the click is meant to keep open. Content class:

```
`w-(--radix-popover-trigger-width) gap-0 overflow-y-auto p-0 ${CITY_LIST_MAX_HEIGHT_CLASS}`
```

Inside, `<div ref={cityListRef} id={cityListId} role="listbox" aria-multiselectable="true">`. Each row is a full-width `<button type="button" role="option" aria-selected={selected} data-active={active}>`:

```
className={`flex w-full items-center justify-between gap-2.5 border-b border-border px-[13px] py-2.5 text-left last:border-b-0 ${
  selected ? "bg-onboarding-accent/5" : active ? "bg-muted" : "bg-transparent"
}`}
```

Row contents, left to right:

- A 17px checkbox square, `aria-hidden="true"` (the row's own `aria-selected` carries the state):
  ```
  className={`flex size-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[10.5px] font-bold text-white ${
    selected ? "border-onboarding-accent bg-onboarding-accent" : "border-input bg-card"
  }`}
  ```
  containing a `CheckIcon` from `lucide-react` at `size-3` when selected, nothing when not.
- The city name, `text-sm font-medium`.
- The region, pushed right, `text-[11.5px] text-muted-foreground`.

Filtering is `option.label.toLowerCase().includes(cityQuery.trim().toLowerCase())`, with an empty query showing the whole list. Do not slice the list the way the prototype does — the 236px window already scrolls, and a slice would hide valid cities that sort late.

Empty state, when the query matches nothing:

```tsx
<p className="px-[13px] py-[11px] text-[13px] text-muted-foreground">
  No city by that name. Check the spelling.
</p>
```

**Picking is a toggle and does not close the list** — that is the whole point of a multi-select, and it is the one behaviour that differs from the driver flow's single-select:

```tsx
function toggleCity(option: CityOption) {
  const current = company.citiesOfOperation ?? [];
  const next = current.includes(option.value)
    ? current.filter((value) => value !== option.value)
    : [...current, option.value];       // append, preserving selection order
  setCompany({ citiesOfOperation: next });
}
```

Rows use `onMouseDown` with `event.preventDefault()` rather than `onClick`: the input would otherwise lose focus first and close the list out from under the click. `onMouseEnter` sets `cityActiveIndex`.

**Full keyboard support** on the input's `onKeyDown`:

- **ArrowDown / ArrowUp** — `preventDefault`. If the list is closed, open it and stop. Otherwise move `activeIndex` by ±1, wrapping modulo the filtered length so holding either arrow reaches every row.
- **Enter** — when the list is open and there is an active row, `preventDefault` and toggle it, leaving the list open and the query untouched. When nothing is active, let Enter fall through so it stays available to submit the step.
- **Escape** — when open, `preventDefault` and close.
- **Backspace** — when the query is empty and at least one city is chosen, remove the last chip. Nothing else on the row is destructive, so this is the expected affordance in a chip multi-select.

`activeIndex` is clamped, not reset, when the filtered list shrinks under the cursor: `Math.min(cityActiveIndex, Math.max(matches.length - 1, 0))`. Keep the keyboard cursor inside the 236px window with an effect that runs on `[cityOpen, activeIndex, matches.length]` and calls `cityListRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" })` — query by attribute rather than holding a ref array, which would have to be rebuilt on every keystroke as the filtered list changes length.

Typing in the box **must not** clear the selection. Unlike the driver flow's single-select — where a query that no longer names the stored city has to clear it — the query here is only a filter and the chips are the answer.

### 6. Continue, Back and the API call

The details sub-screen's footer is `mt-4 flex items-center gap-3.5 border-t border-border pt-[22px]`, holding a Back button and the primary CTA.

**Back** (secondary, `h-12 rounded-[11px] border border-border bg-card px-[22px] text-[15px] font-semibold hover:bg-muted`) sets `phase` back to `"phone"` and clears `touched`.

**Continue** is the shared primary CTA:

```
className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
```

disabled while `submitting`, labelled `"Saving…"` in that state.

```tsx
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
    showToast("Fix the highlighted fields to continue.", "error");
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
        phone: (company.phone ?? "").trim(),
        // Carried through from the draft unchanged — set at sign-up, never
        // edited here, and required by the endpoint on every call. See §7.
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
      showToast(await readErrorMessage(response, SAVE_FALLBACK), "error");
      return;   // stay on the step; the details are not stored
    }
  } catch {
    showToast(SAVE_FALLBACK, "error");
    return;
  } finally {
    setSubmitting(false);
  }

  goToStep(FLEET_SCREENS.fleet);
}
```

with

```ts
const COMPANY_ENDPOINT = "/api/logistics-company";
const SAVE_FALLBACK =
  "We couldn't save the company details. Check your connection and try again.";
```

`readErrorMessage` is the shared idiom — `await response.json().catch(() => null)` then `payload?.error ?? fallback` — so a non-JSON error page cannot throw over the real failure. Define it locally in this file; it is four lines and the context's copy is not exported.

Two things this must get right:

- **The 409 message is shown as-is.** "This phone number is already registered to another account." is a real, actionable failure and the toast is the only place the company will see it. Never `alert()`.
- **Navigation only happens on `response.ok`** — a 201. A failed POST leaves the company on step 1 with its answers still in the draft (the debounced PATCH has them), so retrying costs one click.

The draft keeps being written on every keystroke regardless — that is what makes the step resumable, and it is deliberately indifferent to whether what was typed is valid yet. A half-typed company name is still worth saving. The POST is what makes the details authoritative on the `LogisticsCompany` row, and the draft is only ever a staging area for it.

### 7. `city` — the registered city this form does not collect

`POST /api/logistics-company` requires `city` on **every** call and rejects a missing or invalid
value with `city must be one of: …`. This form has no city field for it: the design's Legal entity
group collects the registered address and the *cities of operation*, and adding a tenth editable
field would be inventing UI the design does not have.

**The resolution: step 1 displays the registered city read-only, and posts it back unchanged.**

- `draft.company.city` is seeded by `task-05`'s lazy `GET` from the existing
  `LogisticsCompany.city` column, which `task-08`'s four-field sign-up wrote. That column is
  non-nullable, and `task-09`'s page guard redirects any COMPANY user without a `LogisticsCompany`
  row, so by the time this component renders the value is present.
- Render it in Group 1, immediately beneath **Registered address**, as a read-only row rather than
  an `Input`: the shared uppercase label **Registered city**, the city's `label` from
  `GEORGIAN_CITY_OPTIONS` at `text-[15px]`, and a hint beneath at `text-xs text-muted-foreground`:
  > Set when the account was created. Contact operations to change it.

  No `Input`, no `disabled` field — a disabled input invites a click and then does nothing. It is
  not in `CompanyField`, it is never validated client-side, and it can never light up red.
- The POST sends `city: company.city` verbatim. It is **not** derived from `citiesOfOperation`,
  not defaulted to the first selected city, and not folded into that array — a company may be
  registered in one city and operate out of another, and `task-06` keeps the two columns separate
  for exactly that reason.
- If `company.city` is somehow absent (a draft written before this field existed), do **not**
  substitute a value. The POST will 400 with `task-06`'s own `city must be one of: …` message,
  which `readErrorMessage` surfaces in the error toast. A visible failure that operations can act
  on beats a silently wrong registered city on a legal entity.

### 8. Re-entry from a company-level flag (`ACTION_REQUIRED`)

An admin who flags the company block sends the application to `ACTION_REQUIRED` with a
`companyFlagReason`. `task-15`'s status screen renders that banner and a "Fix company details"
button which opens a **dialog** mounting this form. This section is what makes that mount work;
when it is shown is `task-15`'s call, not this task's.

**This is why the form must be exported separately from the step.** Split the details sub-screen's
form body into a named export:

```tsx
export function CompanyDetailsForm(props: {
  mode: "draft" | "correction";
  /** Seed values. In correction mode these come from `submittedSummary`. */
  initial: CompanyDraft;
  onSaved: () => void;
}): React.ReactElement;
```

`Step1CompanyDetails` (the default step export the shell's `renderScreen` mounts) wraps it with
`mode="draft"`; `task-15`'s dialog mounts it with `mode="correction"`. Do **not** expect the shell
to render this step in `ACTION_REQUIRED`: `task-09`'s render order puts
`FleetApplicationStatusScreen` ahead of every wizard step for all non-`DRAFT` statuses, and its
rail raises a toast rather than navigating, so `goToStep` cannot reach this component once the
application is submitted. The dialog is the only route in, and that asymmetry is deliberate — a
submitted application has no editable *step*, only correctable *items*.

Three things are different in that state, and nothing else is:

1. **The draft is null, so the draft is not the source.** `GET` returns `draft` only while
   `status === "DRAFT"`, so the context holds the empty `{ version: 1 }` fallback and
   `draft.company` is `undefined`. Seed the form from `submittedSummary` instead — it carries
   `companyName`, `vatId`, `registeredAddress`, `city`, `citiesOfOperation`, `contactName`,
   `contactRole`, `contactEmail` and `phone`, built from the normalised `LogisticsCompany`
   columns, which is precisely what the reviewer looked at.
2. **Edits go to local state, not `updateDraft`.** The context's `persist` bails whenever
   `statusRef.current !== "DRAFT"`, so a `updateDraft` call here is a silent no-op and the form
   would appear to forget every keystroke. Derive one `mode` from `status`
   (`status === "DRAFT" ? "draft" : "correction"`) and have `setCompany` write to a local
   `useState<CompanyDraft>` in correction mode and call `updateDraft` in draft mode. Everything
   downstream — validation, the three groups, the city picker, the POST body — reads the same
   `company` object and is identical in both modes.
3. **`bankAccountIban` cannot be seeded.** `submittedSummary.bankAccountIban` is masked to its
   last four characters (`"•••• •••• •••• 4821"`), so posting it back would overwrite a good IBAN
   with asterisks. Seed that one field **empty**, put the masked value in its `placeholder`, and
   let the existing ≥18-character rule force a re-entry. Say so in the field's hint:
   > Re-enter the full account number to confirm it.

The phone sub-screen is skipped: `submittedSummary.phone` already passes `phoneProblem`, so the
existing seeding rule opens straight on the details sub-screen with no special case.

Continue is unchanged — the same validation, the same `POST /api/logistics-company` with the same
ten fields. Saving is what clears the flag: `task-06`'s route sets `companyReviewStatus: "PENDING"`
and `companyFlagReason: null` in the same transaction when the caller's application is
`ACTION_REQUIRED` with a flag set. Nothing else in this feature clears it, so a correction that
never reaches this route leaves the application stuck. On success, in correction mode, do **not**
call `goToStep` — a submitted application has no next step. Raise
`showToast("Company details updated.")` and `await refetch()` so the status screen re-reads the
now-cleared flag and the resubmit gate opens.

## Acceptance Criteria

- [ ] The step opens on the phone sub-screen with the design's intro copy, and opens directly on the details sub-screen when the draft already holds a valid phone number.
- [ ] The phone field rejects an empty value with "Enter the company phone number." and a value outside 10–15 digits with "That is not a valid number (10–15 digits)."; neither message appears before the first Continue.
- [ ] No SMS code screen exists anywhere in the flow, and no code is sent or checked.
- [ ] The details sub-screen renders three titled groups — Legal entity, Contact person, Payouts — in that order, with the exact field labels, placeholders and helper strings above.
- [ ] Every validation message matches the table in §2 verbatim; a failed Continue lights up all failing fields at once and raises "Fix the highlighted fields to continue."
- [ ] A VAT id with letters, or with any length other than 9, fails with "A Georgian tax ID is 9 digits."
- [ ] Selected cities render as removable orange chips above the field, in selection order, and clicking a chip (or Backspace on an empty query) removes it.
- [ ] The dropdown is a checkbox list showing city and region, caps at 236px with its own scroll, and does **not** close when a city is picked.
- [ ] The input placeholder is "Start typing — Tbilisi, Batumi, Kutaisi…" with nothing chosen and "Add another city…" once at least one city is.
- [ ] Arrow keys move the highlight with wrapping and keep it scrolled into view, Enter toggles the highlighted city without closing the list, Escape closes it, and focus never leaves the input.
- [ ] The step imports `GEORGIAN_CITY_OPTIONS` and defines no city list of its own.
- [ ] No `Input` carries a hand-written red border class; invalid inputs set `aria-invalid` only.
- [ ] Continue calls `POST /api/logistics-company` with all ten fields — including `city` — and only advances to step 2 on a 201; a 409 duplicate-phone response surfaces "This phone number is already registered to another account." in an error toast and leaves the company on the step. No request is ever made to `/api/logistics-company/onboarding/company`.
- [ ] The draft is read and written under `registeredAddress`, `citiesOfOperation` and `bankAccountIban`; the strings `address`, `cities` and `iban` appear nowhere as draft keys or body keys.
- [ ] The registered city renders read-only beneath Registered address with its hint, is never editable or validated, and is posted back unchanged from `draft.company.city`.
- [ ] Mounted with `status === "ACTION_REQUIRED"`, the step seeds every field from `submittedSummary` (with `bankAccountIban` empty and the masked value as its placeholder), keeps edits in local state rather than calling `updateDraft`, opens on the details sub-screen, and on a successful POST raises a toast and refetches instead of navigating to step 2.
- [ ] Every answer survives a full page reload mid-step.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not edit any file other than `steps/step-1-company-details.tsx`. The other wave-4 steps are being built in parallel against the same shell.
- Do not add a new city constant, a new `Field` abstraction in a shared file, or a new toast — all three already exist.
- `--primary` is near-black. Every orange here is `bg-onboarding-accent`, `border-onboarding-accent`, `text-onboarding-accent`, `bg-onboarding-accent/5`, `bg-onboarding-accent/6`, `hover:bg-onboarding-accent-hover`.
- Seeding the sub-screen to `"details"` when the phone is already valid is a deliberate, small departure from the prototype, which always opens on the phone screen. It is called out here so it is not mistaken for an oversight: the prototype has no persistence, so it had no resumed session to be considerate of.
- The `phone` value collected here is the account's login number on the `LogisticsCompany` row. It is not re-collected anywhere else in the wizard, and `task-14`'s review step reads it back out of `draft.company.phone`.
