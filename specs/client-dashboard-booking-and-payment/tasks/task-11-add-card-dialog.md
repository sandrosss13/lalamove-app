# Task 11: Add-card dialog component

## Status

complete

## Wave

3

## Description

Both the wallet page and the booking form's payment step need an "Add card" dialog. This task builds it once, as a standalone component, plus the brand-detection helper it uses.

**No payment gateway exists and none has been chosen.** The dialog is deliberately built so that the card number and CVC **never leave the browser**: they are entered, used locally to derive the brand and the last four digits, and discarded. Only `{ brand, last4, expMonth, expYear, holderName, isDefault }` is submitted. The dialog carries a visible banner saying nothing is stored or charged.

This is what makes "full card UI, inert" safe. When a gateway is chosen, wiring it means replacing one client-side function with a tokenisation call — not rebuilding the UI.

## Dependencies

**Depends on:** None for its own implementation (Wave 3)
**Blocks:** task-14-wallet-page.md, task-16-payment-step.md

**Context from dependencies:** None. These are self-contained new files. The API this dialog submits to is built by task-07 (`POST /api/saved-cards`), which accepts exactly the six fields listed above and **rejects any body containing a PAN-like or CVC-like field with a 400**. Submit only what is listed.

## Files to Create

- `src/components/home/add-card-dialog.tsx` — the dialog
- `src/components/home/card-brand.ts` — brand detection and display metadata

## Technical Details

### Implementation Steps

1. **Use the shadcn `Dialog`** at `src/components/ui/dialog.tsx`, retinted to landing tokens the way the date Popover is retinted at `booking-form.tsx:986-995`. Do not hand-roll a modal — see the reasoning in task-10. Panel width `440px`.

2. **Header**: title `ADD CARD` — 13px/600, `tracking-[0.1em]`, uppercase, `text-muted` — over `Credit or debit card. Nothing is charged until you book a delivery.` Supply a proper accessible `DialogTitle`.

3. **Banner** — required, not optional. Directly beneath the header, a single line stating plainly that no card is stored or charged yet. Mirror the wording the admin surface already uses for exactly this situation (`src/app/admin/(sections)/finance/payment-methods/page.tsx:39-44`):

   > Gateway integration is pending. Your card details are not sent anywhere and nothing is charged — only the brand and last four digits are saved so you can recognise the card.

   Style it as an informational note on `bg-surface` with `border border-line`, `rounded-lg`, `p-3`, 12px `text-muted`. It must be impossible to miss.

4. **Fields**, each `h-12` on `border border-line`, `rounded-lg`, `px-3.5`, with a 13px/500 label above:
   - **Card number** — `--font-price`, `tracking-[0.04em]`, grouped in fours as typed, max 19 digits. A live brand chip right-aligned *inside* the field once 2+ digits are entered. `autoComplete="cc-number"`, `inputMode="numeric"`.
   - **Expiry** and **CVC** side by side in a two-column grid. Expiry is `MM/YY` with the slash inserted automatically, `autoComplete="cc-exp"`. CVC is 3–4 digits, `autoComplete="cc-csc"`, `inputMode="numeric"`.
   - **Name on card** — `autoComplete="cc-name"`.

5. **Set as default payment method** checkbox, accent-tinted, pre-checked when this is the client's first card (pass that in as a prop).

6. **Actions**: `Cancel` (accent text button) and `Save card` (accent fill). `Save card` is disabled until the card number has ≥ 14 digits, the expiry matches `MM/YY` and is not in the past, the CVC has ≥ 3 digits, and a name is entered.

   **Disabled styling**: grey fill and `cursor-not-allowed` rather than a fade — the house pattern is `disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100` (see `src/components/driver-hub/screens/drivers-add-panel.tsx:488`). `disabled:pointer-events-auto` is what lets the cursor show at all. Adapt the token names to the landing set.

   **A disabled control always carries a written reason.** Beneath the buttons, a 12px `text-muted` line naming **the first** missing thing in field order — never a list. Wire it with `aria-describedby`, because a disabled button leaves the tab order and a `title` alone is unreachable.

7. **THE SECURITY RULE — the point of this task.** On submit:

   ```ts
   // The PAN and CVC never leave this component. They are used here to derive the
   // brand and the last four digits, then discarded. POST /api/saved-cards rejects
   // any body containing a card-number- or CVC-shaped field.
   const digits = cardNumber.replace(/\D/g, "");
   onSubmit({
     brand: detectCardBrand(digits),
     last4: digits.slice(-4),
     expMonth,
     expYear,
     holderName,
     isDefault,
   });
   ```

   - Never put the PAN or CVC in a `fetch` body, a query string, a log, an analytics call, `localStorage`, `sessionStorage` or a URL.
   - Clear the card-number and CVC state when the dialog closes, by either route.
   - Do not add a `name` attribute that would let a stray form submission carry them.

8. **`card-brand.ts`**: `detectCardBrand(digits: string): string` from the leading digits — Visa `4`, Mastercard `51–55` and `2221–2720`, Amex `34`/`37`, otherwise `"Card"`. Add a comment that this is a display convenience only and that **a real gateway returns the authoritative brand** — this function is replaced, not extended, when one is wired.

   Also export the chip styling map, used by this dialog and by the wallet and payment-step card rows:

   | Brand | Utilities |
   |---|---|
   | Visa | `bg-blue-100 text-blue-700` |
   | Mastercard (`MC`) | `bg-amber-100 text-amber-800` |
   | Amex | `bg-emerald-100 text-emerald-700` |
   | anything else | `bg-surface text-muted` |

   Chip geometry: `h-8 min-w-14 rounded-md`, 11px/700, `tracking-[0.04em]`.

9. **Errors** render inline as `<p role="alert">` beneath the form, preferring the server's own `{ error }` wording with a local fallback. **Never `alert()`.**

10. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Code Snippets

```tsx
export type NewCardInput = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string;
  isDefault: boolean;
};

export type AddCardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-checks "set as default" when the client has no cards yet. */
  isFirstCard: boolean;
  /** Receives display metadata only — never the PAN or CVC. */
  onSubmit: (card: NewCardInput) => Promise<void> | void;
};
```

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** Neither the booking page nor `/wallet` carries `data-landing-page`, so dark utilities are inert.
- Landing token utilities, not hex. Accent hover is the existing `--landing-accent-hover` (#b4530f); do not add `#e94f18`.
- Semantic colour (the brand chips) uses Tailwind palette utilities — the landing token set has no semantic colour at all.
- British English; validation copy is an imperative naming the fix, never "invalid".
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] Built on `src/components/ui/dialog.tsx` with a proper accessible title
- [ ] The gateway-pending banner is present and unmissable
- [ ] `onSubmit` receives only `{ brand, last4, expMonth, expYear, holderName, isDefault }`
- [ ] The PAN and CVC appear in no fetch body, log, storage API or URL anywhere in the file
- [ ] Card-number and CVC state is cleared when the dialog closes by any route
- [ ] Card number groups in fours as typed; expiry auto-inserts its slash; all four `autocomplete` values are set correctly
- [ ] A live brand chip appears inside the number field from the second digit
- [ ] `Save card` is disabled until all four validity conditions hold, styled with a grey fill rather than a fade, and carries a written reason wired via `aria-describedby`
- [ ] Errors render inline via `role="alert"`; `alert()` appears nowhere
- [ ] `detectCardBrand` is documented as display-only and replaceable by a gateway
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

Neither consumer exists yet when this task completes — task 14 (wallet) and task 16 (payment step) import it. Export it cleanly.

If at any point the implementation seems to require sending the card number to the server, stop: it does not, and the API will reject it.
