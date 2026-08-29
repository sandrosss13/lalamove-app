# Requirements: Business Fleet Onboarding

## Summary

Today a `LogisticsCompany` is a six-field profile — company name, VAT id, phone, one city — created by an internal admin, with its drivers and vehicles entered one at a time from the back office. There is no registered address, no payout account, no contact person, and no review lifecycle of any kind: nothing gates an unverified company from dispatching. Worse, the COMPANY role currently has no way in at all — `src/components/auth/sign-up-form.tsx` and `sign-in-form.tsx` both declare `type Role = "CLIENT" | "DRIVER"` (the company cards were removed in `002d46a` and `65203b1`), while `src/app/dashboard/page.tsx` still branches on `COMPANY` and the whole `company-ops-dashboard` feature sits behind it, unreachable.

This feature adds a five-step self-serve fleet registration wizard — company & authorisation, fleet composition, vehicle specifications, drivers & assignment, review & submit — plus a per-vehicle application status screen and an admin review queue that verifies the company once and clears or flags each vehicle individually. It is based on the approved design in `UI:UX/Business Fleet Onboard/design_handoff_business_onboarding/` (`README.md` and `Business Onboarding.dc.html` — a standalone HTML prototype, a design reference only; recreate its layout, copy and behaviour with this codebase's Next.js App Router + Tailwind v4 + `src/components/ui` conventions, never its markup). It is the company-account counterpart to `specs/driver-vehicle-onboarding`, and the two share the vehicle class taxonomy, cargo body types, colour list, city list and review/flag/resubmit pattern.

The outcome: a logistics company registers itself, declares its fleet by cargo body type and vehicle class, specifies every vehicle, puts a named driver behind each one, and submits. It cannot dispatch until operations has verified the company and approved at least one vehicle, and each vehicle can be sent back for correction without holding up the rest of the fleet.

## Goals

- Let a logistics company complete a five-step wizard collecting: company phone, legal name, VAT/tax id, registered address, one or more cities of operation, a contact person with role and email, and a payout IBAN; a fleet count per (cargo body type × vehicle class) combination; a full specification per vehicle (make/model, year, plate, colour, payload, cargo hold dimensions); and a named driver behind every vehicle.
- Make wizard progress resumable across sessions and devices, the same way `DriverApplication.draft` already works for individual drivers.
- Generate the vehicle list from the fleet composition counts, preserving already-specified vehicles when a count changes and only adding or removing at the tail of the affected group.
- Prefill payload and cargo dimensions from a published per-model reference figure, adjusted for the chosen cargo body type, while still allowing free entry for a vehicle that is not in the list.
- Enforce licence-category gating (a driver cannot hold a vehicle whose class their categories do not cover) and one-driver-one-vehicle, on the server as well as in the UI.
- Show a post-submission status screen with a company-level state and a per-vehicle verdict (Approved / Flagged / Pending), where only flagged vehicles can be fixed and resubmitted and approved vehicles keep their verdict.
- Give back-office staff a business application queue: verify or flag the company's details with a reason, approve or flag each vehicle with a reason, and activate the fleet only once the company is verified and every vehicle has been decided.
- Restore a working sign-up and sign-in path for logistics companies, which today have neither.
- Share one vehicle class taxonomy between the individual driver flow and this one, rather than letting the two drift.

## Non-Goals

- **Driver invitations.** The design's third assignment tab sends a driver a link to complete their own licence details. This codebase has no email or SMS infrastructure — an explicit non-goal in both `specs/driver-registration-and-vehicle-assignment` and `specs/freight-platform-pivot` — so v1 ships roster-pick and create-account-now only, and the invitation tab is removed rather than stubbed. The `Invited` vehicle status and "invitation sent · licence pending" driver state go with it.
- **SMS OTP verification.** The prototype has a six-box OTP screen with a hardcoded demo code, already bypassed in the prototype itself. Dropped entirely, matching how `specs/driver-vehicle-onboarding` handled the identical screen — a fake code that verifies nothing is worse than no screen.
- **Bulk fleet import.** Applications are capped at 40 vehicles total (see Technical Constraints); above roughly 30 a per-row wizard genuinely needs CSV import, and that is a separate feature.
- **Refrigerated and open-chassis trailers.** Only the Dry Box trailer combination is backed by a real `VehicleTypeSpec`; the other two lock like any other unbacked cell.
- **Cooling-unit service records.** The design names a per-vehicle cooling unit record for refrigerated vehicles and an admin flag reason for it. No document upload is built for business applications in v1 — the flag reason string stays, the upload does not. Company vehicle documents are a follow-up.
- **Multi-user company accounts.** `LogisticsCompany.userId` is `@unique` — one login per company. No staff seats, no per-company roles, no membership table.
- **Changing how orders are matched or priced.** Adding one `TRAILER_TRUCK` spec extends the catalogue; nothing in the matching or pricing logic changes shape.
- **Migrating existing `BUSINESS`-type `DriverProfile` rows.** Repointing sign-up affects new accounts only; what happens to any existing business-type driver accounts is an ops decision recorded in `action-required.md`, not a code path built here.
- **Automated tests.** This repository has no test runner (`package.json` has `lint`, `typecheck`, `build`, `format` only). None is added. Verification is `pnpm lint`, `pnpm typecheck`, `pnpm build` and a manual click-through of the full loop.

## Acceptance Criteria

- [ ] A new user can sign up as a logistics company, sign back in later, and land in the fleet wizard; a company mid-wizard resumes at the step and field state they left, including in a new session on another browser.
- [ ] Fleet composition rejects a total below two vehicles with "A business account needs at least two vehicles. Use the individual driver flow for a single vehicle." and rejects a total above 40.
- [ ] Body × class combinations with no backing `VehicleTypeSpec` render locked and cannot be counted up; the seven locked cells are exactly those listed in Technical Constraints.
- [ ] Changing a fleet count in step 2 preserves every already-specified vehicle in that group and adds or removes only at its tail.
- [ ] Picking a make/model writes that model's published payload and dimensions into the form, adjusted for the body type by the rules in Technical Constraints, and names its source in the editor footer.
- [ ] A driver cannot be assigned to a vehicle class their licence categories do not cover, and cannot hold two vehicles at once — both enforced server-side, not only in the UI.
- [ ] Creating a driver account inline returns a temporary password shown exactly once, sets `mustChangePassword`, and records the driver's licence number, expiry and categories so category gating has something to check.
- [ ] Submitting creates the `Vehicle` rows, the `DriverLicence` rows for created drivers, and the `DriverVehicleAssignment` rows in one transaction, and moves the application to pending; nothing is written to those tables before a successful submit.
- [ ] An admin can open the business applications queue, verify or flag the company with a reason, approve or flag each vehicle with a reason, and activate the fleet — with activation refused unless the company is verified and every vehicle is decided.
- [ ] A company whose application is action-required sees only its flagged items, can fix and resubmit them, and its approved vehicles keep their verdict across the resubmission.
- [ ] A company cannot dispatch until it is approved and at least one of its vehicles is approved; an individual flagged or pending vehicle cannot be dispatched even in an otherwise approved fleet.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` all pass after the change.

## Assumptions

- The design handoff's copy, validation messages and state transitions are final and authoritative; every deviation in this spec is called out explicitly with its reason.
- A company has one `BusinessApplication` for its lifetime; a flagged application is corrected and resubmitted in place, never recreated. There is no "rejected, reapply from scratch" state, matching the design.
- The 31 make/model reference rows and the body-type adjustment figures are realistic reference values authored for the design, not a manufacturer database. They ship as a code constant so ops can correct them by pull request, and they are flagged for ops review in `action-required.md` before this feature is announced.
- `pnpm` is the package manager; all commands in these tasks use `pnpm`.
- The prototype's 36 cities are a subset of the existing 63-value `GeorgianCity` enum, so no enum extension is needed. (The design's "Tsqaltubo" is the existing `TSKALTUBO`; the same transliteration was already reconciled in `specs/driver-vehicle-onboarding`.)

## Technical Constraints

- Stack: Next.js App Router, Prisma + Postgres, Better Auth 1.6.x, Tailwind v4, `src/components/ui` primitives. No new component library, no validation library — the API layer hand-rolls validation in `parseXBody(body: unknown): { data } | { error }` functions, consistent with every existing route.
- **`src/components/ui/` has no Sheet, Command/Combobox or Toast.** The 560px admin drawer follows `src/components/admin/driver-application-detail-drawer.tsx`'s hand-rolled fixed-panel pattern; the searchable make/model dropdown follows the city combobox in `steps/step-1-auth-personal.tsx`; the toast follows `onboarding-toast.tsx` — a presentational component plus a `showToast(message, tone)` owned by the draft context, which also owns the dismissal timer.
- **Any subtree using `src/components/ui` primitives must carry `data-onboarding-surface`**, or `accent`/`muted`/`border` resolve against the landing palette. This is set on `body:has(...)` in `globals.css` precisely so Radix's portalled content resolves correctly, and it must be re-declared on anything rendered outside the wizard's `<main>` (the toast does this).
- Brand orange is `--onboarding-accent` / `--color-onboarding-accent`, used as `bg-onboarding-accent`, `text-onboarding-accent`, `border-onboarding-accent`, `bg-onboarding-accent/5`, `hover:bg-onboarding-accent-hover`. **`--primary` is near-black, not orange** — never reach for `bg-primary` expecting the brand colour.
- Error borders on `Input`/`Textarea` come from the primitive's own `aria-invalid:` variants — set `aria-invalid`, do not write a red border class. Non-input controls use `border-destructive bg-card` explicitly. Inline messages are `<p className="text-xs text-destructive">`. Validation fires on Continue, never on blur.
- **The vehicle class taxonomy is shared and changes for both flows.** `src/lib/driver-onboarding/vehicle-classes.ts` grows from four classes to five: `TRAILER_TRUCK` is added at category CE, and `HEAVY_FREIGHT_TRUCK` moves from CE to **C**, per the approved business design. This loosens an existing gate — a driver holding only category C can now select Heavy Freight Truck where previously CE was required. It requires no data migration (no stored value changes) but it does change what the individual driver wizard permits, and that is intentional: one taxonomy, both flows.
- **One new `VehicleTypeSpec` row is seeded**: `TRAILER_TRUCK`, 24,000 kg, 13.60 × 2.48 × 2.70 m, `HEAVY_DUTY`, with a `PricingRule` — because the class is otherwise unreachable, every existing spec topping out at 10,000 kg. Its pricing figures need ops sign-off (`action-required.md`). No other spec rows are added: order matching and the booking pickers key on an exact `vehicleTypeSpecId` and treat `pricingRule` as non-nullable.
- **Seven (body × class) cells stay locked** because no spec backs them. The resulting map is:

  | Class | Dry Box | Refrigerated | Open Chassis |
  |---|---|---|---|
  | Small Van (B) | `MINIVAN` | locked | locked |
  | Large Van (B) | `CARGO_VAN` | `REFRIGERATED_VAN` | locked |
  | Medium Truck (C) | `BOX_TRUCK` | `REFRIGERATED_TRUCK` | `FLATBED_TRUCK` |
  | Heavy Freight Truck (C) | `LARGE_FREIGHT_TRUCK` | locked | locked |
  | Trailer Truck (CE) | `TRAILER_TRUCK` *(new)* | locked | locked |

  The design offers 13 of 15 cells; this ships 8. Locked cells render disabled with a note rather than falling back to a mismatched spec, which would misprice orders — the same rule `specs/driver-vehicle-onboarding` already applies.
- **Cargo body type reuses the existing `ChassisType` enum** (`DRY_BOX`/`REFRIGERATED`/`OPEN_CHASSIS`) on `Vehicle.chassisType`, added by the driver onboarding migration. No new enum. `Vehicle` additionally gains a `vehicleClass` column rather than deriving the class back from `(vehicleTypeSpecId, chassisType)`. The 8-cell map happens to be invertible today, but deriving is still wrong here: the map is one ops decision from ambiguity (unlocking Heavy Freight × Refrigerated collides with Medium Truck × Refrigerated, which already claims `REFRIGERATED_TRUCK`); the derivation key `Vehicle.chassisType` is nullable; the class carries the licence-gating category, so deriving it would make an already-approved assignment's requirement a function of a mutable constant; and the fleet table, status screen and admin drawer all display the class the company declared, including for vehicles with no verdict yet. `recoverVehicleClass` in `src/app/api/driver-profile/onboarding/route.ts` already concedes this weakness in its own doc comment.
- **Cities of operation are a `GeorgianCity[]` scalar array** on `LogisticsCompany`, following `DriverLicence.categories`, which is already a Postgres enum array. No join table. The existing single `LogisticsCompany.city` is retained as the company's primary/registered city so nothing that reads it breaks.
- **`Vehicle` ownership is XOR-constrained at the database level** (`vehicle_single_owner_check`): a company-owned vehicle physically cannot carry a `driverProfileId`. Every driver↔vehicle pairing in this feature therefore goes through `DriverVehicleAssignment`.
- **`DriverVehicleAssignment` has no unique constraints today** and the existing assignment route documents the resulting race honestly. This feature adds the two partial unique indexes that close it — on `vehicleId` and on `driverProfileId`, both `WHERE "unassignedAt" IS NULL` — as hand-appended SQL in the migration, the same technique `driver_application_document_live_type_unique` already uses.
- **Company-created drivers currently get no `DriverLicence` row** and are activated at creation, so nothing today can gate a fleet assignment on licence category. The fleet driver-creation endpoint captures licence number, expiry and categories, which is what makes the gating rule enforceable.
- **The temp password comes from the existing generator**, not the prototype's. `src/app/api/logistics-company/drivers/register/route.ts` uses `node:crypto` `randomInt` over a 56-character ambiguity-free charset at length 12; the prototype's 8-character `Math.random()` version is a design placeholder and must not be ported.
- Server-initiated account creation calls `auth.api.signUpEmail` **without forwarding request headers**, or Better Auth issues a session for the new driver and signs the company admin out of their own account. `src/lib/auth.ts`'s `before` hook has an explicit `if (!ctx.request) return;` bail-out for exactly this call.
- **Fleet size is capped at 40 vehicles per application.** The per-cell stepper keeps the design's 0–40 range; the grand total is what is enforced on Continue and re-checked at submit.
- Admin surfaces are gated by the existing `SUPER_ADMIN` / `USER_MANAGER` roles via `authorizeAdminApi`; no new `AdminRole` value. Reviewer identity is an `AuditLog` row, never a column, matching every existing admin mutation.
- Only `task-16` may edit `src/components/admin/admin-nav.ts` — it is documented in-file as deliberately stable so parallel tasks never collide on it. Only `task-04` may edit `src/lib/driver-onboarding/vehicle-classes.ts`.
