# Task 10: Delivery-info dialog component

## Status

complete

## Wave

3

## Description

When a client picks a pickup or dropoff address, a small modal asks for the contact at that stop — name, phone with a `+995` prefix, and block/floor/room. This task builds that dialog as a standalone, fully controlled component. **It is not wired into the booking form here** — task 15 does that, in a later wave, because `booking-form.tsx` can only be edited by one task per wave.

Building it unwired means it can be developed in parallel with another task that is editing the booking form.

## Dependencies

**Depends on:** None for its own implementation (Wave 3)
**Blocks:** task-15-wire-stop-contacts.md

**Context from dependencies:** None. This is a self-contained new file.

## Files to Create

- `src/components/home/stop-contact-dialog.tsx` — the dialog

## Technical Details

### Implementation Steps

1. **Use the shadcn `Dialog`** at `src/components/ui/dialog.tsx`. Do **not** hand-roll a modal.

   The handoff prescribes a hand-rolled `position: fixed; inset: 0` flex-centred overlay and explicitly warns against translate-centring. **That warning is a prototype artifact** — it describes a conflict between its own `animation-fill-mode: both` keyframe and a translate transform. Radix plus `tw-animate-css` has no such conflict, and `src/components/ui/dialog.tsx:64` centres with `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` in 20+ existing components. Hand-rolling would mean re-implementing focus trap, scroll lock, `aria-modal` and Escape handling that `Dialog` already provides correctly.

2. **Retint `Dialog` to the landing token set.** Its defaults (`bg-popover`, `text-popover-foreground`) are the wrong token family for this page. Retint at the call site with `className`, following the precedent of the date Popover retint at `booking-form.tsx:986-995`. Target geometry: `w-[420px] max-w-full`, `rounded-[14px]`, `border border-line`, `bg-ink`, `p-[26px]`.

3. **Header row**: `flex items-center gap-3 mb-5`.
   - Step badge: `size-6 rounded-full`, accent background, white text, 11px/600. Content is `1` for pickup, `2` for dropoff. `aria-hidden="true"` — the dialog's accessible name carries the meaning, so the badge must not be announced.
   - Title: `DELIVERY INFO` — 13px/600, `tracking-[0.1em]`, uppercase, `text-muted`.

4. **Accessible name**: the `DialogTitle` must say which stop this is — `Delivery info for the pickup` / `Delivery info for the dropoff`. If the visible title is the styled `DELIVERY INFO`, supply the full name via a visually-hidden `DialogTitle` and let the styled text be decorative. `Dialog` requires a title; do not omit it.

5. **Address line**: the selected address at 13px, `leading-[1.4]`, `text-muted`, `mb-4`. This is not in the visual reference — it was added so the client can tell which of the two stops they are filling in. Keep it.

6. **Fields**: a `flex flex-col gap-3`. Each is `h-12`, `border border-line`, `rounded-lg`, `bg-ink`, `px-3.5`, 15px, `text-paper`.
   1. `Name` — placeholder `Name`, `aria-label="Name"`
   2. Phone — the `h-12` box is the *container*; inside it a static `+995` in `text-muted` (`shrink-0`), then a borderless transparent input with `pl-3`, placeholder `Phone number`, `inputMode="tel"`, `aria-label="Phone number"`
   3. `Block/Floor/Room` — `aria-label="Block, floor or room"`

7. **Focus ring** on all three: accent border plus a 3px accent ring at 20% opacity. Express with token utilities, not the raw `rgba(255,90,31,0.2)`.

8. **Helper text**: `All fields are optional.` — 12px, `text-muted`, `mt-3`.

9. **Actions**: right-aligned row, `gap-4`, `mt-[22px]`.
   - `Cancel` — text button, no border or background, `px-2 py-3`, 15px/600, accent text
   - `Save` — accent background, white text, `rounded-lg`, `px-8 py-[13px]`, 15px/600. Hover uses the **existing** `--landing-accent-hover` (#b4530f). Do **not** introduce the handoff's `#e94f18` — it is a second, lower-contrast token for a role that already has one.

10. **Save is never disabled.** All three fields are optional and there is no validation. Do not add required markers, do not add error states.

11. **Behaviour** — the component is fully controlled and owns no persistence:
    - `Save` calls `onSave(draft)` and then `onOpenChange(false)`
    - `Cancel`, Escape and a backdrop click all call `onOpenChange(false)` and **discard the draft**
    - The draft resets from `initialValue` every time the dialog opens, so re-opening a stop shows what was saved for it

12. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### Code Snippets

```tsx
export type StopContact = {
  name: string;
  phone: string;
  details: string;   // block / floor / room
};

export type StopContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "pickup" numbers the badge 1, "dropoff" numbers it 2. */
  stop: "pickup" | "dropoff";
  /** The selected address, shown so the client knows which stop this is. */
  address: string;
  /** Seeds the draft each time the dialog opens. */
  initialValue: StopContact | null;
  onSave: (contact: StopContact) => void;
};

export const EMPTY_STOP_CONTACT: StopContact = { name: "", phone: "", details: "" };
```

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`; the dark variant at `src/app/globals.css:29` is scoped to it, so dark utilities are inert here.
- Landing token utilities, not hex: `bg-ink`, `bg-surface`, `text-paper`, `text-muted`, `border-line`, accent utilities. Translate every literal in the handoff.
- British English. Sentence case. No "please", no exclamation marks, no emoji. Buttons are verb + object.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] Built on `src/components/ui/dialog.tsx`, not a hand-rolled overlay
- [ ] The dialog has an accessible name naming the stop; the numbered badge is `aria-hidden`
- [ ] All three fields carry the `aria-label`s specified above; the phone field has `inputMode="tel"` and a static `+995` prefix
- [ ] Save is never disabled and no field is validated
- [ ] Cancel, Escape and backdrop click all discard the draft
- [ ] The draft re-seeds from `initialValue` on every open
- [ ] Accent hover uses the existing `--landing-accent-hover`; `#e94f18` appears nowhere
- [ ] No hex literal and no inline `style` for colour appears in the file
- [ ] No `dark:` utility appears in the file
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

The component is not imported anywhere when this task completes. That is expected — task 15 wires it in. Make sure it is exported and typed well enough to be dropped in without changes.
