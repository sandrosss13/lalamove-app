/**
 * The database-bound half of the client's order-details document: who may
 * read it, the start-of-trip snapshot, and the one read model every consumer
 * (the order page, the PDF) renders. The view type and the VAT arithmetic are
 * in `src/lib/orders/service-document.ts`.
 *
 * **Access.** The client who booked the order, and nobody else — and only a
 * BUSINESS client, only once the order is paid. `resolveServiceDocumentAccess`
 * is the single gate:
 *
 * - not the owner (the assigned driver, the carrier company, any other
 *   account) → `NOT_FOUND`, the same answer as an order that does not exist;
 * - the owner, but not a BUSINESS account → `NOT_BUSINESS`;
 * - the owner, but the order is still `INITIATED` (unpaid) or `CANCELLED` →
 *   `NOT_AVAILABLE`: there is no service to document.
 *
 * Nothing in this file is ever selected into a carrier, driver or load-board
 * payload, and `tests/carrier-payload-redaction.spec.ts` pins the shared
 * selects against the `serviceSnapshot` relation.
 *
 * **Snapshot.** `POST /api/orders/[id]/start` calls `snapshotOrderService` in
 * the transaction that flips the order to `IN_TRANSIT`, freezing the service
 * provider, driver and vehicle. Before that the view reads the live values and
 * is `preliminary`. The client's own block is read live (it is their own
 * profile), and the seller is zomo, read from the environment at request time
 * so a deploy can set it without a code change.
 */

// Reads and writes the database through Prisma, so it can never be part of a
// browser bundle. Fails the build loudly if a client component imports it.
import "server-only";

import {
  ClientAccountType,
  DriverAccountType,
  OrderStatus,
  ServiceProviderKind,
  type Prisma,
} from "@prisma/client";

import { adminOrderTotalGel } from "@/lib/admin/orders-filters";
import {
  computeServiceAmounts,
  driverFullName,
  type ServiceDocumentParty,
  type ServiceDocumentView,
} from "@/lib/orders/service-document";
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

/** Whether an order in `status` has an order-details document at all. */
export function isServiceDocumentAvailable(status: OrderStatus): boolean {
  return !UNAVAILABLE_STATUSES.includes(status);
}

export type ServiceDocumentAccess =
  | { kind: "OK"; orderId: string }
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_BUSINESS" }
  | { kind: "NOT_AVAILABLE" };

/**
 * May `userId` read the order-details document of `orderId`?
 *
 * Scoped by `clientId` in the query itself, so "somebody else's order" and "no
 * such order" are the same `NOT_FOUND` — there is deliberately no branch for
 * the assigned driver or the carrier company.
 */
export async function resolveServiceDocumentAccess(
  orderId: string,
  userId: string,
): Promise<ServiceDocumentAccess> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, clientId: userId },
    select: {
      id: true,
      status: true,
      client: { select: { clientProfile: { select: { accountType: true } } } },
    },
  });

  if (!order) {
    return { kind: "NOT_FOUND" };
  }
  if (order.client?.clientProfile?.accountType !== ClientAccountType.BUSINESS) {
    return { kind: "NOT_BUSINESS" };
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

/**
 * zomo's legal entity, the document's SELLER, from `ZOMO_LEGAL_NAME`,
 * `ZOMO_TAX_ID` and `ZOMO_LEGAL_ADDRESS` (see `env.example`). Read on every
 * call rather than at module load, so a restart with new values is enough.
 * Unset values print as a blank line.
 */
export function readZomoSeller(): ServiceDocumentParty {
  return {
    name: clean(process.env.ZOMO_LEGAL_NAME),
    taxId: clean(process.env.ZOMO_TAX_ID),
    address: clean(process.env.ZOMO_LEGAL_ADDRESS),
  };
}

/** The live provider / driver / vehicle columns, shared by the snapshot and
 *  the pre-snapshot view. */
const LIVE_SERVICE_SELECT = {
  company: {
    select: { companyName: true, vatId: true, registeredAddress: true },
  },
  driver: {
    select: {
      driverProfile: {
        select: {
          accountType: true,
          firstName: true,
          lastName: true,
          companyName: true,
          vatId: true,
          idNumber: true,
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
 */
function liveServiceColumns(order: LiveService): ServiceColumns | null {
  const profile = order.driver?.driverProfile ?? null;
  const driverName = driverFullName({
    firstName: profile?.firstName ?? null,
    lastName: profile?.lastName ?? null,
  });

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

/**
 * The document as printed, for an order the caller already passed
 * `resolveServiceDocumentAccess` for. Snapshot values once the trip started;
 * live values (and `preliminary: true`) before. `null` only if the order
 * vanished in between.
 *
 * The amount is `adminOrderTotalGel` — the quoted price, the service tier's
 * adjustment and any overtime settled at completion: everything the client is
 * charged for the order — split into net / VAT by `computeServiceAmounts`.
 */
export async function buildServiceDocumentView(
  orderId: string,
): Promise<ServiceDocumentView | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      reference: true,
      status: true,
      pickupAddress: true,
      dropoffAddress: true,
      cargoCategory: true,
      description: true,
      price: true,
      serviceLevelAdjustment: true,
      overtimeFee: true,
      completedAt: true,
      inTransitAt: true,
      scheduledAt: true,
      createdAt: true,
      client: {
        select: {
          clientProfile: {
            select: { companyName: true, vatId: true, legalAddress: true },
          },
        },
      },
      ...LIVE_SERVICE_SELECT,
      serviceSnapshot: {
        select: {
          providerKind: true,
          providerName: true,
          providerTaxId: true,
          providerAddress: true,
          driverFirstName: true,
          driverLastName: true,
          driverPersonalId: true,
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

  // Snapshot first; the live value only while nothing is frozen yet. A frozen
  // `null` stays `null` — the document records what was true at the start.
  const service = order.serviceSnapshot ?? liveServiceColumns(order);
  // Business-only document, so always an account order; `?? null` only
  // satisfies the nullable relation a guest order introduced.
  const profile = order.client?.clientProfile ?? null;
  const documentDate =
    order.completedAt ??
    order.inTransitAt ??
    order.scheduledAt ??
    order.createdAt;

  return {
    reference: order.reference,
    documentDate: documentDate.toISOString(),
    // Preliminary only while the trip has not started. An order started
    // before snapshots existed has none, but its trip is a fact, not a draft.
    preliminary:
      order.serviceSnapshot === null &&
      !TRIP_STARTED_STATUSES.includes(order.status),
    client: {
      name: clean(profile?.companyName),
      taxId: clean(profile?.vatId),
      address: clean(profile?.legalAddress),
    },
    seller: readZomoSeller(),
    provider: service
      ? {
          kind: service.providerKind,
          name: service.providerName ?? null,
          taxId: service.providerTaxId ?? null,
          address: service.providerAddress ?? null,
        }
      : null,
    driver: {
      firstName: service?.driverFirstName ?? null,
      lastName: service?.driverLastName ?? null,
      personalId: service?.driverPersonalId ?? null,
    },
    vehicle: {
      make: service?.vehicleMake ?? null,
      model: service?.vehicleModel ?? null,
      plate: service?.vehiclePlate ?? null,
      trailerPlate: service?.trailerPlate ?? null,
    },
    route: {
      pickupAddress: order.pickupAddress,
      dropoffAddress: order.dropoffAddress,
    },
    cargo: {
      category: order.cargoCategory,
      description: clean(order.description),
    },
    amounts: computeServiceAmounts(adminOrderTotalGel(order)),
  };
}
