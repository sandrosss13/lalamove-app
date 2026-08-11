# Task 05: User management — System Users (admin staff accounts)

## Status

pending

## Wave

3

## Description

Lets a `SUPER_ADMIN` create, view, and deactivate the internal staff accounts that can sign into `/admin` itself — the `SystemUserProfile` rows task-01 added. There is deliberately no self-serve sign-up for admin accounts (task-02 already blocks `role: "ADMIN"` at the public sign-up endpoint), so this task's server action is the *only* way a new admin account gets created.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** None.

**Context from dependencies:** task-01 added `AdminRole` and `SystemUserProfile` (`userId`, `adminRole`, `isActive`). task-02 added `requireSystemUser()`/`hasAdminRole()`, `writeAuditLog()`, and — critically — blocked `role: "ADMIN"` on the *public* `POST /api/auth/sign-up/email` endpoint. This task's create-admin route therefore cannot go through that public endpoint; it must call `auth.api.signUpEmail(...)` directly from trusted server code, the same pattern the existing company-driven driver registration uses (see `src/app/api/logistics-company/drivers/register/route.ts` for reference) — that call bypasses the public-endpoint restriction because it's invoked server-to-server, not over HTTP, and doesn't forward the incoming request's headers (so it doesn't trip the host-split hook either). The `/admin/users/*` tab layout from task-02 already renders a "System Users" tab pointing at `/admin/users/system`; this task only adds that leaf page.

## Files to Create

- `src/app/admin/(sections)/users/system/page.tsx` — table of `SystemUserProfile` + `User` (name, email, `adminRole`, `isActive`, created date), a "New System User" button opening a create dialog, and a per-row deactivate/reactivate action. Gate the "New System User" button and the deactivate action to `SUPER_ADMIN` only (viewing the list can be broader — reuse `USER_MANAGER` if it makes sense, but creating/deactivating *other admins* is `SUPER_ADMIN`-only to avoid privilege escalation by a lower-privileged admin).
- `src/components/admin/users/create-system-user-dialog.tsx` — form: name, email, temporary password (or an auto-generated one shown once, mirroring the existing driver-registration "temp password" pattern via `mustChangePassword`), `adminRole` select.
- `src/app/api/admin/users/system/route.ts` — `GET` (list) and `POST` (create) for system users.
- `src/app/api/admin/users/system/[userId]/deactivate/route.ts` — `POST` → sets `SystemUserProfile.isActive = false`.
- `src/app/api/admin/users/system/[userId]/reactivate/route.ts` — `POST` → sets `SystemUserProfile.isActive = true`.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. All routes in this task require `requireSystemUser()`. `POST /api/admin/users/system` (create) and both deactivate/reactivate routes additionally require `hasAdminRole(profile, ["SUPER_ADMIN"])` — return `403` for any other `adminRole`, including `USER_MANAGER`. `GET` (list) can allow `SUPER_ADMIN` and `USER_MANAGER`.
2. Creating a system user: call `auth.api.signUpEmail({ body: { name, email, password: tempPassword, role: "ADMIN" } })` directly (server-to-server, no `headers` forwarded — matching the driver-registration precedent cited above), set `mustChangePassword: true` on the resulting `User` afterward (same field/flow the driver-registration path already uses for temp passwords — reuse it rather than inventing a second mechanism), then `prisma.systemUserProfile.create({ data: { userId: newUser.id, adminRole, isActive: true } })`. Wrap the profile creation in the same request so a failure doesn't leave a `User` with `role: "ADMIN"` and no `SystemUserProfile` (use a transaction, or create the profile immediately after and delete the `User` on failure).
3. Generate the temporary password server-side (e.g. `crypto.randomBytes(12).toString("base64url")`) and return it once in the `POST` response body for the admin who created the account to relay to the new staff member out-of-band — never store it in plaintext beyond that response, never email it (no email provider is wired up yet, see action-required.md).
4. Deactivate/reactivate: `prisma.systemUserProfile.update({ where: { userId }, data: { isActive } })`. A `SUPER_ADMIN` must not be able to deactivate their own account through this route (guard: `if (targetUserId === session.user.id) return 400`) — otherwise an admin could lock themselves out with no recovery path in this spec.
5. `writeAuditLog(...)` on create/deactivate/reactivate with `action: "system_user.create" | "system_user.deactivate" | "system_user.reactivate"`, `entityType: "SystemUserProfile"`.

### API Endpoints

- `GET /api/admin/users/system` — list.
- `POST /api/admin/users/system` — body `{ name, email, adminRole }` → returns `{ user, temporaryPassword }`.
- `POST /api/admin/users/system/[userId]/deactivate`
- `POST /api/admin/users/system/[userId]/reactivate`

## Acceptance Criteria

- [ ] A `SUPER_ADMIN` can create a new system user, receives a one-time temporary password in the response, and the new account can sign in at `/admin/sign-in` and is forced through the existing change-password flow (`mustChangePassword`) on first login.
- [ ] A non-`SUPER_ADMIN` gets `403` from create/deactivate/reactivate, even if they can view the list.
- [ ] A `SUPER_ADMIN` cannot deactivate their own account (`400`, not silently ignored).
- [ ] Deactivating a system user prevents that account from passing `requireSystemUser()` on its next request (verify by checking `SystemUserProfile.isActive` is read, not cached, in the guard from task-02).
- [ ] Every create/deactivate/reactivate writes an `AuditLog` row.
- [ ] `pnpm check` passes.

## Notes

- This is the task `action-required.md`'s "create the first `SUPER_ADMIN` manually" step exists for: this UI can only create *more* system users once at least one `SUPER_ADMIN` already exists and can sign in. The very first one has to be seeded outside this UI (a one-off script using the same `auth.api.signUpEmail` + `prisma.systemUserProfile.create` pattern above is the natural way to do that, but running it is a human action, not part of this task).
