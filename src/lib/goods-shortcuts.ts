/**
 * Goods shortcuts: the entry points into the item list, shared by the landing
 * page and step 3 of the booking form. A shortcut opens a catalogue group (and,
 * for pallets, a mode); it never fixes the order's cargo category, which is
 * derived from the items.
 *
 * This is the one table of shortcuts; no other file should list them. The Prisma
 * enums are mirrored as string-literal unions rather than imported, to keep
 * `@prisma/client` out of the browser bundle (same reasoning as
 * `account-types.ts`).
 */

import {
  Boxes,
  HardHat,
  PartyPopper,
  Package,
  Snowflake,
  Sofa,
  Tv,
  type LucideIcon,
} from "lucide-react";

import type { AccountType } from "@/lib/account-types";

/** Mirrors the `ItemGroup` Prisma enum. */
export type ItemGroupCode =
  | "LIVING_ROOM"
  | "BEDROOM"
  | "KITCHEN_APPLIANCES"
  | "OFFICE"
  | "BOXES_PARCELS"
  | "OUTDOOR_SPORTS"
  | "CHILLED_FOOD"
  | "BUILDING_MATERIALS"
  | "EVENT_EQUIPMENT";

/** What the picker opens: the item catalogue, or the pallet entry mode. */
export type GoodsShortcutMode = "items" | "pallets";

export type GoodsShortcut = {
  /** URL slug, validated from the `?goods=` param. */
  code: string;
  /** Group to open; null for pallets, which has no catalogue group. */
  group: ItemGroupCode | null;
  mode: GoodsShortcutMode;
  /** "business" hides the shortcut from individual accounts. */
  audience: "all" | "business";
  Icon: LucideIcon;
};

/**
 * Titles and descriptions live in the `goodsShortcut.<code>.title|description`
 * catalogue keys, resolved by the component (this module cannot call
 * `useTranslations`).
 */
export const GOODS_SHORTCUTS = [
  {
    code: "furniture",
    group: "LIVING_ROOM",
    mode: "items",
    audience: "all",
    Icon: Sofa,
  },
  {
    code: "appliances",
    group: "KITCHEN_APPLIANCES",
    mode: "items",
    audience: "all",
    Icon: Tv,
  },
  {
    code: "boxes",
    group: "BOXES_PARCELS",
    mode: "items",
    audience: "all",
    Icon: Boxes,
  },
  {
    code: "chilled",
    group: "CHILLED_FOOD",
    mode: "items",
    audience: "all",
    Icon: Snowflake,
  },
  {
    code: "building",
    group: "BUILDING_MATERIALS",
    mode: "items",
    audience: "all",
    Icon: HardHat,
  },
  {
    code: "event",
    group: "EVENT_EQUIPMENT",
    mode: "items",
    audience: "all",
    Icon: PartyPopper,
  },
  {
    code: "pallets",
    group: null,
    mode: "pallets",
    audience: "business",
    Icon: Package,
  },
] as const satisfies readonly GoodsShortcut[];

export type GoodsShortcutCode = (typeof GOODS_SHORTCUTS)[number]["code"];

export function isGoodsShortcutCode(value: string): value is GoodsShortcutCode {
  return GOODS_SHORTCUTS.some((s) => s.code === value);
}

/** Shortcuts visible to an account type; pallets are business-only. */
export function shortcutsFor(
  accountType: AccountType | null | undefined,
): readonly GoodsShortcut[] {
  return GOODS_SHORTCUTS.filter(
    (s) => s.audience === "all" || accountType === "BUSINESS",
  );
}
