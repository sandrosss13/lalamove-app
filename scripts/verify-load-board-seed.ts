/**
 * Runtime verification fixture for the driver load board — a MANUAL check, not
 * an automated test.
 *
 * Nothing under `tests/` covers the board end to end, and that is deliberate:
 * as `tests/carrier-payload-redaction.spec.ts` records, this project's
 * `DATABASE_URL` points at a shared database, so a spec that created orders
 * would put them on the live board. The specs there consequently assert against
 * pure modules and never open a connection, which leaves the board's actual
 * behaviour — vehicle-fit filtering, the payout figure a driver is shown,
 * claiming, rejecting — to be verified by driving the real UI and API by hand.
 * This script is what puts the rows there to drive them against. It asserts
 * nothing; it seeds a known board and prints each order's id, reference, price
 * and payout so a human can compare them against what the board renders.
 *
 * It seeds profiles and vehicles for three accounts that were already
 * registered through the real Better Auth sign-up endpoint (`client.lb@`,
 * `driver.a.lb@` and `driver.b.lb@example.com`) — it does not create users, and
 * fails if those accounts are absent — then a spread of PENDING orders whose
 * `driverPayout`/`commissionRate` are stamped by the SAME functions
 * `POST /api/orders` uses (`driverPayoutFor`, `serviceLevelAdjustment` and the
 * pre-rounding of `price + serviceLevelAdjustment`), so the payout arithmetic
 * under test is production's arithmetic, not a hand-written value.
 *
 * Driver A's van is deliberately de-rated below its vehicle class, so several
 * of the Box Truck loads sit inside the class but outside THIS vehicle; driver
 * B runs the class to spec and can take everything A can plus the rest. Order
 * references are assigned by the database and therefore differ between runs and
 * between databases — read them off the output rather than expecting a
 * particular series.
 *
 * Run it against a LOCAL database only. The guard below refuses anything else,
 * because the run is destructive (see the last paragraph):
 *
 *   DATABASE_URL=postgresql://<user>@127.0.0.1:5432/<db> \
 *   DIRECT_URL=postgresql://<user>@127.0.0.1:5432/<db> \
 *   pnpm exec tsx scripts/verify-load-board-seed.ts
 *
 * That database needs the migrations applied and `pnpm exec prisma db seed`
 * run, since the loads below reference the seeded vehicle taxonomy by code.
 * `FORCE_VERIFY_LOAD_BOARD_SEED=1` waives the host check for the deliberate
 * exception — a disposable staging database, say.
 *
 * Re-running is idempotent by demolition: the profiles and vehicles are
 * upserted, and EVERY order belonging to the client account is deleted before
 * the loads are re-created, so a run restores a known board rather than
 * stacking a second copy of it onto the first.
 */
import {
  ChassisType,
  ClientAccountType,
  CargoCategory,
  CargoHandlingTag,
  DriverAccountType,
  GeorgianCity,
  OrderStatus,
  PrismaClient,
  ServiceLevel,
} from "@prisma/client";

import {
  driverPayoutFor,
  PLATFORM_COMMISSION_RATE,
} from "../src/lib/orders/payout";
import { serviceLevelAdjustment } from "../src/lib/pricing";

const CLIENT_EMAIL = "client.lb@example.com";
const DRIVER_A_EMAIL = "driver.a.lb@example.com";
const DRIVER_B_EMAIL = "driver.b.lb@example.com";

/**
 * Hosts that count as "a database this script may seed into and delete from".
 *
 * Deliberately an exact-match list of the loopback spellings rather than a
 * pattern: a substring or suffix test on the host would accept
 * `localhost.example.com` and `db-127.0.0.1.some-provider.net`, which is
 * precisely the mistake the guard exists to prevent.
 */
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Escape hatch for someone who genuinely means to point this at a non-local
 * database — a disposable staging instance, say. Same shape and spelling as
 * `FORCE_MIGRATE_DEPLOY=1` in `scripts/migrate-deploy.mjs`, which solves the
 * same problem (an operation that must not fire in the wrong environment) and
 * is the convention to follow rather than invent a second one.
 */
const FORCE_ENV_VAR = "FORCE_VERIFY_LOAD_BOARD_SEED";

/**
 * Report the refusal and stop, exit code 1.
 *
 * `console.error` rather than the `process.stdout.write` used for progress
 * further down: this is a failure, it belongs on stderr, and the project's
 * `no-console` rule allows `warn`/`error` — so no rule has to be disabled, and
 * the message survives being piped to something that only keeps stdout.
 *
 * The connection string is never echoed, in whole or in part. It carries a
 * password, and a refusal message is exactly the kind of text that ends up
 * pasted into a chat or a CI log. The host alone identifies the mistake.
 */
function refuseToRun(reason: string): never {
  console.error(
    `[verify-load-board-seed] Refused: ${reason}\n` +
      `This script upserts test accounts and DELETES every order belonging to ${CLIENT_EMAIL}, ` +
      "so it runs against a local database only.\n" +
      "Re-run it with a local connection string, e.g.\n" +
      "  DATABASE_URL=postgresql://<user>@127.0.0.1:5432/<db> " +
      "DIRECT_URL=postgresql://<user>@127.0.0.1:5432/<db> " +
      "pnpm exec tsx scripts/verify-load-board-seed.ts\n" +
      `Set ${FORCE_ENV_VAR}=1 to run it anywhere.`,
  );
  process.exit(1);
}

/**
 * The host `DATABASE_URL` names, or `null` if it names none that can be read.
 *
 * IPv6 hosts come back from `URL` bracketed (`[::1]`), so the brackets are
 * stripped to compare against the bare spelling in `LOCAL_DATABASE_HOSTS`.
 */
function databaseHost(connectionString: string): string | null {
  try {
    const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, "");
    return hostname === "" ? null : hostname;
  } catch {
    return null;
  }
}

/**
 * Refuse to run against anything but a local database.
 *
 * Called at module scope, before `new PrismaClient()` below, so it lands before
 * the client is constructed, let alone connected or asked to delete anything.
 * Do not move it into `main()`.
 *
 * `DATABASE_URL` is read straight from `process.env` because that is the value
 * the client will resolve its datasource from, so the guard cannot check one
 * string and the client open another. Importing `@prisma/client` above has
 * already populated it from the repo's `.env` as a side effect of its
 * env-conflict check, and an inline `DATABASE_URL=...` on the command line
 * takes precedence over that file — which is what makes the local override in
 * the header comment work. If neither supplies one, the guard refuses rather
 * than letting `new PrismaClient()` fail later with its own error.
 */
function assertLocalDatabase(): void {
  if (process.env[FORCE_ENV_VAR] === "1") {
    console.warn(
      `[verify-load-board-seed] Local-database check overridden by ${FORCE_ENV_VAR}=1.`,
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL;

  if (connectionString === undefined || connectionString === "") {
    refuseToRun("DATABASE_URL is not set, so there is no database to check.");
  }

  const host = databaseHost(connectionString);

  if (host === null) {
    refuseToRun("DATABASE_URL is not a URL with a host this guard can read.");
  }

  if (!LOCAL_DATABASE_HOSTS.has(host)) {
    refuseToRun(`DATABASE_URL points at "${host}", which is not local.`);
  }
}

assertLocalDatabase();

const prisma = new PrismaClient();

/** Same rounding as `POST /api/orders` applies before commissioning. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

type SeedLoad = {
  tag: string;
  specCode: string;
  price: number;
  serviceLevel: ServiceLevel;
  distanceKm: number;
  cargoWeightKg: number | null;
  cargoLengthM: number | null;
  cargoWidthM: number | null;
  cargoHeightM: number | null;
  handlingTags: CargoHandlingTag[];
  cargoCategory: CargoCategory;
  windows: boolean;
  deadline: boolean;
  description: string;
};

const HOUR = 60 * 60 * 1000;

const LOADS: SeedLoad[] = [
  {
    tag: "L1-fits-A",
    specCode: "BOX_TRUCK",
    price: 120,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 24,
    cargoWeightKg: 800,
    cargoLengthM: 2,
    cargoWidthM: 1.4,
    cargoHeightM: 1.5,
    handlingTags: [CargoHandlingTag.FRAGILE],
    cargoCategory: CargoCategory.FURNITURE_FURNISHINGS,
    windows: true,
    deadline: true,
    description: "Showroom sofas, blanket-wrapped",
  },
  {
    tag: "L2-overweight-for-A",
    specCode: "BOX_TRUCK",
    price: 260,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 61,
    cargoWeightKg: 3000,
    cargoLengthM: 2.5,
    cargoWidthM: 1.6,
    cargoHeightM: 1.8,
    handlingTags: [CargoHandlingTag.HEAVY_ITEM],
    cargoCategory: CargoCategory.CONSTRUCTION_MATERIALS,
    windows: true,
    deadline: false,
    description: "Palletised cement board, 3t",
  },
  {
    tag: "L3-too-long-for-A-hazmat",
    specCode: "BOX_TRUCK",
    price: 310.5,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 88,
    cargoWeightKg: 500,
    cargoLengthM: 4.2,
    cargoWidthM: 2,
    cargoHeightM: 2.1,
    handlingTags: [CargoHandlingTag.HAZMAT, CargoHandlingTag.UPRIGHT_ONLY],
    cargoCategory: CargoCategory.INDUSTRIAL_SUPPLIES,
    windows: false,
    deadline: true,
    description: "Class 3 solvent drums, ADR paperwork attached",
  },
  {
    tag: "L4-cold-chain-fits-A",
    specCode: "BOX_TRUCK",
    price: 89.99,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 14.5,
    cargoWeightKg: 400,
    cargoLengthM: 1.8,
    cargoWidthM: 1.2,
    cargoHeightM: 1.4,
    handlingTags: [CargoHandlingTag.COLD_CHAIN, CargoHandlingTag.TIME_CRITICAL],
    cargoCategory: CargoCategory.RETAIL_STOCK,
    windows: true,
    deadline: true,
    description: "Chilled dairy, +2..+6C",
  },
  {
    tag: "L5-priority-uplift-fits-A",
    specCode: "BOX_TRUCK",
    price: 133.33,
    serviceLevel: ServiceLevel.PRIORITY,
    distanceKm: 31.2,
    cargoWeightKg: 950,
    cargoLengthM: 2.2,
    cargoWidthM: 1.5,
    cargoHeightM: 1.6,
    handlingTags: [],
    cargoCategory: CargoCategory.EVENT_EQUIPMENT,
    windows: false,
    deadline: false,
    description: "Stage lighting rig, priority tier",
  },
  {
    tag: "L6-wrong-class-trailer",
    specCode: "TRAILER_TRUCK",
    price: 900,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 310,
    cargoWeightKg: 12000,
    cargoLengthM: 10,
    cargoWidthM: 2.4,
    cargoHeightM: 2.6,
    handlingTags: [CargoHandlingTag.HEAVY_ITEM],
    cargoCategory: CargoCategory.INDUSTRIAL_SUPPLIES,
    windows: true,
    deadline: true,
    description: "Trailer-only line haul Tbilisi to Batumi",
  },
  {
    tag: "L7-null-cargo-dims",
    specCode: "BOX_TRUCK",
    price: 75,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 9.8,
    cargoWeightKg: null,
    cargoLengthM: null,
    cargoWidthM: null,
    cargoHeightM: null,
    handlingTags: [],
    cargoCategory: CargoCategory.RETAIL_STOCK,
    windows: false,
    deadline: false,
    description: "Legacy-shaped order with no declared cargo envelope",
  },
  {
    tag: "L8-race-target",
    specCode: "BOX_TRUCK",
    price: 47.1,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 7.4,
    cargoWeightKg: 1200,
    cargoLengthM: 2.8,
    cargoWidthM: 1.7,
    cargoHeightM: 1.8,
    handlingTags: [CargoHandlingTag.FRAGILE],
    cargoCategory: CargoCategory.APPLIANCES,
    windows: true,
    deadline: false,
    description: "Two washing machines, claim-race target",
  },
  {
    tag: "L9-reject-target",
    specCode: "BOX_TRUCK",
    price: 210,
    serviceLevel: ServiceLevel.REGULAR,
    distanceKm: 44,
    cargoWeightKg: 1100,
    cargoLengthM: 2.6,
    cargoWidthM: 1.6,
    cargoHeightM: 1.7,
    handlingTags: [CargoHandlingTag.UPRIGHT_ONLY],
    cargoCategory: CargoCategory.FULL_RELOCATION,
    windows: false,
    deadline: false,
    description: "Two-bedroom relocation, reject/restore target",
  },
  {
    tag: "L10-pooling-discount-fits-A",
    specCode: "BOX_TRUCK",
    price: 200,
    serviceLevel: ServiceLevel.POOLING,
    distanceKm: 52,
    cargoWeightKg: 700,
    cargoLengthM: 2.4,
    cargoWidthM: 1.5,
    cargoHeightM: 1.6,
    handlingTags: [],
    cargoCategory: CargoCategory.RETAIL_STOCK,
    windows: true,
    deadline: true,
    description: "Pooled retail replenishment",
  },
];

async function main(): Promise<void> {
  const [client, driverA, driverB] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: CLIENT_EMAIL } }),
    prisma.user.findUniqueOrThrow({ where: { email: DRIVER_A_EMAIL } }),
    prisma.user.findUniqueOrThrow({ where: { email: DRIVER_B_EMAIL } }),
  ]);

  await prisma.clientProfile.upsert({
    where: { userId: client.id },
    create: {
      userId: client.id,
      accountType: ClientAccountType.BUSINESS,
      companyName: "Tbilisi Retail LLC",
      vatId: "GE404123456",
      phone: "+995555100100",
    },
    update: {},
  });

  const boxTruck = await prisma.vehicleTypeSpec.findUniqueOrThrow({
    where: { code: "BOX_TRUCK" },
  });

  const profileA = await prisma.driverProfile.upsert({
    where: { userId: driverA.id },
    create: {
      userId: driverA.id,
      accountType: DriverAccountType.INDIVIDUAL,
      city: GeorgianCity.TBILISI,
      firstName: "Dato",
      lastName: "Beridze",
      phone: "+995555200200",
      isOnline: true,
      activatedAt: new Date(),
      currentLat: 41.7151,
      currentLng: 44.8271,
    },
    update: { isOnline: true, activatedAt: new Date() },
  });

  const profileB = await prisma.driverProfile.upsert({
    where: { userId: driverB.id },
    create: {
      userId: driverB.id,
      accountType: DriverAccountType.INDIVIDUAL,
      city: GeorgianCity.TBILISI,
      firstName: "Nino",
      lastName: "Kapanadze",
      phone: "+995555300300",
      isOnline: true,
      activatedAt: new Date(),
      currentLat: 41.72,
      currentLng: 44.79,
    },
    update: { isOnline: true, activatedAt: new Date() },
  });

  // Driver A's van is a Box Truck by CLASS but deliberately de-rated well below
  // the class spec (1500 kg / 3.0 x 1.8 x 1.9 against BOX_TRUCK's 3500 kg /
  // 4.5 x 2.1 x 2.2 in `prisma/seed.ts` — re-check those figures if the
  // taxonomy is ever retuned). That is the whole point: several Box Truck loads
  // below are inside the class but outside THIS vehicle.
  //
  // The envelope is a named object spread into both halves of the upsert, not
  // literals inside `create` with an empty `update`. It IS the fixture, so a
  // plate left over from an earlier run must be brought to these figures rather
  // than keeping whatever it had — otherwise re-running after editing them
  // would quietly go on testing vehicle fit against the old van.
  const vehicleAEnvelope = {
    vehicleTypeSpecId: boxTruck.id,
    payloadKg: 1500,
    cargoLengthM: 3,
    cargoWidthM: 1.8,
    cargoHeightM: 1.9,
  };

  const vehicleA = await prisma.vehicle.upsert({
    where: { plateNumber: "LB-A-001" },
    create: {
      plateNumber: "LB-A-001",
      driverProfileId: profileA.id,
      make: "Isuzu",
      model: "NPR (de-rated)",
      year: 2019,
      chassisType: ChassisType.DRY_BOX,
      ...vehicleAEnvelope,
    },
    update: vehicleAEnvelope,
  });

  // Driver B runs a full-spec Box Truck — nulls mean "no vehicle-level
  // de-rating, fall back to the class spec" — so B can carry everything A can
  // plus the loads A is too small for, which lets the race test use a load both
  // drivers are genuinely eligible for.
  const vehicleBEnvelope = {
    vehicleTypeSpecId: boxTruck.id,
    payloadKg: null,
    cargoLengthM: null,
    cargoWidthM: null,
    cargoHeightM: null,
  };

  const vehicleB = await prisma.vehicle.upsert({
    where: { plateNumber: "LB-B-002" },
    create: {
      plateNumber: "LB-B-002",
      driverProfileId: profileB.id,
      make: "Mercedes-Benz",
      model: "Atego",
      year: 2021,
      chassisType: ChassisType.DRY_BOX,
      ...vehicleBEnvelope,
    },
    update: vehicleBEnvelope,
  });

  // Wipe the client's board before rebuilding it, so a re-run replaces the
  // scenario instead of adding a second copy of it. Scoped to this one seeded
  // client account — the guard at the top of the file is what makes a
  // `deleteMany` in a committed script defensible at all.
  await prisma.order.deleteMany({ where: { clientId: client.id } });

  const now = Date.now();
  const created: Record<string, string> = {};

  for (const load of LOADS) {
    const spec = await prisma.vehicleTypeSpec.findUniqueOrThrow({
      where: { code: load.specCode },
    });

    // Production's exact stamping sequence, from POST /api/orders.
    const adjustment = serviceLevelAdjustment(load.serviceLevel, load.price);
    const commissionRate = PLATFORM_COMMISSION_RATE;
    const driverPayout = driverPayoutFor(
      roundCurrency(load.price + adjustment),
      commissionRate,
    );

    // Itemised components that reconcile back to `price`, as a real quote does.
    // The split itself is arbitrary — no read path adds these up, they exist so
    // the row is not half-empty — but it only reconciles while every price in
    // LOADS stays above the flat base fare below; a cheaper load would book a
    // negative distance fare.
    const baseFare = 12;
    const helperFee = 0;
    const distanceFare = roundCurrency((load.price - baseFare) * 0.7);
    const timeFare = roundCurrency(load.price - baseFare - distanceFare);

    const order = await prisma.order.create({
      data: {
        status: OrderStatus.PENDING,
        cargoCategory: load.cargoCategory,
        description: `${load.tag} — ${load.description}`,
        bodyType: ChassisType.DRY_BOX,
        helperCount: 0,
        pickupAddress: "12 Rustaveli Ave, Tbilisi",
        pickupLat: 41.6977,
        pickupLng: 44.8015,
        pickupCity: GeorgianCity.TBILISI,
        pickupContactName: "Giorgi Warehouse",
        pickupContactPhone: "+995555400400",
        pickupContactDetails: "Gate 3, ring the bell",
        dropoffAddress: "7 Kostava St, Tbilisi",
        dropoffLat: 41.7051,
        dropoffLng: 44.7823,
        dropoffCity: GeorgianCity.TBILISI,
        dropoffContactName: "Mariam Store",
        dropoffContactPhone: "+995555500500",
        dropoffContactDetails: "Loading bay at rear",
        distanceKm: load.distanceKm,
        baseFare,
        distanceFare,
        timeFare,
        helperFee,
        price: load.price,
        serviceLevel: load.serviceLevel,
        serviceLevelAdjustment: adjustment,
        commissionRate,
        driverPayout,
        vehicleTypeSpecId: spec.id,
        cargoWeightKg: load.cargoWeightKg,
        cargoLengthM: load.cargoLengthM,
        cargoWidthM: load.cargoWidthM,
        cargoHeightM: load.cargoHeightM,
        packagingDescription: "Shrink-wrapped pallets",
        itemQuantity: "4 pallets",
        handlingTags: load.handlingTags,
        pickupWindowStart: load.windows ? new Date(now + 2 * HOUR) : null,
        pickupWindowEnd: load.windows ? new Date(now + 5 * HOUR) : null,
        deliveryDeadline: load.deadline ? new Date(now + 26 * HOUR) : null,
        clientId: client.id,
      },
      select: { id: true, reference: true, driverPayout: true, price: true },
    });

    created[load.tag] = order.id;
    // `console.log` is disallowed by the project's lint rules; this is a CLI
    // script, so write to stdout directly (same convention as prisma/seed.ts).
    process.stdout.write(
      `${load.tag.padEnd(28)} id=${order.id} ref=${order.reference} price=${order.price} payout=${order.driverPayout}\n`,
    );
  }

  process.stdout.write("\nIDS " + JSON.stringify(created) + "\n");
  process.stdout.write(
    "\nACCOUNTS " +
      JSON.stringify({
        clientUserId: client.id,
        driverAUserId: driverA.id,
        driverAProfileId: profileA.id,
        driverAVehicleId: vehicleA.id,
        driverBUserId: driverB.id,
        driverBProfileId: profileB.id,
        driverBVehicleId: vehicleB.id,
        boxTruckSpecId: boxTruck.id,
      }) +
      "\n",
  );
}

// Same shape as `prisma/seed.ts`: `process.exitCode` rather than
// `process.exit()`, so the run ends by itself with everything written out, and
// a single `finally` releases the pool on both paths — a bare `tsx` process has
// no Next.js runtime to tear the connection down and would otherwise hang.
main()
  .catch((error: unknown) => {
    console.error("Load board verification seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
