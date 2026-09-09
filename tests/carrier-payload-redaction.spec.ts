/**
 * The carrier-facing response shape: what a driver or a logistics company may
 * be told about an order's money, and what only the client may be told.
 *
 * *"Driver should see only its net, not total paid."* `Order.price` and
 * `Order.overtimeFee` are what the CLIENT pays; `Order.driverPayout` and
 * `Order.overtimeDriverPayout` are what the carrier earns. Six lifecycle
 * endpoints — accept, start and complete under `/api/orders/[id]/`, and claim,
 * dispatch and cancel under `/api/logistics-company/orders/[id]/` — answer a
 * carrier, and all six build their response from `CARRIER_ORDER_PARTY_SELECT`.
 * This spec asserts that constant is actually redacted, and that
 * `ORDER_PARTY_SELECT` beside it still carries the client's full itemised
 * quote.
 *
 * **Why the select and not the HTTP response.** Asserting on the JSON would mean
 * creating an order, accepting it as a seeded driver and completing it — writes
 * against a database. `DATABASE_URL` on this project points at production, and a
 * created order goes onto the live driver load board with no client-side cancel,
 * so that test needs a test database before it can be written (the same
 * constraint `tests/service-level-pricing.spec.ts` records for the booked half
 * of the money trace). The select is nonetheless the right thing to pin: a
 * Prisma `select` is exactly the set of columns the query returns and the
 * handlers pass it through unmodified with `NextResponse.json`, so a key absent
 * here is a key absent from the body. Adding `price: true` back to that constant
 * is the concrete regression this file exists to catch, and it catches it
 * without a server.
 *
 * `src/lib/order-response-select.ts` has no imports at all — it is two object
 * literals — so this spec constructs nothing, connects to nothing and runs at
 * unit-test speed with no browser.
 *
 * What this deliberately does not cover: `DRIVER_ORDER_LIST_SELECT` in
 * `src/app/api/orders/route.ts` and `COMPANY_ORDER_LIST_SELECT` in
 * `src/app/api/logistics-company/orders/route.ts`. Both are route-local by
 * design — a listing endpoint must stay free to withhold more than the
 * lifecycle ones do — and importing either would pull a whole route module,
 * with its auth and Prisma imports, into the test process for one object
 * literal. They are built from the same rule and reviewed against this list.
 */

import { expect, test } from "@playwright/test";

import {
  CARRIER_ORDER_PARTY_SELECT,
  ORDER_PARTY_SELECT,
} from "@/lib/order-response-select";

/**
 * Every `Order` column describing what the CLIENT pays.
 *
 * They are listed as a set rather than checked one at a time because they have
 * to leave together: `price` is `baseFare + distanceFare + timeFare + helperFee`
 * floored at the pricing rule's `minimumFare` (`src/lib/pricing.ts`), so a
 * response that omits `price` while keeping its four components has withheld
 * nothing on any job above the floor. A test that only asserted `price` was
 * absent would have passed against the exact half-redaction this shape replaced.
 */
const CLIENT_MONEY_COLUMNS = [
  "price",
  "baseFare",
  "distanceFare",
  "timeFare",
  "helperFee",
  "overtimeFee",
  "serviceLevelAdjustment",
] as const;

/** The only two money columns a carrier-facing response may ever carry. */
const CARRIER_MONEY_COLUMNS = ["driverPayout", "overtimeDriverPayout"] as const;

test.describe("CARRIER_ORDER_PARTY_SELECT", () => {
  for (const column of CLIENT_MONEY_COLUMNS) {
    test(`never asks the database for Order.${column}`, () => {
      // `not.toHaveProperty`, not "is falsy": Prisma accepts `price: false` as a
      // key, and a key set to `false` is how the half-redaction this constant
      // replaced was written. The column must be absent, so that carrier-facing
      // code reading `order.price` fails to compile rather than reading `null`.
      expect(CARRIER_ORDER_PARTY_SELECT).not.toHaveProperty(column);
    });
  }

  for (const column of CARRIER_MONEY_COLUMNS) {
    test(`selects Order.${column}`, () => {
      expect(CARRIER_ORDER_PARTY_SELECT).toHaveProperty(column, true);
    });
  }

  test("carries no money column beyond the carrier's own two", () => {
    // A positive assertion over the whole shape, so a money column added to
    // `Order` and copied in here later is caught even though this file has
    // never heard of its name. Anything ending in a fare/price/fee word that is
    // not one of the two payout columns fails.
    const moneyish = Object.keys(CARRIER_ORDER_PARTY_SELECT).filter((key) =>
      /fare|price|fee|payout|adjustment/i.test(key),
    );

    expect(moneyish.sort()).toEqual([...CARRIER_MONEY_COLUMNS].sort());
  });

  test("keeps the non-money columns the lifecycle routes need", () => {
    // The redaction must not have taken the rest of the row with it: these are
    // the identifiers and lifecycle fields the six handlers' consumers read.
    for (const column of [
      "id",
      "reference",
      "status",
      "clientId",
      "companyId",
      "driverId",
      "vehicleId",
      "pickupAddress",
      "dropoffAddress",
      "distanceKm",
      "serviceLevel",
      "helperCount",
      "waitingMinutes",
    ]) {
      expect(CARRIER_ORDER_PARTY_SELECT).toHaveProperty(column, true);
    }
  });

  test("withholds commissionRate, as ORDER_PARTY_SELECT does", () => {
    // An internal figure with no consumer on any surface: a party to a job is
    // entitled to the resolved payout, never to the rate that produced it.
    expect(CARRIER_ORDER_PARTY_SELECT).not.toHaveProperty("commissionRate");
  });
});

test.describe("ORDER_PARTY_SELECT", () => {
  for (const column of CLIENT_MONEY_COLUMNS) {
    test(`still carries Order.${column} for the client`, () => {
      // The client who booked the order is commercially party to every line of
      // their own quote. Redacting the carrier's view must not have narrowed
      // theirs — this half of the split is the one that must NOT change.
      expect(ORDER_PARTY_SELECT).toHaveProperty(column, true);
    });
  }
});
