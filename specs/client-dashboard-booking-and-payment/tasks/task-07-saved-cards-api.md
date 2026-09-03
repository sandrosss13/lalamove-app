# Task 07: Saved-card API routes

## Status

pending

## Wave

2

## Description

The wallet page and the booking form's payment step both need to list, add, re-default and remove a client's saved cards. This task builds those routes.

**No payment gateway exists and none has been chosen.** These routes therefore store card *display metadata only* — brand, last four digits, expiry, holder name. The card number and CVC are entered in the browser, used there to derive brand and last4, and discarded. **They are never transmitted to this server and never persisted.** `SavedCard.providerToken` stays null until a gateway is wired.

## Dependencies

**Depends on:** task-03-schema-and-migrations.md
**Blocks:** task-14-wallet-page.md

**Context from dependencies:** task-03 adds the `SavedCard` model:

```prisma
model SavedCard {
  id            String   @id @default(cuid())
  clientId      String
  client        User     @relation(fields: [clientId], references: [id], onDelete: Cascade)
  providerToken String?  @unique   // null until a gateway exists. NEVER a PAN.
  provider      String?
  brand         String
  last4         String
  expMonth      Int
  expYear       Int
  holderName    String?
  isDefault     Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  orders        Order[]
  @@index([clientId])
}
```

It also adds `Order.paymentMethodType`, `Order.savedCardId` and `User.savedCards`.

## Files to Create

- `src/app/api/saved-cards/route.ts` — `GET` list, `POST` create
- `src/app/api/saved-cards/[id]/route.ts` — `DELETE` remove
- `src/app/api/saved-cards/[id]/default/route.ts` — `POST` make default

## Technical Details

### Implementation Steps

1. **Read an existing client-scoped route first** to match the house pattern for session handling, validation and error shape — `src/app/api/client-profile/route.ts` and `src/app/api/orders/route.ts` are the closest precedents.

2. **Every route is CLIENT-scoped and derives the owner from the session, never from the request body or a query parameter.** A client may only ever read or mutate their own cards. Follow the pattern at `src/app/api/dashboard/hub/earnings/export/route.ts:28-37`, which scopes from the session with no id in the query string.

3. **`GET /api/saved-cards`** — returns the session client's cards, default first then newest first. Select only `id, brand, last4, expMonth, expYear, holderName, isDefault, createdAt`. Never select `providerToken`.

4. **`POST /api/saved-cards`** — accepts and validates:

   ```ts
   {
     brand: string;        // e.g. "Visa", "Mastercard", "Amex", "Card"
     last4: string;        // exactly 4 digits
     expMonth: number;     // 1-12
     expYear: number;      // 4-digit, not in the past
     holderName?: string;
     isDefault?: boolean;
   }
   ```

   **Reject the request outright if the body contains anything resembling a full card number or a CVC** — a `number`, `cardNumber`, `pan`, `cvc`, `cvv` or `securityCode` key, or any string of 12+ consecutive digits. Return `400` with `{ error: "Card details must not be sent to the server." }`. This is a deliberate guard: a future caller that forgets the rule should fail loudly rather than quietly persist a PAN.

   Validate `last4` is exactly four digits, `expMonth` is 1–12, and the expiry is not already past. Reject with imperative messages naming the fix, per the house copy rule — `"Enter a four-digit card ending."`, `"That card has expired. Add a card that is still valid."`

   When `isDefault` is true, or when this is the client's **first** card, clear `isDefault` on their other cards inside the same transaction so exactly one default exists.

5. **`POST /api/saved-cards/[id]/default`** — sets `isDefault` on the named card and clears it on the client's others, in one transaction. `404` if the card is not theirs.

6. **`DELETE /api/saved-cards/[id]`** — removes the card. **If the removed card was the default, promote the next one** (newest remaining) to default in the same transaction. `404` if not theirs. Note `Order.savedCardId` is `onDelete: SetNull`, so historic orders survive the deletion with a null card reference — that is intended.

7. Error responses use `{ error: string }`, matching what the client-side fetch helpers already parse.

8. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### API Endpoints

- `GET /api/saved-cards` → `{ cards: Array<{ id, brand, last4, expMonth, expYear, holderName, isDefault, createdAt }> }`
- `POST /api/saved-cards` → body as above → `201` `{ card: {...} }` | `400` `{ error }`
- `POST /api/saved-cards/[id]/default` → `200` `{ card: {...} }` | `404` `{ error }`
- `DELETE /api/saved-cards/[id]` → `200` `{ ok: true }` | `404` `{ error }`

### House rules that apply to every task in this spec

- British English; validation messages are imperatives naming the fix, never "invalid".
- `{ error: string }` response shape so the client can prefer the server's own wording.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] All four endpoints exist and are scoped to the session client; no route accepts an owner id from the caller
- [ ] `providerToken` is never selected, returned or written
- [ ] `POST` rejects any body containing a PAN-like or CVC-like field with a `400`
- [ ] Exactly one card per client can be `isDefault` at any time, enforced transactionally
- [ ] The first card a client adds becomes their default automatically
- [ ] Deleting the default promotes the next card in the same transaction
- [ ] Accessing another client's card returns `404`, not `403` — do not confirm the id exists
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

`model Payment` already exists (`prisma/schema.prisma:1078-1094`) and **no code has ever created a row in it** — `prisma.payment.*` has zero call sites. This task does not change that. Payment capture waits on a gateway; see `../action-required.md`.
