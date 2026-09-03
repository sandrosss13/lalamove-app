# Task 14: `/wallet` becomes a Payment methods page

## Status

pending

## Wave

4

## Description

`src/app/wallet/page.tsx` is currently an honest 61-line placeholder — *"Wallet balance, top-ups and transaction history aren't built yet."* This task replaces it with a real Payment methods page: saved cards with default and remove actions, an Add card dialog, an empty state, and the gateway-pending banner.

**Transaction history and Invoices are deliberately omitted.** Both appear in the design handoff and neither has a backing table: no `Payment` row is ever created anywhere in the codebase, and there is no PDF pipeline. A "Download PDF" link that 404s is worse than an absent section, and illustrative rows would be fabricated financial records.

## Dependencies

**Depends on:** task-07-saved-cards-api.md, task-11-add-card-dialog.md
**Blocks:** None

**Context from dependencies:**

task-07 built four session-scoped endpoints. None accepts an owner id from the caller; all derive the client from the session:
- `GET /api/saved-cards` → `{ cards: Array<{ id, brand, last4, expMonth, expYear, holderName, isDefault, createdAt }> }`, default first then newest first
- `POST /api/saved-cards` → body `{ brand, last4, expMonth, expYear, holderName?, isDefault? }` → `201 { card }` | `400 { error }`. **It rejects any body containing a PAN-like or CVC-like field.**
- `POST /api/saved-cards/[id]/default` → `200 { card }` | `404 { error }`
- `DELETE /api/saved-cards/[id]` → `200 { ok: true }` | `404 { error }`. Deleting the default promotes the next card automatically.

task-11 created `src/components/home/add-card-dialog.tsx` exporting `AddCardDialog` and the type `NewCardInput = { brand, last4, expMonth, expYear, holderName, isDefault }`, plus `src/components/home/card-brand.ts` exporting `detectCardBrand` and the brand chip styling map (Visa `bg-blue-100 text-blue-700`, Mastercard `bg-amber-100 text-amber-800`, Amex `bg-emerald-100 text-emerald-700`, other `bg-surface text-muted`; chip geometry `h-8 min-w-14 rounded-md`, 11px/700, `tracking-[0.04em]`). The dialog derives brand and last4 in the browser and **never transmits the card number or CVC**. Its `onSubmit` hands you exactly `NewCardInput` — post that straight to `POST /api/saved-cards`.

## Files to Modify

- `src/app/wallet/page.tsx` — full rewrite

## Files to Create

- `src/components/wallet/saved-cards-panel.tsx` — the client component owning the card list and its mutations (the page stays a server component that loads the initial list)

## Technical Details

### Implementation Steps

1. **Read the current `src/app/wallet/page.tsx` first.** Preserve its access control exactly: the signed-out branch (`:20-41`) and the CLIENT-only redirect (`:46-48`). Only the signed-in content changes.

2. **Shell**: `max-width: 48rem`, padding `32px 32px 64px`, sections `gap-8`. Same shell as the restyled `/orders` page.

3. **Header**: accent eyebrow `WALLET` — 11px/600, `tracking-[0.24em]`, uppercase — over `Payment methods` at 40px/600, `tracking-[-0.025em]`, with `← New order` right-aligned and baseline-aligned at 14px/600, hover accent.

4. **Gateway-pending banner**, directly under the header. Mirror the wording the admin surface already uses for this exact situation (`src/app/admin/(sections)/finance/payment-methods/page.tsx:39-44`):

   > Gateway integration is pending. Cards saved here are not charged, and only the brand and last four digits are stored.

   `rounded-lg border border-line bg-surface p-3`, 12px `text-muted`.

5. **Saved cards section**, led by an 11px/600 `tracking-[0.1em]` uppercase `text-muted` heading whose row also carries the accent `+ Add card` button (`px-4 py-2.5 rounded-lg`).

   Each card is a `rounded-[14px]` white row on `border-line`, `p-[18px_20px]`: the brand chip, then the masked number in `--font-price` 15px/500 (`•••• •••• •••• 4242`) over `<name> · Expires MM/YY` at 12px `text-muted`. A `Default` pill on the default card — `rounded-full px-3 py-1`, 11px/600, `tracking-[0.06em]`, uppercase, accent text on a 10%-accent fill. Right-aligned: `Make default` (13px/600, **hidden on the default card**) and `Remove` (13px/600, in `text-red-700`).

6. **Removing a card is destructive and irreversible — make it two-step**, matching the house pattern: `Remove` → `Confirm removal` → `Removing…`, with the armed flag cleared when the user interacts with any other row. Do **not** use a browser `confirm()`. A one-line note beneath explains what will happen while armed.

7. **Empty state**: a dashed `border-line` panel on `bg-surface`, `p-8`, centred, 14px `text-muted` — `No cards saved yet. Add a credit or debit card to pay for deliveries.`

8. **Mutations**: call the endpoints above, then `router.refresh()`. Errors render inline as `<p role="alert">`, preferring the server's `{ error }` wording with a local fallback such as `Could not remove this card.` **Never `alert()`.** Loading states are a label swap plus `disabled` — `Removing…`, `Saving…` — not a spinner.

9. **Do not build a Transaction history section and do not build an Invoices section.** They are out of scope for the reason given above and recorded in `../action-required.md`.

10. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** `/wallet` does not carry `data-landing-page`; the dark variant at `src/app/globals.css:29` is scoped to it, so dark utilities are inert.
- Landing token utilities, not hex: `bg-ink`, `bg-surface`, `text-paper`, `text-muted`, `border-line`, accent utilities. Accent hover is the existing `--landing-accent-hover` (#b4530f).
- Semantic colour (brand chips, the destructive `Remove`) uses Tailwind palette utilities — the landing token set has none.
- `--font-price` with `tabular-nums` for card numbers and expiry dates.
- British English, sentence case, `·` as the inline separator, no exclamation marks.
- `router.refresh()` after every successful mutation.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] The signed-out branch and the CLIENT-only redirect behave exactly as before
- [ ] Header shows the `WALLET` eyebrow over `Payment methods` with `← New order` right-aligned
- [ ] The gateway-pending banner is present and unmissable
- [ ] Saved cards list with brand chip, masked number, name · expiry, and a `Default` pill on the default card
- [ ] `Make default` is hidden on the card that is already default
- [ ] `Remove` is a two-step arm/confirm with a written reason, not a browser `confirm()`
- [ ] The empty state renders the specified dashed panel and copy
- [ ] Add card opens the task-11 dialog and posts only `{ brand, last4, expMonth, expYear, holderName, isDefault }`
- [ ] No card number or CVC is transmitted or logged anywhere
- [ ] Errors render inline via `role="alert"`; `alert()` and `confirm()` appear nowhere
- [ ] **No Transaction history section and no Invoices section exist**
- [ ] No hex literal, no inline colour `style`, no `dark:` utility in the diff
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

The page keeps the route name `/wallet` — `src/components/auth-status.tsx:108` links to it and that link is not in scope. Its visible label may need to change from "Wallet" to "Payment methods" for honesty; if you change it, change only the label, not the href.
