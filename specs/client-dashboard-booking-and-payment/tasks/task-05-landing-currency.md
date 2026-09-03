# Task 05: Replace `$` with `₾` on the landing funnel

## Status

complete

## Wave

1

## Description

`Order.price` and every fare component in this app are Georgian lari, but the public landing funnel quotes US dollars — the quote calculator hero, its breakdown, and the "from $X" figure on each vehicle tile. A visitor is quoted `$150` for a job the driver is paid `₾150` for. This task fixes the four sites on the landing surface.

Small and entirely independent: it shares no files with any other task in this spec.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** None

**Context from dependencies:** None.

## Files to Create

- `src/components/landing/landing-format.ts` — this surface's own `formatGel`

## Files to Modify

- `src/components/landing/landing-quote-calculator.tsx` — three price faces at `:471`, `:500`, `:508`
- `src/components/landing/landing-category-tiles.tsx` — the "from $X" figure at `:284`

## Technical Details

### Implementation Steps

1. Create `src/components/landing/landing-format.ts` with this surface's own `formatGel`. Per-screen formatter copies are the house convention — `src/components/driver-hub/screens/earnings-format.ts:11-15` records why a cross-screen import is deliberately avoided. Do **not** create a shared `src/lib/` currency module, and do not import another screen's formatter.

2. Replace all four `$` price faces with `formatGel(...)`.

3. **Check the surrounding copy.** `landing-quote-calculator.tsx` has prose near `:458` that already says the estimate is "in lari" while the figure beside it prints `$` — read the section and make copy and figure agree.

4. `landing-category-tiles.tsx:284` renders a "from" price per vehicle tile. Note the homepage handoff carries a product rule that the page must not publish a rate card before a route is entered — this tile figure already exists and is in scope only for its symbol. **Do not remove it**; just correct the currency.

5. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Code Snippets

```ts
// src/components/landing/landing-format.ts
//
// This surface owns its money formatting; a cross-screen import would tie the landing
// page's figures to a file another screen is free to change.
//
// Every fare figure in this app is already in GEL major units. Nothing is divided.
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Locale pinned, never the browser's: "₾1.200,50" on a de-DE browser beside a
// hard-coded "₾0.40" would read as two different currencies.
export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}
```

### House rules that apply to every task in this spec

- The landing page **is** the one dark-capable surface (it carries `data-landing-page`), so unlike the rest of this spec, `dark:` utilities do work here. You should still not need any — the token utilities already resolve per theme. Never write a `dark:` colour override on a surface whose token already handles it.
- `--font-price` with `tabular-nums` for money figures.
- British English, sentence case.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] `landing-format.ts` exports `formatGel`, pinned to `en-GB`, two decimals, `₾` prefix with no space
- [ ] No `$` remains in `landing-quote-calculator.tsx` or `landing-category-tiles.tsx`
- [ ] Copy near the quote figure agrees with the symbol shown
- [ ] The per-tile "from" price still renders, in `₾`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

Two `$` sites remain elsewhere in the app after this task — `src/components/admin/analytics/metric-cards.tsx:24-25` and `src/app/admin/(sections)/finance/promo-campaigns/page.tsx:91`. Both are admin-facing and out of scope for a client-dashboard feature; they are recorded in `../action-required.md` as follow-up.
