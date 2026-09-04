/**
 * Tier arithmetic: what Priority, Regular and Pooling do to a quoted fare, and
 * whether the three lines a client reads on screen still add up afterwards.
 *
 * These are pure functions from `src/lib/pricing.ts`, so no browser and no
 * server are involved. Importing that module constructs the shared
 * `PrismaClient`, but Prisma connects lazily and nothing here issues a query,
 * so the spec touches no database.
 *
 * What this file deliberately does not cover:
 *
 * - **The booked half of the money trace.** `Order.serviceLevel` and
 *   `Order.serviceLevelAdjustment` are set server-side by `POST /api/orders`,
 *   and asserting that they match the tier the client chose means creating an
 *   order. `DATABASE_URL` points at production and a created order goes onto
 *   the live driver load board with no client-side cancel, so that assertion
 *   needs a test database before it can be written.
 * - **`estimateDelivery` end to end.** It reads `PricingRule` rows through
 *   Prisma and spends LocationIQ geocoding calls, so it needs a test database
 *   and a fixture key. `tests/landing-quote-calculator.spec.ts` covers the
 *   endpoint's observable behaviour instead, through the public calculator.
 */

import { expect, test } from "@playwright/test";

import {
  POOLING_DISCOUNT,
  PRIORITY_UPLIFT,
  priceForServiceLevel,
  serviceLevelAdjustment,
  type ServiceLevelKey,
} from "@/lib/pricing";

/**
 * Fares chosen to stress rounding rather than to be representative: zero and a
 * single cent (where a percentage of the fare rounds away to nothing), the
 * MPV's ₾12 minimum and the trailer truck's ₾90 — the two ends of the seeded
 * catalogue the tier rates were sized against — a fare whose thirds do not
 * terminate, and one carrying a third decimal that both the display and the
 * tier arithmetic have to round.
 */
const FARES = [0, 0.01, 12, 18.4, 33.33, 90, 1234.567];

/** Every tier, so each property below is asserted across all of them. */
const LEVELS: ServiceLevelKey[] = ["PRIORITY", "REGULAR", "POOLING"];

/**
 * The formatter every client-facing price goes through — the same `en-GB`,
 * two-decimal settings as `formatGel` in `src/components/orders-format.ts`,
 * `src/components/landing/landing-format.ts` and the driver hub's copies.
 * Restated here rather than imported because the property under test is that
 * the *displayed* figures reconcile, so the test has to format the way the
 * screens do without depending on which module a given screen formats through.
 */
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * A formatted price read back as whole cents.
 *
 * The reconciliation assertion is done in integers on purpose: adding the
 * *parsed* decimals back together would reintroduce exactly the binary-fraction
 * drift the assertion exists to rule out. The group separator has to come out
 * first — `en-GB` prints `1,234.57` once a fare passes a thousand.
 */
function displayedCents(formatted: string): number {
  return Math.round(Number(formatted.replace(/,/g, "")) * 100);
}

/**
 * Whether a figure lands on a whole number of cents.
 *
 * Tested with a tolerance rather than `Number.isInteger(value * 100)`, because
 * a rounded currency amount is not exactly representable in binary: `8.33 * 100`
 * is `832.9999999999999`, which is a whole number of cents that an exact
 * integer check would reject.
 */
function isWholeCents(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

test.describe("Service level adjustments", () => {
  test("charges a quarter more for Priority and a tenth less for Pooling", () => {
    // Stated against a fare of 100 so the rates read directly as percentages,
    // which is how the rate owner signed them off.
    expect(PRIORITY_UPLIFT).toBe(0.25);
    expect(POOLING_DISCOUNT).toBe(0.1);
    expect(serviceLevelAdjustment("PRIORITY", 100)).toBe(25);
    expect(serviceLevelAdjustment("POOLING", 100)).toBe(-10);
  });

  test("moves the fare up for Priority, down for Pooling and not at all for Regular", () => {
    for (const fare of FARES) {
      // Regular is the tier the quote is already priced at, so it adjusts by
      // nothing at every fare, the zero fare included.
      expect(serviceLevelAdjustment("REGULAR", fare)).toBe(0);
    }

    // A direction only exists where there is a fare to move: a percentage of
    // zero is zero in both directions, and a single cent rounds away entirely,
    // so neither says anything about the sign.
    for (const fare of FARES.filter((value) => value >= 1)) {
      expect(serviceLevelAdjustment("PRIORITY", fare)).toBeGreaterThan(0);
      expect(serviceLevelAdjustment("POOLING", fare)).toBeLessThan(0);
    }
  });

  test("prices a tier as the quoted fare plus that tier's adjustment", () => {
    for (const fare of FARES) {
      for (const level of LEVELS) {
        const adjustment = serviceLevelAdjustment(level, fare);

        // Compared in cents for the reason `displayedCents` records: the
        // right-hand side is a float sum, and `priceForServiceLevel` rounds it,
        // so the two agree to the cent rather than to the bit.
        expect(Math.round(priceForServiceLevel(level, fare) * 100)).toBe(
          Math.round((fare + adjustment) * 100),
        );
      }
    }
  });

  test("returns every tier figure as a whole number of cents", () => {
    for (const fare of FARES) {
      for (const level of LEVELS) {
        expect(isWholeCents(serviceLevelAdjustment(level, fare))).toBe(true);
        expect(isWholeCents(priceForServiceLevel(level, fare))).toBe(true);
      }
    }
  });

  /**
   * The property this file exists for.
   *
   * The booking form and the order card both print a three-line breakdown —
   * `Regular fare`, the tier line, then `Total` — each formatted to two
   * decimals by `formatGel` (`booking-form.tsx:2465-2493`,
   * `order-card.tsx:75-172`). A client reads those three numbers as a sum, so
   * the sum has to hold *in the printed figures*, not merely in the floats
   * behind them: rounding each of three independent values to the cent is
   * exactly the operation that lets a breakdown display 33.33 + 3.33 = 30.01.
   *
   * Verified by hand once during development. Asserting it here is what stops
   * it having to be verified by hand again.
   *
   * One precondition is worth naming, because it is what makes the property
   * true rather than merely usually true: a quoted fare is itself a whole
   * number of cents, since `estimateDelivery` rounds `price` before returning
   * it. A fare of `2.225` — which no quote can produce — displays as `2.22`
   * while the tier is computed from the unrounded value, and the three printed
   * lines then differ by a cent. `1234.567` is in the list above because a
   * third decimal is worth stressing anyway, and it happens to reconcile; a
   * failure there would mean the fare list had drifted away from what the
   * pricing engine can actually quote, not that the tiers had broken.
   */
  test("prints a fare, a tier line and a total that add up", () => {
    for (const fare of FARES) {
      for (const level of LEVELS) {
        const adjustment = serviceLevelAdjustment(level, fare);
        const total = priceForServiceLevel(level, fare);

        const displayedFare = GEL_FORMAT.format(fare);
        const displayedAdjustment = GEL_FORMAT.format(adjustment);
        const displayedTotal = GEL_FORMAT.format(total);

        expect(
          displayedCents(displayedFare) + displayedCents(displayedAdjustment),
          // Named in the message because a bare cent mismatch on one of
          // twenty-one combinations is otherwise unattributable.
          `${level} at a quoted fare of ${fare}: ` +
            `${displayedFare} + ${displayedAdjustment} should read as ${displayedTotal}`,
        ).toBe(displayedCents(displayedTotal));
      }
    }
  });
});
