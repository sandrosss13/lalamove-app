/**
 * The rules of a pushed load offer, pinned without a server or a database:
 * its lifetime, its state machine, and who is matched to what.
 *
 * `src/lib/offers/rules.ts` is the single statement of each — the matcher
 * (`src/lib/offers/dispatch.ts`) and every offer route ask it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  BUSY_ORDER_STATUSES,
  deriveOfferState,
  fittingVehicleFor,
  isOpenLoad,
  MAX_CANDIDATE_DRIVERS,
  MAX_CANDIDATE_LOADS,
  MAX_LIVE_OFFERS_PER_LOAD,
  OFFER_LIFETIME_SECONDS,
  offerExpiresAt,
  openOfferSlots,
  secondsRemaining,
  selectDriversForLoad as selectDriversForLoadAt,
  selectLoadForDriver as selectLoadForDriverAt,
  type MatchDriver,
  type MatchLoad,
  type MatchVehicle,
} from "@/lib/offers/rules";
import type { VehicleCapability } from "@/lib/orders/vehicle-fit";
import type { WorkPreferences } from "@/lib/work-preferences/rules";

const REPO = process.cwd();
const T0 = new Date("2026-10-02T10:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

// The matchers take the instant an offer would be made, for the work
// preferences' days and hours. Every test that is not about preferences runs
// at `T0` (Friday 2 October 2026, 14:00 in Tbilisi).
const selectDriversForLoad = (
  candidate: MatchLoad,
  drivers: readonly MatchDriver[],
) => selectDriversForLoadAt(candidate, drivers, T0);
const selectLoadForDriver = (
  candidate: MatchDriver,
  loads: readonly MatchLoad[],
) => selectLoadForDriverAt(candidate, loads, T0);

const VAN_CLASS = "spec_van";
const TRUCK_CLASS = "spec_truck";

const VAN: VehicleCapability = {
  payloadKg: 1200,
  lengthM: 3,
  widthM: 1.7,
  heightM: 1.8,
};
const TRUCK: VehicleCapability = {
  payloadKg: 5000,
  lengthM: 6,
  widthM: 2.4,
  heightM: 2.4,
};

function vehicle(
  id: string,
  capability: VehicleCapability = VAN,
  overrides: Partial<MatchVehicle> = {},
): MatchVehicle {
  return {
    id,
    vehicleTypeSpecId: capability === TRUCK ? TRUCK_CLASS : VAN_CLASS,
    capability,
    bodyTypes: ["DRY_BOX"],
    ...overrides,
  };
}

function load(overrides: Partial<MatchLoad> = {}): MatchLoad {
  return {
    orderId: "order_1",
    pickup: { lat: 41.7151, lng: 44.8271 },
    dimensions: { weightKg: 800, lengthM: 2, widthM: 1, heightM: 1 },
    booked: { vehicleTypeSpecId: VAN_CLASS, floor: VAN },
    bodyType: "DRY_BOX",
    liveOfferCount: 0,
    preference: {
      pickupCity: "TBILISI",
      dropoffCity: "TBILISI",
      tripKm: 6,
      handlingTags: [],
      helperCount: 0,
    },
    ...overrides,
  };
}

function driver(
  id: string,
  northKm: number | null,
  vehicles: MatchVehicle[] = [vehicle(`${id}_van`)],
  preferences: WorkPreferences | null = null,
): MatchDriver {
  return {
    driverProfileId: id,
    preferences,
    // One degree of latitude is ~111 km; exactness does not matter, order does.
    location:
      northKm === null ? null : { lat: 41.7151 + northKm / 111, lng: 44.8271 },
    vehicles,
  };
}

test.describe("constants", () => {
  test("an offer lives for the design's 30 seconds", () => {
    expect(OFFER_LIFETIME_SECONDS).toBe(30);
    expect(offerExpiresAt(T0).toISOString()).toBe("2026-10-02T10:00:30.000Z");
  });

  test("matching is bounded", () => {
    expect(MAX_LIVE_OFFERS_PER_LOAD).toBe(3);
    expect(MAX_CANDIDATE_DRIVERS).toBe(200);
    expect(MAX_CANDIDATE_LOADS).toBe(50);
  });

  test("busy means the hub's own job-in-progress statuses", () => {
    expect([...BUSY_ORDER_STATUSES]).toEqual(["ACCEPTED", "IN_TRANSIT"]);

    const header = readFileSync(
      join(REPO, "src", "lib", "dashboard", "hub", "header.ts"),
      "utf8",
    );
    expect(header).toContain(
      "const ACTIVE_JOB_STATUSES = [OrderStatus.ACCEPTED, OrderStatus.IN_TRANSIT];",
    );
  });

  test("the statuses match the database enum and the wire contract", () => {
    const schema = readFileSync(join(REPO, "prisma", "schema.prisma"), "utf8");
    const enumBody = /enum LoadOfferStatus \{([^}]*)\}/.exec(schema)?.[1] ?? "";
    const members = enumBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));

    expect(members).toEqual([
      "PENDING",
      "ACCEPTED",
      "DECLINED",
      "EXPIRED",
      "WITHDRAWN",
    ]);

    const contract = readFileSync(
      join(REPO, "src", "lib", "mobile-api", "contracts.ts"),
      "utf8",
    );
    const union =
      /export type HubOfferState =([^;]*);/.exec(contract)?.[1] ?? "";

    // The wire has no `PENDING`: it is resolved to `LIVE`, or to what it became.
    expect(
      union.match(/"([A-Z_]+)"/g)?.map((name) => name.slice(1, -1)),
    ).toEqual(["LIVE", "ACCEPTED", "DECLINED", "EXPIRED", "WITHDRAWN"]);
  });

  test("the one-pending-offer-per-driver index exists in a migration", () => {
    const migration = readFileSync(
      join(
        REPO,
        "prisma",
        "migrations",
        "20261002150000_load_offers",
        "migration.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "LoadOffer_one_pending_per_driver" ON "LoadOffer"\("driverProfileId"\) WHERE "status" = 'PENDING'/,
    );
  });
});

test.describe("deriveOfferState", () => {
  const pending = { status: "PENDING" as const, expiresAt: at(30) };

  test("a pending offer is live until its deadline, on an open load", () => {
    expect(deriveOfferState(pending, true, at(0))).toBe("LIVE");
    expect(deriveOfferState(pending, true, at(29.999))).toBe("LIVE");
  });

  test("it expires at the deadline exactly, not after it", () => {
    expect(deriveOfferState(pending, true, at(30))).toBe("EXPIRED");
    expect(deriveOfferState(pending, true, at(31))).toBe("EXPIRED");
  });

  test("a pending offer whose load was taken is withdrawn", () => {
    expect(deriveOfferState(pending, false, at(5))).toBe("WITHDRAWN");
  });

  test("expiry wins over a taken load: it was not answered in time", () => {
    expect(deriveOfferState(pending, false, at(40))).toBe("EXPIRED");
  });

  test("an answered or settled offer never changes, whatever the clock", () => {
    for (const status of [
      "ACCEPTED",
      "DECLINED",
      "EXPIRED",
      "WITHDRAWN",
    ] as const) {
      const offer = { status, expiresAt: at(30) };

      expect(deriveOfferState(offer, true, at(0))).toBe(status);
      expect(deriveOfferState(offer, false, at(999))).toBe(status);
    }
  });
});

test.describe("isOpenLoad", () => {
  test("only a pending order nobody holds is open", () => {
    const open = { status: "PENDING", driverId: null, companyId: null };

    expect(isOpenLoad(open)).toBe(true);
    expect(isOpenLoad({ ...open, status: "INITIATED" })).toBe(false);
    expect(isOpenLoad({ ...open, status: "ACCEPTED", driverId: "u" })).toBe(
      false,
    );
    expect(isOpenLoad({ ...open, status: "CLAIMED", companyId: "c" })).toBe(
      false,
    );
    expect(isOpenLoad({ ...open, status: "CANCELLED" })).toBe(false);
  });
});

test.describe("secondsRemaining and openOfferSlots", () => {
  test("counts whole seconds down and never below zero", () => {
    expect(secondsRemaining(at(30), at(0))).toBe(30);
    expect(secondsRemaining(at(30), at(0.4))).toBe(30);
    expect(secondsRemaining(at(30), at(29.5))).toBe(1);
    expect(secondsRemaining(at(30), at(30))).toBe(0);
    expect(secondsRemaining(at(30), at(90))).toBe(0);
  });

  test("a load has three slots, less the offers already live", () => {
    expect(openOfferSlots(0)).toBe(3);
    expect(openOfferSlots(2)).toBe(1);
    expect(openOfferSlots(3)).toBe(0);
    expect(openOfferSlots(7)).toBe(0);
  });
});

test.describe("fittingVehicleFor — the load board's rule", () => {
  test("names the vehicle the load fits", () => {
    expect(fittingVehicleFor(load(), [vehicle("v1")])?.id).toBe("v1");
  });

  test("no vehicle, no match", () => {
    expect(fittingVehicleFor(load(), [])).toBeNull();
  });

  test("a vehicle that does not offer the booked body does not match", () => {
    expect(
      fittingVehicleFor(load({ bodyType: "REFRIGERATED" }), [vehicle("v1")]),
    ).toBeNull();
  });

  test("a vehicle below the booked class does not match", () => {
    const booked = { vehicleTypeSpecId: TRUCK_CLASS, floor: TRUCK };

    expect(fittingVehicleFor(load({ booked }), [vehicle("v1")])).toBeNull();
    expect(
      fittingVehicleFor(load({ booked }), [vehicle("v1"), vehicle("t1", TRUCK)])
        ?.id,
    ).toBe("t1");
  });

  test("cargo too heavy for the vehicle does not match", () => {
    const heavy = load({
      dimensions: { weightKg: 1500, lengthM: 2, widthM: 1, heightM: 1 },
    });

    expect(fittingVehicleFor(heavy, [vehicle("v1")])).toBeNull();
  });

  test("body and capacity must hold for the same vehicle", () => {
    // A big truck of the wrong body and a right-body van that is too small.
    const fleet = [
      vehicle("truck", TRUCK, { bodyTypes: ["OPEN_CHASSIS"] }),
      vehicle("van"),
    ];
    const heavy = load({
      dimensions: { weightKg: 3000, lengthM: 2, widthM: 1, heightM: 1 },
    });

    expect(fittingVehicleFor(heavy, fleet)).toBeNull();
  });

  test("an undeclared cargo envelope fits, as on the board", () => {
    const undeclared = load({
      dimensions: {
        weightKg: null,
        lengthM: null,
        widthM: null,
        heightM: null,
      },
    });

    expect(fittingVehicleFor(undeclared, [vehicle("v1")])?.id).toBe("v1");
  });

  test("an unknown booked class fails closed", () => {
    expect(
      fittingVehicleFor(load({ booked: undefined }), [vehicle("v1")]),
    ).toBeNull();
  });
});

test.describe("selectDriversForLoad", () => {
  test("offers to the nearest drivers first, up to the cap", () => {
    const matches = selectDriversForLoad(load(), [
      driver("far", 20),
      driver("near", 1),
      driver("nearest", 0.2),
      driver("mid", 5),
      driver("farthest", 90),
    ]);

    expect(matches.map((match) => match.driverProfileId)).toEqual([
      "nearest",
      "near",
      "mid",
    ]);
    expect(matches).toHaveLength(MAX_LIVE_OFFERS_PER_LOAD);
  });

  test("each match names the load and the fitting vehicle", () => {
    expect(selectDriversForLoad(load(), [driver("d1", 1)])).toEqual([
      { orderId: "order_1", driverProfileId: "d1", vehicleId: "d1_van" },
    ]);
  });

  test("a driver with no known position ranks after every placed one", () => {
    const matches = selectDriversForLoad(load(), [
      driver("unplaced", null),
      driver("far", 80),
    ]);

    expect(matches.map((match) => match.driverProfileId)).toEqual([
      "far",
      "unplaced",
    ]);
  });

  test("with no pickup position, input order decides", () => {
    const matches = selectDriversForLoad(load({ pickup: null }), [
      driver("first", 50),
      driver("second", 1),
    ]);

    expect(matches.map((match) => match.driverProfileId)).toEqual([
      "first",
      "second",
    ]);
  });

  test("skips drivers the load does not fit, however near", () => {
    const matches = selectDriversForLoad(load({ bodyType: "REFRIGERATED" }), [
      driver("near_dry", 0.1),
      driver("far_fridge", 30, [
        vehicle("fridge", VAN, { bodyTypes: ["REFRIGERATED"] }),
      ]),
      driver("no_vehicle", 0.1, []),
    ]);

    expect(matches.map((match) => match.driverProfileId)).toEqual([
      "far_fridge",
    ]);
  });

  test("only fills the slots still open", () => {
    const drivers = [driver("a", 1), driver("b", 2), driver("c", 3)];

    expect(
      selectDriversForLoad(load({ liveOfferCount: 2 }), drivers),
    ).toHaveLength(1);
    expect(selectDriversForLoad(load({ liveOfferCount: 3 }), drivers)).toEqual(
      [],
    );
  });
});

test.describe("selectLoadForDriver", () => {
  const me = driver("me", 0);

  test("picks the fitting load with the nearest pickup", () => {
    const match = selectLoadForDriver(me, [
      load({ orderId: "far", pickup: { lat: 42.5, lng: 44.8271 } }),
      load({ orderId: "near", pickup: { lat: 41.72, lng: 44.8271 } }),
    ]);

    expect(match).toEqual({
      orderId: "near",
      driverProfileId: "me",
      vehicleId: "me_van",
    });
  });

  test("with no position, the load waiting longest (first in) wins", () => {
    const match = selectLoadForDriver(driver("me", null), [
      load({ orderId: "oldest" }),
      load({ orderId: "newer" }),
    ]);

    expect(match?.orderId).toBe("oldest");
  });

  test("skips a load that already has its full set of live offers", () => {
    const match = selectLoadForDriver(me, [
      load({ orderId: "full", liveOfferCount: MAX_LIVE_OFFERS_PER_LOAD }),
      load({ orderId: "open", pickup: { lat: 42.5, lng: 44.8271 } }),
    ]);

    expect(match?.orderId).toBe("open");
  });

  test("skips a load that does not fit", () => {
    const match = selectLoadForDriver(me, [
      load({ orderId: "fridge", bodyType: "REFRIGERATED" }),
      load({ orderId: "dry", pickup: { lat: 42.5, lng: 44.8271 } }),
    ]);

    expect(match?.orderId).toBe("dry");
  });

  test("nothing fits, nothing is offered", () => {
    expect(selectLoadForDriver(driver("me", 0, []), [load()])).toBeNull();
    expect(selectLoadForDriver(me, [])).toBeNull();
  });
});

test.describe("work preferences in offer matching", () => {
  // Tbilisi only, weekdays, 07:00–20:00, no fragile cargo, no helper.
  const picky: WorkPreferences = {
    cities: ["TBILISI"],
    intercity: false,
    maxTripKm: 50,
    days: ["MON", "TUE", "WED", "THU", "FRI"],
    startMinute: 7 * 60,
    endMinute: 20 * 60,
    excludedHandlingTags: ["FRAGILE"],
    canBringHelper: false,
  };
  const base = load().preference;
  const offeredTo = (candidate: MatchLoad, now = T0) =>
    selectDriversForLoadAt(
      candidate,
      [driver("picky", 1, undefined, picky), driver("none", 2)],
      now,
    ).map((match) => match.driverProfileId);

  test("a load inside every preference is offered to both drivers", () => {
    expect(offeredTo(load())).toEqual(["picky", "none"]);
  });

  test("a driver with no saved preferences is offered everything, at any hour", () => {
    const awkward = load({
      preference: {
        pickupCity: "BATUMI",
        dropoffCity: "KUTAISI",
        tripKm: 900,
        handlingTags: ["FRAGILE", "HAZMAT"],
        helperCount: 3,
      },
    });

    // Sunday 03:00 in Tbilisi.
    expect(offeredTo(awkward, new Date("2026-10-03T23:00:00.000Z"))).toEqual([
      "none",
    ]);
  });

  test("each preference withholds the offer on its own", () => {
    const withheld: MatchLoad[] = [
      load({
        preference: { ...base, pickupCity: "BATUMI", dropoffCity: "BATUMI" },
      }),
      load({ preference: { ...base, dropoffCity: "RUSTAVI" } }),
      load({ preference: { ...base, tripKm: 51 } }),
      load({ preference: { ...base, handlingTags: ["FRAGILE"] } }),
      load({ preference: { ...base, helperCount: 1 } }),
    ];

    for (const candidate of withheld) {
      expect(offeredTo(candidate)).toEqual(["none"]);
    }
  });

  test("outside working hours or days nothing is offered to that driver", () => {
    // Friday 21:00 Tbilisi — after hours.
    expect(offeredTo(load(), new Date("2026-10-02T17:00:00.000Z"))).toEqual([
      "none",
    ]);
    // Saturday 12:00 Tbilisi — not a working day.
    expect(offeredTo(load(), new Date("2026-10-03T08:00:00.000Z"))).toEqual([
      "none",
    ]);
  });

  test("a preference-excluded driver does not use up an offer slot", () => {
    const matches = selectDriversForLoadAt(
      load({ preference: { ...base, tripKm: 500 } }),
      [
        driver("picky_near", 1, undefined, picky),
        driver("b", 2),
        driver("c", 3),
        driver("d", 4),
      ],
      T0,
    );

    expect(matches.map((match) => match.driverProfileId)).toEqual([
      "b",
      "c",
      "d",
    ]);
  });

  test("a driver going online is offered only a waiting load they want", () => {
    const me = driver("me", 0, undefined, picky);
    const far = load({
      orderId: "far",
      preference: { ...base, tripKm: 300 },
    });
    const wanted = load({ orderId: "wanted" });

    expect(selectLoadForDriverAt(me, [far, wanted], T0)?.orderId).toBe(
      "wanted",
    );
    expect(selectLoadForDriverAt(me, [far], T0)).toBeNull();
    expect(selectLoadForDriverAt(driver("me", 0), [far], T0)?.orderId).toBe(
      "far",
    );
  });
});

test.describe("one claim path", () => {
  const read = (...parts: string[]) =>
    readFileSync(join(REPO, ...parts), "utf8");

  test("both accept routes call claimOrderForDriver and neither claims itself", () => {
    const routes = [
      read("src", "app", "api", "orders", "[id]", "accept", "route.ts"),
      read(
        "src",
        "app",
        "api",
        "dashboard",
        "hub",
        "offers",
        "[id]",
        "accept",
        "route.ts",
      ),
    ];

    for (const source of routes) {
      expect(source).toContain("claimOrderForDriver(");
      // The compare-and-swap lives in the shared function only.
      expect(source).not.toMatch(/prisma\.order\.updateMany/);
      expect(source).not.toMatch(/OrderStatus\.ACCEPTED/);
    }
  });

  test("the board and the matcher share one eligibility module", () => {
    const board = read("src", "app", "api", "loads", "route.ts");
    const rules = read("src", "lib", "offers", "rules.ts");

    for (const source of [board, rules]) {
      expect(source).toContain('from "@/lib/orders/load-eligibility"');
      expect(source).toContain("permittedVehicles");
    }
  });

  test("the rules modules have no server-only or Prisma dependency", () => {
    for (const file of [
      read("src", "lib", "offers", "rules.ts"),
      read("src", "lib", "orders", "load-eligibility.ts"),
      read("src", "lib", "push", "rules.ts"),
    ]) {
      expect(file).not.toMatch(/^import "server-only"/m);
      expect(file).not.toMatch(/from "@prisma\/client"/);
      expect(file).not.toMatch(/from "@\/lib\/prisma"/);
    }
  });
});
