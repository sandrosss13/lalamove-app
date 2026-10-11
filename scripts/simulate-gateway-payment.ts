/**
 * Local-only: pretends a payment gateway confirmed a client's payment, so the
 * driver wallet can be tested before any gateway exists.
 *
 * In the application **nothing credits a wallet**: a job credits only once a
 * gateway has confirmed the client's payment, and no gateway is integrated.
 * This script is the one caller of `confirmGatewayPayment` — the exact
 * function a real gateway's webhook will call — so what it exercises is the
 * real seam and the real crediting, not a copy of them. It is a script and
 * never an API route on purpose: there must be no way to do this over HTTP.
 *
 * ## Run it (local database only)
 *
 *   source <scratchpad>/env.sh        # the local overrides; echoes the DB host
 *
 *   # Confirm the payment of an existing card order (by reference or id):
 *   pnpm exec tsx --conditions=react-server scripts/simulate-gateway-payment.ts --order GE-1234
 *
 *   # Give a test driver a credited balance: books a completed card job for
 *   # them paying ₾250.00 (plus optional overtime) and confirms its payment:
 *   pnpm exec tsx --conditions=react-server scripts/simulate-gateway-payment.ts \
 *     --phone +995555700001 --amount 250 [--overtime 12.50]
 *
 * `--conditions=react-server` is what lets a script import the application's
 * `server-only` modules; without it the import throws by design.
 *
 * ## What it writes
 *
 * - `--order`: the three gateway columns on that order's `Payment` (gateway
 *   `local-simulator`), then whatever `creditWalletForOrder` decides — ledger
 *   entries if the order is completed and its driver independent, nothing
 *   otherwise. Repeating it changes nothing. A cash order is refused.
 * - `--phone`: additionally one `COMPLETED` order for that driver, booked by
 *   the seed client, with a `Payment` row exactly as checkout writes one for a
 *   card (`provider: "none"`, `PAID`).
 *
 * Additive: there is no `delete`, `deleteMany` or `executeRaw` in this file.
 *
 * ## Why it refuses anything but a local database
 *
 * It asserts that money was received when none was. On a shared database that
 * is a balance a driver could ask to withdraw. The guard is the one
 * `scripts/seed-mobile-test-driver.ts` uses, with no override.
 */

import { randomBytes } from "node:crypto";

import {
  CargoCategory,
  ChassisType,
  GeorgianCity,
  OrderStatus,
  PaymentMethodType,
  PaymentStatus,
  PrismaClient,
  ServiceLevel,
} from "@prisma/client";

import { PLATFORM_COMMISSION_RATE } from "../src/lib/orders/payout";

const TAG = "[simulate-gateway-payment]";
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const SEED_CLIENT_EMAIL = "mobile-seed-client@example.test";
const VEHICLE_SPEC_CODE = "CARGO_VAN";
const GATEWAY_NAME = "local-simulator";
const MAX_AMOUNT = 10_000;
const MS_PER_HOUR = 60 * 60 * 1000;

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
          "records a payment as received when none was, so it runs against a " +
          "local database only.",
      );
    }
  }
}

type Args =
  | { mode: "order"; order: string }
  | { mode: "driver"; phone: string; amount: number; overtime: number };

function parseMoney(raw: string | undefined, flag: string): number {
  const value = Number(raw);

  if (
    raw === undefined ||
    !/^\d+(\.\d{1,2})?$/.test(raw) ||
    !Number.isFinite(value) ||
    value > MAX_AMOUNT
  ) {
    fail(
      `${flag} must be a lari amount with at most two decimals, up to ${MAX_AMOUNT}.`,
    );
  }

  return value;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const valueOf = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };

  const order = valueOf("--order");
  const phone = valueOf("--phone");

  if (order !== undefined && phone === undefined) {
    return { mode: "order", order };
  }

  if (phone !== undefined && order === undefined) {
    if (!/^\+\d{9,15}$/.test(phone)) {
      fail("--phone must be E.164 (a leading + and digits only).");
    }

    const amount = parseMoney(valueOf("--amount"), "--amount");
    if (amount <= 0) {
      fail("--amount must be more than zero.");
    }

    const rawOvertime = valueOf("--overtime");

    return {
      mode: "driver",
      phone,
      amount,
      overtime:
        rawOvertime === undefined ? 0 : parseMoney(rawOvertime, "--overtime"),
    };
  }

  fail(
    "Usage:\n" +
      "  tsx --conditions=react-server scripts/simulate-gateway-payment.ts --order <reference|id>\n" +
      "  tsx --conditions=react-server scripts/simulate-gateway-payment.ts --phone +995555700001 --amount 250 [--overtime 12.50]",
  );
}

assertLocalDatabase();

const prisma = new PrismaClient();

/** Books a completed card job for the driver, paid as checkout records it. */
async function bookCompletedCardJob(
  phone: string,
  amount: number,
  overtime: number,
): Promise<string> {
  const driver = await prisma.user.findUnique({
    where: { phoneNumber: phone },
    select: { id: true, role: true, driverProfile: { select: { id: true } } },
  });

  if (driver === null || driver.role !== "DRIVER" || !driver.driverProfile) {
    fail(
      `${phone} is not a driver with a profile — create one first with ` +
        "scripts/seed-mobile-test-driver.ts.",
    );
  }

  const spec = await prisma.vehicleTypeSpec.findUnique({
    where: { code: VEHICLE_SPEC_CODE },
    select: { id: true },
  });
  if (spec === null) {
    fail(`VehicleTypeSpec ${VEHICLE_SPEC_CODE} is not seeded.`);
  }

  const client = await prisma.user.upsert({
    where: { email: SEED_CLIENT_EMAIL },
    create: {
      id: randomBytes(24).toString("base64url"),
      name: "Mobile Seed Client",
      email: SEED_CLIENT_EMAIL,
      emailVerified: true,
      role: "CLIENT",
    },
    update: {},
    select: { id: true },
  });

  // The client-side figures a real booking would have produced for this
  // payout, at the platform's rate. Only the two driver columns are ever read
  // by the wallet.
  const round = (value: number) => Math.round(value * 100) / 100;
  const price = round(amount / (1 - PLATFORM_COMMISSION_RATE));
  const overtimeFee = round(overtime / (1 - PLATFORM_COMMISSION_RATE));
  const baseFare = round(Math.min(10, price));
  const now = new Date();

  const order = await prisma.order.create({
    data: {
      clientId: client.id,
      driverId: driver.id,
      vehicleTypeSpecId: spec.id,
      status: OrderStatus.COMPLETED,
      cargoCategory: CargoCategory.FURNITURE_FURNISHINGS,
      description: "Simulated paid job — wallet testing",
      bodyType: ChassisType.DRY_BOX,
      serviceLevel: ServiceLevel.REGULAR,
      pickupAddress: "12 Rustaveli Ave, Tbilisi",
      pickupCity: GeorgianCity.TBILISI,
      dropoffAddress: "45 Vazha-Pshavela Ave, Tbilisi",
      dropoffCity: GeorgianCity.TBILISI,
      distanceKm: 6.4,
      baseFare,
      distanceFare: round(price - baseFare),
      timeFare: 0,
      price,
      overtimeFee,
      commissionRate: PLATFORM_COMMISSION_RATE,
      driverPayout: amount,
      overtimeDriverPayout: overtime,
      paymentMethodType: PaymentMethodType.CARD,
      inTransitAt: new Date(now.getTime() - MS_PER_HOUR),
      completedAt: now,
      waitingMinutes: 0,
      // What `POST /api/orders/[id]/pay` writes for a card today: marked PAID
      // with no provider behind it. Not proof of money — that is the point.
      payment: {
        create: {
          provider: "none",
          amount: price,
          status: PaymentStatus.PAID,
          paidAt: now,
        },
      },
    },
    select: { id: true, reference: true },
  });

  process.stdout.write(
    `${TAG} booked completed card job ${order.reference} for ${phone}\n`,
  );

  return order.id;
}

async function main(): Promise<void> {
  const args = parseArgs();

  // Imported here, after the guard has run, and dynamically: the module pulls
  // in the application's Prisma client, which must never be constructed
  // against a database this script has not approved.
  const { confirmGatewayPayment } =
    await import("../src/lib/orders/gateway-confirmation");

  let orderId: string;

  if (args.mode === "order") {
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: args.order }, { reference: args.order }] },
      select: { id: true },
    });

    if (order === null) {
      fail(`No order with id or reference "${args.order}".`);
    }

    orderId = order.id;
  } else {
    orderId = await bookCompletedCardJob(
      args.phone,
      args.amount,
      args.overtime,
    );
  }

  const outcome = await confirmGatewayPayment({
    orderId,
    gatewayName: GATEWAY_NAME,
    // Derived from the order, so repeating the command repeats the *same*
    // confirmation — which is what a gateway's webhook retry looks like.
    gatewayReference: `sim-${orderId}`,
  });

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { reference: true, status: true, paymentMethodType: true },
  });

  process.stdout.write(
    [
      `${TAG} ${order.reference}  (${order.status}, ${order.paymentMethodType ?? "no payment method"})`,
      `  outcome   ${JSON.stringify(outcome)}`,
      "",
    ].join("\n"),
  );

  if (outcome.kind === "REFUSED") {
    process.exitCode = 2;
  }
}

main()
  .catch((error: unknown) => {
    console.error(`${TAG} failed:`, error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
