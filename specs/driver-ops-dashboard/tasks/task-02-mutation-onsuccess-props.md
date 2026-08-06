# Task 02: Optional `onSuccess` prop on reused mutation components

## Status

complete

## Wave

1

## Description

The order-detail drawer (task-08) and add-vehicle drawer (task-09) reuse three existing mutation components (`AcceptOrderButton`, `DeliveryLifecycleActions`, `VehicleForm`) unmodified in their core logic — same `fetch` + `router.refresh()` internals — but the new dashboard shell needs to show a toast (and, for some actions, close the drawer) right after a successful mutation. This task adds the same small, optional, backward-compatible `onSuccess` callback prop used in `specs/company-ops-dashboard/tasks/task-05-mutation-onsuccess-props.md`, called right after `router.refresh()` on the success path. No other logic changes. `DriverStatusToggle` is deliberately **not** touched — it manages its own local state rather than relying on `router.refresh()`, and nothing in this feature needs to hook its success path.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-08-order-detail-drawer.md, task-09-add-vehicle-drawer.md

**Context from dependencies:** None — this task only touches the three files' existing success paths (each fully reproduced below).

## Files to Modify

- `src/components/accept-order-button.tsx`
- `src/components/dashboard/delivery-lifecycle-actions.tsx`
- `src/components/vehicle-form.tsx`

## Technical Details

For every file below, add an optional `onSuccess?: () => void` to the component's props type, and call it (if provided) immediately after `router.refresh()` on the success path. Existing callers (`DriverBookings`, `DriverDashboard`) don't pass this prop, so nothing else breaks — verify with `grep -rn "AcceptOrderButton\|DeliveryLifecycleActions\|VehicleForm" src` that every current call site still compiles unchanged (they will, since the new prop is optional). Note `driver-bookings.tsx` itself is superseded by this feature's task-05, so by the time this repo is fully migrated there will be exactly one caller of each component (inside this feature) — but that migration happens in a later wave, so this task must not assume `driver-bookings.tsx` is gone yet.

### `src/components/accept-order-button.tsx`

Current:

```tsx
export function AcceptOrderButton({
  orderId,
  eligibleVehicles,
}: {
  orderId: string;
  eligibleVehicles: EligibleVehicle[];
}) {
  // ...
  async function handleAccept() {
    // ...
    try {
      const response = await fetch(/* ... */);
      if (!response.ok) { /* ...; return; */ }
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
export function AcceptOrderButton({
  orderId,
  eligibleVehicles,
  onSuccess,
}: {
  orderId: string;
  eligibleVehicles: EligibleVehicle[];
  onSuccess?: () => void;
}) {
  // ...
  async function handleAccept() {
    // ...
    try {
      const response = await fetch(/* ... */);
      if (!response.ok) { /* ...; return; */ }
      router.refresh();
      onSuccess?.();
    } catch { /* ... */ }
    finally { setSubmitting(false); }
  }
  // ...
}
```

### `src/components/dashboard/delivery-lifecycle-actions.tsx`

Same pattern — add `onSuccess?: () => void` alongside `orderId`, `status`. Call `onSuccess?.()` right after `router.refresh()` inside `submitTransition`'s success path (i.e. after the `if (!response.ok) {...; return;}` block) — this one function backs both the "start" and "complete" transitions, so `onSuccess` fires for either; the caller (task-08) does not get told which transition just happened and should not assume — see that task's notes for how it handles this.

### `src/components/vehicle-form.tsx`

Same pattern — add `onSuccess?: () => void` to `VehicleForm`'s props (currently takes no props at all: `export function VehicleForm() {`). Call `onSuccess?.()` after `router.refresh()` in `handleSubmit`, i.e. right after:

```tsx
form.reset();
setVehicleTypeCode("");
setSuccess(true);
router.refresh();
onSuccess?.();
```

## Acceptance Criteria

- [ ] All three components accept an optional `onSuccess?: () => void` prop and call it right after `router.refresh()` on their success path only (never on error paths).
- [ ] No other logic in any of the three files changes.
- [ ] Every existing call site of these three components still compiles with no changes required, since the new prop is optional.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
