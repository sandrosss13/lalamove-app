/**
 * The money and the helper-minute rules of closing a delivery
 * (`POST /api/orders/[id]/complete`), with nothing else attached.
 *
 * Deliberately free of runtime imports beyond the pure money and stop-work modules — no
 * `server-only`, no Prisma, no Next — so `tests/order-completion.spec.ts` can
 * pin every rule without a server or a database, the arrangement
 * `pod-rules.ts` has. The route asks this module for every decision, so each
 * rule has one statement.
 *
 * ## What completion settles
 *
 * Two after-the-fact charges, both reported by the driver at completion and
 * both billed to the client ON TOP of the quoted total, never folded into
 * `price`:
 *
 * - **Vehicle waiting overtime** — `Order.overtimeFee`: the waiting minutes
 *   beyond the vehicle type's `freeLoadingMinutes`, at its
 *   `overtimeRatePerMinute`. Commissioned at the order's stored
 *   `commissionRate`, exactly as before pricing model v1.
 * - **Helper overtime** (pricing model v1 only) — `Order.helperOvertimeFee`:
 *   per stop, `helpers * ceil(max(0, minutes - 60) / 30) * 10` (the rules are
 *   `PricingConfig`'s). Passed through to the driver in full.
 *
 * The driver's share of both lands in ONE column, `Order.overtimeDriverPayout`
 * (`overtimeDriverPayoutFor`), so every earnings surface and the wallet's
 * `JOB_OVERTIME` posting pick helper overtime up unchanged. The client is
 * billed `price + serviceLevelAdjustment + overtimeFee + helperOvertimeFee` —
 * see `adminOrderTotalGel`, which the service document prints.
 *
 * ## Orders booked before v1
 *
 * `tariffVersion === null` marks them. They have no per-stop helpers, so no
 * helper minutes are asked for or stored, `helperOvertimeFee` stays 0 and
 * `overtimeDriverPayout` is `driverPayoutFor(overtimeFee, commissionRate)` —
 * byte for byte what completion wrote before v1.
 */

import { driverPayoutFor, overtimeDriverPayoutFor } from "@/lib/orders/payout";
import { helperMinutesRequired } from "@/lib/orders/stop-work";
import {
  DEFAULT_PRICING_CONFIG,
  orderHelperOvertimeFee,
  type HelperOvertimeRules,
} from "@/lib/pricing-engine";

/**
 * The most helper minutes one stop may report: a whole day. A cap rather than
 * none because the figure is billed to the client per started half hour, and a
 * mistyped extra digit should be refused rather than charged.
 */
export const MAX_HELPER_MINUTES = 24 * 60;

/** The two ends of a job, as the helper-minute fields name them. */
export type CompletionStop = "pickup" | "dropoff";

/**
 * Why the helper minutes were refused. Each maps to its own localised message
 * in the route (`errors.ordersComplete.*`).
 */
export type HelperMinutesDenial =
  | { kind: "INVALID"; stop: CompletionStop }
  | { kind: "REQUIRED"; stop: CompletionStop };

/**
 * One reported value, shape-checked: absent and `null` are the same answer
 * ("not reported"), anything else must be a whole number 0..`MAX_HELPER_MINUTES`.
 * Returns `undefined` for a malformed value.
 */
function readMinutes(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_HELPER_MINUTES
  ) {
    return undefined;
  }
  return value;
}

/**
 * Resolve the helper minutes to store, from the raw body fields and the order.
 *
 * - A malformed value (wrong type, fractional, negative, over a day) is refused
 *   at either stop, helpers or not — a client sending it is broken.
 * - A stop with helpers on a v1 order MUST be reported.
 * - A stop without helpers, and every stop of a pre-v1 order, stores `null`
 *   whatever was sent: there is no helper work there to have minutes.
 */
export function resolveHelperMinutes(
  raw: { pickupHelperMinutes: unknown; dropoffHelperMinutes: unknown },
  order: {
    tariffVersion: number | null;
    pickupHelpers: number;
    dropoffHelpers: number;
  },
):
  | {
      data: {
        pickupHelperMinutes: number | null;
        dropoffHelperMinutes: number | null;
      };
    }
  | { denial: HelperMinutesDenial } {
  const pickup = readMinutes(raw.pickupHelperMinutes);
  if (pickup === undefined) {
    return { denial: { kind: "INVALID", stop: "pickup" } };
  }
  const dropoff = readMinutes(raw.dropoffHelperMinutes);
  if (dropoff === undefined) {
    return { denial: { kind: "INVALID", stop: "dropoff" } };
  }

  // `helperMinutesRequired` is the one rule the driver screens gate on too
  // (through `StopWork`): v1 orders only — a pre-v1 order had no helper
  // overtime, even though the migration backfilled its per-stop helpers — and
  // only where helpers were booked.
  const pickupHasHelpers = helperMinutesRequired(
    order.tariffVersion,
    order.pickupHelpers,
  );
  const dropoffHasHelpers = helperMinutesRequired(
    order.tariffVersion,
    order.dropoffHelpers,
  );

  if (pickupHasHelpers && pickup === null) {
    return { denial: { kind: "REQUIRED", stop: "pickup" } };
  }
  if (dropoffHasHelpers && dropoff === null) {
    return { denial: { kind: "REQUIRED", stop: "dropoff" } };
  }

  return {
    data: {
      pickupHelperMinutes: pickupHasHelpers ? pickup : null,
      dropoffHelperMinutes: dropoffHasHelpers ? dropoff : null,
    },
  };
}

/** Round a currency amount to whole tetri. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The three money columns completion writes, in one update. */
export type CompletionMoney = {
  /** Vehicle waiting overtime billed to the client. Commissioned. */
  overtimeFee: number;
  /** Helper overtime billed to the client. 100% to the driver. */
  helperOvertimeFee: number;
  /** The driver's share of both — `Order.overtimeDriverPayout`. */
  overtimeDriverPayout: number;
};

/**
 * Everything completion charges and pays, from the reported minutes.
 *
 * `commissionRate` must be the rate STORED on the order, never the current
 * constant (see the route's comment). `helperRules` are the CURRENT
 * `PricingConfig` helper rules: the helper overtime rule is not stamped onto
 * the order, so — like the vehicle overtime rate, read live from the
 * vehicle type's `PricingRule` — it applies as configured at completion.
 */
export function completionMoney({
  order,
  waitingMinutes,
  freeLoadingMinutes,
  overtimeRatePerMinute,
  pickupHelperMinutes,
  dropoffHelperMinutes,
  helperRules,
}: {
  order: {
    tariffVersion: number | null;
    commissionRate: number;
    pickupHelpers: number;
    dropoffHelpers: number;
  };
  waitingMinutes: number;
  freeLoadingMinutes: number;
  overtimeRatePerMinute: number;
  pickupHelperMinutes: number | null;
  dropoffHelperMinutes: number | null;
  /** Null for a pre-v1 order, which never reads them. */
  helperRules: HelperOvertimeRules | null;
}): CompletionMoney {
  const overtimeMinutes = Math.max(0, waitingMinutes - freeLoadingMinutes);
  const overtimeFee = roundCurrency(overtimeMinutes * overtimeRatePerMinute);

  if (order.tariffVersion === null) {
    // Exactly the pre-v1 computation — see this module's doc comment.
    return {
      overtimeFee,
      helperOvertimeFee: 0,
      overtimeDriverPayout: driverPayoutFor(overtimeFee, order.commissionRate),
    };
  }

  const helperOvertimeFee = orderHelperOvertimeFee(
    {
      pickupHelpers: order.pickupHelpers,
      pickupMinutes: pickupHelperMinutes,
      dropoffHelpers: order.dropoffHelpers,
      dropoffMinutes: dropoffHelperMinutes,
    },
    helperRules ?? DEFAULT_PRICING_CONFIG,
  );

  return {
    overtimeFee,
    helperOvertimeFee,
    overtimeDriverPayout: overtimeDriverPayoutFor({
      overtimeFee,
      helperOvertimeFee,
      commissionRate: order.commissionRate,
    }),
  };
}
