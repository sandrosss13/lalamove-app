# Requirements: Driver Registration and Vehicle Assignment

## Summary

Today, a logistics company admin who wants to add a driver has to send that driver to the public `/sign-up` page to create their own account, wait for them to finish, then come back to the dashboard and paste in the driver's email to link them (`POST /api/logistics-company/drivers`, which explicitly requires the driver to already have an independent account with no company). This is a two-context, two-person workflow for what should be a single admin action.

This feature lets a company admin register a brand-new driver account **and** assign them a vehicle from the company's fleet, entirely from within the company dashboard, in one form submission. The admin sets a temporary password for the driver (there is no email/SMS infrastructure in this codebase to send an invite link, and adding one is out of scope), which is shown once on screen for the admin to relay to the driver directly. The driver's first login forces a password change before they can use anything else.

The existing "link an already-registered independent driver by email" flow is untouched — it remains the correct path for a driver who signed up on their own and now wants to join a company's roster. This feature adds a second, parallel path for company-originated drivers; it does not replace the first one.

## Goals

- Let a company admin create a new driver account (name, phone, city, email, temp password) directly from the dashboard, without the driver visiting `/sign-up`.
- Let the admin assign an existing fleet vehicle to that driver as part of the same submission, as a persistent (not just per-order) driver↔vehicle relationship.
- Show the generated temp password to the admin exactly once, with a copy-to-clipboard affordance, and never persist or log it in plaintext beyond that response.
- Force the driver to change their password on first login before reaching any other authenticated page.
- Keep the driver's account fully usable afterward through the existing driver-side flows (dashboard, order accept/start/complete, etc.) with no special-casing beyond the forced password change.

## Non-Goals

- Sending an invite email or SMS. No email/SMS provider is being added in this feature — the admin relays the temp password out of band.
- Adding a brand-new vehicle to the fleet *inline* within the driver-registration form. The existing "Add a vehicle" section on the company dashboard (`CompanyVehicleForm`) already does this; the registration form only lets the admin *select* an existing fleet vehicle. If the vehicle doesn't exist yet, the admin adds it first, then registers the driver.
- Reassigning a driver to a different vehicle after initial creation, or unassigning a vehicle from a driver. The `DriverVehicleAssignment` model supports this later (via `unassignedAt`), but no UI or API for changing an assignment after creation is built in this feature.
- Adopting Better Auth's `admin` plugin, the `organization` plugin, magic links, or email OTP. See Technical Constraints.
- Any change to per-order dispatch (`Order.driverId` / `Order.vehicleId`, `CompanyDispatchForm`), which remains independent of the new persistent assignment.
- Support for `BUSINESS` or `INDIVIDUAL_ENTREPRENEUR` driver account types in the new flow. A company-created driver is always `INDIVIDUAL` — they're an employee of the company's fleet, not a separate registered business. The existing independent-driver sign-up flow is unaffected and still supports all three types.

## Acceptance Criteria

- [ ] A COMPANY-role admin can open an "Add Driver" form on the company dashboard, fill in the driver's name/phone/city/email, optionally pick one of the company's existing fleet vehicles, and submit.
- [ ] On success, a new `User` (role `DRIVER`) + `Account` (credential, hashed temp password) + `DriverProfile` (with `companyId` already set) are created, and — if a vehicle was picked — a `DriverVehicleAssignment` row links the two.
- [ ] The admin sees the driver's email and the generated temp password once, with a way to copy it, and the roster/fleet views refresh to reflect the new driver.
- [ ] The new driver can sign in with the temp password and is redirected to a forced password-change screen before reaching the dashboard; after changing their password, they land on the normal driver dashboard and the temp password no longer works.
- [ ] The existing "link independent driver by email" form and its endpoint continue to work exactly as before, unmodified in behavior.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass after the change.

## Assumptions

- A company-created driver is always `DriverAccountType.INDIVIDUAL` — no account-type picker is exposed in the new form.
- A fleet vehicle has at most one *active* `DriverVehicleAssignment` at a time (`unassignedAt IS NULL`). The registration endpoint rejects assigning a vehicle that already has an active assignment to a different driver.
- `auth.api.signUpEmail` called server-side (not forwarding the incoming request's headers, not using `asResponse`) creates the `User`/`Account` rows without setting a session cookie on the caller's (the admin's) response. This is asserted by the codebase's Better Auth expert review but is not documented Better Auth behavior — it must be verified manually once implemented (see `action-required.md`).
- The project's package manager is `pnpm` (per `package.json` scripts); all commands in these tasks use `pnpm`.

## Technical Constraints

- Stack: Next.js App Router, Prisma + Postgres, Better Auth 1.6.x (`prismaAdapter`), hand-rolled Tailwind (no component library, no modal primitive — dashboard forms are inline expandable sections, never popovers).
- Do **not** add Better Auth's `admin` plugin. It reuses the literal `role` column name, which collides with this app's existing `role` additionalField (`CLIENT`/`DRIVER`/`COMPANY`); adopting it would require renaming that field and migrating data, which is out of scope.
- Do **not** hand-roll password hashing via `better-auth/crypto`'s `hashPassword`/`verifyPassword` — flagged as an API without a declared stability guarantee upstream. Always create driver credentials through `auth.api.signUpEmail`, so the hash format always matches whatever `emailAndPassword.password.hash` is actually configured.
- Better Auth has no native "force password change on next login" primitive (confirmed open upstream feature request). This is implemented as a custom `mustChangePassword` boolean on `User`, enforced at the application layer.
- Follow the existing UI/API conventions exactly (see individual task files for the specific patterns to mirror): inline expandable form sections, `useState`-per-field client components, JSON `fetch` with `{error}` parsed and shown inline (never `alert()`), `router.refresh()` after a successful mutation instead of local optimistic state, and the established Tailwind class idioms for inputs/buttons/error/success text.
