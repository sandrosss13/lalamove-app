# Task 08: Accept the new order fields in `POST /api/orders`

## Status

complete

## Wave

2

## Description

The booking form is gaining stop contacts, a service level, a body type, a payment-method selection and a Business-only purchase-order reference. This task extends the order-create endpoint to accept, validate and persist them — and, critically, to **re-derive the service-level price adjustment server-side rather than trusting the client's figure**.

## Dependencies

**Depends on:** task-03-schema-and-migrations.md, task-04-pricing-tiers.md
**Blocks:** None

**Context from dependencies:**

task-03 added to `Order`: six nullable stop-contact columns (`pickupContactName`, `pickupContactPhone`, `pickupContactDetails` and the three `dropoff*` equivalents); `serviceLevel ServiceLevel @default(REGULAR)`; `serviceLevelAdjustment Float @default(0)`; `bodyType ChassisType?`; `paymentMethodType PaymentMethodType?`; `savedCardId String?`; and `purchaseOrderRef String?`. `enum ServiceLevel { PRIORITY REGULAR POOLING }` is new; `ChassisType` and `PaymentMethodType` already existed.

task-04 added to `src/lib/pricing.ts`: `PRIORITY_UPLIFT = 0.25`, `POOLING_DISCOUNT = 0.1`, and two exported functions — `serviceLevelAdjustment(level, quotedPrice): number` returning a signed GEL amount (positive for Priority, negative for Pooling, zero for Regular), and `priceForServiceLevel(level, quotedPrice): number`. Both round through the module's existing `roundCurrency`.

## Files to Modify

- `src/app/api/orders/route.ts` — the `POST` handler at `:89-156`

## Technical Details

### Implementation Steps

1. **Read `src/app/api/orders/route.ts` in full first.** The `POST` handler validates its inputs and re-computes the quote server-side already — `helperCount` is persisted at `:137`. Follow the same shape for everything new.

2. **Accept the new fields** on the request body, all optional:

   ```ts
   {
     pickupContact?:  { name?: string; phone?: string; details?: string };
     dropoffContact?: { name?: string; phone?: string; details?: string };
     serviceLevel?: "PRIORITY" | "REGULAR" | "POOLING";   // default REGULAR
     bodyType?: "DRY_BOX" | "REFRIGERATED" | "OPEN_CHASSIS";
     paymentMethodType?: "CASH" | "CARD" | "BANK_TRANSFER";
     savedCardId?: string;
     purchaseOrderRef?: string;
   }
   ```

3. **Never trust a price from the client.** The handler already re-computes the fare. Compute the tier adjustment from the *server's own* quote:

   ```ts
   const level = parsedServiceLevel ?? "REGULAR";
   const adjustment = serviceLevelAdjustment(level, price);
   // Persist `price` as the un-adjusted quoted fare and `adjustment` separately, so the
   // breakdown still reconciles against Order.price's documented definition
   // (schema.prisma:817-820: base + distance + time + helper, floored at minimumFare).
   ```

   Store `serviceLevel: level` and `serviceLevelAdjustment: adjustment`. **Do not fold the adjustment into `price`.**

4. **Validate the contact fields.** All three per stop are optional and unvalidated in shape — the design states plainly that there is no validation and Save is never disabled. Do bound their length (a sane cap, e.g. 200 characters) and trim whitespace; store `null` rather than an empty string so a blank field is genuinely absent.

5. **Validate `bodyType` against the chosen vehicle.** If both a `vehicleTypeCode` and a `bodyType` are given, confirm the selected `VehicleTypeSpec.bodyTypes` actually includes it. Reject with `{ error: "That vehicle does not offer the load space you selected." }` if not. This closes the gap where a client edits the request after the UI filtered the list.

6. **Validate `savedCardId` belongs to the session client.** If it does not, `400` — do not silently drop it. If `paymentMethodType` is `CARD`, a `savedCardId` is required; for `CASH` and `BANK_TRANSFER` it must be absent.

7. **Respect the admin toggles.** `PaymentMethodConfig` (`prisma/schema.prisma:1058-1069`) has one row per `PaymentMethodType` with an `isEnabled` flag, written only by `src/app/api/admin/finance/payment-methods/[type]/route.ts:125-130`. **It is currently read by nothing outside admin.** Reject a `paymentMethodType` whose config row is disabled, with `{ error: "That payment method is not available." }`.

8. **`purchaseOrderRef` is Business-only.** Look up the session client's `ClientProfile.accountType`; if it is not `BUSINESS`, ignore the field rather than erroring — an Individual client's UI never renders it, so a value arriving there is a stale client, not an attack. Trim and cap the length as with the contacts.

9. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### API Endpoints

- `POST /api/orders` — accepts the seven new optional fields above; response shape unchanged except that the created order now carries them. All existing validation and behaviour is preserved.

### House rules that apply to every task in this spec

- British English; validation messages are imperatives naming the fix, never "invalid".
- `{ error: string }` response shape.
- Never trust a client-supplied price or fare component.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] All seven new fields are accepted, validated and persisted
- [ ] `serviceLevelAdjustment` is computed server-side from the server's own quote; no client price figure is read
- [ ] `Order.price` remains the un-adjusted quoted fare; the tier delta lives only in `serviceLevelAdjustment`
- [ ] A `bodyType` the chosen vehicle does not offer is rejected
- [ ] A `savedCardId` belonging to another client is rejected with a `400`
- [ ] `CARD` requires a `savedCardId`; `CASH` and `BANK_TRANSFER` reject one
- [ ] A payment method disabled in `PaymentMethodConfig` is rejected
- [ ] `purchaseOrderRef` is persisted for `BUSINESS` clients and ignored for others
- [ ] Empty contact strings are stored as `null`, not `""`
- [ ] Every pre-existing behaviour of the endpoint is unchanged
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

`helperCount` is already accepted and persisted at `:137` and its fee is already per-helper (`src/lib/pricing.ts:276`). Handoff server-change §3 is done — do not touch it.

Making this endpoint the first non-admin reader of `PaymentMethodConfig` is intentional. The model has existed unread since it was added.
