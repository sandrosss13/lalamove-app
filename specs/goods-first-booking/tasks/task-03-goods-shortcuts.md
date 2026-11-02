# Task 03: Goods shortcuts — the table, icons and copy

## Status

complete

## Wave

1

## Description

Define the goods shortcuts once. They are shared by the landing page (task-07) and step 3 of the booking form (task-10). A shortcut is an **entry point into the item list**: it opens a catalogue group and, for some, a mode. It never fixes the order's cargo category; that is derived from the items (requirements §Assumptions).

## Dependencies

**Depends on:** none
**Blocks:** task-04, task-07, task-09

## Files to Modify

- `src/lib/goods-shortcuts.ts` — new, client-safe
- `src/messages/en/common.json`, `src/messages/ka/common.json` — `goodsShortcut.*` keys

## Technical Details

### Implementation Steps

1. **Read** `src/components/home/order-cargo-options.ts` (how `CARGO_OPTIONS` pairs a key, a description key and a lucide icon) and `src/components/landing/landing-category-tiles.tsx`. Match the icon library and naming.

2. **Table:**

   | code (URL slug) | Opens group | Mode | Audience | Title | Description |
   |---|---|---|---|---|---|
   | `moving-home` | `LIVING_ROOM` | items | all | Moving home | Furniture, appliances and boxes |
   | `furniture` | `LIVING_ROOM` | items | all | Furniture | Sofas, beds, wardrobes, tables |
   | `appliances` | `KITCHEN_APPLIANCES` | items | all | Appliances | Fridges, washing machines, TVs |
   | `boxes` | `BOXES_PARCELS` | items | all | Boxes and parcels | Boxes, suitcases, bags |
   | `chilled` | `CHILLED_FOOD` | items | all | Chilled and frozen | Food that must stay cold |
   | `building` | `BUILDING_MATERIALS` | items | all | Building materials | Cement, boards, tiles, timber |
   | `event` | `EVENT_EQUIPMENT` | items | all | Event equipment | Tables, staging, sound |
   | `pallets` | — | pallets | business | Pallets | EUR or industrial pallets |

   `moving-home` also expands every group in the picker rather than filtering to one (task-09 reads a flag for this).

   Export `GOODS_SHORTCUTS`, `type GoodsShortcutCode`, `isGoodsShortcutCode(value: string)` (used to validate the `?goods=` param) and `shortcutsFor(accountType)`, which hides `pallets` from individuals.

3. Copy keys under `common.goodsShortcut.<code>.title|description`. Georgian is a first draft; add to the action-required review.

4. `pnpm lint`, `pnpm typecheck`, `pnpm test tests/i18n-catalogs.spec.ts`.

## Acceptance Criteria

- [ ] One exported table; no other file lists shortcuts
- [ ] `pallets` is business-only via `shortcutsFor`
- [ ] en and ka keys match; the i18n spec passes
