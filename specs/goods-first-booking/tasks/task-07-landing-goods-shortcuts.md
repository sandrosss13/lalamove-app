# Task 07: Goods shortcuts on the landing page

## Status

complete

## Wave

3

## Description

The signed-out landing page leads with goods, not vehicles:

- The quote calculator's cargo-category dropdown becomes goods shortcut tiles.
- The display-only `vehicle_types` section is dropped from the **default** section order.
- A shortcut survives the trip through sign-up/sign-in, so the booking form opens on it.

## Dependencies

**Depends on:** task-03, task-04
**Blocks:** none

## Files to Modify

- `src/components/landing/landing-quote-calculator.tsx`
- `src/components/landing/landing-category-tiles.tsx`
- `src/lib/admin/home-page-content.ts` — default section order only
- Sign-up / sign-in redirect handling (locate it; see step 4)
- `src/messages/en/landing.json`, `src/messages/ka/landing.json`
- `tests/landing-quote-calculator.spec.ts`

## Technical Details

### Implementation Steps

1. **Read** `landing-page.tsx:66-96` (CMS section switch), `landing-quote-calculator.tsx` (cargo dropdown ~`:143, 363`; silent cheapest-vehicle pick ~`:155-171`; the `/sign-up` link ~`:561`), `landing-category-tiles.tsx:191-269`, and `HOME_PAGE_SECTION_TYPES` in `src/lib/admin/home-page-content.ts:38`.

2. **Quote calculator.** Replace the cargo dropdown with a compact shortcut tile row (`shortcutsFor("INDIVIDUAL")`; the landing visitor is unknown, so no pallets).
   - Each shortcut needs a representative cargo category for the estimate call. Use the category of that group's first catalogue entry. Keep the mapping in this component as a small `Record<GoodsShortcutCode, CargoCategory>` with a comment saying the booking form derives the real one from items.
   - The silent cheapest-vehicle pick stays.
   - The result's "Vehicle" stat is relabelled "Typical vehicle" and gets the helper line "We confirm the vehicle once you list your items."

3. **Category tiles.** `category_tiles` is **not** in `DEFAULT_HOME_PAGE_SECTION_ORDER` (`home-page-content.ts:136-149`), so this only affects existing CMS rows. Update it anyway, for consistency: each tile preselects its shortcut in the calculator (`#price-a-load` plus state). The calculator's "Book" link goes to `/sign-up?goods=<code>`.

4. **Carry `goods` through auth.** Every hop must carry it:
   - the two separate `flowHref` helpers (`sign-up-form.tsx:124`, `sign-in-form.tsx:128`), so switching between sign-up and sign-in keeps it
   - `POST_SIGN_IN_PATH`
   - the redirect in `sign-up-success.tsx:93`

   They land on `/?goods=<code>`, which task-04's `HomeEntry` reads. Validate with `isGoodsShortcutCode`. **Never forward an arbitrary redirect URL**: only the shortcut code travels, never a path.

5. **Default sections.** Remove `vehicle_types` from the default section order in `home-page-content.ts`. Keep the type in `HOME_PAGE_SECTION_TYPES` so existing CMS rows still render (action-required tracks retiring them).

6. Update `tests/landing-quote-calculator.spec.ts` for the new control. Add a case that a tile click produces an estimate.

7. `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.

## Acceptance Criteria

- [ ] No cargo dropdown; shortcut tiles drive the estimate
- [ ] `?goods=` survives sign-up and sign-in and only a validated code is forwarded
- [ ] `vehicle_types` is not in the default order but still renders from existing CMS rows
- [ ] Landing calculator spec updated and passing
