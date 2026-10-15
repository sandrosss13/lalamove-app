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

import { LOADS_SELECT } from "@/lib/loads/select";
import {
  CARRIER_ORDER_PARTY_SELECT,
  CLIENT_ORDER_RESPONSE_SELECT,
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
  // Pricing model v1: the transport charge and its itemised parts, and the
  // helper overtime charged to the client. (`helperPayout` is the driver's.)
  "transportFare",
  "returnFare",
  "returnAllowance",
  "pickupHelperFee",
  "dropoffHelperFee",
  "helperOvertimeFee",
  // Not money, but it says which tariff the client was charged at.
  "tripType",
] as const;

/**
 * The only money columns a carrier-facing response may ever carry: the
 * carrier's own payout, its overtime share and (pricing model v1) the helpers'
 * part of the payout, which is included in `driverPayout`.
 */
const CARRIER_MONEY_COLUMNS = [
  "driverPayout",
  "helperPayout",
  "overtimeDriverPayout",
] as const;

/** Pricing model v1: the per-stop work a carrier needs to plan the job. */
const STOP_WORK_COLUMNS = [
  "pickupHelpers",
  "pickupFloor",
  "pickupCargoElevator",
  "pickupPassengerElevator",
  "dropoffHelpers",
  "dropoffFloor",
  "dropoffCargoElevator",
  "dropoffPassengerElevator",
] as const;

/**
 * Each stop's structured Contact Info. Non-money; contact-redacted per row by
 * the listing routes (`canSeeStopContacts`), so only the job holder reads it.
 */
const STOP_CONTACT_INFO_COLUMNS = [
  "pickupContactName",
  "pickupContactPhone",
  "pickupBuildingName",
  "pickupEntrance",
  "pickupComment",
  "dropoffContactName",
  "dropoffContactPhone",
  "dropoffBuildingName",
  "dropoffEntrance",
  "dropoffComment",
] as const;

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

  test("carries the work at each stop and the reported helper minutes", () => {
    for (const column of [
      ...STOP_WORK_COLUMNS,
      "pickupHelperMinutes",
      "dropoffHelperMinutes",
    ]) {
      expect(CARRIER_ORDER_PARTY_SELECT).toHaveProperty(column, true);
    }
  });

  test("carries each stop's Contact Info for the job holder", () => {
    for (const column of STOP_CONTACT_INFO_COLUMNS) {
      expect(CARRIER_ORDER_PARTY_SELECT).toHaveProperty(column, true);
    }
  });

  test("carries no money column beyond the carrier's own three", () => {
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

/**
 * The order-details document is client-owner-only data: the client's own
 * company block and the amount they paid, and — after the trip starts — the
 * `serviceSnapshot` with the driver's personal number. No shared select may
 * join it, not even the client-facing `ORDER_PARTY_SELECT`, which several
 * carrier-side readers have historically borrowed. It is served by
 * `/api/orders/[id]/waybill` alone, behind `resolveServiceDocumentAccess`.
 */
test.describe("the order-details snapshot stays out of every shared order select", () => {
  for (const [name, select] of [
    ["CARRIER_ORDER_PARTY_SELECT", CARRIER_ORDER_PARTY_SELECT],
    ["ORDER_PARTY_SELECT", ORDER_PARTY_SELECT],
    ["LOADS_SELECT", LOADS_SELECT],
  ] as const) {
    test(`${name} never joins Order.serviceSnapshot`, () => {
      expect(select).not.toHaveProperty("serviceSnapshot");
      expect(JSON.stringify(select)).not.toMatch(/serviceSnapshot|waybill/i);
    });
  }
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

/**
 * `POST /api/orders` and `PATCH /api/orders/[id]` answer the booking client:
 * their own quote, never what the carrier is paid out of it.
 */
test.describe("CLIENT_ORDER_RESPONSE_SELECT", () => {
  for (const column of [
    "commissionRate",
    "driverPayout",
    "helperPayout",
    "overtimeDriverPayout",
  ]) {
    test(`never answers the client with Order.${column}`, () => {
      expect(CLIENT_ORDER_RESPONSE_SELECT).not.toHaveProperty(column);
    });
  }

  test("keeps the id the booking form navigates with, and the client's quote", () => {
    expect(CLIENT_ORDER_RESPONSE_SELECT).toHaveProperty("id", true);
    for (const column of CLIENT_MONEY_COLUMNS) {
      expect(CLIENT_ORDER_RESPONSE_SELECT).toHaveProperty(column, true);
    }
  });
});

/**
 * `GET /api/loads` — the load board, which also answers accounts that are not
 * yet party to an order (the open market). Its select lives in an import-free
 * module so it can be pinned here like the two above.
 */
test.describe("LOADS_SELECT", () => {
  for (const column of CLIENT_MONEY_COLUMNS) {
    test(`never asks the database for Order.${column}`, () => {
      expect(LOADS_SELECT).not.toHaveProperty(column);
    });
  }

  test("carries no client identity or payment reference", () => {
    for (const column of [
      "clientId",
      "savedCardId",
      "purchaseOrderRef",
      "commissionRate",
    ]) {
      expect(LOADS_SELECT).not.toHaveProperty(column);
    }
  });

  test("selects the driver's payout (and its helpers' part) as its only money", () => {
    const moneyish = Object.keys(LOADS_SELECT).filter((key) =>
      /fare|price|fee|payout|adjustment/i.test(key),
    );

    expect(moneyish.sort()).toEqual(["driverPayout", "helperPayout"]);
  });

  test("carries the work at each stop", () => {
    for (const column of STOP_WORK_COLUMNS) {
      expect(LOADS_SELECT).toHaveProperty(column, true);
    }
  });

  test("carries each stop's Contact Info (redacted per row by the board)", () => {
    for (const column of STOP_CONTACT_INFO_COLUMNS) {
      expect(LOADS_SELECT).toHaveProperty(column, true);
    }
  });

  test("reads cargo photos as a count only, never as rows", () => {
    // The board is polled every ten seconds; signed photo URLs are served per
    // load by `GET /api/loads/[id]/photos`, behind the same visibility rule.
    // A `photos` relation here would put storage paths on the open market's
    // payload, and `_count` reading anything but photos is a relation join this
    // select does not otherwise make.
    expect(LOADS_SELECT).not.toHaveProperty("photos");
    expect(LOADS_SELECT._count).toEqual({ select: { photos: true } });
  });
});
