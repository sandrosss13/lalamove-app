# Task 01: Schema & migration

## Status

complete

## Wave

1

## Description

Adds everything the load board needs to the Prisma schema in one migration: the
physical description of a load (weight and L/W/H) that makes the board's
vehicle-fit filter possible, the handling-requirement vocabulary, a
human-readable order reference, the stored commission rate and driver payout, and
the `LoadRejection` table that records a driver hiding a load from their own
board.

Every other task in this feature reads columns defined here, so the names below
are contractual — do not rename them. Ten other task files quote this schema
verbatim.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-04-booking-cargo-step, task-05-create-order-persistence, task-06-loads-api, task-07-reject-api, task-08-claim-api

## Files to Modify

- `prisma/schema.prisma` — new enum, new model, new `Order` columns and back-relations

## Files to Create

- `prisma/migrations/20260908120000_driver_load_board/migration.sql` — hand-authored SQL

## Technical Details

### Context you need

`Order` today describes a job commercially (a `vehicleTypeSpecId` the client
picked, a distance, a fare breakdown) but not **physically** — there is no
weight, no dimensions, no packaging. `VehicleTypeSpec` and `Vehicle` both carry
`maxPayloadKg`/`payloadKg` and `cargoLengthM`/`cargoWidthM`/`cargoHeightM`, so
the vehicle side of the comparison already exists; this task supplies the load
side.

`Order.price` is what the **client** pays. The platform takes 15% and the driver
receives 85%. Both the rate and the resolved amount are stored per order so that
retuning the commission later never rewrites what a historical job paid.

### 1. New enum

Add near the other cargo enums (`CargoCategory`, `ChassisType`):

```prisma
/// Handling requirements a client can attach to a load. Surfaced to drivers on
/// the load board as pills, and the first three are also filter chips.
///
/// `COLD_CHAIN` overlaps with `ChassisType.REFRIGERATED` but is not the same
/// thing: the chassis type is a property of the *vehicle body*, this is a
/// requirement of the *cargo*. A client can declare cold-chain cargo without
/// having picked a refrigerated body, and the mismatch is worth surfacing.
///
/// `HAZMAT` is an ADR licensing matter. Nothing in this schema gates it —
/// `DriverLicence` has no certification field — so it is a warning, not a
/// control. See `specs/driver-load-board/action-required.md`.
enum CargoHandlingTag {
  FRAGILE
  COLD_CHAIN
  HAZMAT
  TIME_CRITICAL
  UPRIGHT_ONLY
  HEAVY_ITEM
}
```

### 2. New `Order` columns

Add to `model Order`. Keep the existing comment style — this schema documents
*why*, not *what*.

```prisma
  /// Human-readable order reference in `GE-48210` form, shown to drivers on the
  /// board and read aloud to support. `Order.id` is a cuid, which nobody can
  /// dictate over a phone. Backfilled for every pre-existing order by this
  /// column's migration, so it is non-null from the start.
  ///
  /// The database default is what makes this column safe to deploy. It is
  /// `NOT NULL`, and `scripts/migrate-deploy.mjs` runs `prisma migrate deploy`
  /// ahead of `next build`, so for the length of a production build the *old*
  /// code — which has never heard of `reference` — is still serving traffic
  /// against the *new* column. Without a default, every order placed in that
  /// window would die on a not-null violation. Drawing from the sequence in the
  /// default means an insert that ignores this column still gets a valid, unique
  /// reference.
  ///
  /// The application nonetheless draws and passes the reference explicitly (see
  /// `src/lib/orders/reference.ts` and `POST /api/orders`): a value the client
  /// supplies is a value it already has, so the create response can carry the
  /// reference without a second round-trip to read back what the default
  /// generated. The default is the safety net, not the mechanism.
  ///
  /// The expression is spelled with its explicit casts because that is how
  /// Postgres stores it once normalised, and `prisma migrate diff` compares
  /// `dbgenerated` strings literally — writing the tidier
  /// `('GE-' || nextval('order_reference_seq'))` here reads better and reports
  /// as permanent schema drift on every run. The migration writes the tidy form;
  /// this is the same expression after the database has had its say.
  reference String @unique @default(dbgenerated("('GE-'::text || nextval('order_reference_seq'::regclass))"))

  /// The load's physical description, declared by the client at booking on top
  /// of the vehicle class they picked. All nullable: every order placed before
  /// the load board existed has none, and there is nothing to derive them from.
  ///
  /// These do **not** feed the quote — `src/lib/pricing.ts` prices a vehicle
  /// class, a distance and a helper count, and continues to. They exist so the
  /// board can hide a load that physically will not fit the vehicle a driver
  /// turns up in. A null here means "unknown", and the fit filter treats unknown
  /// as *not fitting* rather than assuming it does: a driver sent to a load that
  /// does not fit has wasted a trip, which is the costlier failure.
  cargoWeightKg Float?
  cargoLengthM  Float?
  cargoWidthM   Float?
  cargoHeightM  Float?

  /// Free text, shown on the board's Cargo column and in the detail drawer.
  /// `packagingDescription` is the form the load takes ("4 pallets"),
  /// `itemQuantity` is what is inside it ("96 cartons"). Two columns rather
  /// than one because the board shows the first under the cargo type and the
  /// second only in the drawer.
  packagingDescription String?
  itemQuantity         String?

  /// Handling requirements. Empty array, never null — an order with no special
  /// requirements has `[]`, which reads the same at every call site.
  handlingTags CargoHandlingTag[]

  /// The window the client will release the load in, and the time it must
  /// arrive by. `scheduledAt` above stays as it is: it is the single instant the
  /// booking form collects today, and these two refine it. All nullable for the
  /// same backfill reason as the cargo columns.
  pickupWindowStart DateTime?
  pickupWindowEnd   DateTime?
  deliveryDeadline  DateTime?

  /// The city at each end of the job, resolved server-side at booking from the
  /// structured address components the geocode lookup returns. Nullable, and
  /// deliberately so: an address outside the 63-value `GeorgianCity` enum (a
  /// village, a roadside depot) resolves to null rather than being forced into
  /// the nearest wrong city.
  ///
  /// The load board filters on these. It cannot filter on `pickupAddress` —
  /// that is free text a client typed, and matching "Tbilisi" against it would
  /// hit any address containing the word. Two enum columns are what make the
  /// board's two city dropdowns a real filter rather than a substring search.
  pickupCity  GeorgianCity?
  dropoffCity GeorgianCity?

  /// The platform's cut and the driver's resulting share, both resolved at
  /// creation and stored rather than computed on read. A global rate lives in
  /// `src/lib/orders/payout.ts`, but retuning it must not silently rewrite what
  /// a job completed last month paid — so the rate that applied is kept with the
  /// order. `driverPayout` is
  /// `(price + serviceLevelAdjustment) * (1 - commissionRate)`, rounded to whole
  /// tetri.
  ///
  /// **The basis is `price + serviceLevelAdjustment`, not `price` alone.** The
  /// adjustment is stored beside `price` rather than folded into it (see its own
  /// comment above), and `POST /api/orders/[id]/pay` charges the client the sum
  /// of the two. Commissioning `price` by itself would hand the platform the
  /// entire Priority uplift: on a 100 GEL fare at PRIORITY the client pays 125,
  /// and a price-only payout leaves the driver 85 against a 40 platform take —
  /// 32%, not 15%.
  ///
  /// `driverPayout` is the ONLY money figure a driver may be shown. `price`,
  /// `serviceLevelAdjustment` and the fare components are the client's total and
  /// must never reach a driver-facing surface.
  ///
  /// The commission is taken from everything the client pays. `helperFee` is
  /// already a component of `price`, so it is commissioned by construction and
  /// needs nothing further. `overtimeFee` is not — it is settled separately at
  /// completion — so it carries its own payout column below.
  commissionRate Float @default(0.15)
  driverPayout   Float @default(0)

  /// The driver's share of `overtimeFee`, resolved when the order completes and
  /// the overtime is known. Kept in its own column rather than folded into
  /// `driverPayout` so that `driverPayout` keeps ONE stable meaning: what the
  /// job was quoted to pay, which is the figure the load board shows a driver
  /// while they decide whether to take it. A figure that silently grew after
  /// completion would make the board's number and the earnings screen's number
  /// disagree for the same job.
  ///
  /// Total driver earnings for an order are `driverPayout + overtimeDriverPayout`.
  /// Commissioned at the same `commissionRate` stored above, so a rate change
  /// between booking and completion cannot apply two different rates to one job.
  overtimeDriverPayout Float @default(0)

  /// Drivers and companies who have hidden this load from their own board.
  rejections LoadRejection[]
```

### 3. New `LoadRejection` model

Add after `model Order`:

```prisma
/// One driver's (or one company's) decision to hide an open load from their own
/// board. Deliberately *not* a cancellation: the client's booking is untouched
/// and every other driver still sees it.
///
/// Exactly one of `driverProfileId` / `companyId` is set, matching whichever
/// kind of account did the rejecting. Two partial-looking unique constraints
/// rather than one: Postgres treats NULLs as distinct in a unique index, so
/// `@@unique([orderId, driverProfileId])` constrains driver rows and simply does
/// not apply to company rows (whose `driverProfileId` is NULL), and vice versa.
/// The pair therefore gives exactly one rejection per order per account without
/// needing a partial index Prisma cannot express.
///
/// Rows are kept after the load is claimed by someone else rather than cleaned
/// up: this is the raw signal an acceptance-rate model would be built from, and
/// it cannot be backfilled. Nothing reads it that way yet.
model LoadRejection {
  id String @id @default(cuid())

  orderId String
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  driverProfileId String?
  driverProfile   DriverProfile? @relation(fields: [driverProfileId], references: [id], onDelete: Cascade)

  companyId String?
  company   LogisticsCompany? @relation(fields: [companyId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([orderId, driverProfileId])
  @@unique([orderId, companyId])
  @@index([driverProfileId])
  @@index([companyId])
}
```

### 4. Back-relations

Add to `model DriverProfile`:
```prisma
  loadRejections LoadRejection[]
```
Add to `model LogisticsCompany`:
```prisma
  loadRejections LoadRejection[]
```

### 5. The migration SQL

`prisma/migrations/20260908120000_driver_load_board/migration.sql`. The
reference column needs a four-step add-backfill-constrain-default because it is
`NOT NULL UNIQUE` on a table that already has rows, and because it must survive
a deployment window in which the previous build is still inserting orders that
name no reference at all.

```sql
-- Handling requirements a client can attach to a load.
CREATE TYPE "CargoHandlingTag" AS ENUM (
  'FRAGILE', 'COLD_CHAIN', 'HAZMAT', 'TIME_CRITICAL', 'UPRIGHT_ONLY', 'HEAVY_ITEM'
);

-- Load reference sequence. Starts high so the first reference reads as an
-- established business rather than advertising that this is order number one.
CREATE SEQUENCE "order_reference_seq" START WITH 48200 INCREMENT BY 1;

-- Physical description of the load. All nullable: pre-existing orders have none.
ALTER TABLE "Order"
  ADD COLUMN "cargoWeightKg"        DOUBLE PRECISION,
  ADD COLUMN "cargoLengthM"         DOUBLE PRECISION,
  ADD COLUMN "cargoWidthM"          DOUBLE PRECISION,
  ADD COLUMN "cargoHeightM"         DOUBLE PRECISION,
  ADD COLUMN "packagingDescription" TEXT,
  ADD COLUMN "itemQuantity"         TEXT,
  ADD COLUMN "handlingTags"         "CargoHandlingTag"[] DEFAULT ARRAY[]::"CargoHandlingTag"[],
  ADD COLUMN "pickupWindowStart"    TIMESTAMP(3),
  ADD COLUMN "pickupWindowEnd"      TIMESTAMP(3),
  ADD COLUMN "deliveryDeadline"     TIMESTAMP(3),
  ADD COLUMN "pickupCity"           "GeorgianCity",
  ADD COLUMN "dropoffCity"          "GeorgianCity",
  ADD COLUMN "commissionRate"       DOUBLE PRECISION NOT NULL DEFAULT 0.15,
  ADD COLUMN "driverPayout"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "overtimeDriverPayout" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill the payout for every existing order at the same 15% rate the default
-- records, rounded to whole tetri exactly as the application does.
UPDATE "Order" SET
  "driverPayout"         = ROUND((("price" + "serviceLevelAdjustment") * 0.85)::numeric, 2),
  "overtimeDriverPayout" = ROUND(("overtimeFee" * 0.85)::numeric, 2);

-- Reference: add nullable, backfill in creation order so early orders get low
-- numbers, then constrain.
ALTER TABLE "Order" ADD COLUMN "reference" TEXT;

UPDATE "Order" o
SET "reference" = 'GE-' || nextval('order_reference_seq')
FROM (SELECT "id" FROM "Order" ORDER BY "createdAt" ASC) ordered
WHERE o."id" = ordered."id";

ALTER TABLE "Order" ALTER COLUMN "reference" SET NOT NULL;

-- Attach the default only now, after the backfill above has already numbered the
-- existing rows in `createdAt` order — a default set before the UPDATE would
-- have numbered them in physical order instead.
--
-- The default is what makes this migration safe to apply ahead of the code that
-- knows about the column. `scripts/migrate-deploy.mjs` runs `prisma migrate
-- deploy` before `next build`, so the previous deployment keeps serving traffic
-- against this new NOT NULL column for the length of a build; an insert from
-- that older code names no reference and would otherwise fail outright.
ALTER TABLE "Order"
  ALTER COLUMN "reference" SET DEFAULT ('GE-' || nextval('order_reference_seq'));

CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- Driver-scoped hide of an open load.
CREATE TABLE "LoadRejection" (
  "id"              TEXT NOT NULL,
  "orderId"         TEXT NOT NULL,
  "driverProfileId" TEXT,
  "companyId"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoadRejection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoadRejection_orderId_driverProfileId_key"
  ON "LoadRejection"("orderId", "driverProfileId");
CREATE UNIQUE INDEX "LoadRejection_orderId_companyId_key"
  ON "LoadRejection"("orderId", "companyId");
CREATE INDEX "LoadRejection_driverProfileId_idx" ON "LoadRejection"("driverProfileId");
CREATE INDEX "LoadRejection_companyId_idx"       ON "LoadRejection"("companyId");

ALTER TABLE "LoadRejection"
  ADD CONSTRAINT "LoadRejection_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoadRejection"
  ADD CONSTRAINT "LoadRejection_driverProfileId_fkey"
  FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoadRejection"
  ADD CONSTRAINT "LoadRejection_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "LogisticsCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The board's hot query filters open, unassigned work.
CREATE INDEX "Order_status_driverId_companyId_idx"
  ON "Order"("status", "driverId", "companyId");

-- The board's city dropdowns filter on these.
CREATE INDEX "Order_pickupCity_idx"  ON "Order"("pickupCity");
CREATE INDEX "Order_dropoffCity_idx" ON "Order"("dropoffCity");
```

Mirror that final index in the schema's `model Order` block:
```prisma
  @@index([status, driverId, companyId])
  @@index([pickupCity])
  @@index([dropoffCity])
```

### 6. Apply and verify

```bash
pnpm exec prisma generate
pnpm exec prisma migrate deploy   # or `prisma db push` against a local database
pnpm typecheck
```

## Acceptance Criteria

- [ ] `CargoHandlingTag` exists with exactly the six values listed, in that order.
- [ ] `Order` has all seventeen new columns with the exact names above.
- [ ] `Order.reference` is `NOT NULL UNIQUE` and every pre-existing row has a
      distinct `GE-`-prefixed value assigned in `createdAt` order.
- [ ] An `INSERT` into `Order` that omits `reference` entirely succeeds and
      receives the next sequence value. This is not a nicety: `migrate deploy`
      runs before `next build`, so the previous deployment inserts orders against
      this column for the length of a build without knowing it exists.
- [ ] `Order.driverPayout` is backfilled to
      `(price + serviceLevelAdjustment) * 0.85` — NOT `price * 0.85`; the
      adjustment is a separate column the client is also charged — and
      `Order.overtimeDriverPayout` to `overtimeFee * 0.85`, both rounded to 2
      decimal places, for every pre-existing row.
- [ ] `Order.handlingTags` defaults to an empty array, never null.
- [ ] `Order.pickupCity` and `Order.dropoffCity` are nullable `GeorgianCity`
      columns and are indexed. Pre-existing orders keep null for both — there is
      no address string reliable enough to backfill them from.
- [ ] `LoadRejection` exists with both unique indexes, all three foreign keys
      cascading on delete, and back-relations on `Order`, `DriverProfile` and
      `LogisticsCompany`.
- [ ] `pnpm exec prisma generate` succeeds and `pnpm typecheck` passes.
- [ ] The migration applies cleanly to a database that already contains orders.

## Notes

- **Do not touch `src/lib/pricing.ts` or the estimate API.** The cargo columns
  are declared data; the quote is still built from vehicle class, distance, time
  and helpers. Adding weight to the fare is a separate, deliberate decision.
- The `commissionRate` default of `0.15` is a safety net for anything that
  writes an order without naming one. The application always names it
  explicitly — see task-02 and task-05.
- `ROUND(x::numeric, 2)` is required in the backfill: `ROUND(double precision, int)`
  does not exist in Postgres and will fail with a function-not-found error.
