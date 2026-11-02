/**
 * The order-details document ("Order Details / Invoice", "შეკვეთის დეტალები /
 * ინვოისი"): its read model and its money arithmetic. Pure — no Prisma client,
 * no request — so the PDF renderer, the order pages and
 * `tests/service-document.spec.ts` all share one definition.
 *
 * **What the document is.** One A4 document per order and language, generated
 * from the order record: order information, customer, carrier with driver and
 * vehicle, route, cargo, additional services, and the money (transport +
 * services − discount = total, VAT-inclusive). Design reference:
 * `Invoice PDF/design_handoff_order_details_pdf/`.
 *
 * The database-bound half (who may read it, the start-of-trip snapshot, the
 * view builder) is `src/lib/orders/service-document-server.ts`.
 *
 * Not `server-only`: the spec imports it with no Next runtime, and the order
 * page's client component reads the view type.
 */

import { adminOrderTotalGel } from "@/lib/admin/orders-filters";

/**
 * Georgia's standard VAT rate. Every zomo price is VAT-inclusive at this rate,
 * so the document backs VAT *out* of the amount the client paid rather than
 * adding it on top.
 */
export const SERVICE_VAT_RATE = 0.18;

/**
 * Round to tetri (2 decimals), half away from zero.
 *
 * `Math.round(n * 100) / 100` alone gets `1.005` wrong — `1.005 * 100` is
 * `100.49999999999999` in binary floating point — so the product is first
 * re-read at 15 significant digits, which drops that representation noise
 * without touching any digit a real price can carry.
 */
export function roundCurrency(value: number): number {
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  const rounded = Math.round(scaled) / 100;
  return value < 0 ? -rounded : rounded;
}

/** Net, VAT and gross of the one service line, in GEL. */
export type ServiceAmounts = {
  /** The amount the client paid, VAT included — the grand total. */
  gross: number;
  net: number;
  vat: number;
  /** The rate the split used, e.g. `0.18`. */
  vatRate: number;
};

/**
 * Split a VAT-inclusive amount: gross = the amount, net = gross ÷ (1 + rate),
 * VAT = gross − net. VAT is derived as the difference (not net × rate) so
 * net + VAT always equals the printed gross to the tetri.
 */
export function computeServiceAmounts(
  gross: number,
  vatRate: number = SERVICE_VAT_RATE,
): ServiceAmounts {
  const total = roundCurrency(gross);
  const net = roundCurrency(total / (1 + vatRate));
  return { gross: total, net, vat: roundCurrency(total - net), vatRate };
}

/** An 11-digit Georgian personal number (პირადი ნომერი). */
export function isGeorgianPersonalNumber(value: string): boolean {
  return /^\d{11}$/.test(value);
}

/**
 * Whether the service provider is a carrier company or an independent driver.
 * Mirrors the Prisma `ServiceProviderKind` enum, spelled out so this module
 * never imports the Prisma client.
 */
export type ServiceProviderKindValue = "COMPANY" | "DRIVER";

/** The `common.cargoCategory.*` key of each `CargoCategory`. */
export const CARGO_CATEGORY_LABEL_KEYS = {
  FURNITURE_FURNISHINGS: "furnitureFurnishings",
  APPLIANCES: "appliances",
  RETAIL_STOCK: "retailStock",
  EVENT_EQUIPMENT: "eventEquipment",
  FULL_RELOCATION: "fullRelocation",
  INDUSTRIAL_SUPPLIES: "industrialSupplies",
  CONSTRUCTION_MATERIALS: "constructionMaterials",
} as const;

export type CargoCategoryValue = keyof typeof CARGO_CATEGORY_LABEL_KEYS;

/** Mirrors the Prisma `OrderStatus` enum (no Prisma import here). */
export type OrderStatusValue =
  | "INITIATED"
  | "PENDING"
  | "CLAIMED"
  | "ACCEPTED"
  | "IN_TRANSIT"
  | "COMPLETED"
  | "CANCELLED";

/** Mirrors `CargoHandlingTag`. */
export type HandlingTagValue =
  | "FRAGILE"
  | "COLD_CHAIN"
  | "HAZMAT"
  | "TIME_CRITICAL"
  | "UPRIGHT_ONLY"
  | "HEAVY_ITEM";

/**
 * The document's payment badge. `PENDING` also covers an order with no
 * `Payment` row yet (cash on delivery, bank transfer not yet confirmed).
 */
export type DocumentPaymentStatus = "PAID" | "PENDING" | "FAILED" | "REFUNDED";

/** BUSINESS = a business client account; INDIVIDUAL = an individual account
 *  or a guest booking. */
export type DocumentCustomerType = "BUSINESS" | "INDIVIDUAL";

/** One row of the cargo table (section 05). */
export type DocumentCargoRow = {
  /** As stored (catalogue label, custom item text, or the order's free-text
   *  description for an order with no itemised list). */
  description: string;
  quantity: number | null;
  /** PIECE for catalogue/custom items, PALLET for pallets; `null` when the
   *  order has no itemised list. The renderer translates it. */
  unit: "PIECE" | "PALLET" | null;
  /** Row total (unit weight × quantity), kg. */
  weightKg: number | null;
  /** Per unit, centimetres, [length, width, height]. */
  dimensionsCm: [number, number, number] | null;
};

/**
 * Money on the document (section 07), in GEL. Reconciles by construction:
 * `total = transport + services + discount` (discount is ≤ 0), and `total`
 * is what the client is charged for the order (`adminOrderTotalGel`).
 */
export type DocumentFinance = {
  /** Transport fare, including a PRIORITY surcharge (never the POOLING
   *  discount, which is `discount`). */
  transport: number;
  /** Helpers + vehicle-waiting overtime + helper overtime. */
  services: number;
  servicesBreakdown: {
    helpers: number;
    overtime: number;
  };
  /** ≤ 0. The POOLING service-level discount; 0 when there is none (the
   *  renderer then hides the line). */
  discount: number;
  /** The POOLING discount as a whole percentage of the transport fare, e.g.
   *  10, for the line's note; `null` when there is no discount. */
  discountPercent: number | null;
  total: number;
  /** VAT contained in `total` (prices are VAT-inclusive), for the
   *  "incl. VAT 18%" note under the total. */
  vat: number;
  vatRate: number;
  paymentStatus: DocumentPaymentStatus;
};

/**
 * Everything the order-details PDF prints, already resolved from the order
 * record (`buildServiceDocumentView`). Snapshot values for carrier, driver and
 * vehicle once the trip has started; live values before (`preliminary`).
 * Language-neutral: enums stay enums, user-entered data is as stored, and the
 * renderer translates and formats for the requested locale.
 *
 * Any string field may be `null` (missing); the renderer prints a dash.
 */
export type ServiceDocumentView = {
  /** The order's public reference, e.g. "GE-104857" — the "Order ID". */
  reference: string;
  /** Unique document number, e.g. "INV-2026-0012489". Assigned once per
   *  order on first generation and never changes. */
  documentNumber: string;
  /** ISO instant the order was created. */
  createdAt: string;
  status: OrderStatusValue;
  /** True while the trip has not started (nothing snapshotted): carrier,
   *  driver and vehicle may still change. */
  preliminary: boolean;

  customer: {
    type: DocumentCustomerType;
    /** Company name (BUSINESS) or "First Last" (INDIVIDUAL / guest). */
    name: string | null;
    /** Company identification number (BUSINESS, `vatId`) or personal ID
     *  (INDIVIDUAL, `idNumber`; `null` for a guest). */
    idNumber: string | null;
    phone: string | null;
    email: string | null;
  };

  /** `null` while nobody has taken the order on yet. */
  carrier: {
    kind: ServiceProviderKindValue;
    /** Company name (COMPANY) or the independent carrier's full name. */
    name: string | null;
    /** Company ID / VAT (COMPANY) or personal ID / VAT (DRIVER). */
    idOrVat: string | null;
  } | null;

  driver: {
    fullName: string | null;
    personalId: string | null;
    phone: string | null;
  };

  vehicle: {
    /** The booked vehicle type's label, as stored (`VehicleTypeSpec.label`). */
    category: string | null;
    make: string | null;
    model: string | null;
    plate: string | null;
    trailerPlate: string | null;
  };

  stops: {
    pickup: DocumentStop;
    delivery: DocumentStop;
  };
  /** ISO instants. Pickup = pickupWindowStart ?? scheduledAt; delivery =
   *  deliveryDeadline. */
  scheduledPickupAt: string | null;
  estimatedDeliveryAt: string | null;
  distanceKm: number;

  cargoCategory: CargoCategoryValue;
  cargo: DocumentCargoRow[];
  /** Sum of the rows' `weightKg`, or the order's `cargoWeightKg` when there
   *  is no itemised list; `null` when neither is known. */
  totalWeightKg: number | null;

  services: {
    pickupHelpers: number;
    deliveryHelpers: number;
    pickupFloor: number;
    deliveryFloor: number;
    /** Cargo or passenger elevator available at that stop. */
    pickupElevator: boolean;
    deliveryElevator: boolean;
    /** Helpers booked at either stop. */
    loadingUnloading: boolean;
    handlingTags: HandlingTagValue[];
    /** Billed working time beyond the free loading allowance, minutes. */
    extraMinutes: number;
  };

  finance: DocumentFinance;
};

export type DocumentStop = {
  address: string;
  contactName: string | null;
  contactPhone: string | null;
};

/** "Hino 916" from make + model; `null` when both are missing. */
export function vehicleMakeModel(vehicle: {
  make: string | null;
  model: string | null;
}): string | null {
  const text = [vehicle.make, vehicle.model]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return text || null;
}

/** "Nino Beridze" from first + last name; `null` when both are missing. */
export function driverFullName(driver: {
  firstName: string | null;
  lastName: string | null;
}): string | null {
  const text = [driver.firstName, driver.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return text || null;
}

/** The order columns `computeDocumentFinance` reads — plain numbers, so the
 *  arithmetic is testable without a database. */
export type DocumentFinanceInput = {
  /** Quoted total before the tier: v1 `transportFare + helperFee`; pre-v1
   *  the whole quote, helpers included. */
  price: number;
  /** The tier's effect: > 0 PRIORITY, < 0 POOLING, 0 REGULAR. */
  serviceLevelAdjustment: number;
  /** Vehicle-waiting overtime, settled at completion. */
  overtimeFee: number;
  /** Helper overtime, settled at completion (v1; 0 before). */
  helperOvertimeFee: number;
  /** Pre-v1: the single helper charge (part of `price`). v1: the sum of the
   *  two per-stop fees below, which are what this function reads instead. */
  helperFee: number;
  pickupHelperFee: number;
  dropoffHelperFee: number;
  /** v1 transport charge (the tier's basis); `null` on pre-v1 orders. */
  transportFare: number | null;
  /** `null` = pre-v1 order. */
  tariffVersion: number | null;
  /** `Payment.status`, or `null` when the order has no payment row yet. */
  paymentStatus: DocumentPaymentStatus | null;
};

/**
 * The document's money, derived from the order's stored columns.
 *
 * - `total` is `adminOrderTotalGel` — `price + serviceLevelAdjustment +
 *   overtimeFee + helperOvertimeFee`, the amount the client is charged.
 * - `services` = helpers + overtime. Helpers are `pickupHelperFee +
 *   dropoffHelperFee` on a v1 order and `helperFee` on a pre-v1 one — never
 *   both, since on v1 `helperFee` *is* that sum. Both are already inside
 *   `price`; overtime (vehicle waiting + helper) is on top of it.
 * - `discount` is the POOLING adjustment (a negative `serviceLevelAdjustment`);
 *   a PRIORITY surcharge stays inside `transport`.
 * - `transport` is the remainder, `total − services − discount`, so the four
 *   printed lines reconcile to the tetri by construction rather than by the
 *   stored components happening to add up.
 * - `discountPercent` is the discount over the tier's basis (v1
 *   `transportFare`; pre-v1 the whole `price`, which is what the tier was a
 *   percentage of then), as a whole percent.
 * - `vat` is the VAT contained in `total` (`computeServiceAmounts`).
 */
export function computeDocumentFinance(
  input: DocumentFinanceInput,
  vatRate: number = SERVICE_VAT_RATE,
): DocumentFinance {
  const total = adminOrderTotalGel(input);
  const helpers = roundCurrency(
    input.tariffVersion === null
      ? input.helperFee
      : input.pickupHelperFee + input.dropoffHelperFee,
  );
  const overtime = roundCurrency(input.overtimeFee + input.helperOvertimeFee);
  const services = roundCurrency(helpers + overtime);
  // `+ 0` folds a `-0` (from `roundCurrency(-0)`) into a plain 0.
  const discount = roundCurrency(Math.min(input.serviceLevelAdjustment, 0)) + 0;
  const transport = roundCurrency(total - services - discount);

  const tierBasis =
    input.tariffVersion !== null && input.transportFare !== null
      ? input.transportFare
      : input.price;
  const discountPercent =
    discount < 0 && tierBasis > 0
      ? Math.round((Math.abs(discount) / tierBasis) * 100)
      : null;

  return {
    transport,
    services,
    servicesBreakdown: { helpers, overtime },
    discount,
    discountPercent,
    total,
    vat: computeServiceAmounts(total, vatRate).vat,
    vatRate,
    paymentStatus: input.paymentStatus ?? "PENDING",
  };
}

/** Digits the document number's sequence part is zero-padded to. */
const DOCUMENT_NUMBER_DIGITS = 7;

/**
 * "INV-2026-0012489": the year the number was assigned (Tbilisi calendar) and
 * the `order_document_number_seq` value, zero-padded to 7 digits (a longer
 * value is printed whole, never truncated). One sequence across years, so a
 * number is unique on its own and the year is only for the reader.
 */
export function formatDocumentNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(DOCUMENT_NUMBER_DIGITS, "0")}`;
}
