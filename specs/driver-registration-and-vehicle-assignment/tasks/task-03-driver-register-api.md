# Task 03: `POST /api/logistics-company/drivers/register` — Company-Created Driver + Vehicle Assignment

## Status

pending

## Wave

2

## Description

This is the core of the feature: a new endpoint that lets a signed-in COMPANY user create a brand-new driver account (with an admin-supplied or generated temp password) and, optionally, assign one of the company's existing fleet vehicles to that driver in the same request — all in one transaction-backed call. This is a new, separate endpoint from the existing `POST /api/logistics-company/drivers` (which stays exactly as-is, for linking an *already self-registered* independent driver by email). Company-created drivers never go through `/sign-up`; their `DriverProfile.companyId` is set at creation, not linked afterward.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-05-driver-register-ui.md

**Context from dependencies:** task-01 adds `User.mustChangePassword` and the `DriverVehicleAssignment` model (`driverProfileId`, `vehicleId`, `assignedAt`, `unassignedAt`, both relations, both indexes) to the Prisma schema and runs the migration — this task's writes assume those exist. This task does not depend on task-02 (auth.ts changes): it sets `mustChangePassword` via a direct `prisma.user.update`, not through any Better Auth additional-field input path, so task-02's hook/field wiring is unrelated to this endpoint working correctly.

## Files to Create

- `src/app/api/logistics-company/drivers/register/route.ts` — the new endpoint (POST only).

## Files to Modify

None. (The existing `src/app/api/logistics-company/drivers/route.ts` is untouched — do not edit it.)

## Technical Details

### Request/response contract

`POST /api/logistics-company/drivers/register`

Request body (JSON):

```ts
{
  email: string;        // required
  firstName: string;    // required
  lastName: string;     // required
  phone: string;        // required
  city: GeorgianCity;   // required, one of the GeorgianCity enum values
  vehicleId?: string | null; // optional: id of an existing fleet Vehicle to assign now
}
```

Success response, `201`:

```ts
{
  userId: string;
  name: string;
  email: string;
  tempPassword: string;   // shown once — caller must not persist or log this
  vehicleAssigned: boolean;
}
```

Error responses: `401` (no session), `403` (not COMPANY), `400` (validation, missing company profile, duplicate email, vehicle not found/not owned/already assigned), `500` (account created but profile/assignment step failed — see Notes).

### Implementation Steps

1. Create `src/app/api/logistics-company/drivers/register/route.ts`. Mirror the auth/company-lookup preamble used by every other `logistics-company` route (see `src/app/api/logistics-company/drivers/route.ts` and `src/app/api/logistics-company/vehicles/route.ts` for the exact pattern: `auth.api.getSession`, then `session.user.role !== "COMPANY"` check, then `prisma.logisticsCompany.findUnique({ where: { userId: session.user.id } })`).

2. Validate the request body by hand (this project has no validation library — see `src/app/api/driver-profile/route.ts` for the established `nonEmptyString` + enum-membership pattern to copy). Required: `email`, `firstName`, `lastName`, `phone`, `city` (must be a valid `GeorgianCity`). Optional: `vehicleId` (string or `null`/absent).

3. Check for an existing account with that email *before* attempting to create one, so the rejection is a clear, specific message rather than whatever `auth.api.signUpEmail` throws:

   ```ts
   const existingUser = await prisma.user.findFirst({
     where: { email: { equals: email, mode: "insensitive" } },
     select: { id: true },
   });

   if (existingUser) {
     return NextResponse.json(
       { error: "An account with that email address already exists." },
       { status: 400 },
     );
   }
   ```

4. If `vehicleId` was provided, validate it belongs to this company's fleet and has no other active assignment:

   ```ts
   if (vehicleId !== null) {
     const vehicle = await prisma.vehicle.findUnique({
       where: { id: vehicleId },
       select: {
         id: true,
         companyId: true,
         assignments: {
           where: { unassignedAt: null },
           select: { id: true },
         },
       },
     });

     if (!vehicle || vehicle.companyId !== company.id) {
       return NextResponse.json(
         { error: "That vehicle was not found in your fleet." },
         { status: 400 },
       );
     }

     if (vehicle.assignments.length > 0) {
       return NextResponse.json(
         { error: "This vehicle is already assigned to another driver." },
         { status: 400 },
       );
     }
   }
   ```

5. Generate a temp password. Add this helper near the top of the file:

   ```ts
   import { randomInt } from "node:crypto";

   // Excludes visually ambiguous characters (0/O, 1/l/I) since an admin may
   // need to read this off-screen to a driver over the phone.
   const TEMP_PASSWORD_CHARSET =
     "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
   const TEMP_PASSWORD_LENGTH = 12;

   function generateTempPassword(): string {
     return Array.from(
       { length: TEMP_PASSWORD_LENGTH },
       () => TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)],
     ).join("");
   }
   ```

6. Create the `User`/`Account` through Better Auth's real sign-up logic — **not** a raw Prisma insert (see `requirements.md` Technical Constraints on why: password hashing must go through Better Auth so the credential actually works for login). Call it server-side, without forwarding the incoming request's headers, so no session cookie leaks into the admin's own browser response:

   ```ts
   import { auth } from "@/lib/auth";
   import { APIError } from "better-auth/api";

   // ...inside the handler, after validation...
   const tempPassword = generateTempPassword();

   let createdUserId: string;
   try {
     const signUpResult = await auth.api.signUpEmail({
       body: {
         email,
         name: `${firstName} ${lastName}`.trim(),
         password: tempPassword,
         role: "DRIVER",
       },
     });
     createdUserId = signUpResult.user.id;
   } catch (error) {
     if (error instanceof APIError) {
       return NextResponse.json(
         { error: error.message },
         { status: error.statusCode ?? 400 },
       );
     }
     throw error;
   }
   ```

   `error.statusCode` / the exact shape of `APIError` can vary slightly by `better-auth` version — if `pnpm typecheck` flags this, adjust to whatever the installed version's type actually exposes (check `error.status` as a fallback); the intent (surface Better Auth's own rejection message with an appropriate HTTP status) is what matters.

7. In a single Prisma transaction, mark the new user as needing a password change, create their `DriverProfile` already attached to this company, and — if a vehicle was picked — create the assignment:

   ```ts
   let driverProfile;
   try {
     driverProfile = await prisma.$transaction(async (tx) => {
       await tx.user.update({
         where: { id: createdUserId },
         data: { mustChangePassword: true },
       });

       const profile = await tx.driverProfile.create({
         data: {
           userId: createdUserId,
           companyId: company.id,
           // Company-created drivers are always individuals working the
           // company's own fleet, never a separate registered business — see
           // requirements.md Non-Goals.
           accountType: "INDIVIDUAL",
           firstName,
           lastName,
           phone,
           city,
         },
       });

       if (vehicleId !== null) {
         await tx.driverVehicleAssignment.create({
           data: { driverProfileId: profile.id, vehicleId },
         });
       }

       return profile;
     });
   } catch (error) {
     console.error(
       "Driver account was created but profile/vehicle setup failed:",
       error,
     );
     return NextResponse.json(
       {
         error:
           "The driver account was created, but finishing setup failed. Contact support before retrying with the same email.",
       },
       { status: 500 },
     );
   }
   ```

8. Return the success response:

   ```ts
   return NextResponse.json(
     {
       userId: createdUserId,
       name: `${firstName} ${lastName}`.trim(),
       email,
       tempPassword,
       vehicleAssigned: vehicleId !== null,
     },
     { status: 201 },
   );
   ```

## Acceptance Criteria

- [ ] A COMPANY session can `POST` valid driver details (no `vehicleId`) and receive a `201` with a `tempPassword`; a new `User` (role `DRIVER`, `mustChangePassword: true`), `Account` (credential, hashed `tempPassword`), and `DriverProfile` (`companyId` already set to the caller's company) exist afterward.
- [ ] The same request with a valid `vehicleId` from the caller's own fleet additionally creates a `DriverVehicleAssignment` row (`unassignedAt: null`) linking the new `DriverProfile` and that `Vehicle`.
- [ ] A `vehicleId` belonging to a different company, or a nonexistent id, is rejected with `400` and does not create anything.
- [ ] A `vehicleId` that already has an active (`unassignedAt: null`) assignment to another driver is rejected with `400` before any writes happen.
- [ ] A duplicate email is rejected with `400` and a clear message, no partial writes.
- [ ] A non-COMPANY session gets `403`; no session gets `401`.
- [ ] The driver created this way can immediately sign in (`authClient.signIn.email`) with the returned `tempPassword`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] **Manual verification (cannot be automated by this task alone):** confirm that calling this endpoint from the company dashboard, while logged in as the company, does *not* change or clear the company admin's own session/cookie. Log in as a company, call the endpoint, and confirm the admin is still logged in as themselves afterward with no unexpected sign-out or session swap. This is also tracked in `action-required.md`.

## Notes

- If the Prisma transaction in step 7 fails *after* `auth.api.signUpEmail` already succeeded, the result is a `User`/`Account` row with no `DriverProfile` — an "interrupted" account, same class of edge case the existing `/sign-up` flow already has when its own follow-up `POST /api/driver-profile` call fails (see `CompanyDashboard`'s handling of a company profile in the same state). This is surfaced as a `500` with a message telling the caller to contact support rather than silently retry-creating a duplicate, and is an accepted limitation, not a bug to solve in this task — Better Auth's own writes can't be wrapped in the same Prisma transaction as this route's own writes.
- Do not modify `src/app/api/logistics-company/drivers/route.ts` — it remains the correct path for linking an independent driver who already has their own account.
