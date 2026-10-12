/**
 * The client's order-details document ("შეკვეთის დეტალები / Invoice / Order
 * details"): its read model and its money arithmetic. Pure — no Prisma client,
 * no request — so the PDF renderer, the order page and
 * `tests/service-document.spec.ts` all share one definition.
 *
 * **What the document is.** On zomo a client buys exactly one thing: the
 * transportation service. The document therefore has no goods, no buyer and no
 * recipient. It names four parties and one amount:
 *
 * - CLIENT — the BUSINESS client who booked (`ClientProfile.companyName`,
 *   `vatId`, `legalAddress`);
 * - SELLER — zomo's own legal entity, from the server's `ZOMO_LEGAL_*` env;
 * - SERVICE PROVIDER — the carrier company the order went through, or the
 *   independent driver who claimed it, with the DRIVER and VEHICLE that ran it;
 * - SERVICE AMOUNT — what the client was charged for the order
 *   (`adminOrderTotalGel`: price + service-tier adjustment + overtime), split
 *   into net, VAT and the VAT-inclusive grand total by `computeServiceAmounts`.
 *
 * The database-bound half (who may read it, the start-of-trip snapshot, the
 * view builder) is `src/lib/orders/service-document-server.ts`.
 *
 * Not `server-only`: the spec imports it with no Next runtime, and the order
 * page's client component reads the view type.
 */

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

/** A company or person on the document. Any field may be missing (`null`). */
export type ServiceDocumentParty = {
  name: string | null;
  taxId: string | null;
  address: string | null;
};

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

/**
 * Everything the document prints, already resolved: snapshot values once the
 * trip has started, live values before (`preliminary`).
 */
export type ServiceDocumentView = {
  reference: string;
  /** ISO instant: completedAt ?? inTransitAt ?? scheduledAt ?? createdAt. */
  documentDate: string;
  /** True while the trip has not started (and so nothing is snapshotted):
   *  provider, driver and vehicle may still change. */
  preliminary: boolean;
  client: ServiceDocumentParty;
  seller: ServiceDocumentParty;
  /** `null` while nobody has taken the order on yet. */
  provider: (ServiceDocumentParty & { kind: ServiceProviderKindValue }) | null;
  driver: {
    firstName: string | null;
    lastName: string | null;
    personalId: string | null;
  };
  vehicle: {
    make: string | null;
    model: string | null;
    plate: string | null;
    trailerPlate: string | null;
  };
  route: { pickupAddress: string; dropoffAddress: string };
  cargo: { category: CargoCategoryValue; description: string | null };
  amounts: ServiceAmounts;
};

/** "Hino 916" from make + model; `null` when both are missing. */
export function vehicleMakeModel(
  vehicle: Pick<ServiceDocumentView["vehicle"], "make" | "model">,
): string | null {
  const text = [vehicle.make, vehicle.model]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return text || null;
}

/** "Nino Beridze" from first + last name; `null` when both are missing. */
export function driverFullName(
  driver: Pick<ServiceDocumentView["driver"], "firstName" | "lastName">,
): string | null {
  const text = [driver.firstName, driver.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return text || null;
}
