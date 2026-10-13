# Task 09: Item list picker component (standalone, unwired)

## Status

complete

## Wave

3

## Description

The new step-4 control: a self-contained, controlled component in `src/components/home/item-list-picker.tsx`. It lets a client:

- search and browse the catalogue
- set quantities
- add custom items
- (business only) describe the load as pallets

Under the list it shows a running load summary. It is built and reviewed in isolation; task-10 mounts it. Keeping it out of `booking-form.tsx` is the point. That file is ~3,900 lines.

## Dependencies

**Depends on:** task-02, task-03, task-05
**Blocks:** task-10

## Files to Modify

- `src/components/home/item-list-picker.tsx` — new
- `src/components/home/item-list-format.ts` — new (per-screen formatter, per house convention)
- `src/messages/en/home.json`, `src/messages/ka/home.json` — `itemListPicker.*`

## Technical Details

### Implementation Steps

1. **Read** `booking-form-primitives.tsx` (pick-card classes, `SelectedTick`), the crew picker and load-space picker in `booking-form.tsx` (native-radio `fieldset` pattern), and `stop-contact-dialog.tsx` (how a standalone component was built for later wiring). `src/components/ui` has `popover` but **no `command`**, and `cmdk` is not installed. Build the search as an ARIA combobox (input + `listbox`, arrow keys, Enter, Escape) on the existing `Popover`. Do not add a dependency without asking.

2. **Props (controlled):**

   ```ts
   {
     accountType: "INDIVIDUAL" | "BUSINESS" | null;   // null while loading ⇒ treat as individual, hide pallets
     initialGroup: ItemGroup | "ALL" | null;   // from the shortcut
     mode: "items" | "pallets"; onModeChange;
     lines: PickerLine[]; onLinesChange;       // PickerLine = catalogue | custom | pallet, with a stable client id
     catalogue: CatalogueItem[]; catalogueLoading; catalogueError;
     disabled?: boolean;
   }
   ```

   The parent owns state so the form can submit it and invalidate the quote on change.

3. **Items mode:**
   - **Search:** a combobox over `searchCatalogue`, with a placeholder like "Search: sofa, fridge, boxes…". Picking an entry adds a line with quantity 1, or increments it if already listed.
   - **Browse:** group chips under the search, scrolled to `initialGroup`. Tapping an item adds it the same way.
   - **Lines:** label, `−`/`+` stepper with a numeric input (1–99), remove button. Steppers are real buttons with `aria-label`s naming the item.
   - **Other item:** a button that opens an inline row with:
     - label
     - quantity
     - size as S / M / L / XL native radios, with a "Know the exact size?" disclosure for L/W/H/kg inputs, bounded by `CARGO_MEASUREMENT_BOUNDS`
   - **Empty state:** "Add what you're moving. Rough is fine — we'll pick a vehicle that fits."

4. **Pallets mode** (business only; the Items | Pallets switch is a native radio pair, hidden for individuals):
   - Pallet type: EUR 1.2 × 0.8 m / Industrial 1.2 × 1.0 m.
   - What's on them: General goods / Building materials / Industrial supplies / Chilled (task-02 `PALLET_CONTENTS`).
   - Count (1–33).
   - Height per pallet, default 1.2 m.
   - Weight per pallet: Light ~150 / Medium ~400 / Heavy ~800 kg radios, or exact.
   - One pallet group per line; "Add another pallet type" adds a line.
   - Switching mode keeps the other mode's lines in state, but only the active mode's lines are submitted. Say so in a comment and in the parent contract.

5. **Running summary** below the list, `aria-live="polite"`. It reads from `planLoad(lines)`:

   `~320 kg · ~2.1 m³ · largest item 2.0 × 0.9 × 0.8 m`

   - All figures in `--font-price`, `tabular-nums`.
   - Formatters in `item-list-format.ts`, `en-GB`-pinned.
   - If `plan.body.kind === "conflict"`, show the conflict alert (`role="alert"`) from requirements: "Chilled goods and open-chassis items cannot travel together. Book them separately."

6. House rules: landing tokens only, no `dark:`, British English, sentence case.

7. **Verify it renders.** It is not mounted, so add a temporary local-only harness page, or mount it behind a dev-only flag, and exercise it with the `run` skill or Playwright: add, increment, remove, custom, pallets, search in Georgian. **Remove the harness before finishing.**

8. `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Acceptance Criteria

- [ ] Controlled component; no fetching inside except via the passed catalogue
- [ ] Search, browse, quantities, custom item and pallets mode work by keyboard
- [ ] Pallets mode never renders for individuals
- [ ] Summary reflects `planLoad` and announces politely; conflict alert shown
- [ ] No harness left behind
