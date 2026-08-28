# Task 03: Private Document Storage — Onboarding Documents

## Status

complete

## Wave

1

## Description

Onboarding documents (profile photo, licence front, licence back) are identity/compliance material and must not be publicly readable the way `Vehicle.photoUrls` is (that bucket is deliberately public — see `src/lib/supabase-storage.ts`'s own doc comment). This task adds a parallel server-side helper for a **private** bucket, plus a small browser-side client, so uploads go directly from the browser to Supabase Storage rather than through a Next.js route handler body — the design's stated 10MB-per-document cap exceeds Vercel's ~4.5MB request-body limit for a route handler, so the file itself can never be the body of an API call in this feature.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-onboarding-documents-api.md, task-16-admin-applications-read-api.md

**Context from dependencies:** None — this task only needs the existing `src/lib/supabase-storage.ts` as a pattern reference (read it, but do not modify it — this task adds a new, separate file for a separate, private bucket).

## Files to Create

- `src/lib/driver-document-storage.ts` — server-only helper: signed upload URLs, signed read URLs, deletion. Mirrors `src/lib/supabase-storage.ts`'s lazy-client pattern but does **not** import from or modify that file.
- `src/lib/supabase-browser-client.ts` — a small, genuinely browser-safe Supabase client (anon key only, no service role key anywhere near it) used solely to perform the actual upload once the server has issued a signed upload URL.

## Files to Modify

- `env.example` — document the two new env vars and the manual bucket-creation step, alongside the existing `vehicle-photos` note.

## Technical Details

### Why a private bucket needs a different shape than `supabase-storage.ts`

`supabase-storage.ts` persists **public URLs** (`getPublicUrl`) and has to reverse-engineer the storage path back out of a URL when deleting (`storagePathFromPublicUrl`, with a `decodeURIComponent` round-trip) because only the URL is ever persisted. A private bucket has no public URL to persist in the first place — the DB stores the **path** directly (`DriverApplicationDocument.storagePath`, from `task-01`), and a signed URL is minted fresh, briefly, whenever a document needs to be displayed. This is simpler, not just different — do not port the URL-parsing logic into this file, there's nothing for it to parse.

### `src/lib/driver-document-storage.ts`

```ts
/**
 * Supabase Storage access for onboarding documents (profile photo, licence
 * front/back). Server-only: authenticates with the service role key, which
 * bypasses row level security and must never reach the browser — import this
 * from route handlers only.
 *
 * Unlike `src/lib/supabase-storage.ts` (public vehicle photos), this bucket
 * is private: nothing is persisted as a public URL. The DB stores the object
 * *path*; a signed URL is minted on demand, short-lived, wherever a document
 * needs to be shown (the driver's own onboarding views, the admin review
 * drawer) — never cached, never logged.
 *
 * The bucket is not provisioned by this code — create a **private** bucket
 * named `driver-documents` in the Supabase dashboard (Storage → New bucket,
 * leave "Public bucket" unchecked) before uploads will work.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DRIVER_DOCUMENT_BUCKET = "driver-documents";

/** How long a read signed URL stays valid. Kept short because it's a bearer
 *  token — anyone holding the URL can read the object until it expires,
 *  independent of session state. Re-minted on every request that needs one,
 *  so a short TTL costs nothing in practice. */
const READ_SIGNED_URL_TTL_SECONDS = 300;

/** Only these are accepted — the design specifies "JPG or PNG"; never trust
 *  a client-supplied `File.type` beyond checking it against this list, and
 *  never allow `image/svg+xml` (an SVG opened top-level from a signed URL is
 *  an XSS vector). */
const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g;
const FALLBACK_FILE_NAME = "document";

let cachedClient: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase Storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}

function toSafeFileName(fileName: string): string {
  const safe = fileName.trim().replace(UNSAFE_FILE_NAME_CHARS, "-");
  return safe.length > 0 ? safe : FALLBACK_FILE_NAME;
}

/**
 * Issues a signed upload URL + token for one document. The browser uploads
 * directly to Supabase with these (via `uploadFileToSignedUrl` in
 * `supabase-browser-client.ts`) — the file itself never passes through a
 * Next.js route handler. `driverProfileId` namespaces the path so a driver's
 * documents stay grouped together; a UUID prefix means two uploads of the
 * same file name never collide.
 */
export async function createDriverDocumentUploadUrl(
  driverProfileId: string,
  fileName: string,
  contentType: string,
): Promise<{ path: string; signedUrl: string; token: string }> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unsupported file type: ${contentType}. Only JPG and PNG are accepted.`);
  }

  const client = getStorageClient();
  const path = `${driverProfileId}/${crypto.randomUUID()}-${toSafeFileName(fileName)}`;

  const { data, error } = await client.storage
    .from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    throw new Error(`Failed to create an upload URL: ${error.message}`);
  }

  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** One short-lived signed URL for reading a document. */
export async function getDriverDocumentSignedUrl(path: string): Promise<string> {
  const client = getStorageClient();
  const { data, error } = await client.storage
    .from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUrl(path, READ_SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw new Error(`Failed to create a signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Batch form of the above — used wherever several documents are shown at
 * once (the review step, the status screen, the admin drawer) to avoid one
 * round trip per thumbnail. Returns a `path -> signedUrl` map; a path that
 * fails to sign is simply omitted rather than failing the whole batch, since
 * one bad thumbnail shouldn't take the rest of the page down.
 */
export async function getDriverDocumentSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const client = getStorageClient();
  const { data, error } = await client.storage
    .from(DRIVER_DOCUMENT_BUCKET)
    .createSignedUrls(paths, READ_SIGNED_URL_TTL_SECONDS);

  if (error) {
    throw new Error(`Failed to create signed URLs: ${error.message}`);
  }

  const result: Record<string, string> = {};
  for (const entry of data) {
    if (!entry.error && entry.signedUrl) {
      result[entry.path ?? ""] = entry.signedUrl;
    }
  }
  return result;
}

/**
 * Deletes the objects at the given paths. Throws on a Storage error so
 * callers can log it; the DB row is the source of truth, so an orphaned
 * object is a tidiness problem, not a correctness one — matching the same
 * reasoning already documented in `supabase-storage.ts`. Used when a
 * document is superseded by a retake (the old object is removed best-effort
 * after the new `DriverApplicationDocument` row is created).
 */
export async function deleteDriverDocuments(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const { error } = await getStorageClient()
    .storage.from(DRIVER_DOCUMENT_BUCKET)
    .remove(paths);

  if (error) {
    throw new Error(`Failed to delete documents: ${error.message}`);
  }
}
```

### `src/lib/supabase-browser-client.ts`

This is the only place in the codebase that talks to Supabase from the browser — genuinely public-safe (anon key only). Do not import `SUPABASE_SERVICE_ROLE_KEY` here or anywhere reachable from client code.

```ts
/**
 * Browser-safe Supabase client, used only to perform the actual file upload
 * once a route handler has already issued a signed upload URL (see
 * `src/lib/driver-document-storage.ts`). Uses the anon key — never the
 * service role key, which must never reach the browser.
 */
"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DRIVER_DOCUMENT_BUCKET = "driver-documents";

let cachedClient: SupabaseClient | null = null;

function getBrowserClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase browser client is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  cachedClient = createClient(url, anonKey);
  return cachedClient;
}

/**
 * Uploads `file` directly to Supabase Storage using a signed upload URL's
 * `path`/`token` (from `POST /api/driver-profile/onboarding/documents/upload-url`,
 * built in `task-06`). The file never passes through a Next.js route handler.
 */
export async function uploadFileToSignedUrl(
  path: string,
  token: string,
  file: File,
): Promise<void> {
  const { error } = await getBrowserClient()
    .storage.from(DRIVER_DOCUMENT_BUCKET)
    .uploadToSignedUrl(path, token, file);

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}
```

### `env.example`

Add, near the existing Supabase section:

```
# Supabase anon (public) key (Project Settings → API) — safe to expose to the
# browser, used only to perform a direct-to-storage upload once a route
# handler has issued a signed upload URL. Never put the service role key here.
NEXT_PUBLIC_SUPABASE_URL=""
NEXT_PUBLIC_SUPABASE_ANON_KEY=""
# MANUAL SETUP: before onboarding document uploads will work, create a
# **private** bucket named `driver-documents` in the Supabase dashboard under
# Storage → New bucket — leave "Public bucket" unchecked, unlike vehicle-photos.
```

`NEXT_PUBLIC_SUPABASE_URL` will have the same value as the existing `SUPABASE_URL`; it needs the `NEXT_PUBLIC_` prefix as a separate variable because Next.js only inlines that prefix into the browser bundle.

## Acceptance Criteria

- [ ] `src/lib/driver-document-storage.ts` exports `createDriverDocumentUploadUrl`, `getDriverDocumentSignedUrl`, `getDriverDocumentSignedUrls`, and `deleteDriverDocuments`, all server-only.
- [ ] `createDriverDocumentUploadUrl` rejects any `contentType` other than `image/jpeg`/`image/png` before calling Supabase.
- [ ] `src/lib/supabase-browser-client.ts` contains no reference to `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_URL` (the non-public one) anywhere in the file.
- [ ] `env.example` documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the private-bucket manual-setup step.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Neither new file imports the other's counterpart's secret (`driver-document-storage.ts` never imported from a client component; `supabase-browser-client.ts` never imports `SUPABASE_SERVICE_ROLE_KEY`).

## Notes

- This task does not create the bucket itself, and does not wire either helper into an API route or UI — that's `task-06`. It only needs to exist and compile correctly.
- See `action-required.md` for the manual bucket-creation step and the reminder to add the two new env vars to whatever secret store the deployment uses (Vercel project settings, etc.) — not just `env.example`.
- Document thumbnails must render via a plain `<img src={signedUrl}>`, never `next/image` — `next.config.ts` has no `images.remotePatterns` configured, and every existing photo surface in this codebase (`vehicle-card.tsx`, `company-vehicle-card.tsx`, `landing-page.tsx`) already uses a plain `<img>` for exactly this reason. This is a note for the UI tasks that consume signed URLs (`task-09`, `task-10`, `task-14`, `task-19`), not something enforced by this task's own files.
