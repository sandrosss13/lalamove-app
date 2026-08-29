# Requirements: Driver & Vehicle Onboarding

## Summary

Today, an independent driver who signs up at `/sign-up` gets a `DriverProfile` with almost no data — name, phone, city, account type — and nothing else. There is no licence on file, no vehicle specification beyond what the existing "add a vehicle" form collects for booking purposes, no identity or licence documents, and nothing reviews any of it before the driver can go online and accept freight. Company-created drivers (registered by a `LogisticsCompany` admin via `specs/driver-registration-and-vehicle-assignment`) are a separate population entirely — they're fleet employees, always `DriverAccountType.INDIVIDUAL`, driving a company-owned vehicle, and are unaffected by this feature.

This feature adds a four-step self-serve onboarding wizard — authorisation & personal details, licence verification, vehicle registration, and review & submit — plus an application-status screen and an admin review queue that approves or flags each uploaded document before activating the driver's account. It is based on the approved design in `design_handoff_driver_onboarding/README.md` and `Driver Onboarding.dc.html` (a standalone HTML prototype — a design reference only, not to be ported directly; recreate its layout, copy, and behaviour using this codebase's Next.js App Router + Tailwind v4 + `src/components/ui` shadcn conventions).

The outcome: an independent driver cannot go online, appear in a client's booking match, or accept an order until an admin has approved their application. Existing drivers (all of them, regardless of type) are grandfathered as already activated by this migration — the gate only applies going forward to new independent Individual/Individual Entrepreneur sign-ups.

## Goals

- Let an independent driver (`DriverAccountType.INDIVIDUAL` or `INDIVIDUAL_ENTREPRENEUR`, no `companyId`) complete a four-step wizard collecting: mobile number, full name, ID/passport number, date of birth, city, a profile photo; a driving licence number, expiry, held categories (B/C/CE), and front/back photos; a vehicle's cargo body type, class, make/model, year, plate, colour, declared payload, and cargo hold dimensions.
- Make wizard progress resumable across sessions and devices — a driver who leaves mid-wizard and signs back in later (even on a different browser) resumes at the step they left off.
- Show a post-submission application-status screen with three states: pending verification, action required (per-document rejection with a reason, re-upload only the flagged documents, rest of the application kept), and approved.
- Give back-office staff a review queue: list applications, filter by status, open one, approve or flag each of the three uploaded documents with a reason, then either request changes (moves the application back to the driver) or approve the driver (activates the account).
- Gate account activation on admin approval — a non-activated driver cannot toggle online, cannot see open orders, and cannot accept an order.
- Match the approved design's copy, validation messages, and state transitions at high fidelity, using this codebase's real component library rather than the prototype's hand-built inline-styled controls.

## Non-Goals

- **Company-created drivers.** They never see this wizard. `DriverProfile.companyId !== null` is the discriminator — `DriverAccountType.INDIVIDUAL` alone does not distinguish an independent driver from a company one, since company-created drivers are also always `INDIVIDUAL` (per the existing `driver-registration-and-vehicle-assignment` spec).
- **`BUSINESS`-type driver sign-ups.** The existing three-way account-type picker on `/sign-up` (Individual / Individual Entrepreneur / Business) is unchanged; only Individual and Individual Entrepreneur route into this wizard. Business driver accounts keep today's behaviour exactly — no onboarding, no activation gate.
- **SMS OTP verification.** The design shows a 6-digit SMS code step; this codebase has no SMS infrastructure (documented in the existing driver-registration spec). The phone field is kept; the OTP screen is dropped entirely rather than stubbed with a fake code that verifies nothing.
- **Camera capture.** Every document is upload-only, matching the design.
- **A new `AdminRole` enum value.** The admin review queue is gated by the existing `USER_MANAGER` role.
- **The design's "Active drivers / Fleet / Compliance" admin nav items.** Only the "Applications" queue is built.
- **New `VehicleTypeSpec` rows.** The design's four vehicle classes are a presentation grouping over the existing 10 seeded specs (see `requirements.md`'s Technical Constraints and `task-04`), not a new taxonomy — adding new rows would silently break order-matching, which keys on an exact `vehicleTypeSpecId`, for every onboarded driver.
- **Automated tests.** This repository has no test framework (`package.json` has `lint`/`typecheck`/`build` only). None is added for this feature. Verification is `pnpm lint`, `pnpm typecheck`, `pnpm build`, and manual click-through of the full loop (submit → admin flags a document → driver sees action required → re-upload → resubmit → admin approves all → driver sees approved → driver can go online).
- **Reassigning/deleting a submitted application's vehicle after approval**, and any change to per-order dispatch — out of scope, same boundary the existing driver-registration spec draws around `DriverVehicleAssignment`.
- **Using a driver's declared payload/cargo-dimension overrides for pricing or order matching.** They are compliance-facing attestations only; booking and matching continue to read only `VehicleTypeSpec`'s values, unchanged.

## Acceptance Criteria

- [ ] An independent driver (Individual or Individual Entrepreneur, no company) landing on `/dashboard` with no submitted application is routed into the onboarding wizard; one with a pending or action-required application is routed to the status screen; one already approved reaches the normal dashboard.
- [ ] The wizard is resumable: leaving mid-step and returning later (including in a new session) restores the exact step and every field already filled in, including previously uploaded documents.
- [ ] Every validation rule in the design's field table (see `design_handoff_driver_onboarding/README.md`) is enforced both client-side (inline, on Continue, not on blur) and server-side on submit — the server is authoritative and re-checks everything, including the checks the design only enforces in the UI (licence category vs. chosen vehicle class, licence not expired as of submit time, driver age 21–75).
- [ ] Submitting creates the driver's `Vehicle` and `DriverLicence` rows and moves the application to pending; nothing is written to those tables before a successful submit.
- [ ] An admin with `USER_MANAGER` access can open `/admin/drivers/applications`, filter by status, open one application, approve or flag each of its three documents with a reason, then either request changes (requires ≥1 flagged document, moves the application to action required, the driver sees the reasons) or approve the driver (requires all three documents approved, sets `DriverProfile.activatedAt`).
- [ ] A driver whose application is action-required sees exactly which documents were flagged and why, can replace only those, and resubmitting keeps the rest of the application; the resubmit button is disabled until every flagged document has been replaced.
- [ ] A non-activated driver cannot set themselves online, does not appear in a client's open-orders match, and cannot accept an order — enforced server-side in all three places, not just the online toggle.
- [ ] All existing `DriverProfile` rows (every account type, company-affiliated or not) are activated by the migration itself; no existing driver is silently deactivated.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` all pass after the change.

## Assumptions

- The design's field validation table, state machine, and copy (`design_handoff_driver_onboarding/README.md`) are final and authoritative for behaviour; deviations in this spec are called out explicitly with a reason (e.g. dropping OTP, the vehicle-class-to-spec mapping).
- A driver only ever has one `DriverApplication` in their lifetime; a rejected/flagged application is corrected and resubmitted in place, not recreated. Support for a driver reapplying from scratch after being permanently rejected is not designed here (the design has no "rejected, reapply" state — only pending/action-required/approved).
- The four `VehicleTypeSpec` codes newly reachable through onboarding (`MINIVAN`, `CARGO_VAN`, `REFRIGERATED_VAN`, `BOX_TRUCK`, `REFRIGERATED_TRUCK`, `FLATBED_TRUCK`, `LARGE_FREIGHT_TRUCK` — see `task-04`) already have correct, deployed pricing rules; no pricing change is needed.
- `pnpm` is the project's package manager (per `package.json` scripts); all commands in these tasks use `pnpm`.
- The private Supabase bucket (`driver-documents`) is created manually before wave 2's storage/document tasks are exercised end-to-end (see `action-required.md`) — the code does not provision it.

## Technical Constraints

- Stack: Next.js App Router, Prisma + Postgres, Better Auth 1.6.x, Tailwind v4, `src/components/ui` shadcn primitives (`radix-nova` style). No new component library. Hand-build only what genuinely doesn't exist yet (radio-cards, searchable dropdown, step rail, progress bar, colour swatch grid, cargo diagrams) by following this codebase's existing hand-built patterns (`src/components/auth/sign-up-form.tsx`'s card-choice buttons is the closest precedent), not by copying the prototype's inline-styled markup.
- Follow the existing UI/API conventions exactly: `useState`-per-field client components, JSON `fetch` with `{error}` parsed and shown inline (never `alert()`), `router.refresh()` after a successful mutation, established Tailwind idioms for inputs/buttons/error text.
- **Vehicle classes are a presentation grouping, not new database rows.** The design's Small Van / Large Van / Medium Truck / Heavy Freight Truck map onto specific existing `VehicleTypeSpec` codes (see `task-04`) — adding new spec rows would break the exact-`vehicleTypeSpecId` matching used by `GET /api/orders`, `POST /api/orders/[id]/accept`, and `POST /api/logistics-company/orders/[id]/dispatch`, and would either crash the client booking/landing pickers (which treat `pricingRule` as non-nullable) or silently duplicate the existing 10 bookable vehicle types.
- **Documents are private.** New Supabase bucket `driver-documents` (not the existing public `vehicle-photos` bucket). Object *paths* are persisted, not URLs; signed URLs are generated on demand, short-lived, and never rendered via `next/image` (this codebase has no `images.remotePatterns` configured and every existing photo surface deliberately uses a plain `<img>` — see `task-03`).
- **Uploads go browser → Supabase directly**, not through a Next.js route handler body — the design's 10MB cap exceeds Vercel's request-body limit for a route handler.
- **`Vehicle`'s declared payload/dimensions are compliance overrides only.** They are never read by pricing or order matching, which continue to use only `VehicleTypeSpec`. This must be stated in the `Vehicle` model's doc comment, since it currently documents the opposite ("not stored here").
- **Application/document state must support resubmission with history**, not a single mutable "current" value per document — a driver can be flagged, corrected, and reviewed again, and the admin needs the earlier rejection reason still visible. See `task-01`'s versioned-document design.
- **`DriverProfile.activatedAt`** (a nullable timestamp, not a plain boolean) is the single source of truth for whether a driver may act as an approved driver, mirroring the existing `mustChangePassword`/`suspendedAt` precedent of storing rather than deriving hot-path booleans.
- Do not touch `src/components/admin/admin-nav.ts` from more than one task (it is documented in-file as deliberately stable specifically so parallel tasks never collide on it) — `task-15` owns that edit exclusively.
