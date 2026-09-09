/**
 * Driver payout math: turns an amount the client pays into the driver's 85%
 * share, and the platform's complementary 15% cut.
 *
 * Pure arithmetic only — no Prisma, no `server-only`, no side effects. That is
 * deliberate rather than incidental: order creation calls this on the server to
 * stamp `Order.commissionRate` and `Order.driverPayout` at write time, and the
 * load board may later want to preview a payout in the browser, so nothing here
 * may drag database code into a client bundle.
 *
 * **The stored columns are the source of truth, not this module.** Every read
 * path — the load board's table, the drawer, the confirm dialog, the driver
 * hub's earnings screen, the Excel export — displays `Order.driverPayout` as it
 * was written at creation, never a fresh call to `driverPayoutFor`. Retuning
 * `PLATFORM_COMMISSION_RATE` therefore changes what NEW orders pay out; it can
 * never rewrite what an existing order already promised a driver.
 *
 * ## What the commission is taken from
 *
 * The platform's cut comes off **everything the client pays** — the driver
 * receives 85% of the whole client-facing total, not of some inner component of
 * it. Three consequences a reader of this file needs to hold, because each looks
 * like a bug and none is:
 *
 * - **The quoted basis is `price + serviceLevelAdjustment`, not `price`.** This
 *   is the one genuine trap in this module, and the reason `driverPayoutFor`
 *   takes an `amount` rather than a `price`. The Priority uplift and Pooling
 *   discount are itemised in their own column rather than folded into `price`
 *   (see `prisma/schema.prisma` and `POST /api/orders`, which writes the two
 *   figures separately), so `price` alone is *not* what the client is billed —
 *   `POST /api/orders/[id]/pay` charges
 *   `roundCurrency(order.price + order.serviceLevelAdjustment)`.
 *
 *   Passing `price` alone is therefore the specific mistake to avoid, and it is
 *   the natural one to make. It does not merely round oddly, it silently breaks
 *   the commission rate: a GEL 100 fare at PRIORITY (+25%) bills the client 125,
 *   so commissioning `price` alone pays the driver 85 and leaves the platform
 *   40 — a 32% effective take, not 15%. Commissioning the sum pays 106.25 to the
 *   driver and 18.75 to the platform, which is the rule. A Pooling discount cuts
 *   the driver's payout correspondingly: 100 at POOLING bills 90 and pays 76.50.
 *
 *   This is settled, not open. `src/lib/pricing.ts` used to record "whether the
 *   adjustment reaches the driver, the platform, or is split" as an unanswered
 *   question against `PRIORITY_UPLIFT`/`POOLING_DISCOUNT`; the answer is that it
 *   reaches the driver, at the same 85% as everything else the client pays.
 * - **`helperFee` needs no handling here — it is already commissioned.** It is
 *   one of the components summed into `Order.price` by `estimateDelivery` in
 *   `src/lib/pricing.ts` (`baseFare + distanceFare + timeFare + helperFee`,
 *   floored at the pricing rule's `minimumFare`), so `driverPayoutFor(price)`
 *   commissions it by construction. Do not subtract it separately; doing so
 *   would take the platform's cut off it twice.
 * - **`overtimeFee` does need handling, and gets it elsewhere.** It is settled
 *   separately when the order completes, on top of `price`, so it is *not*
 *   inside the figure `driverPayoutFor(price)` sees. It is commissioned into its
 *   own column, `Order.overtimeDriverPayout`, written at completion. The same
 *   function serves both call sites — it takes an amount, not specifically a
 *   price — so there is no second function to keep in step:
 *
 * ## The three call sites
 *
 * There are exactly three, and between them they fix the basis so it cannot be
 * misread:
 *
 * ```ts
 * // 1. At creation, from the full quoted total the client is billed. Rounded
 * //    the same way `POST /api/orders/[id]/pay` rounds it before charging, so
 * //    the payout is 85% of the amount actually billed and not of a float sum
 * //    that differs from it by dust — see `roundCurrency` below for why that
 * //    distinction is worth a tetri:
 * driverPayout = driverPayoutFor(
 *   roundCurrency(price + serviceLevelAdjustment),
 *   PLATFORM_COMMISSION_RATE,
 * );
 *
 * // 2. At completion, from the overtime settled after the fact — using the rate
 * //    STORED on the order, never the current constant, so a rate change between
 * //    booking and completion cannot apply two different rates to one job:
 * overtimeDriverPayout = driverPayoutFor(overtimeFee, order.commissionRate);
 *
 * // 3. At every read — no call at all. Earnings screens, the board, exports and
 * //    admin display the STORED `driverPayout`/`overtimeDriverPayout` columns
 * //    (summed via `totalDriverEarnings`), never a recomputation.
 * ```
 */

/**
 * The platform's cut of every order, as a fraction of the amount the client
 * pays.
 *
 * Flat and global — asked and answered, not a placeholder awaiting a real
 * policy. One rate for every account type (individual driver, sole proprietor,
 * logistics company), every vehicle class and every city. It is a module
 * constant rather than an admin setting because there is nothing to configure:
 * `specs/driver-load-board/action-required.md` records the commission as settled
 * before implementation, with no outstanding decision against it.
 *
 * The rate is nonetheless stamped onto each order at creation rather than read
 * fresh at display time. That is not hedging about the value; it is what makes
 * retuning it safe, since a historical payout stays computed from the rate that
 * actually applied to it.
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
 * It is also why the creation call site must round `price +
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
 * the creation call site. It is `roundCurrency(price + serviceLevelAdjustment)`
 * at creation (the total the client is actually billed) and `Order.overtimeFee`
 * at completion. Passing `price` alone silently overcharges commission on every
 * PRIORITY order; see this module's doc comment for the arithmetic and for why
 * one function covers both call sites.
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
