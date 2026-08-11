"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

/** The two statuses a driver can move a delivery on from. */
type LifecycleStatus = "ACCEPTED" | "IN_TRANSIT";

/**
 * Driver-facing lifecycle controls for a delivery assigned to them: starting it
 * (ACCEPTED → IN_TRANSIT) and closing it (IN_TRANSIT → COMPLETED).
 *
 * Completion carries the loading/unloading minutes, because the app runs no live
 * waiting timer — the driver reports the total once, and the server charges only
 * the part beyond the vehicle type's free buffer. It defaults to 0 so a delivery
 * with no overtime is a single click.
 *
 * Loading and error state are surfaced inline (no `alert()`), and a successful
 * transition refreshes the server component so the card reflects the new status.
 *
 * `onSuccess` is optional and fires only after a successful transition — either
 * one, since a single helper backs both — so a host that renders this inside a
 * drawer can close it and raise a toast.
 */
export function DeliveryLifecycleActions({
  orderId,
  status,
  onSuccess,
}: {
  orderId: string;
  status: LifecycleStatus;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const waitingMinutesId = useId();
  const [waitingMinutes, setWaitingMinutes] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Posts a lifecycle transition. Both endpoints answer with the same
   * `{ error }` shape, so one helper covers them; the endpoint's own message is
   * surfaced verbatim, since "not yours" and "wrong status" need different
   * actions from the driver.
   */
  async function submitTransition(
    endpoint: "start" | "complete",
    body?: { waitingMinutes: number },
  ) {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(`/api/orders/${orderId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not update this delivery.");
        return;
      }

      // Server component re-renders with the updated order data.
      router.refresh();
      try {
        onSuccess?.();
      } catch {
        // A bug in the caller's callback must not be reported as this
        // component's own failure: the transition succeeded and the refresh
        // already ran, so surfacing a network error here would be a lie.
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleComplete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // `<input type="number">` still hands back a string, and an empty field
    // parses as NaN — checked here so the request is never sent with junk.
    const minutes = Number(waitingMinutes);
    if (!Number.isInteger(minutes) || minutes < 0) {
      setError("Waiting time must be a whole number of minutes.");
      return;
    }

    void submitTransition("complete", { waitingMinutes: minutes });
  }

  if (status === "ACCEPTED") {
    return (
      <div className="mt-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => void submitTransition("start")}
          disabled={submitting}
          className="self-start rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Starting…" : "Start delivery"}
        </button>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleComplete} className="mt-3 flex flex-col gap-2">
      <label htmlFor={waitingMinutesId} className="text-sm opacity-60">
        Loading &amp; unloading time (minutes)
      </label>
      <input
        id={waitingMinutesId}
        type="number"
        min={0}
        step={1}
        value={waitingMinutes}
        onChange={(event) => setWaitingMinutes(event.target.value)}
        disabled={submitting}
        className="w-32 rounded border px-3 py-1.5 text-sm disabled:opacity-50"
      />
      <span className="text-xs opacity-60">
        Only the time beyond this vehicle type&apos;s free allowance is charged.
      </span>

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Completing…" : "Complete delivery"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
