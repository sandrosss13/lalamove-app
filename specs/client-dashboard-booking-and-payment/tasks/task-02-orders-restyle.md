# Task 02: Restyle `/orders` and `OrderCard` onto the landing token set

## Status

complete

## Wave

1

## Description

`/orders` currently renders with default Tailwind — `rounded border p-4`, raw enum strings like `IN_TRANSIT`, no landing tokens — while the booking page it links from is a designed surface. This task restyles the page and its card onto the booking page's visual language: same header rhythm, same card geometry, title-cased status pills, P/D endpoint rows and a meta row.

**No new data is shown.** The card renders exactly the fields `OrderCardOrder` already carries. This is a restyle, not a feature.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None. This task shares no files with anything else in Wave 1.

## Files to Create

- `src/components/orders-format.ts` — this screen's own `formatGel`, plus the status label and tone maps

## Files to Modify

- `src/app/orders/page.tsx` — page shell, header, empty state
- `src/components/order-card.tsx` — full restyle; `STATUS_STYLES` replaced by the new tone map
- `src/app/orders/[id]/track/page.tsx` — imports `STATUS_STYLES` from `order-card.tsx` at `:6` and uses it at `:111`; keep it compiling and looking right

## Technical Details

### Implementation Steps

1. **Read all three files first.** `OrderCard` is used by exactly one consumer (`src/app/orders/page.tsx:67`) despite its doc comment at `:34-36` claiming three — correct that comment as you pass.

2. **Page shell** (`orders/page.tsx`): `max-width: 48rem`, padding `32px 32px 64px`, `flex-column`, `gap: 24px`.

3. **Header**: an accent eyebrow `YOUR DELIVERIES` — 11px/600, `letter-spacing: 0.24em`, uppercase, accent colour — over `Your orders` at 40px/600, `letter-spacing: -0.025em`. This mirrors the booking page's `NEW DELIVERY` / `Book a delivery` pair exactly. `← New order` sits right-aligned and baseline-aligned, 14px/600, hover accent.

4. **Card** (`<li>`): `rounded-[14px]`, `border border-line`, `bg-ink`, `p-[22px]`; the list itself `gap: 14px`.

5. **Card top row**: status pill left, price right. Price uses `--font-price` at 20px/600, `letter-spacing: -0.01em`, `tabular-nums`, and **`formatGel`** — the card currently prints `$` at `:54`.

6. **Status pill**: `rounded-full`, `px-3 py-1`, 11px/600, `letter-spacing: 0.06em`, uppercase treatment, and **title-cased copy** — `In transit`, never `IN_TRANSIT`. Map the six enum values through an explicit lookup, never `replace(/_/g, " ")`; the house rule is that both words are written out where a reviewer can read them.

   | Status | Label | Utilities |
   |---|---|---|
   | `PENDING` | Pending | `bg-amber-100 text-amber-800` |
   | `CLAIMED` | Claimed | `bg-violet-100 text-violet-800` |
   | `ACCEPTED` | Accepted | `bg-blue-100 text-blue-700` |
   | `IN_TRANSIT` | In transit | `bg-orange-100 text-orange-700` |
   | `COMPLETED` | Completed | `bg-emerald-100 text-emerald-700` |
   | `CANCELLED` | Cancelled | `bg-red-100 text-red-700` |

   Use Tailwind palette utilities as shown. The landing token set contains **no semantic status colour at all**, and the codebase already uses palette utilities for exactly this (`order-card.tsx:8-15` today, the emerald "Best" badge at `booking-form.tsx:1189-1191`). Do not add `--landing-status-*` tokens.

   **The handoff assigns `IN_TRANSIT` the brand accent `#ff5a1f`. Do not.** Accent means "selected" everywhere else on this surface, and two meanings for one colour on the same page is a regression. `orange-*` above is visually close and semantically free. Note also that the handoff silently re-hues `CLAIMED` from amber to violet and `IN_TRANSIT` from purple to accent — the violet move is fine and is reflected above; the accent move is not.

7. **Route block**: replace the current `From` / `To` `<dl>` rows with P/D endpoint rows matching the map panel — a 20×20 badge, accent-tinted background with accent text, 10px/600, `gap: 10px`, then the address at 14px, truncating. Stack `gap: 8px`, `margin-top: 16px`.

8. **Meta row**: `margin-top: 16px`, `border-t border-line`, `padding-top: 14px`, `flex-wrap` with `gap: 8px 20px`. Cargo / Distance / Vehicle, each an 11px/600 `0.1em` uppercase muted label over a 13px/500 value; distance in `--font-price`. **Omit the Vehicle cell entirely when `order.vehicle` is null**, as the source already does.

9. **Track link**: `Track delivery →`, 14px/600, accent, `margin-top: 14px`. Keep the existing condition unchanged — it lives in `orders/page.tsx:70-72`, not in the card: `order.driverId !== null && (order.status === OrderStatus.ACCEPTED || order.status === OrderStatus.IN_TRANSIT)`.

10. **Empty state**: replace the bare sentence at `:63` with a centred panel — `rounded-[14px]`, `border border-line`, `bg-surface`, `p-8`, 14px muted text. Copy: `You haven't placed any orders yet.` Add a follow-up line pointing at `New order`.

11. **`/orders/[id]/track` ripple**: that page imports `STATUS_STYLES` at `:6` and renders it at `:111`. Export the new tone map under a name it can use and update the import so the track page picks up the same title-cased pills. Verify the page still renders.

12. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Code Snippets

```ts
// src/components/orders-format.ts
import { OrderStatus } from "@prisma/client";

const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}

// A lookup rather than a string transform, so both words are written out where a
// reviewer can read them — the same convention as admin-shell.tsx:24-32.
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CLAIMED: "Claimed",
  ACCEPTED: "Accepted",
  IN_TRANSIT: "In transit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const ORDER_STATUS_PILL: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CLAIMED: "bg-violet-100 text-violet-800",
  ACCEPTED: "bg-blue-100 text-blue-700",
  IN_TRANSIT: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
};
```

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** These pages do not carry `data-landing-page`; the dark variant at `src/app/globals.css:29` is scoped to it, so dark utilities are inert.
- Landing token utilities, not hex: `bg-ink`, `bg-surface`, `text-paper`, `text-muted`, `border-line`, accent utilities. Accent hover is the existing `--landing-accent-hover` (#b4530f).
- `--font-price` with `tabular-nums` for every money figure and distance.
- British English, sentence case, no "please", no exclamation marks, no emoji.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] `/orders` renders with the accent eyebrow, 40px title and right-aligned `← New order`, matching the booking page's header rhythm
- [ ] Order cards use `rounded-[14px] border border-line bg-ink p-[22px]` with a 14px list gap
- [ ] Status pills show title-cased labels from an explicit lookup; no raw enum string appears anywhere
- [ ] `IN_TRANSIT` is **not** rendered in the brand accent colour
- [ ] Prices render via `formatGel`; no `$` remains in `order-card.tsx`
- [ ] Route rows use P/D badges; the meta row shows Cargo / Distance / Vehicle and omits Vehicle when null
- [ ] The track link condition is unchanged
- [ ] The empty state is a centred bordered panel on `bg-surface`
- [ ] `/orders/[id]/track` still compiles and its status pill matches the new styling
- [ ] The stale doc comment in `order-card.tsx` about three consumers is corrected
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

The handoff calls the current pills "solid fills". They are not — `STATUS_STYLES` already uses 100/200-level tints. The real changes here are the title-casing, the two re-hues, and the surrounding card geometry.
