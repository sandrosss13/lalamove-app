# Task 05: Create-order persistence

## Status

pending

## Wave

2

## Description

Extends `POST /api/orders` — the only place an `Order` row is ever created — to
validate the new cargo fields the booking form now collects, and to stamp every
new order with a human-readable reference, the platform's commission rate and
the driver's resulting payout. This is the write side of the load board's two
foundational decisions: without this task the fit filter (task-06) has nothing
real to filter on, and the board's every money figure (task-06 onward) has
nothing correct to read. `Order.price` is what the client pays; `Order.driverPayout`
(85% of it) is the only money figure a driver may ever be shown, and this route is
where that split is created — getting it wrong here is wrong everywhere
downstream that reads the order back.

## Dependencies

**Depends on:** task-01-schema-and-migration, task-02-payout-and-reference
**Blocks:** None

**Context from dependencies:** task-01-schema-and-migration adds these columns to
`Order` (exact names, contractual — quote them verbatim): `reference` (`String`,
`NOT NULL`, `UNIQUE`, `GE-48210` form); `cargoWeightKg`, `cargoLengthM`,
`cargoWidthM`, `cargoHeightM` (all `Float?`); `packagingDescription`,
`itemQuantity` (both `String?`); `handlingTags` (`CargoHandlingTag[]`, defaults
to `[]`, never null); `pickupWindowStart`, `pickupWindowEnd`, `deliveryDeadline`
(all `DateTime?`); `commissionRate` (`Float`, column default `0.15`, but the
application must always name it explicitly rather than lean on that default) and
`driverPayout` (`Float`, column default `0`). The enum `CargoHandlingTag` has
exactly six members: `FRAGILE`, `COLD_CHAIN`, `HAZMAT`, `TIME_CRITICAL`,
`UPRIGHT_ONLY`, `HEAVY_ITEM`. The migration also created a Postgres sequence
named `order_reference_seq`, starting at `48200`, that every `reference` is drawn
from — draws are permanent even if the surrounding transaction rolls back
(Postgres sequences are non-transactional by design), so a rolled-back order
insert leaves a harmless gap in the numbering; it must never leave two orders
sharing a reference.

task-02-payout-and-reference creates two pure modules this task calls directly:
`src/lib/orders/payout.ts`, exporting `PLATFORM_COMMISSION_RATE` (the constant
`0.15`) and `driverPayoutFor(price: number, commissionRate?: number): number`,
which returns `price * (1 - rate)` rounded to 2 decimal places; and
`src/lib/orders/reference.ts`, exporting `formatOrderReference(sequenceValue:
number): string` (returns the `GE-<n>` string) and the string constant
`ORDER_REFERENCE_SEQUENCE = "order_reference_seq"` (the sequence's name, for use
in the raw SQL below rather than hard-coding the literal a second time).

## Files to Create

None. Both modules this task imports were created by task-02.

## Files to Modify

- `src/lib/pricing.ts` — **comment only, no behaviour change.** The comment above
  `PRIORITY_UPLIFT` / `POOLING_DISCOUNT` still records "whether the adjustment
  reaches the driver, the platform, or is split" as an open question tracked in
  `specs/client-dashboard-booking-and-payment/action-required.md`, and says
  `src/lib/dashboard/hub/earnings.ts` must move with it. That question is now
  settled: the adjustment reaches the driver at the same 85%, and a Pooling
  discount reduces their payout correspondingly. Update the comment to record the
  answer and drop the pending-decision framing. Do not touch `PRIORITY_UPLIFT`,
  `POOLING_DISCOUNT`, `serviceLevelAdjustment()` or any other code in the file —
  and do NOT touch `earnings.ts`, which task-15 owns.

- `src/app/api/orders/route.ts` — extend `CreateOrderInput` and
  `parseCreateOrderBody` with the new fields; wrap the order insert and the
  reference draw in one transaction; stamp `commissionRate` and `driverPayout`;
  add the new columns to `ORDER_LIST_SELECT`.
- `src/lib/order-response-select.ts` — add `reference` and `driverPayout` to
  `ORDER_PARTY_SELECT`.

## Technical Details

### Context you need

`POST /api/orders` today hand-validates its body with `parseCreateOrderBody`,
which returns `{ data } | { error }` — there is no validation library in this
codebase and this task does not introduce one. The handler re-quotes the fare
server-side through `estimateDelivery` (never trusting a price the browser
sent), creates the order with `status: OrderStatus.INITIATED`, and returns the
raw created row with `NextResponse.json(created, { status: 201 })` — the
`prisma.order.create` call carries no `select`, so whatever columns exist on
`Order` are already in that response without further work. Settlement —
`INITIATED` → `PENDING`, the transition that puts a job in front of drivers —
happens in `settleOrderPayment` (`src/lib/orders/payment-settlement.ts`), whose
only caller is the separate route `POST /api/orders/[id]/pay`. `POST
/api/orders` does not call it and must go on not calling it: this task's job is
the insert, not the market transition.

`GET /api/orders` (same file) reads back a named allowlist, `ORDER_LIST_SELECT`,
because an unselected `findMany` returns every column of `Order` and that is
literally how this endpoint leaked stop contacts before. `src/lib/order-response
-select.ts` exports a second, separately-scoped allowlist, `ORDER_PARTY_SELECT`,
shared by the driver/company lifecycle endpoints (accept, start, complete,
claim, dispatch, cancel) that are not touched by this task.

### CRITICAL RULE

`Order.price` is what the **client** pays. `Order.driverPayout` (85% of
`price`) is the **only** money figure a driver may ever be shown. This route is
the single place that split is computed and written — every other task in this
feature (the board list, the drawer, the confirm dialog) trusts the value this
task stamps rather than recomputing it. Get the rate, the rounding or the source
`price` wrong here and it is wrong for the lifetime of the order.

### Implementation Steps

1. Import `CargoHandlingTag` alongside the enums already imported from
   `@prisma/client` at the top of `src/app/api/orders/route.ts`, and import
   `PLATFORM_COMMISSION_RATE`, `driverPayoutFor` from `@/lib/orders/payout` and
   `formatOrderReference`, `ORDER_REFERENCE_SEQUENCE` from
   `@/lib/orders/reference`.

2. Add a `CARGO_HANDLING_TAGS` constant next to the existing `SERVICE_LEVELS` /
   `BODY_TYPES` / `PAYMENT_METHOD_TYPES` constants (same
   `Object.values(SomeEnum)` pattern), and four bounds constants for the
   physical measurements. See Code Snippets.

3. Extend the `CreateOrderInput` type with the ten new fields (see Code
   Snippets) — all required (`Date`/`number`/`string`/`CargoHandlingTag[]`), not
   optional: the design puts every one of weight, each dimension, packaging,
   quantity, pickup window and delivery deadline on the booking form the client
   fills before submitting, so a body missing one is a stale or broken client,
   not a legitimate partial booking. This is deliberately different from the
   nullability of the *column*, which stays nullable only so pre-existing rows
   (backfilled by task-01's migration) can hold `null` — new rows created
   through this route always carry real values. `handlingTags` is the one
   exception: it may legitimately be empty, so it defaults to `[]` when the
   field is omitted rather than being rejected as missing.

4. Add four small parse helpers above `parseCreateOrderBody`, matching the
   existing hand-rolled style of `parseOptionalText` / `parseStopContact`
   exactly — same `{ value } | { error }` / `{ data } | { error }` return
   shape, same per-field error messages naming the field:
   - `parsePositiveMeasurement(value, fieldName, max, unit)` — for
     `cargoWeightKg` and the three dimensions.
   - `parseRequiredText(value, fieldName)` — for `packagingDescription` and
     `itemQuantity`; the same length cap as `parseOptionalText`
     (`FREE_TEXT_MAX_LENGTH`), but errors when the value is absent or blank
     instead of returning `null`.
   - `parseHandlingTags(value)` — array validation for `handlingTags`,
     de-duplicating rather than rejecting a repeat. This mirrors the established
     convention for exactly this situation: `citiesOfOperation` in
     `src/app/api/logistics-company/route.ts` (~line 151) and
     `licenceCategories` in
     `src/app/api/logistics-company/drivers/register/route.ts` (~line 260) both
     validate "every member is one of the enum's values" with `Array.isArray` +
     `.every(...)`, then collapse the array through `[...new Set(...)]` rather
     than failing the request — reasoning documented at both call sites as "a
     repeat is a UI/client slip, not something worth rejecting the whole
     request over." Reuse that reasoning verbatim in this function's comment.
   - `parseRequiredDate(value, fieldName)` — for `pickupWindowStart`,
     `pickupWindowEnd`, `deliveryDeadline`; same shape as the existing
     `scheduledAt` parsing inline in `parseCreateOrderBody` (string → `new
     Date(...)` → `Number.isNaN(date.getTime())` check), lifted out because it
     is now needed three times.

5. Inside `parseCreateOrderBody`, after the existing `purchaseOrderRef` block
   and before the function's final `return { data: { ... } }`, parse the six
   new inputs in this order, returning on the first error exactly like every
   check above it:
   1. `cargoWeightKg` via `parsePositiveMeasurement(record.cargoWeightKg,
      "cargoWeightKg", MAX_CARGO_WEIGHT_KG, "kg")`.
   2. `cargoLengthM`, `cargoWidthM`, `cargoHeightM`, same helper, their own
      maxima and unit `"m"`.
   3. `packagingDescription`, `itemQuantity` via `parseRequiredText`.
   4. `handlingTags` via `parseHandlingTags(record.handlingTags)`.
   5. `pickupWindowStart`, `pickupWindowEnd` via `parseRequiredDate`, then the
      ordering check: `pickupWindowEnd` must be strictly after
      `pickupWindowStart`, or return `{ error: "pickupWindowEnd must be after
      pickupWindowStart." }`.
   6. `deliveryDeadline` via `parseRequiredDate`, then: it must be strictly
      after `pickupWindowEnd`, or return `{ error: "deliveryDeadline must be
      after pickupWindowEnd." }`.

   Add all six parsed values to the returned `data` object.

6. In the `POST` handler, destructure the six new fields out of `parsed.data`
   alongside the existing ones.

7. **Do not** pass any of the new cargo fields into `estimateDelivery` /
   `QuoteInput` / anything in `src/lib/pricing.ts`. They are declared data the
   fare does not use — see Notes and the Out of Scope section below. The
   `estimateDelivery` call, its `!result.ok` handling and the
   `serviceLevelAdjustment` call all stay exactly as they are today.

8. Compute the payout figures immediately after `estimateDelivery` succeeds
   (i.e. once `breakdown.price` — the server-recomputed fare — exists), and
   before the order is created:
   ```ts
   const commissionRate = PLATFORM_COMMISSION_RATE;
   const driverPayout = driverPayoutFor(breakdown.price, commissionRate);
   ```
   `breakdown.price` is the same value the create call already writes to
   `price:` — the payout must be derived from that exact figure, computed after
   the server's own re-quote, never from anything the client submitted. Naming
   `commissionRate` explicitly here (rather than omitting the field and letting
   the column's `@default(0.15)` supply it) is deliberate: task-01's schema
   comment is explicit that the column default is a safety net for writes that
   forget to name a rate, not something this route is allowed to rely on.

9. Replace the single `prisma.order.create({ data: { ... } })` call with a
   `prisma.$transaction` that draws the reference and inserts the row together
   — see Code Snippets for the exact shape. The reference draw must happen
   **inside** this transaction, immediately before the `tx.order.create` call
   it feeds, not as a separate `await` before the transaction opens: if the
   insert fails for any reason (a constraint violation, a thrown error), the
   whole transaction rolls back and the reference is never observed anywhere —
   no row references it, so nothing depends on it. Because `nextval()` on a
   Postgres sequence is itself non-transactional, the counter still advances
   past the drawn value even on rollback; that produces a gap in the numbering,
   which is acceptable (task-01's design already accounts for it — the
   sequence "starts high" for unrelated reasons and gaps were never a
   correctness concern). What must never happen is *reuse*: two different
   orders ending up with the same `reference`. Drawing the value with
   `nextval` and inserting it in the same transaction as the row that carries
   it is what rules that out — `nextval` itself is atomic and never returns the
   same value twice, transaction or not.

10. Everything else in the `data:` object passed to `tx.order.create` stays
    exactly as it is today (`status: OrderStatus.INITIATED`, every existing
    field), with `reference`, `commissionRate`, `driverPayout`,
    `cargoWeightKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`,
    `packagingDescription`, `itemQuantity`, `handlingTags`,
    `pickupWindowStart`, `pickupWindowEnd`, `deliveryDeadline` added to it.

11. `return NextResponse.json(created, { status: 201 })` stays as it is: the
    create call still carries no `select`, so the new columns are already in
    that response with no further change. Leave the comment above the return
    (the "deliberately not settled here" block) in place — it still describes
    this route's behaviour correctly, since this task does not call
    `settleOrderPayment` and does not touch `POST /api/orders/[id]/pay`.

12. Add the twelve new **driver/board-relevant** columns to `ORDER_LIST_SELECT`
    (used by `GET` in the same file, ~line 509): `reference`, `cargoWeightKg`,
    `cargoLengthM`, `cargoWidthM`, `cargoHeightM`, `packagingDescription`,
    `itemQuantity`, `handlingTags`, `pickupWindowStart`, `pickupWindowEnd`,
    `deliveryDeadline`, `driverPayout`. Do **not** add `commissionRate` — it is
    an internal figure with no consumer on any existing surface, matching how
    `savedCardId` / `purchaseOrderRef` are deliberately excluded from this same
    select today. This is an additive, non-behavioural change: it does not
    touch `GET`'s `where` clause, its role branching, or its contact-redaction
    logic, so it does not conflict with the requirement's "no changes to `GET
    /api/orders`" (that constraint is about not building the board's
    filtering/fit logic into this endpoint — task-06 owns a dedicated
    `/api/loads` endpoint for that — not about freezing this constant against
    the same additive maintenance every other column on `Order` already gets).
    `GET /api/orders` still returns `price` unfiltered to a driver looking at
    open `PENDING` work, exactly as it does today; that is a pre-existing
    condition of this endpoint and out of scope for this task to fix — see
    Notes.

13. In `src/lib/order-response-select.ts`, add `reference: true` and
    `driverPayout: true` to `ORDER_PARTY_SELECT`. Do not add
    `commissionRate` (internal only). Leave `price: true` exactly where it is:
    it is genuinely needed there for the client's own view of an order they are
    party to. Update the doc comment above `ORDER_PARTY_SELECT` to note that
    `reference` and `driverPayout` are now included, and that any route or UI
    that reads this select for a **driver-facing** response must render
    `driverPayout`, never `price` — that redaction is the responsibility of
    each such call site (none of which this task modifies) and is flagged here
    rather than silently left for someone to discover later.

14. Run `pnpm typecheck` and `pnpm lint`; fix anything either surfaces.

### Resolving the pickup and dropoff city

task-01 added `Order.pickupCity` and `Order.dropoffCity`, both nullable
`GeorgianCity`. They exist because the load board filters by city and cannot do
so against `pickupAddress` — that is free text a client typed, and substring
matching "Tbilisi" against it would hit any address merely containing the word.

**Resolve them server-side, never from the request body.** The booking form
collects addresses through the geocode lookup at `/api/geocode/details`, which
returns structured address components alongside the coordinates. Map the
locality component onto the `GeorgianCity` enum using the 63-value list mirrored
in `src/lib/georgian-cities.ts` (whose `value` strings are exactly the enum
members — go read it), matching case-insensitively on the `label`.

An address that maps to nothing in the enum — a village, a roadside depot, a
border crossing — stores **null**, and that is correct rather than a failure. Do
not force it to the nearest city: a wrong city is worse than an absent one,
because the board's filter would then show the load to drivers filtering for a
city it is not in. A null simply means the load never matches a city filter,
while still appearing in the unfiltered board.

Do not reject an order because its city could not be resolved.

### The payout basis — read this before writing the stamping code

`Order.price` is NOT what the client pays. It is
`baseFare + distanceFare + timeFare + helperFee` floored at `minimumFare`.
`serviceLevelAdjustment` is stored **beside** it, not inside it, and
`POST /api/orders/[id]/pay` charges the client the sum of the two.

So stamp:

```ts
const commissionRate = PLATFORM_COMMISSION_RATE;
// Pre-round the basis. `roundCurrency` here is the same helper the pay route
// uses — see the rounding note below for why the raw sum is wrong.
const driverPayout = driverPayoutFor(
  roundCurrency(breakdown.price + adjustment),   // NOT breakdown.price alone,
                                                 // and NOT the unrounded sum
  commissionRate,
);
```

**The basis must be pre-rounded, and this is not cosmetic.** `POST
/api/orders/[id]/pay` bills the client `roundCurrency(order.price +
order.serviceLevelAdjustment)` — so the *rounded* sum is the amount actually
charged, and the driver's 85% has to be 85% of that same figure.

`price` and `serviceLevelAdjustment` are each individually clean to two
decimals, so their exact decimal sum is too — but 85% of a whole number of tetri
lands on an exact half-tetri every 20 tetri, and at those tie-break boundaries
the IEEE-754 dust in the float addition decides which way `Math.round` falls.
Sweeping prices from 0 to 3000 GEL against five adjustment values, **7,620
inputs pay a different amount** depending on whether the sum is pre-rounded. For
example a `price` of 0.83 with a 0.07 uplift yields `0.76` unrounded and `0.77`
rounded. The rounded form is correct because it matches what the client was
charged; the unrounded form computes the payout from a basis a tetri away from
the real transaction. The mistake is invisible without the sweep, which is why
it is spelled out here.

where `adjustment` is the value this route already computes via
`serviceLevelAdjustment(serviceLevel, breakdown.price)` and writes to the
`serviceLevelAdjustment` column. Both figures come from the server's own
re-derived quote; the client's submitted numbers are never trusted.

Passing `price` alone on a PRIORITY order hands the platform the entire uplift —
a 32% effective take on a 100 GEL fare instead of 15%.

### Code Snippets

Bounds constants and enum list, placed beside the existing `SERVICE_LEVELS` /
`BODY_TYPES` / `PAYMENT_METHOD_TYPES` constants:

```ts
const CARGO_HANDLING_TAGS = Object.values(CargoHandlingTag);

/**
 * Sane ceilings for a load's physical description. Generous relative to the
 * largest seeded `VehicleTypeSpec` today (24,000 kg / 13.6 × 2.48 × 2.7 m, a
 * semi-trailer) so a legitimately heavy or long load is never rejected by this
 * route — these exist to catch obvious garbage (a negative value, a stray
 * extra zero), not to second-guess a real fleet's capability. The vehicle-fit
 * comparison itself (task-03/task-06) is what actually decides whether a given
 * load suits a given vehicle; these bounds are this route's own sanity check,
 * independent of that.
 */
const MAX_CARGO_WEIGHT_KG = 30_000;
const MAX_CARGO_LENGTH_M = 20;
const MAX_CARGO_WIDTH_M = 3;
const MAX_CARGO_HEIGHT_M = 4;
```

Parse helpers, placed alongside `parseOptionalText` / `parseStopContact`:

```ts
/**
 * Validate one physical measurement: a finite number, strictly greater than
 * zero, no greater than `max`. `unit` is only used in the error message.
 */
function parsePositiveMeasurement(
  value: unknown,
  fieldName: string,
  max: number,
  unit: string,
): { value: number } | { error: string } {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > max
  ) {
    return {
      error: `${fieldName} must be a number greater than 0 and no more than ${max} ${unit}.`,
    };
  }
  return { value };
}

/**
 * Like `parseOptionalText`, but the field is required rather than optional:
 * absent, non-string or blank input is an error rather than `null`.
 */
function parseRequiredText(
  value: unknown,
  fieldName: string,
): { value: string } | { error: string } {
  if (typeof value !== "string") {
    return { error: `${fieldName} is required and must be a string.` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { error: `${fieldName} is required.` };
  }

  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    return {
      error: `${fieldName} must be ${FREE_TEXT_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { value: trimmed };
}

/**
 * Validate the handling-tag list: an array (or omitted), every member one of
 * `CargoHandlingTag`'s six values. De-duplicated rather than rejected — a
 * repeated tag is a UI slip, not an attack, matching the convention already
 * established for `citiesOfOperation`
 * (`src/app/api/logistics-company/route.ts`) and `licenceCategories`
 * (`src/app/api/logistics-company/drivers/register/route.ts`): both collapse a
 * validated array through a `Set` rather than failing the whole request over a
 * duplicate the client had no way to prevent.
 */
function parseHandlingTags(
  value: unknown,
): { value: CargoHandlingTag[] } | { error: string } {
  if (value === undefined || value === null) {
    return { value: [] };
  }

  if (!Array.isArray(value)) {
    return { error: "handlingTags must be an array when provided." };
  }

  const isHandlingTag = (tag: unknown): tag is CargoHandlingTag =>
    typeof tag === "string" && CARGO_HANDLING_TAGS.includes(tag as CargoHandlingTag);

  if (!value.every(isHandlingTag)) {
    return {
      error: `handlingTags must contain only: ${CARGO_HANDLING_TAGS.join(", ")}.`,
    };
  }

  return { value: [...new Set(value as CargoHandlingTag[])] };
}

/**
 * Like the inline `scheduledAt` parsing above, lifted out because the three
 * cargo timestamps repeat the same shape: a required ISO string that must
 * parse to a valid `Date`.
 */
function parseRequiredDate(
  value: unknown,
  fieldName: string,
): { value: Date } | { error: string } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { error: `${fieldName} is required.` };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: `${fieldName} must be a valid date and time.` };
  }

  return { value: date };
}
```

`CreateOrderInput` additions:

```ts
type CreateOrderInput = QuoteInput & {
  // ...existing fields unchanged...

  /** The load's physical description. Required — see Implementation Steps. */
  cargoWeightKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  packagingDescription: string;
  itemQuantity: string;
  /** Never undefined: an omitted body defaults this to `[]`. */
  handlingTags: CargoHandlingTag[];
  pickupWindowStart: Date;
  pickupWindowEnd: Date;
  deliveryDeadline: Date;
};
```

The validation block inside `parseCreateOrderBody`, inserted after the existing
`purchaseOrderRef` check and folded into the final `return { data: { ... } }`:

```ts
  const cargoWeightKg = parsePositiveMeasurement(
    record.cargoWeightKg,
    "cargoWeightKg",
    MAX_CARGO_WEIGHT_KG,
    "kg",
  );
  if ("error" in cargoWeightKg) {
    return cargoWeightKg;
  }

  const cargoLengthM = parsePositiveMeasurement(
    record.cargoLengthM,
    "cargoLengthM",
    MAX_CARGO_LENGTH_M,
    "m",
  );
  if ("error" in cargoLengthM) {
    return cargoLengthM;
  }

  const cargoWidthM = parsePositiveMeasurement(
    record.cargoWidthM,
    "cargoWidthM",
    MAX_CARGO_WIDTH_M,
    "m",
  );
  if ("error" in cargoWidthM) {
    return cargoWidthM;
  }

  const cargoHeightM = parsePositiveMeasurement(
    record.cargoHeightM,
    "cargoHeightM",
    MAX_CARGO_HEIGHT_M,
    "m",
  );
  if ("error" in cargoHeightM) {
    return cargoHeightM;
  }

  const packagingDescription = parseRequiredText(
    record.packagingDescription,
    "packagingDescription",
  );
  if ("error" in packagingDescription) {
    return packagingDescription;
  }

  const itemQuantity = parseRequiredText(record.itemQuantity, "itemQuantity");
  if ("error" in itemQuantity) {
    return itemQuantity;
  }

  const handlingTags = parseHandlingTags(record.handlingTags);
  if ("error" in handlingTags) {
    return handlingTags;
  }

  const pickupWindowStart = parseRequiredDate(
    record.pickupWindowStart,
    "pickupWindowStart",
  );
  if ("error" in pickupWindowStart) {
    return pickupWindowStart;
  }

  const pickupWindowEnd = parseRequiredDate(
    record.pickupWindowEnd,
    "pickupWindowEnd",
  );
  if ("error" in pickupWindowEnd) {
    return pickupWindowEnd;
  }

  if (pickupWindowEnd.value.getTime() <= pickupWindowStart.value.getTime()) {
    return { error: "pickupWindowEnd must be after pickupWindowStart." };
  }

  const deliveryDeadline = parseRequiredDate(
    record.deliveryDeadline,
    "deliveryDeadline",
  );
  if ("error" in deliveryDeadline) {
    return deliveryDeadline;
  }

  if (deliveryDeadline.value.getTime() <= pickupWindowEnd.value.getTime()) {
    return { error: "deliveryDeadline must be after pickupWindowEnd." };
  }

  return {
    data: {
      ...quote.data,
      // ...existing returned fields unchanged...
      cargoWeightKg: cargoWeightKg.value,
      cargoLengthM: cargoLengthM.value,
      cargoWidthM: cargoWidthM.value,
      cargoHeightM: cargoHeightM.value,
      packagingDescription: packagingDescription.value,
      itemQuantity: itemQuantity.value,
      handlingTags: handlingTags.value,
      pickupWindowStart: pickupWindowStart.value,
      pickupWindowEnd: pickupWindowEnd.value,
      deliveryDeadline: deliveryDeadline.value,
    },
  };
```

The create call, replacing the single `prisma.order.create(...)` in `POST`:

```ts
  // Derived from the server's own quote, never from a figure the browser sent:
  // the client chooses a tier, not a price. Stored beside `price` rather than
  // folded into it, so the itemised breakdown still reconciles against its own
  // total and the minimum-fare floor keeps meaning what it says.
  const adjustment = serviceLevelAdjustment(serviceLevel, breakdown.price);

  // The platform's cut and the driver's resulting share of the SAME `price`
  // this order is about to be created with — never a figure the client sent,
  // and never left to the column's default. `Order.driverPayout` is the only
  // money figure a driver may ever be shown; getting this wrong here is wrong
  // everywhere downstream that reads the order back.
  const commissionRate = PLATFORM_COMMISSION_RATE;
  const driverPayout = driverPayoutFor(breakdown.price, commissionRate);

  // Created `INITIATED` — off-market and unpaid — exactly as before; this
  // transaction only changes how the row acquires its human-readable
  // reference, not when the order becomes visible to anyone. Settlement is
  // still `POST /api/orders/[id]/pay`'s job alone.
  const created = await prisma.$transaction(async (tx) => {
    // Drawn inside the same transaction as the insert below: if the insert
    // fails, the whole transaction rolls back and this draw is never attached
    // to any row. `nextval` itself cannot be rolled back — Postgres sequences
    // are deliberately non-transactional — so a rolled-back insert still
    // leaves a gap in the numbering, which is fine: nothing depends on the
    // sequence being contiguous. What must never happen is two orders sharing
    // a reference, and drawing + inserting together is what rules that out.
    const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`
      SELECT nextval(${ORDER_REFERENCE_SEQUENCE}::regclass) AS value
    `;
    const reference = formatOrderReference(Number(value));

    return tx.order.create({
      data: {
        status: OrderStatus.INITIATED,
        reference,
        cargoCategory,
        bodyType,
        helperCount,
        description,
        scheduledAt,
        pickupAddress,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupContactName: pickupContact.name,
        pickupContactPhone: pickupContact.phone,
        pickupContactDetails: pickupContact.details,
        dropoffAddress,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffContactName: dropoffContact.name,
        dropoffContactPhone: dropoffContact.phone,
        dropoffContactDetails: dropoffContact.details,
        distanceKm,
        vehicleTypeSpecId,
        baseFare: breakdown.baseFare,
        distanceFare: breakdown.distanceFare,
        timeFare: breakdown.timeFare,
        helperFee: breakdown.helperFee,
        price: breakdown.price,
        serviceLevel,
        serviceLevelAdjustment: adjustment,
        paymentMethodType,
        savedCardId,
        purchaseOrderRef: businessPurchaseOrderRef,
        cargoWeightKg,
        cargoLengthM,
        cargoWidthM,
        cargoHeightM,
        packagingDescription,
        itemQuantity,
        handlingTags,
        pickupWindowStart,
        pickupWindowEnd,
        deliveryDeadline,
        commissionRate,
        driverPayout,
        clientId: session.user.id,
      },
    });
  });
```

The `ORDER_LIST_SELECT` addition (append to the existing object, do not remove
or reorder any current entry):

```ts
const ORDER_LIST_SELECT = {
  // ...every existing field unchanged...
  reference: true,
  cargoWeightKg: true,
  cargoLengthM: true,
  cargoWidthM: true,
  cargoHeightM: true,
  packagingDescription: true,
  itemQuantity: true,
  handlingTags: true,
  pickupWindowStart: true,
  pickupWindowEnd: true,
  deliveryDeadline: true,
  driverPayout: true,
  // commissionRate deliberately excluded — internal only, no consumer of this
  // endpoint has any business with the rate, only the resolved payout.
} as const;
```

The `ORDER_PARTY_SELECT` addition in `src/lib/order-response-select.ts` (append,
do not reorder):

```ts
export const ORDER_PARTY_SELECT = {
  // ...every existing field unchanged, including `price: true`...
  reference: true,
  driverPayout: true,
  // commissionRate deliberately excluded — see the file's updated doc comment.
} as const;
```

### API Endpoints

- `POST /api/orders` — request body gains, all required unless noted:
  - `cargoWeightKg: number` (0 < x ≤ 30000)
  - `cargoLengthM: number` (0 < x ≤ 20)
  - `cargoWidthM: number` (0 < x ≤ 3)
  - `cargoHeightM: number` (0 < x ≤ 4)
  - `packagingDescription: string` (1–200 chars)
  - `itemQuantity: string` (1–200 chars)
  - `handlingTags?: string[]` (optional, defaults to `[]`; each member one of
    `FRAGILE | COLD_CHAIN | HAZMAT | TIME_CRITICAL | UPRIGHT_ONLY |
    HEAVY_ITEM`, de-duplicated)
  - `pickupWindowStart: string` (ISO datetime)
  - `pickupWindowEnd: string` (ISO datetime, after `pickupWindowStart`)
  - `deliveryDeadline: string` (ISO datetime, after `pickupWindowEnd`)

  Response (`201`) gains on the created order object: `reference` (e.g.
  `"GE-48210"`), `commissionRate`, `driverPayout`, and the same cargo/window
  fields echoed back with their stored values. `400` on any validation failure
  above, with `{ error: "<message>" }` using the exact strings given in the
  Code Snippets.

- `GET /api/orders` — response rows gain `reference`, `cargoWeightKg`,
  `cargoLengthM`, `cargoWidthM`, `cargoHeightM`, `packagingDescription`,
  `itemQuantity`, `handlingTags`, `pickupWindowStart`, `pickupWindowEnd`,
  `deliveryDeadline`, `driverPayout`. No other change to this endpoint's
  behaviour, filtering, or auth.

## Acceptance Criteria

- [ ] `driverPayout` is computed from `roundCurrency(price +
      serviceLevelAdjustment)` — not `price` alone, and not the unrounded sum. An
      order quoted at 100 with PRIORITY (adjustment +25) stores `driverPayout`
      106.25, not 85. An order quoted at 0.83 with a 0.07 uplift stores 0.77,
      not 0.76.

- [ ] `pickupCity` and `dropoffCity` are resolved server-side from the geocode
      address components, never read from the request body.
- [ ] An address that maps to no `GeorgianCity` member stores null and the order
      is still created successfully.

- [ ] A `POST /api/orders` body missing any of `cargoWeightKg`, `cargoLengthM`,
      `cargoWidthM`, `cargoHeightM`, `packagingDescription`, `itemQuantity`,
      `pickupWindowStart`, `pickupWindowEnd` or `deliveryDeadline` is rejected
      with `400` and an error message naming the missing field.
- [ ] `cargoWeightKg` of `0`, a negative number, `NaN`/non-finite, or `30001` is
      rejected with `400`; `30000` is accepted. The same pattern holds for
      `cargoLengthM` (max `20`), `cargoWidthM` (max `3`) and `cargoHeightM`
      (max `4`).
- [ ] `handlingTags: ["NOT_A_TAG"]` is rejected with `400` naming all six valid
      values. `handlingTags: ["FRAGILE", "FRAGILE"]` is **accepted** and the
      order is created with `handlingTags: ["FRAGILE"]` (de-duplicated, not
      rejected). An omitted `handlingTags` field creates the order with
      `handlingTags: []`.
- [ ] `packagingDescription` or `itemQuantity` longer than 200 characters is
      rejected with `400`.
- [ ] A body where `pickupWindowEnd` is equal to or before `pickupWindowStart`
      is rejected with `400` and the message `"pickupWindowEnd must be after
      pickupWindowStart."`. A body where `deliveryDeadline` is equal to or
      before `pickupWindowEnd` is rejected with `400` and the message
      `"deliveryDeadline must be after pickupWindowEnd."`.
- [ ] A successful order's `reference` matches `/^GE-\d+$/`. Two orders created
      back-to-back have distinct references with the second numerically
      greater than the first.
- [ ] The reference is drawn with `tx.$queryRaw` calling `nextval(...::regclass)`
      on `order_reference_seq` (via `ORDER_REFERENCE_SEQUENCE`), executed
      inside the same `prisma.$transaction` callback as the `tx.order.create`
      call that consumes it — not before the transaction opens, not in a
      separate un-awaited query.
- [ ] Every order created by this route has `commissionRate === 0.15`
      (`PLATFORM_COMMISSION_RATE`), set explicitly in the `data:` object passed
      to `create` — not omitted in reliance on the column's default.
- [ ] **Worked example:** a booking whose server-recomputed fare
      (`breakdown.price`) is `190` produces a created order with `price: 190`,
      `commissionRate: 0.15`, `driverPayout: 161.5`.
- [ ] The created order's `status` is `OrderStatus.INITIATED`. `POST
      /api/orders` does not call `settleOrderPayment`; `POST
      /api/orders/[id]/pay` remains its only caller, unmodified by this task.
- [ ] `GET /api/orders`'s `ORDER_LIST_SELECT` includes `reference`,
      `cargoWeightKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`,
      `packagingDescription`, `itemQuantity`, `handlingTags`,
      `pickupWindowStart`, `pickupWindowEnd`, `deliveryDeadline`,
      `driverPayout`, and does **not** include `commissionRate`. No other
      field, `where` clause, or role branching in `GET` changes.
- [ ] `ORDER_PARTY_SELECT` in `src/lib/order-response-select.ts` includes
      `reference` and `driverPayout`, still includes `price` unchanged, and
      does not include `commissionRate`.
- [ ] `src/lib/pricing.ts`, `QuoteInput`, `estimateDelivery` and `POST
      /api/pricing/estimate` are byte-for-byte unmodified by this task; none of
      the new cargo fields are ever passed into any of them.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm lint` passes.

## Notes

- **Out of scope, explicitly:** no changes to `src/lib/pricing.ts`, the fare
  breakdown, or `POST /api/pricing/estimate`. Cargo weight and dimensions are
  declared data captured for the fit filter (task-03/task-06); they do not, and
  must not, feed the quote. If implementing this task tempts you to thread
  `cargoWeightKg` into `QuoteInput` "since it's right there" — don't; that is a
  separate, deliberate product decision this spec does not make.
- **`GET /api/orders` still shows `price` to a driver browsing open `PENDING`
  work.** That is pre-existing behaviour, not something this task introduces or
  is asked to fix — the load board's own endpoint (task-06, `GET /api/loads`)
  is where the "driver only ever sees `driverPayout`" rule is actually enforced
  for the board. Adding `driverPayout` to `ORDER_LIST_SELECT` here gives a
  driver a correct figure to prefer, but does not remove the incorrect one; if
  that gap matters it is a follow-up, not this task's job.
- `driverPayoutFor` rounds to 2 decimal places (whole tetri) — the same
  rounding task-01's migration used to backfill `driverPayout` for pre-existing
  orders (`ROUND((price * 0.85)::numeric, 2)`), so a value computed by this
  route and a value backfilled by the migration are computed the same way.
- The reference sequence starting at `48200` and the `GE-` prefix are entirely
  task-01/task-02's concern; this task only calls `nextval` and
  `formatOrderReference` — it does not redefine either.
