# Task 19: Admin Applications Detail Drawer

## Status

complete

## Wave

6

## Description

The 520px right-side detail panel opened from a queue row: the full application data, and per-document approve/flag controls, ending in **Request changes** / **Approve driver**. This is the component `task-18`'s queue page already imports and renders as `<DriverApplicationDetailDrawer applicationId onClose onChanged />` — build exactly that contract.

## Dependencies

**Depends on:** task-15-admin-nav-registration.md, task-16-admin-applications-read-api.md, task-17-admin-applications-mutation-api.md
**Blocks:** None

**Context from dependencies:** `task-16`'s `GET /api/admin/driver-applications/[id]` returns `AdminDriverApplicationDetail` (`driver`, `licence`, `vehicle`, `documents[]` — full shape in that task file), each document carrying a `signedUrl`. `task-17`'s three mutation endpoints: `PATCH /api/admin/driver-applications/[id]/documents/[docId]` (`{action:"approve"}` or `{action:"flag", reason}`), `POST .../request-changes`, `POST .../approve`.

**Post-wave-5-review correction: `vehicle` is `{...} | null`, not always present.** A driver can remove their vehicle from their own dashboard at any time (an existing, unrelated flow), and `DriverApplication.vehicleId` is `onDelete: SetNull`, so an application can legitimately reach this drawer with no vehicle on file — reviewed documents and all. Render an explicit "Vehicle no longer on file" state in the vehicle section of the two-column grid when `vehicle === null`, rather than blank fields. This is also why `task-17`'s `approve` endpoint now 400s with "This application no longer has a vehicle on file and can't be approved." when `vehicleId` is null — surface that error inline the same way any other failed mutation is shown, it isn't a special case.

## Files to Create

- `src/components/admin/driver-application-detail-drawer.tsx`

## Technical Details

### Shell

`"use client"`, props `{ applicationId: string; onClose: () => void; onChanged: () => void }`. Fetch `GET /api/admin/driver-applications/${applicationId}` on mount and whenever `applicationId` changes; `loading`/`error`/`data` local state, same conventions as every other fetch in this codebase. 520px fixed-position panel on the right, following the same fixed-overlay structural approach as `src/components/dashboard/ops/ops-drawer-shell.tsx` — adapt it to this section's light admin theme (the ops version is dark-themed for the ops console; do not import or reuse it directly, build a new light-themed panel).

### Body

Applicant fields in a two-column grid: ID number, DOB, mobile, city, licence number, licence expiry, categories, make/model, year/colour, plate, payload, cargo hold (`"{l} × {w} × {h} m"`), body type.

Then a document list — three rows (Profile photo, Licence front, Licence back, in that order regardless of the API's array order — sort client-side by a fixed `type` order), each with:
- a thumbnail via plain `<img src={doc.signedUrl}>` (never `next/image` — see `task-03`'s notes; the same reasoning applies here as everywhere else this feature renders a document)
- a state line ("Pending review" / "Approved" / `"Flagged — {flagReason}"`)
- **Approve** / **Flag** buttons

Clicking **Flag** expands a row of reason chips (from the design, exact): "Photo is blurry", "Glare — details unreadable", "Face not clearly visible", "Wrong document uploaded", "Document expired", "Does not match the ID" — clicking a chip immediately calls `PATCH .../documents/${docId}` with `{ action: "flag", reason: chipText }` (no separate confirm step; a chip click *is* the flag action, matching the design). Clicking **Approve** calls the same endpoint with `{ action: "approve" }`. Either call, on success, re-fetches this drawer's own detail (so the state line updates immediately) and calls the parent's `onChanged()` (so the queue row's chip/Docs count catches up too).

### Footer

A hint line that changes with progress (e.g. "1 of 3 documents reviewed" while incomplete, "All documents approved — ready to approve this driver." once all three are), then two buttons:

- **Request changes ({n})** where `n` = the count of currently-flagged documents — `disabled` when `n === 0`. On click: `POST .../request-changes`; on success, `onChanged()` + `onClose()` (the application just left this reviewer's queue for the "action required" bucket — closing the drawer avoids showing a now-stale detail view).
- **Approve driver** — `disabled` unless all three documents are `APPROVED`. On click: `POST .../approve`; on success, `onChanged()` + `onClose()`.

Both buttons show an inline error (never `alert()`) on a failed request and stay open so the reviewer can retry.

## Acceptance Criteria

- [ ] The drawer renders every field from `AdminDriverApplicationDetail` in the two-column grid described.
- [ ] All three documents render with a thumbnail, correct state line, and working Approve/Flag controls.
- [ ] Clicking a flag-reason chip immediately flags the document with that exact reason text — no separate confirmation step.
- [ ] "Request changes" is disabled with zero flagged documents and enabled with at least one; on success the drawer closes and the queue page's `onChanged` re-fetch is triggered.
- [ ] "Approve driver" is disabled unless all three documents are approved; on success the drawer closes, the queue re-fetches, and (verify via `task-07`'s gate) the driver's `DriverProfile.activatedAt` is now non-null.
- [ ] A failed mutation shows an inline error and leaves the drawer open with its current state intact.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not let "Approve driver" or "Request changes" be clickable while a mutation request is already in flight (disable both during the request, not just the one being acted on) — a double-click sending two `approve` calls should not be possible.
