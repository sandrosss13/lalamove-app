# Task 13: Admin surface for vehicle type photos

## Status

complete

## Wave

2

## Description

The redesigned vehicles section is photo-led: each vehicle type renders as a card with a 140px-tall
image area and its name underneath, and nothing else — no prices, no specs. task-03 adds
`VehicleTypeSpec.imageUrl` and carries it through `/api/vehicle-types`, but **nothing in the admin can
set it**. There is no admin vehicles page at all today; `VehicleTypeSpec` rows are created only by
`prisma/seed.ts`. Without this task the photo column exists and stays permanently null, and the
vehicles section renders its fallback glyphs forever.

This task adds one narrow leaf page under Content Management that lists all 11 vehicle types grouped
by duty class and lets a content manager attach or replace a photo per type, using task-04's uploader.
It touches `imageUrl` and nothing else — the rest of `VehicleTypeSpec` is operational data that drives
vehicle matching and pricing, and must not become editable by a content role as a side effect of
adding a photo picker.

## Dependencies

**Depends on:** task-03-vehicle-photo-schema.md, task-04-media-upload-infra.md
**Blocks:** task-15-seed-initial-content.md

**Context from dependencies:**

**task-03** adds `imageUrl String?` to the `VehicleTypeSpec` model in `prisma/schema.prisma` (the
model is at line 344), creates the migration under `prisma/migrations/`, and carries the field through
the public `GET /api/vehicle-types` route and
`src/components/landing/landing-vehicle-types.ts` (the module-level-deduped client fetch of the
taxonomy). After task-03 the model is:

```prisma
model VehicleTypeSpec {
  id                String            @id @default(cuid())
  code              String            @unique
  label             String
  category          VehicleCategory   // MEDIUM_DUTY | HEAVY_DUTY — only two values
  maxPayloadKg      Float
  cargoLengthM      Float
  cargoWidthM       Float
  cargoHeightM      Float             // 0 means "open / no height limit"
  loadingAccessType LoadingAccessType
  imageUrl          String?           // added by task-03
  pricingRule       PricingRule?
  vehicles          Vehicle[]
  orders            Order[]
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
}
```

`prisma/seed.ts` seeds exactly 11 rows and is idempotent (`upsert where: { code }`):

- `MEDIUM_DUTY` — `MINIVAN` "Minivan", `MPV` "MPV / Estate", `CARGO_VAN` "Cargo Van",
  `CLOSED_BOX_VAN` "Closed Box Van", `REFRIGERATED_VAN` "Refrigerated Van"
- `HEAVY_DUTY` — `BOX_TRUCK` "Box Truck", `FLATBED_TRUCK` "Flatbed Truck", `CURTAINSIDER_TRUCK`
  "Curtainsider Truck", `REFRIGERATED_TRUCK` "Refrigerated Truck", `LARGE_FREIGHT_TRUCK` "Large
  Freight Truck", `TRAILER_TRUCK` "Trailer Truck"

**task-04** adds:

- `src/lib/site-media-storage.ts` — server-only helper over the public Supabase bucket `site-media`
  (created by hand in the dashboard; see `action-required.md`).
- `POST /api/admin/content/media/upload-url` — guarded by `authorizeAdminApi`, returns
  `{ path, token, publicUrl }`; the browser uploads bytes directly to Supabase with
  `uploadFileToSignedUrl(path, token, file)` from `src/lib/supabase-browser-client.ts`, which is how
  this project bypasses the route-handler body limit.
- `src/components/admin/content/admin-image-upload.tsx` — a reusable `"use client"` controlled
  component over a single image URL: file picker, preview, progress, error, a "paste a URL instead"
  escape hatch, and graceful degradation to URL-only when Storage is unconfigured.

**Read `admin-image-upload.tsx` and use its real prop names** — expect something in the shape of
`value: string`, `onChange: (url: string) => void`, plus a label/hint. Do not guess.

This task does not touch any landing component. task-09 (same wave) owns the vehicles section that
renders these photos; it reads them from `/api/vehicle-types`, so the two never share a file.

## Files to Create

- `src/app/admin/(sections)/content/vehicle-photos/page.tsx` — `"use client"` leaf page listing all
  vehicle types grouped by duty class, one `AdminImageUpload` per row.
- `src/app/api/admin/content/vehicle-photos/route.ts` — `GET`: every vehicle type with its current
  photo, in a stable order. Exports the row and response types the page imports type-only.
- `src/app/api/admin/content/vehicle-photos/[id]/route.ts` — `PATCH`: set or clear one type's
  `imageUrl`, and nothing else.

## Files to Modify

- `src/components/admin/admin-nav.ts` — add the leaf to the `content` section's `items`. The admin IA
  is declared exactly once in this file and read by both the sidebar (`ADMIN_NAV`) and each section's
  `layout.tsx` (via `adminNavSection(id)`), so this one edit registers the tab in both places. Nothing
  else needs changing: `src/app/admin/(sections)/content/layout.tsx` renders
  `<AdminSectionLayout sectionId="content">`, which builds the tab strip from this list.

## Technical Details

### House rules this task must follow

- **No server actions.** `"use server"` appears nowhere in this repo, and neither does
  `revalidatePath`/`revalidateTag`. The page is `"use client"`, `fetch`es the REST route, and after a
  mutation bumps a local `reloadToken` counter to re-run the list fetch.
- **No validation library.** Hand-rolled parsing returning `{ data } | { error }` → 400.
- Both routes restate their gate locally:
  `const ALLOWED_ROLES: readonly AdminRole[] = ["SUPER_ADMIN", "CONTENT_MANAGER"];` then
  `const authorized = await authorizeAdminApi(ALLOWED_ROLES); if (!authorized.ok) return authorized.response;`
  Restated per file on purpose so each endpoint's gate is readable without following an import.
- The mutation calls `writeAuditLog({ … })`, deliberately not try/caught.
- The page imports its row type *type-only* from the route that produces it, so table and API cannot
  drift.

**The closest existing analogue is `/admin/finance/payment-methods`** — a fixed set of rows, no
create, no delete, one field per row to change. Read
`src/app/api/admin/finance/payment-methods/route.ts` and
`src/app/api/admin/finance/payment-methods/[type]/route.ts` before starting; this task's routes are
the same shape with a different gate and a different column.

### 1. `GET /api/admin/content/vehicle-photos`

```ts
/**
 * One vehicle type as the photo manager renders it.
 *
 * Deliberately narrow: payload, dimensions, loading access and the pricing rule
 * are all absent, because this surface neither shows nor edits them. Shipping
 * them to the browser would invite the next change to make them editable here,
 * which is exactly what this endpoint exists not to do.
 */
export type AdminVehiclePhotoRow = {
  id: string;
  code: string;
  label: string;
  category: VehicleCategory;
  imageUrl: string | null;
};

export type AdminVehiclePhotoListResponse = {
  items: AdminVehiclePhotoRow[];
};
```

Query: `prisma.vehicleTypeSpec.findMany({ orderBy: [{ category: "asc" }, { label: "asc" }], select: { id: true, code: true, label: true, category: true, imageUrl: true } })`.

Postgres sorts an enum column by *declaration* order, so `category: "asc"` yields `MEDIUM_DUTY` before
`HEAVY_DUTY` — the same order the seed and the booking picker present. Say so in a comment; it reads
like alphabetical order by accident and someone will otherwise "fix" it.

Unpaginated, and no filtering: there are eleven rows and the whole point of the page is seeing them all
at once.

### 2. `PATCH /api/admin/content/vehicle-photos/[id]`

Body: `{ imageUrl: string | null }` — nothing else.

**This is the guardrail that justifies a separate endpoint, and it must be explicit in the code and in
its comments:**

> `VehicleTypeSpec` carries operational data. `label` appears in the booking picker and on orders;
> `category` decides which cargo categories may select the vehicle; `maxPayloadKg` and the three cargo
> dimensions drive matching; `loadingAccessType` is a capability claim shown to clients; the 1-1
> `PricingRule` is what `src/lib/pricing.ts` charges. A `CONTENT_MANAGER` sets marketing photography,
> not the fleet's physical specification or its rates. This endpoint therefore writes exactly one
> column and refuses a request that mentions any other.

Implementation:

```ts
function parseUpdateBody(
  body: unknown,
): { data: { imageUrl: string | null } } | { error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const record = body as Record<string, unknown>;

  // Rejected rather than ignored: a caller sending `label` or `maxPayloadKg`
  // has misunderstood what this endpoint does, and silently dropping the field
  // would let them believe it landed. See the note above on why only `imageUrl`
  // is writable here.
  const unexpected = Object.keys(record).filter((key) => key !== "imageUrl");
  if (unexpected.length > 0) {
    return {
      error:
        `This endpoint only sets imageUrl. Unexpected field(s): ${unexpected.join(", ")}. ` +
        "Vehicle specifications and pricing are changed through the seed, not the back office.",
    };
  }

  const { imageUrl } = record;

  // Null clears the photo — a legitimate action, and the only way back to the
  // fallback glyph on the public page.
  if (imageUrl === null) {
    return { data: { imageUrl: null } };
  }

  if (typeof imageUrl !== "string" || imageUrl.trim() === "") {
    return { error: "imageUrl must be a non-empty string, or null to clear it." };
  }
  if (imageUrl.trim().length > MAX_URL_LENGTH) {
    return { error: `imageUrl must be ${MAX_URL_LENGTH} characters or fewer.` };
  }
  if (!isUsableUrl(imageUrl.trim())) {
    return { error: "imageUrl must be an http(s) URL or a path starting with /." };
  }

  return { data: { imageUrl: imageUrl.trim() } };
}
```

`MAX_URL_LENGTH = 2048` and `isUsableUrl` are restated here, matching
`src/app/api/admin/content/banners/route.ts:105-127` verbatim — root-relative paths allowed, a leading
`//` rejected as protocol-relative, everything else must parse as `http:`/`https:`. That check is what
keeps `javascript:` and `data:` out of an `src` on the public page, and this URL is rendered publicly
for the same reason a banner's is. Copy it with its comment.

Read before write, so a row deleted or renamed out from under the page is a clean `404` rather than a
Prisma "record not found" exception:

```ts
const existing = await prisma.vehicleTypeSpec.findUnique({
  where: { id },
  select: { id: true, code: true, label: true, category: true, imageUrl: true },
});
if (!existing) {
  return NextResponse.json({ error: "Vehicle type not found." }, { status: 404 });
}
```

Then `prisma.vehicleTypeSpec.update({ where: { id }, data: { imageUrl: parsed.data.imageUrl }, select: { … } })`
— `data` names the one column literally, so a future edit cannot widen it by spreading a parsed object.

Audit:

```ts
await writeAuditLog({
  actorId: authorized.context.actorId,
  action: "vehicle_type_photo.update",
  entityType: "VehicleTypeSpec",
  entityId: existing.id,
  // Both ends recorded: this is the only trace of which photo a type used to
  // carry once the column is overwritten.
  metadata: {
    code: existing.code,
    previousImageUrl: existing.imageUrl,
    imageUrl: parsed.data.imageUrl,
  },
});
```

Respond `{ vehicleType: AdminVehiclePhotoRow }` with `200`.

**Path parameter:** `[id]`, the cuid — consistent with every other `[id]` route in the back office
(`banners/[id]`, `pages/[id]`, `home-page-sections/[id]`) and with what the audit log records.
(`payment-methods/[type]` keys on an enum only because that model has no other stable identity.)
Signature is the App Router's async form: `{ params }: { params: Promise<{ id: string }> }`, then
`const { id } = await params;`.

### 3. The page — `/admin/content/vehicle-photos`

`"use client"`, structured like `src/app/admin/(sections)/content/banners/page.tsx`:

- `useEffect` + `AbortController` load of `GET /api/admin/content/vehicle-photos`, keyed on
  `reloadToken`, with the same `readErrorMessage(response, fallback)` helper the other content pages
  define (copy it; it is restated per page in this codebase, not shared).
- Group the returned items by `category` into two labelled blocks — **Medium duty** and **Heavy duty**
  — in that order. Use a `Record<VehicleCategory, string>` label map, the same way
  `banners/page.tsx` maps `ContentLocale` to "Georgian"/"English". A card grid or a table both work;
  each row needs the label, the `code` in `font-mono text-xs` (the code is what appears in the API and
  in the seed, so showing it makes the row identifiable), the current photo, and the uploader.
- One `AdminImageUpload` per row. On change, `PATCH` that row immediately with the new URL and bump
  `reloadToken`. Track pending state **per row** (`pendingId`, as `banners/page.tsx` does) — eleven
  rows sharing one `busy` flag would lock the whole page during any upload.
- A **Remove photo** button per row that has one, sending `{ imageUrl: null }`, with a confirmation
  that says the card falls back to its illustrated glyph on the public page. No dialog is required;
  this is reversible and destroys nothing.
- Per-row error reporting: a failed `PATCH` shows the API's `{ error }` next to that row, not as a
  page-level banner, so it is obvious which type failed.
- Empty state: if `items` is empty, the database has never been seeded — say so, and name the command
  (`pnpm exec prisma db seed`). Do not render an empty grid with no explanation.
- A short page blurb: these photos appear on the public homepage's vehicle catalogue; only the photo is
  editable here, because payload ratings, dimensions and pricing drive matching and are not content.

### 4. The nav entry

In `src/components/admin/admin-nav.ts`, inside the `content` section's `items` array, after
`"Home Page"`:

```ts
{
  label: "Vehicle Photos",
  href: "/admin/content/vehicle-photos",
  adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
},
```

The section's own `adminRoles` are already `["SUPER_ADMIN", "CONTENT_MANAGER"]`, so the item's roles
are a subset — the invariant the file's type doc states (an item may narrow, never widen). Nothing
else in that file changes.

Note the file's header comment says the IA is "intentionally finished ... for this spec" — that refers
to `specs/admin-back-office`. Adding a leaf for a later spec is exactly the edit that comment
anticipates; the reason it exists is to stop *parallel tasks within one wave* fighting over the file,
and no other task in this wave touches it. Leave the comment as it is.

### API Endpoints

- `GET /api/admin/content/vehicle-photos` → `200 { items: AdminVehiclePhotoRow[] }` (all 11, medium
  duty first), `401`/`403` from `authorizeAdminApi`.
- `PATCH /api/admin/content/vehicle-photos/[id]` — body `{ imageUrl: string | null }` →
  `200 { vehicleType: AdminVehiclePhotoRow }`; `400` on a bad or extraneous field; `404` for an unknown
  id.

## Acceptance Criteria

- [ ] `/admin/content/vehicle-photos` appears as a tab in Content Management and in the sidebar, for
      `SUPER_ADMIN` and `CONTENT_MANAGER` only.
- [ ] The page lists all 11 seeded vehicle types, grouped `MEDIUM_DUTY` (5) then `HEAVY_DUTY` (6),
      each with its code, label and current photo.
- [ ] Uploading a file on one row stores the public URL in `VehicleTypeSpec.imageUrl` and the new photo
      is visible after the list reloads; pasting a URL does the same.
- [ ] Removing a photo sets the column back to `null`.
- [ ] `PATCH` with a body containing `label`, `category`, `maxPayloadKg`, any cargo dimension or a
      pricing field returns `400` and changes nothing; verify with `curl`/REST client, not just the UI.
- [ ] Every successful `PATCH` writes an `AuditLog` row with action `vehicle_type_photo.update`,
      entityType `VehicleTypeSpec`, and metadata carrying `code`, `previousImageUrl` and `imageUrl`.
- [ ] A signed-in `FINANCE_MANAGER` (or any non-content role) gets `403` from both endpoints and does
      not see the tab.
- [ ] `GET /api/vehicle-types` returns the new `imageUrl` for a row that has one (task-03's wiring,
      re-verified here because it is what the public page consumes).
- [ ] `pnpm check` (lint + typecheck) passes.

## Notes

- **A photo goes live the moment it is saved.** `GET /api/vehicle-types` is public, unauthenticated
  and an unfiltered `findMany()` — there is no draft or feature-flag state for a `VehicleTypeSpec`
  (`prisma/seed.ts:243-249` makes the same point about rates). Say so in the page blurb so nobody
  uploads a work-in-progress crop expecting to publish it later.
- **Clearing a photo does not delete the stored object.** The `site-media` bucket keeps the file and the
  column goes null, which is exactly how `Banner.imageUrl` behaves today. Orphaned objects in a public
  bucket are an accepted cost here; a storage tidy-up is out of scope for this feature and should not be
  invented as part of this task.
- Use a plain `<img>` for the thumbnail with the `// eslint-disable-next-line @next/next/no-img-element`
  comment, exactly as `banners/page.tsx:291-302` does, and for the same reason: the URL is supplied by a
  content editor and can point at any host, so it cannot be pinned in `next.config`'s `remotePatterns`
  at build time.
- The design handoff shows a 140px-tall image area on each card and suggests ~720×560 source images;
  put that guidance in the page as a hint so uploads are consistently proportioned.
  `action-required.md` already asks a human to supply 11 vehicle photos at 720×560.
- Upload fails at runtime until a human creates the public `site-media` bucket in the Supabase
  dashboard (`action-required.md`, "Before Implementation"). Buckets are never provisioned in code in
  this project. task-04's component degrades to URL-only when Storage is unconfigured, so the page is
  still usable and this does not block the task.
- The back office is served from `admin.localhost:3000`. `package.json`'s `"dev": "next dev -H ::"` is
  load-bearing — without `-H ::` the cross-host redirects collapse into `ERR_TOO_MANY_REDIRECTS`.
