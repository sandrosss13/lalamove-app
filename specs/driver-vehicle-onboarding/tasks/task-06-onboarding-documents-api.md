# Task 06: Onboarding Documents API

## Status

complete

## Wave

2

## Description

Wires the private-storage helper from `task-03` into two endpoints: one that issues a signed upload URL for the browser to upload directly to Supabase (never through this route's own body — see `task-03`'s description for why), and one that records the resulting path against a versioned `DriverApplicationDocument` row once the browser-side upload succeeds. Used by the wizard's profile-photo slot (`task-09`), licence front/back slots (`task-10`), and the action-required "Retake" flow (`task-14`).

## Dependencies

**Depends on:** task-01-schema-migration.md (needs `DriverApplicationDocument`), task-03-driver-document-storage.md (needs `createDriverDocumentUploadUrl`, `deleteDriverDocuments`)
**Blocks:** task-08-onboarding-shell.md, task-10-onboarding-step2-licence.md, task-14-onboarding-status-screen.md

**Context from dependencies:** `task-01`'s `DriverApplicationDocument` is versioned: a retake inserts a new row rather than overwriting, and a partial unique index guarantees at most one row per `(driverApplicationId, type)` has `supersededAt: null` at a time. `task-03`'s `createDriverDocumentUploadUrl(driverProfileId, fileName, contentType)` returns `{ path, signedUrl, token }` and throws on an unsupported content type; `deleteDriverDocuments(paths)` best-effort-removes objects.

## Files to Create

- `src/app/api/driver-profile/onboarding/documents/upload-url/route.ts` — `POST`, issues the signed upload URL
- `src/app/api/driver-profile/onboarding/documents/route.ts` — `POST`, records a completed upload

## Technical Details

### `POST /api/driver-profile/onboarding/documents/upload-url`

Auth: session required, `role === "DRIVER"` with a `DriverProfile` and an existing `DriverApplication` (404 "Start the application first" if none — the driver reaches this only through the wizard, which always calls `GET /api/driver-profile/onboarding` first and so always has one by the time an upload slot renders). **400 if `application.status` is `"PENDING"` or `"APPROVED"`** — uploads are only meaningful while the application is `"DRAFT"` or `"ACTION_REQUIRED"` (mid-retake).

Body: `{ type: "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK"; fileName: string; contentType: string }`. Validate `contentType` is `image/jpeg` or `image/png` here too (before touching Storage) so a bad request gets a clean 400 with a readable message rather than surfacing `createDriverDocumentUploadUrl`'s thrown error.

```ts
const { path, signedUrl, token } = await createDriverDocumentUploadUrl(
  driverProfile.id,
  fileName,
  contentType,
);
return NextResponse.json({ path, signedUrl, token });
```

Response `200`: `{ path: string; signedUrl: string; token: string }`. The client (`task-08`'s shared upload dialog) then calls `uploadFileToSignedUrl(path, token, file)` from `src/lib/supabase-browser-client.ts` (built in `task-03`) to actually push the bytes, and only on *that* succeeding calls the next endpoint below.

### `POST /api/driver-profile/onboarding/documents`

Auth: same as above, same 404/400 status guard. Body: `{ type: "PROFILE_PHOTO" | "LICENCE_FRONT" | "LICENCE_BACK"; path: string }` — `path` must be the exact value returned by the upload-url call above (no separate ownership check on the path string itself beyond that it was minted for this `driverProfile.id`'s namespace by the call above; a forged path pointing outside the driver's own prefix is caught because it wouldn't exist as an object this driver could have uploaded to — accept this as sufficient rather than adding a second lookup against Storage).

Within one `prisma.$transaction`:
1. Find the current live document of this `type` for this application (`supersededAt: null`), if any.
2. Create a new `DriverApplicationDocument` row: `{ driverApplicationId, type, storagePath: path, status: "PENDING" }`.
3. If a previous live row existed, set its `supersededAt: new Date()`.

After the transaction commits, if a previous row existed, best-effort `deleteDriverDocuments([previousRow.storagePath])` — log and swallow a failure here, don't fail the request over storage cleanup (same reasoning as `task-05`'s reset endpoint and the existing `supabase-storage.ts` comment).

Response `200`: `{ type; status: "PENDING"; signedUrl: string; uploadedAt: string }` — a fresh signed URL for the just-uploaded document so the calling UI can show the thumbnail immediately without a second round trip to `GET /api/driver-profile/onboarding`.

## Acceptance Criteria

- [ ] `upload-url` rejects (400) an unsupported `contentType` before calling Storage, with a message naming JPG/PNG.
- [ ] `upload-url` and the record endpoint both reject (400) when the application's status is `PENDING` or `APPROVED`.
- [ ] Recording a document for a `type` that already has a live row supersedes the old row (`supersededAt` set) and creates a new one — never updates the old row's `storagePath` in place.
- [ ] The superseded document's storage object is deleted best-effort after the transaction commits; a Storage deletion failure does not fail the request.
- [ ] The partial unique index from `task-01` (`driver_application_document_live_type_unique`) is never violated by this flow — verify by uploading the same document type twice in a row and confirming exactly one live row exists afterward.
- [ ] The record endpoint verifies the uploaded object's actual `Content-Type` against the JPG/PNG allowlist (not just the client-claimed value from the upload-url request) before creating a `DriverApplicationDocument` row, rejecting and best-effort deleting anything else.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This task does not decide when a document's `status` moves to `APPROVED`/`FLAGGED` — that's the admin review flow (`task-17`). Every document this task creates starts `PENDING`.
- Do not accept a raw file upload as this route's request body anywhere in this task — the whole point of the signed-upload-URL step is that the file bytes never touch a Next.js route handler.
- **The `contentType` check in `createDriverDocumentUploadUrl` (`task-03`) is advisory, not enforced against the actual bytes** — a caller can request a token claiming `image/png` and then upload something else entirely via `uploadFileToSignedUrl`, since a signed upload URL can't pin the content type of what's later PUT to it. Flagged in wave 1's review as worth closing here rather than assuming it's already covered: before creating the `DriverApplicationDocument` row in the record endpoint (step 2 above), fetch the uploaded object's actual `Content-Type` metadata (available from Supabase Storage after upload — e.g. via a `HEAD`/metadata read on the object) and reject (400, and best-effort delete the wrongly-typed object) anything outside the `image/jpeg`/`image/png` allowlist. This closes the gap between "client claimed a type" and "the type Storage actually recorded," which matters because a document's read path is a directly-opened signed URL — an uploaded SVG or HTML file would otherwise be a real XSS vector, not just a theoretical one.
