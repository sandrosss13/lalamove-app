"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AdminPricingResponse } from "@/app/api/admin/pricing/route";
import {
  numberFromInput,
  parseGeneralConfigBody,
  translatePricingError,
} from "@/lib/admin/pricing-validation";
import { PricingPageFrame } from "@/components/admin/pricing/pricing-page-frame";
import { usePricingSnapshot } from "@/components/admin/pricing/use-pricing-snapshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The fields this tab edits, in render order. */
const FIELDS = [
  { field: "intercityThresholdKm", step: "1" },
  { field: "manualQuoteThresholdKm", step: "1" },
  { field: "quoteValidityMinutes", step: "1" },
] as const;

type Field = (typeof FIELDS)[number]["field"];

function GeneralConfigForm({
  snapshot,
  onSave,
}: {
  snapshot: AdminPricingResponse;
  onSave: (body: unknown) => Promise<string | null>;
}) {
  const t = useTranslations();
  const tp = useTranslations("admin.adminPricing");
  const { config } = snapshot;
  const [draft, setDraft] = useState<Record<Field, string>>(() => ({
    intercityThresholdKm: String(config.intercityThresholdKm),
    manualQuoteThresholdKm: String(config.manualQuoteThresholdKm),
    quoteValidityMinutes: String(config.quoteValidityMinutes),
  }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = Object.fromEntries(
      FIELDS.map(({ field }) => [field, numberFromInput(draft[field])]),
    );
    // Same parser as the route — this copy is for faster feedback only.
    const parsed = parseGeneralConfigBody(body, config);
    if ("error" in parsed) {
      setError(translatePricingError(t, parsed.error));
      return;
    }
    setPending(true);
    setError(null);
    const failure = await onSave(parsed.data);
    setPending(false);
    setError(failure);
    setSaved(failure === null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      {snapshot.configIsDefault ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {tp("configIsDefault")}
        </p>
      ) : null}

      {FIELDS.map(({ field, step }) => (
        <div key={field} className="flex flex-col gap-1.5">
          <Label htmlFor={`config-${field}`}>{tp(`fields.${field}`)}</Label>
          <Input
            id={`config-${field}`}
            type="number"
            min={0}
            step={step}
            required
            value={draft[field]}
            disabled={pending}
            className="h-8 w-32 tabular-nums"
            onChange={(event) => {
              setSaved(false);
              setDraft((current) => ({
                ...current,
                [field]: event.target.value,
              }));
            }}
          />
          <p className="text-xs text-muted-foreground">
            {tp(`hints.${field}`)}
          </p>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? tp("saving") : tp("save")}
        </Button>
        {saved ? (
          <span role="status" className="text-sm text-muted-foreground">
            {tp("saved")}
          </span>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * `/admin/pricing/general` — the platform-wide thresholds on `PricingConfig`:
 * below how many km an unresolved trip counts as CITY, above how many km no
 * automatic quote is given, and how long a quote is honoured. (The default
 * return allowance sits with the route allowances it is the fallback for.)
 *
 * Saved through `PATCH /api/admin/pricing/config`, which bumps the tariff
 * version and is audit-logged.
 */
export default function AdminPricingGeneralPage() {
  const t = useTranslations("admin.adminPricing");
  const { snapshot, loadError, save } = usePricingSnapshot();

  return (
    <PricingPageFrame
      intro={t("generalIntro")}
      snapshot={snapshot}
      loadError={loadError}
    >
      {(data) => (
        <GeneralConfigForm
          snapshot={data}
          onSave={(body) => save("/api/admin/pricing/config", "PATCH", body)}
        />
      )}
    </PricingPageFrame>
  );
}
