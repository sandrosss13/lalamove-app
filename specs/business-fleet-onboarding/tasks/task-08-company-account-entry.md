# Task 08: Company Account Entry — Restore Sign-Up and Sign-In for Logistics Companies

## Status

pending

## Wave

2

## Description

The COMPANY role currently has no way into the application. `src/components/auth/sign-up-form.tsx` and `sign-in-form.tsx` both declare `type Role = "CLIENT" | "DRIVER"` — the company cards were removed in `002d46a` and `65203b1` — while `src/app/dashboard/page.tsx` still branches on `COMPANY` and the entire `company-ops-dashboard` feature sits behind that branch, unreachable. Nothing can sign up as a company and nothing can sign in as one, so the fleet wizard this feature builds would have no door.

This task restores the door. The sign-up wizard's existing **Business** account-type card, chosen under the Driver role on the merchant host, stops creating a `DRIVER` account with `DriverProfile.accountType = BUSINESS` and instead creates a `COMPANY` account with a `LogisticsCompany` row. The sign-in form learns COMPANY as a portal again so a company can get back in. A newly created company lands on `/dashboard`, which `task-21` routes onward into the wizard or the status screen.

## Dependencies

**Depends on:** task-01-schema-migration.md
**Blocks:** task-21-dispatch-gate-and-redirect.md

**Context from dependencies:**

`task-01` adds all of the following to `prisma/schema.prisma` in one migration. This task writes only the four fields the sign-up form collects; the other six are filled in later by step 1 of the wizard (`task-06` / `task-10`):

*`LogisticsCompany` gains seven columns* — five nullable detail columns, a `GeorgianCity[]` array and an activation timestamp — plus the back-relation to its application. They are nullable precisely so this task can create the row from the sign-up form before the wizard has run:

```prisma
registeredAddress String?
bankAccountIban   String?
contactName       String?
contactRole       String?
contactEmail      String?
/// Every city this fleet picks up in. A Postgres enum array rather than a join
/// table, following `DriverLicence.categories`.
citiesOfOperation GeorgianCity[]
/// Set when an admin activates the fleet (company verified AND at least one
/// vehicle approved). Null means "cannot dispatch" — enforced server-side in
/// task-21, not just hidden in the UI. Pre-existing companies are grandfathered
/// to a non-null value by the migration.
activatedAt       DateTime?

application       BusinessApplication?
```

Its existing columns are untouched: `id`, `userId @unique` (**1:1 with `User` — one login per company**, which is why multi-user company accounts are an explicit non-goal), `companyName`, `vatId`, `phone @unique`, `city GeorgianCity`, `drivers`, `vehicles`, `orders`.

*New `VehicleClass` enum and `Vehicle.vehicleClass`:*

```prisma
enum VehicleClass {
  SMALL_VAN
  LARGE_VAN
  MEDIUM_TRUCK
  HEAVY_FREIGHT_TRUCK
  TRAILER_TRUCK
}

// on Vehicle:
vehicleClass       VehicleClass?                 // nullable, and deliberately never backfilled
/// Singular, because `BusinessApplicationVehicle.vehicleId` is `@unique`.
applicationVehicle BusinessApplicationVehicle?
```

*Application models:*

```prisma
enum BusinessApplicationStatus        { DRAFT PENDING ACTION_REQUIRED APPROVED }
enum CompanyReviewStatus              { PENDING VERIFIED FLAGGED }
enum BusinessApplicationVehicleStatus { PENDING APPROVED FLAGGED }

model BusinessApplication {
  id        String           @id @default(cuid())
  companyId String           @unique
  company   LogisticsCompany @relation(fields: [companyId], references: [id], onDelete: Cascade)

  reference String                    @unique          // "BIZ-40219" — prefix + 5 random digits
  status    BusinessApplicationStatus @default(DRAFT)

  draft          Json?
  draftStep      Int       @default(1)
  draftUpdatedAt DateTime?

  companyReviewStatus CompanyReviewStatus @default(PENDING)
  /// Set only when `companyReviewStatus` is FLAGGED; cleared on resubmission.
  companyFlagReason   String?

  firstSubmittedAt DateTime?
  lastSubmittedAt  DateTime?
  submissionCount  Int       @default(0)

  vehicles  BusinessApplicationVehicle[]
  createdAt DateTime                     @default(now())
  updatedAt DateTime                     @updatedAt

  @@index([status])
}

model BusinessApplicationVehicle {
  id                    String              @id @default(cuid())
  businessApplicationId String
  businessApplication   BusinessApplication @relation(fields: [businessApplicationId], references: [id], onDelete: Cascade)
  /// Nullable + SetNull: a company can remove a vehicle from its own fleet at
  /// any time through an existing, unrelated flow, and the review row must
  /// survive so the admin drawer can render "vehicle no longer on file".
  vehicleId             String?             @unique
  vehicle               Vehicle?            @relation(fields: [vehicleId], references: [id], onDelete: SetNull)

  /// Denormalised at submit so the queue, drawer and dispatch gate can read the
  /// declared class and body without a join a null `vehicleId` would break.
  vehicleClass VehicleClass
  chassisType  ChassisType

  status     BusinessApplicationVehicleStatus @default(PENDING)
  /// Set only when `status` is FLAGGED; cleared when the vehicle is corrected.
  flagReason String?
  decidedAt  DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([businessApplicationId])
}
```

There is **no `position` column**. A vehicle's 1-based row number is derived from `createdAt` ordering, not stored. There is **no compound `@@unique([businessApplicationId, vehicleId])`** either — `vehicleId @unique` covers it, and it is what lets the submit endpoint upsert per vehicle on a resubmission and preserve an existing `APPROVED` verdict instead of creating a second row.

*Two hand-appended partial unique indexes* closing the `DriverVehicleAssignment` exclusivity race:

```sql
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_vehicle_unique"
  ON "DriverVehicleAssignment"("vehicleId") WHERE "unassignedAt" IS NULL;
CREATE UNIQUE INDEX "driver_vehicle_assignment_live_driver_unique"
  ON "DriverVehicleAssignment"("driverProfileId") WHERE "unassignedAt" IS NULL;
```

Pre-existing and unchanged: `User.role` is `UserRole { CLIENT DRIVER COMPANY ADMIN }`; the Better Auth `role` additional field is `input: true`, so a sign-up body may set `COMPANY` directly. `POST /api/logistics-company` is an **upsert keyed on `userId`** returning **201**, and it requires exactly `companyName`, `vatId`, `phone` and `city`. `task-06` adds six *optional* fields to the same route — they are validated when sent and are not required to create the row, so **this form's four-field POST is a valid, complete request** (see section 5). `ACCOUNT_TYPE_LABELS` / `AccountType` live in `src/lib/account-types.ts` and are shared by both forms so their wording cannot drift.

## Files to Modify

- `src/components/auth/sign-up-form.tsx` — resolve the Driver + Business combination to a COMPANY account and a `POST /api/logistics-company`.
- `src/components/auth/sign-in-form.tsx` — admit COMPANY as a resolvable portal and fix the mismatch messaging that currently says a company cannot sign in at all.
- `src/lib/auth.ts` — **verify only.** See section 3; no change is expected.

## Technical Details

### 1. The shape: keep two role cards, treat Business as the company branch

Three shapes were considered. **Adopt the second.**

- *A third step-1 card ("Logistics Company") alongside Client and Driver.* Rejected: it duplicates the Business account-type card that already exists one step later, and it makes step 2 nonsensical for the new card (a company has no Individual / Individual Entrepreneur / Business choice to make). It also breaks the deliberate step-for-step symmetry between the sign-up and sign-in wizards.
- **A derived role: the Driver card plus the Business account type resolves to COMPANY.** Adopted. This *is* the existing user journey — someone registering a haulage business already picks Driver → Business today — so no returning user has to learn a new path, and the account-type step keeps meaning what it means for every other role. It also needs no new card, no new heading vocabulary at step 1, and no change to the client host (whose Driver card is an `<a>` across to the merchant host, not a role this form can create).
- *A separate `/sign-up/company` route.* Rejected: two sign-up surfaces to keep in step, and the host-split guard logic in `auth.ts` would need duplicating.

So the picked card stays `"CLIENT" | "DRIVER"`, and the role actually sent to Better Auth is derived from the card **and** the account type.

### 2. `src/components/auth/sign-up-form.tsx`

**Types and state.**

```ts
/** The two cards step 1 offers. */
type Role = "CLIENT" | "DRIVER";

/**
 * The role actually written to `User.role`. COMPANY is not a card: it is what
 * the Driver card resolves to once the Business account type is picked, which
 * is the path someone registering a haulage business already takes today.
 */
type SignUpRole = Role | "COMPANY";
```

`role` and `accountType` state stay exactly as they are. Add one derived value, computed in `handleSubmit` after both guards have narrowed the nullables:

```ts
const isCompanySignUp = role === "DRIVER" && accountType === "BUSINESS";
const resolvedRole: SignUpRole = isCompanySignUp ? "COMPANY" : role;
```

No `audience` branch is needed. The client host never renders a Driver `<button>` — its Driver card is a cross-origin `<a>` to the merchant host — so `role === "DRIVER"` is only reachable on the merchant host and on `"BOTH"` (split disabled), and COMPANY is legitimate on both. `auth.ts`'s server-side guard is the backstop either way.

**The sign-up call** keeps its existing `resolvedName` logic unchanged — `accountType === "BUSINESS"` already derives the name from `companyName`, which is exactly right for a company — and sends the derived role:

```ts
const { error: signUpError } = await signUp.email({
  name: resolvedName,
  email,
  password,
  role: resolvedRole,
});
```

**The follow-up profile write.** Today `handleSubmit` has an `if (role === "DRIVER")` branch posting to `/api/driver-profile` and an `if (role === "CLIENT")` branch posting to `/api/client-profile`. Add a third branch **before** the driver one and make the driver branch exclusive of it:

```ts
if (isCompanySignUp) {
  const response = await fetch("/api/logistics-company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName, vatId, phone, city }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    setError(
      payload?.error ?? "Could not save your company details. Please try again.",
    );
    setLoading(false);
    return;
  }
} else if (role === "DRIVER") {
  // …unchanged…
}
```

The body is **exactly those four fields** — `{ companyName, vatId, phone, city }`. Do not add the six wizard fields; the form does not collect them and `task-06`'s route does not require them (section 5).

Same failure handling as the two existing branches, for the same reason the comments already give: the Better Auth account exists by this point, so surface the error and stay put rather than navigating away as if everything succeeded.

The 409 from a duplicate `phone` surfaces verbatim through `payload.error`, which is the useful message. Its exact copy, owned by `task-06` and matched here character for character:

```
This phone number is already registered to another account.
```

That string lives in the route (`isDuplicatePhoneError` → 409) and **must not be duplicated as a client-side constant** — the form renders whatever `payload.error` holds and falls back to `"Could not save your company details. Please try again."` only when the response carries no message at all. Do not paraphrase either string.

`city` is already collected — the city select renders under `role === "DRIVER"`, which the company branch is a sub-case of. Do not move it.

**Headings.** `roleHeading(pickedRole, currentAudience)` gains the account type so the company branch reads correctly:

```ts
function roleHeading(
  pickedRole: Role,
  currentAudience: Audience,
  pickedAccountType: AccountType | null,
): string {
  if (pickedRole === "DRIVER" && pickedAccountType === "BUSINESS") {
    return "Sign up as a logistics company";
  }

  if (currentAudience === "MERCHANT" && pickedRole === "DRIVER") {
    return "Sign up as an individual driver";
  }

  return ROLE_HEADINGS[pickedRole];
}
```

Step 2 calls it with `null` (no account type picked yet), so its wording is untouched. Step 3 calls it with `accountType`. In step 3, **suppress the ` — ${ACCOUNT_TYPE_LABELS[accountType]}` suffix for the company branch** — "Sign up as a logistics company — Business" is noise.

**Step-2 card copy.** The Business card's description is currently "Sign up as a registered company" for every role. Under the Driver role it now means something more specific, so branch it:

- `role === "DRIVER"` → `"Register a logistics company running more than one vehicle"`
- otherwise → `"Sign up as a registered company"` (unchanged for clients)

The card's `label` stays `"Business"`. It is the same card in the same place; only what it produces changed.

**Redirect — `/dashboard`, and nothing further.** The existing line is `router.push(audience === "MERCHANT" ? "/dashboard" : "/")`. A newly created company must go to **`/dashboard` on every audience** — `/` is the client landing page and a company has nothing there:

```ts
router.push(isCompanySignUp || audience === "MERCHANT" ? "/dashboard" : "/");
router.refresh();
```

`task-21` owns what `/dashboard` then does with a COMPANY session — send it into the wizard, into the status screen, or into the ops dashboard, depending on whether a `BusinessApplication` exists and what state it is in. **This task must not push any onboarding path itself.** No `/onboarding/...` URL appears anywhere in either form, and no second redirect is chained after this one: routing onward is a decision that needs the application row, which this form has not read and should not read. Land on `/dashboard`; `task-21` takes it from there. The same applies to the sign-in form's company override in section 4.

### 3. `src/lib/auth.ts` — verify, no change expected

Read the `before` hook and confirm each branch, in its existing order:

1. `role === "ADMIN"` → `FORBIDDEN`. Unrelated to COMPANY, and checked before the `ctx.request` bail-out so it holds for server-side calls too. **No change.**
2. `if (!ctx.request) return;` — the bail-out that lets `task-07`'s headerless `auth.api.signUpEmail` through. **No change**, and do not weaken it.
3. `audience === "ADMIN"` → `FORBIDDEN`, "Accounts cannot be created from the admin host." Applies to every role including COMPANY, correctly. **No change.**
4. `if (!IS_HOST_SPLIT_ENABLED) return;` — with the split disabled, a COMPANY sign-up from the single host is permitted. Correct. **No change.**
5. `audience === "CLIENT" && role !== "CLIENT"` → `FORBIDDEN`, **"Driver and logistics company accounts must be created from the merchant sign-up page."** This already rejects COMPANY on the client host and its message already names logistics companies — the string was written in anticipation of exactly this restoration. **No change.**
6. `audience === "MERCHANT" && role === "CLIENT"` → `FORBIDDEN`. COMPANY passes through. **No change.**

Conclusion to record in the task's completion note: **`src/lib/auth.ts` needs no edit.** The server-side host-split backstop already permits COMPANY on the merchant host and rejects it on the client host. Confirm it by reading, do not assume it — and if branch 5's message has drifted, fix the message rather than the logic.

### 4. `src/components/auth/sign-in-form.tsx`

The file's own doc comments currently assert that companies have no portal — *"Logistics companies are deliberately absent: they no longer have a sign-in card on any host"* on `type Role`, and *"Logistics companies have no sign-in portal here by product decision; the card was removed rather than replaced"* in the component's header. **Both must be rewritten**, not just contradicted by the code below them.

**Types.** Mirror the sign-up form: the cards stay two, the resolvable portal set grows to three.

```ts
/**
 * Every portal this form can resolve to. COMPANY is not its own step-1 card —
 * it is what the Driver card plus the Business account type resolves to,
 * mirroring the sign-up wizard step for step so that what a user picked when
 * registering is exactly what they pick when returning.
 */
type Role = "CLIENT" | "DRIVER" | "COMPANY";

/** The subset of `Role` that step 1 offers as a card. */
type CardRole = "CLIENT" | "DRIVER";

/** Every value the schema's `UserRole` can hold. ADMIN has no portal here. */
type SessionRole = Role | "ADMIN";
```

`ROLE_LABELS` becomes `Record<Role, string>` and gains the third entry — this is what makes the mismatch messages read correctly:

```ts
const ROLE_LABELS: Record<Role, string> = {
  CLIENT: "client",
  DRIVER: "driver",
  COMPANY: "logistics company",
};
```

`CARD_DESCRIPTIONS`, `CARD_LABELS` and `MERCHANT_CARD_LABELS` are step-1 card copy and become `Record<CardRole, string>` / `Partial<Record<CardRole, string>>`. Their values do not change. `cardLabel(cardRole: CardRole)` narrows likewise.

**State and derivation.** `const [role, setRole] = useState<CardRole | null>(null);` — the card. Then, alongside the existing `allowedRoles`:

```ts
const resolvedRole: Role | null =
  role === null
    ? null
    : role === "DRIVER" && accountType === "BUSINESS"
      ? "COMPANY"
      : role;

// The resolved portal is the only role allowed through, on every host.
const allowedRoles: SessionRole[] = resolvedRole ? [resolvedRole] : [];
```

**`mismatchMessage`.** The current first branch is the bug: `if (actualRole !== "CLIENT" && actualRole !== "DRIVER") return "This account cannot sign in here. Please contact support.";` catches COMPANY and tells a legitimate company that its account is unusable. Narrow it to ADMIN, which genuinely has no portal on this form:

```ts
function mismatchMessage(actualRole: SessionRole): string {
  // ADMIN has no card on this form and no portal to point at — the back office
  // is served from its own host, which middleware redirects `/sign-in` off.
  if (actualRole === "ADMIN") {
    return "This account cannot sign in here. Please contact support.";
  }

  if (audience === "CLIENT" && actualRole !== "CLIENT") {
    const actualRoleLabel = ROLE_LABELS[actualRole];
    return `This account is registered as a ${actualRoleLabel}. Please sign in at the merchant portal.`;
  }

  if (audience === "MERCHANT" && actualRole === "CLIENT") {
    return "This is a customer account. Please sign in at the main site.";
  }

  const actualRoleLabel = ROLE_LABELS[actualRole];
  return `This account is registered as a ${actualRoleLabel}. Please use the ${actualRoleLabel} sign-in.`;
}
```

The two new cases both land on the last line and both read correctly, which is the point of adding COMPANY to `ROLE_LABELS`:

- a company account signing in through Driver → Individual: *"This account is registered as a logistics company. Please use the logistics company sign-in."*
- a driver account signing in through Driver → Business: *"This account is registered as a driver. Please use the driver sign-in."*

The old comment on the first branch saying "COMPANY and ADMIN accounts have no card on this form at all" must go with it.

**`fetchStoredAccountType`.** It maps `CLIENT → /api/client-profile`, everything else → `/api/driver-profile`. A COMPANY session would hit the driver endpoint, get a 403, and return `null` — harmless today because null fails open, but it is a request that can only fail. Narrow its parameter to `"CLIENT" | "DRIVER"` and **skip the check entirely for the company branch**: a `LogisticsCompany` has no `accountType` column, so there is nothing to compare against and the role check above is the whole gate.

```ts
const storedAccountType =
  resolvedRole === "COMPANY" ? null : await fetchStoredAccountType(resolvedRole);
```

Everything downstream already treats `null` as "don't block", so no further branch is needed. Keep the existing comment explaining why null must not lock anyone out.

**`signInHeading`.** Same treatment as sign-up's `roleHeading`: `role === "DRIVER" && accountType === "BUSINESS"` → `"Sign in as a logistics company"`, checked before the merchant/individual-driver override; and step 3 drops the ` — ${ACCOUNT_TYPE_LABELS[accountType]}` suffix for that branch.

**Redirect.** `POST_SIGN_IN_PATH` is keyed by `Audience` and stays. Override it for the company branch, for the same reason as sign-up:

```ts
router.push(resolvedRole === "COMPANY" ? "/dashboard" : POST_SIGN_IN_PATH[audience]);
router.refresh();
```

Both checks still necessarily run **after** `signIn.email` succeeds. Checking beforehand would need an email → role lookup, which is an account-enumeration oracle; a rejected account is signed straight back out with `signOut()` and the user stays on the form. That reasoning is already in the file — keep it.

### 5. Sequencing with `task-06` — settled, not deferred

`task-06` (same wave) extends `POST /api/logistics-company` with six more fields. **This is not a conflict and there is nothing for whoever lands second to decide.** `task-06` specifies it as follows, and this form is written against that:

> The four original fields — `companyName`, `vatId`, `phone`, `city` — are required on every call. The six new ones (`registeredAddress`, `citiesOfOperation`, `contactName`, `contactRole`, `contactEmail`, `bankAccountIban`) are validated only when the caller sends them.

So **this form's four-field POST is a complete, valid request**, not a partial one to be tolerated. The route is an upsert keyed on `userId`, so step 1 of the wizard (`task-10`) later POSTs all ten to the same endpoint and fills in the six columns this call leaves null. One endpoint, one set of rules, one row.

Completeness before submit is enforced by `task-14`'s `POST /api/logistics-company/onboarding/submit`, which refuses to move an application to `PENDING` while any of the ten is missing. That is the right place for it — this form legitimately creates an account that has not been near the wizard yet.

Two things follow, and neither is negotiable:

- **The sign-up form must not grow into a ten-field company registration.** Step 1 of the wizard exists to collect the rest, and a registration form that demands an IBAN before the account exists is a worse funnel and a worse spec.
- **The four-field call must never be made to 400.** A company that cannot create its `LogisticsCompany` row cannot reach `/dashboard`, cannot reach the wizard, and therefore can never supply the six fields — the strict version of the route makes the whole feature unreachable. If a reviewer proposes requiring all ten, this is the reason it is wrong.

### 6. Existing `BUSINESS`-type `DriverProfile` rows are left alone

Repointing the Business card affects **new sign-ups only**. Accounts already created down the old path keep working exactly as they do today: they are `DRIVER` accounts with `DriverProfile.accountType = "BUSINESS"`, they sign in through Driver → Business as before — which, after this change, resolves to COMPANY and therefore *mismatches*, producing "This account is registered as a driver. Please use the driver sign-in." That is honest and it points them somewhere real, but it is a behaviour change for those users and it is why `action-required.md` asks ops to query production for `DriverProfile` rows with `accountType = 'BUSINESS'` first. If there are none, this is a non-issue. **Do not write a migration for them in this task** — `requirements.md` lists migrating those rows as an explicit non-goal, and what should happen to them is an ops decision, not a code path invented here.

## Acceptance Criteria

- [ ] On the merchant host, Driver → Business → submit creates a `User` with `role: "COMPANY"` and a `LogisticsCompany` row via `POST /api/logistics-company`; no `DriverProfile` is created.
- [ ] Driver → Individual and Driver → Individual Entrepreneur still create a `DRIVER` account with a `DriverProfile`, unchanged.
- [ ] Client → Business still creates a `CLIENT` account with `ClientProfile.accountType = "BUSINESS"`, unchanged.
- [ ] That POST body is exactly `{ companyName, vatId, phone, city }` and succeeds against `task-06`'s extended route without sending any of the six wizard fields.
- [ ] A failed `POST /api/logistics-company` surfaces the server's own message and leaves the user on the form rather than navigating away; a duplicate phone shows `This phone number is already registered to another account.` verbatim, from `payload.error`, with no client-side copy of that string.
- [ ] A newly created company lands on `/dashboard` on every audience, and neither form pushes any onboarding path — `task-21` owns the routing from `/dashboard` onward.
- [ ] `sign-in-form.tsx` compiles with `type Role = "CLIENT" | "DRIVER" | "COMPANY"` and a `ROLE_LABELS` entry of `"logistics company"`; the step-1 card constants are keyed by the narrower `CardRole`.
- [ ] A company signs in through Driver → Business and reaches `/dashboard`; the account-type cross-check is skipped for that branch and `/api/driver-profile` is not called.
- [ ] A company signing in through the wrong portal is told which portal to use, not "This account cannot sign in here" — that message is now reachable only for ADMIN.
- [ ] Both forms' headings read "Sign up as a logistics company" / "Sign in as a logistics company" with no ` — Business` suffix.
- [ ] `src/lib/auth.ts`'s `before` hook has been read and confirmed to need no change; a COMPANY sign-up from the client host is still rejected with "Driver and logistics company accounts must be created from the merchant sign-up page."
- [ ] Every doc comment in either file claiming that logistics companies have no card or cannot sign in has been rewritten.
- [ ] No migration or data change touches existing `DriverProfile` rows with `accountType = "BUSINESS"`.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- The two forms are deliberately symmetrical — the sign-in form's own comment says it mirrors the sign-up wizard "step for step, so that what a user picked when registering is exactly what they pick when returning". The derived-COMPANY approach preserves that; a third card on only one of them would break it.
- `role` is `input: true` on the Better Auth additional field, so the client sending `role: "COMPANY"` is sufficient — but it is also why the server-side `before` hook exists. The client picker is convenience; `auth.ts` is the boundary.
- `LogisticsCompany.userId` is `@unique`: one login per company. There are no staff seats and no membership table, and multi-user company accounts are an explicit non-goal. Nothing in this task should imply otherwise in its copy.
- `task-21` owns `/dashboard`'s routing for a COMPANY session. Do not add a redirect chain here; land on `/dashboard` and let that task decide between the wizard, the status screen and the ops dashboard.
- Neither form gets new styling. These are the plain unstyled auth pages, not onboarding surfaces — no `data-onboarding-surface`, no `bg-onboarding-accent`. The wizard's design system starts at `task-09`.
- Every symbol, string and code shape quoted in sections 2 and 4 has been checked against the current `sign-up-form.tsx` and `sign-in-form.tsx` on disk: `ROLE_HEADINGS`, `roleHeading(pickedRole, currentAudience)`, `resolvedName`, the `role === "DRIVER"` / `role === "CLIENT"` profile branches, the `router.push(audience === "MERCHANT" ? "/dashboard" : "/")` line and the Business card's `"Sign up as a registered company"` copy in sign-up; `SessionRole`, `ROLE_LABELS`, `CARD_DESCRIPTIONS` / `CARD_LABELS` / `MERCHANT_CARD_LABELS`, `cardLabel`, `signInHeading`, `allowedRoles`, `fetchStoredAccountType`, `mismatchMessage`'s `"This account cannot sign in here. Please contact support."` first branch and `POST_SIGN_IN_PATH` in sign-in. The two doc comments quoted in section 4 are verbatim from the file. Read both files before editing anyway — if any of this has drifted, the file is right and this task is stale.
- `src/lib/auth.ts` was likewise read and confirmed: branch 5 of the `before` hook still carries `"Driver and logistics company accounts must be created from the merchant sign-up page."` word for word, and `if (!ctx.request) return;` is still in place above it. No edit is expected.
