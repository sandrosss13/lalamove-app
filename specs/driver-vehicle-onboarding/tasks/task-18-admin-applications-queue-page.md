# Task 18: Admin Applications Queue Page

## Status

pending

## Wave

6

## Description

The table view at `/admin/drivers/applications/page.tsx`: every submitted application, filterable by status, opening `task-19`'s detail drawer on a row click. Follows the existing admin list-page convention exactly (`src/app/admin/(sections)/users/clients/page.tsx` is the closest precedent — same loading/empty/error table-row states, same `readErrorMessage` helper pattern).

## Dependencies

**Depends on:** task-15-admin-nav-registration.md, task-16-admin-applications-read-api.md
**Blocks:** None

**Context from dependencies:** `task-15` makes `/admin/drivers/applications` a registered, reachable route (this task adds its `page.tsx`). `task-16`'s `GET /api/admin/driver-applications?status=&page=` returns `AdminDriverApplicationListResponse` (`{ items: AdminDriverApplicationRow[], page, pageSize, total, pageCount }`), each row carrying `applicationId, reference, driverName, vehicleClassName, chassisType, plateNumber, categories, documentsApprovedCount, documentsTotalCount, status, submittedAt` — import these types type-only from that route file.

## Files to Create

- `src/app/admin/(sections)/drivers/applications/page.tsx`

## Technical Details

### Table

Columns, from the design: **Applicant** (`driverName` + mono `reference` below it), **Vehicle** (`"{vehicleClassName} · {chassisType label}"`, mono `plateNumber` below it), **Categories** (`categories.join(", ")`), **Docs** (`"{documentsApprovedCount}/{documentsTotalCount}"`), **Status** (chip).

Status chip colours (from the design, exact):

```
Pending:         background rgba(200,140,20,0.12), text oklch(0.48 0.13 70)
Action required: background rgba(220,38,38,0.09),  text oklch(0.577 0.245 27.325)
Approved:        background rgba(16,120,70,0.1),    text oklch(0.5 0.13 145)
```

Build with `src/components/ui/badge.tsx` where its variant system accommodates arbitrary colours, or a plain styled `<span>` if not — do not hand-roll a second badge-like component from scratch if `Badge` already gets most of the way there.

Filter pills above the table: **All / Pending / Action required / Approved**, each a button toggling the `?status=` query param, following the same `useState` + `useEffect`-refetch pattern as `clients/page.tsx`'s search box (`query`/`page`/`reloadToken` state, a `useEffect` keyed on those that fetches and sets `data`/`loading`/`error`).

Clicking a row opens `task-19`'s detail drawer for that `applicationId` (local `useState<string | null>` holding the currently-open application id, same idea as `clients/page.tsx`'s `expandedUserId` but driving a drawer instead of an inline expansion). Import and render it as:

```tsx
import { DriverApplicationDetailDrawer } from "@/components/admin/driver-application-detail-drawer";

// ...inside the page's JSX, alongside the table:
{openApplicationId ? (
  <DriverApplicationDetailDrawer
    applicationId={openApplicationId}
    onClose={() => setOpenApplicationId(null)}
    onChanged={() => setReloadToken((t) => t + 1)} // re-fetch the list after a status/document change so the row's chip/Docs count stay current
  />
) : null}
```

This is `task-19`'s exact, independently-built contract — you don't need to read that task's file, just render the component with these three props once it exists.

### Required states

Mirror `clients/page.tsx`'s `COLUMN_COUNT`-spanning full-width row pattern for: initial loading, empty result (no applications at all), empty-for-this-filter ("No {status} applications." — distinct copy per active filter, not a generic "No results"), and a fetch error (via a `readErrorMessage(response, "Could not load applications.")` helper, same shape as the existing one in `clients/page.tsx` — copy it, don't import it cross-page, matching how that codebase's own admin pages currently each keep their own copy rather than sharing one utility).

## Acceptance Criteria

- [ ] The table renders all five columns with the exact chip colours above.
- [ ] Each filter pill correctly re-queries and the empty-state copy names the active filter.
- [ ] Loading, empty, per-filter-empty, and error states all render as full-width table rows spanning every column, not a layout-breaking partial row.
- [ ] Clicking a row opens the detail drawer for that application's id.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- This task does not build the drawer itself (`task-19`) — only the trigger (row click → sets the "currently open" id) and, if `task-19` isn't merged yet at build time, a no-op/placeholder for that state is acceptable as long as the final wiring (both tasks landed) opens the real drawer.
