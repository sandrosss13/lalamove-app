# Task 04: Give the booking form the client's account type and the initial shortcut

## Status

complete (build confirmed `/[locale]` is still ISR, revalidate 1m)

## Wave

2

## Description

`BookingForm` takes no props and does not know whether the client is Individual or Business. The account type is resolved only for checkout (`loadBookingPaymentOptions`, `src/lib/home/booking-payment-options.ts:35`). The goods-first flow needs it from step 3 on, because pallets and the load-space picker are business-only. The form also needs to open on the shortcut a visitor picked on the landing page (`?goods=<code>`).

This task adds the plumbing only. No visible change.

## Dependencies

**Depends on:** task-03 (`isGoodsShortcutCode`)
**Blocks:** task-07, task-10

## Files to Modify

- `src/components/home/home-entry.tsx` — read `?goods=` on the client
- `src/components/home/booking-form.tsx` — accept `initialGoods`; fetch the account type
- **Not** `src/app/[locale]/page.tsx` — see step 1

## Technical Details

### Implementation Steps

1. **Do not resolve anything in `src/app/[locale]/page.tsx`.** It sets `revalidate = 60`, and its comment (`:16-22`, `:51-52`) records that it deliberately reads no session and no `searchParams`, so a per-client response never enters the shared cache. Reading the account type or `searchParams` there would make `/` dynamic or leak one client's data into another's page. Keep it that way.

2. **`?goods=`:** read it in `HomeEntry` (a client component) with `useSearchParams`. Validate with `isGoodsShortcutCode`; anything else ⇒ `null`. `useSearchParams` in a statically rendered route needs a `<Suspense>` boundary or the build fails. Check how the codebase already handles that and match it. Pass `initialGoods` to `BookingForm`.

3. **Account type:** fetch from the existing `GET /api/client-profile` (`src/app/api/client-profile/route.ts:226`), once, on mount. Read that handler first to confirm what it returns for a client with no profile row.
   - Until it resolves, the account type is `null`. Task-10 and task-11 must treat `null` as "not known yet": show neither pallets nor the load-space picker, and do not gate on them.
   - A failed fetch or a missing profile resolves to `INDIVIDUAL`, the safe default. Business-only controls stay hidden, and the server still decides (task-06).

4. Use a string-literal type for the account type if the form avoids Prisma types elsewhere; check first.

5. This is the **only** `booking-form.tsx` edit in wave 2. Keep it to the signature, the fetch and two values.

6. `pnpm lint`, `pnpm typecheck`, `pnpm build`. Confirm the build output still lists `/[locale]` as ISR (revalidate 60), not dynamic.

## Acceptance Criteria

- [ ] `/` stays statically cached; `page.tsx` is unchanged
- [ ] `BookingForm` receives a validated shortcut code or `null`, and knows the account type (`null` while loading)
- [ ] No visible change to the form
- [ ] lint, typecheck and build pass
