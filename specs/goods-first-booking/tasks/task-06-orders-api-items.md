# Task 06: `POST /api/orders` accepts items and re-derives the load

## Status

complete

## Wave

2

## Description

The order route stops trusting typed weight and dimensions. Instead:

1. It accepts `items[]`.
2. It resolves catalogue lines against the database.
3. It builds the load plan with task-02's module.
4. It writes the derived figures to `Order`, persists one `OrderItem` per line, and fills `Order.itemQuantity` with a summary.

It also applies the body-type rules: required for business clients, derived for individuals.

## Dependencies

**Depends on:** task-01, task-02
**Blocks:** task-10

## Files to Modify

- `src/app/api/orders/route.ts`
- `src/app/api/vehicle-types/route.ts`, `src/components/home/order-vehicle-types.ts` — `serviceableBodies` (step 9)

## Technical Details

### Implementation Steps

1. **Read `src/app/api/orders/route.ts` in full.** Relevant regions:
   - `parseCreateOrderBody` (~`:380-745`), especially `bodyType` (~`:522`), the four cargo numbers (~`:586-625`), `packagingDescription`/`itemQuantity` (~`:629-645`) and `handlingTags` (~`:647`)
   - spec load (~`:827`)
   - body check (~`:844`)
   - oversize check (~`:868-895`)
   - `serviceableSpecIds(bodyType)` (~`:937`)
   - account-type read for `purchaseOrderRef` (~`:985-995`)
   - `estimateDelivery` (~`:1000`)

2. **Rollout: keep the legacy path.** This task ships in wave 2; the form starts sending `items` only in wave 4 (task-10), and browsers keep cached bundles after that. So:
   - **`items` present** ⇒ the new path below.
   - **`items` absent** ⇒ the current path, **byte-for-byte unchanged**: typed cargo numbers, client `cargoCategory`, client `bodyType`.

   Mark the legacy branch `// LEGACY(goods-first): remove after …`. Its removal is tracked in action-required, not in any task, because it waits on deploy time rather than code.

   **Request shape** of the new path. `items` is 1–60 lines:

   ```ts
   | { kind: "CATALOGUE"; code: string; quantity: number }
   | { kind: "CUSTOM"; label: string; quantity: number; weightKg: number; lengthM: number; widthM: number; heightM: number }
   | { kind: "PALLET"; palletType: "EUR" | "INDUSTRIAL"; quantity: number; heightM: number; weightKg: number }
   ```

   Validate with the route's existing parse style: one error string per field, in the existing `{ error }` wording. Bound quantities (1–99; pallets 1–33). Check custom and pallet figures against `CARGO_MEASUREMENT_BOUNDS`. Labels are trimmed, 1–80 characters.

3. **On the items path, client totals are not trusted.**
   - Ignore the four `cargo*` numbers.
   - `cargoCategory` is still **required by the parser**: `parseCreateOrderBody` calls the shared `parseQuoteFields` (`src/lib/pricing.ts:261-267`, `route.ts:465`), which the public estimate route also uses. Do not loosen that shared parser. The form keeps sending its own client-side derivation, and the server **overwrites** it with `plan.cargoCategory` before anything reads it.
   - `packagingDescription` and `handlingTags` stay client-supplied: they are the client's own statements, and the form pre-fills the tags.

4. **Resolve catalogue lines** in one `findMany({ where: { code: { in }, active: true } })`. An unknown or inactive code ⇒ 400 `"An item you listed is no longer available. Remove it and try again."`. Build `LoadLine`s with task-02's helpers (`palletLine`, `customLine`) for the other kinds.

5. **Plan:** `planLoad(lines)`. Then:
   - `body.kind === "conflict"` ⇒ 400 `"Chilled goods and open-chassis items cannot travel together. Book them separately."`
   - Account type: today it is read at ~`:985` **only when `purchaseOrderRef !== null`**. Make the read unconditional on the items path and hoist it above this step:
     - **BUSINESS:** `bodyType` is required (400 `"Choose a load space."`). It must equal the derived body whenever any line has a `requiredBody`.
     - **INDIVIDUAL:** any `bodyType` in the body is ignored; use the derived body.
   - Pallet lines from an INDIVIDUAL ⇒ 400.
   - `plan.overMaximum` ⇒ 400 `"This is more than one vehicle can carry. Split it into separate bookings."`

6. **Feed the existing checks the derived values.** Pass the plan's envelope and `totalWeightKg` into the existing `oversizeAxes` path, unchanged, as the hard check. Pass the derived body into the existing body and `serviceableSpecIds` checks. `estimateDelivery(parsed.data)` (~`:997`) takes the whole parsed object, so overwrite `parsed.data.cargoCategory` with `plan.cargoCategory` before that call rather than threading a new argument. **Do not add a soft-fit refusal.** Volume and floor area never refuse on the server (requirements §Assumptions).

7. **Write.** In the existing create, set:
   - `cargoWeightKg = totalWeightKg`, the three envelope axes, `cargoVolumeM3 = itemVolumeM3`, `cargoCategory`, `bodyType`
   - **The two free-text columns keep their documented meaning** (`schema.prisma`: `packagingDescription` is the form the load takes, `itemQuantity` is what is inside it). Both are client-typed in step 6 today (`booking-form.tsx:1146, 3216-3223`).
     - **Items mode:** `itemQuantity = summariseItems(lines, FREE_TEXT_MAX_LENGTH)` (`route.ts:147`, 200 chars). The client's step-6 "item quantity" input is hidden in this mode (task-10), so nothing typed is overwritten. `packagingDescription` stays client-typed.
     - **Pallets mode:** `packagingDescription = "4 × EUR pallet, 2 × Industrial pallet"` (server-built). `itemQuantity` stays client-typed ("96 cartons"), which is exactly what a business knows.
   - `items: { create: [...] }`, snapshotting each line's label (catalogue label in the request locale), figures and `stackable`

   It is one nested create, so it stays atomic with the order.

8. **Responses: no change.** The order selects live in the route itself (`ORDER_LIST_SELECT` ~`:1194`, another ~`:1300`). `src/lib/order-response-select.ts` only holds party selects. Leave all of them alone: the summary already reaches drivers through `itemQuantity`/`packagingDescription`, and no client screen reads items yet.

9. **Body-aware serviceability for the form.** The vehicle-types API's `serviceable` flag ignores body type, while this route's `serviceableSpecIds(bodyType)` (~`:916-924`) does not. So the form can recommend a class the server then refuses for Refrigerated or Open chassis. In `src/app/api/vehicle-types/route.ts`, add `serviceableBodies: ChassisType[]` per type, computed with the same `serviceableSpecIds` per body, and carry it through `order-vehicle-types.ts`. Keep `serviceable` as is for existing readers. Add both files to this task's file list in the PR description.

10. **Pricing estimate** (`/api/pricing/estimate`) is unchanged: it still takes a `vehicleTypeCode`, which the form now chooses by recommendation.

11. Add `tests/orders-items-parse.spec.ts` if `parseCreateOrderBody` (or the new items parser) can be imported without a database. Cover: empty list, unknown kind, bounds, an individual sending pallets. If it cannot be imported cleanly, lift the items parser into `src/lib/orders/parse-items.ts` so it can.

12. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

## Acceptance Criteria

- [x] Requests without `items` take the unchanged legacy path; requests with items ignore client totals and category
- [x] Derived weight, envelope, volume, category and body are written; `OrderItem` rows are snapshotted
- [x] Business requires a body; individual's body is derived; conflicts are refused
- [x] Existing hard-fit and serviceability checks run on derived values; no soft-fit refusal exists
- [x] Items mode fills `itemQuantity`, pallets mode fills `packagingDescription`; neither overwrites text the client typed
- [x] `/api/vehicle-types` returns body-aware `serviceableBodies`
