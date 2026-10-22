/**
 * The database-bound half of the order-details document: who may read it, the
 * start-of-trip snapshot, the document number, and the one read model every
 * consumer (the order pages, the PDF) renders. The view type and the money
 * arithmetic are in `src/lib/orders/service-document.ts`.
 *
 * **Access.** `resolveServiceDocumentAccess` is the single gate. It lets in:
 *
 * - **staff** — an `ADMIN` session with an active `SystemUserProfile` whose
 *   role may open the back office's Orders section
 *   (`adminNavSection("orders").adminRoles`, the same rule
 *   `src/app/[locale]/admin/orders/layout.tsx` applies): any order;
 * - **the order's own client** — `clientId` is the session's user, BUSINESS
 *   and INDIVIDUAL accounts alike;
 * - **the guest who booked** — a guest order (`clientId: null`) whose token
 *   the request carries, as the booking browser's cookie or the private
 *   tracking link's `?token=` (`src/lib/orders/guest-access.ts`).
 *
 * Everyone else — the assigned driver, the carrier company, any other account
 * — gets `NOT_FOUND`, the same answer as an order that does not exist. An
 * order still `INITIATED` (unpaid) or `CANCELLED` is `NOT_AVAILABLE` to all of
 * them: there is no service to document.
 *
 * Nothing in this file is ever selected into a carrier, driver or load-board
 * payload, and `tests/carrier-payload-redaction.spec.ts` pins the shared
 * selects against the `serviceSnapshot` relation.
 *
 * **Snapshot.** `POST /api/orders/[id]/start` calls `snapshotOrderService` in
 * the transaction that flips the order to `IN_TRANSIT`, freezing the service
 * provider, driver (with their phone) and vehicle. Before that the view reads
 * the live values and is `preliminary`. The customer block is read live: it is
 * the booker's own profile (or the guest's own booking details).
 *
 * **Document number.** `INV-{year}-{seq}`, assigned the first time the view is
 * built for an order (`ensureDocumentNumber`) and never changed after.
 */

// Reads and writes the database through Prisma, so it can never be part of a
// browser bundle. Fails the build loudly if a client component imports it.
import "server-only";

import {
  ClientAccountType,
  DriverAccountType,
  OrderItemKind,
  OrderStatus,
  ServiceProviderKind,
  type Prisma,
} from "@prisma/client";

import { adminNavSection } from "@/components/admin/admin-nav";
import { hasAdminRole } from "@/lib/admin/roles";
import { orderAccessWhere } from "@/lib/orders/guest-access";
import {
  computeDocumentFinance,
  driverFullName,
  formatDocumentNumber,
  roundCurrency,
  type DocumentCargoRow,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";
import { isPhonePlaceholderEmail } from "@/lib/phone-auth";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

/** Statuses with no service to document: not yet paid, or called off. */
const UNAVAILABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.INITIATED,
  OrderStatus.CANCELLED,
];

/** Statuses in which the trip has started (or ended): provider, driver and
 *  vehicle are facts, not a draft, even without a snapshot. */
const TRIP_STARTED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.IN_TRANSIT,
  OrderStatus.COMPLETED,
];

/**
 * The most helpers the document prints at one stop. The booking already
 * refuses more (`PricingConfig.maxHelpers`); clamping here only keeps a stray
 * row from printing a crew the service never offers.
 */
const MAX_DOCUMENT_HELPERS_PER_STOP = 4;

/** Whether an order in `status` has an order-details document at all. */
export function isServiceDocumentAvailable(status: OrderStatus): boolean {
  return !UNAVAILABLE_STATUSES.includes(status);
}

export type ServiceDocumentAccess =
  | { kind: "OK"; orderId: string }
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_AVAILABLE" };

/** Who is asking: the request's session (if any) and the guest token it
 *  carries for this order (cookie or `?token=`, shape-checked; or `null`). */
export type ServiceDocumentRequester = {
  session: { user: { id: string; role?: string | null } } | null;
  guestToken: string | null;
};

/**
 * Whether `session` is staff allowed into the back office's Orders section —
 * the checks `authorizeAdminApi` makes (an `ADMIN` user with an *active*
 * profile, re-read per request so a deactivation takes effect at once), with
 * the Orders section's role list. Spelled out rather than calling
 * `authorizeAdminApi`, which answers with a response, not a boolean, and
 * re-reads the session from `next/headers`.
 */
async function isOrdersStaff(
  session: ServiceDocumentRequester["session"],
): Promise<boolean> {
  if (session?.user.role !== "ADMIN") {
    return false;
  }

  const profile = await prisma.systemUserProfile.findUnique({
    where: { userId: session.user.id },
    select: { adminRole: true, isActive: true },
  });

  return Boolean(
    profile?.isActive &&
    hasAdminRole(profile, adminNavSection("orders").adminRoles),
  );
}

/**
 * May this requester read the order-details document of `orderId`?
 *
 * Staff look the order up by id alone. Everyone else is scoped in the query
 * itself — `clientId` for the session's own account orders, `clientId: null`
 * plus the token hash for a guest order (`orderAccessWhere`) — so "somebody
 * else's order" and "no such order" are the same `NOT_FOUND`, and there is
 * deliberately no branch for the assigned driver or the carrier company.
 *
 * A session and a guest token are both tried when both are present: someone
 * who booked as a guest and signed in afterwards still holds the cookie that
 * proves the booking (as `loadAccessibleOrder` allows on the order pages).
 */
export async function resolveServiceDocumentAccess(
  orderId: string,
  { session, guestToken }: ServiceDocumentRequester,
): Promise<ServiceDocumentAccess> {
  let where: Prisma.OrderWhereInput | null;

  if (await isOrdersStaff(session)) {
    where = { id: orderId };
  } else {
    const candidates: Prisma.OrderWhereInput[] = [];
    if (session) {
      candidates.push(
        orderAccessWhere(orderId, { kind: "client", userId: session.user.id }),
      );
    }
    if (guestToken) {
      candidates.push(
        orderAccessWhere(orderId, { kind: "guest", token: guestToken }),
      );
    }
    where =
      candidates.length === 0
        ? null
        : candidates.length === 1
          ? candidates[0]!
          : { OR: candidates };
  }

  if (!where) {
    return { kind: "NOT_FOUND" };
  }

  const order = await prisma.order.findFirst({
    where,
    select: { id: true, status: true },
  });

  if (!order) {
    return { kind: "NOT_FOUND" };
  }
  if (!isServiceDocumentAvailable(order.status)) {
    return { kind: "NOT_AVAILABLE" };
  }
  return { kind: "OK", orderId: order.id };
}

/** Trimmed text, or `null` for missing / blank. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** "First Last" from two optional parts; `null` when both are blank. */
function joinName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  return driverFullName({ firstName: first ?? null, lastName: last ?? null });
}

/** The live provider / driver / vehicle columns, shared by the snapshot and
 *  the pre-snapshot view. */
const LIVE_SERVICE_SELECT = {
  company: {
    select: { companyName: true, vatId: true, registeredAddress: true },
  },
  driver: {
    select: {
      phoneNumber: true,
      driverProfile: {
        select: {
          accountType: true,
          firstName: true,
          lastName: true,
          companyName: true,
          vatId: true,
          idNumber: true,
          phone: true,
        },
      },
    },
  },
  vehicle: {
    select: {
      make: true,
      model: true,
      plateNumber: true,
      trailerPlateNumber: true,
    },
  },
} satisfies Prisma.OrderSelect;

type LiveService = Prisma.OrderGetPayload<{
  select: typeof LIVE_SERVICE_SELECT;
}>;

/** The snapshot columns, as they would be written right now. */
type ServiceColumns = Omit<
  Prisma.OrderServiceSnapshotUncheckedCreateInput,
  "id" | "orderId" | "lockedAt" | "createdAt"
>;

/**
 * Who is providing the service right now, flattened to the snapshot's
 * columns. `null` while no company and no driver has taken the order.
 *
 * - Dispatched through a carrier company → that company (name, tax ID,
 *   registered address).
 * - Otherwise the driver is independent: a BUSINESS driver account is printed
 *   as its company (falling back to the person); anyone else as the person,
 *   with their personal ID as the identifier and no address.
 *
 * `providerAddress` is still written (the column exists and costs nothing to
 * keep filled), though the v2 document no longer prints it.
 */
function liveServiceColumns(order: LiveService): ServiceColumns | null {
  const profile = order.driver?.driverProfile ?? null;
  const driverName = joinName(profile?.firstName, profile?.lastName);

  let provider: Pick<
    ServiceColumns,
    "providerKind" | "providerName" | "providerTaxId" | "providerAddress"
  >;

  if (order.company) {
    provider = {
      providerKind: ServiceProviderKind.COMPANY,
      providerName: clean(order.company.companyName),
      providerTaxId: clean(order.company.vatId),
      providerAddress: clean(order.company.registeredAddress),
    };
  } else if (profile) {
    const business = profile.accountType === DriverAccountType.BUSINESS;
    provider = {
      providerKind: ServiceProviderKind.DRIVER,
      providerName:
        (business ? clean(profile.companyName) : null) ?? driverName,
      providerTaxId:
        (business ? clean(profile.vatId) : null) ?? clean(profile.idNumber),
      providerAddress: null,
    };
  } else {
    return null;
  }

  return {
    ...provider,
    driverFirstName: clean(profile?.firstName),
    driverLastName: clean(profile?.lastName),
    driverPersonalId: clean(profile?.idNumber),
    driverPhone: clean(profile?.phone) ?? clean(order.driver?.phoneNumber),
    vehicleMake: clean(order.vehicle?.make),
    vehicleModel: clean(order.vehicle?.model),
    vehiclePlate: clean(order.vehicle?.plateNumber),
    trailerPlate: clean(order.vehicle?.trailerPlateNumber),
  };
}

/**
 * Freeze the service provider, driver and vehicle of `orderId` inside the
 * caller's transaction (`POST /api/orders/[id]/start`). Idempotent: a second
 * call overwrites the row with the then-current values and a new `lockedAt`,
 * which only a re-start under the row lock could cause. A no-op for an order
 * with neither a company nor a driver, which cannot be started anyway.
 */
export async function snapshotOrderService(
  tx: Tx,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: LIVE_SERVICE_SELECT,
  });
  const columns = order ? liveServiceColumns(order) : null;
  if (!columns) {
    return;
  }

  const lockedAt = new Date();
  await tx.orderServiceSnapshot.upsert({
    where: { orderId },
    create: { orderId, ...columns, lockedAt },
    update: { ...columns, lockedAt },
  });
}

/** The calendar year it is in Tbilisi right now — the year a document number
 *  assigned now carries (around New Year, UTC is a different year for four
 *  hours). */
function tbilisiYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tbilisi",
      year: "numeric",
    }).format(now),
  );
}

/**
 * The order's document number, assigning one if it has none yet.
 *
 * Race-safe without a lock: the number is drawn from
 * `order_document_number_seq` and written with `documentNumber IS NULL` in the
 * where-clause, so of two first downloads racing each other exactly one write
 * lands; the loser re-reads and returns the winner's number. The loser's drawn
 * value is simply never used — numbers are unique and increasing, not
 * gap-free (no Postgres sequence is: a rolled-back draw is never returned
 * either).
 */
async function ensureDocumentNumber(
  orderId: string,
  current: string | null,
): Promise<string> {
  if (current) {
    return current;
  }

  // `nextval` returns bigint, which Prisma surfaces as a JS `bigint`.
  const [{ value }] = await prisma.$queryRaw<[{ value: bigint }]>`
    SELECT nextval('order_document_number_seq') AS value
  `;
  const candidate = formatDocumentNumber(tbilisiYear(), Number(value));

  const { count } = await prisma.order.updateMany({
    where: { id: orderId, documentNumber: null },
    data: { documentNumber: candidate },
  });
  if (count === 1) {
    return candidate;
  }

  const winner = await prisma.order.findUnique({
    where: { id: orderId },
    select: { documentNumber: true },
  });
  if (!winner?.documentNumber) {
    // Only reachable if the order was deleted in between.
    throw new Error(
      `[service-document] order ${orderId} has no document number`,
    );
  }
  return winner.documentNumber;
}

/** Helpers at one stop, as printed: a whole number in 0..4. */
function clampHelpers(count: number): number {
  return Math.min(
    MAX_DOCUMENT_HELPERS_PER_STOP,
    Math.max(0, Math.trunc(count)),
  );
}

/** Metres → whole centimetres. */
function toCm(metres: number): number {
  return Math.round(metres * 100);
}

/**
 * The document as printed, for an order the caller already passed
 * `resolveServiceDocumentAccess` for. Snapshot values for carrier, driver and
 * vehicle once the trip started; live values (and `preliminary: true`)
 * before. Assigns the document number on first call. `null` only if the
 * order vanished in between.
 *
 * The money is `computeDocumentFinance` over the stored columns: the total is
 * `adminOrderTotalGel` (quoted price, the tier's adjustment and any overtime
 * settled at completion — everything the client is charged), split into
 * transport, services and the POOLING discount so the lines add up to it.
 */
export async function buildServiceDocumentView(
  orderId: string,
): Promise<ServiceDocumentView | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      reference: true,
      documentNumber: true,
      status: true,
      createdAt: true,
      scheduledAt: true,
      pickupWindowStart: true,
      deliveryDeadline: true,
      distanceKm: true,

      pickupAddress: true,
      pickupContactName: true,
      pickupContactPhone: true,
      dropoffAddress: true,
      dropoffContactName: true,
      dropoffContactPhone: true,

      cargoCategory: true,
      description: true,
      cargoWeightKg: true,
      cargoLengthM: true,
      cargoWidthM: true,
      cargoHeightM: true,
      handlingTags: true,
      items: {
        orderBy: { id: "asc" },
        select: {
          kind: true,
          label: true,
          quantity: true,
          unitWeightKg: true,
          lengthM: true,
          widthM: true,
          heightM: true,
        },
      },

      helperCount: true,
      pickupHelpers: true,
      pickupFloor: true,
      pickupCargoElevator: true,
      pickupPassengerElevator: true,
      dropoffHelpers: true,
      dropoffFloor: true,
      dropoffCargoElevator: true,
      dropoffPassengerElevator: true,
      waitingMinutes: true,

      price: true,
      serviceLevelAdjustment: true,
      overtimeFee: true,
      // Pricing model v1: helper overtime is billed exactly like `overtimeFee`.
      helperOvertimeFee: true,
      helperFee: true,
      pickupHelperFee: true,
      dropoffHelperFee: true,
      transportFare: true,
      tariffVersion: true,
      payment: { select: { status: true } },

      vehicleTypeSpec: {
        select: {
          label: true,
          pricingRule: { select: { freeLoadingMinutes: true } },
        },
      },

      clientId: true,
      guestFirstName: true,
      guestLastName: true,
      guestPhone: true,
      guestEmail: true,
      client: {
        select: {
          name: true,
          email: true,
          phoneNumber: true,
          clientProfile: {
            select: {
              accountType: true,
              companyName: true,
              vatId: true,
              firstName: true,
              lastName: true,
              idNumber: true,
              phone: true,
            },
          },
        },
      },

      ...LIVE_SERVICE_SELECT,
      serviceSnapshot: {
        select: {
          providerKind: true,
          providerName: true,
          providerTaxId: true,
          driverFirstName: true,
          driverLastName: true,
          driverPersonalId: true,
          driverPhone: true,
          vehicleMake: true,
          vehicleModel: true,
          vehiclePlate: true,
          trailerPlate: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  const documentNumber = await ensureDocumentNumber(
    orderId,
    order.documentNumber,
  );

  // Snapshot first; the live value only while nothing is frozen yet. A frozen
  // `null` stays `null` — the document records what was true at the start.
  // (A snapshot from before `driverPhone` existed has none: printed as a dash,
  // not back-filled from the driver's phone today.)
  const service = order.serviceSnapshot ?? liveServiceColumns(order);

  // --- Customer -------------------------------------------------------------
  let customer: ServiceDocumentView["customer"];
  if (order.client) {
    const profile = order.client.clientProfile;
    const business = profile?.accountType === ClientAccountType.BUSINESS;
    // Phone-number accounts carry a synthetic address Better Auth needs
    // (`placeholderEmailForPhone`); it reaches nobody, so it is not printed.
    const email = clean(order.client.email);
    customer = {
      type: business ? "BUSINESS" : "INDIVIDUAL",
      name: business
        ? clean(profile?.companyName)
        : (joinName(profile?.firstName, profile?.lastName) ??
          clean(order.client.name)),
      idNumber: business ? clean(profile?.vatId) : clean(profile?.idNumber),
      phone: clean(profile?.phone) ?? clean(order.client.phoneNumber),
      email: email && !isPhonePlaceholderEmail(email) ? email : null,
    };
  } else {
    // A guest booking: the details typed at checkout, and no ID on file.
    customer = {
      type: "INDIVIDUAL",
      name: joinName(order.guestFirstName, order.guestLastName),
      idNumber: null,
      phone: clean(order.guestPhone),
      email: clean(order.guestEmail),
    };
  }

  // --- Cargo ----------------------------------------------------------------
  let cargo: DocumentCargoRow[];
  let totalWeightKg: number | null;
  if (order.items.length > 0) {
    cargo = order.items.map((item) => ({
      description: item.label,
      quantity: item.quantity,
      unit: item.kind === OrderItemKind.PALLET ? "PALLET" : "PIECE",
      weightKg: roundCurrency(item.unitWeightKg * item.quantity),
      dimensionsCm: [toCm(item.lengthM), toCm(item.widthM), toCm(item.heightM)],
    }));
    totalWeightKg = roundCurrency(
      cargo.reduce((sum, row) => sum + (row.weightKg ?? 0), 0),
    );
  } else {
    // An order booked before the itemised list (or without one): its
    // free-text description is the single row, with the order-level weight
    // and dimensions. No description → no rows at all.
    const description = clean(order.description);
    const { cargoLengthM: l, cargoWidthM: w, cargoHeightM: h } = order;
    cargo = description
      ? [
          {
            description,
            quantity: null,
            unit: null,
            weightKg: order.cargoWeightKg,
            dimensionsCm:
              l !== null && w !== null && h !== null
                ? [toCm(l), toCm(w), toCm(h)]
                : null,
          },
        ]
      : [];
    totalWeightKg = order.cargoWeightKg;
  }

  // --- Services -------------------------------------------------------------
  // Pre-v1 orders (`tariffVersion` null) booked one crew size for the whole
  // job; it is printed at pickup. Their per-stop columns are all defaults.
  const legacy = order.tariffVersion === null;
  const pickupHelpers = clampHelpers(
    legacy ? order.helperCount : order.pickupHelpers,
  );
  const deliveryHelpers = legacy ? 0 : clampHelpers(order.dropoffHelpers);

  // Billed waiting time beyond the vehicle type's free allowance — the
  // minutes `completionMoney` charged as `overtimeFee`. The allowance is read
  // from the live rule (it is not stamped onto the order), so the figure is
  // only printed when overtime was in fact billed; otherwise a later retune
  // of the allowance could invent minutes nobody paid for.
  const freeMinutes = order.vehicleTypeSpec.pricingRule?.freeLoadingMinutes;
  const extraMinutes =
    order.overtimeFee > 0 &&
    order.waitingMinutes !== null &&
    freeMinutes !== undefined
      ? Math.max(0, order.waitingMinutes - freeMinutes)
      : 0;

  return {
    reference: order.reference,
    documentNumber,
    createdAt: order.createdAt.toISOString(),
    status: order.status,
    // Preliminary only while the trip has not started. An order started
    // before snapshots existed has none, but its trip is a fact, not a draft.
    preliminary:
      order.serviceSnapshot === null &&
      !TRIP_STARTED_STATUSES.includes(order.status),

    customer,

    carrier: service
      ? {
          kind: service.providerKind,
          name: service.providerName ?? null,
          idOrVat: service.providerTaxId ?? null,
        }
      : null,
    driver: {
      fullName: joinName(service?.driverFirstName, service?.driverLastName),
      personalId: service?.driverPersonalId ?? null,
      phone: service?.driverPhone ?? null,
    },
    vehicle: {
      category: clean(order.vehicleTypeSpec.label),
      make: service?.vehicleMake ?? null,
      model: service?.vehicleModel ?? null,
      plate: service?.vehiclePlate ?? null,
      trailerPlate: service?.trailerPlate ?? null,
    },

    stops: {
      pickup: {
        address: order.pickupAddress,
        contactName: clean(order.pickupContactName),
        contactPhone: clean(order.pickupContactPhone),
      },
      delivery: {
        address: order.dropoffAddress,
        contactName: clean(order.dropoffContactName),
        contactPhone: clean(order.dropoffContactPhone),
      },
    },
    scheduledPickupAt:
      (order.pickupWindowStart ?? order.scheduledAt)?.toISOString() ?? null,
    estimatedDeliveryAt: order.deliveryDeadline?.toISOString() ?? null,
    distanceKm: order.distanceKm,

    cargoCategory: order.cargoCategory,
    cargo,
    totalWeightKg,

    services: {
      pickupHelpers,
      deliveryHelpers,
      pickupFloor: order.pickupFloor,
      deliveryFloor: order.dropoffFloor,
      pickupElevator:
        order.pickupCargoElevator || order.pickupPassengerElevator,
      deliveryElevator:
        order.dropoffCargoElevator || order.dropoffPassengerElevator,
      loadingUnloading: pickupHelpers + deliveryHelpers > 0,
      handlingTags: order.handlingTags,
      extraMinutes,
    },

    finance: computeDocumentFinance({
      price: order.price,
      serviceLevelAdjustment: order.serviceLevelAdjustment,
      overtimeFee: order.overtimeFee,
      helperOvertimeFee: order.helperOvertimeFee,
      helperFee: order.helperFee,
      pickupHelperFee: order.pickupHelperFee,
      dropoffHelperFee: order.dropoffHelperFee,
      transportFare: order.transportFare,
      tariffVersion: order.tariffVersion,
      paymentStatus: order.payment?.status ?? null,
    }),
  };
}
