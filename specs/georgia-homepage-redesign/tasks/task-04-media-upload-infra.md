# Task 04: Supabase `site-media` plumbing and the reusable admin image uploader

## Status

complete

## Wave

1

## Description

Content managers cannot currently put an image on the public site without hosting it somewhere else first. `src/components/admin/content/banner-form-dialog.tsx` asks for an image with a plain `<Input placeholder="https://example.com/banner.jpg" />` — the admin stores a URL and nothing more. This feature's requirement is that a content manager can upload a banner from their own machine and see it live in the hero carousel with no external hosting step, so this task builds the plumbing that removes it.

It produces three things: a server-only storage module for a new **public** Supabase bucket named `site-media`; an admin-guarded REST route that mints a signed upload URL for it; and one reusable `"use client"` uploader component that both Wave 2 admin tasks drop into their forms. Nothing in this task edits an existing admin form — it only creates the parts those forms will use, so that task-12 (banners, partner logos) and task-13 (vehicle photos) can be built in parallel without either one inventing its own upload flow.

The upload path is the one this repo already uses for driver documents: the route mints a signed upload URL, the **browser** puts the bytes straight into Supabase Storage, and the resulting public URL comes back to the form as a plain string. The file never passes through a Next.js route handler, whose request-body limit is far below a 2400×900 banner.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-12-admin-section-and-banner-forms.md, task-13-admin-vehicle-photos.md

**Context from dependencies:** None — this is a foundation task with no inputs.

What this task produces for the tasks it blocks:

- **task-12 (Wave 2)** rewrites `src/components/admin/content/banner-form-dialog.tsx` and adds the partner-logo placement (`home_partner_logo`). It replaces the bare "Image URL" `<Input>` with `<AdminImageUpload purpose="banners" … />` (and `purpose="partner-logos"` for logos), taking the resulting URL as the value it posts to `/api/admin/content/banners` in the existing `imageUrl` field. The `Banner` model does not change. **task-12 owns `banner-form-dialog.tsx`; this task must not touch it.**
- **task-13 (Wave 2)** builds the admin surface for setting a photo per `VehicleTypeSpec`, using `<AdminImageUpload purpose="vehicles" … />` and writing the URL into `VehicleTypeSpec.imageUrl` (a nullable column added by task-03, running in this same wave). **task-13 owns that page and its route; this task must not create either.**

Both consumers need exactly the same contract from this task: a component that takes a current URL and a purpose, and calls back with a new public URL.

## Files to Create

- `src/lib/site-media-storage.ts` — server-only Supabase Storage access for the public `site-media` bucket: the content-type allowlist, the signed-upload-URL creator, and a delete helper.
- `src/app/api/admin/content/media/upload-url/route.ts` — `POST` handler that mints a signed upload URL, guarded to `SUPER_ADMIN` / `CONTENT_MANAGER` and audited.
- `src/app/api/admin/content/media/upload-url/validation.ts` — hand-rolled body parsing plus the request/response wire types.
- `src/components/admin/content/admin-image-upload.tsx` — the reusable `"use client"` uploader: file picker, preview, busy state, error state, and a "paste a URL instead" escape hatch.

## Files to Modify

- `src/lib/supabase-browser-client.ts` — generalise `uploadFileToSignedUrl` so it can target a bucket other than `driver-documents`, without changing behaviour for its existing caller.

## Technical Details

### Read these first, and mirror them closely

Read all of these before writing a line. This task is almost entirely "the existing pattern, pointed at a second bucket", and the value is in matching it rather than improving on it.

- **`src/lib/supabase-storage.ts`** (read in full) — the public-bucket pattern. Note specifically: `uploadVehiclePhoto`, `deleteVehiclePhotos`, the private `storagePathFromPublicUrl` and the `PUBLIC_URL_MARKER` it splits on; the `PHOTO_CACHE_CONTROL_SECONDS = "31536000"` constant and its stated justification ("Object paths embed a UUID and are never rewritten, so a stored photo is immutable and can be cached indefinitely"); the `UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9._-]+/g` regex and `toSafeFileName`, which exist because Storage keys treat `/` as a folder separator; and the **lazily-cached client** with its comment explaining *why* it is lazy — building it at module scope would make merely importing the file throw, and take the whole route down, wherever the Supabase env vars are absent.
- **`src/lib/driver-document-storage.ts`** — the content-type allowlist (`ALLOWED_CONTENT_TYPES`), the exported `isSupportedDriverDocumentContentType()` predicate so a route can return a clean 400 before touching Storage, the single shared `UNSUPPORTED_CONTENT_TYPE_ERROR` string, and — the part that matters most here — the explicit note that **`image/svg+xml` is deliberately excluded because an SVG opened top-level from a URL is an XSS vector**. Also note `createDriverDocumentUploadUrl`'s shape and its `import "server-only"` header.
- **`src/lib/supabase-browser-client.ts`** — `uploadFileToSignedUrl(path, token, file)`, the only place in the codebase that talks to Supabase from the browser, using the anon key. Its bucket name is a local literal, duplicated rather than imported, because the server module is `server-only`.
- **`src/app/api/driver-profile/onboarding/documents/upload-url/route.ts`** — the exact signed-upload route shape: hand-rolled body parsing, a `try/catch` around the Storage call that answers **502** with a readable `{ error }` (its comment lists the expected causes: a bucket that was never created by hand, absent env vars, a Storage outage), and the doc-comment sentence that the bytes bypass the route-handler body limit and that issuing a URL neither creates nor reserves a row.
- **`src/components/driver-onboarding/document-upload-dialog.tsx`** — the client half: `rejectFile()` pre-flight checks, the `"idle" | "uploading" | "failed"` state machine, keeping the chosen `File` so "Try again" retries the whole sequence, and its comment on why `ACCEPTED_CONTENT_TYPES` is restated as a literal instead of imported from the `server-only` storage module.
- **`src/lib/admin/api-auth.ts`** — `authorizeAdminApi(allowedRoles)` returns `{ ok: true, context } | { ok: false, response }`; the call shape is always `const authorized = await authorizeAdminApi(ALLOWED_ROLES); if (!authorized.ok) return authorized.response;`.
- **`src/lib/admin/audit.ts`** — `writeAuditLog({ actorId, action, entityType, entityId, metadata })`, dotted `<entity>.<verb>` action names, **deliberately not** wrapped in try/catch.
- **`src/app/api/admin/content/banners/route.ts`** — the admin body-parsing house style: `let rawBody: unknown; try { rawBody = await request.json(); } catch { → 400 "Request body must be valid JSON." }`, then a `parse*Body(body: unknown): { data } | { error }` that does its own `typeof body !== "object" || body === null` check and casts to `Record<string, unknown>`. Also the `ALLOWED_ROLES` constant restated locally with the comment explaining why it is not imported from a shared place.
- **`src/app/api/admin/content/pages/validation.ts`** — the precedent for a sibling `validation.ts`: shared runtime helpers cannot live in a route module, because route modules may only export handlers and Next's route config.
- **`src/components/admin/content/banner-form-dialog.tsx`** — the form this uploader lands in (task-12's job, not yours). Note its `readErrorMessage(response, fallback)` helper, its `pending` handling, and that it composes shadcn `Button` / `Input` / `Label` from `src/components/ui/`.

There is **no validation library** in this project and there are **zero server actions** (`"use server"` appears nowhere). Do not introduce either.

### 1. `src/lib/site-media-storage.ts`

Server-only, service-role key, one **public** bucket. Structure it as `supabase-storage.ts` is structured, with `driver-document-storage.ts`'s allowlist bolted on.

```ts
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Storage bucket holding every image the marketing site renders. */
const SITE_MEDIA_BUCKET = "site-media";
```

Required exports and constants:

- **`SITE_MEDIA_PURPOSES`** — `["banners", "partner-logos", "vehicles"] as const`, and the derived `export type SiteMediaPurpose = (typeof SITE_MEDIA_PURPOSES)[number]`. Every object path is namespaced by one of these (`banners/<uuid>-<safe-name>`), which is the only organisation the bucket gets: Storage has no folders, just key prefixes, and a prefix per purpose is what lets a human browsing the dashboard tell a hero banner from a partner logo. A closed union rather than a free-form string because, unlike `Banner.placement`, nothing about a new prefix needs to be a content change — it needs a code change anyway to render it.
- **`ALLOWED_CONTENT_TYPES`** — `new Set(["image/jpeg", "image/png", "image/webp"])`. WebP is included here and absent from `driver-document-storage.ts` because these are marketing images a designer exports, not phone-camera captures from a driver, and the size saving on a 2400×900 hero is worth having.
- **`UNSUPPORTED_CONTENT_TYPE_ERROR`** — one exported string ("Only JPG, PNG and WebP images are accepted.") so the route's 400 and the component's pre-flight rejection word it identically, exactly as `driver-document-storage.ts` does.
- **`isSupportedSiteMediaContentType(contentType: string): boolean`** — exported so the route can 400 before touching Storage.
- **`createSiteMediaUploadUrl(purpose, fileName, contentType): Promise<{ path; signedUrl; token; publicUrl }>`** — rejects an unsupported content type, builds `path = \`${purpose}/${crypto.randomUUID()}-${toSafeFileName(fileName)}\``, calls `client.storage.from(SITE_MEDIA_BUCKET).createSignedUploadUrl(path)`, then `getPublicUrl(path)` for the URL the form will store. The public URL is resolvable the moment the object lands, so it can be computed up front and handed back with the token — the caller never has to construct it, and never has to guess the project's Storage URL shape.
- **`deleteSiteMedia(publicUrls: string[]): Promise<void>`** — the counterpart to `deleteVehiclePhotos`: map each URL through a private `storagePathFromPublicUrl()` that splits on `` `/storage/v1/object/public/${SITE_MEDIA_BUCKET}/` ``, drop the ones that do not parse (a URL typed in by hand through the escape hatch below will not, and must not throw), return early on an empty list, and `remove(paths)`. Throw on a Storage error so callers can log it.
- **`SITE_MEDIA_CACHE_CONTROL_SECONDS = "31536000"`** — exported, because the *browser* is what sets it (see step 2). Same justification as `supabase-storage.ts`: paths embed a UUID and are never rewritten, so a stored object is immutable and can be cached for a year.

Copy `toSafeFileName`, `UNSAFE_FILE_NAME_CHARS`, the `FALLBACK_FILE_NAME` idea (use `"image"`), and the lazily-cached `getStorageClient()` **including its explanatory comments** from `supabase-storage.ts`. This is deliberate duplication in the shape the repo already has three times over — do not refactor the two existing storage modules into a shared base as part of this task.

#### The SVG decision — document it in the file

Partner logos are the one asset here that would plausibly arrive as an SVG, and the design handoff calls for transparent logo marks at 360×96. **Exclude `image/svg+xml` anyway.** Record the reasoning in a comment on `ALLOWED_CONTENT_TYPES`, matching `driver-document-storage.ts`'s:

An SVG is a document, not an image: it can carry `<script>`, `<foreignObject>` and event handlers, and this bucket is **public**, so every object in it has a stable URL any visitor can open top-level — where the browser executes it as script on the Supabase project's own origin. Storage serves back the `Content-Type` it recorded, so there is no place downstream to neutralise it. Sanitising uploaded SVG properly is a whole dependency and a whole class of bypasses, and the only thing it buys is sharper logos at large sizes — which a 2× or 3× PNG already delivers at 360×96. Content managers must therefore supply partner logos as **transparent PNG**. Say so in the component's helper text (step 4) so it is not discovered as a mystery rejection, and make sure `action-required.md`'s photography line is not contradicted.

A second reason to state: a signed upload URL cannot pin the content type of what is later PUT to it, so this allowlist is advisory at the mint step. `driver-document-storage.ts` closes that hole with `getDriverDocumentContentType()` and a post-upload verification, because a driver document is opened top-level from a signed URL. Here the mitigation is different and simpler — nothing in this bucket is ever linked to directly by the admin or the marketing page; every URL is rendered inside an `<img>`, which does not execute script for any content type. Note that difference explicitly in the module doc comment rather than leaving a reader to wonder why the verification step is missing.

### 2. `src/lib/supabase-browser-client.ts`

`uploadFileToSignedUrl` is hardcoded to the `driver-documents` bucket, so it cannot upload to `site-media` as it stands. Generalise it rather than adding a near-duplicate function — there should stay exactly one place in the codebase that talks to Supabase from the browser:

```ts
/** Storage bucket holding every image the marketing site renders. */
export const SITE_MEDIA_BUCKET = "site-media";

export async function uploadFileToSignedUrl(
  path: string,
  token: string,
  file: File,
  options?: { bucket?: string; cacheControl?: string },
): Promise<void> {
  const { error } = await getBrowserClient()
    .storage.from(options?.bucket ?? DRIVER_DOCUMENT_BUCKET)
    .uploadToSignedUrl(path, token, file, {
      cacheControl: options?.cacheControl,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
}
```

Notes on this edit:

- The fourth parameter is optional and both defaults reproduce today's behaviour exactly, so `document-upload-dialog.tsx`'s existing call site is unchanged and must **not** be edited.
- `SITE_MEDIA_BUCKET` is restated here as a literal rather than imported from `site-media-storage.ts`, because that module is `server-only` and importing it from a `"use client"` file fails the build. `DRIVER_DOCUMENT_BUCKET` is already duplicated for exactly this reason — add a one-line comment saying so, pointing at `src/lib/site-media-storage.ts` as the other copy.
- Keep the file's header comment accurate: it currently says the client exists "only to perform the actual file upload once a route handler has already issued a signed upload URL (see `src/lib/driver-document-storage.ts`)". Widen that sentence to name both storage modules.
- Confirm against the installed `@supabase/supabase-js` (`^2.111.0`) that `uploadToSignedUrl` accepts a fourth `FileOptions` argument; if the installed typings disagree, drop the `cacheControl` pass-through and instead note in your report that objects will be served with Storage's default cache control. Do not add a dependency or upgrade the SDK for this.

### 3. The route: `POST /api/admin/content/media/upload-url`

**`validation.ts`** (sibling module — route modules may only export handlers, and the wire types below are imported type-only by the client component, which cannot import the route):

```ts
/** Request body of `POST /api/admin/content/media/upload-url`. */
export type MediaUploadUrlInput = {
  purpose: SiteMediaPurpose;
  fileName: string;
  contentType: string;
};

/** Response body of the same endpoint. */
export type MediaUploadUrlResponse = {
  /** Storage object key, needed by `uploadToSignedUrl`. */
  path: string;
  /** Single-use upload token, needed by `uploadToSignedUrl`. */
  token: string;
  /** Where the object will be readable once the bytes land. */
  publicUrl: string;
};

export function parseMediaUploadUrlBody(
  body: unknown,
): { data: MediaUploadUrlInput } | { error: string } { … }
```

`parseMediaUploadUrlBody` follows `parseCreateBannerBody` exactly: reject a non-object with `"Request body must be a JSON object."`, cast to `Record<string, unknown>`, then check each field and return the first failure as a sentence naming the field. Rules:

- `purpose` — must be a string in `SITE_MEDIA_PURPOSES`; error names the valid values (`` `purpose must be one of: ${SITE_MEDIA_PURPOSES.join(", ")}.` ``).
- `fileName` — non-empty string, trimmed, capped at 200 characters. It only ever becomes a suffix on a UUID-prefixed key, and `toSafeFileName` strips anything dangerous, so nothing depends on its content — the cap just keeps a pathological key out of the bucket.
- `contentType` — non-empty string, then `isSupportedSiteMediaContentType()`; on failure return `UNSUPPORTED_CONTENT_TYPE_ERROR` verbatim so the browser shows the same sentence its own pre-flight check would have.

Importing the runtime values `SITE_MEDIA_PURPOSES` / `isSupportedSiteMediaContentType` / `UNSUPPORTED_CONTENT_TYPE_ERROR` from the `server-only` storage module is fine here: `validation.ts` is only ever reached from the route.

**`route.ts`:**

```ts
/**
 * Staff who may upload site media. Stated per route rather than imported from
 * one shared constant so the gate on each endpoint can be read — and audited —
 * without following an import.
 */
const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];
```

Handler order:

1. `const authorized = await authorizeAdminApi(ALLOWED_ROLES); if (!authorized.ok) return authorized.response;`
2. Read the body inside `try/catch` → 400 `"Request body must be valid JSON."`
3. `parseMediaUploadUrlBody(rawBody)` → 400 with `parsed.error`.
4. `try { const { path, token, publicUrl } = await createSiteMediaUploadUrl(...) }`, and in the `catch`: `console.error(...)` then **502** `{ error: "Could not prepare the upload. Please try again." }`. Reproduce the driver route's comment naming the expected causes — a `site-media` bucket that has not been created by hand (the expected first-run failure), absent Supabase env vars, or a Storage outage. None is the caller's fault, and none may surface as an unhandled crash, which Next renders as a 500 with no `{ error }` body for the form to show inline.
5. `await writeAuditLog({ actorId: authorized.context.actorId, action: "media.upload_url_issued", entityType: "SiteMedia", entityId: path, metadata: { purpose, fileName, contentType, publicUrl } })` — **after** the URL is minted, so a failed mint writes no row. Not try/caught, per `audit.ts`'s own doc comment.
6. `return NextResponse.json({ path, token, publicUrl } satisfies MediaUploadUrlResponse, { status: 200 });`

`signedUrl` is deliberately **not** in the response: `uploadToSignedUrl(path, token, file)` needs only the path and the token, and the driver route's `signedUrl` is already ignored by its only caller. Do not return a value nothing reads.

`media.upload_url_issued` records intent, not an outcome — the bytes may never arrive, and Storage will never tell this route whether they did. Say that in the handler's doc comment so nobody later reads the audit trail as a list of images that exist.

### 4. `src/components/admin/content/admin-image-upload.tsx`

A `"use client"` component. Both consumers treat it as a controlled field over a single string.

```ts
export type AdminImageUploadProps = {
  /** Which prefix in the bucket the object is filed under. */
  purpose: SiteMediaPurpose; // type-only import — erased, so the server-only module never reaches the bundle
  /** The URL currently stored on the row, or "" when there is none. */
  value: string;
  /** Called with the new public URL, or "" when the image is removed. */
  onChange: (imageUrl: string) => void;
  /** Ties the field to its <Label htmlFor>. */
  id: string;
  /** The parent form is submitting; the whole control goes inert. */
  disabled?: boolean;
};
```

Behaviour:

1. **Preview.** When `value` is non-empty, render it. Use a plain `<img>` with the house comment and `{/* eslint-disable-next-line @next/next/no-img-element */}` — the same pattern as `src/app/admin/(sections)/content/banners/page.tsx`, for the same reason: the URL can point at any host (the escape hatch below allows it) so it cannot be pinned in `remotePatterns` at build time. Give it `object-contain` on a checkerboard-ish neutral background so a transparent partner logo is visible, and an `onError` handler that shows *"This image could not be loaded. If it was just uploaded, check the `site-media` bucket is public."* — that is the exact symptom of a bucket created private, which uploads happily and renders broken.
2. **Choose a file.** A `<Button type="button" variant="outline">` that clicks a visually hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` held in a ref. `type="button"` matters: an unspecified button inside the banner dialog's `<form>` submits it.
3. **Pre-flight rejection**, before any request, mirroring `rejectFile()` in `document-upload-dialog.tsx`: reject a content type outside `["image/jpeg", "image/png", "image/webp"]` (restated as a local literal, with the comment explaining that importing it from the `server-only` storage module would break the build), and reject anything over `MAX_FILE_BYTES = 8 * 1024 * 1024`. Both messages must be actionable ("That file is not a JPG, PNG or WebP image. Choose a different one.").
4. **Upload**, on `"uploading"`: `POST` the JSON `{ purpose, fileName: file.name, contentType: file.type }` to `/api/admin/content/media/upload-url`; on `!response.ok` read `{ error }` off the body (fall back to a generic sentence) and go to `"failed"`; otherwise `await uploadFileToSignedUrl(path, token, file, { bucket: SITE_MEDIA_BUCKET, cacheControl: "31536000" })` and then `onChange(publicUrl)` and return to `"idle"`. Wrap the whole sequence in `try/catch` so a network failure or a throw out of the browser client lands in the same retryable `"failed"` state. Keep the chosen `File` in state so a "Try again" button re-runs the sequence without asking the user to find the file again.
5. **Progress.** `@supabase/supabase-js` v2's `uploadToSignedUrl` exposes **no progress events**. Render an indeterminate busy state — a disabled control, the word "Uploading…", and an animated indeterminate bar if you want one. **Do not fake a percentage**, and do not add XHR-based progress plumbing; an 8 MB cap over a normal connection does not need it.
6. **Remove.** When `value` is non-empty, a "Remove" button that calls `onChange("")`. It clears the field only — see the orphaned-object note below.
7. **Paste a URL instead.** A small `<button type="button">` toggle that reveals a shadcn `<Input>` bound to `value` / `onChange`, so the field degrades to exactly today's behaviour. This is the escape hatch that keeps the admin usable when Storage is unconfigured, when the bucket does not exist yet, or when the image genuinely lives on another host. **Reveal it automatically whenever an upload fails**, so the content manager is not left at a dead end — that is the single most important resilience behaviour in this component.
8. **Never take the page down.** Every failure path in this component ends in rendered text. There is no route in this task whose failure is allowed to surface as an unhandled error, and the component must not throw during render for a missing env var — `getBrowserClient()` throws only when `uploadFileToSignedUrl` is actually called, and that call is already inside the `try`.
9. **Accessibility and copy.** `<Label htmlFor={id}>` is the parent's job; this component owns the controls under it. Put the error in a `<p role="alert" className="text-sm text-destructive">`, as `banner-form-dialog.tsx` does. Include a line of helper text naming the accepted formats and, for `purpose === "partner-logos"`, that logos must be **transparent PNG, not SVG** (see the SVG decision above).

Build it from the shadcn primitives already in `src/components/ui/` (`Button`, `Input`, `Label`) and Tailwind utilities. Do not add a dependency, and do not use `next/image`.

### API Endpoints

- **`POST /api/admin/content/media/upload-url`**
  - Auth: `authorizeAdminApi(["SUPER_ADMIN", "CONTENT_MANAGER"])` → 401 `{ error: "Unauthorized." }` / 403 `{ error: "Forbidden." }`.
  - Request: `{ purpose: "banners" | "partner-logos" | "vehicles", fileName: string, contentType: "image/jpeg" | "image/png" | "image/webp" }`
  - `200`: `{ path: string, token: string, publicUrl: string }`
  - `400`: `{ error: string }` — malformed JSON, non-object body, bad `purpose`, empty/oversized `fileName`, unsupported `contentType`.
  - `502`: `{ error: "Could not prepare the upload. Please try again." }` — Storage unreachable, unconfigured, or the bucket missing.
  - Audit: `media.upload_url_issued` on `SiteMedia`.

### Environment Variables

All four already exist in `env.example` and are used by the driver-document flow. Nothing new is introduced.

- `SUPABASE_URL` — server-side project URL, read by `site-media-storage.ts`.
- `SUPABASE_SERVICE_ROLE_KEY` — server-side service role key. Bypasses row level security; must never reach the browser, so it may only be read from a `server-only` module.
- `NEXT_PUBLIC_SUPABASE_URL` — same value as `SUPABASE_URL`, exposed to the browser.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key used by `supabase-browser-client.ts`.

### Verification

`pnpm check` (lint + typecheck) must pass. Beyond that, exercise the route by hand where a database and Supabase project are available: sign in at `admin.localhost:3000` as a `SUPER_ADMIN` or `CONTENT_MANAGER` and `POST` to the endpoint; confirm 401 when signed out, 403 as another admin role, 400 for `{ "purpose": "nope" }` and for `contentType: "image/svg+xml"`, and a `publicUrl` in the response otherwise. `package.json`'s `"dev": "next dev -H ::"` is load-bearing for the cross-host admin redirects — do not change it, and debug the admin on the `admin.localhost:3000` host.

## Acceptance Criteria

- [ ] `src/lib/site-media-storage.ts` exists, starts with `import "server-only"`, targets the public bucket `site-media`, and uses a lazily-cached service-role client carrying the same explanation of *why* it is lazy as the two existing storage modules.
- [ ] Its content-type allowlist is exactly `image/jpeg`, `image/png`, `image/webp`, and a comment records the decision to exclude `image/svg+xml` — including that it applies to partner logos, which must be supplied as transparent PNG — with the XSS reasoning stated, not merely referenced.
- [ ] Object paths are `\`${purpose}/${uuid}-${safeFileName}\`` with `purpose` drawn from a closed `SITE_MEDIA_PURPOSES` union of `banners` / `partner-logos` / `vehicles`, and the year-long cache control is justified by that immutability in a comment.
- [ ] It exports a signed-upload-URL creator returning `path`, `token` and `publicUrl`, and a delete helper that recovers object paths from public URLs and silently ignores URLs that are not in this bucket.
- [ ] `POST /api/admin/content/media/upload-url` exists, restates `ALLOWED_ROLES` locally as `["SUPER_ADMIN", "CONTENT_MANAGER"]`, calls `authorizeAdminApi` first, parses its body with a hand-rolled `parse*` helper in a sibling `validation.ts`, returns `{ path, token, publicUrl }`, and answers 502 rather than crashing when Storage is unavailable.
- [ ] The route writes `writeAuditLog({ action: "media.upload_url_issued", entityType: "SiteMedia", … })` with the actor from `authorized.context.actorId`, and the call is not wrapped in try/catch.
- [ ] No validation library, no `"use server"`, and no new dependency was added.
- [ ] `src/components/admin/content/admin-image-upload.tsx` is a `"use client"` controlled field over a single URL string, with file picker, preview, indeterminate busy state, an inline `role="alert"` error, a retry that reuses the chosen file, a "Remove" action, and a "paste a URL instead" input that is revealed automatically after any failure.
- [ ] With Supabase unconfigured (env vars removed, or the bucket absent), the admin page still renders, the upload fails with a readable inline message, and the URL escape hatch appears — nothing throws during render and no page 500s.
- [ ] `uploadFileToSignedUrl` in `src/lib/supabase-browser-client.ts` can target `site-media` without altering behaviour for `document-upload-dialog.tsx`, whose call site is unchanged.
- [ ] `src/components/admin/content/banner-form-dialog.tsx` is untouched (task-12 owns it) and no vehicle-photo admin page or route was created (task-13 owns those).
- [ ] `pnpm check` passes.

## Notes

- **The `site-media` bucket is created by hand, and must be PUBLIC.** Supabase dashboard → Storage → New bucket → name `site-media` → tick "Public bucket". This is tracked in `specs/georgia-homepage-redesign/action-required.md` as a "Before Implementation" step, alongside the follow-up check that an uploaded URL loads in a private window. Buckets are never provisioned in code in this project — `vehicle-photos` and `driver-documents` were both created the same way. Until it exists, the route mints nothing and answers 502 with the message above; that is the intended first-run behaviour, not a bug to code around.
- **Orphaned objects are accepted, exactly as in the driver-document flow.** Issuing an upload URL neither creates nor reserves a database row, so an upload that is started and abandoned — or an image replaced in a form that is then cancelled — leaves an object nothing points at. The database row is the source of truth; an orphan is a tidiness problem, not a correctness one. Say this in the route's doc comment. `deleteSiteMedia()` is provided for task-12/task-13 to call when a row that owned an image is deleted, and will have **no caller until then** — that is expected, and not dead code to remove.
- **Nothing about `Banner` changes.** `Banner.imageUrl` is already a plain `String`; this task changes only *how a value gets into it*. There is no Prisma migration in this task — the feature's single schema change is task-03's `VehicleTypeSpec.imageUrl`, running in parallel in this same wave. Do not edit `prisma/schema.prisma`.
- **Do not add an `/admin/content/media` nav entry.** Admin IA is declared once in `src/components/admin/admin-nav.ts` and read by both the sidebar and each section `layout.tsx`. This task ships a route and a component, not a page — the uploader appears inside the existing Banners and (new) Vehicle Photos screens, and adding a stray nav item would surface a page that does not exist.
- **Image dimensions, for the helper text.** Planning settled on 6 hero banners at 2400×900, up to 8 partner logos at 360×96, 11 vehicle photos at 720×560, and one driver photo at 1200×1000. The 8 MB cap is comfortably above all of them. The page renders correctly with none of them present, so missing photography does not block this task.
