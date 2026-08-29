# Task 19: Admin Business Applications Queue Page

## Status

pending

## Wave

6

## Description

The back-office review queue at `/admin/business/applications`: a filterable table of submitted business fleet applications with a row per company, opening task-20's detail drawer on click. It is a near-exact mirror of `src/app/admin/(sections)/drivers/applications/page.tsx` — a `"use client"` component that fetches task-17's list endpoint, holds the filter/page/selection state, and renders loading, empty and error states inside the table body rather than replacing it.

The columns come straight from the design: Company (name plus mono reference), City ("Tbilisi +2"), Fleet, Drivers (`5/7`) and Status. Filtering and paging happen far more often than a first load, and a reviewer working the queue re-fetches after every decision, which is why this is a client component reading an endpoint rather than a server component querying Prisma — the same call every other admin listing makes.

## Dependencies

**Depends on:** task-16-admin-nav-registration.md, task-17-admin-applications-read-api.md
**Blocks:** None

**Context from dependencies:**

**From task-16** — the section is registered and the layout exists, so this page only has to be a leaf:

- `ADMIN_NAV` carries a `business` section, label "Business applications", `href: "/admin/business/applications"`, `adminRoles: ["SUPER_ADMIN", "USER_MANAGER"]`, with one item "Applications" at the same href and roles.
- `src/app/admin/(sections)/business/layout.tsx` renders `<AdminSectionLayout sectionId="business">`, which already does `requireSystemUser()`, the role redirect to `/admin`, the `<h1>` and the tab strip. **Do not repeat any of that in this page**, and do not add another `<h1>`.
- **Do not edit `src/components/admin/admin-nav.ts`.** task-16 owns it exclusively.

**From task-17** — `GET /api/admin/business-applications?status=&page=` answers:

```ts
export type AdminBusinessApplicationStatus = Exclude<
  BusinessApplicationStatus,   // DRAFT | PENDING | ACTION_REQUIRED | APPROVED
  "DRAFT"
>;

export type AdminBusinessApplicationRow = {
  applicationId: string;          // BusinessApplication.id — what the drawer takes
  reference: string;              // "BIZ-40219", rendered mono
  companyName: string;
  primaryCity: string;            // raw GeorgianCity enum value, e.g. "TBILISI"
  otherCitiesCount: number;       // cities of operation minus the primary
  fleetSize: number;              // BusinessApplicationVehicle rows
  driversAssignedCount: number;   // vehicles with an open DriverVehicleAssignment
  status: AdminBusinessApplicationStatus;
  companyReviewStatus: "PENDING" | "VERIFIED" | "FLAGGED";
  submittedAt: string;            // ISO
};

export type AdminBusinessApplicationListResponse = {
  items: AdminBusinessApplicationRow[];
  page: number;
  pageSize: number;   // 25
  total: number;
  pageCount: number;  // always >= 1
};
```

Both types are exported from `src/app/api/admin/business-applications/route.ts` and must be imported **type-only**, so nothing of the server route (Prisma, Better Auth) reaches this client bundle. An unrecognised `?status=` or `?page=` is ignored by the endpoint rather than erroring, and `DRAFT` applications never appear. Errors are `{ error: string }` with 401/403 for an unauthorised caller.

`GEORGIAN_CITY_OPTIONS` from `@/lib/georgian-cities` is the browser-safe `{ value, label, region }[]` mirror used to turn `"TBILISI"` into `"Tbilisi"`.

## Files to Create

- `src/app/admin/(sections)/business/applications/page.tsx` — the queue page.

## Technical Details

### 1. Route path

`src/app/admin/(sections)/business/applications/page.tsx`, giving the URL `/admin/business/applications`.

This is the path task-16 registered and it is deliberately parallel to the existing driver queue at `src/app/admin/(sections)/drivers/applications/page.tsx` → `/admin/drivers/applications`: `(sections)` is a route group holding the shared admin chrome, the next segment is the nav section id, and the leaf segment is the tab. Do not nest it under `drivers/`, and do not invent a `business-applications` single segment — the section layout resolves its tabs by `sectionId="business"` and the URL has to sit under that segment for the tab strip's active state to work.

### 2. Page shape

`"use client"` at the top. Default-export `AdminBusinessApplicationsPage`. No `export const dynamic` — that belongs on the layout (task-16 set it) and is meaningless on a client component.

State, exactly as the driver page holds it:

```ts
const [filter, setFilter] = useState<ApplicationFilter>("ALL");
const [page, setPage] = useState(1);
const [data, setData] = useState<AdminBusinessApplicationListResponse | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [openApplicationId, setOpenApplicationId] = useState<string | null>(null);
const [reloadToken, setReloadToken] = useState(0);
```

`reloadToken` is bumped by the drawer's `onChanged` so the row's chips and counts show what the database now holds rather than a patched copy.

### 3. Filters

```ts
/**
 * The filter pills above the table. `"ALL"` is this page's own value, not a
 * status: it is the absence of a `?status=` param, which the endpoint reads as
 * "every reviewable status".
 */
type ApplicationFilter = AdminBusinessApplicationStatus | "ALL";

const FILTER_ORDER: readonly ApplicationFilter[] = [
  "ALL",
  "PENDING",
  "ACTION_REQUIRED",
  "APPROVED",
];

const FILTERS: Record<ApplicationFilter, { label: string; emptyMessage: string }> = {
  ALL: { label: "All", emptyMessage: "No fleet applications yet." },
  PENDING: { label: "Pending", emptyMessage: "No pending fleet applications." },
  ACTION_REQUIRED: {
    label: "Action required",
    emptyMessage: "No action-required fleet applications.",
  },
  APPROVED: { label: "Approved", emptyMessage: "No activated fleets." },
};
```

A `Record` keyed by the closed union rather than an array searched at render time, so every lookup is total and there is no "no such filter" branch to write. Changing the filter resets `setPage(1)` — page 3 of the previous filter says nothing about this one.

Render the pills as `<Button size="sm" variant={active ? "secondary" : "outline"} aria-pressed={active}>`, with the `{data.total} application(s)` count on the right of the same row, exactly as the driver page does.

### 4. Status chips

Two chip maps, because a business application has two verdict tracks and the queue must show both:

```ts
const STATUS_LABELS: Record<AdminBusinessApplicationStatus, string> = {
  PENDING: "Pending",
  ACTION_REQUIRED: "Action required",
  APPROVED: "Fleet active",
};

/**
 * The design's exact chip colours, as Tailwind arbitrary values rather than new
 * tokens in `globals.css` — they are used on this one screen, so a token would
 * be a palette of one. `cn()` inside `Badge` runs these through tailwind-merge,
 * so they replace the variant's own `bg-*`/`text-*` instead of racing it.
 */
const STATUS_CHIP_CLASSES: Record<AdminBusinessApplicationStatus, string> = {
  PENDING: "bg-[rgba(200,140,20,0.12)] text-[oklch(0.48_0.13_70)]",
  ACTION_REQUIRED: "bg-[rgba(220,38,38,0.09)] text-[oklch(0.577_0.245_27.325)]",
  APPROVED: "bg-[rgba(16,120,70,0.1)] text-[oklch(0.5_0.13_145)]",
};
```

In the Status cell, render the application chip, and directly under it a second small line when `companyReviewStatus !== "VERIFIED"`:

- `"FLAGGED"` → `<span className="text-[11px] text-destructive">Company flagged</span>`
- `"PENDING"` → `<span className="text-[11px] text-muted-foreground">Company unverified</span>`

Nothing when the company is verified — a green "verified" line on every row is noise. This is the one column that departs from the design's five, and it earns its place: without it a reviewer cannot tell a PENDING application whose company is already cleared from one nobody has touched.

### 5. Columns

`const COLUMN_COUNT = 5;` — the state rows `colSpan` all of them.

| Head | Cell |
|---|---|
| Company | `companyName` as the focusable button (see below), with `reference` under it in `font-mono text-xs text-muted-foreground` |
| City | `formatCityColumn(row)` — see below |
| Fleet | `row.fleetSize` |
| Drivers | `` `${row.driversAssignedCount}/${row.fleetSize}` ``, in `font-price` (IBM Plex Mono) per the design's "mono for counts" rule |
| Status | the chips from §4 |

```ts
/** Placeholder for a cell the application has nothing to show for. */
const EMPTY_VALUE = "—";

/**
 * The City column: the registered city plus how many other cities of operation
 * the company declared — the design's "Tbilisi +2". A city value that predates
 * the enum-backed picker falls back to its stored value rather than vanishing.
 */
function formatCityColumn(row: AdminBusinessApplicationRow): string {
  if (row.primaryCity === "") return EMPTY_VALUE;

  const label =
    GEORGIAN_CITY_OPTIONS.find((option) => option.value === row.primaryCity)
      ?.label ?? row.primaryCity;

  return row.otherCitiesCount > 0 ? `${label} +${row.otherCitiesCount}` : label;
}
```

### 6. Fetching

One `useEffect` keyed `[filter, page, reloadToken]`, with an `AbortController` cleanup, exactly as the driver page does:

```ts
const params = new URLSearchParams({ page: String(page) });
if (filter !== "ALL") {
  params.set("status", filter);
}

const response = await fetch(
  `/api/admin/business-applications?${params.toString()}`,
  { signal: controller.signal },
);
```

- `if (!response.ok)` → `setError(await readErrorMessage(response, "Could not load fleet applications."))`. A 403 for a role that may not review applications then says so, instead of showing the same "could not load" as a network failure.
- In the `catch`, return silently when `controller.signal.aborted` — an abort is this effect being cleaned up, not a failure worth showing.
- **Never `alert()`.**

Copy the shared `readErrorMessage(response, fallback)` helper verbatim from the driver queue page (it does `await response.json().catch(() => null)` and narrows `body.error` to a string before returning it). A local copy is correct here: it is six lines and both pages are Next.js entry points.

### 7. Table body states

Inside `<TableBody>`, in this order, each as a single `<TableRow>` with `<TableCell colSpan={COLUMN_COUNT}>`:

1. `error` → `className="py-10 text-center text-destructive"` wrapping `<span role="alert">{error}</span>`
2. `loading && data === null` → `className="py-10 text-center text-muted-foreground"`, text `Loading fleet applications…`
3. `items.length === 0` → same classes, text `FILTERS[filter].emptyMessage`
4. otherwise the rows

Keeping the states inside the table rather than replacing it means the header row never disappears and the layout does not jump between a load and its result.

### 8. Rows and keyboard access

```tsx
<TableRow
  key={row.applicationId}
  data-state={open ? "selected" : undefined}
  className="cursor-pointer"
  onClick={() => setOpenApplicationId(row.applicationId)}
>
```

Inside the Company cell, the company name is a real `<button type="button" aria-haspopup="dialog" aria-expanded={open}>` with `className="text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"`. A `<tr>` cannot take focus, so this button is what makes the row's action reachable from the keyboard; its click bubbles to the row handler, which opens the drawer the row is already about. Keep that comment — it is the reason the button has no `onClick` of its own.

`data-state="selected"` highlights the row behind the open drawer.

### 9. Pagination

Render only when `data && data.pageCount > 1`: a right-aligned `Page {data.page} of {data.pageCount}` plus Previous/Next `<Button variant="outline" size="sm">`, disabled on `loading || data.page <= 1` and `loading || data.page >= data.pageCount`. Identical to the driver page.

### 10. The drawer

```tsx
{openApplicationId ? (
  <BusinessApplicationDetailDrawer
    applicationId={openApplicationId}
    onClose={() => setOpenApplicationId(null)}
    // A decision inside the drawer changes the row behind it — re-fetch so the
    // chips, Fleet and Drivers counts stay current.
    onChanged={() => setReloadToken((token) => token + 1)}
  />
) : null}
```

`BusinessApplicationDetailDrawer` is task-20's component at `@/components/admin/business-application-detail-drawer`, with exactly the props above (`applicationId: string`, `onClose: () => void`, `onChanged: () => void`). Wave 6 runs both tasks in parallel: write this page against that signature and do not create the component here.

## Acceptance Criteria

- [ ] `/admin/business/applications` renders under the Business applications section with its tab strip active, and a single `<h1>` supplied by the layout.
- [ ] The table has exactly the columns Company · City · Fleet · Drivers · Status.
- [ ] The Company cell shows the company name plus the reference in mono; the Drivers cell shows `5/7`; the City cell shows "Tbilisi +2" when there are other cities and "Tbilisi" when there are not.
- [ ] The four filter pills work, are `aria-pressed`, and reset paging to page 1.
- [ ] Loading, empty (per-filter copy) and error states each render inside the table body without removing the header.
- [ ] A 403 from the endpoint surfaces its `{ error }` text, not a generic message; no `alert()` anywhere.
- [ ] Clicking a row — or activating the company-name button with the keyboard — opens the drawer, and the row shows as selected while it is open.
- [ ] `onChanged` from the drawer re-fetches the list.
- [ ] The list endpoint's types are imported type-only; the built client bundle contains no Prisma import from this page.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- No search box, no company-name filter, no sort controls: task-17's endpoint offers `status` and `page` only, and adding UI for parameters the server ignores is worse than not having it.
- `PAGE_SIZE` is the server's business. Read `data.pageSize` if you need it; do not hardcode 25 here.
- The `font-price` class is IBM Plex Mono, already registered in `globals.css` — it is the design's mono face for references, plates and counts. Use it for the `5/7` figure and the reference, not `font-mono`… except that the driver queue already uses `font-mono` for its reference; match `font-mono` for the reference line so the two queues look identical, and use `font-price` only for the counts figure.
- This page shows applications only. There is no "all companies" view here — a company directory belongs under User Management if it is ever built.
