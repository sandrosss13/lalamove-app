"use client";

import { useTranslations } from "next-intl";

import type { AdminPricingResponse } from "@/app/api/admin/pricing/route";

/**
 * The part every Pricing tab shares: its one-line intro, the tariff version
 * every save bumps, and the loading / load-failure states — so each page only
 * renders its own editor once a snapshot is in hand.
 */
export function PricingPageFrame({
  intro,
  snapshot,
  loadError,
  children,
}: {
  intro: string;
  snapshot: AdminPricingResponse | null;
  loadError: string | null;
  children: (snapshot: AdminPricingResponse) => React.ReactNode;
}) {
  const t = useTranslations("admin.adminPricing");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>
        {snapshot ? (
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground tabular-nums">
            {t("tariffVersion", { version: snapshot.config.tariffVersion })}
          </span>
        ) : null}
      </div>

      {snapshot ? (
        children(snapshot)
      ) : loadError ? (
        <p role="alert" className="py-10 text-center text-sm text-destructive">
          {loadError}
        </p>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("loading")}
        </p>
      )}
    </div>
  );
}
