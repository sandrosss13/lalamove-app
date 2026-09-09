# Task 02: Payout & reference modules

## Status

complete

## Wave

1

## Description

Creates the two small, pure modules that the rest of the load board's money and
identifiers run through: `src/lib/orders/payout.ts`, which turns a client's
`Order.price` into the driver's 85% share, and `src/lib/orders/reference.ts`,
which formats the human-readable `GE-48210` order reference that drivers and
support read aloud over the phone instead of a cuid. Both modules are pure
functions with no side effects — they are consumed by task-05 (order creation,
which stamps `commissionRate`/`driverPayout`/`reference` onto a new `Order`) and
by task-06 (`GET /api/loads`, which surfaces `driverPayout` and `reference` to
drivers and must never leak `price`). Because neither module touches the
database or Next.js server context, they can also be imported by client
components — useful later if the board ever needs to preview a payout or format
a reference in the browser.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-05-create-order-persistence, task-06-loads-api

**Context from dependencies:** None. This task has no dependencies — it only
needs the field names on `Order` that this file documents directly, which come
from task-01-schema-and-migration.md (not required reading; the names are
repeated below). task-01 adds `Order.commissionRate` (`Float @default(0.15)`),
`Order.driverPayout` (`Float @default(0)`) and `Order.reference` (`String
@unique`, `GE-`-prefixed), plus a Postgres sequence named `order_reference_seq`
(created by task-01's migration, `START WITH 48200`) that produces the numeric
part of the reference. This task does not read or write those columns — it only
supplies the pure functions that task-05 will call to compute the values it
writes into them.

## Files to Create

- `src/lib/orders/payout.ts` — the 15% commission constant and the pure payout
  math derived from `Order.price`
- `src/lib/orders/reference.ts` — the `GE-` reference formatter and the name of
  the Postgres sequence that supplies its number

## Files to Modify

None.

## Technical Details

### Context you need

**The commission decision.** The platform takes 15% of what the client pays;
the driver receives the remaining 85%. `Order.price` is the client's total and
must never be shown to a driver as their earnings — `Order.driverPayout` is the
only money figure a driver may ever see, on the board's table, drawer, confirm
dialog and per-km sub-line alike. Both the rate that applied and the resolved
payout are stored **on the order at creation** (by task-05, using this
module's functions), not recomputed at read time, so that retuning the global
rate later never rewrites what a historical job actually paid a driver.

**The rate is a flat, global module constant — a settled decision, not a
placeholder.** Per
`specs/driver-load-board/requirements.md`'s Assumptions: "The 15% rate is
global and constant. It is a module constant, not an admin setting. Making it
configurable per client, per vehicle class or per campaign is a follow-up."
`specs/driver-load-board/action-required.md` lists this explicitly as an item
needing confirmation before this varies — cite it in the doc comment so a
future reader knows where the "should this vary" conversation lives, rather
than assuming the constant is an oversight.

**Rounding must match the codebase's one existing money-rounding function.**
`src/app/api/orders/[id]/pay/route.ts` already has this exact problem (an
amount derived from a `Float` column needs to land on a clean 2-decimal
currency value) and solves it with:

```ts
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
```

Reproduce this exact approach in `payout.ts` (a private local helper is fine;
do not import the one in the `pay` route, which is not exported). The reason
this matters and is not just a style nit: `Order.price` and `Order.driverPayout`
are both Postgres `Float`/Prisma `Float` columns, i.e. IEEE 754 double
precision, and a plain `price * 0.85` carries binary-fraction dust (e.g.
`190 * 0.85` alone is fine, but many other inputs are not — `0.07 * 0.85 =
0.059499999999999997...` in floating point). `Math.round(value * 100) / 100`
snaps the result back onto whole tetri (1 tetri = GEL 0.01) the same way the
`pay` route already does, so a driver's payout never displays as
`GEL 161.50000000000003`.

**The payout basis is `price`, not the full amount a client is charged.**
`Order.price` already excludes `overtimeFee` — overtime is settled separately
at job completion, after the fact, and is not part of the quoted price a
payout is computed from at booking time — and it already includes
`serviceLevelAdjustment` (the Priority/Pooling adjustment from
`src/lib/pricing.ts`, baked into `price` before the order is created). State
this basis explicitly in `payout.ts`'s doc comments so nobody "fixes" the
payout math later to add `serviceLevelAdjustment` on top of `price`, which
would double it.

**Whether the platform's cut should also apply to overtime and to the helper
fee is unresolved.** `specs/driver-load-board/action-required.md` asks: "Confirm
whether the platform's 15% should also be taken from overtime and from the
helper fee, or whether helpers are passed through to the driver in full."
Flag this as an open question in `payout.ts`'s doc comment, next to the payout
basis explanation — do not attempt to resolve it here; `overtimeFee` stays
entirely outside this module's math.

### Implementation Steps

1. Create `src/lib/orders/payout.ts`. Do **not** import `"server-only"` or
   anything from `@prisma/client`/`@/lib/prisma` — this module must be usable
   from a client component as well as a server one. It performs arithmetic
   only.
2. Export `PLATFORM_COMMISSION_RATE = 0.15` with the doc comment described
   above.
3. Write a private `roundCurrency` helper reproducing the `pay` route's
   rounding exactly (see Code Snippets).
4. Export `driverPayoutFor(price, commissionRate = PLATFORM_COMMISSION_RATE)`.
5. Export `platformCommissionFor(price, commissionRate =
   PLATFORM_COMMISSION_RATE)` as the complement — computed as `price -
   driverPayoutFor(price, commissionRate)`, **not** independently as `price *
   commissionRate`. Subtracting the already-rounded payout from `price`
   guarantees the two figures always sum exactly back to `price`; computing
   both sides independently from `price` with separate roundings could drift
   apart by a tetri on some inputs. Doc-comment that this function is for
   admin/finance surfaces only and that no driver-facing code path calls it —
   a driver only ever sees `driverPayoutFor`'s result.
6. Create `src/lib/orders/reference.ts`, same "no Prisma, no `server-only`"
   rule.
7. Export `ORDER_REFERENCE_SEQUENCE = "order_reference_seq"` — the literal
   Postgres sequence name task-01's migration creates
   (`prisma/migrations/20260908120000_driver_load_board/migration.sql`,
   `CREATE SEQUENCE "order_reference_seq" START WITH 48200 INCREMENT BY 1;`).
   This module does not call `nextval` itself — see the doc comment
   requirement below.
8. Export `formatOrderReference(sequenceValue: number): string` returning
   `` `GE-${sequenceValue}` ``.

### Code Snippets

`src/lib/orders/payout.ts`:

```ts
/**
 * Driver payout math: turns the client's `Order.price` into the driver's 85%
 * share, and the platform's complementary 15% cut.
 *
 * Pure arithmetic only — no Prisma, no `server-only`. `driverPayoutFor` is
 * called from `src/lib/orders/reference.ts`'s sibling module during order
 * creation (see task-05) to stamp `Order.commissionRate` and
 * `Order.driverPayout` at write time, and the *stored* columns — never a
 * fresh call to this function — are what every later read (the load board,
 * the driver hub, admin) actually displays. Retuning `PLATFORM_COMMISSION_RATE`
 * therefore changes what NEW orders pay out; it never rewrites what an
 * existing order already promised a driver.
 *
 * Payout basis: computed from `Order.price`, which INCLUDES
 * `serviceLevelAdjustment` (the Priority/Pooling adjustment from
 * `src/lib/pricing.ts` is already folded into `price` by the time an order is
 * created) and EXCLUDES `overtimeFee` (settled separately, after the job
 * completes, and never part of the quoted price a payout is computed from at
 * booking time). Whether the platform's 15% should also apply to overtime and
 * to the helper fee is an open question — see
 * `specs/driver-load-board/action-required.md` — and is deliberately left
 * unresolved by this module: it operates on `price` only.
 */

/**
 * The platform's cut of every order, as a fraction of `Order.price`.
 *
 * Flat and global by decision — asked and answered: one rate for every account
 * type (individual driver, sole proprietor, logistics company), every vehicle
 * class and
 * city, stamped onto each order at creation (see task-05) rather than read
 * fresh at display time, so retuning it never rewrites a historical payout.
 * Making it vary by client type, vehicle class or promo campaign is a
 * plausible follow-up — the schema already stores the rate per-order
 * specifically to make that change a pricing decision rather than a
 * migration — but it is not implemented here. See the "Confirm the 15%
 * commission is flat and global" decision recorded in
 * `specs/driver-load-board/action-required.md`.
 */
export const PLATFORM_COMMISSION_RATE = 0.15;

/**
 * Round a currency amount to whole tetri (2 decimal places).
 *
 * Reproduces `roundCurrency` from `src/app/api/orders/[id]/pay/route.ts`
 * exactly, rather than importing it (that function is not exported). Both
 * `Order.price` and `Order.driverPayout` are `Float` columns — IEEE 754
 * double precision — so a plain multiplication like `price * 0.85` can carry
 * binary-fraction dust (e.g. `0.07 * 0.85` evaluates to
 * `0.059499999999999997...`, not `0.0595`). `Math.round(value * 100) / 100`
 * snaps the result back onto a clean 2-decimal value, the smallest unit of
 * GEL (1 tetri = GEL 0.01).
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The driver's share of an order priced at `price`, at `commissionRate`
 * (defaulting to the current global rate). The ONLY money figure a driver may
 * ever be shown — every value the load board's table, drawer, confirm dialog
 * and per-km sub-line render to a driver must trace back to this function's
 * result (as stored in `Order.driverPayout`), never to `Order.price`.
 *
 * `commissionRate` is an explicit parameter, not implicitly read from the
 * constant above, because task-05 must pass the RESOLVED rate — the one it is
 * about to stamp onto the new order — through this same function, so the
 * value written to `Order.driverPayout` and the rate written to
 * `Order.commissionRate` are always computed from the same number.
 */
export function driverPayoutFor(
  price: number,
  commissionRate: number = PLATFORM_COMMISSION_RATE,
): number {
  return roundCurrency(price * (1 - commissionRate));
}

/**
 * The platform's cut of an order priced at `price`, at `commissionRate`. For
 * admin/finance surfaces ONLY — no driver-facing code path may call this;
 * drivers never see `Order.price` or any value derived from it.
 *
 * Computed as `price - driverPayoutFor(price, commissionRate)`, not
 * independently as `price * commissionRate`: subtracting the already-rounded
 * payout from `price` guarantees the two figures always sum exactly back to
 * `price`. Rounding both sides separately from `price` could drift apart by a
 * tetri on some inputs, which would be a confusing thing for a finance report
 * to explain.
 */
export function platformCommissionFor(
  price: number,
  commissionRate: number = PLATFORM_COMMISSION_RATE,
): number {
  return roundCurrency(price - driverPayoutFor(price, commissionRate));
}
```

`src/lib/orders/reference.ts`:

```ts
/**
 * The human-readable order reference (`GE-48210` form) shown to drivers on
 * the load board and read aloud to support over the phone.
 *
 * `Order.id` is a cuid — nobody can dictate a cuid over a phone call, and
 * nobody should have to. `Order.reference` exists to be the identifier a
 * human actually uses.
 *
 * This module only formats a reference from an already-resolved sequence
 * number; it does NOT call `nextval` itself. Prisma has no native support
 * for reading a Postgres sequence, so the actual `nextval('order_reference_seq')`
 * call is made with `prisma.$queryRaw` inside order creation — see task-05.
 * Keeping the formatting pure (no Prisma import) means this function can also
 * run in a client component, e.g. to preview a reference's shape, without
 * pulling in database code.
 */

/**
 * Name of the Postgres sequence — created by task-01's migration
 * (`prisma/migrations/20260908120000_driver_load_board/migration.sql`) via
 * `CREATE SEQUENCE "order_reference_seq" START WITH 48200 INCREMENT BY 1;` —
 * that supplies the numeric part of every order reference. Starts at 48200
 * rather than 1 so the first reference issued under this feature reads as an
 * established business, not order number one.
 */
export const ORDER_REFERENCE_SEQUENCE = "order_reference_seq";

/**
 * Format a resolved sequence value as the reference drivers and support see.
 *
 * The `GE-` prefix is provisional: `src/lib/admin/home-page-content.ts` has
 * unresolved `TODO(content)` markers around the brand name (`nav.wordmark`,
 * `brandName: "Lalamove Georgia"`), and `specs/driver-load-board/
 * action-required.md` flags the reference prefix as something to revisit once
 * the brand name is confirmed. Changing it later is a one-line edit here, not
 * a migration — the sequence itself carries no prefix.
 */
export function formatOrderReference(sequenceValue: number): string {
  return `GE-${sequenceValue}`;
}
```

### What the commission is taken from

**The platform's 15% comes off everything the client pays.** Two consequences
this module must encode:

- **`helperFee` needs no special handling.** It is already one of the components
  summed into `Order.price` (alongside `baseFare`, `distanceFare` and `timeFare`,
  floored at the pricing rule's `minimumFare`; `serviceLevelAdjustment` is NOT
inside it). So
  `driverPayoutFor(price)` already commissions it. Say so in the doc comment —
  otherwise a future reader will "fix" a bug that does not exist by subtracting
  it twice.
- **`overtimeFee` does need special handling.** It is settled separately when the
  order completes, on top of `price`, and is therefore NOT inside the figure
  `driverPayoutFor(price)` sees. It gets its own commissioned column,
  `Order.overtimeDriverPayout`, written at completion.

The same function serves both — `driverPayoutFor` takes an amount, not
specifically a price — so no second function is needed. Document the two call
sites explicitly:

```ts
// At booking (task-05):
driverPayout = driverPayoutFor(price, PLATFORM_COMMISSION_RATE)

// At completion (task-15), using the rate STORED on the order, never the
// current constant — a rate change between booking and completion must not
// apply two different rates to one job:
overtimeDriverPayout = driverPayoutFor(overtimeFee, order.commissionRate)
```

Total driver earnings for an order are `driverPayout + overtimeDriverPayout`.
Add a short exported helper for that sum so every earnings surface computes it
identically:

```ts
/**
 * Everything a driver earns from one order: the quoted payout plus their share
 * of any overtime settled at completion. The single definition of "what this
 * job paid the driver" — earnings screens, exports and payout runs must all use
 * this rather than re-adding the two columns and risking one of them forgetting.
 */
export function totalDriverEarnings(order: {
  driverPayout: number;
  overtimeDriverPayout: number;
}): number {
  return roundCurrency(order.driverPayout + order.overtimeDriverPayout);
}
```

### The payout basis is `price + serviceLevelAdjustment`

**Correction to an earlier draft of this spec, verified against the code.**
`Order.price` is NOT the client's total. `src/lib/pricing.ts` builds it as
`baseFare + distanceFare + timeFare + helperFee` floored at `minimumFare`, with
no tier adjustment; `serviceLevelAdjustment` is a separate column ("itemised
rather than folded into `price`", per both the schema and
`POST /api/orders`), and `POST /api/orders/[id]/pay` charges the client
`roundCurrency(order.price + order.serviceLevelAdjustment)`.

So the quoted payout basis is the sum of the two. `driverPayoutFor` itself does
not change — it takes an *amount*, not specifically a price — but every call
site must pass `price + serviceLevelAdjustment`, and this module's doc comments
must say so plainly, because the natural mistake is to pass `price`.

On a 100 GEL fare at PRIORITY (+25%) the client pays 125. Passing `price` alone
pays the driver 85 and leaves the platform 40 — a 32% take. Passing the sum pays
106.25 and 18.75, which is the 15% rule.

This also settles a question `src/lib/pricing.ts` records as open — whether the
Priority/Pooling adjustment reaches the driver, the platform, or is split. It
reaches the driver, at the same 85%, and a Pooling discount reduces their payout
correspondingly.

## Acceptance Criteria

- [ ] The doc comments state that the quoted payout basis is
      `price + serviceLevelAdjustment`, and that passing `price` alone is the
      mistake to avoid.

- [ ] The `payout.ts` doc comments state that `helperFee` is already inside
      `price` and therefore already commissioned, and that `overtimeFee` is not.
- [ ] `totalDriverEarnings({ driverPayout: 161.5, overtimeDriverPayout: 8.5 })`
      returns `170`.

- [ ] `src/lib/orders/payout.ts` exports `PLATFORM_COMMISSION_RATE` equal to
      `0.15`.
- [ ] `driverPayoutFor(190)` returns `161.5`.
- [ ] `driverPayoutFor(0.07)` returns `0.06` (verifies the rounding helper
      correctly handles floating-point dust rather than returning
      `0.0595...` or `0.059`).
- [ ] `driverPayoutFor(100, 0.2)` returns `80` (verifies the optional
      `commissionRate` override is honoured instead of always using the
      module constant).
- [ ] `platformCommissionFor(190)` returns `28.5`.
- [ ] `platformCommissionFor(0.07)` returns `0.01`, and for every input,
      `driverPayoutFor(price) + platformCommissionFor(price)` equals
      `roundCurrency(price)` (no rounding drift between the two figures).
- [ ] `src/lib/orders/reference.ts` exports `ORDER_REFERENCE_SEQUENCE` equal
      to the string `"order_reference_seq"`.
- [ ] `formatOrderReference(48210)` returns `"GE-48210"`.
- [ ] Neither `payout.ts` nor `reference.ts` imports `"server-only"` or
      anything from `@prisma/client` or `@/lib/prisma` — verified by grep, and
      by both files being importable from a client component with no build
      error.
- [ ] `pnpm check` passes.

## Notes

- These modules are deliberately tiny and side-effect-free. Resist the urge
  to fold in the `$queryRaw` sequence call or the order-creation write here —
  those belong to task-05, which is the only place `Order.reference`,
  `Order.commissionRate` and `Order.driverPayout` are actually written.
- Do not export a default `commissionRate` of anything other than
  `PLATFORM_COMMISSION_RATE`; task-05 relies on the parameter defaulting to
  the current global rate when it does not have a more specific one to pass
  (it always will in practice, but the default keeps the function usable on
  its own, e.g. in a unit test or a quick admin script).
</content>
