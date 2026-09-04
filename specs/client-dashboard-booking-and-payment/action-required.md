# Action Required: Client Dashboard — Booking & Payment

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Confirm the body-type mapping for the eleven seeded vehicle types** — task-03 seeds a proposed `VehicleTypeSpec.bodyTypes` array per type (see task-03 §Technical Details). The mapping is a judgement call about what each vehicle can actually carry — in particular whether a Curtainsider counts as Open Chassis, and whether the two refrigerated types should also offer Dry Box. An ops or fleet owner should sign it off.
- [ ] **Set the Priority and Pooling rates** — task-04 ships `PRIORITY_UPLIFT = 0.25` and `POOLING_DISCOUNT = 0.10` as tunable constants in `src/lib/pricing.ts`. Every other money figure in the app is attributed to the rate owner with a date (`prisma/seed.ts:254-256`); these two are not. Get a signed-off number.

## During Implementation

- [x] ~~Re-run `pnpm exec prisma db seed` after applying the schema migration~~ — **resolved by migration `20260904090000_backfill_vehicle_body_types`.** Do NOT run `prisma db seed` against staging or production: the seed's update branch is `{ ...spec, pricingRule: { upsert: { create: pricing, update: pricing } } }`, which rewrites every `VehicleTypeSpec` field and every `PricingRule` — `baseFare`, `perKm`, `perMinute`, `minimumFare`, `helperFee` — back to the constants in `prisma/seed.ts`, discarding any rate tuned in place. The backfill migration writes `bodyTypes` and nothing else, and only touches rows still empty, so it is a no-op on an already-seeded database.

- [ ] **Apply this feature's migrations to staging — production is now automatic.** Commits `9a7b17f` and `bc0b105` changed the build to run migrations, but deliberately only on Vercel **production** builds (`scripts/migrate-deploy.mjs`). Preview and local builds skip, because Vercel's Preview and Production `DATABASE_URL` values are both marked Sensitive and redact to `"[SENSITIVE]"` on `vercel env pull` — so whether they point at the same database could not be established, and a preview build applying a branch's migrations to production would have been worse than the manual gap it replaced.

  **Consequence: production migrates itself on the next deploy; staging does not.** For staging, run with that environment's `DATABASE_URL` and `DIRECT_URL`:

  ```
  FORCE_MIGRATE_DEPLOY=1 node scripts/migrate-deploy.mjs
  ```

  or `pnpm prisma migrate deploy` directly. The five migrations involved:
  - `20260902120000_order_helper_count` (pre-dates this feature)
  - `20260903051048_client_dashboard_booking` — stop contacts, service level, body types, SavedCard, payment selection, PO reference
  - `20260903052903_order_saved_card_index`
  - `20260903060000_saved_card_default_unique` — partial unique index, one default card per client
  - `20260904090000_backfill_vehicle_body_types`

- [ ] **Confirm whether Vercel Preview and Production share a database.** Not answerable from the CLI (both values are Sensitive). If they do share one, preview deployments have been reading and writing live customer data all along — independently of anything in this feature — and that is worth knowing regardless of the migration question.

- [ ] **Note that production migrations now run at *build* time, not deploy time.** A build that migrates and then fails leaves the database ahead of the running code, and a Vercel rollback reverts code but not schema. That is the normal trade for automated migrations, but it should be a known one rather than a surprise.

- [ ] **Decide whether Refrigerated should cost more than it already does** — no surcharge is being added, because Refrigerated Van and Refrigerated Truck are already separately priced types. If the existing gap is too small to cover running a reefer, raise those two rows' `PricingRule` rates directly. This is a data change, not a code change.

## After Implementation

- [ ] **Decide what should happen to a saved stop contact when the client retypes the address without re-selecting a suggestion** — contacts are keyed to the stop, not to the address, so a client who saves a contact for address A and then free-hand types address B submits B with A's contact. This is forced by the agreed behaviour "re-selecting an address re-opens the dialog pre-filled with that stop's saved values": clearing the contact on every keystroke would defeat it. Both behaviours cannot hold at once. Currently the contact persists. If that is wrong, the options are to clear the contact when the address text diverges from the selected suggestion, or to show the saved contact on the Route card so a stale one is at least visible — the latter reverses the deliberate decision that nothing renders there after Save.

- [ ] **If PCI scope is ever assessed, note that free-text order fields can hold a card number** — `POST /api/orders` accepts 200 characters of free text in the six stop-contact fields and in `purchaseOrderRef`, with no card-detail tripwire (unlike `POST /api/saved-cards`, which rejects PAN-shaped input outright). A client who types a card number into "block/floor/room" persists it. These fields are user-typed by design and no task asked for a guard there, so nothing is broken — but it is the kind of thing a PCI assessment asks about.

- [ ] **Choose a card gateway** (Stripe, BOG, TBC or other) — recorded as an open decision at `specs/admin-back-office/action-required.md:7`. Until then `SavedCard.providerToken` stays null, nothing is charged, and the Add-card dialog carries a banner saying so. The dialog is built so that wiring a gateway means replacing one client-side function, not rebuilding the UI.
- [ ] **Decide whether Priority and Pooling become real dispatch behaviour** — this pass records the level on the order and shows it to drivers and ops, but automated matching ignores it. The tier copy has been written to describe only what is true. If matching is later made to honour it, the copy can be strengthened at the same time.
- [ ] **Fix the two remaining `$` sites in admin** — `src/components/admin/analytics/metric-cards.tsx:24-25` and `src/app/admin/(sections)/finance/promo-campaigns/page.tsx:91` still print dollars. Out of scope here because they are not client-facing, but the app should not carry two currency symbols indefinitely.
- [ ] **Decide whether transaction history and invoices are built** — both sections of the handoff's wallet design are omitted. No `Payment` row is ever created today (`prisma.payment.*` has zero call sites), so history has nothing to read, and there is no PDF pipeline. Building them means deciding whether history derives from completed orders or from real gateway charges.

---

> These tasks are also referenced in context within the relevant task files.
