# Task 05: Company Dashboard UI — Register Driver + Assign Vehicle

## Status

pending

## Wave

3

## Description

This is the admin-facing half of the feature: a "Register new driver" section on the company dashboard, next to the existing driver roster, where an admin fills in a new driver's details, optionally picks one of the company's unassigned fleet vehicles, and submits — calling the endpoint built in task-03. On success it shows the generated temp password once, with a copy button, then collapses back into the (refreshed) roster.

## Dependencies

**Depends on:** task-03-driver-register-api.md
**Blocks:** None

**Context from dependencies:** task-03 created `POST /api/logistics-company/drivers/register`, which accepts JSON `{ email, firstName, lastName, phone, city, vehicleId? }` and returns `201` with `{ userId, name, email, tempPassword, vehicleAssigned }` on success, or `{ error: string }` with a `4xx`/`5xx` status on failure. This task is a pure consumer of that contract — it doesn't need to know anything about how the endpoint is implemented internally.

## Files to Create

- `src/components/company-driver-register-form.tsx` — the new registration form component.

## Files to Modify

- `src/components/dashboard/company-dashboard.tsx` — fetch the company's unassigned fleet vehicles and render the new form in the Drivers section.

## Technical Details

### `src/components/company-driver-register-form.tsx`

Follow the same conventions as `src/components/company-driver-roster.tsx` and `src/components/company-vehicle-form.tsx`: `"use client"`, local `useState` per field, JSON `fetch`, `{error}` parsed and shown inline, `router.refresh()` on success, same Tailwind idioms. Unlike those two, this form starts collapsed behind a toggle button (it has more fields), and shows a one-time credentials panel on success instead of resetting back to itself immediately.

The city options are the same 25 `GeorgianCity` values `src/app/sign-up/page.tsx` already duplicates as a plain array (not imported from `@prisma/client`, to keep the server-only Prisma client out of the browser bundle) — copy that exact list:

```ts
const GEORGIAN_CITY_OPTIONS = [
  { value: "TBILISI", label: "Tbilisi" },
  { value: "BATUMI", label: "Batumi" },
  { value: "KUTAISI", label: "Kutaisi" },
  { value: "RUSTAVI", label: "Rustavi" },
  { value: "ZUGDIDI", label: "Zugdidi" },
  { value: "GORI", label: "Gori" },
  { value: "POTI", label: "Poti" },
  { value: "SAMTREDIA", label: "Samtredia" },
  { value: "KHASHURI", label: "Khashuri" },
  { value: "SENAKI", label: "Senaki" },
  { value: "ZESTAPONI", label: "Zestaponi" },
  { value: "MARNEULI", label: "Marneuli" },
  { value: "TELAVI", label: "Telavi" },
  { value: "AKHALTSIKHE", label: "Akhaltsikhe" },
  { value: "OZURGETI", label: "Ozurgeti" },
  { value: "KOBULETI", label: "Kobuleti" },
  { value: "CHIATURA", label: "Chiatura" },
  { value: "TSKALTUBO", label: "Tskaltubo" },
  { value: "SAGAREJO", label: "Sagarejo" },
  { value: "GARDABANI", label: "Gardabani" },
  { value: "BOLNISI", label: "Bolnisi" },
  { value: "AKHALKALAKI", label: "Akhalkalaki" },
  { value: "BORJOMI", label: "Borjomi" },
  { value: "KASPI", label: "Kaspi" },
  { value: "MTSKHETA", label: "Mtskheta" },
] as const;
```

Full component:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** A fleet vehicle with no current active driver assignment — the only kind
 * offered when registering a new driver (see task-05's server-side filter). */
export type AvailableFleetVehicle = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
};

const GEORGIAN_CITY_OPTIONS = [
  // ...full 25-entry array from above...
] as const;

type CreatedDriver = {
  name: string;
  email: string;
  tempPassword: string;
};

/**
 * Company-facing "register a new driver" form: creates the driver's account
 * directly (with a generated temp password) and optionally assigns one of the
 * company's unassigned fleet vehicles, via POST
 * /api/logistics-company/drivers/register. Distinct from
 * `CompanyDriverRoster`'s "link an existing driver by email" form — that one
 * stays unchanged for independent drivers who already have their own account.
 *
 * Starts collapsed behind a toggle (more fields than the roster's one-input
 * form warrant it). On success shows the temp password once, since it can't
 * be retrieved again afterward, then collapses back and refreshes the roster.
 */
export function CompanyDriverRegisterForm({
  companyVehicles,
}: {
  companyVehicles: AvailableFleetVehicle[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/logistics-company/drivers/register",
        {
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
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not register this driver.");
        return;
      }

      const result = (await response.json()) as {
        name: string;
        email: string;
        tempPassword: string;
      };

      setCreated({
        name: result.name,
        email: result.email,
        tempPassword: result.tempPassword,
      });
      setFirstName("");
      setLastName("");
      setPhone("");
      setEmail("");
      setCity("");
      setVehicleId("");
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
      // visible on screen either way, so this is a soft failure.
    }
  }

  function handleDone() {
    setCreated(null);
    setExpanded(false);
  }

  if (created) {
    return (
      <div className="flex flex-col gap-3 rounded border p-4">
        <p className="font-medium">Driver created</p>
        <p className="text-sm opacity-70">
          Share these credentials with {created.name} directly — they won&apos;t
          be shown again. They&apos;ll be asked to set their own password on
          first sign-in.
        </p>
        <div className="flex flex-col gap-1 text-sm">
          <span>
            Email: <span className="font-mono">{created.email}</span>
          </span>
          <span>
            Temporary password:{" "}
            <span className="font-mono">{created.tempPassword}</span>
          </span>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70"
          >
            {copied ? "Copied!" : "Copy password"}
          </button>
          <button
            type="button"
            onClick={handleDone}
            className="rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="self-start rounded border px-4 py-2 font-medium hover:opacity-70"
      >
        Register new driver
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded border p-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-sm">
          First name
          <input
            type="text"
            required
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Last name
          <input
            type="text"
            required
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            className="rounded border px-3 py-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Phone
        <input
          type="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="driver@example.com"
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        City
        <select
          required
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="rounded border px-3 py-2"
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
          onChange={(event) => setVehicleId(event.target.value)}
          className="rounded border px-3 py-2"
        >
          <option value="">No vehicle yet</option>
          {companyVehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plateNumber} — {vehicle.make} {vehicle.model}
            </option>
          ))}
        </select>
        {companyVehicles.length === 0 ? (
          <span className="text-xs opacity-60">
            No unassigned vehicles in your fleet yet — add one in the Fleet
            section above, or assign one later.
          </span>
        ) : null}
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Registering…" : "Register driver"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={submitting}
          className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

### `src/components/dashboard/company-dashboard.tsx` changes

1. Add the import:

   ```ts
   import { CompanyDriverRegisterForm } from "@/components/company-driver-register-form";
   ```

2. After the existing `company` fetch (which already includes `vehicles` and `drivers` — leave that query untouched), add a second, separate query for vehicles with no active assignment. This is deliberately a second query rather than adding `assignments` into the existing `vehicles` include, so the existing include (and `CompanyVehicleCard`'s prop type, which reads off that exact shape) is not disturbed:

   ```ts
   const availableVehicles = await prisma.vehicle.findMany({
     where: {
       companyId: company.id,
       assignments: { none: { unassignedAt: null } },
     },
     select: { id: true, plateNumber: true, make: true, model: true },
     orderBy: { createdAt: "desc" },
   });
   ```

   Place this after the `if (!company) { ... }` early-return block, since it needs `company.id` and there's nothing to query if the company profile doesn't exist yet.

3. In the Drivers section JSX, render the new form below the existing roster:

   ```tsx
   <div className="flex flex-col gap-6">
     <h2 className="text-2xl font-bold">
       Drivers <span className="opacity-60">({drivers.length})</span>
     </h2>
     <CompanyDriverRoster drivers={drivers} />
     <div className="flex flex-col gap-3">
       <h3 className="text-lg font-semibold">Register a new driver</h3>
       <CompanyDriverRegisterForm companyVehicles={availableVehicles} />
     </div>
   </div>
   ```

   Only the inner `<div>` wrapping `<h3>`/`<CompanyDriverRegisterForm>` is new; `<CompanyDriverRoster>` and its surrounding structure are unchanged.

## Acceptance Criteria

- [ ] The company dashboard's Drivers section shows the existing roster, then a collapsed "Register new driver" button below it.
- [ ] Expanding the form and submitting valid details with no vehicle selected creates the driver and shows the one-time credentials panel with the email and temp password.
- [ ] The vehicle dropdown lists only fleet vehicles with no current active assignment; after a vehicle is assigned to a driver, it no longer appears in the dropdown on the next page load (verify via `router.refresh()` after registration, or a manual reload).
- [ ] "Copy password" copies the temp password to the clipboard (verify `navigator.clipboard.writeText` is called with the right value; a manual click-and-paste check is also acceptable).
- [ ] Clicking "Done" collapses the panel back to the toggle button, and the roster above now includes the new driver.
- [ ] A server-side validation error (e.g. duplicate email) is shown inline in the expanded form without losing the admin's other entered field values.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not modify `src/components/company-driver-roster.tsx` or `src/app/api/logistics-company/drivers/route.ts` — the "link an existing independent driver by email" path stays exactly as it is today, as a separate, secondary affordance.
- This task does not add a way to assign/reassign a vehicle to a driver who's already on the roster without a vehicle — that's the reassignment feature explicitly called out as a Non-Goal in `requirements.md`.
