"use client";

import { useEffect, useState } from "react";

import type { BookingClientAccountType } from "@/components/home/order-vehicle-types";

/**
 * The signed-in client's account type, read from `GET /api/client-profile`.
 *
 * Fetched in the browser rather than handed down from `/`: that route is
 * statically cached (`revalidate = 60`) and deliberately reads nothing
 * per-session, so threading a per-client value through it would either break
 * the cache or leak one client's answer into another's page.
 *
 * Anything other than an explicit `BUSINESS` — still loading, request failed,
 * no profile row yet, an unexpected body — resolves to `INDIVIDUAL`. That is
 * the narrower vehicle list, so an unknown account type can never widen what
 * is offered; a business client merely sees the full list a moment later.
 *
 * `initial` is for a caller that already knows the answer server-side — the
 * edit route, `/orders/[id]/edit`, which is per-session and uncached, so the
 * reasoning above does not apply to it. It only seeds the first render: the
 * fetch below still runs and has the last word. It exists because "a moment
 * later" is not harmless when the form opens on an order a business client
 * already booked: for that first moment the narrower list would not contain
 * the class they booked, and the vehicle step's auto-select would replace it
 * before the real account type arrived. Omitted, the hook behaves exactly as
 * it always has.
 *
 * `enabled: false` skips the request entirely and keeps `initial` — for a guest
 * booking, who has no profile and is always booked as INDIVIDUAL.
 */
export function useClientAccountType(
  initial: BookingClientAccountType = "INDIVIDUAL",
  { enabled = true }: { enabled?: boolean } = {},
): BookingClientAccountType {
  const [accountType, setAccountType] =
    useState<BookingClientAccountType>(initial);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Dropped rather than aborted on unmount, so a strict-mode double mount
    // never logs an aborted request as a failure.
    let active = true;

    fetch("/api/client-profile")
      .then((response) => (response.ok ? response.json() : null))
      .then((profile: unknown) => {
        if (!active) {
          return;
        }

        const stored =
          profile !== null && typeof profile === "object"
            ? (profile as { accountType?: unknown }).accountType
            : undefined;

        setAccountType(stored === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL");
      })
      .catch(() => {
        // Fail closed to the narrower list — see above.
      });

    return () => {
      active = false;
    };
  }, [enabled]);

  return accountType;
}
