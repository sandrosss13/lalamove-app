# Task 06: Expose vehicle body types through the vehicle-types API

## Status

complete

## Wave

2

## Description

The booking form is gaining a load-space (body) picker that filters the vehicle list to Dry Box, Refrigerated or Open Chassis. The design handoff supplies a hard-coded table of which vehicle offers which body — built on vehicle names that do not exist in this app. This task makes the filter data-driven instead: `VehicleTypeSpec.bodyTypes` travels through the public vehicle-types API to the client module that the form reads.

## Dependencies

**Depends on:** task-03-schema-and-migrations.md
**Blocks:** task-12-body-type-picker.md

**Context from dependencies:** task-03 adds `bodyTypes ChassisType[]` to `VehicleTypeSpec` and seeds it for all eleven catalogue types (`enum ChassisType { DRY_BOX REFRIGERATED OPEN_CHASSIS }` already existed at `prisma/schema.prisma:227-236`). The seeded mapping: Refrigerated Van and Refrigerated Truck carry `[REFRIGERATED, DRY_BOX]`; Flatbed Truck carries `[OPEN_CHASSIS]`; Curtainsider Truck carries `[DRY_BOX, OPEN_CHASSIS]`; every other type carries `[DRY_BOX]`. That column is the only source of truth for the filter — do not re-derive the mapping anywhere else.

## Files to Modify

- `src/app/api/vehicle-types/route.ts` — include `bodyTypes` in the selected and returned shape
- `src/components/home/order-vehicle-types.ts` — carry `bodyTypes` through the client-side type and cache

## Technical Details

### Implementation Steps

1. **Read both files first.** `src/app/api/vehicle-types/route.ts:26-56` currently selects and returns `code`, `label`, `category`, `maxPayloadKg`, `cargoLengthM`, `cargoWidthM`, `cargoHeightM`, `loadingAccessType`, `imageUrl` and a nested `pricingRule` with seven rate fields. The route is public and unauthenticated, filtered only by `visibleVehicleTypeWhere()` from `src/lib/vehicle-type-visibility.ts`.

2. Add `bodyTypes: true` to the Prisma `select` and include it in the returned object. This is purely additive — every existing field stays exactly as it is.

3. In `src/components/home/order-vehicle-types.ts`, add `bodyTypes` to the client-side vehicle type. Note this module holds a **module-level promise cache** (`:49`) — confirm the new field flows through it and that the cache is not keyed in a way that would serve a stale shape.

4. Export a small predicate the picker will use, so the filter logic lives beside the data rather than in the 1,400-line form:

   ```ts
   export function vehicleOffersBody(
     vehicle: OrderVehicleType,
     body: ChassisType,
   ): boolean {
     return vehicle.bodyTypes.includes(body);
   }
   ```

   A vehicle whose `bodyTypes` is empty offers nothing and is filtered out of every body — that is correct, not a bug, but add a comment saying so, because an unseeded type would otherwise look broken.

5. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### API Endpoints

- `GET /api/vehicle-types` — each returned vehicle type gains `bodyTypes: ChassisType[]`. All existing fields unchanged. Still public, still filtered by `visibleVehicleTypeWhere()`.

### House rules that apply to every task in this spec

- British English in comments and copy.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] `GET /api/vehicle-types` returns `bodyTypes` for every vehicle type
- [ ] Every field the route returned before is still returned, unchanged
- [ ] `order-vehicle-types.ts` exposes `bodyTypes` on its client-side type and through its module-level cache
- [ ] `vehicleOffersBody` is exported and is the only place the body predicate is expressed
- [ ] No hard-coded vehicle-name-to-body table exists anywhere in the codebase
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

The handoff's body table names `1.7 m Van`, `2.5 m Van`, `3.5 t Truck` and `7 t Truck`. **None of these vehicles exist.** The real catalogue is eleven seeded types (`prisma/seed.ts:62-302`). The handoff itself asks for the mapping to be "data-driven rather than a literal table" while supplying a literal table built on fictional vehicles — follow the instruction, not the table.
