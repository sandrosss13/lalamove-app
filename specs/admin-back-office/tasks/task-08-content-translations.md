# Task 08: Content management — Translations

## Status

complete

## Wave

4

## Description

CRUD admin UI for `TranslationEntry` rows (Georgian + English key/value pairs, grouped by `namespace`), and a small server-side helper other code can use to look up a translated string. The site has no i18n infrastructure at all today (everything is hardcoded English in the landing/dashboard components) — this task makes translations *manageable as data*, but does not rewrite every existing component to consume them (that would be a much larger, separate migration; see Notes).

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** None.

**Context from dependencies:** task-01 added `TranslationEntry` (`namespace`, `key`, `locale: ContentLocale`, `value`, unique on `[namespace, key, locale]`). task-02 provides the admin guard/audit helpers, shadcn primitives, and the `/admin/content/*` tab layout (already links to `/admin/content/translations`).

## Files to Create

- `src/app/admin/(sections)/content/translations/page.tsx` — table grouped/filterable by `namespace`, showing each `key` with its `KA` and `EN` values side by side in one row (editable inline or via a row dialog — implementer's choice), plus a "New Key" action.
- `src/components/admin/content/translation-form-dialog.tsx` — form: namespace, key, `KA` value, `EN` value (create/update both locale rows for a key in one submit, since the UI groups by key).
- `src/app/api/admin/content/translations/route.ts` — `GET` (list, filterable by `?namespace=`) and `POST` (create/upsert both locale rows for a key).
- `src/app/api/admin/content/translations/[id]/route.ts` — `PATCH` (update a single locale row's value) and `DELETE` (delete a single locale row — deleting a whole key across both locales is just two calls from the UI).
- `src/lib/translations.ts` — `getTranslation(namespace: string, key: string, locale: "KA" | "EN"): Promise<string | null>` reading `prisma.translationEntry`, for any future code that wants to consume managed translations. Not wired into any existing page by this task.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. Admin routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CONTENT_MANAGER"])`.
2. `POST` (create key) takes `{ namespace, key, valueKa, valueEn }` and does two `prisma.translationEntry.upsert` calls (one per locale) inside a transaction, keyed on the existing `@@unique([namespace, key, locale])`.
3. `writeAuditLog` on create/update/delete, `action: "translation.create" | "translation.update" | "translation.delete"`, `entityType: "TranslationEntry"`.
4. `getTranslation` is a plain read helper — no caching layer in this task (that's a reasonable future optimization, not required for correctness at this scale).

### API Endpoints

- `GET /api/admin/content/translations?namespace=<optional>`
- `POST /api/admin/content/translations` — body `{ namespace, key, valueKa, valueEn }`.
- `PATCH /api/admin/content/translations/[id]` — body `{ value }`.
- `DELETE /api/admin/content/translations/[id]`

## Acceptance Criteria

- [ ] Staff can create a translation key with both `KA` and `EN` values in one action from `/admin/content/translations`.
- [ ] Staff can edit either locale's value independently afterward.
- [ ] Staff can delete a translation entry.
- [ ] Filtering by namespace works.
- [ ] Non-`CONTENT_MANAGER`/`SUPER_ADMIN` roles get `403` from the admin routes.
- [ ] `pnpm check` passes.

## Notes

- Actually internationalizing the existing UI (landing page, dashboards, emails) to read from `TranslationEntry`/`getTranslation` instead of hardcoded strings is explicitly **not** part of this task — it's a much larger, separate effort (every existing component would need to change) and was not part of the scope the user confirmed. This task's job is making translation content manageable; consuming it site-wide is a natural follow-up spec.
