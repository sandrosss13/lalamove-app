# Action Required: Business Fleet Onboarding

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Sign off on the `TRAILER_TRUCK` pricing rule figures in `task-02-trailer-vehicle-type-spec.md`.** The spec row itself (24,000 kg, 13.60 × 2.48 × 2.70 m, `HEAVY_DUTY`) comes from the approved design, but its `PricingRule` — base fare, per-km and per-minute rates — does not. The seed ships placeholder figures scaled from `LARGE_FREIGHT_TRUCK`, and the moment this row exists it becomes a **bookable vehicle type that clients can order and be charged for**. Confirm the rates with whoever owns pricing before this reaches production.
- [ ] **Confirm moving Heavy Freight Truck from licence category CE to C** (`task-04-vehicle-class-taxonomy.md`). This comes from the approved business design and makes one taxonomy serve both flows, but it loosens a gate that already shipped: an individual driver holding only category C can select Heavy Freight Truck where CE was previously required. No stored data changes, but the individual driver wizard's behaviour does. If ops wants Heavy to stay at CE, say so before wave 2 — it changes the taxonomy and every UI that reads it.
- [ ] **Review the 31 make/model reference rows and the body-type adjustment figures** in `task-03-model-reference-data.md`. The design handoff flags these as "realistic reference values, not a manufacturer database — they need an ops review before being seeded". They prefill payload and cargo dimensions that a company then attests to, so a wrong figure becomes a wrong compliance record. Correcting them later is a one-file pull request.
- [ ] **Decide what happens to existing `BUSINESS`-type `DriverProfile` rows.** `task-08-company-account-entry.md` repoints sign-up's "Business" card so it creates a COMPANY account with a `LogisticsCompany` instead of a DRIVER account with `DriverProfile.accountType = BUSINESS`. New sign-ups are unaffected by whatever you choose, but any accounts already created down the old path keep working as driver accounts and will never see the fleet wizard. Query production for `DriverProfile` rows with `accountType = 'BUSINESS'` first — if there are none, this is a non-issue and no migration is needed.

## During Implementation

- [ ] **Run `pnpm prisma migrate dev --name add_business_fleet_onboarding`** (or the name chosen in `task-01`) against a reachable dev database. Requires `DATABASE_URL`; no new env var.
- [ ] **Run `pnpm exec prisma db seed`** after `task-02` so the `TRAILER_TRUCK` spec exists locally — the seed is idempotent and upserts on `code`, so re-running it is safe.
- [ ] **Verify that `auth.api.signUpEmail`, called server-side without forwarding request headers, does not set a session cookie on the calling company's browser** (`task-07`). This is the same assumption `specs/driver-registration-and-vehicle-assignment` recorded and it is not documented Better Auth behaviour. To check: as a company user, create a driver from step 4 of the wizard and confirm you are still signed in as the company afterwards, with no session swap to the new driver.

## After Implementation

- [ ] **Run `pnpm prisma migrate deploy` against the production database** as part of the deploy that ships this feature — `task-01`'s `migrate dev` only touches your local database. The migration includes two hand-written partial unique indexes on `DriverVehicleAssignment` that Prisma cannot express in the schema; confirm they survive the deploy.
- [ ] **Check for pre-existing `DriverVehicleAssignment` rows that violate the new exclusivity indexes** before deploying. The migration adds partial unique indexes on `vehicleId` and on `driverProfileId` where `unassignedAt IS NULL`, and the index creation **will fail** if production already holds a duplicate — which is possible, since the rule has until now been enforced only in application code with a documented race. Query for duplicates and resolve them first.
- [ ] **Confirm existing companies were grandfathered.** `task-01`'s migration backfills `LogisticsCompany.activatedAt` for every pre-existing company, because `task-21` adds a dispatch gate on that column and an un-backfilled company would be locked out of a dashboard it uses today. After deploying, verify no `LogisticsCompany` row has a null `activatedAt` unless it genuinely came through the new wizard and has not been approved yet.
- [ ] **Manually click through the full loop end to end**, since this repo has no test runner: sign up as a company → complete all five steps with at least two vehicles → submit → as an admin, verify the company and flag exactly one vehicle with a reason → confirm the company sees "1 vehicle needs correcting" and only that vehicle is fixable → fix and resubmit → confirm the already-approved vehicles kept their verdict → as an admin, approve the rest and activate the fleet → confirm the company can dispatch, and that a still-pending vehicle cannot be.
- [ ] **Confirm `USER_MANAGER` is the right admin role for reviewing business applications** (`task-16`). It mirrors the driver applications queue; if the business wants a narrower role for company verification — which involves VAT registry and bank account checks — that is a follow-up, not part of this feature.

---

> These tasks are also referenced in context within the relevant task files.
