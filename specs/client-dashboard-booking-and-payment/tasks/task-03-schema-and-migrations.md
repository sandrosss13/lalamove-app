# Task 03: Schema and migrations

## Status

complete

## Wave

1

## Description

Every server-side feature in this spec needs new columns. This task adds them all in one migration pass so that Wave 2 can build against a settled schema: six nullable stop-contact columns, a `ServiceLevel` enum with its itemised price adjustment, body types on the vehicle taxonomy and on the order, a `SavedCard` model, a payment selection on the order, and a Business-only purchase-order reference.

Every addition is nullable or defaulted. Nothing requires a destructive backfill.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-vehicle-body-types.md, task-07-saved-cards-api.md, task-08-orders-api.md, task-09-driver-ops-context.md

**Context from dependencies:** None. This task touches only `prisma/` and shares no files with anything else in Wave 1.

## Files to Modify

- `prisma/schema.prisma` — all model and enum changes below
- `prisma/seed.ts` — populate `VehicleTypeSpec.bodyTypes` for the eleven seeded types
- `prisma/migrations/<timestamp>_client_dashboard_booking/migration.sql` — generated

## Technical Details

### Implementation Steps

1. **Read `prisma/schema.prisma` first**, particularly the `Order` model (`:793-880`), `VehicleTypeSpec` (`:344-377`), `enum ChassisType` (`:227-236`), `enum PaymentMethodType` (`:1049-1056`) and `model Payment` (`:1078-1094`).

2. Apply the schema changes below.

3. Update `prisma/seed.ts` with the body-type mapping.

4. Generate and apply the migration: `pnpm prisma migrate dev --name client_dashboard_booking`, then `pnpm prisma generate`.

5. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Schema changes

**Stop contacts** — six nullable columns, no backfill, no existing read path affected:

```prisma
model Order {
  // Contact at each end of the job. All optional: the booking form presents them as
  // optional and never blocks on them. Surfaced to the driver and to company ops so
  // whoever turns up knows who to ask for.
  pickupContactName      String?
  pickupContactPhone     String?
  pickupContactDetails   String?   // block / floor / room
  dropoffContactName     String?
  dropoffContactPhone    String?
  dropoffContactDetails  String?
}
```

Six columns rather than a `StopContact` relation because the order model carries exactly one pickup and one dropoff address today. If multi-stop arrives, the relation is the right shape and this is reversible.

**Service level** — enum plus an itemised adjustment column:

```prisma
enum ServiceLevel {
  PRIORITY
  REGULAR
  POOLING
}

model Order {
  serviceLevel ServiceLevel @default(REGULAR)

  // The tier's effect on the fare, itemised rather than folded into `price`, so the
  // breakdown still reconciles against its own total. Positive for PRIORITY, negative
  // for POOLING, zero for REGULAR.
  serviceLevelAdjustment Float @default(0)
}
```

`@default(REGULAR)` backfills existing rows to the semantically correct value. **The separate adjustment column is load-bearing**: `Order.price` is documented at `schema.prisma:817-820` as "base + distance + time + helper, floored at the rule's `minimumFare`". Folding a tier delta into `price` silently breaks that invariant and makes the existing minimum-fare note (`booking-form.tsx:822-828`) read as bad arithmetic.

**Body type** — reuse the existing enum rather than declaring a second one for the same three values:

```prisma
model VehicleTypeSpec {
  // Which load spaces this vehicle type offers. Drives the client-facing body filter,
  // so the taxonomy owns the mapping rather than a literal table in the component.
  bodyTypes ChassisType[]
}

model Order {
  bodyType ChassisType?   // nullable: orders placed before this feature have none
}
```

`enum ChassisType { DRY_BOX REFRIGERATED OPEN_CHASSIS }` already exists at `schema.prisma:227-236`. **Its doc comment currently states that it "does not participate in order matching or pricing" — that guarantee is now partly false and the comment must be rewritten.** It still does not participate in *pricing*; it now participates in the client's vehicle filter.

Note `Vehicle.chassisType` (`:702-704`) is nullable, so an already-onboarded vehicle may have none. Do not make dispatch match strictly on it in this task; that would make every null-chassis vehicle undispatchable. Task 09 only displays it.

**Saved cards** — additive, but see the security note:

```prisma
model SavedCard {
  id            String   @id @default(cuid())
  clientId      String
  client        User     @relation(fields: [clientId], references: [id], onDelete: Cascade)

  // Null until a gateway is chosen. NEVER a PAN. The card number and CVC are entered
  // in the browser, used to derive `brand` and `last4`, and discarded — they are not
  // transmitted to this server and not stored.
  providerToken String?  @unique
  provider      String?

  brand         String
  last4         String
  expMonth      Int
  expYear       Int
  holderName    String?
  isDefault     Boolean  @default(false)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  orders        Order[]

  @@index([clientId])
}

model Order {
  paymentMethodType PaymentMethodType?   // enum already exists at schema.prisma:1049-1056
  savedCardId       String?
  savedCard         SavedCard? @relation(fields: [savedCardId], references: [id], onDelete: SetNull)
}
```

Add the `savedCards SavedCard[]` back-relation to `User`.

**Do not add a `PAY_LATER` value to `PaymentMethodType`.** The admin page at `src/app/admin/(sections)/finance/payment-methods/page.tsx` iterates the whole enum and would immediately render a fourth toggleable row that nobody asked for. "Pay later" maps onto the existing `CASH` value and is labelled in the client UI only.

**Business purchase-order reference:**

```prisma
model Order {
  // Business clients only. A free-text PO number or cost-centre code the client's own
  // finance team needs on the record. Individual clients never see the field.
  purchaseOrderRef String?
}
```

### Seed: body-type mapping

`prisma/seed.ts:62-302` seeds eleven vehicle types. Populate `bodyTypes` per type as follows. **The handoff's table names `1.7 m Van`, `2.5 m Van`, `3.5 t Truck` and `7 t Truck` — none of these exist.** Use the real catalogue:

| Seeded type | `bodyTypes` |
|---|---|
| Minivan | `[DRY_BOX]` |
| MPV / Estate | `[DRY_BOX]` |
| Cargo Van | `[DRY_BOX]` |
| Closed Box Van | `[DRY_BOX]` |
| Refrigerated Van | `[REFRIGERATED, DRY_BOX]` |
| Box Truck | `[DRY_BOX]` |
| Flatbed Truck | `[OPEN_CHASSIS]` |
| Curtainsider Truck | `[DRY_BOX, OPEN_CHASSIS]` |
| Refrigerated Truck | `[REFRIGERATED, DRY_BOX]` |
| Large Freight Truck | `[DRY_BOX]` |
| Trailer Truck | `[DRY_BOX]` |

Rationale, worth carrying as a comment: a reefer can run its box dry, so the two refrigerated types offer both; a curtainsider opens fully along both sides, so it satisfies an open-chassis requirement as well as a dry one; a flatbed has no enclosure and offers only open chassis.

**This mapping is a judgement call awaiting sign-off** — see `../action-required.md`. Seed it as written and flag it rather than blocking.

### No pricing change

**Do not add a body-type surcharge.** The catalogue already discriminates by body: Refrigerated Van and Refrigerated Truck are separate `VehicleTypeSpec` rows with their own `PricingRule`s, and Refrigerated Van already prices above Closed Box Van (`prisma/seed.ts:138-155`). A surcharge on top would double-charge a premium that already exists. If a reefer should cost more than it currently does, the fix is to raise that type's own `PricingRule` rates — a data change, not a code change.

### House rules that apply to every task in this spec

- British English in every doc comment and copy string.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] All six stop-contact columns exist on `Order`, nullable
- [ ] `ServiceLevel` enum exists; `Order.serviceLevel` defaults to `REGULAR`; `Order.serviceLevelAdjustment` defaults to `0`
- [ ] `VehicleTypeSpec.bodyTypes` is a `ChassisType[]`; `Order.bodyType` is a nullable `ChassisType`
- [ ] `ChassisType`'s doc comment no longer claims it takes no part in matching
- [ ] `SavedCard` exists with a nullable `providerToken`, a `clientId` index, and a doc comment stating that no PAN or CVC is ever stored
- [ ] `User.savedCards` and `Order.savedCard` relations resolve
- [ ] `Order.paymentMethodType`, `Order.savedCardId` and `Order.purchaseOrderRef` exist, all nullable
- [ ] `PaymentMethodType` still has exactly three values — no `PAY_LATER` was added
- [ ] The seed sets `bodyTypes` for all eleven vehicle types per the table above
- [ ] No `PricingRule` rate was changed by this task
- [ ] The migration applies cleanly against an existing database and `pnpm prisma generate` succeeds
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

`prisma/migrations/20260902120000_order_helper_count/` already exists in the tree and handles the helper-count work: it adds `Order.helperCount`, backfills from `requiresHelper`, drops `requiresHelper`, and flattens every `PricingRule.helperFee` to 40. **Do not duplicate or revert any of it.** Handoff server-change §3 is already delivered.
