# Task 17: Progressive step gating

## Status

pending

## Wave

7

## Description

Every step of the booking form is disabled until the step before it has been answered. This runs last because it reads every other step's completion predicate — including the three steps added by earlier tasks in this spec.

There is **no gating at all** in the form today: the only `disabled` attributes are the calendar's past-date bound, the time `<select>`'s placeholder option, and the two bottom-bar buttons. This is entirely new work.

**This is the fifth and last of five sequential tasks editing `src/components/home/booking-form.tsx`.**

## Dependencies

**Depends on:** task-16-payment-step.md
**Blocks:** None

**Context from dependencies:**

task-01 added a `disabled?: boolean` prop to `StepCard` in `src/components/home/booking-form-primitives.tsx`. It defaults to `false` and has been unused until now. When true it renders `aria-disabled="true"`, `pointer-events-none` on the content region, the numbered badge in `bg-surface text-muted` instead of the accent fill, and the title in `text-muted` — deliberately **not** `opacity-50` on the whole card, so a disabled step stays readable.

Earlier tasks added three things to gate: task-12 a body-type picker in step 5, task-13 an unnumbered service-level card after step 6, and task-16 a payment step numbered 7 between step 6 and the service-level card.

The form's steps in final order: 1 Delivery date & time · 2 Route · 3 What are you moving? · 4 Total weight · 5 Recommended vehicle (body type + vehicle) · 6 Additional details (crew size) · 7 Payment · then the unnumbered Service level card · then Price breakdown.

## Files to Modify

- `src/components/home/booking-form.tsx` — one `disabled` predicate per step card

## Technical Details

### Implementation Steps

1. **Read `booking-form.tsx` in full first.** By this point it carries every feature in this spec, so read the current state rather than relying on line numbers from earlier tasks.

2. **Define one predicate per step**, each depending only on the steps before it. Derive them from existing state — do not introduce a parallel "step completed" state machine that can drift from the real values.

   | Step | Enabled when |
   |---|---|
   | 1 Delivery date & time | always |
   | 2 Route | a date **and** a time slot are chosen |
   | 3 What are you moving? | both addresses have resolved |
   | 4 Total weight | a cargo category is chosen |
   | 5 Recommended vehicle | a weight is chosen |
   | 6 Additional details | a vehicle type is chosen |
   | 7 Payment | a vehicle type is chosen (same as step 6 — it is a sibling, not a successor) |
   | Service level card | a vehicle type is chosen |

3. **Step 7 and the service-level card gate on the same condition as step 6.** Neither is a successor to it; all three become available once the vehicle is known. Step 7 in particular is **never** part of the blocking chain: leaving it unanswered must not prevent Calculate or Book delivery.

4. **Do not change `canCalculate` or `canSubmit`.** Gating is a presentation concern layered on top of the existing predicates. If a step is genuinely required for a quote, that requirement already lives in `canCalculate` — do not duplicate it here and risk the two disagreeing.

5. **A disabled step must say why.** Give each disabled card a short line naming what to do first — an imperative naming the fix, per the house copy rule. Wire it with `aria-describedby` on the card, because a disabled region drops out of the tab order and a `title` alone is unreachable.

   Examples: `Choose a date and time first.` · `Enter both addresses first.` · `Choose what you're moving first.` · `Choose a total weight first.` · `Choose a vehicle first.`

6. **Accessibility**: use `aria-disabled` and prevent interaction via `pointer-events-none` on the content region. Do **not** set the `disabled` attribute on every individual control inside — `aria-disabled` plus a non-interactive region keeps the step readable by a screen-reader user who is orienting themselves, which is the whole point of showing the step at all rather than hiding it.

7. **Do not hide any step.** All seven remain visible at all times; they are only de-emphasised. A client needs to see what the form will ask for.

8. **Check the scroll behaviour.** If the form scrolls to a step on completion, make sure it does not scroll to a still-disabled one.

9. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`.
- Landing token utilities, not hex.
- British English; a disabled control always carries a written reason; copy is an imperative naming the fix, never "invalid".
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] Each of the seven steps and the service-level card carries a `disabled` predicate matching the table above
- [ ] Predicates are derived from existing state; no parallel step-completion state was introduced
- [ ] Step 7 being unanswered never blocks Calculate or Book delivery
- [ ] `canCalculate` and `canSubmit` are unchanged
- [ ] Every disabled step shows a written reason wired via `aria-describedby`
- [ ] Disabled steps use `aria-disabled` and a non-interactive content region, not per-control `disabled`
- [ ] Disabled steps remain readable — no `opacity-50` on the card — and none is hidden
- [ ] Completing a step enables exactly the next one, with no dead state where nothing is enabled
- [ ] No `dark:` utility in the diff
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

Gating is the last change to this file for a reason: it reads every other step's completion state, so building it before the other steps exist would mean writing predicates against state that is not there yet.

Walk the whole form once by hand after implementing. The failure mode to look for is a step that never becomes enabled because its predicate references a value that only gets set further down the form.
