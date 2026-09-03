# Task 16: Payment step 7 and the Business purchase-order reference

## Status

pending

## Wave

6

## Description

A new step 7 lets the client choose how to pay — one of their saved cards, or Pay later — and Business clients additionally get a PO / cost-centre reference field. The step is optional: it never blocks Calculate or Book delivery.

**This is the fourth of five sequential tasks editing `src/components/home/booking-form.tsx`.**

## Dependencies

**Depends on:** task-11-add-card-dialog.md, task-15-wire-stop-contacts.md
**Blocks:** task-17-progressive-gating.md

**Context from dependencies:**

task-11 created `src/components/home/add-card-dialog.tsx` (exporting `AddCardDialog` and `NewCardInput = { brand, last4, expMonth, expYear, holderName, isDefault }`) and `src/components/home/card-brand.ts` (exporting `detectCardBrand` and the brand chip styling map: Visa `bg-blue-100 text-blue-700`, Mastercard `bg-amber-100 text-amber-800`, Amex `bg-emerald-100 text-emerald-700`, other `bg-surface text-muted`; chip geometry `h-8 min-w-14 rounded-md`, 11px/700, `tracking-[0.04em]`). The dialog derives brand and last4 in the browser and **never transmits the PAN or CVC**.

task-07 built `GET /api/saved-cards` → `{ cards: [...] }` (default first, then newest), `POST /api/saved-cards`, `POST /api/saved-cards/[id]/default` and `DELETE /api/saved-cards/[id]`, all session-scoped.

task-08 extended `POST /api/orders` to accept `paymentMethodType?: "CASH" | "CARD" | "BANK_TRANSFER"`, `savedCardId?: string` and `purchaseOrderRef?: string`. It requires a `savedCardId` when the type is `CARD`, rejects one for `CASH`/`BANK_TRANSFER`, rejects a method disabled in `PaymentMethodConfig`, and ignores `purchaseOrderRef` for non-Business clients.

task-15 wired the stop-contact dialog into step 2 and added `contacts` state to the form.

## Files to Modify

- `src/components/home/booking-form.tsx` — new step 7 after step 6 and before the service-level card, plus state and submit
- `src/components/home/home-entry.tsx` — pass the client's account type and initial saved cards down, if the form does not already receive them

## Technical Details

### Implementation Steps

1. **Read `booking-form.tsx` in full first.** Step 7 goes between step 6 (Additional details) and the unnumbered service-level card that task-13 added.

2. **Step card**: `StepCard step={7} title="Payment"` with subtitle `Optional — you can book now and settle later.`

3. **Options list**: `flex flex-col gap-2.5`, one row per saved card plus a final `Pay later` row. Each row is the standard pick-card laid out horizontally — `rounded-xl p-[14px_16px] gap-3.5 items-center`, idle `border border-line`, selected accent border on a 6%-accent fill.
   - Brand chip from `card-brand.ts`
   - Title 14px/500 (`Visa •••• 4242`), note 12px `text-muted` (`Expires 08/28 · Default`)
   - `Pay later` reads `Settle after the delivery`
   - Selected rows get an accent `size-4` tick pushed right with `ml-auto`

   **Control semantics — native radios in a `fieldset`/`legend`**, matching the crew-size picker (`:1223-1279`) and the pickers added by tasks 12 and 13. The handoff says `role="group"` with `aria-pressed` buttons; the form's newer convention is radios, which buy arrow-key navigation and "2 of 3" announcements for free.

4. **Respect the admin toggles.** `PaymentMethodConfig` (`prisma/schema.prisma:1058-1069`) carries one `isEnabled` row per `PaymentMethodType`. **If a method is disabled in admin it must not appear here.** The order endpoint rejects a disabled method, so a UI that offers one produces an error the client cannot act on. Load the enabled set server-side and pass it in; do not fetch it from a client component.

5. **`Pay later` maps to the existing `CASH` enum value.** Do not add a `PAY_LATER` value — the admin toggle page iterates the whole enum and would immediately render a fourth row. The client-facing label is `Pay later`; the persisted value is `CASH`.

6. **Add card**: a full-width `border border-dashed border-line` button, `rounded-lg px-4 py-[11px]`, 14px/500, `mt-3`; hover turns border and text accent. Opens the task-11 `AddCardDialog`. On submit, `POST /api/saved-cards`, then refresh the list and select the new card.

7. **Not part of the gating chain.** The step greys out until a vehicle is chosen (like step 6), but leaving it unanswered **never blocks Calculate or Book delivery**. The client's default card is pre-selected, and `Pay later` is a first-class choice.

8. **Business PO / cost-centre field.** Render **only** when the signed-in client's `ClientProfile.accountType` is `BUSINESS`:
   - Label `PO or cost-centre reference` with the helper line `Optional. Appears on your order record for your own finance team.`
   - A single text input, `h-12 rounded-lg border border-line px-3.5`
   - An Individual client must never see this field. Resolve the account type server-side and pass it down as a prop — do not infer it in the browser.

9. **Submit**: send `paymentMethodType`, `savedCardId` (only when the type is `CARD`) and `purchaseOrderRef` (only for Business).

10. **Errors** render inline as `<p role="alert">`, preferring the server's `{ error }` wording. **Never `alert()`.** Loading is a label swap plus `disabled` — `Saving…` — not a spinner.

11. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`.
- Landing token utilities, not hex. Accent hover is the existing `--landing-accent-hover` (#b4530f).
- Semantic colour (brand chips) uses Tailwind palette utilities.
- `--font-price` with `tabular-nums` for card numbers and expiry dates.
- British English, sentence case, `·` as the inline separator, no "please", no exclamation marks.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] Step 7 renders between step 6 and the service-level card, numbered 7, with the specified subtitle
- [ ] Saved cards and a `Pay later` row render as native radios in a `fieldset`/`legend`
- [ ] The client's default card is pre-selected
- [ ] A payment method disabled in `PaymentMethodConfig` does not appear
- [ ] The enabled-methods set is resolved server-side, not fetched from the client
- [ ] `Pay later` persists as `CASH`; no `PAY_LATER` enum value was added
- [ ] Add card opens the task-11 dialog and posts only display metadata
- [ ] Leaving step 7 unanswered never blocks Calculate or Book delivery
- [ ] The PO / cost-centre field renders for `BUSINESS` clients and is absent for Individual clients
- [ ] Account type is resolved server-side and passed down, not inferred in the browser
- [ ] The order submission carries `paymentMethodType`, `savedCardId` (card only) and `purchaseOrderRef` (Business only)
- [ ] Errors render inline via `role="alert"`; `alert()` appears nowhere
- [ ] No hex literal, no inline colour `style`, no `dark:` utility in the diff
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

This step makes the booking form the **first non-admin reader of `PaymentMethodConfig`**. The model has existed unread since it was added; there is no established client-side pattern to copy, so establish a clean one.

No card is ever charged by this flow. `model Payment` exists (`prisma/schema.prisma:1078-1094`) and no code creates a row in it; that remains true after this task. See `../action-required.md` for the gateway decision.
