import type { CargoCategory } from "@prisma/client";

import { shortcutsFor, type GoodsShortcutCode } from "@/lib/goods-shortcuts";

/**
 * The goods shortcuts a landing visitor is offered, shared by the v4 booking
 * card (`landing-booking-card.tsx`) and the legacy category tiles
 * (`landing-category-tiles.tsx`).
 *
 * The visitor is signed out, so their account type is unknown and they get the
 * individual set — no pallets, which are business-only.
 *
 * Lived in `landing-quote-calculator.tsx` until the v4 homepage retired the
 * calculator; moved here so the tiles that still render for an old CMS row
 * keep working without it.
 */
export const LANDING_GOODS_SHORTCUTS = shortcutsFor("INDIVIDUAL");

/**
 * The cargo category each shortcut is *estimated* as: the category of the first
 * entry (lowest `sortOrder`) in that shortcut's catalogue group, as seeded by
 * `20261013090100_seed_item_catalogue`.
 *
 * Only the legacy category tiles read it, to show a typical vehicle and a
 * "from" figure. The booking form never does — once the client lists their
 * items, the order's real cargo category is derived from those items
 * (`src/lib/orders/load-plan.ts`).
 *
 * Keyed by every code, pallets included, so a new shortcut fails typecheck here
 * rather than estimating as `undefined`; the pallets row is unreachable from
 * the landing page (see `LANDING_GOODS_SHORTCUTS`) and is filled in only to
 * keep the record exhaustive.
 */
export const SHORTCUT_ESTIMATE_CARGO_CATEGORY: Record<
  GoodsShortcutCode,
  CargoCategory
> = {
  // LIVING_ROOM opens on SOFA_2_SEAT.
  "moving-home": "FURNITURE_FURNISHINGS",
  furniture: "FURNITURE_FURNISHINGS",
  // KITCHEN_APPLIANCES opens on FRIDGE_SINGLE.
  appliances: "APPLIANCES",
  // BOXES_PARCELS opens on BOX_SMALL.
  boxes: "RETAIL_STOCK",
  // CHILLED_FOOD opens on CHILLED_CRATE. The cold chain is a body requirement
  // the landing taxonomy does not carry; the booking form applies the body.
  chilled: "RETAIL_STOCK",
  // BUILDING_MATERIALS opens on CEMENT_BAG_25.
  building: "CONSTRUCTION_MATERIALS",
  // EVENT_EQUIPMENT opens on FOLDING_TABLE.
  event: "EVENT_EQUIPMENT",
  pallets: "INDUSTRIAL_SUPPLIES",
};

/* -------------------------------------------------------------------------- */
/* Preselection from other sections                                           */
/* -------------------------------------------------------------------------- */

type GoodsListener = (code: GoodsShortcutCode) => void;

/**
 * Booking cards currently mounted on the page. A module-level set rather than a
 * context provider because the landing sections are composed from CMS rows
 * (`landing-page.tsx`) and are siblings with no shared parent to hold state —
 * and the only message that ever crosses between them is "pick this shortcut".
 */
const goodsListeners = new Set<GoodsListener>();

/**
 * Registers a booking card to be told when another section picks a shortcut.
 * Returns the unsubscribe function, shaped for a `useEffect` cleanup.
 */
export function subscribeLandingGoods(listener: GoodsListener): () => void {
  goodsListeners.add(listener);

  return () => {
    goodsListeners.delete(listener);
  };
}

/**
 * Selects a shortcut in every mounted booking card. Called by the category
 * tiles, whose anchors then scroll to `#price-a-load`; with no card on the page
 * (a CMS layout without one) it is a harmless no-op.
 */
export function preselectLandingGoods(code: GoodsShortcutCode): void {
  for (const listener of goodsListeners) {
    listener(code);
  }
}
