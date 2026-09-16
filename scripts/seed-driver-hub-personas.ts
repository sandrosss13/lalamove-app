/**
 * Manual-verification fixture for the Driver Hub's three registered-driver
 * personas — a MANUAL check, not an automated test.
 *
 * The hub branches on `HubPersona` (`src/lib/dashboard/hub/account.ts`) in
 * roughly thirty places: nav filtering, five loaders' tenancy scopes, four page
 * guards and two API refusals. None of that has ever been exercised at runtime,
 * because no account exists in any database for the ROSTER shape — a driver on
 * a fleet's roster, owning no vehicle of their own, reaching a company vehicle
 * only through an open `DriverVehicleAssignment`. It has been verified by
 * reading code and by `tsc`. This script is what puts the three accounts there
 * so a human can sign in as each of them and look.
 *
 * It asserts nothing. It creates accounts and orders and prints the credentials
 * and the URLs to check.
 *
 * ## Run it
 *
 *   pnpm seed:driver-hub-personas --dry-run   # reports, writes nothing
 *   pnpm seed:driver-hub-personas             # creates the fixture
 *
 * Start with `--dry-run`. It opens the database, reads it, prints exactly what
 * the real run would create or leave alone, and returns before the first write.
 *
 * ## Safety — read this before running it against the shared database
 *
 * `DATABASE_URL` in this repo points at a **shared remote Supabase instance**
 * with other people's data in it, and this script is meant to be run against
 * that database. That is the opposite premise from
 * `scripts/verify-load-board-seed.ts`, which refuses to run anywhere but
 * localhost — and the difference is not a relaxation of that script's standard,
 * it is what that standard demands of a script shaped like this one. That one
 * `deleteMany`s a client's whole order book, so the only safe answer was to
 * confine it to a database nobody else is using. This one is safe to point at a
 * shared database because of how it is built, and it has to hold up to that:
 *
 * - **Strictly additive.** There is no `delete`, `deleteMany`, `executeRaw` or
 *   `updateMany` anywhere in this file. Grep for them; the absence is the
 *   guarantee.
 * - **Every row it creates is namespaced.** Users live under
 *   `@persona-seed.example.com`; every other row it writes carries an id it
 *   chose, beginning with `persona-seed-`; plates begin `PS-`. Nothing it
 *   creates can be mistaken for real data, and everything it creates can be
 *   found by one `LIKE` query.
 * - **It never writes to a row it did not create.** Every write is either an
 *   `upsert` keyed on one of those namespaced ids, or a `create` for a `User`
 *   whose address is in the seed domain. Before any of that, `checkOwnership`
 *   below re-reads each key and refuses the whole run if something it is about
 *   to write to exists and is *not* one of ours — a `PS-` plate on a stranger's
 *   vehicle, a seed phone number on a real company. That refusal is the point:
 *   the natural-key collision is the only route by which an additive script can
 *   reach a row it does not own, and it is closed rather than argued away.
 *
 * ## Removing it afterwards
 *
 * Delete the seed's users. Everything else is reachable from them by a
 * cascading foreign key, so one statement removes the whole fixture:
 *
 *   DELETE FROM "user" WHERE email LIKE '%@persona-seed.example.com';
 *
 * `Account`, `Session`, `DriverProfile`, `ClientProfile` and `LogisticsCompany`
 * cascade from `User`; `Vehicle`, `DriverVehicleAssignment` and `DriverLicence`
 * cascade from the profile or the company; and every seeded `Order` cascades
 * from the seed client that placed it (`Order.clientId` is `onDelete: Cascade`).
 * Re-check those cascade rules in `prisma/schema.prisma` before trusting this
 * paragraph if the schema has moved on. To see what would go first:
 *
 *   SELECT id, email, role FROM "user" WHERE email LIKE '%@persona-seed.example.com';
 *
 * ## Re-running it
 *
 * Idempotent, and idempotent *by upsert* rather than by the demolition
 * `verify-load-board-seed.ts` uses — deleting rows is exactly what this script
 * may not do. Every row has a deterministic, seed-namespaced id, so a second
 * run updates its own rows back to the intended state instead of stacking a
 * second copy of the fixture on the first.
 *
 * Re-running is also how the fixture is kept *current*: the completed orders
 * below are dated into the current Tbilisi week, and the hub's Earnings and
 * Performance screens only count that week. Run it again after a Monday and the
 * figures come back.
 *
 * ## The credential
 *
 * All seven accounts share one password, printed at the end and fixed rather
 * than random, because a re-run must not silently invalidate the credentials
 * from the first run. It is therefore a **known password on a shared database**:
 * these accounts are a fixture, not a place to put anything, and they should be
 * deleted when the verification is done. `PERSONA_SEED_PASSWORD=<value>` in the
 * environment overrides it for the accounts a run actually creates.
 */
import { fileURLToPath } from "node:url";

import type {
  CargoCategory,
  ChassisType,
  GeorgianCity,
  LicenceCategory,
  OrderStatus,
  ServiceLevel,
  VehicleClass,
} from "@prisma/client";

import {
  driverPayoutFor,
  PLATFORM_COMMISSION_RATE,
} from "../src/lib/orders/payout";
import {
  differenceInHubDays,
  startOfHubDayPlus,
  startOfHubWeek,
} from "../src/lib/dashboard/hub/timezone";

/**
 * The marker every row this script creates carries, and the string a human
 * greps for to find them all. Changing it strands whatever a previous run
 * created — the ownership check below would then see those rows as strangers'
 * and refuse — so change it only together with a cleanup of the old namespace.
 */
const SEED_PREFIX = "persona-seed";

/**
 * The email domain the seed's accounts live under. A subdomain of `example.com`
 * (reserved by RFC 2606, so it can never route anywhere) and named after the
 * seed, so the address is simultaneously safe, obviously synthetic, and
 * attributable to this script.
 */
const SEED_EMAIL_DOMAIN = `${SEED_PREFIX}.example.com`;

/** Prefix on every `plateNumber` the seed registers. */
const SEED_PLATE_PREFIX = "PS-";

/**
 * The shared password. Fixed, not random — see the module comment. It clears
 * Better Auth's eight-character minimum with room to spare and is written to be
 * unmistakably a fixture credential rather than something anyone would reuse.
 */
const DEFAULT_SEED_PASSWORD = "persona-seed-fixture-2026";

/** Environment override for the password, applied only to accounts a run creates. */
const PASSWORD_ENV_VAR = "PERSONA_SEED_PASSWORD";

/**
 * Env files to load, highest precedence first. Verbatim from
 * `scripts/seed-super-admin.ts`, including the ordering: `process.loadEnvFile`
 * never overwrites a variable that is already set, so the first file to define
 * a key wins and the real environment beats both — which reproduces Next.js'
 * own `.env.local` over `.env` precedence.
 */
const ENV_FILES = [".env.local", ".env"] as const;

/** Milliseconds in a minute and in an hour, for the date arithmetic below. */
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * The flat base fare stamped on every seeded order, and the share of the
 * remainder booked as distance rather than time.
 *
 * The split is arbitrary and no read path adds these components up — they exist
 * so the row is not half-empty, exactly as in `verify-load-board-seed.ts`. It
 * only reconciles back to `price` while every price below stays above the base
 * fare, which a cheaper load would violate by booking a negative distance fare.
 */
const SEED_BASE_FARE = 12;
const SEED_DISTANCE_FARE_SHARE = 0.7;

/**
 * An expected, explainable refusal — a taxonomy that has not been seeded, a
 * namespace collision with a row we do not own. Reported as a bare message,
 * since a stack trace for these hides the actual problem. Same shape and same
 * reasoning as `SeedError` in `scripts/seed-super-admin.ts`.
 */
class SeedError extends Error {}

const USAGE = `Usage: pnpm seed:driver-hub-personas [--dry-run]`;

/** Which of the seed's drivers a row belongs to. */
type SeedDriverKey =
  | "independent"
  | "roster-lead"
  | "roster-second"
  | "roster-third"
  | "roster-idle";

/** Whose screens an order is meant to appear on. */
type OrderScope = "FLEET" | "INDEPENDENT";

type DriverPlan = {
  key: SeedDriverKey;
  /** The part of the address before `@` — the whole address is derived. */
  emailLocalPart: string;
  firstName: string;
  lastName: string;
  phone: string;
  /**
   * Whether this driver sits on the seed fleet's roster. `true` writes
   * `DriverProfile.companyId`, which is the single column that makes
   * `resolveHubAccount()` return `ROSTER` rather than `INDEPENDENT`.
   */
  onRoster: boolean;
  /**
   * Licence categories on file. B covers vans, C covers rigid trucks — see
   * `src/lib/driver-onboarding/vehicle-classes.ts`. Written for fidelity to
   * what `POST /api/logistics-company/drivers/register` produces rather than
   * because any hub screen reads them.
   */
  licenceCategories: LicenceCategory[];
  /** One line about what this account is for, printed in the summary. */
  role: string;
};

/**
 * The seed's drivers.
 *
 * Four on the roster rather than the two the shapes strictly need, because the
 * fleet's Earnings and Performance tables are built from different sources and
 * only disagree when the roster is uneven: Earnings lists drivers that have
 * completed orders, Performance lists the roster. `roster-idle` has no orders
 * and no vehicle at all, so it appears on one screen and not the other — which
 * is the row that proves the two tables are not the same query.
 */
const DRIVERS: readonly DriverPlan[] = [
  {
    key: "independent",
    emailLocalPart: "independent.driver",
    firstName: "Dato",
    lastName: "Beridze",
    phone: "+995599900101",
    onRoster: false,
    licenceCategories: ["B"],
    role: "INDEPENDENT — owns their van, keeps their own fares",
  },
  {
    key: "roster-lead",
    emailLocalPart: "roster.driver",
    firstName: "Nino",
    lastName: "Kapanadze",
    phone: "+995599900102",
    onRoster: true,
    licenceCategories: ["B", "C"],
    role: "ROSTER — employed by the fleet, drives a company vehicle",
  },
  {
    key: "roster-second",
    emailLocalPart: "roster.driver.two",
    firstName: "Giorgi",
    lastName: "Tsiklauri",
    phone: "+995599900103",
    onRoster: true,
    licenceCategories: ["B", "C"],
    role: "ROSTER — second roster driver, has a cancelled job",
  },
  {
    key: "roster-third",
    emailLocalPart: "roster.driver.three",
    firstName: "Mariam",
    lastName: "Gelashvili",
    phone: "+995599900104",
    onRoster: true,
    licenceCategories: ["B"],
    role: "ROSTER — third roster driver, low volume",
  },
  {
    key: "roster-idle",
    emailLocalPart: "roster.driver.idle",
    firstName: "Levan",
    lastName: "Chkheidze",
    phone: "+995599900105",
    onRoster: true,
    licenceCategories: ["B"],
    role: "ROSTER — on the roster, no vehicle and no orders at all",
  },
];

type VehiclePlan = {
  key: string;
  plateNumber: string;
  /** `INDEPENDENT` writes `driverProfileId`; `FLEET` writes `companyId`. */
  owner: "INDEPENDENT" | "FLEET";
  /**
   * The roster driver this company vehicle is currently assigned to, through an
   * open `DriverVehicleAssignment` — the only way a ROSTER driver reaches a
   * vehicle at all, and the relation `resolveHubAccount()` falls back to for
   * the account chip's subline. `null` leaves the vehicle in the yard.
   */
  assignedTo: SeedDriverKey | null;
  /** `VehicleTypeSpec.code`, resolved to an id at run time. */
  specCode: string;
  vehicleClass: VehicleClass;
  chassisType: ChassisType;
  make: string;
  model: string;
  year: number;
  colour: string;
};

/**
 * The seed's vehicles.
 *
 * The independent driver owns one outright. The fleet owns four, three of them
 * assigned out and one spare, so the fleet's Vehicles screen has both an
 * assigned and an unassigned row to render.
 *
 * The declared capacity columns (`payloadKg`, `cargoLengthM`…) are deliberately
 * left null on every row, which reads as "no de-rating declared" and makes
 * `capabilityOf` in `src/lib/orders/vehicle-fit.ts` fall back to the class
 * spec. `verify-load-board-seed.ts` de-rates a van on purpose because vehicle
 * fit is what it tests; nothing here does, and a hard-coded envelope would be
 * one more figure to keep in step with `prisma/seed.ts`.
 */
const VEHICLES: readonly VehiclePlan[] = [
  {
    key: "independent-van",
    plateNumber: `${SEED_PLATE_PREFIX}IND-001`,
    owner: "INDEPENDENT",
    assignedTo: null,
    specCode: "CARGO_VAN",
    vehicleClass: "LARGE_VAN",
    chassisType: "DRY_BOX",
    make: "Mercedes-Benz",
    model: "Sprinter",
    year: 2020,
    colour: "White",
  },
  {
    key: "fleet-van",
    plateNumber: `${SEED_PLATE_PREFIX}FLT-001`,
    owner: "FLEET",
    assignedTo: "roster-lead",
    specCode: "CARGO_VAN",
    vehicleClass: "LARGE_VAN",
    chassisType: "DRY_BOX",
    make: "Ford",
    model: "Transit",
    year: 2021,
    colour: "White",
  },
  {
    key: "fleet-box-truck",
    plateNumber: `${SEED_PLATE_PREFIX}FLT-002`,
    owner: "FLEET",
    assignedTo: "roster-second",
    specCode: "BOX_TRUCK",
    vehicleClass: "MEDIUM_TRUCK",
    chassisType: "DRY_BOX",
    make: "Isuzu",
    model: "NPR",
    year: 2019,
    colour: "Blue",
  },
  {
    key: "fleet-reefer",
    plateNumber: `${SEED_PLATE_PREFIX}FLT-003`,
    owner: "FLEET",
    assignedTo: "roster-third",
    specCode: "REFRIGERATED_VAN",
    vehicleClass: "LARGE_VAN",
    chassisType: "REFRIGERATED",
    make: "Renault",
    model: "Master Frigo",
    year: 2022,
    colour: "Silver",
  },
  {
    key: "fleet-spare",
    plateNumber: `${SEED_PLATE_PREFIX}FLT-004`,
    owner: "FLEET",
    assignedTo: null,
    specCode: "BOX_TRUCK",
    vehicleClass: "MEDIUM_TRUCK",
    chassisType: "DRY_BOX",
    make: "Mitsubishi",
    model: "Fuso Canter",
    year: 2018,
    colour: "Grey",
  },
];

/** The two ends of a job, kept together so a row reads as one route. */
type SeedRoute = {
  pickup: string;
  dropoff: string;
};

const ROUTES: readonly SeedRoute[] = [
  { pickup: "12 Rustaveli Ave, Tbilisi", dropoff: "7 Kostava St, Tbilisi" },
  { pickup: "44 Chavchavadze Ave, Tbilisi", dropoff: "3 Pekini St, Tbilisi" },
  {
    pickup: "18 Aghmashenebeli Ave, Tbilisi",
    dropoff: "91 Vazha-Pshavela Ave, Tbilisi",
  },
  {
    pickup: "6 Marjanishvili St, Tbilisi",
    dropoff: "27 Tsereteli Ave, Tbilisi",
  },
  { pickup: "2 Gulua St, Tbilisi", dropoff: "15 Kazbegi Ave, Tbilisi" },
];

/**
 * The route for the n-th order. Cycles rather than being written out per order:
 * no screen reads the addresses for anything but a route label, so distinct
 * strings are worth exactly enough to tell two rows apart in the pill.
 */
function routeFor(index: number): SeedRoute {
  // `noUncheckedIndexedAccess` — the modulo is in range, but the compiler
  // cannot know that, and a fallback is cheaper than an assertion.
  return (
    ROUTES[index % ROUTES.length] ?? { pickup: "Tbilisi", dropoff: "Tbilisi" }
  );
}

type ActiveOrderPlan = {
  key: string;
  status: Extract<OrderStatus, "ACCEPTED" | "IN_TRANSIT">;
  scope: OrderScope;
  /** `null` means a company order claimed but not yet dispatched to a person. */
  driver: SeedDriverKey | null;
  /**
   * How long ago the order was booked. The header pill orders in-flight jobs by
   * `createdAt` descending and then caps the list, so this is what decides
   * which rows land in the preview — see the comments on the rows themselves.
   */
  bookedMinutesAgo: number;
  /**
   * Minutes from now to `Order.deliveryDeadline`, or `null` for an order that
   * agreed none. Negative renders as "Overdue"; null renders as no ETA at all.
   * These are what `formatEta` in `src/lib/dashboard/hub/header.ts` turns into
   * the pill's countdown, and the three cases are the three it can produce.
   */
  deadlineMinutesFromNow: number | null;
  /**
   * Whole days from today to `Order.scheduledAt`, or `null` to leave the
   * column unset.
   *
   * This is what `startBlockedReason` in `job-sheet-actions.tsx` reads to
   * decide whether `Start delivery` is pressable: it compares Tbilisi
   * *calendar days*, so `0` is startable today and anything positive is
   * blocked with "You can start it on the day."
   *
   * Every fixture left this null until the job sheet's runtime verification,
   * which meant the blocked branch could only be reached by hand-editing a
   * row — a state the screen ships with and that the fixture could not show.
   * One order below is now dated forward so both branches exist in a seeded
   * database.
   */
  scheduledDaysFromNow: number | null;
  price: number;
  serviceLevel: ServiceLevel;
  distanceKm: number;
  cargoCategory: CargoCategory;
  /** What this particular row is in the fixture to demonstrate. */
  proves: string;
};

/**
 * The in-flight orders, newest first.
 *
 * The fleet holds five, which is the point: `HubHeaderData.jobsInProgressCount`
 * is its own uncapped `COUNT(*)` while `jobsInProgress` is capped at three for
 * a fleet, and a fixture with three or fewer cannot tell a correct split from
 * one that silently pins the count at the preview limit. The three that do get
 * previewed are the three newest, and they are arranged so that between them
 * they cover every branch the pill has: an unassigned row, an overdue deadline,
 * and no deadline at all.
 *
 * `roster-lead` deliberately holds two. Nothing in the schema enforces "one job
 * per driver", and `SINGLE_DRIVER_JOB_PREVIEW_LIMIT` is a `take` rather than an
 * assumption for exactly that reason — so the roster driver's own pill counts
 * two and previews one, which is the same split the fleet's pill makes and is
 * otherwise invisible on a single-driver account.
 */
const ACTIVE_ORDERS: readonly ActiveOrderPlan[] = [
  {
    key: "fleet-active-unassigned",
    status: "ACCEPTED",
    scope: "FLEET",
    driver: null,
    bookedMinutesAgo: 25,
    deadlineMinutesFromNow: 130,
    scheduledDaysFromNow: 0,
    price: 148,
    serviceLevel: "REGULAR",
    distanceKm: 31.4,
    cargoCategory: "RETAIL_STOCK",
    proves:
      'Newest, so it heads the fleet pill: sub-line reads "Unassigned · <ref>" and the ETA reads "2 h 10".',
  },
  {
    key: "fleet-active-overdue",
    status: "IN_TRANSIT",
    scope: "FLEET",
    driver: "roster-lead",
    bookedMinutesAgo: 70,
    deadlineMinutesFromNow: -35,
    scheduledDaysFromNow: 0,
    price: 96.5,
    serviceLevel: "PRIORITY",
    distanceKm: 18.2,
    cargoCategory: "APPLIANCES",
    proves:
      'Deadline already passed, so the pill reads "Overdue" rather than a countdown.',
  },
  {
    key: "fleet-active-no-deadline",
    status: "ACCEPTED",
    scope: "FLEET",
    driver: "roster-lead",
    bookedMinutesAgo: 145,
    deadlineMinutesFromNow: null,
    scheduledDaysFromNow: 3,
    price: 210,
    serviceLevel: "REGULAR",
    distanceKm: 54.8,
    cargoCategory: "FURNITURE_FURNISHINGS",
    proves:
      "No deadline agreed, so the row shows no ETA — the common null, not a fault. Also the roster driver's second in-flight job, and the one order dated forward, so its job sheet shows `Start delivery` blocked until the day.",
  },
  {
    key: "fleet-active-fourth",
    status: "IN_TRANSIT",
    scope: "FLEET",
    driver: "roster-second",
    bookedMinutesAgo: 220,
    deadlineMinutesFromNow: 45,
    scheduledDaysFromNow: 0,
    price: 268,
    serviceLevel: "REGULAR",
    distanceKm: 74.1,
    cargoCategory: "CONSTRUCTION_MATERIALS",
    proves:
      "Fourth-newest, so it is counted by the fleet pill but falls outside its three-row preview.",
  },
  {
    key: "fleet-active-fifth",
    status: "ACCEPTED",
    scope: "FLEET",
    driver: "roster-third",
    bookedMinutesAgo: 300,
    deadlineMinutesFromNow: 360,
    scheduledDaysFromNow: 0,
    price: 122.75,
    serviceLevel: "POOLING",
    distanceKm: 41.6,
    cargoCategory: "RETAIL_STOCK",
    proves: "Fifth in flight — the fleet pill must read 5 while listing 3.",
  },
  {
    key: "independent-active",
    status: "IN_TRANSIT",
    scope: "INDEPENDENT",
    driver: "independent",
    bookedMinutesAgo: 55,
    deadlineMinutesFromNow: 95,
    scheduledDaysFromNow: 0,
    price: 87.4,
    serviceLevel: "REGULAR",
    distanceKm: 22.9,
    cargoCategory: "EVENT_EQUIPMENT",
    proves:
      'The independent driver\'s singular pill: "Job in progress · <ref>", ETA "1 h 35", and no driver name on the sub-line.',
  },
];

type FinishedOrderPlan = {
  key: string;
  status: Extract<OrderStatus, "COMPLETED" | "CANCELLED">;
  scope: OrderScope;
  /**
   * `null` on a COMPLETED company order is the whole reason two figures exist
   * that have never been seen: the Earnings fleet card's "Not assigned to a
   * driver" reconciliation row, and Performance's
   * `unattributedFinishedJobCount`.
   */
  driver: SeedDriverKey | null;
  price: number;
  serviceLevel: ServiceLevel;
  /**
   * Loading overtime settled at completion, on top of `price`. Non-zero on a
   * few rows so `Order.overtimeDriverPayout` is not uniformly zero — it is a
   * separate column from `driverPayout` and every earnings figure is the sum of
   * the two, which a fixture of zeroes cannot distinguish from a bug.
   */
  overtimeFee: number;
  distanceKm: number;
  cargoCategory: CargoCategory;
  proves: string;
};

/**
 * The finished orders — everything Earnings and Performance count.
 *
 * Every one of these is dated into the **current Tbilisi week** at run time (see
 * `finishedTimestamps`), because that is the window both rollups use.
 * Both `createdAt` and `completedAt` are set, and both matter: Earnings and the
 * daily bars key on `completedAt`, while the completion and cancellation rates
 * and `unattributedFinishedJobCount` key on `createdAt`. A row created last week
 * and completed this one is a real case, but it is a confusing fixture, so
 * every row here sits wholly inside the week.
 */
const FINISHED_ORDERS: readonly FinishedOrderPlan[] = [
  {
    key: "fleet-done-lead-1",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-lead",
    price: 184,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 47.3,
    cargoCategory: "RETAIL_STOCK",
    proves: "Top of the fleet's Earnings and Performance driver tables.",
  },
  {
    key: "fleet-done-lead-2",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-lead",
    price: 240.5,
    serviceLevel: "PRIORITY",
    overtimeFee: 18,
    distanceKm: 66.8,
    cargoCategory: "CONSTRUCTION_MATERIALS",
    proves:
      "Carries both an overtime payout and a Priority uplift, so driverPayout and overtimeDriverPayout are separately visible.",
  },
  {
    key: "fleet-done-lead-3",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-lead",
    price: 132,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 29.5,
    cargoCategory: "APPLIANCES",
    proves:
      "Volume, so the roster driver's own Performance bars span several days.",
  },
  {
    key: "fleet-done-lead-4",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-lead",
    price: 97.25,
    serviceLevel: "POOLING",
    overtimeFee: 0,
    distanceKm: 21.4,
    cargoCategory: "FURNITURE_FURNISHINGS",
    proves:
      "A Pooling discount, so the payout basis is not always price alone.",
  },
  {
    key: "fleet-done-second-1",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-second",
    price: 310,
    serviceLevel: "REGULAR",
    overtimeFee: 24,
    distanceKm: 88.2,
    cargoCategory: "INDUSTRIAL_SUPPLIES",
    proves: "Second-highest earner, so the fleet table has a real ordering.",
  },
  {
    key: "fleet-done-second-2",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-second",
    price: 141.6,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 35.1,
    cargoCategory: "RETAIL_STOCK",
    proves: "Fills out the second driver's week.",
  },
  {
    key: "fleet-cancelled-second",
    status: "CANCELLED",
    scope: "FLEET",
    driver: "roster-second",
    price: 118,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 27.8,
    cargoCategory: "RETAIL_STOCK",
    proves:
      "The only reason any completion rate reads under 100%: cancellations are counted by createdAt, and this driver has one.",
  },
  {
    key: "fleet-done-third-1",
    status: "COMPLETED",
    scope: "FLEET",
    driver: "roster-third",
    price: 76.4,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 16.2,
    cargoCategory: "EVENT_EQUIPMENT",
    proves:
      "A small share, so the Earnings table's sharePercent column is not all round numbers.",
  },
  {
    key: "fleet-done-unassigned-1",
    status: "COMPLETED",
    scope: "FLEET",
    driver: null,
    price: 205,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 58.7,
    cargoCategory: "CONSTRUCTION_MATERIALS",
    proves:
      'Completed with no driver: the Earnings fleet card\'s "Not assigned to a driver" row, and a job Performance cannot attribute.',
  },
  {
    key: "fleet-done-unassigned-2",
    status: "COMPLETED",
    scope: "FLEET",
    driver: null,
    price: 163.9,
    serviceLevel: "REGULAR",
    overtimeFee: 12,
    distanceKm: 44.5,
    cargoCategory: "RETAIL_STOCK",
    proves:
      "A second unattributed job, so the reconciliation row is plural and its share is visible.",
  },
  {
    key: "fleet-cancelled-unassigned",
    status: "CANCELLED",
    scope: "FLEET",
    driver: null,
    price: 99,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 24.1,
    cargoCategory: "APPLIANCES",
    proves:
      "Cancelled and unattributed, so unattributedFinishedJobCount counts cancellations as well as completions.",
  },
  {
    key: "independent-done-1",
    status: "COMPLETED",
    scope: "INDEPENDENT",
    driver: "independent",
    price: 128.5,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 30.6,
    cargoCategory: "FURNITURE_FURNISHINGS",
    proves:
      "The independent driver's own money — companyId stays null on every one of these.",
  },
  {
    key: "independent-done-2",
    status: "COMPLETED",
    scope: "INDEPENDENT",
    driver: "independent",
    price: 172,
    serviceLevel: "PRIORITY",
    overtimeFee: 15,
    distanceKm: 43.9,
    cargoCategory: "RETAIL_STOCK",
    proves:
      "Priority plus overtime, so their earnings total is not a plain sum of prices.",
  },
  {
    key: "independent-done-3",
    status: "COMPLETED",
    scope: "INDEPENDENT",
    driver: "independent",
    price: 91.2,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 19.7,
    cargoCategory: "APPLIANCES",
    proves: "Spreads their Performance bars across the week.",
  },
  {
    key: "independent-done-4",
    status: "COMPLETED",
    scope: "INDEPENDENT",
    driver: "independent",
    price: 154.75,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 38.4,
    cargoCategory: "EVENT_EQUIPMENT",
    proves: "Fourth completion, so averagePerJob is a real average.",
  },
  {
    key: "independent-cancelled",
    status: "CANCELLED",
    scope: "INDEPENDENT",
    driver: "independent",
    price: 64,
    serviceLevel: "REGULAR",
    overtimeFee: 0,
    distanceKm: 12.3,
    cargoCategory: "RETAIL_STOCK",
    proves: "Keeps the independent driver's completion rate off a flat 100%.",
  },
];

/** The deterministic id this seed gives a row, by kind and key. */
function seedId(kind: string, key: string): string {
  return `${SEED_PREFIX}-${kind}-${key}`;
}

/** The seed email address for a local part. */
function seedEmail(localPart: string): string {
  return `${localPart}@${SEED_EMAIL_DOMAIN}`;
}

/** Whether an id was minted by this seed — the ownership test for every non-user row. */
function isSeedId(id: string): boolean {
  return id.startsWith(`${SEED_PREFIX}-`);
}

/** Whether an address belongs to the seed's namespace — the ownership test for users. */
function isSeedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${SEED_EMAIL_DOMAIN}`);
}

/** The same rounding every money figure in this codebase lands on. */
function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Populate `process.env` from the project's env files.
 *
 * Verbatim from `scripts/seed-super-admin.ts`, for the same reasons: Next.js
 * does this itself and a bare `tsx` process does not, so without it
 * `new PrismaClient()` fails on a missing `DATABASE_URL` and Better Auth on a
 * missing `BETTER_AUTH_SECRET`. Paths resolve against this file rather than
 * `process.cwd()` so the script works from a subdirectory, and through
 * `fileURLToPath` rather than `URL.pathname` so a checkout in a directory with
 * a space in its name still works.
 */
function loadEnvFiles(): void {
  for (const file of ENV_FILES) {
    try {
      process.loadEnvFile(
        fileURLToPath(new URL(`../${file}`, import.meta.url)),
      );
    } catch {
      // Absent or unreadable: fall through to the next file, and ultimately to
      // whatever the real environment provides.
    }
  }
}

/**
 * Positional parsing, kept deliberately minimal — an operational script, not a
 * CLI. Same shape as `parseArgs` in `scripts/seed-super-admin.ts`.
 */
function parseArgs(argv: readonly string[]): { dryRun: boolean } {
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    throw new SeedError(`Unknown argument "${arg}".\n${USAGE}`);
  }

  return { dryRun };
}

/** Write a block of lines to stdout, one per line. */
function write(lines: readonly string[]): void {
  // `console.log` is disallowed by the project's lint rules; this is a CLI
  // script, so write to stdout directly (same convention as `prisma/seed.ts`,
  // `scripts/seed-super-admin.ts` and `scripts/verify-load-board-seed.ts`).
  process.stdout.write(`${lines.join("\n")}\n`);
}

/**
 * Timestamps for the n-th finished order: booked and, if it completed, finished
 * — both inside the current Tbilisi week and both in the past.
 *
 * The week is Monday-anchored in `Asia/Tbilisi`, which is what
 * `startOfHubWeek()` resolves and what every hub loader bounds its queries by.
 * Orders are spread over the days that have actually elapsed so far this week,
 * so Performance's Mon–Sun bars have more than one bar standing — except on a
 * Monday, when there is only one day to spread over and the fixture honestly
 * has one bar.
 *
 * Everything is pinned to the past. The week aggregates have a `gte` bound and
 * no upper one, so an order completed at a future instant would silently count
 * toward this week's figure — the one date mistake here that produces a wrong
 * number rather than an empty screen.
 */
function finishedTimestamps(
  index: number,
  now: Date,
): { createdAt: Date; completedAt: Date } {
  const weekStart = startOfHubWeek(now);
  const daysElapsed = differenceInHubDays(weekStart, now);
  const dayOffset = index % (daysElapsed + 1);
  const dayStart = startOfHubDayPlus(weekStart, dayOffset);

  // Mid-morning on the chosen day, staggered per order so two rows on the same
  // day do not share an instant.
  const preferred = new Date(
    dayStart.getTime() + 9 * MS_PER_HOUR + index * 37 * MS_PER_MINUTE,
  );

  // The chosen day may be today, in which case mid-morning can still be ahead
  // of the clock — fall back to a moment safely behind `now`. Floored at the
  // start of the week so a run in the small hours of Monday cannot date a row
  // out of the window it is supposed to land in.
  const completedAt =
    preferred.getTime() < now.getTime()
      ? preferred
      : new Date(
          Math.max(
            weekStart.getTime() + 5 * MS_PER_MINUTE,
            now.getTime() - (index + 1) * 13 * MS_PER_MINUTE,
          ),
        );

  // Booked three hours before it finished, or at the top of the week if that
  // would fall out of it. Both timestamps have to be in-week: the money figures
  // key on `completedAt` and the completion rates key on `createdAt`, so a row
  // straddling the boundary would appear on one screen and not the other.
  const createdAt = new Date(
    Math.max(
      weekStart.getTime() + MS_PER_MINUTE,
      completedAt.getTime() - 3 * MS_PER_HOUR,
    ),
  );

  return { createdAt, completedAt };
}

/**
 * The money columns for an order, stamped by production's own functions rather
 * than written by hand — the same property `verify-load-board-seed.ts` insists
 * on, so the arithmetic the screens display is the arithmetic `POST /api/orders`
 * would have produced.
 *
 * The basis is `roundCurrency(price + serviceLevelAdjustment)`, rounded
 * *before* it is commissioned. That ordering is not cosmetic: it is what
 * `POST /api/orders` does and what `src/lib/orders/payout.ts` documents at
 * length, and the two orderings disagree by a tetri on a real share of amounts.
 */
function moneyFor(
  price: number,
  adjustment: number,
  overtimeFee: number,
): {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  commissionRate: number;
  driverPayout: number;
  overtimeDriverPayout: number;
} {
  const commissionRate = PLATFORM_COMMISSION_RATE;
  const driverPayout = driverPayoutFor(
    roundCurrency(price + adjustment),
    commissionRate,
  );

  // The overtime is settled separately at completion and commissioned into its
  // own column at the rate stored on the order — never folded into
  // `driverPayout`, which must keep meaning "what the job was quoted to pay".
  const overtimeDriverPayout =
    overtimeFee === 0 ? 0 : driverPayoutFor(overtimeFee, commissionRate);

  const distanceFare = roundCurrency(
    (price - SEED_BASE_FARE) * SEED_DISTANCE_FARE_SHARE,
  );
  const timeFare = roundCurrency(price - SEED_BASE_FARE - distanceFare);

  return {
    baseFare: SEED_BASE_FARE,
    distanceFare,
    timeFare,
    commissionRate,
    driverPayout,
    overtimeDriverPayout,
  };
}

async function main(): Promise<void> {
  // Parsed before anything else so a typo costs nothing and opens no database
  // connection.
  const { dryRun } = parseArgs(process.argv.slice(2));

  loadEnvFiles();

  // Imported dynamically, and only after `loadEnvFiles()`. Every one of these
  // reads `process.env` at module-evaluation time — `@/lib/prisma` constructs a
  // `PrismaClient`, `@/lib/auth` reads `BETTER_AUTH_SECRET`, `@/lib/host` reads
  // the host split's variables — and `@/lib/pricing` pulls in `@prisma/client`,
  // whose own env-conflict check populates `process.env` from `.env` as a side
  // effect and would therefore beat `.env.local` to every key. Hoisting any of
  // these to a static `import` would break either the script or that
  // precedence. Do not "tidy" them into the import block above. (The two static
  // imports at the top are safe precisely because neither
  // `src/lib/orders/payout.ts` nor `src/lib/dashboard/hub/timezone.ts` imports
  // anything at all.)
  const [{ auth }, { prisma }, { APIError }, { serviceLevelAdjustment }, host] =
    await Promise.all([
      import("@/lib/auth"),
      import("@/lib/prisma"),
      import("better-auth/api"),
      import("@/lib/pricing"),
      import("@/lib/host"),
    ]);

  try {
    const password = process.env[PASSWORD_ENV_VAR] ?? DEFAULT_SEED_PASSWORD;
    const now = new Date();

    write([
      "",
      `Driver Hub persona seed${dryRun ? " — DRY RUN, nothing will be written" : ""}`,
      "=".repeat(72),
      "",
    ]);

    // ---------------------------------------------------------------------
    // Read-only phase. Everything below this point up to `if (dryRun) return`
    // is queries and refusals only, which is what makes `--dry-run` a genuine
    // no-op rather than a promise.
    // ---------------------------------------------------------------------

    // The vehicle taxonomy has to exist before anything can reference it. It is
    // written by `prisma/seed.ts`, so a database that has never been seeded
    // fails here with a clear cause rather than on a foreign key later.
    const specCodes = [...new Set(VEHICLES.map((vehicle) => vehicle.specCode))];
    const specs = await prisma.vehicleTypeSpec.findMany({
      where: { code: { in: specCodes } },
      select: { id: true, code: true, label: true },
    });
    const specIdByCode = new Map(specs.map((spec) => [spec.code, spec.id]));

    const missingSpecs = specCodes.filter((code) => !specIdByCode.has(code));
    if (missingSpecs.length > 0) {
      throw new SeedError(
        `The vehicle taxonomy is missing ${missingSpecs.join(", ")}.\n` +
          "Run `pnpm exec prisma db seed` against this database first — the " +
          "vehicles below reference VehicleTypeSpec rows by code.",
      );
    }

    // Which of the seed's accounts already exist, from an earlier run.
    const seedEmails = [
      seedEmail("client"),
      seedEmail("fleet"),
      ...DRIVERS.map((driver) => seedEmail(driver.emailLocalPart)),
    ];
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: seedEmails } },
      select: {
        id: true,
        email: true,
        role: true,
        isSuspended: true,
        mustChangePassword: true,
      },
    });
    const existingUserByEmail = new Map(
      existingUsers.map((user) => [user.email, user]),
    );

    // The ownership check. An additive script can only ever reach a row it does
    // not own through a natural-key collision — a unique plate, a unique phone
    // — so those are enumerated and checked here, before the first write. A
    // collision is a refusal, never an update.
    const collisions: string[] = [];

    const collidingVehicles = await prisma.vehicle.findMany({
      where: { plateNumber: { in: VEHICLES.map((v) => v.plateNumber) } },
      select: { id: true, plateNumber: true },
    });
    for (const vehicle of collidingVehicles) {
      if (!isSeedId(vehicle.id)) {
        collisions.push(
          `Vehicle plate ${vehicle.plateNumber} already belongs to vehicle ${vehicle.id}, which this seed did not create.`,
        );
      }
    }

    const fleetPhone = "+995322900100";
    const clientPhone = "+995322900200";

    const collidingCompany = await prisma.logisticsCompany.findUnique({
      where: { phone: fleetPhone },
      select: { id: true },
    });
    if (collidingCompany && !isSeedId(collidingCompany.id)) {
      collisions.push(
        `LogisticsCompany.phone ${fleetPhone} already belongs to company ${collidingCompany.id}, which this seed did not create.`,
      );
    }

    const collidingClient = await prisma.clientProfile.findUnique({
      where: { phone: clientPhone },
      select: { id: true },
    });
    if (collidingClient && !isSeedId(collidingClient.id)) {
      collisions.push(
        `ClientProfile.phone ${clientPhone} already belongs to profile ${collidingClient.id}, which this seed did not create.`,
      );
    }

    // Deterministic ids collide only if somebody else minted an id in this
    // namespace, which would mean the namespace is no longer ours. Checked
    // anyway, because the cost is one query and the failure it guards against
    // is writing over a stranger's order.
    const orderIds = [
      ...ACTIVE_ORDERS.map((order) => seedId("order", order.key)),
      ...FINISHED_ORDERS.map((order) => seedId("order", order.key)),
    ];
    const existingOrders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, clientId: true, client: { select: { email: true } } },
    });
    for (const order of existingOrders) {
      if (!isSeedEmail(order.client.email)) {
        collisions.push(
          `Order ${order.id} exists but was placed by ${order.clientId}, which is not a seed client.`,
        );
      }
    }

    if (collisions.length > 0) {
      throw new SeedError(
        "Refusing to run: the seed's namespace collides with rows it did not " +
          "create, and this script never writes to a row it does not own.\n\n" +
          collisions.map((line) => `  - ${line}`).join("\n") +
          "\n\nResolve those rows by hand, or change SEED_PREFIX and the plate " +
          "and phone constants in this file, then re-run.",
      );
    }

    const alreadyPresent = existingUsers.length;
    const toCreate = seedEmails.length - alreadyPresent;

    write([
      "Plan",
      "----",
      `  Accounts:            ${toCreate} to create, ${alreadyPresent} already present (reused, not recreated)`,
      `  Driver profiles:     ${DRIVERS.length} (1 independent, ${DRIVERS.length - 1} on the fleet roster)`,
      `  Logistics company:   1 (activated), with a ${DRIVERS.length - 1}-driver roster`,
      `  Vehicles:            ${VEHICLES.length} (1 driver-owned, ${VEHICLES.length - 1} company-owned)`,
      `  Live assignments:    ${VEHICLES.filter((v) => v.assignedTo !== null).length}`,
      `  Orders in flight:    ${ACTIVE_ORDERS.length}`,
      `  Orders finished:     ${FINISHED_ORDERS.length}, dated into the current Tbilisi week`,
      "",
      "  Every row is namespaced: users under " +
        `@${SEED_EMAIL_DOMAIN}, every other row's id under "${SEED_PREFIX}-", plates under "${SEED_PLATE_PREFIX}".`,
      "",
    ]);

    if (dryRun) {
      write([
        "Dry run complete. Nothing was written — the run returned before the",
        "first write, having only read the taxonomy, the seed's own accounts and",
        "the natural keys it would otherwise collide on.",
        "",
        "Re-run without --dry-run to create the fixture.",
        "",
      ]);
      return;
    }

    // ---------------------------------------------------------------------
    // Write phase. Every statement below is an `upsert` on an id this script
    // minted, or a `create` for a user in the seed's own email domain.
    // ---------------------------------------------------------------------

    /**
     * Find or create one seed account.
     *
     * The account goes through Better Auth's own sign-up logic rather than a
     * raw Prisma insert, so the password is hashed with the same algorithm the
     * sign-in path verifies against — a hand-rolled `Account` row would not
     * actually let anyone log in. No request or headers are forwarded, which is
     * also what makes the call trusted: the sign-up hook in `@/lib/auth` bails
     * out of its host-audience checks when `ctx.request` is absent, so a DRIVER
     * or COMPANY account can be minted here even though the merchant/client
     * host split would reject the same role over HTTP from the wrong host.
     *
     * An account left over from a previous run is reused rather than recreated.
     * Its password therefore stays whatever that run set, which is why the
     * summary says so rather than promising the printed one.
     */
    async function ensureUser(
      email: string,
      name: string,
      role: "CLIENT" | "DRIVER" | "COMPANY",
    ): Promise<{ id: string; created: boolean }> {
      const existing = existingUserByEmail.get(email);

      if (existing) {
        // Ours by construction (the address is in the seed domain), so bringing
        // it back to a signable-in state is a write to our own row. Both flags
        // are lockouts that would make the fixture unusable without explaining
        // why: `isSuspended` refuses the session outright in
        // `databaseHooks.session.create.before`, and `mustChangePassword` sends
        // every hub URL to /change-password before any persona branching runs.
        if (
          existing.isSuspended ||
          existing.mustChangePassword ||
          existing.role !== role
        ) {
          await prisma.user.update({
            where: { id: existing.id },
            data: { isSuspended: false, mustChangePassword: false, role },
          });
        }

        return { id: existing.id, created: false };
      }

      try {
        const result = await auth.api.signUpEmail({
          body: { email, name, password, role },
        });

        return { id: result.user.id, created: true };
      } catch (error) {
        // Better Auth rejects with its own message for cases not pre-checked
        // above (a password policy, a race on the email uniqueness check);
        // surfacing it verbatim is more useful than a generic failure. Anything
        // that is not an `APIError` is a genuine fault and is rethrown with its
        // stack intact.
        if (error instanceof APIError) {
          throw new SeedError(
            `Better Auth rejected the sign-up for ${email}: ${error.message}`,
          );
        }

        throw error;
      }
    }

    const clientEmail = seedEmail("client");
    const fleetEmail = seedEmail("fleet");

    const clientUser = await ensureUser(
      clientEmail,
      "Persona Seed Trading LLC",
      "CLIENT",
    );

    // The client that placed every seeded order. It exists so the orders have a
    // `clientId` of our own rather than a real customer's — and, because
    // `Order.clientId` cascades, so that deleting this one user takes the whole
    // order fixture with it.
    await prisma.clientProfile.upsert({
      where: { id: seedId("client-profile", "main") },
      create: {
        id: seedId("client-profile", "main"),
        userId: clientUser.id,
        accountType: "BUSINESS",
        companyName: "Persona Seed Trading LLC",
        vatId: "GE000000001",
        phone: clientPhone,
      },
      update: { companyName: "Persona Seed Trading LLC", phone: clientPhone },
    });

    const fleetUser = await ensureUser(
      fleetEmail,
      "Persona Seed Freight LLC",
      "COMPANY",
    );

    // `activatedAt` is what makes this a fleet that may be offered work. Left
    // null, `/dashboard` would divert the BUSINESS persona into the fleet
    // onboarding wizard and the Load Board would return an empty 200 — a
    // fixture that looks broken rather than one that refuses.
    const fleetCompanyId = seedId("company", "main");
    const fleetName = "Persona Seed Freight LLC";
    const fleetCompanyData = {
      companyName: fleetName,
      vatId: "GE000000002",
      phone: fleetPhone,
      city: "TBILISI" as GeorgianCity,
      registeredAddress: "5 Aghmashenebeli Ave, Tbilisi",
      // Backs the account screen's payout panel, which shows a real IBAN
      // suffix for a company and sampled data for a driver.
      bankAccountIban: "GE29NB0000000101904917",
      contactName: "Ana Persona",
      contactRole: "Dispatch lead",
      contactEmail: fleetEmail,
      citiesOfOperation: ["TBILISI"] as GeorgianCity[],
      activatedAt: now,
    };

    await prisma.logisticsCompany.upsert({
      where: { id: fleetCompanyId },
      create: { id: fleetCompanyId, userId: fleetUser.id, ...fleetCompanyData },
      update: fleetCompanyData,
    });

    /** Resolved ids for each seeded driver, keyed the way the plans reference them. */
    const driverUserIds = new Map<SeedDriverKey, string>();
    const driverProfileIds = new Map<SeedDriverKey, string>();
    const createdAccounts: { email: string; created: boolean; role: string }[] =
      [
        { email: clientEmail, created: clientUser.created, role: "CLIENT" },
        { email: fleetEmail, created: fleetUser.created, role: "COMPANY" },
      ];

    for (const driver of DRIVERS) {
      const email = seedEmail(driver.emailLocalPart);
      const name = `${driver.firstName} ${driver.lastName}`;
      const user = await ensureUser(email, name, "DRIVER");

      driverUserIds.set(driver.key, user.id);
      createdAccounts.push({ email, created: user.created, role: "DRIVER" });

      const profileId = seedId("driver-profile", driver.key);
      driverProfileIds.set(driver.key, profileId);

      // `companyId` is the entire difference between the INDEPENDENT and ROSTER
      // personas — `resolveHubAccount()` derives the persona from this column
      // and nothing else — so it is written on both halves of the upsert rather
      // than only at create, and a re-run after moving a driver on or off the
      // roster actually moves them.
      const profileData = {
        companyId: driver.onRoster ? fleetCompanyId : null,
        // Both kinds of driver here are individuals working a fleet's or their
        // own vehicle, never a separately registered business — the same value
        // `POST /api/logistics-company/drivers/register` writes.
        accountType: "INDIVIDUAL" as const,
        city: "TBILISI" as GeorgianCity,
        firstName: driver.firstName,
        lastName: driver.lastName,
        companyName: null,
        vatId: null,
        phone: driver.phone,
        isOnline: true,
        // Without this the driver cannot go online, cannot be offered work, and
        // an independent one is diverted into the onboarding wizard by
        // `/dashboard` before reaching a single hub screen.
        activatedAt: now,
        currentLat: 41.7151,
        currentLng: 44.8271,
      };

      await prisma.driverProfile.upsert({
        where: { id: profileId },
        create: { id: profileId, userId: user.id, ...profileData },
        update: profileData,
      });

      // Written for fidelity to the roster driver the registration route
      // actually produces — that route creates the licence in the same
      // transaction as the profile, because a roster driver without one is a
      // roster entry no classed vehicle can be assigned to. No hub screen reads
      // it; the point is that the fixture is not a hub-shaped approximation of
      // a roster driver but the real thing.
      const licenceId = seedId("licence", driver.key);
      const licenceData = {
        licenceNumber: `PS${driver.key.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
        expiresAt: new Date(now.getTime() + 365 * 24 * MS_PER_HOUR),
        categories: driver.licenceCategories,
      };

      await prisma.driverLicence.upsert({
        where: { id: licenceId },
        create: { id: licenceId, driverProfileId: profileId, ...licenceData },
        update: licenceData,
      });
    }

    /** Resolved vehicle ids, so the orders below can name the truck that ran them. */
    const vehicleIds = new Map<string, string>();

    for (const vehicle of VEHICLES) {
      const vehicleId = seedId("vehicle", vehicle.key);
      vehicleIds.set(vehicle.key, vehicleId);

      const independentProfileId = driverProfileIds.get("independent");
      if (independentProfileId === undefined) {
        throw new SeedError(
          "The independent driver's profile was not created — this is a bug in the seed.",
        );
      }

      // Exactly one of `driverProfileId`/`companyId` may be set — the
      // `vehicle_single_owner_check` CHECK constraint in the migration SQL
      // enforces it, so the two branches write one and null the other rather
      // than leaving the untouched column to chance on a re-run.
      const ownership =
        vehicle.owner === "INDEPENDENT"
          ? { driverProfileId: independentProfileId, companyId: null }
          : { driverProfileId: null, companyId: fleetCompanyId };

      const specId = specIdByCode.get(vehicle.specCode);
      if (specId === undefined) {
        throw new SeedError(
          `VehicleTypeSpec ${vehicle.specCode} vanished between the check above and here.`,
        );
      }

      const vehicleData = {
        ...ownership,
        vehicleTypeSpecId: specId,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        colour: vehicle.colour,
        chassisType: vehicle.chassisType,
        vehicleClass: vehicle.vehicleClass,
      };

      await prisma.vehicle.upsert({
        where: { id: vehicleId },
        create: {
          id: vehicleId,
          plateNumber: vehicle.plateNumber,
          ...vehicleData,
        },
        update: vehicleData,
      });

      if (vehicle.assignedTo === null) {
        continue;
      }

      const assigneeProfileId = driverProfileIds.get(vehicle.assignedTo);
      if (assigneeProfileId === undefined) {
        throw new SeedError(
          `Vehicle ${vehicle.plateNumber} is assigned to ${vehicle.assignedTo}, which the seed did not create.`,
        );
      }

      // The open assignment — `unassignedAt: null` — is the whole ROSTER shape:
      // it is the only path from an employed driver to a vehicle, and the
      // relation `resolveHubAccount()` falls back to when the driver owns none.
      // At most one live row per vehicle and per driver is enforced by two
      // partial unique indexes, which this fixture satisfies by construction.
      const assignmentId = seedId("assignment", vehicle.key);
      await prisma.driverVehicleAssignment.upsert({
        where: { id: assignmentId },
        create: {
          id: assignmentId,
          driverProfileId: assigneeProfileId,
          vehicleId,
          assignedAt: now,
          unassignedAt: null,
        },
        update: {
          driverProfileId: assigneeProfileId,
          vehicleId,
          unassignedAt: null,
        },
      });
    }

    /** The vehicle a given driver runs, for stamping onto their orders. */
    const vehicleKeyByDriver = new Map<SeedDriverKey, string>();
    for (const vehicle of VEHICLES) {
      if (vehicle.assignedTo !== null) {
        vehicleKeyByDriver.set(vehicle.assignedTo, vehicle.key);
      }
    }
    vehicleKeyByDriver.set("independent", "independent-van");

    /**
     * The columns every seeded order shares. Split out so the two order tables
     * below differ only in the things that actually distinguish them.
     */
    function baseOrderData(
      index: number,
      cargoCategory: CargoCategory,
      distanceKm: number,
      specId: string,
    ) {
      const route = routeFor(index);

      return {
        cargoCategory,
        pickupAddress: route.pickup,
        dropoffAddress: route.dropoff,
        pickupCity: "TBILISI" as GeorgianCity,
        dropoffCity: "TBILISI" as GeorgianCity,
        pickupContactName: "Persona Seed warehouse",
        pickupContactPhone: "+995599900900",
        dropoffContactName: "Persona Seed store",
        dropoffContactPhone: "+995599900901",
        distanceKm,
        helperCount: 0,
        helperFee: 0,
        vehicleTypeSpecId: specId,
        clientId: clientUser.id,
        bodyType: "DRY_BOX" as ChassisType,
        packagingDescription: "Shrink-wrapped pallets",
        itemQuantity: "4 pallets",
      };
    }

    /** Resolve the driver's user id and vehicle for an order plan. */
    function assignmentFor(driver: SeedDriverKey | null): {
      driverId: string | null;
      vehicleId: string | null;
      specCode: string;
    } {
      if (driver === null) {
        // A company order claimed but never dispatched to a person. The vehicle
        // is null for the same reason the driver is: nothing has been picked
        // yet. The spec still has to name something, so it names the class the
        // fleet would most likely send.
        return { driverId: null, vehicleId: null, specCode: "BOX_TRUCK" };
      }

      const driverId = driverUserIds.get(driver);
      const vehicleKey = vehicleKeyByDriver.get(driver);
      const plan = VEHICLES.find((vehicle) => vehicle.key === vehicleKey);

      if (
        driverId === undefined ||
        vehicleKey === undefined ||
        plan === undefined
      ) {
        throw new SeedError(
          `Order references driver ${driver}, which has no seeded vehicle — this is a bug in the seed.`,
        );
      }

      return {
        driverId,
        vehicleId: vehicleIds.get(vehicleKey) ?? null,
        specCode: plan.specCode,
      };
    }

    let orderIndex = 0;
    const activeSummaries: string[] = [];

    for (const plan of ACTIVE_ORDERS) {
      const { driverId, vehicleId, specCode } = assignmentFor(plan.driver);
      const specId = specIdByCode.get(specCode);
      if (specId === undefined) {
        throw new SeedError(`VehicleTypeSpec ${specCode} is not seeded.`);
      }

      const adjustment = serviceLevelAdjustment(plan.serviceLevel, plan.price);
      const money = moneyFor(plan.price, adjustment, 0);
      const createdAt = new Date(
        now.getTime() - plan.bookedMinutesAgo * MS_PER_MINUTE,
      );

      const orderData = {
        ...baseOrderData(
          orderIndex,
          plan.cargoCategory,
          plan.distanceKm,
          specId,
        ),
        ...money,
        status: plan.status,
        price: plan.price,
        serviceLevel: plan.serviceLevel,
        serviceLevelAdjustment: adjustment,
        driverId,
        vehicleId,
        companyId: plan.scope === "FLEET" ? fleetCompanyId : null,
        createdAt,
        inTransitAt: plan.status === "IN_TRANSIT" ? createdAt : null,
        completedAt: null,
        deliveryDeadline:
          plan.deadlineMinutesFromNow === null
            ? null
            : new Date(
                now.getTime() + plan.deadlineMinutesFromNow * MS_PER_MINUTE,
              ),
        scheduledAt:
          plan.scheduledDaysFromNow === null
            ? null
            : new Date(now.getTime() + plan.scheduledDaysFromNow * MS_PER_DAY),
        pickupWindowStart: createdAt,
        pickupWindowEnd: new Date(createdAt.getTime() + 3 * MS_PER_HOUR),
        description: `${SEED_PREFIX} — ${plan.proves}`,
      };

      const order = await prisma.order.upsert({
        where: { id: seedId("order", plan.key) },
        create: { id: seedId("order", plan.key), ...orderData },
        update: orderData,
        select: { reference: true },
      });

      activeSummaries.push(
        `  ${order.reference.padEnd(12)} ${plan.status.padEnd(11)} ${(plan.driver ?? "unassigned").padEnd(15)} ${plan.proves}`,
      );
      orderIndex += 1;
    }

    let finishedIndex = 0;
    for (const plan of FINISHED_ORDERS) {
      const { driverId, vehicleId, specCode } = assignmentFor(plan.driver);
      const specId = specIdByCode.get(specCode);
      if (specId === undefined) {
        throw new SeedError(`VehicleTypeSpec ${specCode} is not seeded.`);
      }

      const adjustment = serviceLevelAdjustment(plan.serviceLevel, plan.price);
      const isCompleted = plan.status === "COMPLETED";
      const money = moneyFor(
        plan.price,
        adjustment,
        isCompleted ? plan.overtimeFee : 0,
      );
      const { createdAt, completedAt } = finishedTimestamps(finishedIndex, now);

      const orderData = {
        ...baseOrderData(
          orderIndex,
          plan.cargoCategory,
          plan.distanceKm,
          specId,
        ),
        ...money,
        status: plan.status,
        price: plan.price,
        serviceLevel: plan.serviceLevel,
        serviceLevelAdjustment: adjustment,
        // A cancelled order never ran, so it carries no overtime, no completion
        // instant and no overtime payout — only a `createdAt` inside the week,
        // which is what the completion and cancellation rates count it by.
        overtimeFee: isCompleted ? plan.overtimeFee : 0,
        driverId,
        vehicleId,
        companyId: plan.scope === "FLEET" ? fleetCompanyId : null,
        createdAt,
        inTransitAt: isCompleted
          ? new Date(createdAt.getTime() + MS_PER_HOUR)
          : null,
        completedAt: isCompleted ? completedAt : null,
        waitingMinutes: isCompleted && plan.overtimeFee > 0 ? 45 : null,
        deliveryDeadline: null,
        description: `${SEED_PREFIX} — ${plan.proves}`,
      };

      await prisma.order.upsert({
        where: { id: seedId("order", plan.key) },
        create: { id: seedId("order", plan.key), ...orderData },
        update: orderData,
      });

      orderIndex += 1;
      finishedIndex += 1;
    }

    // ---------------------------------------------------------------------
    // Summary. Everything a human needs to drive the fixture by hand.
    // ---------------------------------------------------------------------

    // `/dashboard` is served from the merchant host while the split is enabled
    // (`MERCHANT_ONLY_PREFIXES` in `src/middleware.ts`), and the session cookie
    // is host-scoped because `crossSubDomainCookies` is deliberately off — so a
    // URL on the wrong host would redirect for a page load and silently fail
    // for a curl. `merchantOrigin()` is null while the split is disabled, in
    // which case the hub is served from the main host.
    const origin = host.merchantOrigin() ?? host.clientOrigin();

    const reusedAccounts = createdAccounts.filter(
      (account) => !account.created,
    );

    write([
      "Created",
      "-------",
      `  Fleet:     ${fleetName} (activated, ${DRIVERS.length - 1} drivers on the roster, ${VEHICLES.length - 1} vehicles)`,
      `  Orders in flight (fleet pill must read ${ACTIVE_ORDERS.filter((o) => o.scope === "FLEET").length} while listing 3):`,
      ...activeSummaries,
      "",
      "Sign in",
      "-------",
      `  All accounts share the password:  ${password}`,
      "  Sign in from the Driver card. A logistics company has no card of its",
      "  own — pick Driver, then account type Business.",
      "",
      `  INDEPENDENT  ${seedEmail("independent.driver")}`,
      `  ROSTER       ${seedEmail("roster.driver")}`,
      `  BUSINESS     ${fleetEmail}`,
      "",
      "  Every account, same password. The three above are the ones the feature",
      "  is about; the rest exist so the fleet's tables have more than one row:",
      ...DRIVERS.map(
        (driver) => `    ${seedEmail(driver.emailLocalPart)} — ${driver.role}`,
      ),
      `    ${clientEmail} — CLIENT, placed every seeded order (deleting it deletes them)`,
      "",
      ...(reusedAccounts.length > 0
        ? [
            `  NOTE: ${reusedAccounts.length} account(s) already existed and were reused, not recreated:`,
            ...reusedAccounts.map((account) => `    ${account.email}`),
            "  Their password is whatever the run that created them set, which may",
            `  not be the one printed above. Delete them and re-run to reset it.`,
            "",
          ]
        : []),
      "Check these",
      "-----------",
      `  Start at  ${origin}/sign-in  and then  ${origin}/dashboard  (expect a redirect to /dashboard/loads).`,
      "",
      "  INDEPENDENT",
      `    ${origin}/dashboard/loads          the open board`,
      `    ${origin}/dashboard/jobs`,
      `    ${origin}/dashboard/performance    their own week: earnings, bars across the week, rate under 100%`,
      `    ${origin}/dashboard/vehicles       one owned van, Add-vehicle button present`,
      `    ${origin}/dashboard/account?section=payout   payout panel renders, 5 rail rows`,
      '    expect: 4 sidebar links, chip reads "Independent", online toggle present',
      "",
      "  ROSTER  — the persona this whole feature turns on",
      `    ${origin}/dashboard/loads          the same open board an independent driver gets`,
      `    ${origin}/dashboard/jobs`,
      `    ${origin}/dashboard/performance    their own week; nothing here is withheld from them any more`,
      `    ${origin}/dashboard/vehicles       the company van reached through their assignment, NO Add-vehicle button`,
      '    expect: 4 sidebar links, chip reads "Company driver"',
      "",
      "    MUST REFUSE (both are silent redirects or a JSON 403 — there is no error page,",
      "    so check the URL bar and the status code, not for a message on screen):",
      `      1. ${origin}/dashboard/account?section=payout`,
      "         -> 307 to /dashboard/account with the query string stripped; the Profile",
      '            panel renders and the rail shows 4 rows, without "Payout & bank details".',
      "      2. POST /api/driver-profile/vehicles",
      '         -> 403 "Drivers who belong to a company drive their employer\'s vehicles..."',
      "            The body must be a COMPLETE multipart form or an earlier 400 fires instead",
      "            and the guard is never reached:",
      "",
      `              JAR=/tmp/${SEED_PREFIX}-roster.cookies`,
      `              curl -s -c "$JAR" -X POST "${origin}/api/auth/sign-in/email" \\`,
      "                -H 'Content-Type: application/json' \\",
      `                -d '{"email":"${seedEmail("roster.driver")}","password":"${password}"}'`,
      "              printf '\\x89PNG\\r\\n\\x1a\\n' > /tmp/vehicle.png",
      `              curl -i -b "$JAR" -X POST "${origin}/api/driver-profile/vehicles" \\`,
      "                -F 'plateNumber=AA123BB' -F 'make=Ford' -F 'model=Transit' \\",
      "                -F 'year=2021' -F 'vehicleTypeCode=CARGO_VAN' \\",
      "                -F 'photos=@/tmp/vehicle.png;type=image/png'",
      "",
      "    Expected NOT to refuse: the board and the wallet are both open to an employed",
      "    driver now. They claim from /dashboard/loads like anyone else, and the earnings",
      "    that used to live behind a withheld Wallet link are part of /dashboard/performance.",
      "",
      "  BUSINESS",
      `    ${origin}/dashboard/performance    fleet card — look for the "Not assigned to a driver" row,`,
      "                                        which two completed driverless orders exist to produce;",
      "                                        for unattributedFinishedJobCount > 0; and for the idle",
      "                                        roster driver the performance rollup lists and the",
      "                                        earnings one does not",
      `    ${origin}/dashboard/drivers        ${DRIVERS.length - 1} roster drivers`,
      `    ${origin}/dashboard/employees`,
      `    ${origin}/dashboard/vehicles       ${VEHICLES.length - 1} company vehicles, one of them unassigned`,
      `    ${origin}/dashboard/loads`,
      `    ${origin}/dashboard/account?section=payout   real IBAN last-4, read-only company card`,
      '    expect: 6 sidebar links, chip reads "Business", NO online toggle',
      "",
      "Removing all of it",
      "------------------",
      "  Every row cascades from a seed user, so one statement removes the fixture:",
      "",
      `    DELETE FROM "user" WHERE email LIKE '%@${SEED_EMAIL_DOMAIN}';`,
      "",
      "  To see what that would take first:",
      "",
      `    SELECT id, email, role FROM "user" WHERE email LIKE '%@${SEED_EMAIL_DOMAIN}';`,
      "",
      "  Nothing outside that namespace was created, updated or deleted.",
      "",
    ]);
  } finally {
    // Always release the pool, including on the failure paths above — a bare
    // `tsx` process has no Next.js runtime to tear it down and would otherwise
    // hang on an open connection.
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof SeedError) {
    console.error(`\n${error.message}\n`);
  } else {
    console.error("\nSeeding the driver hub personas failed:", error);
  }

  process.exitCode = 1;
});
