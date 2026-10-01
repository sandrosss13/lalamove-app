/**
 * What the native driver app is sent by the Driver Hub's JSON read routes.
 *
 * Three properties, each of which is a way those routes could quietly hand the
 * app something the web does not show as fact:
 *
 * 1. **No sample data.** The web hub pads several screens with placeholder
 *    figures under `sampled` keys and labels them as samples on screen. The app
 *    has no such label, so the serializers must drop every one.
 * 2. **No client-side money.** *"Driver should see only its net, not total
 *    paid."* — the rule `tests/carrier-payload-redaction.spec.ts` pins for the
 *    lifecycle endpoints holds for these bodies too.
 * 3. **Nothing rides along.** The serializers name every field they emit, so a
 *    field a loader grows later does not reach the app by default.
 *
 * **Why the serializers and not the HTTP responses.** The routes need a
 * signed-in session and a database, and `DATABASE_URL` on this project is
 * production (see `playwright.config.ts`). Each route's 200 body is exactly one
 * of these functions' return values passed to `NextResponse.json`, so a key
 * absent here is a key absent from the body.
 *
 * The fixtures are plain literals typed as the loaders' own result types. Those
 * types live in `server-only` modules, but they are imported as types only and
 * erased, so nothing here touches Prisma, Better Auth or a browser.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import type { HubAccount } from "@/lib/dashboard/hub/account";
import type { HubAccountSettings } from "@/lib/dashboard/hub/account-settings";
import type { HubHeaderData } from "@/lib/dashboard/hub/header";
import type { HubJobSheet } from "@/lib/dashboard/hub/job-sheet";
import type { HubJobsData } from "@/lib/dashboard/hub/jobs";
import type { HubVehiclesData } from "@/lib/dashboard/hub/vehicles";
import {
  toHubAccountResponse,
  toHubJobSheetResponse,
  toHubJobsResponse,
  toHubMeResponse,
  toHubVehiclesResponse,
} from "@/lib/mobile-api/serializers";

/* ------------------------------------------------------------------------- */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Every `Order` column describing what the CLIENT pays, plus the internal rate.
 * The same list `tests/carrier-payload-redaction.spec.ts` keeps, and for the
 * same reason it is a set: `price` is the sum of its components, so withholding
 * one while sending the others withholds nothing.
 */
const CLIENT_MONEY_KEYS = [
  "price",
  "baseFare",
  "distanceFare",
  "timeFare",
  "helperFee",
  "overtimeFee",
  "serviceLevelAdjustment",
  "commissionRate",
] as const;

/** The only money keys any hub body may carry — all three are the carrier's. */
const CARRIER_MONEY_KEYS = ["driverPayout", "fare", "overtimeDriverPayout"];

/** Every object key anywhere inside `value`, however deeply nested. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      allKeys(child, out);
    }
  }

  return out;
}

/** What actually crosses the wire: the value after a JSON round trip. */
function wire<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Columns a loader must never grow, attached to a fixture to prove the
 * serializer would not pass them on if it did. Typed loosely on purpose: these
 * keys are not on the loaders' types, which is the point.
 */
const LEAKED_COLUMNS: Record<string, unknown> = {
  price: 100,
  baseFare: 10,
  distanceFare: 60,
  timeFare: 20,
  helperFee: 10,
  overtimeFee: 5,
  serviceLevelAdjustment: 0,
  commissionRate: 0.15,
  clientId: "user_client",
  savedCardId: "card_1",
  sampled: { invented: true },
};

/* ------------------------------------------------------------------------- */
/* Fixtures                                                                  */
/* ------------------------------------------------------------------------- */

const driverAccount: HubAccount = {
  kind: "INDIVIDUAL",
  persona: "INDEPENDENT",
  userId: "user_driver_nino",
  displayName: "Nino Beridze",
  initials: "NB",
  identifier: "Cargo Van · Tbilisi",
  city: "Tbilisi",
  isOnline: true,
  isActivated: true,
  canToggleOnline: true,
  companyName: null,
  driverProfileId: "dp_nino",
  companyId: null,
};

const header: HubHeaderData = {
  persona: "INDEPENDENT",
  jobsInProgressCount: 1,
  jobsInProgress: [
    {
      id: "order_1",
      shortId: "LM-1001",
      route: "Vake → Saburtalo",
      who: null,
      eta: "42 min",
    },
  ],
  sampled: {
    notificationCount: 2,
    notifications: [
      { id: "n1", title: "Payout of ₾142.60 sent", timeLabel: "2 h" },
      { id: "n2", title: "New job offer · Vake → Saburtalo", timeLabel: "5 m" },
    ],
  },
};

const jobs: HubJobsData = {
  jobs: [
    {
      id: "order_abcdef",
      shortId: "ABCDEF",
      status: "Completed",
      pickupAddress: "1 Rustaveli Ave",
      dropoffAddress: "9 Chavchavadze Ave",
      distanceKm: 7.4,
      fare: 46.5,
      driverPayout: 42.5,
      overtimeDriverPayout: 4,
      helperCount: 1,
      waitingMinutes: 12,
      createdAt: "2026-09-01T08:00:00.000Z",
      scheduledAt: null,
      inTransitAt: "2026-09-01T09:00:00.000Z",
      completedAt: "2026-09-01T10:00:00.000Z",
      vehicleTypeLabel: "Cargo Van",
      vehiclePlate: "AA-123-BB",
      serviceLevel: "Regular",
      bodyType: "Dry box",
      pickupContact: { name: "Giorgi", phone: "+995555000001", details: null },
      dropoffContact: null,
      purchaseOrderRef: "PO-77",
    },
  ],
  counts: { all: 1, active: 0, completed: 1, cancelled: 0 },
};

const jobSheet: HubJobSheet = {
  id: "order_abcdef",
  reference: "LM-1001",
  status: "IN_TRANSIT",
  fleet: null,
  pickupAddress: "1 Rustaveli Ave",
  pickupLat: 41.7,
  pickupLng: 44.8,
  pickupCity: "Tbilisi",
  pickupContactName: "Giorgi",
  pickupContactPhone: "+995555000001",
  pickupContactDetails: null,
  dropoffAddress: "9 Chavchavadze Ave",
  dropoffLat: 41.71,
  dropoffLng: 44.77,
  dropoffCity: "Tbilisi",
  dropoffContactName: null,
  dropoffContactPhone: null,
  dropoffContactDetails: null,
  distanceKm: 7.4,
  cargoCategory: "FURNITURE",
  description: "Two wardrobes",
  packagingDescription: null,
  itemQuantity: "2",
  cargoWeightKg: 120,
  cargoLengthM: 2,
  cargoWidthM: 1,
  cargoHeightM: 1.8,
  handlingTags: ["FRAGILE"],
  helperCount: 1,
  bodyType: "DRY_BOX",
  createdAt: "2026-09-01T08:00:00.000Z",
  scheduledAt: null,
  pickupWindowStart: null,
  pickupWindowEnd: null,
  deliveryDeadline: "2026-09-01T12:00:00.000Z",
  inTransitAt: "2026-09-01T09:00:00.000Z",
  completedAt: null,
  driverPayout: 42.5,
  overtimeDriverPayout: 0,
  waitingMinutes: null,
  receivedBy: null,
};

const vehicles: HubVehiclesData = {
  kind: "INDIVIDUAL",
  persona: "INDEPENDENT",
  canAddVehicle: true,
  vehicles: [
    {
      id: "veh_1",
      plateNumber: "AA-123-BB",
      make: "Ford",
      model: "Transit",
      year: 2019,
      colour: "White",
      photoUrls: ["https://example.test/veh_1.jpg"],
      vehicleClass: "LARGE_VAN",
      vehicleClassLabel: "Large van",
      vehicleTypeSpecId: "spec_van",
      vehicleTypeCode: "CARGO_VAN",
      vehicleTypeLabel: "Cargo Van",
      category: "MEDIUM_DUTY",
      maxPayloadKg: 1200,
      declaredPayloadKg: 1300,
      loadingAccessType: "REAR_DOOR",
      ownership: "DRIVER",
      status: "Active",
      assignment: {
        driverProfileId: "dp_nino",
        driverUserId: "user_driver_nino",
        driverName: "Nino Beridze",
        isOnline: true,
        assignedAt: "2026-08-01T00:00:00.000Z",
      },
      reviewStatus: null,
      dispatchable: false,
      createdAt: "2026-07-01T00:00:00.000Z",
      sampled: {
        odometerKm: 84210,
        costPerKmGel: 0.42,
        fuel: "Diesel",
        operatingCities: ["Tbilisi"],
        jobsThisWeek: 9,
        insuranceStatus: "Valid",
        insuranceDue: "2027-01-01",
        inspectionDue: "2027-02-01",
        runningCosts: [{ label: "Fuel", amountGel: 672 }],
      },
    },
  ],
  tiles: {
    vehicleCount: 1,
    classBreakdown: [
      { vehicleClass: "LARGE_VAN", label: "Large van", count: 1 },
    ],
    onTheRoadCount: 1,
    unassignedCount: 0,
    sampled: { fleetCostPerKmGel: 0.4 },
  },
};

const driverSettings: HubAccountSettings = {
  shape: "DRIVER",
  email: "nino@example.test",
  accountType: "INDIVIDUAL",
  firstName: "Nino",
  lastName: "Beridze",
  companyName: null,
  vatId: null,
  phone: "+995555000002",
  city: "TBILISI",
  idNumber: "01000000000",
  dateOfBirth: "1990-05-04",
};

const companySettings: HubAccountSettings = {
  shape: "COMPANY",
  email: "ops@fleet.example.test",
  companyName: "Tbilisi Freight",
  vatId: "400000000",
  phone: "+995322000000",
  city: "Tbilisi",
  registeredAddress: "5 Freedom Sq",
  contactName: "Marika",
  contactRole: "Dispatcher",
  contactEmail: "marika@fleet.example.test",
  payoutIbanLast4: "1234",
};

/** Every hub 200 body the app can receive, by route, built from the fixtures. */
const BODIES: Record<string, unknown> = {
  "GET /api/dashboard/hub/me": wire(toHubMeResponse(driverAccount, header)),
  "GET /api/dashboard/hub/jobs": wire(toHubJobsResponse(jobs)),
  "GET /api/dashboard/hub/jobs/[id]": wire(toHubJobSheetResponse(jobSheet)),
  "GET /api/dashboard/hub/vehicles": wire(toHubVehiclesResponse(vehicles)),
  "GET /api/dashboard/hub/account (driver)": wire(
    toHubAccountResponse(driverSettings),
  ),
  "GET /api/dashboard/hub/account (company)": wire(
    toHubAccountResponse(companySettings),
  ),
};

/* ------------------------------------------------------------------------- */
/* Specs                                                                     */
/* ------------------------------------------------------------------------- */

test.describe("every hub body", () => {
  for (const [route, body] of Object.entries(BODIES)) {
    test(`${route} carries no sampled key at any depth`, () => {
      expect([...allKeys(body)]).not.toContain("sampled");
    });

    test(`${route} carries no client-side money`, () => {
      const keys = allKeys(body);

      for (const column of CLIENT_MONEY_KEYS) {
        expect(keys.has(column), `${column} must be absent`).toBe(false);
      }
    });

    test(`${route} carries no money key beyond the carrier's own`, () => {
      // A positive sweep, so a money field this file has never heard of is
      // caught by its name rather than by somebody remembering to list it.
      const moneyish = [...allKeys(body)].filter((key) =>
        /fare|price|fee|payout|adjustment|commission/i.test(key),
      );

      for (const key of moneyish) {
        // `payoutIbanLast4` is four characters of an account number, not an
        // amount; it is the company's own and is asserted on below.
        if (key === "payoutIbanLast4") continue;

        expect(CARRIER_MONEY_KEYS).toContain(key);
      }
    });
  }
});

test.describe("toHubMeResponse", () => {
  const body = toHubMeResponse(driverAccount, header);

  test("drops the header's invented notifications", () => {
    const text = JSON.stringify(body);

    expect(text).not.toContain("notification");
    expect(text).not.toContain("Payout of ₾142.60 sent");
    expect(text).not.toContain("New job offer");
  });

  test("keeps the account and the real in-progress jobs", () => {
    expect(body.account).toEqual(driverAccount);
    expect(body.jobsInProgressCount).toBe(1);
    expect(body.jobsInProgress).toEqual(header.jobsInProgress);
  });

  test("has exactly the three top-level keys of the contract", () => {
    expect(Object.keys(body).sort()).toEqual([
      "account",
      "jobsInProgress",
      "jobsInProgressCount",
    ]);
  });
});

test.describe("toHubVehiclesResponse", () => {
  const body = toHubVehiclesResponse(vehicles);

  test("drops each vehicle's sampled facts", () => {
    const text = JSON.stringify(body);

    for (const invented of [
      "odometerKm",
      "costPerKmGel",
      "operatingCities",
      "jobsThisWeek",
      "insuranceStatus",
      "insuranceDue",
      "inspectionDue",
      "runningCosts",
      "84210",
    ]) {
      expect(text, `${invented} must be absent`).not.toContain(invented);
    }
  });

  test("drops the tiles' sampled fleet cost per km", () => {
    expect(body.tiles).toEqual({
      vehicleCount: 1,
      classBreakdown: [
        { vehicleClass: "LARGE_VAN", label: "Large van", count: 1 },
      ],
      onTheRoadCount: 1,
      unassignedCount: 0,
    });
    expect(JSON.stringify(body)).not.toContain("fleetCostPerKmGel");
  });

  test("keeps every real vehicle field", () => {
    const [source] = vehicles.vehicles;
    const [vehicle] = body.vehicles;

    if (source === undefined) throw new Error("fixture has no vehicle");

    // The source minus `sampled` is exactly what the app receives.
    const real: Record<string, unknown> = { ...source };
    delete real.sampled;

    expect(vehicle).toEqual(real);
  });
});

test.describe("toHubJobsResponse", () => {
  test("passes the loader's rows through field for field", () => {
    expect(toHubJobsResponse(jobs)).toEqual(jobs);
  });

  test("emits only the carrier's three money figures", () => {
    const [job] = toHubJobsResponse(jobs).jobs;

    expect(job).toMatchObject({
      fare: 46.5,
      driverPayout: 42.5,
      overtimeDriverPayout: 4,
    });
  });

  test("does not pass on a column the loader was never meant to return", () => {
    const [row] = jobs.jobs;

    if (row === undefined) throw new Error("fixture has no job");

    const poisoned: HubJobsData = {
      ...jobs,
      jobs: [{ ...row, ...LEAKED_COLUMNS }],
    };
    const keys = allKeys(wire(toHubJobsResponse(poisoned)));

    for (const column of Object.keys(LEAKED_COLUMNS)) {
      expect(keys.has(column), `${column} must not ride along`).toBe(false);
    }
  });
});

test.describe("toHubJobSheetResponse", () => {
  test("passes the loader's sheet through field for field", () => {
    expect(toHubJobSheetResponse(jobSheet)).toEqual(jobSheet);
  });

  test("sends no payout figure for a cancelled job", () => {
    // The web sheet renders a cancelled job with `payout="none"` for every
    // reader; the stored columns are still populated, so the serializer is what
    // keeps them from the app.
    const body = toHubJobSheetResponse({
      ...jobSheet,
      status: "CANCELLED",
      overtimeDriverPayout: 4,
    });

    expect(body.status).toBe("CANCELLED");
    expect(body.driverPayout).toBeNull();
    expect(body.overtimeDriverPayout).toBeNull();
    expect(JSON.stringify(body)).not.toContain("42.5");
  });

  test("changes nothing else about a cancelled job's sheet", () => {
    const cancelled: HubJobSheet = { ...jobSheet, status: "CANCELLED" };

    expect(toHubJobSheetResponse(cancelled)).toEqual({
      ...cancelled,
      driverPayout: null,
      overtimeDriverPayout: null,
    });
  });

  for (const status of [
    "INITIATED",
    "PENDING",
    "CLAIMED",
    "ACCEPTED",
    "IN_TRANSIT",
    "COMPLETED",
  ] as const) {
    test(`keeps the payout on a ${status} job`, () => {
      const body = toHubJobSheetResponse({ ...jobSheet, status });

      expect(body.driverPayout).toBe(42.5);
      expect(body.overtimeDriverPayout).toBe(0);
    });
  }

  test("keeps the fleet block for a company reader", () => {
    const fleet = { driverName: "Giorgi", vehiclePlate: "AA-123-BB" };

    expect(toHubJobSheetResponse({ ...jobSheet, fleet }).fleet).toEqual(fleet);
  });

  test("does not pass on a column the loader was never meant to return", () => {
    const poisoned: HubJobSheet = { ...jobSheet, ...LEAKED_COLUMNS };
    const keys = allKeys(wire(toHubJobSheetResponse(poisoned)));

    for (const column of Object.keys(LEAKED_COLUMNS)) {
      expect(keys.has(column), `${column} must not ride along`).toBe(false);
    }
  });

  test("copies handlingTags rather than aliasing the loader's array", () => {
    expect(toHubJobSheetResponse(jobSheet).handlingTags).not.toBe(
      jobSheet.handlingTags,
    );
  });
});

test.describe("toHubAccountResponse", () => {
  test("gives a driver their profile and no payout field", () => {
    const body = toHubAccountResponse(driverSettings);

    expect(body).toEqual(driverSettings);
    expect(body).not.toHaveProperty("payoutIbanLast4");
  });

  test("gives a company its details with the IBAN already truncated", () => {
    const body = toHubAccountResponse(companySettings);

    expect(body).toEqual(companySettings);
    expect(body).toHaveProperty("payoutIbanLast4", "1234");
  });

  test("never passes on a full IBAN the loader might carry", () => {
    const poisoned = {
      ...companySettings,
      bankAccountIban: "GE29NB0000000101904917",
    } as HubAccountSettings;
    const text = JSON.stringify(toHubAccountResponse(poisoned));

    expect(text).not.toContain("bankAccountIban");
    expect(text).not.toContain("GE29NB0000000101904917");
  });
});

/* ------------------------------------------------------------------------- */
/* The contract file itself                                                  */
/* ------------------------------------------------------------------------- */

test.describe("src/lib/mobile-api/contracts.ts", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "lib", "mobile-api", "contracts.ts"),
    "utf8",
  );

  test("imports nothing, so it can be copied into the app verbatim", () => {
    // Anchored to line starts so prose inside a comment that mentions the word
    // does not count; a real import or re-export statement always starts one.
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s.*\sfrom\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  test("declares types only — no runtime value", () => {
    expect(source).not.toMatch(
      /^\s*export\s+(const|let|var|function|class|enum|default)\b/m,
    );
  });

  test("names no client-side money field on any type", () => {
    for (const column of CLIENT_MONEY_KEYS) {
      // A field declaration is `<name>:` or `<name>?:` at the start of a line;
      // the doc comments name these columns on purpose and are not matched.
      expect(source).not.toMatch(new RegExp(`^\\s*${column}\\??:`, "m"));
    }
  });

  test("declares no sampled field", () => {
    expect(source).not.toMatch(/^\s*sampled\??:/m);
  });
});

test.describe("the pure mobile-api modules", () => {
  for (const file of ["serializers.ts", "access.ts"]) {
    test(`${file} has no runtime imports`, () => {
      // What makes these specs runnable without a server: an `import type` is
      // erased, a value import of a `server-only` module would throw on load.
      const source = readFileSync(
        join(process.cwd(), "src", "lib", "mobile-api", file),
        "utf8",
      );
      const runtimeImports = source
        .split("\n")
        .filter((line) => /^import\s/.test(line))
        .filter((line) => !/^import type\s/.test(line));

      expect(runtimeImports).toEqual([]);
    });
  }
});
