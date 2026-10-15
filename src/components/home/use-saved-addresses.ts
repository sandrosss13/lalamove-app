"use client";

import { useCallback, useEffect, useState } from "react";

import type { SavedAddressDto } from "@/lib/saved-addresses/contract";

/**
 * The signed-in client's saved addresses (`GET /api/saved-addresses`), for the
 * booking form's pickup / drop-off fields to offer as one-tap fills.
 *
 * Read once per form mount, not per field focus: the list is small (capped at
 * `SAVED_ADDRESS_LIMIT`), both fields filter the same copy locally, and a
 * second field focused a moment later should not wait on a second round trip.
 * Fetched on mount rather than on first focus so the list is already there the
 * instant the client taps a field — a list that pops in under a finger that has
 * started typing is worse than one request a signed-in client never used.
 *
 * Every failure — signed out after all (401), not a CLIENT (403), offline, a
 * malformed body — resolves to an empty list and stays silent: the fields then
 * behave exactly as they do for a guest, which is the whole fallback.
 *
 * `enabled: false` (a guest) skips the request entirely.
 */
export function useSavedAddresses({ enabled }: { enabled: boolean }): {
  addresses: SavedAddressDto[];
  /** Fire-and-forget `POST /api/saved-addresses/{id}/use` after a pick. */
  markUsed: (id: string) => void;
} {
  const [addresses, setAddresses] = useState<SavedAddressDto[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Dropped rather than aborted on unmount, so a strict-mode double mount
    // never logs an aborted request as a failure (as `useClientAccountType`).
    let active = true;

    fetch("/api/saved-addresses")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: unknown) => {
        if (!active) {
          return;
        }
        setAddresses(readSavedAddresses(payload));
      })
      .catch(() => {
        // Silent — see above.
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  const markUsed = useCallback((id: string) => {
    // Only bumps `lastUsedAt` for the next form's ordering; nothing on this
    // page waits on it or would show its failure. `keepalive` lets it finish
    // if the client picks and immediately navigates away.
    void fetch(`/api/saved-addresses/${encodeURIComponent(id)}/use`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  }, []);

  return { addresses, markUsed };
}

/**
 * The `addresses` array of a list response, keeping only entries that carry
 * what the fields actually read (an id, a label and an address string). The
 * body is our own endpoint's, but a half-deployed backend answering in another
 * shape must not crash the booking form — it should just offer nothing.
 */
function readSavedAddresses(payload: unknown): SavedAddressDto[] {
  if (payload === null || typeof payload !== "object") {
    return [];
  }
  const list = (payload as { addresses?: unknown }).addresses;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(
    (entry): entry is SavedAddressDto =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as SavedAddressDto).id === "string" &&
      typeof (entry as SavedAddressDto).label === "string" &&
      typeof (entry as SavedAddressDto).address === "string" &&
      (entry as SavedAddressDto).address.trim() !== "",
  );
}
