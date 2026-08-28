# Task 15: Admin Nav Registration — Drivers Section

## Status

pending

## Wave

5

## Description

Registers a new "Drivers" section in the admin back office's information architecture, with a single "Applications" tab. `src/components/admin/admin-nav.ts` is documented in-file as deliberately stable specifically so parallel tasks never have to edit it together — this task is the **only** task in this feature that touches it. Once this lands, `/admin/drivers/applications` is a real, navigable (if still 404ing until `task-18` lands its `page.tsx`) route.

## Dependencies

**Depends on:** None (Wave 5 — independent of the wizard entirely)
**Blocks:** task-18-admin-applications-queue-page.md, task-19-admin-applications-detail-drawer.md

**Context from dependencies:** None — this task only needs the existing `AdminNavSection`/`AdminNavItem` shape already in `admin-nav.ts` and the existing `AdminSectionLayout` component every other section's `layout.tsx` already wraps.

## Files to Modify

- `src/components/admin/admin-nav.ts` — add `"drivers"` to `AdminNavSectionId`, add the new section entry.

## Files to Create

- `src/app/admin/(sections)/drivers/layout.tsx` — one-liner wrapping `AdminSectionLayout`, following every existing section's identical pattern (see `src/app/admin/(sections)/users/layout.tsx`).

## Technical Details

### `admin-nav.ts`

Extend the union (alongside the existing five):

```ts
export type AdminNavSectionId =
  "analytics" | "users" | "content" | "finance" | "crm" | "drivers";
```

Add the section to `ADMIN_NAV` (pick any consistent position — appending is simplest and lowest-risk). Only the "Applications" queue is in scope from the original design's four-item admin nav ("Active drivers / Fleet / Compliance" are explicitly not built — see `requirements.md`'s Non-Goals), so this section has exactly one tab:

```ts
import { Truck } from "lucide-react"; // add to the existing lucide-react import at the top of the file

// ...inside ADMIN_NAV:
{
  id: "drivers",
  label: "Drivers",
  href: "/admin/drivers/applications",
  icon: Truck,
  adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
  items: [
    {
      label: "Applications",
      href: "/admin/drivers/applications",
      adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
    },
  ],
},
```

`USER_MANAGER` is the reviewing role for this feature (see `requirements.md`'s Non-Goals — no new `AdminRole` value is added). `SUPPORT` is deliberately **not** included, unlike the Users section — reviewing and approving a driver's compliance documents is a different responsibility from reading a customer account for a support ticket, and this codebase's existing convention is to add a role to a section only when there's a real reason a staff member in that role needs it (see the Users section's own comment on why it includes `SUPPORT`).

### `src/app/admin/(sections)/drivers/layout.tsx`

```tsx
import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

export const dynamic = "force-dynamic";

/**
 * Drivers — currently a single "Applications" tab reviewing self-serve
 * onboarding submissions. The tab list lives in `@/components/admin/admin-nav`
 * so the sidebar and this strip can never disagree; see `AdminSectionLayout`
 * for the role gate it applies.
 */
export default function DriversLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminSectionLayout sectionId="drivers">{children}</AdminSectionLayout>;
}
```

## Acceptance Criteria

- [ ] `AdminNavSectionId` includes `"drivers"`.
- [ ] `ADMIN_NAV` has a `"drivers"` section with exactly one item ("Applications"), both gated to `["SUPER_ADMIN", "USER_MANAGER"]`.
- [ ] `src/app/admin/(sections)/drivers/layout.tsx` exists and mirrors every other section's layout exactly (same `AdminSectionLayout` usage, same `dynamic = "force-dynamic"`).
- [ ] The "Drivers" entry appears in the admin sidebar for a `SUPER_ADMIN` or `USER_MANAGER` session and is absent for every other role.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not add a `page.tsx` under `drivers/applications` in this task — that's `task-18`. Until it lands, the link 404s, which is this codebase's normal state for a registered-but-not-yet-built route (per `admin-nav.ts`'s own doc comment).
- `AdminSectionLayout`'s role gate is coarse (hides/shows the section) — every API route this feature adds (`task-16`, `task-17`) must call `authorizeAdminApi` itself regardless of what this task does; this task grants no actual authorization.
