# Action Required: Business Fleet Onboarding

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [x] **RESOLVED 2026-08-29 — `TRAILER_TRUCK` pricing signed off by the rate owner.** The rule: every money figure is exactly 1.5x `LARGE_FREIGHT_TRUCK`, the largest vehicle in the catalogue — baseFare 67.5, pricePerKm 5.25, pricePerMinute 0.75, overtimeRatePerMinute 1.35, helperFee 45, minimumFare 90. `freeLoadingMinutes` is deliberately NOT scaled (it is a time allowance, not a price) and stays at 40 against the large truck's 30, because a 24 t semi-trailer takes longer to load. Applied to `prisma/seed.ts` and re-seeded against production; ratios verified 1.5x on all six money fields. If `LARGE_FREIGHT_TRUCK` is ever retuned, re-apply the multiplier rather than editing the trailer figures independently.
- [ ] **Confirm moving Heavy Freight Truck from licence category CE to C** (`task-04-vehicle-class-taxonomy.md`). This comes from the approved business design and makes one taxonomy serve both flows, but it loosens a gate that already shipped: an individual driver holding only category C can select Heavy Freight Truck where CE was previously required. No stored data changes, but the individual driver wizard's behaviour does. If ops wants Heavy to stay at CE, say so before wave 2 — it changes the taxonomy and every UI that reads it.
- [ ] **Review the 31 make/model reference rows and the body-type adjustment figures** in `task-03-model-reference-data.md`. The design handoff flags these as "realistic reference values, not a manufacturer database — they need an ops review before being seeded". They prefill payload and cargo dimensions that a company then attests to, so a wrong figure becomes a wrong compliance record. Correcting them later is a one-file pull request.
- [ ] **Decide what happens to existing `BUSINESS`-type `DriverProfile` rows.** `task-08-company-account-entry.md` repoints sign-up's "Business" card so it creates a COMPANY account with a `LogisticsCompany` instead of a DRIVER account with `DriverProfile.accountType = BUSINESS`. New sign-ups are unaffected by whatever you choose, but any accounts already created down the old path keep working as driver accounts and will never see the fleet wizard. Query production for `DriverProfile` rows with `accountType = 'BUSINESS'` first — if there are none, this is a non-issue and no migration is needed.

## During Implementation

- [x] **DONE 2026-08-29 — migration `20260829121728_add_business_fleet_onboarding` applied.** Note it was run against the database in `.env`, which is the **production** Supabase instance, so the schema is already live there. Nothing further to run for the schema itself.
- [x] **DONE 2026-08-29 — seed run against production**, creating `TRAILER_TRUCK` (11 specs total) and later re-run to apply the signed-off 1.5x pricing. Idempotent upsert on `code`, so re-running is safe and keeps the row id.
- [ ] **Verify that `auth.api.signUpEmail`, called server-side without forwarding request headers, does not set a session cookie on the calling company's browser** (`task-07`). This is the same assumption `specs/driver-registration-and-vehicle-assignment` recorded and it is not documented Better Auth behaviour. To check: as a company user, create a driver from step 4 of the wizard and confirm you are still signed in as the company afterwards, with no session swap to the new driver.

## After Implementation

- [x] **NOT NEEDED — already applied.** The `migrate dev` above ran against the production database, so `migrate deploy` has nothing left to do. Both hand-written partial unique indexes on `DriverVehicleAssignment` were confirmed present in `information_schema` with the correct `WHERE ("unassignedAt" IS NULL)` predicate.
- [x] **DONE — checked before the indexes were created; both queries returned zero rows**, so index creation succeeded. Worth knowing this check ran *after* the decision to migrate rather than before it: had duplicates existed, the migration would have aborted partway. Re-run it first on any other environment.
- [ ] **Confirm existing companies were grandfathered.** `task-01`'s migration backfills `LogisticsCompany.activatedAt` for every pre-existing company, because `task-21` adds a dispatch gate on that column and an un-backfilled company would be locked out of a dashboard it uses today. After deploying, verify no `LogisticsCompany` row has a null `activatedAt` unless it genuinely came through the new wizard and has not been approved yet.
- [ ] **Manually click through the full loop end to end**, since this repo has no test runner: sign up as a company → complete all five steps with at least two vehicles → submit → as an admin, verify the company and flag exactly one vehicle with a reason → confirm the company sees "1 vehicle needs correcting" and only that vehicle is fixable → fix and resubmit → confirm the already-approved vehicles kept their verdict → as an admin, approve the rest and activate the fleet → confirm the company can dispatch, and that a still-pending vehicle cannot be.
- [ ] **Confirm `USER_MANAGER` is the right admin role for reviewing business applications** (`task-16`). It mirrors the driver applications queue; if the business wants a narrower role for company verification — which involves VAT registry and bank account checks — that is a follow-up, not part of this feature.

---

> These tasks are also referenced in context within the relevant task files.
