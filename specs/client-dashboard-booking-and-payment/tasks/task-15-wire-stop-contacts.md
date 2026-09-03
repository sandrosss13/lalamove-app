# Task 15: Wire the delivery-info popup into the Route step

## Status

pending

## Wave

5

## Description

Selecting a pickup or dropoff address from the Google Places autocomplete must open the delivery-info dialog for that stop. This task wires the dialog built in task 10 into step 2 of the booking form and sends the captured contacts with the order.

The trigger is subtler than the handoff assumes, and getting it wrong opens the dialog on every keystroke — read the Technical Details carefully.

**This is the third of five sequential tasks editing `src/components/home/booking-form.tsx`.**

## Dependencies

**Depends on:** task-10-stop-contact-dialog.md, task-13-service-level-card.md
**Blocks:** task-16-payment-step.md

**Context from dependencies:**

task-10 created `src/components/home/stop-contact-dialog.tsx`, exporting:

```tsx
export type StopContact = { name: string; phone: string; details: string };
export const EMPTY_STOP_CONTACT: StopContact;
export type StopContactDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: "pickup" | "dropoff";       // numbers the badge 1 or 2
  address: string;                   // shown so the client knows which stop this is
  initialValue: StopContact | null;  // re-seeds the draft on every open
  onSave: (contact: StopContact) => void;
};
```

It is fully controlled, owns no persistence, and discards its draft on Cancel, Escape or a backdrop click. It is currently imported by nothing.

task-13 added the service-level card and its state, and made `Calculate`/`Book delivery` coexist. It deliberately kept `serviceLevel` **out** of the quote-invalidation dependency array — leave that as it is.

## Files to Modify

- `src/components/home/booking-form.tsx` — step 2 (~`:1040-1066`), the state block, the submit handler
- `src/components/address-autocomplete.tsx` — add a selection callback (see step 3)

## Technical Details

### Implementation Steps

1. **Read both files in full first.**

2. **State**:

   ```tsx
   const [contacts, setContacts] = useState<{
     pickup: StopContact | null;
     dropoff: StopContact | null;
   }>({ pickup: null, dropoff: null });

   const [contactModalFor, setContactModalFor] = useState<"pickup" | "dropoff" | null>(null);
   ```

   The dialog owns its own draft; the form only stores saved values and which stop is open.

3. **THE TRIGGER — this is the part the handoff gets wrong.**

   The handoff says the popup fires when `AddressAutocomplete`'s `onLocationChange` resolves a place. It does not work that way. `onLocationChange` fires on **both** selection and typing — its own prop doc says so at `src/components/address-autocomplete.tsx:49-53`:

   - `handleChange` (every keystroke) calls `onLocationChange?.(null)` at `:360`
   - `loadDetails` calls `onLocationChange?.(details.location)` at `:330` — the only non-null call

   So wiring the dialog to `onLocationChange` naively opens it on every keystroke.

   Worse, `loadDetails` is an **async fetch to `/api/geocode/details` that is allowed to fail silently**: `:307-309` returns bare on `!response.ok`, `:317-320` on missing details or an abort, and `:339-344` catches and — per its own comment — stays quiet. So the address can land in the field while the non-null callback never fires and the dialog never opens.

   **Do this instead:** add a new `onPlaceSelected?: (label: string) => void` prop to `AddressAutocomplete`, called synchronously from `handleSelect` (`:364-371`) — the click handler, which always fires. Wire the dialog to that. Pass the suggestion's display text so the dialog's address line has something immediately; if the async details resolve later with a better string, update the line then. **Do not gate the dialog on an async call that is permitted to fail.**

   Adding a prop is additive — every existing caller keeps working untouched.

4. **Transitions**:
   - `onPlaceSelected` for a field → `setContactModalFor(field)`; the dialog seeds its draft from `contacts[field]`
   - Save → write into `contacts[field]`, close
   - Cancel / Escape / backdrop → close only; **the address stays in the field**
   - Re-selecting an address re-opens the dialog **pre-filled with whatever was saved for that stop**

5. **Nothing is rendered on the Route card after Save** — no summary line, no "edit" link. This is a deliberate product decision confirmed with the designer. Do not add one.

6. **Contacts do not invalidate the quote.** They have no effect on price. Do not add them to the invalidation effect's dependency array.

7. **Reset on rebook.** The two address fields are remounted after a booking via `addressFieldsKey` (~`:1042-1044`). Clear `contacts` and `contactModalFor` in the same place, or a new booking inherits the previous one's contacts.

8. **Submit**: send the contacts with the order. `POST /api/orders` (task-08) accepts:

   ```ts
   pickupContact?:  { name?: string; phone?: string; details?: string };
   dropoffContact?: { name?: string; phone?: string; details?: string };
   ```

   The server trims, caps length, and stores empty strings as `null`. Send `undefined` rather than an object of empty strings when a stop has no contact.

9. Run `pnpm lint`, `pnpm typecheck`, `pnpm build`.

### House rules that apply to every task in this spec

- **Never write a `dark:` utility.** The booking page does not carry `data-landing-page`.
- Landing token utilities, not hex.
- British English, sentence case, no exclamation marks.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` must pass.

## Acceptance Criteria

- [ ] `AddressAutocomplete` gains an additive `onPlaceSelected` prop called synchronously from `handleSelect`; every existing caller still compiles and behaves identically
- [ ] The dialog opens on suggestion **selection** only — typing never opens it
- [ ] The dialog still opens when `/api/geocode/details` fails or is slow
- [ ] Cancel, Escape and backdrop click discard the draft and leave the address in the field
- [ ] Re-selecting an address re-opens the dialog pre-filled with that stop's saved values
- [ ] The pickup dialog shows badge `1`, the dropoff dialog badge `2`
- [ ] Nothing is rendered on the Route card after Save
- [ ] Contacts do not invalidate the quote
- [ ] Contacts reset when the address fields remount after a booking
- [ ] Both contacts are sent with the order; a stop with no contact sends `undefined`
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm build` pass

## Notes

`AddressAutocomplete` already expands a structured sub-form (street / city / state / postal / country) beneath the input after a selection, recomposing the address string as those parts change (`:373-383`). The dialog's Block/Floor/Room sits alongside that, not inside it — they capture different things and neither should overwrite the other.
