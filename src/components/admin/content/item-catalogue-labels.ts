/**
 * Message paths for the enum values the item-catalogue editor shows, shared by
 * the page and its form dialog so the table and the pickers can never name the
 * same group or body two ways.
 *
 * Full paths, resolved with an un-namespaced `useTranslations()`. Enums are
 * imported as types only, so this stays safe in a client bundle; the `Record`
 * keys make a new enum member a typecheck failure here until it has copy.
 *
 * Group names are the editor's own (`admin.adminContentItemCatalogue.groups`)
 * rather than borrowed from the booking form: the booking side's picker is
 * still being built (task-09) and an admin screen should not break when it
 * renames a heading. Body names reuse `checkout.bodyType`, the same words the
 * client sees for a chosen body.
 */

import type { ChassisType, ItemGroup } from "@prisma/client";

export const ITEM_GROUP_LABEL_KEYS: Record<ItemGroup, string> = {
  LIVING_ROOM: "admin.adminContentItemCatalogue.groups.livingRoom",
  BEDROOM: "admin.adminContentItemCatalogue.groups.bedroom",
  KITCHEN_APPLIANCES:
    "admin.adminContentItemCatalogue.groups.kitchenAppliances",
  OFFICE: "admin.adminContentItemCatalogue.groups.office",
  BOXES_PARCELS: "admin.adminContentItemCatalogue.groups.boxesParcels",
  OUTDOOR_SPORTS: "admin.adminContentItemCatalogue.groups.outdoorSports",
  CHILLED_FOOD: "admin.adminContentItemCatalogue.groups.chilledFood",
  BUILDING_MATERIALS:
    "admin.adminContentItemCatalogue.groups.buildingMaterials",
  EVENT_EQUIPMENT: "admin.adminContentItemCatalogue.groups.eventEquipment",
};

export const CHASSIS_TYPE_LABEL_KEYS: Record<ChassisType, string> = {
  DRY_BOX: "checkout.bodyType.dryBox",
  REFRIGERATED: "checkout.bodyType.refrigerated",
  OPEN_CHASSIS: "checkout.bodyType.openChassis",
};
