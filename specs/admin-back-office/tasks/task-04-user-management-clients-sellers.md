# Task 04: User management — Clients and Sellers

## Status

complete

## Wave

3

## Description

Gives staff a way to see and moderate the platform's Clients (the `CLIENT` role / `ClientProfile`) and Sellers (both `DRIVER`-role `DriverProfile`s and `COMPANY`-role `LogisticsCompany`s, viewed together per the user's confirmed definition of "Sellers"). Moderation here means: view profile details and order history, and suspend/unsuspend an account — not editing their profile data on their behalf.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** None.

**Context from dependencies:** task-01 added `isSuspended`, `suspendedAt`, `suspendedReason` to the existing `User` model. task-02 provides `requireSystemUser()`/`hasAdminRole()` (`@/lib/admin/auth`) and `writeAuditLog()` (`@/lib/admin/audit`), the shadcn primitives this task's tables/dialogs use, and the `/admin/users/*` tab layout at `src/app/admin/(sections)/users/layout.tsx` (already renders tabs for Clients/Sellers/System Users — this task only adds the `clients` and `sellers` leaf pages under it; do not modify the layout file). `USER_MANAGER` and `SUPER_ADMIN` are the `AdminRole`s expected to have access here, per `admin-nav.ts`.

## Files to Create

- `src/app/admin/(sections)/users/clients/page.tsx` — table of `ClientProfile` + parent `User` (name, email, phone, account type, order count, suspended status), with a search/filter input (by name/email/phone) and a row action to view details / suspend / unsuspend.
- `src/app/admin/(sections)/users/sellers/page.tsx` — table combining `DriverProfile` and `LogisticsCompany` rows (a "type" column distinguishing Driver vs. Company), same search/suspend affordances.
- `src/components/admin/users/suspend-dialog.tsx` — shared shadcn `dialog` component: reason textarea + confirm button, used by both pages, calls the suspend/unsuspend API route.
- `src/app/api/admin/users/clients/route.ts` — `GET` (list/search, paginated) for the clients table.
- `src/app/api/admin/users/sellers/route.ts` — `GET` (list/search, paginated) for the sellers table, querying both `DriverProfile` and `LogisticsCompany` and merging into one response shape.
- `src/app/api/admin/users/[userId]/suspend/route.ts` — `POST` `{ reason: string }` → sets `isSuspended: true, suspendedAt: now(), suspendedReason: reason` on the target `User`; writes an audit log entry.
- `src/app/api/admin/users/[userId]/unsuspend/route.ts` — `POST` → clears `isSuspended`/`suspendedAt`/`suspendedReason`; writes an audit log entry.

## Files to Modify

None (all new files; the shared `users/layout.tsx` tab shell already exists from task-02 and is not touched here).

## Technical Details

### Implementation Steps

1. Both list API routes require `requireSystemUser()` plus `hasAdminRole(profile, ["SUPER_ADMIN", "USER_MANAGER"])` — return `403` otherwise.
2. Clients query: `prisma.clientProfile.findMany({ include: { user: true, ... } , orderBy: { createdAt: "desc" } })` with `where` built from a `?q=` search param matching `user.name`/`user.email`/`phone` (case-insensitive `contains`). Include an order count via `prisma.order.count({ where: { clientId: userId } })` or a `_count` relation if convenient.
3. Sellers query: run two queries — `prisma.driverProfile.findMany({ include: { user: true } })` and `prisma.logisticsCompany.findMany({ include: { user: true } })` — map each to a common shape (`{ id, type: "DRIVER" | "COMPANY", name, email, phone, city, isSuspended }`) and merge/sort by `createdAt` in application code (a raw union query is unnecessary complexity for an admin list view).
4. Suspend/unsuspend routes: same role check as above, `prisma.user.update({ where: { id: userId }, data: { ... } })`, then `writeAuditLog({ actorId: systemUserProfile's userId, action: "user.suspend" | "user.unsuspend", entityType: "User", entityId: userId, metadata: { reason } })`.
5. A suspended account's practical effect (blocking sign-in/API access) is **not** part of this task's scope — this task only stores and surfaces the flag. Note this explicitly as a follow-up in your final report rather than silently expanding scope into `src/lib/auth.ts` session/login logic.

### API Endpoints

- `GET /api/admin/users/clients?q=<search>&page=<n>` — paginated client list.
- `GET /api/admin/users/sellers?q=<search>&page=<n>` — paginated seller list (drivers + companies merged).
- `POST /api/admin/users/[userId]/suspend` — body `{ reason: string }`.
- `POST /api/admin/users/[userId]/unsuspend` — no body.

## Acceptance Criteria

- [ ] `/admin/users/clients` lists all clients with working search.
- [ ] `/admin/users/sellers` lists both drivers and companies, labeled by type, with working search.
- [ ] Suspending an account from either page sets `isSuspended` (verify via a subsequent list load reflecting the new state) and writes an `AuditLog` row.
- [ ] Unsuspending clears the flag and writes an `AuditLog` row.
- [ ] Both list API routes and both action routes 403 for a `SystemUserProfile` whose `adminRole` is neither `SUPER_ADMIN` nor `USER_MANAGER`.
- [ ] `pnpm check` passes.

## Notes

- Actually enforcing `isSuspended` at sign-in/session level is intentionally out of scope here — flag it as a natural follow-up, since wiring it into `src/lib/auth.ts` touches shared, security-sensitive auth code better done as its own reviewed change than folded into an admin-UI task.
