# Task 05: Company Dashboard UI — Register Driver + Assign Vehicle

## Status

complete

## Wave

3

## Rewritten 2026-08-07

This task originally targeted the old `company-dashboard.tsx` (plain light-theme page, inline expandable form sections, `CompanyDriverRoster` kept as a parallel "add by email" path). Both premises are gone: the company dashboard is now the tabbed dark `company-ops-dashboard` (drawer-based UI, see that sibling spec), and the old add-by-email flow has been removed entirely per an updated user decision (see `../requirements.md`). This version targets the actual current codebase.

## Description

This is the admin-facing half of the feature: a "+ Register driver" button on the company-ops-dashboard's Drivers tab, opening a new drawer where an admin fills in a new driver's details, optionally picks one of the company's unassigned fleet vehicles, and submits — calling the already-complete `POST /api/logistics-company/drivers/register` (task-03). On success it shows the generated temp password once, with a copy affordance, then closes and refreshes the roster.

## Dependencies

**Depends on:** task-03-driver-register-api.md (complete — `POST /api/logistics-company/drivers/register` accepts JSON `{ email, firstName, lastName, phone, city, vehicleId? }`, returns `201` with `{ userId, name, email, tempPassword, vehicleAssigned }` on success or `{ error: string }` on failure), and the `company-ops-dashboard` feature (complete — provides the shell, context, drawer chrome, and Drivers tab this task extends).

**Context from dependencies:** `src/components/dashboard/ops/ops-dashboard-context.tsx` exports `OpsDashboardContext`, `useOpsDashboard()` (→ `{ openDrawer, closeDrawer, activeDrawer, showToast }`), and `OpsDrawerState` — a union type currently `{type:"order",id} | {type:"driver",id} | {type:"add-vehicle"} | null`. `src/components/dashboard/ops/ops-dashboard-shell.tsx` owns rendering whichever drawer is active, passing each drawer only the data slice it needs; it already imports `CompanyDashboardData` and has `data.fleet: OpsVehicle[]` available (each vehicle has an `activeAssignment: {driverProfileId,driverUserId,driverName,isOnline} | null` field — `null` means unassigned). `src/components/dashboard/ops/ops-drivers-tab.tsx` is the roster table; it currently has a search input and no other controls. `src/lib/georgian-cities.ts` exports `GEORGIAN_CITY_OPTIONS` (built this session, in the same feature as the change-password page).

## Files to Modify

- `src/components/dashboard/ops/ops-dashboard-context.tsx` — add `{ type: "add-driver" }` to `OpsDrawerState`.
- `src/components/dashboard/ops/ops-dashboard-shell.tsx` — render the new drawer when active.
- `src/components/dashboard/ops/ops-drivers-tab.tsx` — add the "+ Register driver" button.

## Files to Create

- `src/components/dashboard/ops/drawers/add-driver-drawer.tsx` — the new registration form + credential-reveal drawer.

## Technical Details

### 1. `ops-dashboard-context.tsx` — extend the union

```ts
export type OpsDrawerState =
  | { type: "order"; id: string }
  | { type: "driver"; id: string }
  | { type: "add-vehicle" }
  | { type: "add-driver" }
  | null;
```

Purely additive. Every existing consumer of this type still compiles unchanged.

### 2. `add-driver-drawer.tsx` — the new drawer

`"use client"`, props `{ fleet: CompanyDashboardData["fleet"] }` (needed to populate the optional vehicle picker). Follow the house mutation pattern (local `useState` for each field + `submitting`/`error`, `fetch`, inline error text) exactly as every other reused form in this dashboard does — but this one is genuinely new (no existing component to wrap), and unlike the others it has two views: the form, then a one-time credential reveal.

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

type CreatedDriver = { name: string; email: string; tempPassword: string };

export function AddDriverDrawer({ fleet }: { fleet: CompanyDashboardData["fleet"] }) {
  const router = useRouter();
  const { closeDrawer, showToast } = useOpsDashboard();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedDriver | null>(null);
  const [copied, setCopied] = useState(false);

  // Only vehicles with no active driver can be offered — assigning an
  // already-assigned vehicle 400s against the register route's own
  // exclusivity check, so exclude those client-side rather than surface a
  // guaranteed-rejectable option.
  const availableVehicles = fleet.filter((v) => v.activeAssignment === null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/logistics-company/drivers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email,
          city,
          vehicleId: vehicleId === "" ? null : vehicleId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not register this driver.");
        return;
      }

      const result = (await response.json()) as { name: string; email: string; tempPassword: string };
      setCreated({ name: result.name, email: result.email, tempPassword: result.tempPassword });
      // Refresh now so the roster/fleet are current by the time the admin
      // clicks Done — the credential panel stays up regardless, since it
      // renders from local `created` state, not from the shell's data.
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser; the password stays
      // visible on screen either way, so this is a soft failure only.
    }
  }

  function handleDone() {
    showToast(`${created?.name ?? "Driver"} registered.`);
    closeDrawer();
  }

  if (created) {
    return (
      <OpsDrawerShell title="Driver created">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ops-text-muted">
            Share these credentials with {created.name} directly — they won&apos;t be shown again. They&apos;ll be
            asked to set their own password on first sign-in.
          </p>
          <div className="flex flex-col gap-2 rounded-lg border border-ops-border bg-ops-surface-raised p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-ops-text-muted">Email</span>
              <span className="font-ops">{created.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-text-muted">Temporary password</span>
              <span className="font-ops">{created.tempPassword}</span>
            </div>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2.5 text-sm font-medium"
            >
              {copied ? "Copied!" : "Copy password"}
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="flex-1 rounded-lg bg-ops-accent px-3 py-2.5 text-sm font-medium text-ops-accent-fg"
            >
              Done
            </button>
          </div>
        </div>
      </OpsDrawerShell>
    );
  }

  return (
    <OpsDrawerShell title="Register driver">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            First name
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Last name
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Phone
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="driver@example.com"
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          City
          <select
            required
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm"
          >
            <option value="" disabled>
              Select a city
            </option>
            {GEORGIAN_CITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Assign a vehicle (optional)
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm"
          >
            <option value="">No vehicle yet</option>
            {availableVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plateNumber} — {vehicle.make} {vehicle.model}
              </option>
            ))}
          </select>
          {availableVehicles.length === 0 ? (
            <span className="text-xs text-ops-text-muted">
              No unassigned vehicles in your fleet yet — register one from the Vehicles tab, or assign one later.
            </span>
          ) : null}
        </label>

        {error ? <p className="text-sm text-ops-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg disabled:opacity-50"
        >
          {submitting ? "Registering…" : "Register driver"}
        </button>
      </form>
    </OpsDrawerShell>
  );
}
```

### 3. `ops-dashboard-shell.tsx` — render it

Add alongside the existing three drawer branches:

```tsx
{activeDrawer?.type === "add-driver" ? <AddDriverDrawer fleet={data.fleet} /> : null}
```

(Plus the import: `import { AddDriverDrawer } from "@/components/dashboard/ops/drawers/add-driver-drawer";`)

### 4. `ops-drivers-tab.tsx` — the trigger button

Add a "+ Register driver" button next to the search input, matching the Vehicles tab's "+ Register vehicle" placement/style:

```tsx
<div className="flex items-center justify-between gap-3">
  <input /* existing search input, unchanged */ />
  <button
    type="button"
    onClick={() => openDrawer({ type: "add-driver" })}
    className="rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg"
  >
    + Register driver
  </button>
</div>
```

Wrap the existing search `<input>` and the new button in a flex row exactly like the Vehicles tab already does (`ops-vehicles-tab.tsx`'s top row is the reference layout) — read that file for the exact wrapping markup to mirror.

## Acceptance Criteria

- [ ] The Drivers tab shows a "+ Register driver" button that opens the new drawer.
- [ ] Submitting valid details with no vehicle selected creates the driver and switches the drawer to the one-time credentials view (email + temp password).
- [ ] The vehicle dropdown lists only fleet vehicles with no active assignment (`activeAssignment === null`).
- [ ] "Copy password" copies the temp password to the clipboard.
- [ ] Clicking "Done" closes the drawer, shows a toast, and the roster (already refreshed via `router.refresh()` right after creation) now includes the new driver.
- [ ] A server-side validation error (e.g. duplicate email) is shown inline in the form without losing the admin's other entered field values, and without switching to the credentials view.
- [ ] `pnpm lint` and `pnpm typecheck` pass.
- [ ] Manually verified: register a driver with a vehicle assigned, confirm the vehicle no longer appears as available in a second registration attempt, confirm the new driver appears on both the Drivers and Fleet tabs.

## Notes

- This task does not add a way to assign/reassign a vehicle to a driver who's already on the roster without one — that's the existing Vehicles tab's per-row assignment `<select>` (already built in `company-ops-dashboard`), not this drawer's job.
- The old `CompanyDriverRoster` component and the add-by-email endpoint no longer exist — do not reference or reintroduce them.
