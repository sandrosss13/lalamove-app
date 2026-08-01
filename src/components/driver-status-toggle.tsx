"use client";

import { useEffect, useState } from "react";

/** How often an online driver broadcasts their position to the server. */
const LOCATION_PING_INTERVAL_MS = 15000;

/**
 * Geolocation options for every fix we take. `maximumAge` matches the ping
 * interval so a cached fix is reused only while it is fresher than the next
 * scheduled ping, and `timeout` bounds how long a stuck GPS lock can hang the
 * "Go online" click.
 */
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: LOCATION_PING_INTERVAL_MS,
};

const LOCATION_REQUIRED_MESSAGE = "Location access is required to go online.";
const PING_FAILED_MESSAGE = "Could not share your latest location.";

/**
 * Promise wrapper around the callback-based Geolocation API. Rejects when the
 * browser has no geolocation support, when the user denies permission, and when
 * a fix times out — callers treat all three the same way ("no position").
 */
function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is unavailable in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      GEOLOCATION_OPTIONS,
    );
  });
}

/**
 * Driver-facing availability toggle plus location beacon.
 *
 * Going online is gated on an actual position fix *before* the status PATCH is
 * sent, so a driver can never end up marked online server-side while sharing no
 * location — a denied permission simply leaves them offline with an inline
 * message. While online, the component pings
 * POST /api/driver-profile/location immediately and then every
 * `LOCATION_PING_INTERVAL_MS`; the interval is owned by an effect keyed on
 * `isOnline`, so going offline or unmounting stops the beacon.
 *
 * `initialIsOnline` comes from the server-rendered driver profile so the first
 * paint already shows the correct state.
 */
export function DriverStatusToggle({
  initialIsOnline,
}: {
  initialIsOnline: boolean;
}) {
  const [isOnline, setIsOnline] = useState(initialIsOnline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Transient ping failures are a warning, not a blocking error: the driver is
  // still online and the next tick may well succeed.
  const [pingWarning, setPingWarning] = useState<string | null>(null);

  // Location beacon. Runs only while online, and always tears its interval down
  // on the way out (offline toggle or unmount).
  useEffect(() => {
    if (!isOnline) {
      return undefined;
    }

    // Guards against a ping that resolves after cleanup writing to state.
    let cancelled = false;

    async function sendLocationPing() {
      try {
        const position = await getCurrentPosition();
        if (cancelled) {
          return;
        }

        const response = await fetch("/api/driver-profile/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        });

        if (!cancelled) {
          setPingWarning(response.ok ? null : PING_FAILED_MESSAGE);
        }
      } catch {
        // Permission revoked mid-session, timed-out fix, or network error.
        if (!cancelled) {
          setPingWarning(PING_FAILED_MESSAGE);
        }
      }
    }

    // Fire once straight away so the first position doesn't wait a full tick.
    void sendLocationPing();
    const intervalId = setInterval(() => {
      void sendLocationPing();
    }, LOCATION_PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isOnline]);

  /**
   * PATCH the availability flag. Returns the value the server confirmed, or
   * `null` if the request failed (in which case `error` has been set).
   */
  async function updateStatus(nextIsOnline: boolean): Promise<boolean | null> {
    try {
      const response = await fetch("/api/driver-profile/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOnline: nextIsOnline }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not update your online status.");
        return null;
      }

      const payload = (await response.json().catch(() => null)) as {
        isOnline?: boolean;
      } | null;
      // Trust the server's value; fall back to the requested one if the body
      // could not be parsed.
      return payload?.isOnline ?? nextIsOnline;
    } catch {
      setError("Network error. Please check your connection and try again.");
      return null;
    }
  }

  async function handleToggle() {
    setError(null);
    setPingWarning(null);
    setSubmitting(true);

    try {
      if (!isOnline) {
        // Confirm we can actually get a position before announcing availability.
        // Doing this first (rather than reverting afterwards) means a denied
        // permission never leaves a stale "online" flag on the server.
        try {
          await getCurrentPosition();
        } catch {
          setError(LOCATION_REQUIRED_MESSAGE);
          return;
        }
      }

      const confirmed = await updateStatus(!isOnline);
      if (confirmed === null) {
        return;
      }

      // Flipping this starts (or stops) the beacon effect above.
      setIsOnline(confirmed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={submitting}
          aria-pressed={isOnline}
          className="rounded border px-3 py-1.5 text-sm font-medium hover:opacity-70 disabled:opacity-50"
        >
          {submitting ? "Updating…" : isOnline ? "Go offline" : "Go online"}
        </button>
        <span className="text-sm opacity-70">
          {isOnline
            ? "You're online — sharing your location."
            : "You're offline."}
        </span>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {pingWarning ? (
        <p className="text-sm text-yellow-700">{pingWarning}</p>
      ) : null}
    </div>
  );
}
