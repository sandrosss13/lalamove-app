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
 */
export function useClientAccountType(): BookingClientAccountType {
  const [accountType, setAccountType] =
    useState<BookingClientAccountType>("INDIVIDUAL");

  useEffect(() => {
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
  }, []);

  return accountType;
}
