# Task 23: Registered City Cannot Be Corrected When An Admin Flags The Address

## Status

pending

## Wave

8 (follow-up — found while auditing the correction dialog against the admin flag reasons, not part of the original spec)

## Description

`src/app/api/admin/business-applications/[id]/company/route.ts` validates the company flag reason against a closed list of four. One of them is:

> Address does not match registration

When an admin raises it, the company opens `CompanyDetailsForm` in correction mode from the status screen and fixes what was wrong. That works for the street address — `registeredAddress` is an editable field — but **not for the city**. `LogisticsCompany.city` is rendered read-only in both draft and correction mode, with the copy "Set when the account was created. Contact operations to change it."

So if the mismatch is the city rather than the street, the correction loop cannot resolve it: the company edits nothing that matters, resubmits, and the admin flags it again. There is no operations UI for changing it either — `/api/admin/business-applications/[id]/company` writes only a verdict, and the admin drawer renders the city read-only. The only remedy today is a direct database edit.

This is **pre-existing and deliberate**, not a regression. The read-only rule comes from `task-10` §7: `city` is the registered city, set at sign-up, carried through the wizard unchanged so it is never silently derived from `citiesOfOperation` or defaulted. That reasoning is sound — the bug is that nothing was ever built for the case where the value set at sign-up is simply wrong.

Same shape as the phone gap found alongside it, which was closed by adding the field to the correction dialog (see `fix/fleet-step1-company-email`).

## Dependencies

**Depends on:** None — everything involved is committed.
**Blocks:** None

**Context from dependencies:**

- `src/components/fleet-onboarding/steps/step-1-company-details.tsx` exports `CompanyDetailsForm({ mode, initial, onSaved, onBack? })`. `mode === "correction"` is what the status screen's flagged-company dialog mounts. Fields already render conditionally on mode: Contact person shows email (and, after the phone fix, the number) only in correction mode.
- The registered city currently renders as a read-only row: `{registeredCity?.label ?? company.city ?? "—"}`, resolved against `GEORGIAN_CITY_OPTIONS` from `src/lib/georgian-cities.ts` (63 values, browser-safe mirror of the `GeorgianCity` enum).
- `POST /api/logistics-company` already accepts and validates `city` against the enum on every call — it is one of the four always-required fields. **The endpoint needs no change**; it will persist a corrected city today. Only the UI withholds it.
- `city` is distinct from `citiesOfOperation` (a `GeorgianCity[]`). Do not conflate them: one is the registered/legal city, the other is where the fleet operates.

## Files to Modify

- `src/components/fleet-onboarding/steps/step-1-company-details.tsx` — make the registered city editable in correction mode only.

## Technical Details

### The rule

In `mode === "correction"`, replace the read-only city row with a select over `GEORGIAN_CITY_OPTIONS`, seeded from `submittedSummary.city`. In `mode === "draft"` it stays read-only exactly as it is now — a company mid-wizard has no reason to change what it just set at sign-up, and §7's reasoning holds there.

Validate the same way the endpoint does: required, and a member of the enum. Reuse whatever predicate the existing `city` handling uses rather than writing a second one; if the draft path has no predicate because the field was never editable, add one and have both paths share it.

Update the per-mode field table in `CompanyDetailsForm`'s doc comment — Legal entity under `"correction"` gains an editable city — and replace the "Contact operations to change it" copy in that mode, since it stops being true.

### Why correction-mode-only rather than always editable

The asymmetry is the point, and it matches how email and phone were handled. During the wizard the company is describing itself for the first time and the sign-up value is authoritative; after an admin has said "this does not match the registration", the value is exactly what is in dispute. Making it always editable would reopen the §7 problem — a company idly changing its registered city mid-wizard with no review — for no benefit.

### What not to do

- **Do not derive the city from `citiesOfOperation`.** §7 forbids this explicitly and the reasoning stands: the registered city is a legal fact about the entity, not an operational one, and a company can operate somewhere it is not registered.
- **Do not make it editable in draft mode** to keep the two paths uniform. The uniformity is not worth reopening a rule that was reasoned through.
- **Do not add an admin-side city edit** as part of this. An admin changing a company's registered legal city on its behalf is a different decision with an audit trail question attached, and it is not needed once the company can fix it itself.

## Acceptance Criteria

- [ ] A company whose application is `ACTION_REQUIRED` with `companyFlagReason` set opens the correction dialog and can change the registered city.
- [ ] Saving persists it — `POST /api/logistics-company` already accepts `city`, so a corrected value survives a reload and appears in the admin drawer.
- [ ] Saving still clears the company flag, exactly as it does for any other corrected field (`task-06` §6), so Resubmit enables.
- [ ] Draft mode is unchanged: the city is still a read-only row with its existing copy, and is still carried through to the POST unedited.
- [ ] An invalid or empty city is rejected client-side with the same message the endpoint would return, before the request is made.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Found by walking the four admin company flag reasons against the fields the correction dialog actually renders, rather than by review. That audit is worth repeating whenever the flag-reason list or the dialog's field set changes — the two are a closed loop, and nothing enforces that every reason has a corresponding remedy.
- The same audit found the phone gap, which was closed on `fix/fleet-step1-company-email`. This one was left out of that branch deliberately: it is pre-existing rather than caused by it, and widening a fix branch to cover an unrelated pre-existing gap makes both harder to review and revert.
- Worth considering a test — or at minimum a comment on the flag-reason constant — asserting that every reason in the closed list has a field the correction dialog can edit. Two of the four have now been found broken by manual inspection alone.
