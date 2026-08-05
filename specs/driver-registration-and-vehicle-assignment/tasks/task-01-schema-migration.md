# Task 01: Prisma Schema Migration — Persistent Assignment + Forced Password Change

## Status

complete

## Wave

1

## Description

This feature needs two additions to the data model that don't exist today: (1) a way to record that a specific driver has a specific fleet vehicle assigned to them persistently — separate from the existing per-order `Order.driverId`/`Order.vehicleId`, which only pairs a driver and vehicle for the duration of one delivery — and (2) a flag on `User` marking that an admin-set temporary password must be changed before the account can be used normally. This task adds both to `prisma/schema.prisma` and generates the migration. Every other task in this feature depends on these columns/tables existing.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-02-auth-config.md, task-03-driver-register-api.md

**Context from dependencies:** None — this is the first task.

## Files to Modify

- `prisma/schema.prisma` — add `User.mustChangePassword`, add the new `DriverVehicleAssignment` model, add the corresponding relation fields on `DriverProfile` and `Vehicle`.

## Files to Create

- `prisma/migrations/<timestamp>_add_driver_vehicle_assignment/migration.sql` — generated automatically by `prisma migrate dev`, do not hand-write it.

## Technical Details

### Implementation Steps

1. Open `prisma/schema.prisma`.
2. On the `User` model, add a `mustChangePassword` field. Place it near the other Better Auth core fields (after `emailVerified` is a reasonable spot):

   ```prisma
   model User {
     id                 String    @id
     name               String
     email              String
     emailVerified      Boolean   @default(false)
     // True only for accounts a company admin created with a temp password
     // (see DriverProfile/company registration flow). The app layer redirects
     // to /change-password while this is true; cleared once the driver
     // successfully changes their password. Better Auth has no built-in
     // "force password change" primitive, so this is a custom field.
     mustChangePassword Boolean   @default(false)
     image              String?
     createdAt          DateTime  @default(now())
     updatedAt          DateTime  @updatedAt
     role               UserRole  @default(CLIENT)
     sessions           Session[]
     accounts           Account[]

     driverProfile    DriverProfile?
     clientProfile    ClientProfile?
     logisticsCompany LogisticsCompany?
     orders           Order[]           @relation("ClientOrders")
     deliveries       Order[]           @relation("DriverDeliveries")

     @@unique([email])
     @@map("user")
   }
   ```

   Only the `mustChangePassword` line and its comment are new — every other field on `User` is unchanged, reproduced above only so the insertion point is unambiguous.

3. Add a `DriverVehicleAssignment` model. Put it directly after the `Vehicle` model in the file, since it references both `DriverProfile` and `Vehicle`:

   ```prisma
   /// Persistent driver↔vehicle pairing, distinct from `Order.driverId`/
   /// `Order.vehicleId` which only pair the two for a single delivery. Created
   /// when a company admin assigns a fleet vehicle to a driver (at registration
   /// or later). A join table rather than a bare FK on `DriverProfile` so
   /// reassignment keeps history: `unassignedAt` is set instead of the row being
   /// deleted. At most one row per vehicle should have `unassignedAt: null` at a
   /// time — enforced at the API layer, not by a DB constraint, matching how
   /// `Vehicle`'s single-owner rule is partly enforced at the API layer too.
   model DriverVehicleAssignment {
     id              String        @id @default(cuid())
     driverProfileId String
     driverProfile   DriverProfile @relation(fields: [driverProfileId], references: [id], onDelete: Cascade)
     vehicleId       String
     vehicle         Vehicle       @relation(fields: [vehicleId], references: [id], onDelete: Cascade)
     assignedAt      DateTime      @default(now())
     unassignedAt    DateTime?

     @@index([driverProfileId])
     @@index([vehicleId])
   }
   ```

4. Add the back-relation on `DriverProfile` (inside the existing model, alongside the existing `vehicles Vehicle[]` line):

   ```prisma
   model DriverProfile {
     // ...existing fields unchanged...
     vehicles    Vehicle[]
     assignments DriverVehicleAssignment[]

     @@index([companyId])
   }
   ```

5. Add the back-relation on `Vehicle` (inside the existing model, alongside the existing `orders Order[]` line):

   ```prisma
   model Vehicle {
     // ...existing fields unchanged...
     orders      Order[]
     assignments DriverVehicleAssignment[]

     @@index([driverProfileId])
     @@index([companyId])
   }
   ```

6. Generate and apply the migration against the dev database:

   ```
   pnpm prisma migrate dev --name add_driver_vehicle_assignment
   ```

   This requires a reachable `DATABASE_URL` (already required for local dev in this project — no new env var is introduced).

7. Confirm the Prisma client regenerates cleanly (`migrate dev` does this automatically; if it doesn't for any reason, run `pnpm prisma generate`).

## Acceptance Criteria

- [ ] `prisma/schema.prisma` has `User.mustChangePassword Boolean @default(false)`.
- [ ] `prisma/schema.prisma` has the new `DriverVehicleAssignment` model with `driverProfileId`, `vehicleId`, `assignedAt`, `unassignedAt`, and both relations, plus indexes on `driverProfileId` and `vehicleId`.
- [ ] `DriverProfile` and `Vehicle` each have a new `assignments DriverVehicleAssignment[]` relation field.
- [ ] `pnpm prisma migrate dev --name add_driver_vehicle_assignment` runs successfully and produces a new folder under `prisma/migrations/`.
- [ ] `pnpm typecheck` passes (the generated Prisma client types include the new field/model).

## Notes

- Do not add a DB-level CHECK constraint enforcing "at most one active assignment per vehicle" — the existing `Vehicle.vehicle_single_owner_check` XOR constraint is the only hand-written SQL constraint in this schema, added for a stronger single-ownership guarantee; the one-active-assignment rule is a softer business rule enforced in the API route (task-03), consistent with how other business rules in this codebase (e.g. "driver must not already belong to a company") are API-layer checks rather than DB constraints.
- No data migration/backfill is needed — both new columns are additive and default-safe (`mustChangePassword` defaults `false`, `DriverVehicleAssignment` starts empty).
