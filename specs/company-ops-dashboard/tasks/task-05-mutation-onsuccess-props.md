# Task 05: Optional `onSuccess` prop on reused mutation components

## Status

complete

## Wave

1

## Description

The order-detail drawer (task-13) and add-vehicle drawer (task-15) reuse four existing mutation components (`ClaimOrderButton`, `CompanyDispatchForm`, `CompanyVehicleForm`, `CompanyRemoveVehicleButton`) unmodified in their core logic — same `fetch` + `router.refresh()` internals — but the new dashboard shell needs to close the drawer and show a toast right after a successful mutation, which none of these components currently support (they only know how to refresh the server component tree). This task adds one small, optional, backward-compatible `onSuccess` callback prop to each, called right after `router.refresh()` on the success path. No other logic changes.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-13-order-detail-drawer.md, task-15-add-vehicle-drawer.md

**Context from dependencies:** None — this task only touches the four files' existing success paths (each fully reproduced below).

## Files to Modify

- `src/components/dashboard/claim-order-button.tsx`
- `src/components/dashboard/company-dispatch-form.tsx`
- `src/components/company-vehicle-form.tsx`
- `src/components/company-remove-vehicle-button.tsx`

## Technical Details

For every file below, the change is the same shape: add an optional `onSuccess?: () => void` to the component's props type, and call it (if provided) immediately after `router.refresh()` on the success path. Existing callers (`CompanyBookings`, any other current usage) don't pass this prop, so nothing else breaks — verify with `grep -rn "ClaimOrderButton\|CompanyDispatchForm\|CompanyVehicleForm\|CompanyRemoveVehicleButton" src` that every current call site still compiles unchanged after your edit (they will, since the new prop is optional).

### `src/components/dashboard/claim-order-button.tsx`

Current:

```tsx
export function ClaimOrderButton({ orderId }: { orderId: string }) {
  // ...
  async function handleClaim() {
    // ...
    try {
      const response = await fetch(/* ... */);
      if (!response.ok) { /* ... */ return; }
      // Server component re-renders with the updated order data.
      router.refresh();
    } catch { /* ... */ }
    finally { setSubmitting(false); }
  }
  // ...
}
```

Change to:

```tsx
export function ClaimOrderButton({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess?: () => void;
}) {
  // ...
  async function handleClaim() {
    // ...
    try {
      const response = await fetch(/* ... */);
      if (!response.ok) { /* ... */ return; }
      // Server component re-renders with the updated order data.
      router.refresh();
      onSuccess?.();
    } catch { /* ... */ }
    finally { setSubmitting(false); }
  }
  // ...
}
```

### `src/components/dashboard/company-dispatch-form.tsx`

Same pattern — add `onSuccess?: () => void` to the props destructured alongside `orderId`, `drivers`, `vehicles`; call `onSuccess?.()` right after `router.refresh()` inside `handleSubmit`'s success path (after the `if (!response.ok) { ...; return; }` block).

### `src/components/company-vehicle-form.tsx`

Same pattern — add `onSuccess?: () => void` to `CompanyVehicleForm`'s props (currently takes no props at all: `export function CompanyVehicleForm() {`). Call `onSuccess?.()` after `router.refresh()` in `handleSubmit`, i.e. right after:

```tsx
form.reset();
setVehicleTypeCode("");
setSuccess(true);
router.refresh();
onSuccess?.();
```

### `src/components/company-remove-vehicle-button.tsx`

Same pattern — add `onSuccess?: () => void` alongside `vehicleId`, `plateNumber`. Call `onSuccess?.()` right after `router.refresh()` in `handleRemove`'s success path.

## Acceptance Criteria

- [ ] All four components accept an optional `onSuccess?: () => void` prop and call it right after `router.refresh()` on their success path only (never on error paths).
- [ ] No other logic in any of the four files changes.
- [ ] Every existing call site of these four components (grep `src/` to find them) still compiles with no changes required, since the new prop is optional.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
