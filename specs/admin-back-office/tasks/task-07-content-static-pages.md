# Task 07: Content management — Static pages

## Status

pending

## Wave

4

## Description

CRUD admin UI for `StaticPage` rows (Terms, Privacy, About, etc.) and the public-facing route that renders a published page by slug/locale. Today these pages don't exist on the site at all; this task both gives staff an editor and makes the content actually reachable publicly.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** None.

**Context from dependencies:** task-01 added `StaticPage` (`slug`, `locale: ContentLocale`, `title`, `bodyHtml`, `isPublished`, unique on `[slug, locale]`). task-02 provides the admin guard/audit helpers, shadcn primitives, and the existing `/admin/content/*` tab layout (already links to `/admin/content/pages`).

## Files to Create

- `src/app/admin/(sections)/content/pages/page.tsx` — table of static pages (slug, locale, title, published status, updated date), "New Page" button, per-row edit/delete.
- `src/components/admin/content/static-page-form-dialog.tsx` — form: slug, locale select, title, body (a simple `textarea` accepting HTML/Markdown-as-HTML is acceptable — a full rich-text editor is out of scope for this task; note the choice in your final report), published toggle.
- `src/app/api/admin/content/pages/route.ts` — `GET` (list) and `POST` (create).
- `src/app/api/admin/content/pages/[id]/route.ts` — `PATCH` and `DELETE`.
- `src/app/(public)/pages/[slug]/page.tsx` — public route rendering a published `StaticPage` by slug for the current locale (locale resolution: reuse whatever mechanism task-08's translation work establishes if it has landed, otherwise default to `EN` and accept a `?locale=` query param as a stopgap — do not block this task on task-08, they're both Wave 4 and may land in either order). Returns Next.js `notFound()` for an unpublished or missing slug/locale combination.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. Admin routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CONTENT_MANAGER"])`. The public route needs no auth.
2. Standard Prisma CRUD against `prisma.staticPage`, uniqueness enforced by the existing `@@unique([slug, locale])` — surface a friendly `409`-style error in the form if a create/update violates it (catch the Prisma unique-constraint error, `P2002`).
3. `bodyHtml` is rendered with `dangerouslySetInnerHTML` on the public route since it's admin-authored (trusted) content, not user-submitted — this is the same trust boundary as any other CMS body field; still worth a one-line comment in the component noting *why* it's safe here (author is a vetted `SystemUserProfile`, not a public user).
4. `writeAuditLog` on create/update/delete, `action: "static_page.create" | "static_page.update" | "static_page.delete"`, `entityType: "StaticPage"`.

### API Endpoints

- `GET /api/admin/content/pages`
- `POST /api/admin/content/pages`
- `PATCH /api/admin/content/pages/[id]`
- `DELETE /api/admin/content/pages/[id]`

## Acceptance Criteria

- [ ] Staff can create/edit/delete a static page per locale from `/admin/content/pages`.
- [ ] A published page is reachable at `/pages/[slug]` and renders its `bodyHtml`.
- [ ] An unpublished or nonexistent page 404s on the public route.
- [ ] Creating a duplicate `[slug, locale]` pair shows a clear error instead of a raw 500.
- [ ] Non-`CONTENT_MANAGER`/`SUPER_ADMIN` roles get `403` from the admin routes.
- [ ] `pnpm check` passes.
