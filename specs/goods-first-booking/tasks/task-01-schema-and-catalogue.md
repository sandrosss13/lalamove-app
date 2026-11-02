# Task 01: Item catalogue and order items — schema and catalogue migration

## Status

complete

## Wave

1

## Description

Add the tables the item list needs: `ItemCatalogEntry` (the admin-editable catalogue a client picks from) and `OrderItem` (what a client actually listed on an order, snapshotted). Add `Order.cargoVolumeM3`. Install the initial catalogue with an **insert-only** migration so admin edits made later are never overwritten.

## Dependencies

**Depends on:** none
**Blocks:** task-05, task-06, task-08

## Files to Modify

- `prisma/schema.prisma` — two enums, two models, one `Order` column, one back-relation
- `prisma/migrations/<timestamp>_goods_first_booking/migration.sql` — new (schema)
- `prisma/migrations/<timestamp+1>_seed_item_catalogue/migration.sql` — new (data, insert-only)

## Technical Details

### Implementation Steps

1. **Read `prisma/schema.prisma` around `VehicleTypeSpec` (~`:433`) and `Order` (~`:910`) first.** Match the doc-comment density: every new field gets a `///` comment saying what it is and why it is nullable or not.

2. **Enums:**

   ```prisma
   enum ItemGroup {
     LIVING_ROOM
     BEDROOM
     KITCHEN_APPLIANCES
     OFFICE
     BOXES_PARCELS
     OUTDOOR_SPORTS
     CHILLED_FOOD
     BUILDING_MATERIALS
     EVENT_EQUIPMENT
   }

   enum OrderItemKind {
     CATALOGUE
     CUSTOM
     PALLET
   }
   ```

3. **`ItemCatalogEntry`:**

   | Field | Type | Notes |
   |---|---|---|
   | `id` | `String @id @default(cuid())` | |
   | `code` | `String @unique` | Stable key, `UPPER_SNAKE`. Never reused. |
   | `group` | `ItemGroup` | |
   | `labelEn`, `labelKa` | `String` | DB-held because admins edit them |
   | `synonymsEn`, `synonymsKa` | `String[] @default([])` | Search terms |
   | `weightKg` | `Float` | Typical unit weight |
   | `lengthM`, `widthM`, `heightM` | `Float` | Typical packed size. Store with length ≥ width. |
   | `stackable` | `Boolean @default(true)` | `false` ⇒ counts towards floor area |
   | `needsTwoPeople` | `Boolean @default(false)` | Drives the crew hint |
   | `requiredBody` | `ChassisType?` | Set only where the body is truly forced (chilled goods, forklift-loaded bulk) |
   | `handlingTags` | `CargoHandlingTag[] @default([])` | Pre-selected in step 6 |
   | `cargoCategory` | `CargoCategory` | Feeds the derived order category |
   | `sortOrder` | `Int @default(0)` | Order within a group |
   | `active` | `Boolean @default(true)` | Deactivate, never delete |
   | `createdAt`, `updatedAt` | | |

   `@@index([group, active, sortOrder])`.

4. **`OrderItem`:** a snapshot of one listed line.

   | Field | Type | Notes |
   |---|---|---|
   | `id` | cuid | |
   | `orderId` | `String` | relation, `onDelete: Cascade` |
   | `kind` | `OrderItemKind` | |
   | `catalogEntryId` | `String?` | relation, `onDelete: SetNull`. Null for CUSTOM and PALLET. |
   | `label` | `String` | Snapshot, in the client's locale at booking |
   | `quantity` | `Int` | 1–99 (pallets 1–33) |
   | `unitWeightKg`, `lengthM`, `widthM`, `heightM` | `Float` | Snapshot of the figures the plan was computed from |
   | `stackable` | `Boolean` | Snapshot |
   | `palletType` | `String?` | `EUR` / `INDUSTRIAL` for PALLET lines |

   `@@index([orderId])`, `@@index([catalogEntryId])` (the second because of `SetNull`, same reasoning as `Order.savedCardId`).

   Explain in the doc comment why it is a snapshot: catalogue figures will be tuned, and a completed order must still show what it was planned from.

5. **`Order`:** add `items OrderItem[]` and

   ```prisma
   /// Sum of the listed items' volumes (unit L×W×H × quantity), before any packing
   /// factor. Null for orders placed before the item list existed.
   cargoVolumeM3 Float?
   ```

   Update the doc comment above `cargoWeightKg`. From this feature on, the four cargo columns are **derived server-side from `OrderItem` rows**, not typed by the client. Older orders still hold typed values.

6. Generate the schema migration with `pnpm prisma migrate dev --create-only --name goods_first_booking` and review the SQL.

7. **Catalogue data migration.** Create a second migration by hand. It is plain `INSERT … ON CONFLICT (code) DO NOTHING` so it is a no-op on a database where admins have already edited rows. Generate ids with `gen_random_uuid()::text` or a fixed cuid-shaped literal; check what earlier data migrations in `prisma/migrations` did (e.g. `20260904090000_backfill_vehicle_body_types`) and match that. **Do not add these rows to `prisma/seed.ts`'s upsert path.** See `specs/client-dashboard-booking-and-payment/action-required.md` for why. If local dev needs them, the migration already provides them.

   Seed the rows below. `labelKa` and synonyms are first drafts; mark them for native review (action-required). Dimensions are L × W × H in metres. Tags: `F` FRAGILE, `U` UPRIGHT_ONLY, `H` HEAVY_ITEM, `C` COLD_CHAIN. "NS" = not stackable, "2P" = needs two people.

   **LIVING_ROOM** (cargo `FURNITURE_FURNISHINGS` unless noted)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | SOFA_2_SEAT | Sofa, 2-seat | 45 | 1.6×0.9×0.85 | NS 2P |
   | SOFA_3_SEAT | Sofa, 3-seat | 60 | 2.1×0.95×0.85 | NS 2P |
   | CORNER_SOFA | Corner sofa | 110 | 2.6×1.0×0.85 | NS 2P |
   | ARMCHAIR | Armchair | 25 | 0.9×0.85×0.9 | NS |
   | COFFEE_TABLE | Coffee table | 15 | 1.1×0.6×0.45 | |
   | TV_UNIT | TV unit | 35 | 1.6×0.45×0.5 | |
   | TV_UP_TO_55 | TV (up to 55") | 18 | 1.3×0.2×0.8 | NS F U · cargo `APPLIANCES` |
   | BOOKCASE | Bookcase (carried lying down) | 40 | 1.9×0.35×0.9 | 2P |
   | DINING_TABLE | Dining table | 40 | 1.6×0.9×0.75 | NS 2P |
   | DINING_CHAIR | Dining chair | 6 | 0.5×0.5×0.9 | |
   | RUG_ROLLED | Rug (rolled) | 15 | 2.0×0.3×0.3 | |
   | PIANO_UPRIGHT | Upright piano | 230 | 1.5×0.6×1.3 | NS 2P U H |

   **BEDROOM** (`FURNITURE_FURNISHINGS`)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | BED_DOUBLE_FRAME | Double bed frame (dismantled) | 50 | 2.1×1.0×0.3 | 2P |
   | MATTRESS_DOUBLE | Mattress, double | 30 | 2.0×1.6×0.25 | 2P |
   | MATTRESS_SINGLE | Mattress, single | 18 | 2.0×0.9×0.2 | |
   | WARDROBE_2_DOOR | Wardrobe, 2-door (lying down) | 80 | 2.0×1.0×0.6 | NS 2P |
   | WARDROBE_3_DOOR | Wardrobe, 3-door (dismantled) | 120 | 2.1×0.6×0.5 | 2P H |
   | CHEST_OF_DRAWERS | Chest of drawers | 40 | 0.9×0.5×1.0 | |
   | BEDSIDE_TABLE | Bedside table | 10 | 0.5×0.4×0.6 | |
   | COT | Cot | 20 | 1.3×0.7×0.9 | NS |

   **KITCHEN_APPLIANCES** (`APPLIANCES`)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | FRIDGE_SINGLE | Fridge, single door | 60 | 0.7×0.65×1.7 | NS 2P U |
   | FRIDGE_DOUBLE | Fridge, double door | 110 | 0.9×0.75×1.8 | NS 2P U H |
   | FREEZER_CHEST | Chest freezer | 45 | 1.1×0.65×0.85 | NS |
   | WASHING_MACHINE | Washing machine | 70 | 0.6×0.6×0.85 | NS 2P H |
   | DISHWASHER | Dishwasher | 45 | 0.6×0.6×0.85 | NS |
   | COOKER | Cooker / oven | 50 | 0.6×0.6×0.9 | NS 2P |
   | MICROWAVE | Microwave | 12 | 0.5×0.4×0.3 | F |
   | AIR_CONDITIONER | Air conditioner (split, both units) | 45 | 0.9×0.4×0.7 | NS F |

   **OFFICE** (`FURNITURE_FURNISHINGS` unless noted)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | DESK | Desk | 35 | 1.4×0.7×0.75 | NS |
   | OFFICE_CHAIR | Office chair | 15 | 0.7×0.7×1.1 | NS |
   | FILING_CABINET | Filing cabinet | 40 | 0.6×0.5×1.3 | |
   | COMPUTER_SET | Computer and monitor | 15 | 0.6×0.5×0.5 | F · `APPLIANCES` |
   | PRINTER_LARGE | Office printer / copier | 60 | 0.8×0.7×1.1 | NS F 2P · `APPLIANCES` |
   | SAFE_SMALL | Safe (small) | 80 | 0.6×0.5×0.5 | 2P H |

   **BOXES_PARCELS** (`RETAIL_STOCK`)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | BOX_SMALL | Box, small | 8 | 0.4×0.3×0.3 | |
   | BOX_MEDIUM | Box, medium | 15 | 0.5×0.4×0.4 | |
   | BOX_LARGE | Box, large | 20 | 0.6×0.5×0.5 | |
   | SUITCASE | Suitcase | 20 | 0.75×0.5×0.3 | |
   | BAG_SACK | Bag or sack | 10 | 0.7×0.4×0.3 | |

   **OUTDOOR_SPORTS** (`FURNITURE_FURNISHINGS`)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | BICYCLE | Bicycle | 15 | 1.8×0.6×1.1 | NS |
   | GARDEN_SET | Garden table and chairs | 40 | 1.5×0.9×0.75 | NS |
   | BBQ | Barbecue | 25 | 1.0×0.6×1.0 | NS |

   **CHILLED_FOOD** (`RETAIL_STOCK`, `requiredBody REFRIGERATED`, tag C)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | CHILLED_CRATE | Chilled crate | 15 | 0.6×0.4×0.3 | C |
   | CHILLED_BOX_LARGE | Chilled box, large | 25 | 0.6×0.4×0.4 | C |
   | FROZEN_BOX | Frozen goods box | 20 | 0.6×0.4×0.3 | C |

   **BUILDING_MATERIALS** (`CONSTRUCTION_MATERIALS` unless noted)

   Small DIY items (paint, tiles, plasterboard packs, doors, windows) are deliberately `RETAIL_STOCK`. `CONSTRUCTION_MATERIALS` is heavy-only (`src/lib/cargo.ts:63-74`), and the order takes the most restrictive category. One paint bucket in a home move must not force a Box Truck. Bulk materials (cement, timber, rebar, sand, blocks) keep `CONSTRUCTION_MATERIALS`. Ops signs this split off (action-required).
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | CEMENT_BAG_25 | Cement bag, 25 kg | 25 | 0.6×0.4×0.12 | |
   | CEMENT_BAG_50 | Cement bag, 50 kg | 50 | 0.7×0.45×0.15 | |
   | PLASTERBOARD | Plasterboard sheets (pack of 5) | 125 | 2.5×1.2×0.1 | · `RETAIL_STOCK` |
   | TILES_BOX | Box of tiles | 25 | 0.6×0.6×0.1 | F · `RETAIL_STOCK` |
   | PAINT_BUCKET | Paint bucket | 15 | 0.35×0.35×0.4 | · `RETAIL_STOCK` |
   | DOOR | Door | 30 | 2.1×0.9×0.1 | · `RETAIL_STOCK` |
   | WINDOW_FRAME | Window frame | 40 | 1.5×1.5×0.1 | F U · `RETAIL_STOCK` |
   | TIMBER_LENGTH | Timber length (up to 6 m) | 15 | 6.0×0.15×0.1 | |
   | REBAR_BUNDLE | Rebar bundle (6 m) | 100 | 6.0×0.2×0.2 | H · `requiredBody OPEN_CHASSIS` |
   | SAND_BULK_BAG | Bulk bag of sand / gravel | 1000 | 1.0×1.0×1.0 | NS H · `requiredBody OPEN_CHASSIS` |
   | BLOCKS_PALLET | Pallet of blocks / bricks | 1000 | 1.2×1.0×1.0 | NS H · `requiredBody OPEN_CHASSIS` |

   **EVENT_EQUIPMENT** (`EVENT_EQUIPMENT`)
   | code | label | kg | L×W×H | flags |
   |---|---|---|---|---|
   | FOLDING_TABLE | Folding table | 15 | 1.8×0.75×0.1 | |
   | FOLDING_CHAIR | Folding chair | 4 | 0.9×0.45×0.1 | |
   | PA_SPEAKER | PA speaker | 30 | 0.5×0.5×0.8 | F |
   | STAGE_DECK | Stage deck panel | 40 | 2.0×1.0×0.2 | 2P |
   | GAZEBO | Gazebo / tent (packed) | 30 | 1.5×0.3×0.3 | |

   `sortOrder` follows the row order above in steps of 10.

   **Orientation and bounds rules for every row**, including rows admins add later (task-08 enforces them):
   - Dimensions are the item **as transported**, and the fit check never rotates (`booking-fit.ts`). Wardrobes and bookcases therefore go lying down or dismantled. Upright-only items (fridges, TVs, window frames, piano) carry `U` and their standing height. The tallest medium-duty class is `CLOSED_BOX_VAN` at 1.8 m (`prisma/seed.ts:149`), so both fridges fit only that van or a truck. That is realistic and intended.
   - Every figure must sit inside `CARGO_MEASUREMENT_BOUNDS` (`src/lib/cargo.ts:162`). Minimum dimension 0.1 m, so thin items use 0.1 and slightly overstate volume.

8. Apply both migrations locally (`pnpm prisma migrate dev`). Confirm `select count(*) from "ItemCatalogEntry"` matches the row count. Re-run the data migration's SQL by hand to confirm it is a no-op the second time.

9. `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Acceptance Criteria

- [ ] `ItemGroup`, `OrderItemKind`, `ItemCatalogEntry`, `OrderItem` and `Order.cargoVolumeM3` exist, with doc comments
- [ ] `OrderItem` cascades with its order and nulls its catalogue reference on entry deletion
- [ ] The data migration is insert-only and idempotent
- [ ] `prisma/seed.ts` is unchanged
- [ ] lint, typecheck and build pass
