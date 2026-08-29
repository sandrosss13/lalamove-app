# Task 16: Admin Nav Registration — Business Applications Section

## Status

pending

## Wave

5

## Description

Registers the back office's seventh section, **Business applications**, so the review queue built in task-19 and the detail drawer in task-20 have a sidebar entry, a section heading and a tab strip to live under. Today `ADMIN_NAV` in `src/components/admin/admin-nav.ts` declares six sections (`analytics`, `users`, `content`, `finance`, `crm`, `drivers`) and the self-serve driver review queue hangs off `drivers`. Business fleet applications are a different population reviewed by the same two roles, and they get their own section rather than a second tab under Drivers: the row shape, the drawer and the verdict model are all different, and a reviewer working the company queue is doing a company-registry job (VAT ids, registered addresses, payout accounts), not a licence job.

This task ships the navigation entry plus the section `layout.tsx`, and nothing else. The leaf page it points at lands in task-19; until then the link 404s, which is the normal, documented state of a not-yet-built route in this file (see its header comment). Mirror the existing `drivers` section exactly — same role list, same one-tab shape, same one-line layout delegating to `AdminSectionLayout`.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-19-admin-business-queue-page.md, task-20-admin-business-detail-drawer.md

**Context from dependencies:**

Nothing in this task reads the schema at runtime — it is navigation metadata only — but it is sequenced after task-01 so the section it advertises cannot exist before the models it reviews. For reference, task-01 adds (this is the same block every wave-5 task restates):

```prisma
enum BusinessApplicationStatus { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }
enum VehicleClass { SMALL_VAN LARGE_VAN MEDIUM_TRUCK HEAVY_FREIGHT_TRUCK TRAILER_TRUCK }

model BusinessApplication {
  id                  String                      @id @default(cuid())
  companyId           String                      @unique
  company             LogisticsCompany            @relation(fields: [companyId], references: [id], onDelete: Cascade)
  reference           String                      @unique   // "BIZ-40219"
  status              BusinessApplicationStatus   @default(DRAFT)
  companyReviewStatus CompanyReviewStatus         @default(PENDING)
  companyFlagReason   String?
  draft               Json?
  draftStep           Int                         @default(1)
  draftUpdatedAt      DateTime?
  firstSubmittedAt    DateTime?
  lastSubmittedAt     DateTime?
  submissionCount     Int                         @default(0)
  createdAt           DateTime                    @default(now())
  updatedAt           DateTime                    @updatedAt
  vehicles            BusinessApplicationVehicle[]

  @@index([status])
}

model BusinessApplicationVehicle {
  id                    String                           @id @default(cuid())
  businessApplicationId String
  businessApplication   BusinessApplication              @relation(fields: [businessApplicationId], references: [id], onDelete: Cascade)
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at
  /// any time through an existing, unrelated flow, and the review row must
  /// survive so the admin drawer can render "vehicle no longer on file" rather
  /// than vanishing a decided verdict. Mirrors `DriverApplication.vehicleId`.
  vehicleId             String?                          @unique
  vehicle               Vehicle?                         @relation(fields: [vehicleId], references: [id], onDelete: SetNull)
  /// Denormalised at submit so the admin queue, the drawer and the dispatch
  /// gate can read the declared class and body without a join that a null
  /// `vehicleId` would break.
  vehicleClass          VehicleClass
  chassisType           ChassisType
  status                BusinessApplicationVehicleStatus @default(PENDING)
  flagReason            String?
  decidedAt             DateTime?
  createdAt             DateTime                         @default(now())
  updatedAt             DateTime                         @updatedAt

  @@index([businessApplicationId])
}
```

`Vehicle` gains `vehicleClass VehicleClass?` and the **singular** back-relation `applicationVehicle BusinessApplicationVehicle?` (singular because `BusinessApplicationVehicle.vehicleId` is `@unique`). There is **no `position` column** on `BusinessApplicationVehicle`: a vehicle's 1-based row number is derived from `createdAt` ordering and computed in the response.

`AdminRole` is the existing Prisma enum; the two roles that review applications are `SUPER_ADMIN` and `USER_MANAGER`, exactly as the `drivers` section already declares.

## Files to Create

- `src/app/admin/(sections)/business/layout.tsx` — the section layout, one line delegating to `AdminSectionLayout` with `sectionId="business"`, plus `export const dynamic = "force-dynamic"`.

## Files to Modify

- `src/components/admin/admin-nav.ts` — add `"business"` to the `AdminNavSectionId` union and a `business` section entry to `ADMIN_NAV`.

## Technical Details

### 1. This task owns `src/components/admin/admin-nav.ts` exclusively

**No other task in this spec may edit `src/components/admin/admin-nav.ts`.** If you are implementing any other task and find yourself needing a nav entry, stop and note it — do not add it.

The reason is written into the file itself, at the top:

> This file is intentionally finished: every section and every leaf route the back office will ever have (for this spec) is listed here already, even though most of the leaf `page.tsx` files land in later, parallel tasks. That way no later task has to edit a shared file to register itself — it only adds its own page and API routes — so those tasks never conflict with each other. Until a leaf's own task lands, its link simply 404s, which is the normal state of a not-yet-built route.

That is the whole design of the file: it is the one deliberately stable, centrally-owned module in the admin tree, so that a wave of parallel tasks each adding a page can never collide on it. Waves 5 and 6 of this spec run three and two tasks in parallel respectively; if task-19 and task-20 each registered themselves here they would conflict on the same object literal. Concentrating the edit in this one wave-5 task preserves the invariant. `specs/business-fleet-onboarding/requirements.md` states the same rule under Technical Constraints ("Only `task-16` may edit `src/components/admin/admin-nav.ts`").

### 2. `src/components/admin/admin-nav.ts` — the section id union

Extend the union, keeping the doc comment's count honest:

```ts
/**
 * Stable identifiers for the seven sections, so a section's `layout.tsx` can
 * ask for its own tabs by name instead of restating them.
 */
export type AdminNavSectionId =
  | "analytics"
  | "users"
  | "content"
  | "finance"
  | "crm"
  | "drivers"
  | "business";
```

(The existing declaration is a single-line union; reformat to the multi-line form above rather than pushing past the print width — Prettier will do this anyway.)

### 3. `src/components/admin/admin-nav.ts` — the section entry

Append after the `drivers` entry, so the two review queues sit next to each other in the sidebar and Drivers keeps its position:

```ts
  {
    id: "business",
    label: "Business applications",
    href: "/admin/business/applications",
    icon: Building2,
    // The same two roles that review individual driver applications. A fleet
    // application carries a company's VAT id, registered address and payout
    // IBAN, so read access is scoped to the roles that hold the review actions
    // — SUPPORT is deliberately absent here for the same reason it is absent
    // from Drivers.
    adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
    items: [
      {
        label: "Applications",
        href: "/admin/business/applications",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
      },
    ],
  },
```

Add `Building2` to the existing `lucide-react` import, in alphabetical position:

```ts
import {
  Building2,
  ChartColumn,
  CreditCard,
  FileText,
  Megaphone,
  Truck,
  Users,
} from "lucide-react";
```

`Building2` is already available — `lucide-react` is a dependency and the icon needs no install. Do not reuse `Truck`: two sidebar entries with the same glyph is the one thing a reviewer scanning the rail cannot disambiguate.

The section's `href` points at its first (only) tab, matching every other multi-tab section — the section header is never a dead end.

### 4. `src/app/admin/(sections)/business/layout.tsx`

A direct mirror of `src/app/admin/(sections)/drivers/layout.tsx`:

```tsx
import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Business applications — currently a single Applications tab, reviewing
 * self-serve logistics-company fleet registrations. The tab list itself lives
 * in `@/components/admin/admin-nav` so the sidebar and this strip can never
 * disagree; see `AdminSectionLayout` for the role gate it applies.
 */
export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="business">{children}</AdminSectionLayout>
  );
}
```

`AdminSectionLayout` (`src/components/admin/admin-section-layout.tsx`) already does the rest: it calls `requireSystemUser()`, redirects to `/admin` when the staff member's `adminRole` is not in the section's `adminRoles`, renders the section heading from `label`, and filters the tab strip by each item's own roles. Do not re-implement any of that here.

### 5. What this gate is and is not

`adminRoles` in this file is a **cosmetic** filter over the sidebar plus the coarse view gate `AdminSectionLayout` applies. It is not the security boundary. Every API route added by task-17 and task-18 must call `authorizeAdminApi(["SUPER_ADMIN", "USER_MANAGER"])` itself — a hidden link does nothing about a hand-typed URL. This is already stated in the file's header comment; do not weaken it.

## Acceptance Criteria

- [ ] `AdminNavSectionId` includes `"business"`, and its doc comment says "seven sections".
- [ ] `ADMIN_NAV` contains a `business` section labelled "Business applications", icon `Building2`, `adminRoles: ["SUPER_ADMIN", "USER_MANAGER"]`, `href: "/admin/business/applications"`, with exactly one item labelled "Applications" at the same href and the same roles.
- [ ] `src/app/admin/(sections)/business/layout.tsx` exists, exports `dynamic = "force-dynamic"`, and renders `<AdminSectionLayout sectionId="business">`.
- [ ] A `SUPER_ADMIN` and a `USER_MANAGER` see the new sidebar entry; a `SUPPORT`, `ANALYTICS`, `CONTENT_MANAGER`, `FINANCE_MANAGER` or `CRM_MANAGER` does not, and hand-typing `/admin/business/applications` redirects them to `/admin`.
- [ ] No file other than `src/components/admin/admin-nav.ts` and the new layout is touched.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Until task-19 lands, `/admin/business/applications` renders the section shell with a 404 body. That is expected and is exactly how every other leaf in `ADMIN_NAV` behaved before its own task shipped.
- Naming: the section id is `business`, not `business-applications`. The id is a short stable key (`analytics`, `users`, `drivers`); the human string lives in `label`.
- The route segment is `business`, not `companies`: `/admin/users/*` already covers accounts, and this section is specifically the *application review* surface, not a company directory. A company directory, if one is ever built, belongs under User Management.
