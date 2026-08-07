"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsDrawerShell } from "@/components/dashboard/ops/ops-drawer-shell";

/** The slice of the register response this drawer shows back to the admin. */
type CreatedDriver = { name: string; email: string; tempPassword: string };

/** How long the copy button stays in its "Copied!" state, in ms. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * Slide-over that registers a brand-new driver account on the company's roster
 * via `POST /api/logistics-company/drivers/register`, optionally handing them a
 * fleet vehicle in the same call.
 *
 * Unlike the other drawers this one has two views: the registration form, then a
 * one-time credential reveal. The temporary password is returned by the endpoint
 * exactly once and is never readable again, so the second view is the only
 * chance the admin gets to pass it on — which is why it renders from local
 * `created` state rather than from the shell's data, and why nothing dismisses
 * it except the admin's own "Done".
 *
 * Takes the fleet because the optional vehicle picker is populated from it; it
 * is opened via `openDrawer({ type: "add-driver" })` from the Drivers tab, with
 * no associated row id.
 */
export function AddDriverDrawer({
  fleet,
}: {
  fleet: CompanyDashboardData["fleet"];
}) {
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
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Mirrors the shell's toast timer handling: the drawer unmounts as soon as the
  // admin clicks Done, which can happen while this timer is still pending.
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  // Only vehicles with no active driver can be offered — assigning an
  // already-assigned vehicle 400s against the register route's own exclusivity
  // check, so exclude those client-side rather than surface a
  // guaranteed-rejectable option.
  const availableVehicles = fleet.filter(
    (vehicle) => vehicle.activeAssignment === null,
  );

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
          // The empty option means "no vehicle yet"; the route reads null and an
          // absent value the same way.
          vehicleId: vehicleId === "" ? null : vehicleId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Reported inline rather than through a toast, and without touching any
        // field state: a rejected email or city is something the admin has to
        // correct in the form that is still on screen.
        setError(payload?.error ?? "Could not register this driver.");
        return;
      }

      const result = (await response.json()) as CreatedDriver;
      setCreated({
        name: result.name,
        email: result.email,
        tempPassword: result.tempPassword,
      });

      // Refresh now so the roster and fleet are current by the time the admin
      // clicks Done — the credential panel stays up regardless, since it renders
      // from local `created` state, not from the shell's data.
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
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(
        () => setCopied(false),
        COPIED_FEEDBACK_MS,
      );
    } catch {
      // Clipboard access can be denied by the browser (or unavailable outside a
      // secure context); the password stays visible on screen either way, so
      // this is a soft failure with nothing to report.
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
            Share these credentials with {created.name} directly — they
            won&apos;t be shown again. They&apos;ll be asked to set their own
            password on first sign-in.
          </p>

          <div className="flex flex-col gap-2 rounded-lg border border-ops-border bg-ops-surface-raised p-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-ops-text-muted">Email</span>
              <span className="font-ops break-all">{created.email}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-text-muted">Temporary password</span>
              <span className="font-ops break-all">{created.tempPassword}</span>
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2.5 text-sm font-medium hover:opacity-90"
            >
              {copied ? "Copied!" : "Copy password"}
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="flex-1 rounded-lg bg-ops-accent px-3 py-2.5 text-sm font-medium text-ops-accent-fg hover:opacity-90"
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
              onChange={(event) => setFirstName(event.target.value)}
              className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm focus-visible:border-ops-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Last name
            <input
              type="text"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm focus-visible:border-ops-accent"
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
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm focus-visible:border-ops-accent"
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
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm placeholder:text-ops-text-muted focus-visible:border-ops-accent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          City
          <select
            required
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm focus-visible:border-ops-accent"
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
            className="rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2 text-sm focus-visible:border-ops-accent"
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
              No unassigned vehicles in your fleet yet — register one from the
              Vehicles tab, or assign one later.
            </span>
          ) : null}
        </label>

        {error ? <p className="text-sm text-ops-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 rounded-lg bg-ops-accent px-4 py-2.5 text-sm font-medium text-ops-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Registering…" : "Register driver"}
        </button>
      </form>
    </OpsDrawerShell>
  );
}
