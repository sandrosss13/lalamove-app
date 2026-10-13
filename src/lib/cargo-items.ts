/**
 * The booking form's item list: a catalogue of everyday goods with a weight,
 * a volume and a size each, and the arithmetic that turns a client's list of
 * them ("Sofa ×1, Tires ×5, Engine oil 200 L") into the load figures the
 * vehicle step recommends against.
 *
 * **Why an item list rather than a weight.** Step 4 used to be a dropdown of
 * weight brackets — "Up to 1 t", "Up to 3.5 t" — whose options were simply the
 * payloads of the vehicles on offer. It asked the one question clients cannot
 * answer: nobody moving a flat knows what it weighs, so the bracket was a guess,
 * and the guess was the only thing the vehicle list was filtered by. What a
 * client *does* know is what they are moving. The figures per item below are
 * typical rather than exact, and that is the trade: a typical sofa is a far
 * better estimate of a sofa than the client's guess at a weight bracket, and
 * the client who does know the weight can still say so (`exactWeightKg`).
 *
 * **Plain data only**, for the reason `src/lib/cargo.ts` gives at its top: the
 * booking form imports this, so a runtime import of `@prisma/client` here would
 * drag the Prisma runtime into the browser bundle. `CargoCategory` is imported
 * as a *type* and the values are written as string literals. The two fit
 * modules imported below are the same dependency-free arithmetic the load
 * board and `POST /api/orders` already share.
 *
 * **The server stores the lines and trusts nothing it computes from them.**
 * `parseCreateOrderBody` (`src/lib/orders/order-input.ts`) validates the list
 * with `validateCargoItemLine` from this module and writes it to
 * `Order.cargoItems` as sent; it does not re-run `estimateCargoItems`. What
 * decides whether a booking may be placed against a class is still the four
 * envelope figures the form derives here and posts beside the list, checked by
 * `oversizeAxes` (`src/lib/orders/booking-fit.ts`) — so a catalogue figure
 * retuned between the form loading and the order landing can never make the
 * server refuse what the form offered, or accept what it should not.
 */

import type { CargoCategory } from "@prisma/client";

import { CARGO_MEASUREMENT_BOUNDS } from "@/lib/cargo";
import {
  specCapability,
  type SpecCapacitySlice,
} from "@/lib/orders/booking-fit";
import { loadFits, type LoadDimensions } from "@/lib/orders/vehicle-fit";

/* -------------------------------------------------------------------------- */
/* Units                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What one unit of an item's quantity is.
 *
 * Two families, and the difference is load-bearing in three places (the
 * quantity input's step, the server's integer check and the summary's
 * wording):
 *
 *  - **Counted** (`pcs`, `bags`, `pallets`): the quantity is how many of the
 *    thing there are, a whole number, and the summary says "×5". `bags` and
 *    `pallets` are counted units rather than measures — a "cement bag" item
 *    *is* one bag — and exist only so the quantity field reads "10 bags"
 *    rather than "10 pcs" of something nobody calls a piece.
 *  - **Measured** (`litres`, `kg`, `m2`): the quantity is an amount of a bulk
 *    good, may be fractional, and the summary says "200 L".
 */
export type CargoItemUnit = "pcs" | "bags" | "pallets" | "litres" | "kg" | "m2";

const COUNTED_UNITS: ReadonlySet<CargoItemUnit> = new Set([
  "pcs",
  "bags",
  "pallets",
]);

/** Whether `unit` counts whole things (see `CargoItemUnit`). */
export function isCountedUnit(unit: CargoItemUnit): boolean {
  return COUNTED_UNITS.has(unit);
}

/** Catalog key of a unit's short label ("L", "m²", "bags"). */
export function cargoItemUnitKey(unit: CargoItemUnit): string {
  return `common.cargoItemUnit.${unit}`;
}

/* -------------------------------------------------------------------------- */
/* Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One kind of goods a client can add to the list.
 *
 * Every figure is **per unit** of `unit`: a sofa's weight is one sofa's, engine
 * oil's is one litre's. The size, though, is always the size of *one physical
 * thing that has to go through the door of the van* — for a counted item the
 * item itself, for a bulk good the container it typically travels in (a 200 L
 * drum of oil, a box of tiles, a bundle of 6 m rebar). That is the figure the
 * vehicle's hold is compared against axis by axis, and a litre of oil has no
 * length of its own to compare.
 *
 * Dimensions follow the orientation the thing actually travels in, because
 * `loadFits` never rotates a load (see the non-goal in
 * `src/lib/orders/vehicle-fit.ts`): `lengthM ≥ widthM` across the floor, and
 * `heightM` upright. A fridge is upright, so it is 1.8 m tall; a wardrobe
 * travels on its back, so its 2 m is a length. Getting this wrong in either
 * direction is a recommendation that is either too big or one the driver cannot
 * load, so where a thing has a usual way of going into a van, that is the way
 * it is written down.
 *
 * `volumeM3` is the space the unit takes in the hold, which for a boxy item is
 * near its bounding box and for a bulk good includes its packaging. It is a
 * separate figure rather than `lengthM × widthM × heightM` because those
 * diverge for bulk goods (one litre is not one drum) and for things that nest
 * or stack (a folding chair).
 *
 * `categories` decides only the order the picker lists items in — the chosen
 * category's items first. It restricts nothing: any item can be added to any
 * booking, because the cargo category is the client's own reading of a mixed
 * load and the catalogue should not argue with it.
 */
export type CargoItemSpec = {
  /** Stable — stored on `Order.cargoItems`. Never rename one; retire it. */
  id: string;
  categories: readonly CargoCategory[];
  unit: CargoItemUnit;
  weightKg: number;
  volumeM3: number;
  lengthM: number;
  widthM: number;
  heightM: number;
};

/**
 * The catalogue, grouped by the category each item is most at home in.
 *
 * Figures are typical for what is sold and moved in Georgia: Georgian ceramic
 * brick rather than an imported engineering brick, a 50 kg cement bag, a 19 L
 * water-cooler bottle. They are estimates and say so in the UI ("≈"); the point
 * is a recommendation in the right vehicle class, not a weighbridge reading.
 */
export const CARGO_ITEM_CATALOG: readonly CargoItemSpec[] = [
  // Furniture.
  { id: "sofa2Seat", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 45, volumeM3: 1.2, lengthM: 1.6, widthM: 0.9, heightM: 0.85 },
  { id: "sofa3Seat", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 60, volumeM3: 1.75, lengthM: 2.2, widthM: 0.95, heightM: 0.85 },
  { id: "cornerSofa", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 110, volumeM3: 2.6, lengthM: 2.8, widthM: 1.0, heightM: 0.9 },
  { id: "armchair", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 25, volumeM3: 0.7, lengthM: 0.9, widthM: 0.85, heightM: 0.9 },
  { id: "bedFrameSingle", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 30, volumeM3: 0.25, lengthM: 2.0, widthM: 0.4, heightM: 0.3 },
  { id: "bedFrameDouble", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 55, volumeM3: 0.4, lengthM: 2.1, widthM: 0.45, heightM: 0.4 },
  { id: "mattressSingle", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 18, volumeM3: 0.45, lengthM: 2.0, widthM: 0.9, heightM: 0.25 },
  { id: "mattressDouble", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 35, volumeM3: 0.8, lengthM: 2.0, widthM: 1.6, heightM: 0.25 },
  // On its back: an assembled wardrobe stood up is taller than most van holds.
  { id: "wardrobe", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 80, volumeM3: 1.2, lengthM: 2.0, widthM: 1.0, heightM: 0.6 },
  { id: "chestOfDrawers", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 40, volumeM3: 0.4, lengthM: 0.9, widthM: 0.5, heightM: 0.9 },
  { id: "diningTable", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 35, volumeM3: 1.1, lengthM: 1.6, widthM: 0.9, heightM: 0.76 },
  { id: "coffeeTable", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 15, volumeM3: 0.3, lengthM: 1.1, widthM: 0.6, heightM: 0.45 },
  { id: "chair", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 6, volumeM3: 0.24, lengthM: 0.5, widthM: 0.5, heightM: 0.95 },
  { id: "officeDesk", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 40, volumeM3: 0.75, lengthM: 1.4, widthM: 0.7, heightM: 0.75 },
  { id: "officeChair", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 15, volumeM3: 0.5, lengthM: 0.7, widthM: 0.7, heightM: 1.1 },
  { id: "bookshelf", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 35, volumeM3: 0.57, lengthM: 1.8, widthM: 0.9, heightM: 0.35 },
  { id: "tvStand", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 25, volumeM3: 0.36, lengthM: 1.6, widthM: 0.45, heightM: 0.5 },
  { id: "rug", categories: ["FURNITURE_FURNISHINGS", "FULL_RELOCATION"], unit: "pcs", weightKg: 15, volumeM3: 0.25, lengthM: 2.0, widthM: 0.35, heightM: 0.35 },

  // Appliances. Upright where the manufacturer says upright.
  { id: "fridge", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 70, volumeM3: 0.82, lengthM: 0.7, widthM: 0.65, heightM: 1.8 },
  { id: "fridgeSideBySide", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 120, volumeM3: 1.28, lengthM: 0.95, widthM: 0.75, heightM: 1.8 },
  { id: "chestFreezer", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 45, volumeM3: 0.55, lengthM: 1.0, widthM: 0.65, heightM: 0.85 },
  { id: "washingMachine", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 70, volumeM3: 0.35, lengthM: 0.6, widthM: 0.6, heightM: 0.85 },
  { id: "dishwasher", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 45, volumeM3: 0.35, lengthM: 0.6, widthM: 0.6, heightM: 0.85 },
  { id: "cooker", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 50, volumeM3: 0.35, lengthM: 0.6, widthM: 0.6, heightM: 0.85 },
  { id: "microwave", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 15, volumeM3: 0.06, lengthM: 0.5, widthM: 0.4, heightM: 0.3 },
  // Boxed, and carried on edge as the box says.
  { id: "tv", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 25, volumeM3: 0.32, lengthM: 1.6, widthM: 0.2, heightM: 1.0 },
  { id: "airConditioner", categories: ["APPLIANCES"], unit: "pcs", weightKg: 45, volumeM3: 0.25, lengthM: 1.0, widthM: 0.4, heightM: 0.6 },
  { id: "waterHeater", categories: ["APPLIANCES", "FULL_RELOCATION"], unit: "pcs", weightKg: 25, volumeM3: 0.21, lengthM: 0.5, widthM: 0.5, heightM: 0.85 },
  { id: "officePrinter", categories: ["APPLIANCES"], unit: "pcs", weightKg: 30, volumeM3: 0.22, lengthM: 0.6, widthM: 0.6, heightM: 0.6 },

  // Boxes, stock and personal belongings.
  { id: "boxSmall", categories: ["FULL_RELOCATION", "RETAIL_STOCK"], unit: "pcs", weightKg: 10, volumeM3: 0.036, lengthM: 0.4, widthM: 0.3, heightM: 0.3 },
  { id: "boxMedium", categories: ["FULL_RELOCATION", "RETAIL_STOCK"], unit: "pcs", weightKg: 15, volumeM3: 0.07, lengthM: 0.5, widthM: 0.4, heightM: 0.35 },
  { id: "boxLarge", categories: ["FULL_RELOCATION", "RETAIL_STOCK"], unit: "pcs", weightKg: 20, volumeM3: 0.135, lengthM: 0.6, widthM: 0.5, heightM: 0.45 },
  { id: "suitcase", categories: ["FULL_RELOCATION"], unit: "pcs", weightKg: 20, volumeM3: 0.11, lengthM: 0.75, widthM: 0.5, heightM: 0.3 },
  { id: "bicycle", categories: ["FULL_RELOCATION", "RETAIL_STOCK"], unit: "pcs", weightKg: 15, volumeM3: 0.6, lengthM: 1.8, widthM: 0.6, heightM: 1.1 },
  { id: "scooter", categories: ["FULL_RELOCATION", "RETAIL_STOCK"], unit: "pcs", weightKg: 120, volumeM3: 1.2, lengthM: 2.0, widthM: 0.8, heightM: 1.2 },
  { id: "drinksCrate", categories: ["RETAIL_STOCK"], unit: "pcs", weightKg: 12, volumeM3: 0.03, lengthM: 0.4, widthM: 0.3, heightM: 0.25 },
  { id: "shelvingUnit", categories: ["RETAIL_STOCK", "EVENT_EQUIPMENT"], unit: "pcs", weightKg: 40, volumeM3: 0.2, lengthM: 2.0, widthM: 0.5, heightM: 0.2 },
  // A loaded Euro pallet at a typical mixed-goods height.
  { id: "pallet", categories: ["RETAIL_STOCK", "INDUSTRIAL_SUPPLIES", "CONSTRUCTION_MATERIALS"], unit: "pallets", weightKg: 500, volumeM3: 1.44, lengthM: 1.2, widthM: 0.8, heightM: 1.5 },

  // Event equipment, packed for transport.
  { id: "foldingTable", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 12, volumeM3: 0.11, lengthM: 1.8, widthM: 0.75, heightM: 0.08 },
  { id: "foldingChair", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 4, volumeM3: 0.025, lengthM: 0.8, widthM: 0.45, heightM: 0.06 },
  { id: "stageDeck", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 35, volumeM3: 0.2, lengthM: 2.0, widthM: 1.0, heightM: 0.1 },
  { id: "paSpeaker", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 30, volumeM3: 0.15, lengthM: 0.6, widthM: 0.45, heightM: 0.55 },
  { id: "gazeboTent", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 30, volumeM3: 0.15, lengthM: 1.6, widthM: 0.3, heightM: 0.3 },
  { id: "flightCase", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 40, volumeM3: 0.43, lengthM: 1.2, widthM: 0.6, heightM: 0.6 },
  { id: "trussSegment", categories: ["EVENT_EQUIPMENT"], unit: "pcs", weightKg: 15, volumeM3: 0.27, lengthM: 3.0, widthM: 0.3, heightM: 0.3 },

  // Industrial supplies. Liquids are per litre and sized as the container
  // they usually ship in: oil ≈ 0.9 kg/L plus its drum, paint ≈ 1.3 kg/L.
  { id: "engineOil", categories: ["INDUSTRIAL_SUPPLIES", "RETAIL_STOCK"], unit: "litres", weightKg: 0.95, volumeM3: 0.0012, lengthM: 0.6, widthM: 0.6, heightM: 0.9 },
  { id: "paint", categories: ["INDUSTRIAL_SUPPLIES", "CONSTRUCTION_MATERIALS"], unit: "litres", weightKg: 1.35, volumeM3: 0.0012, lengthM: 0.3, widthM: 0.3, heightM: 0.35 },
  { id: "waterBottle19L", categories: ["RETAIL_STOCK", "INDUSTRIAL_SUPPLIES"], unit: "pcs", weightKg: 20, volumeM3: 0.025, lengthM: 0.27, widthM: 0.27, heightM: 0.5 },
  { id: "ibcTank", categories: ["INDUSTRIAL_SUPPLIES"], unit: "pcs", weightKg: 1050, volumeM3: 1.38, lengthM: 1.2, widthM: 1.0, heightM: 1.15 },
  { id: "carTire", categories: ["INDUSTRIAL_SUPPLIES", "RETAIL_STOCK"], unit: "pcs", weightKg: 9, volumeM3: 0.09, lengthM: 0.65, widthM: 0.65, heightM: 0.22 },
  { id: "truckTire", categories: ["INDUSTRIAL_SUPPLIES", "RETAIL_STOCK"], unit: "pcs", weightKg: 60, volumeM3: 0.36, lengthM: 1.1, widthM: 1.1, heightM: 0.3 },
  { id: "carBattery", categories: ["INDUSTRIAL_SUPPLIES", "RETAIL_STOCK"], unit: "pcs", weightKg: 18, volumeM3: 0.012, lengthM: 0.3, widthM: 0.18, heightM: 0.2 },
  { id: "generator", categories: ["INDUSTRIAL_SUPPLIES", "EVENT_EQUIPMENT"], unit: "pcs", weightKg: 90, volumeM3: 0.38, lengthM: 0.9, widthM: 0.6, heightM: 0.7 },

  // Construction materials.
  { id: "cementBag", categories: ["CONSTRUCTION_MATERIALS"], unit: "bags", weightKg: 50, volumeM3: 0.038, lengthM: 0.7, widthM: 0.45, heightM: 0.12 },
  { id: "plasterBag", categories: ["CONSTRUCTION_MATERIALS"], unit: "bags", weightKg: 25, volumeM3: 0.024, lengthM: 0.6, widthM: 0.4, heightM: 0.1 },
  { id: "brick", categories: ["CONSTRUCTION_MATERIALS"], unit: "pcs", weightKg: 3, volumeM3: 0.002, lengthM: 0.25, widthM: 0.12, heightM: 0.065 },
  { id: "concreteBlock", categories: ["CONSTRUCTION_MATERIALS"], unit: "pcs", weightKg: 17, volumeM3: 0.016, lengthM: 0.4, widthM: 0.2, heightM: 0.2 },
  // Per square metre, sized as one carton.
  { id: "tiles", categories: ["CONSTRUCTION_MATERIALS"], unit: "m2", weightKg: 20, volumeM3: 0.012, lengthM: 0.6, widthM: 0.6, heightM: 0.1 },
  { id: "laminate", categories: ["CONSTRUCTION_MATERIALS"], unit: "m2", weightKg: 8, volumeM3: 0.01, lengthM: 1.4, widthM: 0.2, heightM: 0.06 },
  { id: "drywallSheet", categories: ["CONSTRUCTION_MATERIALS"], unit: "pcs", weightKg: 25, volumeM3: 0.038, lengthM: 2.5, widthM: 1.2, heightM: 0.0125 },
  { id: "plywoodSheet", categories: ["CONSTRUCTION_MATERIALS"], unit: "pcs", weightKg: 30, volumeM3: 0.056, lengthM: 2.5, widthM: 1.25, heightM: 0.018 },
  { id: "timberBeam", categories: ["CONSTRUCTION_MATERIALS"], unit: "pcs", weightKg: 30, volumeM3: 0.06, lengthM: 4.0, widthM: 0.15, heightM: 0.1 },
  // Per kilogram of steel; loosely bundled, so ~3× steel's own volume.
  { id: "rebar", categories: ["CONSTRUCTION_MATERIALS", "INDUSTRIAL_SUPPLIES"], unit: "kg", weightKg: 1, volumeM3: 0.0004, lengthM: 6.0, widthM: 0.2, heightM: 0.2 },
  { id: "interiorDoor", categories: ["CONSTRUCTION_MATERIALS", "FURNITURE_FURNISHINGS"], unit: "pcs", weightKg: 25, volumeM3: 0.28, lengthM: 2.1, widthM: 0.9, heightM: 0.15 },
  // On edge, as glazing travels.
  { id: "window", categories: ["CONSTRUCTION_MATERIALS"], unit: "pcs", weightKg: 40, volumeM3: 0.32, lengthM: 1.5, widthM: 0.15, heightM: 1.4 },
  { id: "bathtub", categories: ["CONSTRUCTION_MATERIALS", "FURNITURE_FURNISHINGS"], unit: "pcs", weightKg: 40, volumeM3: 0.77, lengthM: 1.7, widthM: 0.75, heightM: 0.6 },
];

/** The catalogue by id, built once. */
const CARGO_ITEMS_BY_ID: ReadonlyMap<string, CargoItemSpec> = new Map(
  CARGO_ITEM_CATALOG.map((item) => [item.id, item]),
);

/** A catalogue item by its stored id, or `undefined` for one not (or no longer) in it. */
export function cargoItemById(id: string): CargoItemSpec | undefined {
  return CARGO_ITEMS_BY_ID.get(id);
}

/** Catalog key of an item's name, e.g. `common.cargoItem.sofa3Seat`. */
export function cargoItemLabelKey(id: string): string {
  return `common.cargoItem.${id}`;
}

/**
 * The catalogue in picker order for `category`: its own items first, then the
 * rest, each group in catalogue order. With no category, catalogue order.
 */
export function cargoItemsForCategory(
  category: CargoCategory | null,
): CargoItemSpec[] {
  if (category === null) {
    return [...CARGO_ITEM_CATALOG];
  }

  const own = CARGO_ITEM_CATALOG.filter((item) =>
    item.categories.includes(category),
  );
  const rest = CARGO_ITEM_CATALOG.filter(
    (item) => !item.categories.includes(category),
  );

  return [...own, ...rest];
}

/* -------------------------------------------------------------------------- */
/* Custom items                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The id of the "something else" line: the client types a name and picks a
 * rough size, because no catalogue is ever complete and a booking must not be
 * refused for owning an unusual object.
 */
export const CUSTOM_CARGO_ITEM_ID = "custom";

export const CUSTOM_CARGO_ITEM_SIZES = ["S", "M", "L", "XL"] as const;

export type CustomCargoItemSize = (typeof CUSTOM_CARGO_ITEM_SIZES)[number];

/**
 * What each custom size stands for — deliberately anchored to things everybody
 * can picture rather than to numbers ("fits in a car boot", "armchair-sized",
 * "sofa- or fridge-sized"), with the figures chosen to match those anchors in
 * the catalogue above so a custom "L" and a sofa estimate alike.
 */
export const CUSTOM_CARGO_ITEM_PRESETS: Record<
  CustomCargoItemSize,
  Omit<CargoItemSpec, "id" | "categories">
> = {
  S: { unit: "pcs", weightKg: 10, volumeM3: 0.06, lengthM: 0.5, widthM: 0.4, heightM: 0.3 },
  M: { unit: "pcs", weightKg: 30, volumeM3: 0.45, lengthM: 0.9, widthM: 0.7, heightM: 0.7 },
  L: { unit: "pcs", weightKg: 80, volumeM3: 1.5, lengthM: 2.0, widthM: 0.9, heightM: 0.9 },
  XL: { unit: "pcs", weightKg: 250, volumeM3: 4, lengthM: 3.0, widthM: 1.4, heightM: 1.0 },
};

/** Catalog key of a custom size's description. */
export function customCargoItemSizeKey(size: CustomCargoItemSize): string {
  return `common.cargoItemSize.${size}`;
}

/* -------------------------------------------------------------------------- */
/* Lines                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One line of the client's list, exactly as stored on `Order.cargoItems`.
 *
 * A catalogue line is its id and a quantity; a custom line adds the client's
 * own name for the thing and its size. No figure is stored: the line says what
 * the client is moving, and what that weighs is the catalogue's opinion, which
 * is allowed to improve without rewriting old orders.
 */
export type CargoItemLine =
  | { itemId: string; quantity: number }
  | {
      itemId: typeof CUSTOM_CARGO_ITEM_ID;
      quantity: number;
      name: string;
      size: CustomCargoItemSize;
    };

/** The longest list one order may carry — more lines than any real load needs. */
export const CARGO_ITEM_LINES_MAX = 50;

/** The longest custom item name, short enough for the driver's one-line summary. */
export const CUSTOM_CARGO_ITEM_NAME_MAX_LENGTH = 80;

/**
 * The largest quantity one line may declare. A sanity ceiling, not a capacity
 * one — 100,000 litres or bricks is already far past anything a single vehicle
 * carries, and the vehicle filter is what says so; this only stops a stray
 * extra zero or an `Infinity` from reaching the database.
 */
export const CARGO_ITEM_QUANTITY_MAX = 100_000;

/** The figures one line resolves to, per unit. `null` for an unknown id. */
function lineSpec(
  line: CargoItemLine,
): Omit<CargoItemSpec, "id" | "categories"> | null {
  if (line.itemId === CUSTOM_CARGO_ITEM_ID && "size" in line) {
    return CUSTOM_CARGO_ITEM_PRESETS[line.size];
  }

  return cargoItemById(line.itemId) ?? null;
}

/**
 * The unit a line's quantity is in: the catalogue item's, or `pcs` for a
 * custom line. `null` for an id the catalogue does not know.
 */
export function cargoItemLineUnit(line: CargoItemLine): CargoItemUnit | null {
  return lineSpec(line)?.unit ?? null;
}

/**
 * Check one untrusted value as a `CargoItemLine`, returning the line in its
 * stored form (custom name trimmed, no stray keys) or `null`.
 *
 * Shared by the two places a line arrives from outside: the request body
 * (`parseCreateOrderBody`, which turns a `null` into a 400) and the stored
 * column (the edit page, which drops a line it cannot read rather than refusing
 * to open the order). Rules:
 *
 *  - `itemId` is a catalogue id, or `custom` with a non-blank `name` of at most
 *    `CUSTOM_CARGO_ITEM_NAME_MAX_LENGTH` characters and one of the four sizes.
 *  - `quantity` is a finite number greater than zero and no more than
 *    `CARGO_ITEM_QUANTITY_MAX`, and a whole number for a counted unit — there
 *    is no such thing as half a sofa, and "×2.5" in a driver's summary would
 *    read as a typo.
 */
export function validateCargoItemLine(value: unknown): CargoItemLine | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const { itemId, quantity } = record;

  if (
    typeof itemId !== "string" ||
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > CARGO_ITEM_QUANTITY_MAX
  ) {
    return null;
  }

  let line: CargoItemLine;
  if (itemId === CUSTOM_CARGO_ITEM_ID) {
    const { name, size } = record;
    if (
      typeof name !== "string" ||
      typeof size !== "string" ||
      !(CUSTOM_CARGO_ITEM_SIZES as readonly string[]).includes(size)
    ) {
      return null;
    }

    const trimmed = name.trim();
    if (
      trimmed.length === 0 ||
      trimmed.length > CUSTOM_CARGO_ITEM_NAME_MAX_LENGTH
    ) {
      return null;
    }

    line = {
      itemId: CUSTOM_CARGO_ITEM_ID,
      quantity,
      name: trimmed,
      size: size as CustomCargoItemSize,
    };
  } else {
    if (!cargoItemById(itemId)) {
      return null;
    }
    line = { itemId, quantity };
  }

  const unit = cargoItemLineUnit(line);
  if (unit === null || (isCountedUnit(unit) && !Number.isInteger(quantity))) {
    return null;
  }

  return line;
}

/**
 * Read `Order.cargoItems` back into lines for the edit form: every readable line
 * kept, every unreadable one (a retired catalogue id, a hand-edited row)
 * dropped, and `[]` for an order that has no list at all — every order booked
 * before the list existed. Never throws: an order the client wants to edit must
 * open even if one of its stored lines has gone stale.
 */
export function cargoItemLinesFromStored(value: unknown): CargoItemLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, CARGO_ITEM_LINES_MAX)
    .map(validateCargoItemLine)
    .filter((line): line is CargoItemLine => line !== null);
}

/* -------------------------------------------------------------------------- */
/* Estimate                                                                   */
/* -------------------------------------------------------------------------- */

/** What a list of lines adds up to. */
export type CargoItemsEstimate = {
  /**
   * The exact weight when the client gave one, the catalogue sum otherwise.
   * Raw, unrounded kilograms.
   */
  totalWeightKg: number;
  /** Whether `totalWeightKg` is the client's own figure rather than ours. */
  weightIsExact: boolean;
  /** Sum of every line's volume, in m³, before any packing allowance. */
  totalVolumeM3: number;
  /**
   * The box every single item on the list fits inside, axis by axis: the
   * longest length, the widest width and the tallest height *across all lines*.
   *
   * **Per-axis maximum, not the largest single item, and on purpose.** The
   * server compares the declared envelope against the class like-for-like on
   * each axis and never rotates (`oversizeAxes`), so the envelope's job is to
   * guarantee that *every* item clears every axis of the hold. The largest
   * item by volume does not: a 2.2 m sofa and a 1.8 m-tall fridge each beat
   * the other on one axis, and declaring only the sofa's 0.85 m height would
   * recommend a van the fridge cannot stand up in. The per-axis maximum can
   * describe a box no single item fills — 2.2 m long *and* 1.8 m tall — which
   * is the conservative direction: it may skip a van that would have fitted
   * after all, never offer one that does not.
   *
   * `null` when the list resolves to nothing.
   */
  envelope: { lengthM: number; widthM: number; heightM: number } | null;
};

/**
 * Add up a list of lines.
 *
 * Unknown ids are skipped rather than thrown on — the form never produces one,
 * and a stale stored line should cost its own contribution, not the estimate.
 * `exactWeightKg`, when given (finite and positive), replaces the summed weight
 * and nothing else: the client knows what it weighs, not how big it is, so the
 * volume and the envelope still come from the list.
 */
export function estimateCargoItems(
  lines: readonly CargoItemLine[],
  exactWeightKg: number | null = null,
): CargoItemsEstimate {
  let weightKg = 0;
  let volumeM3 = 0;
  let envelope: CargoItemsEstimate["envelope"] = null;

  for (const line of lines) {
    const spec = lineSpec(line);
    if (spec === null || !(line.quantity > 0)) {
      continue;
    }

    weightKg += spec.weightKg * line.quantity;
    volumeM3 += spec.volumeM3 * line.quantity;
    const previous = envelope as CargoItemsEstimate["envelope"];
    envelope = {
      lengthM: Math.max(previous?.lengthM ?? 0, spec.lengthM),
      widthM: Math.max(previous?.widthM ?? 0, spec.widthM),
      heightM: Math.max(previous?.heightM ?? 0, spec.heightM),
    };
  }

  const weightIsExact =
    exactWeightKg !== null && Number.isFinite(exactWeightKg) && exactWeightKg > 0;

  return {
    totalWeightKg: weightIsExact ? exactWeightKg : weightKg,
    weightIsExact,
    totalVolumeM3: volumeM3,
    envelope,
  };
}

/* -------------------------------------------------------------------------- */
/* Declared load and vehicle recommendation                                   */
/* -------------------------------------------------------------------------- */

/**
 * Round a figure *up* to `step`. Up, because every figure below becomes a claim
 * the server checks against a hold, and rounding down could turn a load that is
 * 1 mm too long into one declared as fitting.
 *
 * The epsilon keeps floating-point dust from bumping an exact figure a whole
 * step: 0.1 + 0.2 is 0.30000000000000004, which is 0.3, not 0.31.
 */
function roundUp(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

/** Round to the step's own decimals, so `roundUp(0.3, 0.01)` prints as `0.3`. */
function tidy(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/**
 * The load the vehicle filter must test, and the one the form posts.
 *
 * `fit` is the estimate rounded up to whole kilograms and whole centimetres and
 * raised to `CARGO_MEASUREMENT_BOUNDS`' floors — but **not** capped at their
 * ceilings. `declared` is `fit` capped at those ceilings, which is what
 * `POST /api/orders` accepts. The vehicle filter tests `fit`, and that is what
 * keeps the form and the server in agreement:
 *
 *  - `declared ≤ fit` on every axis, so any class `fit` fits, `declared` fits,
 *    and `oversizeAxes` on the server can never refuse a class this form
 *    recommended.
 *  - A load over a ceiling (40 t of bricks) stays over it in `fit`, so it fits
 *    no class here rather than appearing to fit the largest class at the capped
 *    24 t — the form says nothing can take it, instead of booking a trailer
 *    that cannot.
 *
 * `null` when the estimate has no envelope (nothing on the list resolves).
 */
export function cargoLoadFromEstimate(
  estimate: CargoItemsEstimate,
): { fit: LoadDimensions; declared: LoadDimensions } | null {
  if (estimate.envelope === null) {
    return null;
  }

  const bounds = CARGO_MEASUREMENT_BOUNDS;
  const fit = {
    weightKg: Math.max(
      roundUp(estimate.totalWeightKg, 1),
      bounds.cargoWeightKg.min,
    ),
    lengthM: tidy(
      Math.max(roundUp(estimate.envelope.lengthM, 0.01), bounds.cargoLengthM.min),
      2,
    ),
    widthM: tidy(
      Math.max(roundUp(estimate.envelope.widthM, 0.01), bounds.cargoWidthM.min),
      2,
    ),
    heightM: tidy(
      Math.max(roundUp(estimate.envelope.heightM, 0.01), bounds.cargoHeightM.min),
      2,
    ),
  };

  return {
    fit,
    declared: {
      weightKg: Math.min(fit.weightKg, bounds.cargoWeightKg.max),
      lengthM: Math.min(fit.lengthM, bounds.cargoLengthM.max),
      widthM: Math.min(fit.widthM, bounds.cargoWidthM.max),
      heightM: Math.min(fit.heightM, bounds.cargoHeightM.max),
    },
  };
}

/**
 * Head-room asked of a hold's volume over the summed item volumes: 20 %.
 *
 * Goods never pack a hold solid — a sofa leaves air above it, chairs do not
 * tessellate with a fridge, and the driver needs room to strap things down — so
 * a van whose volume merely equals the list's is a van the last box does not go
 * into. 20 % is the usual removals rule of thumb, and it errs towards the next
 * size up, which a client can always step down from on the grid.
 */
export const CARGO_PACKING_BUFFER = 1.2;

/**
 * The height an open bed is assumed to be loaded to, **for the volume check
 * only**.
 *
 * `capabilityOf` reads `FLATBED_TRUCK`'s `cargoHeightM: 0` as no height limit,
 * and on the height axis that stays true here: a tall item still fits a
 * flatbed. But no height limit taken literally is infinite volume, and a
 * flatbed would then be recommended for any list at all — a whole flat's
 * worth of boxes on a 5 m bed, stacked as high as they like. 2.5 m is about as
 * high as a load on a deck can go and stay under Georgian road clearances, so a
 * flatbed's *volume* is its floor times that. It never refuses a load on height
 * and is never sent to the server, which does not check volume at all.
 */
export const OPEN_BED_LOAD_HEIGHT_M = 2.5;

/**
 * Should the vehicle step offer this class for this list?
 *
 * Two tests, both of which must pass:
 *
 *  1. **Weight and size** — `loadFits` against `specCapability`, the exact
 *     pair `POST /api/orders` refuses a booking with (through `oversizeAxes`),
 *     fed `fit` from `cargoLoadFromEstimate`. Reusing them rather than
 *     comparing the four columns here is what keeps the flatbed's open height
 *     open, and keeps the form from ever recommending a class the server would
 *     then refuse.
 *  2. **Volume** — the hold's volume, at least the list's total times
 *     `CARGO_PACKING_BUFFER`. The server has no volume check, so this one can
 *     only ever make the form *more* cautious than the server, never less.
 *
 * The caller keeps the list cheapest-first, so the first class passing both
 * is still the smallest that does the job.
 */
export function vehicleClassSuitsCargo(
  estimate: CargoItemsEstimate,
  spec: SpecCapacitySlice,
): boolean {
  const load = cargoLoadFromEstimate(estimate);
  if (load === null) {
    return false;
  }

  const capability = specCapability(spec);
  if (!loadFits(load.fit, capability)) {
    return false;
  }

  const holdHeightM = Number.isFinite(capability.heightM)
    ? capability.heightM
    : OPEN_BED_LOAD_HEIGHT_M;
  const holdVolumeM3 = capability.lengthM * capability.widthM * holdHeightM;

  return holdVolumeM3 >= estimate.totalVolumeM3 * CARGO_PACKING_BUFFER;
}

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The longest summary written to `Order.packagingDescription` — the column's
 * own free-text ceiling (`FREE_TEXT_MAX_LENGTH` in
 * `src/lib/orders/order-input.ts`), which a longer summary would fail.
 */
export const CARGO_ITEMS_SUMMARY_MAX_LENGTH = 200;

/**
 * One line, as a driver reads it: "Sofa (3-seat) ×1" for a counted unit,
 * "Engine oil 200 L" for a measured one, the client's own name for a custom
 * line. `label` and `unitLabel` are the caller's, already in the reader's
 * language, so this stays a pure function a test can run without a catalog.
 */
export function formatCargoItemLine(
  line: CargoItemLine,
  label: string,
  unitLabel: string,
  formatNumber: (value: number) => string,
): string {
  const unit = cargoItemLineUnit(line) ?? "pcs";
  const quantity = formatNumber(line.quantity);

  return isCountedUnit(unit)
    ? `${label} ×${quantity}`
    : `${label} ${quantity} ${unitLabel}`;
}

/**
 * The whole list as one short line for `packagingDescription`, the column the
 * driver's load board already prints under the cargo type: "Sofa ×1, Tires ×5,
 * Engine oil 200 L".
 *
 * Kept under `maxLength` by dropping whole lines from the end and saying how
 * many were dropped ("…, +3 more") rather than cutting a word in half — the
 * full list is on `cargoItems`, and a driver reading the summary needs the
 * first few things clearly more than all of them truncated. `moreLabel` turns
 * a count into that tail in the reader's language.
 */
export function cargoItemsSummary(
  parts: readonly string[],
  moreLabel: (count: number) => string,
  maxLength: number = CARGO_ITEMS_SUMMARY_MAX_LENGTH,
): string {
  const full = parts.join(", ");
  if (full.length <= maxLength) {
    return full;
  }

  for (let kept = parts.length - 1; kept >= 1; kept -= 1) {
    const candidate = `${parts.slice(0, kept).join(", ")}, ${moreLabel(
      parts.length - kept,
    )}`;
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  // Even one line plus the tail is too long: a custom name near its own
  // ceiling, and nothing else. Cut it, visibly.
  return `${full.slice(0, maxLength - 1)}…`;
}
