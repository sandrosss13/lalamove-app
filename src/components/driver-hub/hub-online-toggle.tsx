"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/** The endpoint that owns `DriverProfile.isOnline`. */
const STATUS_ENDPOINT = "/api/driver-profile/status";

const GENERIC_ERROR = "Could not update your online status.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/** Why the pill is disabled. Mirrors the 403 the endpoint returns. */
const NOT_ACTIVATED_TITLE =
  "Your account isn't approved yet. Finish onboarding to go online.";

export type HubOnlineToggleProps = {
  /** Current availability, from `resolveHubAccount()`. */
  isOnline: boolean;
  /** Whether this driver is activated and may therefore *go* online. */
  canToggleOnline: boolean;
};

/**
 * The header's availability pill: an 8px status dot plus "Online"/"Offline".
 *
 * Deliberately a plain `<button>` rather than a `Button` variant — the design's
 * pill is a fully-round 99px shape with its own padding, border and two colour
 * pairs, so it would be an override of every part of the variant it used.
 *
 * The mutation is the one the retired `DriverStatusToggle` established: the same
 * `PATCH` body (`{ isOnline }`), the same `{ error }` / `{ isOnline }` response
 * reading, and the same rule that the server's answer wins.
 *
 * ---------------------------------------------------------------------------
 * KNOWN GAP — the driver location beacon has no home. Re-home it before relying
 * on live driver positions.
 *
 * The old `src/components/driver-status-toggle.tsx` did two things this pill
 * deliberately does not, and it was deleted with the ops console (last present
 * at commit 7964f98; `git show 7964f98:src/components/driver-status-toggle.tsx`
 * is the full implementation):
 *
 *   1. It gated *going online* on an actual `navigator.geolocation` fix taken
 *      before the status PATCH, so a driver could never be marked online
 *      server-side while sharing no position. A denied or timed-out permission
 *      left them offline with "Location access is required to go online."
 *   2. While online it ran a beacon: `POST /api/driver-profile/location` with
 *      `{ lat, lng }`, fired once immediately and then every 15s from an effect
 *      keyed on `isOnline`, torn down on going offline or unmounting. A failed
 *      ping surfaced as a non-blocking warning, not an error.
 *
 * `/api/driver-profile/location` is still live and still has no other caller,
 * so `DriverProfile`'s stored position now only goes stale — nothing in the app
 * writes it. This pill is the wrong owner for a background side effect with its
 * own permission prompt and lifecycle, which is why the beacon was not folded
 * in here rather than being reinstated in a hurry. Whoever re-homes it should
 * put it in the hub shell or a dedicated provider, where its lifetime is the
 * session rather than one header control.
 * ---------------------------------------------------------------------------
 *
 * Success refreshes the route instead of flipping local state, so the pill, the
 * Today screen and anything else reading `isOnline` all move together off one
 * server read — there is no second source of truth to drift.
 */
export function HubOnlineToggle({
  isOnline,
  canToggleOnline,
}: HubOnlineToggleProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // `router.refresh()` is fire-and-forget on its own; a transition is what
  // makes "the server has not answered yet" observable, so the pill stays
  // disabled until the fresh `isOnline` actually arrives.
  const [refreshing, startTransition] = useTransition();

  // Going *offline* is never gated — the endpoint allows it regardless of
  // activation precisely so a driver deactivated mid-shift cannot get stuck
  // marked online. Disabling on `!canToggleOnline` alone would re-introduce
  // exactly that trap, so an already-online driver keeps a working control.
  const disabled = !canToggleOnline && !isOnline;
  const busy = submitting || refreshing;

  async function handleToggle() {
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch(STATUS_ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: !isOnline }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // The endpoint's own message is more useful than ours ("Complete your
        // driver profile…", "Your account isn't approved yet…").
        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  const label = isOnline ? "Online" : "Offline";

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          void handleToggle();
        }}
        disabled={disabled || busy}
        // `aria-pressed` states the toggle's value; the visible label already
        // reads "Online"/"Offline", so the two agree rather than conflict.
        aria-pressed={isOnline}
        title={disabled ? NOT_ACTIVATED_TITLE : undefined}
        className={cn(
          "flex cursor-pointer items-center gap-[9px] rounded-full border px-[15px] py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          isOnline
            ? "border-[oklch(96.2%_0.044_156.743)] bg-[oklch(96.2%_0.044_156.743)] text-[oklch(44.8%_0.119_151.328)]"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full",
            isOnline
              ? "bg-[oklch(59.6%_0.145_163.225)]"
              : "bg-muted-foreground",
          )}
        />
        {busy ? "Updating…" : label}
      </button>

      {/* Inline rather than an `alert()`: the failure belongs next to the
          control that caused it, and a modal would block the whole hub over a
          transient network blip. */}
      {error ? (
        <p
          role="alert"
          className="max-w-[220px] text-right text-[11px] text-[oklch(44.4%_0.177_26.899)]"
        >
          {error}
        </p>
      ) : null}

      {disabled ? (
        // `title` is not reliably announced, so the reason is also real text
        // for assistive tech — the same approach `<SampleNote />` takes.
        <span className="sr-only">{NOT_ACTIVATED_TITLE}</span>
      ) : null}
    </div>
  );
}
