/**
 * Presentation for the booking page's "what are you moving" card grid: one card
 * per `CargoCategory`, with the icon and subtext a picker needs on top of the
 * label the taxonomy already owns.
 *
 * Labels are not restated here — they come from `CARGO_CATEGORY_LABELS`, which
 * stays the single source of the wording. Like that module, the Prisma enum is
 * imported as a *type* only (erased at compile time), so a client component can
 * import this without pulling `@prisma/client`'s runtime into the browser
 * bundle. The `Record` keys keep the table exhaustive: adding an enum member
 * fails typecheck until it is given an icon and a description here.
 */

import {
  Boxes,
  Factory,
  HardHat,
  House,
  PartyPopper,
  Refrigerator,
  Sofa,
  type LucideIcon,
} from "lucide-react";

import type { CargoCategory } from "@prisma/client";

import { CARGO_CATEGORY_LABELS } from "@/lib/cargo";

/**
 * A key under the `home.orderCargoOptions` catalog namespace. Stored in place of
 * the English subtext because this is a plain module, not a component: it cannot
 * call `useTranslations`, so the card that renders the option resolves the key
 * against the active locale instead.
 */
export type CargoOptionDescriptionKey =
  | "sofasBedsWardrobes"
  | "fridgesWashersOfficeKit"
  | "palletsCartonsShopFitOut"
  | "stagingBoothsAvGear"
  | "aWholeHomeOrOffice"
  | "machineryPartsBulkGoods"
  | "timberCementFixings";

export type CargoOption = {
  category: CargoCategory;
  label: string;
  descriptionKey: CargoOptionDescriptionKey;
  Icon: LucideIcon;
};

/**
 * The card-only half of each option. Split from the option list so the labels
 * can be read off the taxonomy rather than copied, while this table still gets
 * the exhaustiveness check a `Record<CargoCategory, …>` gives.
 */
const CARGO_CATEGORY_CARDS: Record<
  CargoCategory,
  { descriptionKey: CargoOptionDescriptionKey; Icon: LucideIcon }
> = {
  FURNITURE_FURNISHINGS: {
    descriptionKey: "sofasBedsWardrobes",
    Icon: Sofa,
  },
  APPLIANCES: {
    descriptionKey: "fridgesWashersOfficeKit",
    Icon: Refrigerator,
  },
  RETAIL_STOCK: {
    descriptionKey: "palletsCartonsShopFitOut",
    Icon: Boxes,
  },
  EVENT_EQUIPMENT: {
    descriptionKey: "stagingBoothsAvGear",
    Icon: PartyPopper,
  },
  FULL_RELOCATION: {
    descriptionKey: "aWholeHomeOrOffice",
    Icon: House,
  },
  INDUSTRIAL_SUPPLIES: {
    descriptionKey: "machineryPartsBulkGoods",
    Icon: Factory,
  },
  CONSTRUCTION_MATERIALS: {
    descriptionKey: "timberCementFixings",
    Icon: HardHat,
  },
};

/**
 * Every cargo category as a pickable card, in the enum's declaration order —
 * which is the order `CARGO_CATEGORY_LABELS` is written in, so the picker and
 * the taxonomy can never drift out of sync.
 *
 * `Object.entries` widens keys to `string`, hence the assertion: the object is a
 * `Record<CargoCategory, string>`, so every key is a `CargoCategory` by
 * construction.
 */
export const CARGO_OPTIONS: CargoOption[] = (
  Object.entries(CARGO_CATEGORY_LABELS) as [CargoCategory, string][]
).map(([category, label]) => ({
  category,
  label,
  ...CARGO_CATEGORY_CARDS[category],
}));
