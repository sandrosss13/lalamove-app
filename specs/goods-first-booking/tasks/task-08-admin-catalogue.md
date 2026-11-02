# Task 08: Admin editor for the item catalogue

## Status

complete

## Wave

2

## Description

Admins can list, create, edit, reorder and deactivate `ItemCatalogEntry` rows from the back office. Deactivate, never delete: `OrderItem` snapshots survive either way, but deactivation keeps the code reserved.

## Dependencies

**Depends on:** task-01
**Blocks:** none

## Files to Modify

- `src/app/[locale]/admin/(sections)/content/item-catalogue/page.tsx` — new (confirm `content` is the right section; vehicle-type media is managed nearby)
- `src/app/api/admin/content/item-catalogue/route.ts` and `[code]/route.ts` — new
- Admin nav entry — wherever `content` subsections are listed
- `src/messages/en/admin.json`, `src/messages/ka/admin.json`

## Technical Details

### Implementation Steps

1. **Read** an existing admin content CRUD end to end. The vehicle-type image manager or the banners editor are good references. Copy:
   - the auth guard (`AdminRole` check)
   - `AuditLog` writes
   - the table and form components
   - error handling
   - `router.refresh()` after mutations

2. **List:** grouped by `ItemGroup`, ordered by `sortOrder`, with an "Inactive" filter. Columns: label (en/ka), kg, L×W×H, flags.

3. **Form:** every `ItemCatalogEntry` field except `id`/timestamps. `code` is editable on create only.

   Validation:
   - figures within `CARGO_MEASUREMENT_BOUNDS` (minimum 0.1 m; the seeded rows comply)
   - a helper line: "Enter the size as carried. Items are never turned to fit, so give a wardrobe's size lying down unless it must stay upright." 
   - length ≥ width (offer to swap)
   - synonyms as comma-separated input

4. **Reorder:** up/down buttons within a group, rewriting `sortOrder` in steps of 10. No drag-and-drop.

5. **Deactivate/reactivate** toggle. No delete endpoint.

6. Every mutation writes an `AuditLog` entry with before/after.

7. Note on the page that the public catalogue is cached for up to five minutes (task-05).

8. `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Acceptance Criteria

- [x] Only authorised admin roles can read or write
- [x] Create, edit, reorder and deactivate work; no delete exists
- [x] Every mutation is audit-logged
