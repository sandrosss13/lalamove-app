# Task 09: Step 1 — Authorisation & Personal

## Status

complete

## Wave

4

## Description

The wizard's first step, filling in the stub at `src/components/driver-onboarding/steps/step-1-auth-personal.tsx` built by `task-08`. Collects mobile number, full name, ID/passport number, date of birth, city, and a profile photo. No OTP screen — that's a deliberate scope decision (see `requirements.md`'s Non-Goals): the phone field is kept, nothing verifies it.

## Dependencies

**Depends on:** task-08-onboarding-shell.md
**Blocks:** None

**Context from dependencies:** `useOnboardingDraft()` (from `onboarding-draft-context.tsx`) exposes `draft.personal`, `updateDraft({ personal: {...} })`, `documents` (find the live `PROFILE_PHOTO` entry for its `signedUrl`/`status`), `goToStep`, and `showToast`. `<DocumentUploadDialog slot="selfie" .../>` handles the upload flow end to end — this task only opens it and reads `onUploaded`. `GEORGIAN_CITY_OPTIONS` (from `task-02`, `src/lib/georgian-cities.ts`) now has 63 entries with `{ value, label, region }`.

## Files to Modify

- `src/components/driver-onboarding/steps/step-1-auth-personal.tsx` — replace the stub with the real step.

## Technical Details

### Fields, in order (from `design_handoff_driver_onboarding/README.md`)

| Field | Control | Validation |
|---|---|---|
| Mobile number | `tel` input | required; 10–15 digits after stripping non-digits |
| Full name | text | required; at least two words (split on whitespace, ≥2 non-empty parts) |
| ID / passport number | mono text (`font-mono` / `IBM Plex Mono` equivalent — check `src/app/globals.css` for how this codebase's mono stack is already exposed as a Tailwind class) | required; `^[A-Za-z0-9-]{6,20}$` |
| Date of birth | `date` input | required; age ≥ 21 and ≤ 75 as of today |
| City | searchable dropdown | required; must match a value in `GEORGIAN_CITY_OPTIONS` |
| Profile photo | upload slot | required |

### City dropdown

Type-to-filter against `GEORGIAN_CITY_OPTIONS`'s `label`, each row showing `"{label} · {region}"` (e.g. "Batumi · Adjara"), `max-height: 236px` with scroll. Helper text below it: "Where you will mostly pick up orders. Georgia only for now." Build with `src/components/ui/popover.tsx` + `src/components/ui/input.tsx` (a text input that opens a filtered list in a popover) — this codebase has no combobox primitive, so this is a genuinely new hand-built pattern; do not add a new dependency for it.

### Profile photo slot

Dashed-border circular 64px tile. Empty state: "Upload a profile photo" / "JPG or PNG, max 10 MB", opens `<DocumentUploadDialog slot="selfie">` on click. Once `documents` has a live `PROFILE_PHOTO` entry, the tile turns green with "Uploaded" and shows the thumbnail via a plain `<img src={signedUrl}>` (never `next/image` — see `task-03`'s notes).

### Validation timing

Fires on **Continue**, not on blur (per the design). A failing field gets a red border + an inline message below it; a toast (`useOnboardingDraft().showToast`) reads "Fix the highlighted fields to continue." On success, call `updateDraft({ personal: {...} })` (already done continuously as the user types — see below) then `goToStep(2)`.

### Save-as-you-type vs. validate-on-continue

Every field's `onChange` calls `updateDraft({ personal: { ...current, [field]: value } })` immediately (this is what makes the draft resumable — the debounced `PATCH` in `task-08`'s context handles the actual network save; this step never calls the API directly). Validation state (which fields are currently showing an error) is separate local component state, only populated when Continue is clicked and a check fails — not tied to the save itself, so a half-finished field is still saved even if it wouldn't yet pass validation.

## Acceptance Criteria

- [ ] All six fields render with the exact copy above; the age and ID-number regex rules are enforced client-side on Continue, not on blur.
- [ ] The city dropdown filters as the user types and shows "{City} · {Region}" rows.
- [ ] The profile photo slot opens the shared upload dialog and reflects "Uploaded" once a document exists.
- [ ] A validation failure shows a red border + inline message on every failing field simultaneously (not just the first) and a toast reading exactly "Fix the highlighted fields to continue."
- [ ] Every field's value survives a page reload (i.e. is present in `draft.personal` after the debounced save has had time to fire and `GET` is re-run).
- [ ] Continue with all fields valid calls `goToStep(2)`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not add an OTP/SMS-code UI anywhere in this step — the phone field is a plain, unverified `tel` input.
