# Task 05: Item catalogue API and client hook

## Status

complete

## Wave

2

## Description

`GET /api/item-catalogue` serves the active catalogue in the request locale. A client module fetches it once and shares it, the way `useOrderVehicleTypes()` shares `/api/vehicle-types`.

## Dependencies

**Depends on:** task-01
**Blocks:** task-09, task-12

## Files to Modify

- `src/app/api/item-catalogue/route.ts` — new
- `src/components/home/order-item-catalogue.ts` — new

## Technical Details

### Implementation Steps

1. **Read** `src/app/api/vehicle-types/route.ts` and `src/components/home/order-vehicle-types.ts` (module-level promise cache, error constant, hook shape). Copy the pattern; do not invent a new one.

2. **Route:** `GET /api/item-catalogue?locale=en|ka`. Public, no session. Selects only `active` rows, ordered by `group`, `sortOrder`.

   **The locale must come from the URL, not from `src/i18n/request-locale.ts`.** That helper reads the `NEXT_LOCALE` cookie or the Referer (`:51-77`). A CDN-cached response keyed only on the path would serve one visitor's language to everyone else. A missing or unknown `locale` ⇒ `en`. Returns:

   ```ts
   { code, group, label, synonyms: string[],   // label/synonyms in the request locale
     weightKg, lengthM, widthM, heightM, stackable, needsTwoPeople,
     requiredBody, handlingTags, cargoCategory }
   ```

   Return both locales' synonyms concatenated, so a client typing Georgian on the English UI still finds the item. Return only the request locale's label.

   Cache: `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. That is safe only because the locale is in the URL; say so in a comment. Admin edits take up to five minutes to show.

3. **Client module:** `type CatalogueItem`, `useItemCatalogue(locale)` (one cached promise per locale) returning `{ items, loading, error }`, `ITEM_CATALOGUE_ERROR_MESSAGE`, and `toLoadLine(item, quantity): LoadLine` adapting to task-02's type. If task-02's file is not merged yet, import the type anyway; the waves guarantee it is.

4. `searchCatalogue(items, query)`: case- and diacritic-insensitive match on label and synonyms. Prefix matches rank above substring matches. Pure; export it for task-09 and for a few assertions in `tests/load-plan.spec.ts`, or a new `tests/item-catalogue-search.spec.ts`.

5. `pnpm lint`, `pnpm typecheck`, `pnpm build`, the new spec.

## Acceptance Criteria

- [ ] Inactive entries never returned
- [ ] Labels in request locale; synonyms from both
- [ ] One shared fetch per page load
- [ ] Search is pure and tested
