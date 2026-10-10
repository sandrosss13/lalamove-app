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
  toHubOffer,
  toHubVehiclesResponse,
  toOrderProofOfDelivery,
  toSupportMessage,
  toVehicleDocumentsResponse,
} from "@/lib/mobile-api/serializers";
import type { DriverOfferRecord } from "@/lib/offers/driver-offers";
import type { SupportMessageRecord } from "@/lib/support/messages";
import type { VehicleDocumentHistoryEntry } from "@/lib/vehicle-documents/driver-documents";
import {
  attentionForSlot,
  summarizeVehicleDocuments,
  toAttentionSummary,
  type VehicleDocumentSlot,
} from "@/lib/vehicle-documents/rules";

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
      driverName: null,
      deliveryDeadline: "2026-09-01T12:00:00.000Z",
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
      reference: "LM-1001",
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
      pickupWindowStart: "2026-09-01T08:30:00.000Z",
      pickupWindowEnd: "2026-09-01T09:30:00.000Z",
      deliveryDeadline: "2026-09-01T12:00:00.000Z",
      pickupCity: "Tbilisi",
      dropoffCity: null,
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
  proofOfDelivery: {
    photos: [
      {
        id: "pod_1",
        url: "https://storage.example.test/sign/pod_1?token=t1",
        takenAt: "2026-09-01T09:55:00.000Z",
      },
    ],
    hasSignature: true,
    signatureUrl: "https://storage.example.test/sign/sig?token=t2",
  },
};

/** The same sheet as the app receives it when the assigned driver reads it. */
const jobSheetForDriver = { ...jobSheet };

/** …and when the company holding the job reads it: no proof of delivery. */
const jobSheetForCompany = { ...jobSheet, proofOfDelivery: null };

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
      chassisType: "DRY_BOX",
      cargoLengthM: 3.2,
      cargoWidthM: 1.7,
      cargoHeightM: 1.8,
      declaredCargoLengthM: 3.4,
      declaredCargoWidthM: 1.75,
      declaredCargoHeightM: null,
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
  emergencyContactName: "Ana Beridze",
  emergencyContactPhone: "+995577301922",
  idNumber: "01000000000",
  dateOfBirth: "1990-05-04",
  licenceExpiresAt: "2029-03-31",
  documents: [
    { type: "PROFILE_PHOTO", status: "APPROVED", flagReason: null },
    { type: "LICENCE_FRONT", status: "FLAGGED", flagReason: "Blurry scan" },
    { type: "LICENCE_BACK", status: "PENDING", flagReason: null },
  ],
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

/* ------------------------------------------------------------------------- */
/* Vehicle documents and support messages                                    */
/* ------------------------------------------------------------------------- */

const DOCUMENTS_TODAY = "2026-10-02";

/** An insurance on file expiring in 20 days, and a flagged registration. */
const documentSlots: VehicleDocumentSlot[] = summarizeVehicleDocuments(
  [
    {
      id: "doc_insurance",
      type: "INSURANCE",
      status: "APPROVED",
      flagReason: null,
      expiresAt: "2026-10-22",
      uploadedAt: "2026-09-01T08:00:00.000Z",
      reviewedAt: "2026-09-02T08:00:00.000Z",
    },
    {
      id: "doc_registration",
      type: "REGISTRATION",
      status: "FLAGGED",
      flagReason: "Photo is blurry",
      expiresAt: null,
      uploadedAt: "2026-09-30T08:00:00.000Z",
      reviewedAt: "2026-10-01T08:00:00.000Z",
    },
  ],
  DOCUMENTS_TODAY,
);

/** Keyed by the fixture fleet's first vehicle — the one the driver "owns". */
const ownedVehicleDocuments = new Map([
  [vehicles.vehicles[0]?.id ?? "", documentSlots],
]);

const documentsAttention = toAttentionSummary(
  documentSlots.flatMap((slot) => {
    const item = attentionForSlot(slot, {
      id: "veh_1",
      plateNumber: "AA-001-AA",
    });
    return item === null ? [] : [item];
  }),
);

const noAttention = toAttentionSummary([]);

const documentHistory: VehicleDocumentHistoryEntry[] = [
  {
    id: "doc_registration",
    type: "REGISTRATION",
    status: "FLAGGED",
    flagReason: "Photo is blurry",
    expiresAt: null,
    uploadedAt: "2026-09-30T08:00:00.000Z",
    reviewedAt: "2026-10-01T08:00:00.000Z",
    supersededAt: null,
  },
];

const supportRecord: SupportMessageRecord = {
  id: "msg_1",
  topic: "CARGO_DAMAGED_OR_MISSING",
  body: "Two pallets arrived crushed.",
  status: "RESOLVED",
  order: { id: "order_1", reference: "LM-1001" },
  createdAt: "2026-10-01T09:00:00.000Z",
  resolvedAt: "2026-10-01T10:00:00.000Z",
};

/** Every hub 200 body the app can receive, by route, built from the fixtures. */
const BODIES: Record<string, unknown> = {
  "GET /api/dashboard/hub/me": wire(
    toHubMeResponse(driverAccount, header, "+995322000111", documentsAttention),
  ),
  "GET /api/driver-profile/vehicles/[id]/documents": wire(
    toVehicleDocumentsResponse(
      { vehicleId: "veh_1", plateNumber: "AA-001-AA" },
      documentSlots,
      documentHistory,
    ),
  ),
  "GET /api/dashboard/hub/support/messages": wire({
    messages: [toSupportMessage(supportRecord)],
  }),
  "GET /api/dashboard/hub/jobs": wire(toHubJobsResponse(jobs)),
  "GET /api/dashboard/hub/jobs/[id] (driver)": wire(
    toHubJobSheetResponse(jobSheet, "DRIVER"),
  ),
  "GET /api/dashboard/hub/jobs/[id] (company)": wire(
    toHubJobSheetResponse(jobSheet, "COMPANY"),
  ),
  "POST /api/orders/[id]/pod": wire(
    toOrderProofOfDelivery(jobSheet.proofOfDelivery),
  ),
  "GET /api/dashboard/hub/vehicles": wire(
    toHubVehiclesResponse(vehicles, ownedVehicleDocuments),
  ),
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

    test(`${route} carries no storage path, only expiring URLs`, () => {
      // A path is a permanent handle to a private object; nothing the app is
      // sent may name one, whether a proof image or an onboarding document.
      const pathish = [...allKeys(body)].filter((key) => /path/i.test(key));

      expect(pathish).toEqual([]);
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
  const body = toHubMeResponse(driverAccount, header, null, noAttention);

  test("drops the header's invented notifications", () => {
    const text = JSON.stringify(body);

    expect(text).not.toContain("notification");
    expect(text).not.toContain("Payout of ₾142.60 sent");
    expect(text).not.toContain("New job offer");
  });

  test("keeps the account and the real in-progress jobs", () => {
    expect(body.account).toEqual(driverAccount);
    expect(body.jobsInProgressCount).toBe(1);
    expect(body.jobsInProgress).toEqual([
      {
        id: "order_1",
        shortId: "LM-1001",
        route: "Vake → Saburtalo",
        driverName: null,
        deliveryDeadline: "2026-09-01T12:00:00.000Z",
      },
    ]);
  });

  test("sends the deadline itself, not the web's English countdown", () => {
    // `eta` ("42 min", "Overdue") and `who` ("Giorgi · LM-1001") are English
    // display strings the web pill renders; the app words its own.
    const fleetHeader: HubHeaderData = {
      ...header,
      persona: "BUSINESS",
      jobsInProgress: [
        {
          id: "order_2",
          shortId: "LM-1002",
          route: "Gldani → Isani",
          who: "Giorgi · LM-1002",
          driverName: "Giorgi",
          deliveryDeadline: null,
          eta: "Overdue",
        },
      ],
    };
    const [job] = toHubMeResponse(
      driverAccount,
      fleetHeader,
      null,
      noAttention,
    ).jobsInProgress;

    expect(job).toEqual({
      id: "order_2",
      shortId: "LM-1002",
      route: "Gldani → Isani",
      driverName: "Giorgi",
      deliveryDeadline: null,
    });
    expect(job).not.toHaveProperty("eta");
    expect(job).not.toHaveProperty("who");
    expect(JSON.stringify(job)).not.toContain("Overdue");
  });

  test("passes the configured support phone through, or null", () => {
    expect(body.supportPhone).toBeNull();
    expect(
      toHubMeResponse(driverAccount, header, "+995322000111", noAttention)
        .supportPhone,
    ).toBe("+995322000111");
  });

  test("has exactly the five top-level keys of the contract", () => {
    expect(Object.keys(body).sort()).toEqual([
      "account",
      "documentsAttention",
      "jobsInProgress",
      "jobsInProgressCount",
      "supportPhone",
    ]);
  });

  test("reports nothing needing attention as an empty list, not an absence", () => {
    expect(body.documentsAttention).toEqual({
      expiryWarningDays: 30,
      actionRequiredCount: 0,
      items: [],
    });
  });

  test("carries each attention item field by field", () => {
    const { documentsAttention: attention } = toHubMeResponse(
      driverAccount,
      header,
      null,
      documentsAttention,
    );

    expect(attention.actionRequiredCount).toBe(2);
    expect(attention.items).toEqual([
      {
        document: "VEHICLE_REGISTRATION",
        reason: "FLAGGED",
        vehicleId: "veh_1",
        plateNumber: "AA-001-AA",
        expiresAt: null,
        daysUntilExpiry: null,
        flagReason: "Photo is blurry",
        underReview: false,
      },
      {
        document: "VEHICLE_INSURANCE",
        reason: "EXPIRING",
        vehicleId: "veh_1",
        plateNumber: "AA-001-AA",
        expiresAt: "2026-10-22",
        daysUntilExpiry: 20,
        flagReason: null,
        underReview: false,
      },
    ]);
  });
});

test.describe("vehicle documents and support messages", () => {
  test("a vehicle the driver owns carries both document slots, in order", () => {
    const [owned] = toHubVehiclesResponse(
      vehicles,
      ownedVehicleDocuments,
    ).vehicles;

    expect(owned?.documents?.map((document) => document.type)).toEqual([
      "REGISTRATION",
      "INSURANCE",
    ]);
    expect(owned?.documents?.[0]).toEqual({
      type: "REGISTRATION",
      state: "FLAGGED",
      onFile: null,
      submission: {
        id: "doc_registration",
        status: "FLAGGED",
        flagReason: "Photo is blurry",
        uploadedAt: "2026-09-30T08:00:00.000Z",
      },
    });
    expect(owned?.documents?.[1]).toEqual({
      type: "INSURANCE",
      state: "EXPIRING",
      onFile: {
        id: "doc_insurance",
        expiresAt: "2026-10-22",
        daysUntilExpiry: 20,
        validity: "EXPIRING",
        approvedAt: "2026-09-02T08:00:00.000Z",
      },
      submission: null,
    });
  });

  test("a vehicle the driver does not own carries documents: null, not missing ones", () => {
    const body = toHubVehiclesResponse(vehicles, new Map());

    expect(body.vehicles.length).toBeGreaterThan(0);
    for (const vehicle of body.vehicles) {
      expect(vehicle.documents).toBeNull();
    }
  });

  test("no document body carries a storage path or a signed URL", () => {
    const text = JSON.stringify([
      toHubVehiclesResponse(vehicles, ownedVehicleDocuments),
      toVehicleDocumentsResponse(
        { vehicleId: "veh_1", plateNumber: "AA-001-AA" },
        documentSlots,
        documentHistory,
      ),
    ]);

    expect(text).not.toContain("storagePath");
    expect(text).not.toContain("signedUrl");
    expect(text).not.toContain("vehicles/veh_1");
  });

  test("a support message names its sender-visible fields and no staff ones", () => {
    const message = toSupportMessage({
      ...supportRecord,
      // A loader that later grew staff-side columns must not leak them.
      ...({ resolvedById: "admin_1", resolvedByName: "Nino" } as object),
    });

    expect(message).toEqual({
      id: "msg_1",
      topic: "CARGO_DAMAGED_OR_MISSING",
      body: "Two pallets arrived crushed.",
      status: "RESOLVED",
      order: { id: "order_1", reference: "LM-1001" },
      createdAt: "2026-10-01T09:00:00.000Z",
      resolvedAt: "2026-10-01T10:00:00.000Z",
    });
  });

  test("the contract promises no reply channel", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "lib", "mobile-api", "contracts.ts"),
      "utf8",
    );

    // The design's success line promises an SMS reply within 15 minutes. No
    // such channel exists, so no field may suggest one.
    expect(source).not.toMatch(/^\s*(reply|repliedAt|replyBy|sms)\w*\??:/im);
  });
});

test.describe("toHubVehiclesResponse", () => {
  const body = toHubVehiclesResponse(vehicles, ownedVehicleDocuments);

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

    // The source minus `sampled`, plus the documents handed in beside it, is
    // exactly what the app receives.
    const real: Record<string, unknown> = { ...source };
    delete real.sampled;

    expect(vehicle).toEqual({
      ...real,
      documents: ownedVehicleDocuments.get(source.id),
    });
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

  test("carries the calendar's windows and the search's city labels", () => {
    const [job] = toHubJobsResponse(jobs).jobs;

    expect(job).toMatchObject({
      pickupWindowStart: "2026-09-01T08:30:00.000Z",
      pickupWindowEnd: "2026-09-01T09:30:00.000Z",
      deliveryDeadline: "2026-09-01T12:00:00.000Z",
      pickupCity: "Tbilisi",
      dropoffCity: null,
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
    expect(toHubJobSheetResponse(jobSheet, "DRIVER")).toEqual(
      jobSheetForDriver,
    );
  });

  test("sends the proof of delivery to the assigned driver", () => {
    expect(toHubJobSheetResponse(jobSheet, "DRIVER").proofOfDelivery).toEqual({
      photos: [
        {
          id: "pod_1",
          url: "https://storage.example.test/sign/pod_1?token=t1",
          takenAt: "2026-09-01T09:55:00.000Z",
        },
      ],
      hasSignature: true,
      signatureUrl: "https://storage.example.test/sign/sig?token=t2",
    });
  });

  test("withholds the proof of delivery from a company reader", () => {
    const body = toHubJobSheetResponse(jobSheet, "COMPANY");

    expect(body.proofOfDelivery).toBeNull();
    // Not merely nulled at the top: no signed URL survives anywhere.
    expect(JSON.stringify(body)).not.toContain("storage.example.test");
    expect(body).toEqual(jobSheetForCompany);
  });

  test("does not pass on a storage path a proof row might carry", () => {
    const [photo] = jobSheet.proofOfDelivery.photos;

    if (photo === undefined) throw new Error("fixture has no photo");

    const poisoned = {
      ...jobSheet,
      proofOfDelivery: {
        ...jobSheet.proofOfDelivery,
        podSignaturePath: "order_abcdef/signature/x.png",
        photos: [{ ...photo, storagePath: "order_abcdef/photo/x.jpg" }],
      },
      // Through `unknown`: these keys are not on the loader's type, which is
      // the point of the fixture.
    } as unknown as HubJobSheet;
    const text = JSON.stringify(toHubJobSheetResponse(poisoned, "DRIVER"));

    expect(text).not.toContain("storagePath");
    expect(text).not.toContain("podSignaturePath");
    expect(text).not.toContain("order_abcdef/photo");
  });

  test("sends no payout figure for a cancelled job", () => {
    // The web sheet renders a cancelled job with `payout="none"` for every
    // reader; the stored columns are still populated, so the serializer is what
    // keeps them from the app.
    const body = toHubJobSheetResponse(
      { ...jobSheet, status: "CANCELLED", overtimeDriverPayout: 4 },
      "DRIVER",
    );

    expect(body.status).toBe("CANCELLED");
    expect(body.driverPayout).toBeNull();
    expect(body.overtimeDriverPayout).toBeNull();
    expect(JSON.stringify(body)).not.toContain("42.5");
  });

  test("changes nothing else about a cancelled job's sheet", () => {
    const cancelled: HubJobSheet = { ...jobSheet, status: "CANCELLED" };

    expect(toHubJobSheetResponse(cancelled, "DRIVER")).toEqual({
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
      const body = toHubJobSheetResponse({ ...jobSheet, status }, "DRIVER");

      expect(body.driverPayout).toBe(42.5);
      expect(body.overtimeDriverPayout).toBe(0);
    });
  }

  test("keeps the fleet block for a company reader", () => {
    const fleet = { driverName: "Giorgi", vehiclePlate: "AA-123-BB" };

    expect(
      toHubJobSheetResponse({ ...jobSheet, fleet }, "COMPANY").fleet,
    ).toEqual(fleet);
  });

  test("does not pass on a column the loader was never meant to return", () => {
    const poisoned: HubJobSheet = { ...jobSheet, ...LEAKED_COLUMNS };
    const keys = allKeys(wire(toHubJobSheetResponse(poisoned, "DRIVER")));

    for (const column of Object.keys(LEAKED_COLUMNS)) {
      expect(keys.has(column), `${column} must not ride along`).toBe(false);
    }
  });

  test("copies handlingTags rather than aliasing the loader's array", () => {
    expect(toHubJobSheetResponse(jobSheet, "DRIVER").handlingTags).not.toBe(
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

  test("gives a driver their emergency contact", () => {
    expect(toHubAccountResponse(driverSettings)).toMatchObject({
      emergencyContactName: "Ana Beridze",
      emergencyContactPhone: "+995577301922",
    });
  });

  test("gives a driver their licence expiry and document verdicts", () => {
    const body = toHubAccountResponse(driverSettings);

    expect(body).toMatchObject({
      licenceExpiresAt: "2029-03-31",
      documents: [
        { type: "PROFILE_PHOTO", status: "APPROVED", flagReason: null },
        { type: "LICENCE_FRONT", status: "FLAGGED", flagReason: "Blurry scan" },
        { type: "LICENCE_BACK", status: "PENDING", flagReason: null },
      ],
    });
  });

  test("sends a document's verdict and never its file", () => {
    const poisoned = {
      ...driverSettings,
      documents: [
        {
          type: "LICENCE_FRONT",
          status: "PENDING",
          flagReason: null,
          storagePath: "dp_nino/abc-licence.jpg",
          signedUrl: "https://storage.example.test/sign/licence?token=t",
        },
      ],
    } as unknown as HubAccountSettings;
    const text = JSON.stringify(toHubAccountResponse(poisoned));

    expect(text).not.toContain("storagePath");
    expect(text).not.toContain("signedUrl");
    expect(text).not.toContain("dp_nino/abc-licence.jpg");
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

test.describe("toHubOffer", () => {
  const record: DriverOfferRecord = {
    id: "offer_1",
    orderId: "order_1",
    reference: "GE-48210",
    createdAt: "2026-10-02T10:00:00.000Z",
    expiresAt: "2026-10-02T10:00:30.000Z",
    secondsRemaining: 24,
    lifetimeSeconds: 30,
    driverPayout: 51,
    distanceKm: 6.4,
    pickupDistanceKm: 1.2,
    pickupAddress: "12 Rustaveli Ave, Tbilisi",
    pickupCity: "Tbilisi",
    pickupLat: 41.7,
    pickupLng: 44.8,
    dropoffAddress: "45 Vazha-Pshavela Ave, Tbilisi",
    dropoffCity: "Tbilisi",
    dropoffLat: 41.72,
    dropoffLng: 44.75,
    scheduledAt: null,
    pickupWindowStart: "2026-10-02T11:00:00.000Z",
    pickupWindowEnd: "2026-10-02T12:00:00.000Z",
    deliveryDeadline: null,
    cargoCategory: "FURNITURE_FURNISHINGS",
    description: "Two wardrobes",
    packagingDescription: "2 flat packs",
    itemQuantity: null,
    cargoWeightKg: 800,
    cargoLengthM: 2,
    cargoWidthM: 1,
    cargoHeightM: 1,
    bodyType: "DRY_BOX",
    handlingTags: ["FRAGILE"],
    helperCount: 0,
    serviceLevel: "REGULAR",
    fitVehicle: {
      id: "vehicle_1",
      plateNumber: "AA-001-AA",
      make: "Ford",
      model: "Transit",
      typeLabel: "Cargo Van",
    },
  };

  test("sends the record's fields and nothing else", () => {
    // Extra properties stand in for a record that grew a field: an allowlist
    // serializer must not pass them on.
    const widened = {
      ...record,
      price: 60,
      commissionRate: 0.15,
      pickupContactPhone: "+995555000101",
      fitVehicle: { ...record.fitVehicle, vin: "X" },
    } as DriverOfferRecord;

    expect(toHubOffer(widened)).toEqual(record);
  });

  test("carries the driver's payout and no client money", () => {
    const body = toHubOffer(record);

    expect(body.driverPayout).toBe(51);
    for (const column of CLIENT_MONEY_KEYS) {
      expect(Object.keys(body)).not.toContain(column);
    }
  });

  test("carries no stop contact before the job is the driver's", () => {
    expect(Object.keys(toHubOffer(record)).join(" ")).not.toMatch(/contact/i);
  });

  test("a removed fit vehicle is null, not an empty object", () => {
    expect(toHubOffer({ ...record, fitVehicle: null }).fitVehicle).toBeNull();
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
