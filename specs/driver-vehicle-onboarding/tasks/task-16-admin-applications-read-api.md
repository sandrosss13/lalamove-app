# Task 16: Admin Applications — Read APIs

## Status

complete

## Wave

5

## Description

The two read endpoints behind the admin review queue: a filterable, searchable list and a full-detail single-application view (including signed URLs for its three documents). `task-18` (queue page) and `task-19` (detail drawer) are built against these — both documented, self-contained response contracts below, matching this codebase's existing admin-list convention (`src/app/api/admin/users/clients/route.ts` is the closest precedent — same `authorizeAdminApi` gate, same exported-type-the-page-imports pattern).

## Dependencies

**Depends on:** task-01-schema-migration.md (needs `DriverApplication`/`DriverApplicationDocument`), task-03-driver-document-storage.md (needs `getDriverDocumentSignedUrls`)
**Blocks:** task-18-admin-applications-queue-page.md, task-19-admin-applications-detail-drawer.md

**Context from dependencies:** `task-01`'s `DriverApplication.status` is one of `DRAFT`/`PENDING`/`ACTION_REQUIRED`/`APPROVED` — a `DRAFT` application has never been submitted and must never appear in this queue. `DriverApplicationDocument` rows are versioned; only `supersededAt: null` rows are live. `task-03`'s `getDriverDocumentSignedUrls(paths)` returns a `path -> signedUrl` map, silently omitting any path that fails to sign.

## Files to Create

- `src/app/api/admin/driver-applications/route.ts` — `GET`, the list
- `src/app/api/admin/driver-applications/[id]/route.ts` — `GET`, the detail

## Technical Details

### `GET /api/admin/driver-applications`

Auth: `authorizeAdminApi(["SUPER_ADMIN", "USER_MANAGER"])` (same pattern as `src/app/api/admin/users/clients/route.ts` — `if (!authorized.ok) return authorized.response;`).

Query params: `?status=PENDING|ACTION_REQUIRED|APPROVED` (omitted or any other value = all three, still excluding `DRAFT`), `?page=` (1-based, default 1, same `parsePage` pattern as the clients route), page size 25.

```ts
export type AdminDriverApplicationRow = {
  applicationId: string;
  reference: string;
  driverName: string;
  vehicleClassName: string | null; // null until submitted at least once
  chassisType: string | null;
  plateNumber: string | null;
  categories: string[]; // e.g. ["B", "C"]
  documentsApprovedCount: number; // out of documentsTotalCount
  documentsTotalCount: number; // 3 once submitted, 0 if somehow queried pre-submit (shouldn't happen — DRAFT is excluded)
  status: "PENDING" | "ACTION_REQUIRED" | "APPROVED";
  submittedAt: string; // lastSubmittedAt
};

export type AdminDriverApplicationListResponse = {
  items: AdminDriverApplicationRow[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};
```

Query: `prisma.driverApplication.findMany({ where: { status: { not: "DRAFT", ...(statusFilter ? { equals: statusFilter } : {}) } }, include: { driverProfile: { include: { user: true, licence: true } }, vehicle: { include: { vehicleTypeSpec: true } }, documents: { where: { supersededAt: null } } }, orderBy: { lastSubmittedAt: "desc" }, skip, take })`. `vehicleClassName` is recovered from `vehicle.vehicleTypeSpec.code` via a reverse lookup against `task-04`'s `VEHICLE_CLASSES` (find the class whose `specCodeByChassis` contains that code) — write a small local helper for this reverse lookup rather than exporting one from `task-04`'s file (it's only needed here and in `task-05`'s `submittedSummary`, and the two call sites are independent enough not to warrant a shared export). `documentsApprovedCount` = `documents.filter(d => d.status === "APPROVED").length`; `documentsTotalCount` = `documents.length` (always 3 for a submitted application, per `task-13`'s submit validation).

### `GET /api/admin/driver-applications/[id]`

Same auth. 404 if not found or `status === "DRAFT"` (an unsubmitted application is not reviewable — this also stops an admin from ever seeing a driver's in-progress, unvalidated data).

```ts
export type AdminDriverApplicationDetail = {
  applicationId: string;
  reference: string;
  status: "PENDING" | "ACTION_REQUIRED" | "APPROVED";
  driver: {
    name: string;
    idNumber: string;
    dateOfBirth: string;
    mobile: string;
    city: string;
  };
  licence: {
    number: string;
    expiresAt: string;
    categories: string[];
  };
  vehicle: {
    vehicleClassName: string;
    chassisType: string;
    make: string;
    model: string;
    year: number;
    colour: string;
    plateNumber: string;
    payloadKg: number | null;
    cargoLengthM: number | null;
    cargoWidthM: number | null;
    cargoHeightM: number | null;
  };
  documents: {
    documentId: string;
    type: "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK";
    status: "PENDING" | "APPROVED" | "FLAGGED";
    flagReason: string | null;
    signedUrl: string | null;
    uploadedAt: string;
  }[];
};
```

Build `documents[].signedUrl` with a single `getDriverDocumentSignedUrls` batch call across all three live documents' `storagePath`s.

## Acceptance Criteria

- [ ] The list endpoint never returns a `DRAFT` application, with or without a `?status=` filter.
- [ ] `?status=ACTION_REQUIRED` (etc.) filters correctly; an unrecognized or absent value returns all three non-draft statuses.
- [ ] `documentsApprovedCount`/`documentsTotalCount` match the live document rows' actual approved/total counts.
- [ ] The detail endpoint 404s for a `DRAFT` application or a nonexistent id.
- [ ] The detail endpoint's `documents[].signedUrl` resolves for all three documents in one batched Storage call, not three separate ones.
- [ ] Both endpoints 401/403 correctly for a non-staff session and for a staff session without `SUPER_ADMIN`/`USER_MANAGER`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This task is read-only — it does not implement approve/flag/request-changes (`task-17`).
