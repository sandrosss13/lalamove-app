"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Type-only import, so nothing of the server route (Prisma, Better Auth) is
// pulled into this client bundle — it is erased at compile time.
import type { AdminPricingResponse } from "@/app/api/admin/pricing/route";
import { readErrorMessage } from "@/components/admin/read-error-message";

/** Where every Pricing tab reads the tariff from. */
export const PRICING_ENDPOINT = "/api/admin/pricing";

/**
 * The tariff snapshot every Pricing tab works on, plus one `save` for all of
 * their writes.
 *
 * Every write endpoint under `/api/admin/pricing` answers with the fresh
 * snapshot, so `save` simply swaps it in: the page then shows exactly what the
 * database holds — the new `tariffVersion` included — rather than the state
 * the click assumed.
 */
export function usePricingSnapshot() {
  const t = useTranslations("admin.adminPricing");
  const [snapshot, setSnapshot] = useState<AdminPricingResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(PRICING_ENDPOINT, {
          signal: controller.signal,
        });
        if (!response.ok) {
          setLoadError(await readErrorMessage(response, t("couldNotLoad")));
          return;
        }
        setSnapshot((await response.json()) as AdminPricingResponse);
      } catch {
        // An abort is this effect being cleaned up, not a failure worth showing.
        if (controller.signal.aborted) return;
        setLoadError(t("couldNotLoad"));
      }
    }

    void load();
    return () => controller.abort();
  }, [t]);

  /**
   * Sends one write and adopts the snapshot it answers with. Resolves to the
   * API's error message, or null on success — so a caller keeps its own
   * pending/error state per row or form.
   */
  const save = useCallback(
    async (
      url: string,
      method: "PUT" | "PATCH" | "DELETE",
      body?: unknown,
    ): Promise<string | null> => {
      try {
        const response = await fetch(url, {
          method,
          headers:
            body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) {
          return await readErrorMessage(response, t("couldNotSave"));
        }
        setSnapshot((await response.json()) as AdminPricingResponse);
        return null;
      } catch {
        return t("couldNotSave");
      }
    },
    [t],
  );

  return { snapshot, loadError, save };
}
