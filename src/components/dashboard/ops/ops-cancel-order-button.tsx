"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Company-facing control that calls off a delivery the company owns, via
 * POST /api/logistics-company/orders/{orderId}/cancel.
 *
 * Deliberately a mirror of `ClaimOrderButton`: same bare button, same inline
 * loading and error state (no `alert()`), same `router.refresh()` on success so
 * the server component re-renders with the cancelled order. Only the endpoint,
 * the wording and the dark-console styling differ — this one lives exclusively
 * inside the ops dashboard, so it uses the `ops-*` tokens rather than the light
 * theme's plain borders.
 *
 * The caller decides *when* to offer this: the route rejects an order that is
 * already terminal with a 409, whose message is surfaced verbatim below.
 *
 * `onSuccess` is optional and fires only after a successful cancellation, so a
 * host that renders this inside a drawer can close it and raise a toast.
 */
export function OpsCancelOrderButton({
  orderId,
  onSuccess,
}: {
  orderId: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(
        `/api/logistics-company/orders/${orderId}/cancel`,
        { method: "POST" },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not cancel this delivery.");
        return;
      }

      // Server component re-renders with the updated order data.
      router.refresh();
      try {
        onSuccess?.();
      } catch {
        // A bug in the caller's callback must not be reported as this
        // component's own failure: the cancellation succeeded and the refresh
        // already ran, so surfacing a network error here would be a lie.
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={submitting}
        className="flex-1 rounded-lg border border-ops-border bg-ops-surface-raised px-3 py-2.5 text-center text-sm font-medium text-ops-danger disabled:opacity-50"
      >
        {submitting ? "Cancelling…" : "Cancel order"}
      </button>
      {error ? <p className="text-xs text-ops-danger">{error}</p> : null}
    </div>
  );
}
