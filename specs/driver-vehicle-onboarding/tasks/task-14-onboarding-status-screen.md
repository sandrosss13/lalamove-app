# Task 14: Application Status Screen

## Status

complete

## Wave

4

## Description

Fills in `src/components/driver-onboarding/application-status-screen.tsx` — what a driver sees after submitting, in each of the three post-submit states: pending verification, action required (with per-document retake), and approved. `task-08`'s shell already renders this component instead of any wizard step whenever `status !== "DRAFT"`.

## Dependencies

**Depends on:** task-08-onboarding-shell.md, task-06-onboarding-documents-api.md
**Blocks:** task-20-onboarding-redirect-wiring.md

**Context from dependencies:** `useOnboardingDraft()` exposes `status`, `reference`, `documents` (each with `type`/`status`/`flagReason`/`signedUrl`), `submittedSummary`, and `refetch`. `<DocumentUploadDialog slot="selfie" | "licFront" | "licBack">` (`task-08`) handles a retake exactly like the wizard steps' upload slots — open it, and on `onUploaded` the underlying document is superseded server-side (`task-06`) automatically. This task also calls `task-13`'s submit endpoint directly for the Resubmit action — its contract (documented independently below, matching what `task-13` actually builds) is: `POST /api/driver-profile/onboarding/submit` with no body, `200 { status: "PENDING" }` on success or `400/409 { error: string }` on failure.

## Files to Modify

- `src/components/driver-onboarding/application-status-screen.tsx` — replace the stub with the real component.

## Technical Details

### Header (all three states)

Mono application reference (`reference`, e.g. "APP-40219") + driver's name, then one status card whose contents branch on `status`.

### `status === "PENDING"`

Amber dot, "Under review". A three-row timeline: Application submitted (done) / Document review in progress (current) / Account activation (waiting). Footnote: "Typical review time is 12–24 hours on business days."

### `status === "ACTION_REQUIRED"`

Red border. Compute `flaggedDocs = documents.filter(d => d.status === "FLAGGED")`. Title: `"${flaggedDocs.length} document${flaggedDocs.length === 1 ? " needs" : "s need"} a new photo"`. Body: "The review team could not read the items below. Replace them and resubmit — the rest of your application is kept." One row per flagged document: its label (`PROFILE_PHOTO` → "Profile photo", `LICENCE_FRONT` → "Licence — front", `LICENCE_BACK` → "Licence — back"), the admin's `flagReason`, and a **Retake** button opening `<DocumentUploadDialog slot={...}>` for that document. Footnote: "Resubmitted applications are usually reviewed within 4 hours."

A **Resubmit** button is shown but stays `disabled` until every currently-flagged document has been replaced — i.e. until, after a retake, `documents` (refetched) no longer contains any `status: "FLAGGED"` entry. On click: `POST /api/driver-profile/onboarding/submit` with no body; on `200`, call `refetch()` (the shell will then show the `PENDING` state once `status` updates); on failure, show the server's `{error}` inline, never `alert()`.

### `status === "APPROVED"`

Green. Title "You are cleared to drive". A summary card built from `submittedSummary` (from `task-05`'s `GET` response) showing what was approved — vehicle class, make/model, plate, licence categories. A green **"Go online and take orders"** CTA: calls `PATCH /api/driver-profile/status` with `{ isOnline: true }` (the existing endpoint, now unblocked by `task-07`'s activation gate since this driver is approved), then `router.push("/dashboard")` + `router.refresh()`. Footnote: "Keep your licence and insurance current — we re-check 30 days before expiry."

## Acceptance Criteria

- [ ] All three states render with the exact copy above, including the correctly pluralized "document(s) need(s)" title.
- [ ] Retake opens the correct document's upload dialog and, after a successful upload, the flagged row disappears from the list on the next refetch.
- [ ] Resubmit is disabled while any flagged document remains unreplaced, and enabled the moment all of them are replaced.
- [ ] Resubmit calls the submit endpoint with no body and surfaces a server error inline on failure.
- [ ] "Go online and take orders" successfully sets the driver online and lands them on `/dashboard`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This component never renders anything for `status === "DRAFT"` — the shell only mounts it once the application has actually been submitted at least once.
