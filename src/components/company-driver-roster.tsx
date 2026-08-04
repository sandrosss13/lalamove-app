"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One driver on the company's roster. Matches an entry of
 * `GET /api/logistics-company/drivers` exactly, so a server component can
 * either pass that response straight through or build the same shape from its
 * own `driverProfile` query.
 */
export type CompanyRosterDriver = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  isOnline: boolean;
};

/**
 * Company-facing driver roster: add an existing driver by email, and remove one
 * again.
 *
 * Adding is a lookup, not an invitation — the driver must already have signed
 * up as a driver, completed their profile, and not belong to another company —
 * so the API's specific rejection is surfaced verbatim rather than flattened
 * into "could not add driver": every one of those cases needs a different
 * action from the company.
 *
 * `drivers` is server-rendered by the page, and both mutations end in
 * `router.refresh()` so the list re-renders from the database rather than from
 * optimistic local state — the same pattern `VehicleForm` and
 * `RemoveVehicleButton` use.
 */
export function CompanyDriverRoster({
  drivers,
}: {
  drivers: CompanyRosterDriver[];
}) {
  const router = useRouter();

  const [driverEmail, setDriverEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  // Keyed by user id: only the row being removed shows its spinner and error.
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeErrors, setRemoveErrors] = useState<Record<string, string>>({});

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAddError(null);
    setAddSuccess(null);
    setAdding(true);

    try {
      const response = await fetch("/api/logistics-company/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverEmail }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The address stays in the field so a typo can be corrected in place.
        setAddError(payload?.error ?? "Could not add this driver.");
        return;
      }

      const added = (await response.json().catch(() => null)) as {
        name?: string;
      } | null;

      setDriverEmail("");
      setAddSuccess(
        added?.name
          ? `${added.name} joined your roster.`
          : "Driver joined your roster.",
      );
      router.refresh();
    } catch {
      setAddError("Network error. Please check your connection and try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    setRemoveErrors((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
    setRemovingUserId(userId);

    try {
      const response = await fetch(`/api/logistics-company/drivers/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setRemoveErrors((current) => ({
          ...current,
          [userId]: payload?.error ?? "Could not remove this driver.",
        }));
        return;
      }

      // Server component re-renders without the removed driver.
      router.refresh();
    } catch {
      setRemoveErrors((current) => ({
        ...current,
        [userId]: "Network error. Please check your connection and try again.",
      }));
    } finally {
      setRemovingUserId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {drivers.length === 0 ? (
        <p className="text-sm opacity-70">
          No drivers yet — add one by their account email below.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {drivers.map((driver) => (
            <li
              key={driver.userId}
              className="flex flex-col gap-1 rounded border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-medium">{driver.name}</span>
                  <span className="text-sm opacity-70">{driver.email}</span>
                  <span className="text-sm opacity-70">{driver.phone}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm opacity-70">
                    {driver.isOnline ? "Online" : "Offline"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(driver.userId)}
                    disabled={removingUserId === driver.userId}
                    aria-label={`Remove ${driver.name} from your roster`}
                    className="rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
                  >
                    {removingUserId === driver.userId ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
              {removeErrors[driver.userId] ? (
                <p className="text-sm text-red-600">
                  {removeErrors[driver.userId]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Driver email
          <input
            type="email"
            required
            value={driverEmail}
            onChange={(event) => setDriverEmail(event.target.value)}
            placeholder="driver@example.com"
            className="rounded border px-3 py-2"
          />
          <span className="text-xs opacity-60">
            The driver needs an account of their own and must not already belong
            to a company.
          </span>
        </label>

        {addError ? <p className="text-sm text-red-600">{addError}</p> : null}
        {addSuccess ? (
          <p className="text-sm text-green-700">{addSuccess}</p>
        ) : null}

        <button
          type="submit"
          disabled={adding}
          className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add driver"}
        </button>
      </form>
    </div>
  );
}
