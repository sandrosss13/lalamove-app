/**
 * Driver payout math: the platform's commission and the driver's share.
 *
 * Pure arithmetic only — no Prisma, no `server-only`, no side effects. Order
 * creation calls this on the server to stamp `Order.commissionRate`,
 * `Order.driverPayout` and `Order.helperPayout` at write time, and a browser
 * surface may preview a payout, so nothing here may drag database code into a
 * client bundle.
 *
 * **The stored columns are the source of truth, not this module.** Every read
 * path displays `Order.driverPayout` (+ `overtimeDriverPayout`) as written,
 * never a fresh computation, so retuning a rate changes what NEW orders pay
 * and never rewrites what an existing order promised a driver.
 *
 * ## Pricing model v1: what the commission is taken from
 *
 * Since v1 (`src/lib/pricing-engine.ts`) the platform's cut comes off the
 * **transport charge plus its tier adjustment only**. Helpers are a flat
 * pass-through service: the client pays `helperFee`, the driver receives all
 * of it as `helperPayout`.
 *
 * ```ts
 * // 1. At creation — `quotedOrderPayout` below:
 * basis        = roundCurrency(transportFare + serviceLevelAdjustment)
 * transportPay = driverPayoutFor(basis, commissionRate)   // commission = basis - transportPay
 * driverPayout = transportPay + helperFee                  // helperPayout = helperFee
 *
 * // 2. At completion — `overtimeDriverPayoutFor` below, at the rate STORED on
 * //    the order: the commissioned share of the vehicle waiting overtime plus
 * //    100% of the helper overtime, in `Order.overtimeDriverPayout`.
 *
 * // 3. At every read — no call at all: display the stored columns, summed by
 * //    `totalDriverEarnings`.
 * ```
 *
 * The basis is rounded **before** it is commissioned: `POST /api/orders/[id]/pay`
 * bills `roundCurrency(price + serviceLevelAdjustment)`, and 85% (or 88%…) of a
 * float sum carrying binary dust lands a tetri away from the same share of the
 * clean figure on a measurable fraction of amounts.
 *
 * `commissionRate` is per vehicle and trip type (`PricingRule.cityCommissionRate`
 * / `intercityCommissionRate`, resolved by `commissionRateFor`). Pre-v1 orders
 * were commissioned at a flat 15% of `price + serviceLevelAdjustment`, helpers
 * included; their stored figures stay as they are.
 */

/**
 * The flat rate every order was commissioned at before pricing model v1, and
 * still the default of `driverPayoutFor`/`platformCommissionFor` and of the
 * `Order.commissionRate` column. **Not** what new orders use — they stamp the
 * per-vehicle, per-trip-type rate from `PricingRule`. Kept for the dev seed
 * scripts and for reading pre-v1 orders.
 */
export const PLATFORM_COMMISSION_RATE = 0.15;

/**
 * Round a currency amount to whole tetri (2 decimal places).
 *
 * Reproduces `roundCurrency` from `src/app/api/orders/[id]/pay/route.ts` rather
 * than importing it — that copy is module-private there, as is the one in
 * `src/lib/pricing.ts`, and this module may not import from a route handler
 * anyway. The approach is identical on purpose, so every money figure in the
 * codebase lands on the same value.
 *
 * Why it matters beyond tidiness: `Order.price`, `Order.driverPayout` and
 * `Order.overtimeFee` are all Prisma/Postgres `Float` columns — IEEE 754 double
 * precision — so a plain multiplication carries binary-fraction dust. `0.07 *
 * 0.85` evaluates to `0.059499999999999997`, not `0.0595`. Multiplying by 100,
 * rounding, and dividing back snaps the result onto a clean 2-decimal value, the
 * smallest unit of GEL (1 tetri = GEL 0.01), so a driver's payout never renders
 * as `GEL 161.50000000000003`.
 *
 * It is also why the creation call site must round `transportFare +
 * serviceLevelAdjustment` *before* commissioning it rather than passing the raw
 * float sum. Both columns are individually 2-decimal clean, so their exact
 * decimal sum is too — but 85% of a whole number of tetri lands on an exact
 * half-tetri every 20 tetri, and at those boundaries the dust in the float
 * addition decides which way `Math.round` breaks the tie. The two orderings
 * disagree by a tetri on thousands of ordinary amounts (e.g. `price` 0.83 with a
 * 0.07 uplift pays 0.76 unrounded and 0.77 rounded). Rounding first matches what
 * `POST /api/orders/[id]/pay` actually bills the client, which is the figure the
 * driver's share must be 85% of.
 */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The driver's share of `amount` at `commissionRate`, rounded to whole tetri.
 *
 * **The only money figure a driver may ever be shown.** Every value the load
 * board's table, drawer, confirm dialog and per-km sub-line render to a driver
 * must trace back to this function's result as stored in `Order.driverPayout`,
 * never to `Order.price` — the client's total is not the driver's earnings and
 * must never be presented as such.
 *
 * `amount` is the client-paid figure being commissioned — deliberately named for
 * what it is rather than `price`, because `Order.price` is the wrong figure at
 * the creation call site. Since pricing model v1 it is
 * `roundCurrency(transportFare + serviceLevelAdjustment)` at creation (helpers
 * are not commissioned — use `quotedOrderPayout`, which adds them back) and
 * `Order.overtimeFee` at completion (use `overtimeDriverPayoutFor`, which adds
 * the helper overtime). The "only figure a driver may be shown" rule above
 * applies to the stored `driverPayout`, which includes the helper pass-through.
 *
 * `commissionRate` is an explicit parameter rather than being read implicitly
 * from the constant above, because order creation must pass the RESOLVED rate —
 * the one it is about to stamp onto the new order — through this same call, so
 * the value written to `Order.driverPayout` and the rate written to
 * `Order.commissionRate` are always computed from the same number. The default
 * keeps the function usable on its own, in a unit test or a quick admin script.
 */
export function driverPayoutFor(
  amount: number,
  commissionRate: number = PLATFORM_COMMISSION_RATE,
): number {
  return roundCurrency(amount * (1 - commissionRate));
}

/**
 * The platform's cut of `amount` at `commissionRate`.
 *
 * For admin and finance surfaces ONLY. No driver-facing code path may call this:
 * a driver sees neither `Order.price` nor anything derived from it.
 *
 * Computed as `amount - driverPayoutFor(amount, commissionRate)`, not
 * independently as `amount * commissionRate`. Subtracting the already-rounded
 * payout guarantees the two figures always sum back to exactly `amount`;
 * rounding both sides separately from `amount` could drift apart by a tetri on
 * some inputs, which is a confusing thing for a finance report to have to
 * explain.
 */
export function platformCommissionFor(
  amount: number,
  commissionRate: number = PLATFORM_COMMISSION_RATE,
): number {
  return roundCurrency(amount - driverPayoutFor(amount, commissionRate));
}

/**
 * Everything a driver earns from one order: the commissioned payout quoted at
 * booking, plus their share of any overtime settled at completion.
 *
 * The single definition of "what this job paid the driver". Earnings screens,
 * Excel exports and payout runs must all go through this rather than re-adding
 * the two columns at each site and risking one of them forgetting the second —
 * which is precisely the class of mistake that currently has the driver hub's
 * earnings screen summing the client's `price + overtimeFee` and presenting it
 * to drivers as their own.
 *
 * Takes the order shape rather than two loose numbers so a caller cannot
 * transpose the arguments, and rounds the sum because adding two `Float` columns
 * reintroduces the same binary-fraction dust each one was rounded free of.
 */
export function totalDriverEarnings(order: {
  driverPayout: number;
  overtimeDriverPayout: number;
}): number {
  return roundCurrency(order.driverPayout + order.overtimeDriverPayout);
}

/** The money a v1 order is stamped with at creation. */
export type QuotedOrderPayout = {
  /** `roundCurrency(transportFare + serviceLevelAdjustment)` — what is commissioned. */
  commissionBasis: number;
  /** The platform's cut of `commissionBasis`. Admin/finance only. */
  commission: number;
  /** The driver's share of the transport: `commissionBasis - commission`. */
  driverTransportPayout: number;
  /** = `helperFee`, passed through uncommissioned. `Order.helperPayout`. */
  helperPayout: number;
  /** `driverTransportPayout + helperPayout` — `Order.driverPayout`. */
  driverPayout: number;
};

/**
 * Pricing model v1's creation-time split (see this module's doc comment):
 * commission on `transportFare + serviceLevelAdjustment` at `commissionRate`,
 * helpers passed through.
 *
 * Sheet verification case: transport 400.21, adj 0, helpers 80, rate 0.12 ->
 * commission 48.03, driver transport 352.18, driverPayout 432.18.
 */
export function quotedOrderPayout({
  transportFare,
  serviceLevelAdjustment,
  helperFee,
  commissionRate,
}: {
  transportFare: number;
  serviceLevelAdjustment: number;
  helperFee: number;
  commissionRate: number;
}): QuotedOrderPayout {
  const commissionBasis = roundCurrency(transportFare + serviceLevelAdjustment);
  const driverTransportPayout = driverPayoutFor(
    commissionBasis,
    commissionRate,
  );
  const helperPayout = roundCurrency(helperFee);
  return {
    commissionBasis,
    commission: roundCurrency(commissionBasis - driverTransportPayout),
    driverTransportPayout,
    helperPayout,
    driverPayout: roundCurrency(driverTransportPayout + helperPayout),
  };
}

/**
 * `Order.overtimeDriverPayout` at completion: the driver's commissioned share
 * of the vehicle waiting overtime (`Order.overtimeFee`) PLUS 100% of the helper
 * overtime (`Order.helperOvertimeFee`). Helper overtime is folded into this one
 * column rather than given its own payout column so every earnings surface,
 * export and the wallet's `JOB_OVERTIME` posting — which all read
 * `overtimeDriverPayout` — include it without change.
 *
 * `commissionRate` must be the rate STORED on the order.
 */
export function overtimeDriverPayoutFor({
  overtimeFee,
  helperOvertimeFee,
  commissionRate,
}: {
  overtimeFee: number;
  helperOvertimeFee: number;
  commissionRate: number;
}): number {
  return roundCurrency(
    driverPayoutFor(overtimeFee, commissionRate) + helperOvertimeFee,
  );
}
