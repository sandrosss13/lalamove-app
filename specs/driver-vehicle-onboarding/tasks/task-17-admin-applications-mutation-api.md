# Task 17: Admin Applications — Mutation APIs

## Status

pending

## Wave

5

## Description

The four write actions an admin reviewer takes: approve or flag one document (with a reason), request changes from the driver (moves the application to action required), and approve the driver outright (activates the account). Each writes an `AuditLog` row, matching every other admin mutation in this codebase.

## Dependencies

**Depends on:** task-01-schema-migration.md (needs `DriverApplication`/`DriverApplicationDocument`/`DriverProfile.activatedAt`)
**Blocks:** task-19-admin-applications-detail-drawer.md

**Context from dependencies:** Same versioned-document model as `task-06`/`task-16` — only the `supersededAt: null` row per document type is ever acted on. `DriverProfile.activatedAt` (from `task-01`) is what `task-07`'s gate checks; setting it here is what actually unblocks a newly-approved driver.

## Files to Create

- `src/app/api/admin/driver-applications/[id]/documents/[docId]/route.ts` — `PATCH`, approve or flag one document
- `src/app/api/admin/driver-applications/[id]/request-changes/route.ts` — `POST`
- `src/app/api/admin/driver-applications/[id]/approve/route.ts` — `POST`

## Technical Details

All three use `authorizeAdminApi(["SUPER_ADMIN", "USER_MANAGER"])` (same as `task-16`), and all three operate only on an application whose `status` is `PENDING` or `ACTION_REQUIRED` (404/400 for `DRAFT` or already-`APPROVED` — an approved application is done, and a draft was never submitted).

### `PATCH /api/admin/driver-applications/[id]/documents/[docId]`

Body: `{ action: "approve" } | { action: "flag"; reason: string }`. 404 if `docId` doesn't belong to this application or isn't the live (`supersededAt: null`) row for its type. 400 if `action === "flag"` and `reason` is empty/whitespace-only — the design offers reason **chips** as a UI convenience (`task-19` renders "Photo is blurry", "Glare — details unreadable", "Face not clearly visible", "Wrong document uploaded", "Document expired", "Does not match the ID"), but the server accepts any non-empty string, not just those six, since a reviewer may need to type something else.

```ts
await prisma.driverApplicationDocument.update({
  where: { id: docId },
  data:
    body.action === "approve"
      ? { status: "APPROVED", flagReason: null }
      : { status: "FLAGGED", flagReason: body.reason.trim() },
});

await writeAuditLog({
  actorId: context.actorId,
  action: body.action === "approve" ? "driver_application_document.approve" : "driver_application_document.flag",
  entityType: "DriverApplicationDocument",
  entityId: docId,
  metadata: { applicationId: id, documentType: doc.type, ...(body.action === "flag" ? { reason: body.reason } : {}) },
});
```

Response `200 { documentId, status, flagReason }`.

### `POST /api/admin/driver-applications/[id]/request-changes`

Requires **at least one** live document with `status: "FLAGGED"` — 400 "Flag at least one document before requesting changes." otherwise. On success: `driverApplication.update({ where: { id }, data: { status: "ACTION_REQUIRED" } })`, then `writeAuditLog({ actorId, action: "driver_application.request_changes", entityType: "DriverApplication", entityId: id, metadata: { flaggedDocumentTypes: [...] } })`. Response `200 { status: "ACTION_REQUIRED" }`.

### `POST /api/admin/driver-applications/[id]/approve`

Requires **all three** live documents to have `status: "APPROVED"` — 400 "Every document must be approved first." otherwise. On success, inside one `prisma.$transaction`:

```ts
await tx.driverApplication.update({ where: { id }, data: { status: "APPROVED" } });
await tx.driverProfile.update({
  where: { id: application.driverProfileId },
  data: { activatedAt: new Date() },
});
```

Then `writeAuditLog({ actorId, action: "driver_application.approve", entityType: "DriverApplication", entityId: id, metadata: { driverProfileId: application.driverProfileId } })`. Response `200 { status: "APPROVED" }`.

## Acceptance Criteria

- [ ] Flagging a document without a reason (or with a whitespace-only one) is rejected with 400.
- [ ] Approving a document clears any previous `flagReason`.
- [ ] `request-changes` is rejected (400) when no live document is currently flagged, and succeeds (moving the application to `ACTION_REQUIRED`) when at least one is.
- [ ] `approve` is rejected (400) when any live document isn't `APPROVED`, and on success sets both `DriverApplication.status = "APPROVED"` and `DriverProfile.activatedAt` to a non-null value, in the same transaction.
- [ ] Every mutation writes exactly one `AuditLog` row with `actorId` set to the calling staff member's `User.id` (not the driver's).
- [ ] All three endpoints reject a `DRAFT` or already-`APPROVED` application appropriately.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- None of these three endpoints touch Supabase Storage — flagging/approving a document is a status change on the `DriverApplicationDocument` row only, not a re-upload (that's the driver's own retake flow, `task-06`).
