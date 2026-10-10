/**
 * Local-only fixture for testing the driver app end to end: makes one phone
 * account an **activated, online driver with a vehicle**, and puts **claimable
 * loads** on the board for it.
 *
 * The app's signed-in flow — claim, start, proof of delivery, complete — needs
 * an approved driver and open `PENDING` orders. Getting there by hand means the
 * whole onboarding wizard, an admin approval, and a client booking that needs a
 * live geocoder. This does it in one command.
 *
 * ## Run it (local database only)
 *
 *   source <scratchpad>/env.sh        # the local overrides; echoes the DB host
 *   pnpm exec tsx scripts/seed-mobile-test-driver.ts --phone +995555700001
 *   pnpm exec tsx scripts/seed-mobile-test-driver.ts --phone +995555700001 --loads 5
 *
 * Then sign in with that number (the local server's fixed test code works) and
 * the loads are on the board. Re-run it any time for more loads.
 *
 * ## Put an offer in front of the driver
 *
 *   pnpm exec tsx scripts/seed-mobile-test-driver.ts --phone +995555700001 --loads 0 --offer
 *
 * `--offer` books one more load and writes a live `LoadOffer` of it for this
 * driver, so the app sees it on its next
 * `GET /api/dashboard/hub/offers/current` — for the offer's lifetime (30 s).
 * It prints the offer id, or why none was made: as with the real matcher, a
 * driver who is on a job (an `ACCEPTED` or `IN_TRANSIT` order) or already has
 * a live offer gets nothing.
 *
 * This is a fixture, not the matcher: the row is written directly, with the
 * matcher's own lifetime constant, and **no push notification is sent**. To
 * exercise the real path — matching, the offer cap, push — open a load through
 * the app: pay an `INITIATED` order (`POST /api/orders/[id]/pay`), or toggle
 * the driver offline and online with a load waiting on the board.
 *
 * ## What it writes
 *
 * - The `User` for `--phone`, **only if none exists** (role `DRIVER`, phone
 *   verified, the same placeholder email phone sign-up would mint). An existing
 *   account — one created by signing up in the app — is used as it is.
 * - That driver's `DriverProfile` (created if missing; `activatedAt` set if
 *   null; put online with a position in central Tbilisi), a `DriverLicence` if
 *   missing, and one `Vehicle` (a dry-box cargo van) if the driver owns none.
 * - One seed client, `mobile-seed-client@example.test`, and `--loads` new
 *   `PENDING` orders booked by it for the driver's own vehicle class.
 *
 * Additive: there is no `delete`, `deleteMany` or `executeRaw` in this file,
 * and nothing is written to any account but the one named by `--phone` and the
 * seed client. It does update that driver's profile — that is its purpose — so
 * do not point `--phone` at an account whose pending/unactivated state you are
 * in the middle of testing.
 *
 * ## Why it refuses anything but a local database
 *
 * It activates a driver without review and books orders nobody paid for. On a
 * shared database those are a fake approved carrier and fake jobs on a live
 * board. The guard is the one `scripts/verify-load-board-seed.ts` uses, with no
 * override.
 */

import { randomBytes } from "node:crypto";

import {
  CargoCategory,
  ChassisType,
  DriverAccountType,
  GeorgianCity,
  LicenceCategory,
  LoadOfferStatus,
  OrderStatus,
  PrismaClient,
  ServiceLevel,
  VehicleClass,
} from "@prisma/client";

import { BUSY_ORDER_STATUSES, offerExpiresAt } from "../src/lib/offers/rules";
import {
  driverPayoutFor,
  PLATFORM_COMMISSION_RATE,
} from "../src/lib/orders/payout";

const TAG = "[seed-mobile-test-driver]";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SEED_CLIENT_EMAIL = "mobile-seed-client@example.test";
const PLACEHOLDER_EMAIL_DOMAIN = "phone.driver-app.invalid";
const VEHICLE_SPEC_CODE = "CARGO_VAN";
const DEFAULT_LOAD_COUNT = 3;
const MAX_LOAD_COUNT = 20;
const MS_PER_HOUR = 60 * 60 * 1000;

/** Central Tbilisi — where the driver is placed and the loads start. */
const TBILISI = { lat: 41.7151, lng: 44.8271 };

/** Routes the loads cycle through. Real streets, invented jobs. */
const ROUTES = [
  {
    pickup: "12 Rustaveli Ave, Tbilisi",
    dropoff: "45 Vazha-Pshavela Ave, Tbilisi",
    distanceKm: 6.4,
    price: 48,
  },
  {
    pickup: "3 Pekini Ave, Tbilisi",
    dropoff: "118 Tsereteli Ave, Tbilisi",
    distanceKm: 4.1,
    price: 36,
  },
  {
    pickup: "7 Kostava St, Tbilisi",
    dropoff: "21 Kakheti Hwy, Tbilisi",
    distanceKm: 11.8,
    price: 74,
  },
] as const;

function fail(reason: string): never {
  console.error(`${TAG} ${reason}`);
  process.exit(1);
}

/** Refuses any database that is not on this machine. No override. */
function assertLocalDatabase(): void {
  for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = process.env[key];
    if (value === undefined || value === "") {
      // `DIRECT_URL` is optional in some setups; `DATABASE_URL` is not.
      if (key === "DATABASE_URL") fail("DATABASE_URL is not set.");
      continue;
    }

    let host: string;
    try {
      host = new URL(value).hostname.replace(/^\[|\]$/g, "");
    } catch {
      fail(`${key} is not a URL with a host this guard can read.`);
    }

    // The host only — a connection string carries a password.
    if (!LOCAL_DATABASE_HOSTS.has(host)) {
      fail(
        `Refused: ${key} points at "${host}", which is not local. This script ` +
          "activates a driver without review and books unpaid orders, so it " +
          "runs against a local database only.",
      );
    }
  }
}

function parseArgs(): { phone: string; loads: number; offer: boolean } {
  const args = process.argv.slice(2);
  const valueOf = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };

  const phone = valueOf("--phone");
  if (phone === undefined || !/^\+\d{9,15}$/.test(phone)) {
    fail(
      "Usage: tsx scripts/seed-mobile-test-driver.ts --phone +995555700001 [--loads 3] [--offer]\n" +
        "  --phone must be E.164 (a leading + and digits only).",
    );
  }

  const rawLoads = valueOf("--loads");
  const loads = rawLoads === undefined ? DEFAULT_LOAD_COUNT : Number(rawLoads);
  if (!Number.isInteger(loads) || loads < 0 || loads > MAX_LOAD_COUNT) {
    fail(`--loads must be a whole number from 0 to ${MAX_LOAD_COUNT}.`);
  }

  return { phone, loads, offer: args.includes("--offer") };
}

/** A Better Auth-style opaque id for a user this script creates. */
function newUserId(): string {
  return randomBytes(24).toString("base64url");
}

assertLocalDatabase();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { phone, loads, offer } = parseArgs();
  const digits = phone.slice(1);

  const spec = await prisma.vehicleTypeSpec.findUnique({
    where: { code: VEHICLE_SPEC_CODE },
    select: { id: true, pricingRule: { select: { id: true } } },
  });
  if (!spec?.pricingRule) {
    fail(
      `VehicleTypeSpec ${VEHICLE_SPEC_CODE} (with its pricing rule) is not ` +
        "seeded — run `npx prisma db seed` against this database first.",
    );
  }

  // ---- The driver account ------------------------------------------------
  let user = await prisma.user.findUnique({
    where: { phoneNumber: phone },
    select: { id: true, role: true },
  });

  if (user === null) {
    user = await prisma.user.create({
      data: {
        id: newUserId(),
        name: phone,
        email: `${digits}@${PLACEHOLDER_EMAIL_DOMAIN}`,
        role: "DRIVER",
        phoneNumber: phone,
        phoneNumberVerified: true,
      },
      select: { id: true, role: true },
    });
    process.stdout.write(`${TAG} created driver account for ${phone}\n`);
  } else if (user.role !== "DRIVER") {
    fail(`${phone} belongs to a ${user.role} account, not a DRIVER.`);
  }

  const now = new Date();
  const position = {
    isOnline: true,
    currentLat: TBILISI.lat,
    currentLng: TBILISI.lng,
    locationUpdatedAt: now,
  };

  const existingProfile = await prisma.driverProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, activatedAt: true },
  });

  const profile =
    existingProfile === null
      ? await prisma.driverProfile.create({
          data: {
            userId: user.id,
            city: GeorgianCity.TBILISI,
            accountType: DriverAccountType.INDIVIDUAL,
            firstName: "Test",
            lastName: `Driver ${digits.slice(-4)}`,
            phone,
            activatedAt: now,
            ...position,
          },
          select: { id: true },
        })
      : await prisma.driverProfile.update({
          where: { id: existingProfile.id },
          // An existing activation instant is kept; only a null one is set.
          data: {
            activatedAt: existingProfile.activatedAt ?? now,
            ...position,
          },
          select: { id: true },
        });

  await prisma.driverLicence.upsert({
    where: { driverProfileId: profile.id },
    create: {
      driverProfileId: profile.id,
      licenceNumber: `MT${digits.slice(-7)}`,
      expiresAt: new Date(now.getTime() + 3 * 365 * 24 * MS_PER_HOUR),
      categories: [LicenceCategory.B],
    },
    // A licence already on file is the driver's own; leave it.
    update: {},
  });

  let vehicle = await prisma.vehicle.findFirst({
    where: { driverProfileId: profile.id },
    select: { id: true, plateNumber: true, vehicleTypeSpecId: true },
    orderBy: { createdAt: "asc" },
  });

  if (vehicle === null) {
    vehicle = await prisma.vehicle.create({
      data: {
        driverProfileId: profile.id,
        vehicleTypeSpecId: spec.id,
        // Namespaced, and unique per phone number.
        plateNumber: `MT${digits.slice(-6)}`,
        make: "Ford",
        model: "Transit",
        year: 2021,
        colour: "White",
        chassisType: ChassisType.DRY_BOX,
        vehicleClass: VehicleClass.LARGE_VAN,
        payloadKg: 1200,
        cargoLengthM: 3.1,
        cargoWidthM: 1.7,
        cargoHeightM: 1.8,
        photoUrls: [],
      },
      select: { id: true, plateNumber: true, vehicleTypeSpecId: true },
    });
  }

  // ---- Claimable loads ---------------------------------------------------
  const client = await prisma.user.upsert({
    where: { email: SEED_CLIENT_EMAIL },
    create: {
      id: newUserId(),
      name: "Mobile Seed Client",
      email: SEED_CLIENT_EMAIL,
      emailVerified: true,
      role: "CLIENT",
    },
    update: {},
    select: { id: true },
  });

  const references: string[] = [];

  // `--offer` books one load beyond `--loads`; it is the last one created.
  const loadCount = loads + (offer ? 1 : 0);
  let lastOrderId: string | null = null;

  for (let index = 0; index < loadCount; index++) {
    const route = ROUTES[index % ROUTES.length];
    if (route === undefined) continue;

    // A plausible split; `price` is what the driver's payout is commissioned
    // from, at the rate stamped on the row — exactly as a real booking does it.
    const baseFare = 10;
    const timeFare = 6;
    const distanceFare = route.price - baseFare - timeFare;

    const order = await prisma.order.create({
      data: {
        clientId: client.id,
        // Booked for the driver's own class, with no declared envelope, so the
        // board lists it and the claim's fit check has nothing to refuse.
        vehicleTypeSpecId: vehicle.vehicleTypeSpecId,
        status: OrderStatus.PENDING,
        cargoCategory: CargoCategory.FURNITURE_FURNISHINGS,
        description: "Seeded test load — two wardrobes",
        packagingDescription: "2 flat packs",
        bodyType: ChassisType.DRY_BOX,
        serviceLevel: ServiceLevel.REGULAR,
        pickupAddress: route.pickup,
        pickupLat: TBILISI.lat + 0.004 * (index + 1),
        pickupLng: TBILISI.lng - 0.006 * (index + 1),
        pickupCity: GeorgianCity.TBILISI,
        pickupContactName: "Giorgi (sender)",
        pickupContactPhone: "+995555000101",
        dropoffAddress: route.dropoff,
        dropoffLat: TBILISI.lat + 0.02,
        dropoffLng: TBILISI.lng - 0.05,
        dropoffCity: GeorgianCity.TBILISI,
        dropoffContactName: "Nino (recipient)",
        dropoffContactPhone: "+995555000102",
        distanceKm: route.distanceKm,
        baseFare,
        distanceFare,
        timeFare,
        price: route.price,
        commissionRate: PLATFORM_COMMISSION_RATE,
        driverPayout: driverPayoutFor(route.price, PLATFORM_COMMISSION_RATE),
        pickupWindowStart: new Date(now.getTime() + MS_PER_HOUR),
        pickupWindowEnd: new Date(now.getTime() + 2 * MS_PER_HOUR),
        deliveryDeadline: new Date(now.getTime() + 5 * MS_PER_HOUR),
      },
      select: { id: true, reference: true },
    });

    references.push(order.reference);
    lastOrderId = order.id;
  }

  // ---- A pushed offer ----------------------------------------------------
  let offerLine = "not requested (pass --offer)";

  if (offer && lastOrderId !== null) {
    // The sweep the matcher runs first: an offer that ran out stops counting.
    await prisma.loadOffer.updateMany({
      where: {
        driverProfileId: profile.id,
        status: LoadOfferStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: { status: LoadOfferStatus.EXPIRED },
    });

    const [liveOffer, activeJobs] = await Promise.all([
      prisma.loadOffer.findFirst({
        where: { driverProfileId: profile.id, status: LoadOfferStatus.PENDING },
        select: { id: true },
      }),
      prisma.order.count({
        where: { driverId: user.id, status: { in: [...BUSY_ORDER_STATUSES] } },
      }),
    ]);

    if (liveOffer !== null) {
      offerLine = `NONE MADE (the load is on the board) — the driver already has a live offer (${liveOffer.id})`;
    } else if (activeJobs > 0) {
      offerLine =
        "NONE MADE (the load is on the board) — the driver is on a job (an ACCEPTED or IN_TRANSIT " +
        "order); the matcher offers nothing to a busy driver";
    } else {
      const made = await prisma.loadOffer.create({
        data: {
          orderId: lastOrderId,
          driverProfileId: profile.id,
          vehicleId: vehicle.id,
          createdAt: now,
          expiresAt: offerExpiresAt(now),
        },
        select: { id: true, expiresAt: true },
      });

      offerLine = `${made.id}  for ${references.at(-1) ?? "?"}, expires ${made.expiresAt.toISOString()}`;
    }
  }

  process.stdout.write(
    [
      `${TAG} ready`,
      `  driver    ${phone}  (activated, online, in Tbilisi)`,
      `  vehicle   ${vehicle.plateNumber}  id ${vehicle.id}`,
      `  loads     ${references.length === 0 ? "none added" : references.join(", ")}`,
      `  offer     ${offerLine}`,
      "  sign in   POST /api/auth/phone-number/send-otp, then /verify with the",
      "            local test code (header x-phone-auth-intent: sign-in)",
      "",
    ].join("\n"),
  );
}

main()
  .catch((error: unknown) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
