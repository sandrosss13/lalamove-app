# Task 10: Content management — Home page composition

## Status

complete

## Wave

4

## Description

Lets staff compose and reorder the public landing page's sections (`HomePageSection` rows — hero, vehicle types, how-it-works, FAQ, CTA, etc.) instead of the content being hardcoded in `src/components/landing/*` as it is today, and wires active `Banner`s (from task-06) into the rendered page by `placement`. This is the task that makes task-06's and this task's own admin work actually visible on the public site.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md, task-06-content-banners.md
**Blocks:** None.

**Context from dependencies:** task-01 added `HomePageSection` (`type`, `locale: ContentLocale`, `sortOrder`, `isActive`, `content: Json`). task-06 added the `Banner` model's admin CRUD (this task only *reads* `Banner` rows, it does not modify task-06's files). task-02 provides the admin guard/audit helpers, shadcn primitives, and the `/admin/content/*` tab layout (already links to `/admin/content/home-page`). The existing public landing page lives at `src/app/home/page.tsx` (or wherever `LandingPage`/`landing-page.tsx` is currently rendered from — confirm the exact route before editing) and composes the components under `src/components/landing/` (`landing-hero.tsx`, `landing-category-tiles.tsx`, `landing-vehicle-types.ts`, `landing-how-it-works.tsx`, `landing-faq.tsx`, etc.) with hardcoded content today.

## Files to Create

- `src/app/admin/(sections)/content/home-page/page.tsx` — ordered list (drag-to-reorder is nice-to-have; up/down buttons are an acceptable minimum) of `HomePageSection` rows per locale tab, with active toggle and an edit action per row.
- `src/components/admin/content/home-page-section-form-dialog.tsx` — form: `type` select (constrained to the known types below, not free text, since each type's `content` shape is different and the public renderer only knows how to handle these), a JSON/structured editor for `content` scoped to the selected type (simplest correct approach: one small sub-form per `type`, switched on the select — e.g. hero gets headline/subtext/CTA-label/CTA-href fields; faq gets a repeatable question/answer list), active toggle, sort order.
- `src/app/api/admin/content/home-page-sections/route.ts` — `GET` (list per locale) and `POST` (create).
- `src/app/api/admin/content/home-page-sections/[id]/route.ts` — `PATCH` (update, including reorder) and `DELETE`.
- `src/lib/admin/home-page-content.ts` — the shared `type` enum/union and per-type `content` shape (TypeScript types + a small Zod-or-manual validator), imported by both the admin form and the public renderer so the two never drift on what a given section `type`'s `content` looks like.

## Files to Modify

- The existing landing page route/component (locate it first — likely `src/app/home/page.tsx` and/or `src/components/landing/landing-page.tsx`) — change it to: (1) fetch active, locale-matched `HomePageSection` rows ordered by `sortOrder`, and for each, render the matching existing `src/components/landing/*` component passing that row's `content` as props instead of the component's current hardcoded content; (2) fetch active `Banner` rows for the `home_hero`/`home_secondary` placements (per task-06's convention) and render them in the appropriate slot. Keep each landing component's existing visual design — only change where its content comes from (props from `HomePageSection.content` instead of hardcoded values). If a component's current prop shape doesn't cleanly map to a `HomePageSection.content` shape, adjust that component's props minimally rather than restructuring its rendering.

## Technical Details

### Implementation Steps

1. Read every file under `src/components/landing/` first to inventory what's currently hardcoded, before designing `content` shapes — this task's `home-page-content.ts` types must match what those components actually need as props, not a generic guess.
2. Known `type` values (map 1:1 to existing landing components — adjust names if the actual component set differs from what's listed here after step 1): `hero`, `category_tiles`, `vehicle_types`, `how_it_works`, `faq`, `driver_cta`.
3. Admin routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CONTENT_MANAGER"])`. The public landing page route itself needs no auth (unchanged).
4. `writeAuditLog` on create/update/delete, `action: "home_page_section.create" | "home_page_section.update" | "home_page_section.delete" | "home_page_section.reorder"`, `entityType: "HomePageSection"`.
5. If no `HomePageSection` rows exist yet for a locale (fresh install, before `action-required.md`'s "populate initial content" step is done), the public landing page must not crash or render blank — fall back to the component's current hardcoded defaults in that case (keep the existing hardcoded content as the fallback rather than deleting it).

### API Endpoints

- `GET /api/admin/content/home-page-sections?locale=<KA|EN>`
- `POST /api/admin/content/home-page-sections`
- `PATCH /api/admin/content/home-page-sections/[id]` — also used for reorder (`{ sortOrder }`).
- `DELETE /api/admin/content/home-page-sections/[id]`

## Acceptance Criteria

- [ ] Staff can add, reorder, edit, deactivate, and delete home page sections per locale from `/admin/content/home-page`.
- [ ] The public landing page renders sections from `HomePageSection` data (locale- and active-filtered, in `sortOrder`), falling back to existing hardcoded content when no rows exist yet.
- [ ] Active banners for the `home_hero`/`home_secondary` placements (from task-06) render on the public landing page.
- [ ] The landing page's existing visual design/styling is unchanged — only the content source changed.
- [ ] Non-`CONTENT_MANAGER`/`SUPER_ADMIN` roles get `403` from the admin routes.
- [ ] `pnpm check` passes.

## Notes

- This task touches shared, currently-hardcoded public-facing components — read them fully before changing anything, and keep diffs to "where content comes from," not a redesign.
