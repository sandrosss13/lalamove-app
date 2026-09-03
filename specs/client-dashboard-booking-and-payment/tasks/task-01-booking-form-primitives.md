# Task 01: Booking-form primitives extraction + GEL currency

## Status

complete

## Wave

1

## Description

`src/components/home/booking-form.tsx` is ~1,445 lines and **eight** later features in this spec modify it. This task is the enabling refactor that makes those features tractable: extract the repeated card/tick/row primitives and shared constants into a sibling module, add the `disabled` prop that the later gating task needs, and fix the currency symbol throughout the file. It ships no user-visible feature except the currency correction.

Doing this first converts several later tasks from "edit the same 1,445-line file" into "add a sibling component plus one import line". Every later wave depends on it.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-12-body-type-picker.md, task-13-service-level-card.md

**Context from dependencies:** None. This is a foundation task.

## Files to Create

- `src/components/home/booking-form-primitives.tsx` — `StepCard`, `SelectedTick`, `BreakdownRow`, the pick-card class constants and the `VanGlyph` / `TruckGlyph` SVGs, lifted verbatim out of `booking-form.tsx`
- `src/components/home/booking-format.ts` — this screen's own formatters: `formatGel`, and any distance/weight helpers currently inlined

## Files to Modify

- `src/components/home/booking-form.tsx` — import the extracted primitives instead of declaring them; replace every `$` price with `formatGel(...)`; fix the stale `StepCard` doc comment

## Technical Details

### Implementation Steps

1. **Read `src/components/home/booking-form.tsx` in full first.** Everything below refers to line numbers as they stand today; they will shift as you edit.

2. **Extract into `booking-form-primitives.tsx`**, unchanged in behaviour:
   - `StepCard` (currently ~`:333-368`) and its props type
   - `SelectedTick` (the absolute-positioned orange tick, ~`:371-381`)
   - `BreakdownRow` (the label/value row used in the price breakdown)
   - The `PICK_CARD_*` class constants (~`:125-148`)
   - `VanGlyph` and `TruckGlyph` (the hand-written SVGs)
   - Leave `CREW_SIZE_OPTIONS` / `DEFAULT_CREW_SIZE` (~`:149-157`) in `booking-form.tsx` — they are used in exactly one place and moving them buys nothing.

   Mirror the convention of `src/components/driver-hub/hub-primitives.tsx`: a plain module of named exports, depending only on `src/components/ui/*`, `cn` and React.

3. **Add a `disabled?: boolean` prop to `StepCard`.** When true the card renders with `aria-disabled="true"`, `pointer-events-none` on its content region, and the whole card at reduced emphasis — border stays `border-line`, the numbered badge loses its accent fill and becomes `bg-surface text-muted`, and the title goes `text-muted`. Do **not** use `opacity-50` on the whole card; the disabled state must still be readable. Task 17 supplies the predicates; this task only adds the prop and the styling, defaulting to `false` so nothing changes yet.

4. **Fix the stale doc comment at ~`:341`**, which still calls "Additional details" the "unnumbered" card. It is step 6 today.

5. **Create `booking-format.ts`** with this screen's own `formatGel`. Per-screen formatter copies are the house convention — `src/components/driver-hub/screens/earnings-format.ts:11-15` records why a cross-screen import is deliberately avoided. Do **not** create a shared `src/lib/` currency module.

6. **Replace every `$` price face in `booking-form.tsx` with `formatGel(...)`.** The six sites today:

   | Line | What |
   |---|---|
   | `:892` | Transportation cost, booked-order confirmation panel |
   | `:902` | Helper Fee, booked-order confirmation panel |
   | `:911` | Total, booked-order confirmation panel |
   | `:1309` | Transportation cost, price breakdown |
   | `:1316` | Helper Fee, price breakdown |
   | `:1416` | Estimated total, fixed bottom bar |

   Also correct any copy that names a dollar amount in prose — the helper fee is **₾40**, not $20.

7. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Code Snippets

`src/components/home/booking-format.ts`:

```ts
// This screen owns its money formatting. A cross-screen import would tie the booking
// form's figures to a file another screen is free to change — the same trade
// src/components/driver-hub/screens/earnings-format.ts:11-15 documents.
//
// Order.price and every fare component are already in GEL major units. Nothing is divided.
const GEL_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// The locale is pinned, never the browser's: a client on a de-DE browser reading
// "₾1.200,50" beside a hard-coded "₾0.40" would see two different currencies.
export function formatGel(amountGel: number): string {
  return `₾${GEL_FORMAT.format(amountGel)}`;
}
```

`StepCard` disabled shape (adapt to the actual existing implementation):

```tsx
type StepCardProps = {
  step?: number;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  children: React.ReactNode;
};
```

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`, and the dark variant is scoped `&:is(.dark [data-landing-page], ...)` at `src/app/globals.css:29`. Dark utilities are inert here.
- Use landing token utilities, not hex: `bg-ink` (#ffffff), `bg-surface` (#faf9f6), `text-paper` (#201f1c), `text-muted` (#6b675f), `border-line` (#e7e4de), accent utilities (#ff5a1f). Accent hover is the existing `--landing-accent-hover` (#b4530f) — do **not** add `#e94f18`.
- `--font-price` (IBM Plex Mono) for every currency figure, distance and dimension, with `tabular-nums`.
- British English. No "please", no exclamation marks, no emoji. Sentence case. Buttons are verb + object.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] `booking-form-primitives.tsx` exports `StepCard`, `SelectedTick`, `BreakdownRow`, the pick-card constants and both glyphs; `booking-form.tsx` imports them and declares none of them locally
- [ ] `StepCard` accepts `disabled?: boolean`, defaulting to `false`, and renders a legible disabled state without `opacity-50` on the card
- [ ] `booking-format.ts` exports `formatGel`, pinned to `en-GB`, two decimals, `₾` prefix with no space
- [ ] No `$` remains anywhere in `booking-form.tsx`, in a price face or in prose
- [ ] The rendered booking page is visually identical to before, except that prices now read `₾`
- [ ] The stale `StepCard` doc comment about an "unnumbered" card is corrected
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

Do **not** touch the crew-size picker at `:1228-1279`, its constants at `:149-157`, or `const helperCount = crewSize - 1` at `:456`. The design handoff describes an older helper UI (a checkbox revealing `aria-pressed` buttons) that commit `e7a7441` already replaced with a better native-radio implementation. Rebuilding the handoff's version would be a regression.

This task must complete before any other task edits `booking-form.tsx`.
