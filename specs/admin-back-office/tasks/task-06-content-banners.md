# Task 06: Content management — Banners

## Status

complete

## Wave

4

## Description

CRUD admin UI for `Banner` rows — promotional image slots placed on the public site (starting with the landing page's hero/secondary slots, wired up in task-10). Staff can create/edit/delete banners per locale, set an active window (`startsAt`/`endsAt`), reorder them, and toggle visibility.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** task-10-content-homepage.md (which renders live banners on the public landing page).

**Context from dependencies:** task-01 added the `Banner` model (`title`, `locale: ContentLocale`, `imageUrl`, `linkUrl?`, `placement`, `sortOrder`, `isActive`, `startsAt?`, `endsAt?`). task-02 provides `requireSystemUser()`/`hasAdminRole()`, `writeAuditLog()`, the shadcn primitives, and the `/admin/content/*` tab layout (`src/app/admin/(sections)/content/layout.tsx`) which already links to `/admin/content/banners` — this task only adds that leaf page, it does not touch the layout.

## Files to Create

- `src/app/admin/(sections)/content/banners/page.tsx` — table of banners (thumbnail, title, locale, placement, active window, active toggle), "New Banner" button, per-row edit/delete.
- `src/components/admin/content/banner-form-dialog.tsx` — shadcn `dialog` with a form: title, locale select (`KA`/`EN`), image URL (or upload — see Notes), link URL, placement (free-text input, since `placement` is a convention-based free-form key per task-01's schema comment — list the known values `home_hero`/`home_secondary` as datalist/select suggestions but allow free text so new placements don't need a code change), sort order, active toggle, start/end date pickers.
- `src/app/api/admin/content/banners/route.ts` — `GET` (list) and `POST` (create).
- `src/app/api/admin/content/banners/[id]/route.ts` — `PATCH` (update) and `DELETE`.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. All routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CONTENT_MANAGER"])`.
2. Standard Prisma CRUD against `prisma.banner`. List ordered by `sortOrder asc, createdAt desc`.
3. `writeAuditLog` on create/update/delete with `action: "banner.create" | "banner.update" | "banner.delete"`, `entityType: "Banner"`.
4. Image handling: this project already has a Supabase Storage integration (`src/lib/supabase-storage.ts`, used for driver vehicle photos). Reuse that pattern for banner image upload rather than requiring staff to paste an external URL — check `src/lib/supabase-storage.ts` and the existing vehicle-photo upload API route for the exact pattern (bucket name, signed URL vs. public URL) before implementing. If reuse turns out not to fit cleanly, a plain "image URL" text field is an acceptable fallback — note which you chose in your final report.

### API Endpoints

- `GET /api/admin/content/banners`
- `POST /api/admin/content/banners` — body matches `Banner`'s create shape.
- `PATCH /api/admin/content/banners/[id]`
- `DELETE /api/admin/content/banners/[id]`

## Acceptance Criteria

- [ ] Staff can create, edit, and delete a banner from `/admin/content/banners`.
- [ ] The active toggle and start/end dates are editable and persisted.
- [ ] Non-`CONTENT_MANAGER`/`SUPER_ADMIN` roles get `403` from all four routes.
- [ ] Every mutation writes an `AuditLog` row.
- [ ] `pnpm check` passes.

## Notes

- task-10 (home page management) is what actually *renders* active banners on the public site by `placement` — this task only manages the data.
