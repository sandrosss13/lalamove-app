"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AdminPricingResponse } from "@/app/api/admin/pricing/route";
import {
  fractionToPercent,
  numberFromInput,
  parseHelperTariffBody,
  percentToFraction,
  PRICING_BOUNDS,
  translatePricingError,
} from "@/lib/admin/pricing-validation";
import { PricingPageFrame } from "@/components/admin/pricing/pricing-page-frame";
import { usePricingSnapshot } from "@/components/admin/pricing/use-pricing-snapshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** One band row as the inputs edit it. `key` is a stable React key only. */
type BandDraft = { key: number; minFloor: string; ratePerHelper: string };

type RulesDraft = {
  maxHelpers: string;
  helperIncludedMinutes: string;
  helperOvertimeIncrementMinutes: string;
  helperOvertimeFeePerIncrement: string;
  /** Percent, 0-100. */
  elevatorDiscount: string;
};

/** The rules inputs in render order, with each input's step. */
const RULE_FIELDS: readonly { field: keyof RulesDraft; step: string }[] = [
  { field: "maxHelpers", step: "1" },
  { field: "helperIncludedMinutes", step: "1" },
  { field: "helperOvertimeIncrementMinutes", step: "1" },
  { field: "helperOvertimeFeePerIncrement", step: "0.01" },
  { field: "elevatorDiscount", step: "0.1" },
];

function initialBands(snapshot: AdminPricingResponse): BandDraft[] {
  return snapshot.bands.map((band, index) => ({
    key: index,
    minFloor: String(band.minFloor),
    ratePerHelper: String(band.ratePerHelper),
  }));
}

function initialRules(snapshot: AdminPricingResponse): RulesDraft {
  const { config } = snapshot;
  return {
    maxHelpers: String(config.maxHelpers),
    helperIncludedMinutes: String(config.helperIncludedMinutes),
    helperOvertimeIncrementMinutes: String(
      config.helperOvertimeIncrementMinutes,
    ),
    helperOvertimeFeePerIncrement: String(config.helperOvertimeFeePerIncrement),
    elevatorDiscount: fractionToPercent(config.elevatorDiscount),
  };
}

/**
 * The bands and rules editor. Drafts start from the snapshot and are kept
 * after a save — what was saved is exactly what they hold.
 */
function HelperTariffEditor({
  snapshot,
  onSave,
}: {
  snapshot: AdminPricingResponse;
  onSave: (body: unknown) => Promise<string | null>;
}) {
  const t = useTranslations();
  const tp = useTranslations("admin.adminPricing");
  const [bands, setBands] = useState<BandDraft[]>(() => initialBands(snapshot));
  const [rules, setRules] = useState<RulesDraft>(() => initialRules(snapshot));
  const [nextKey, setNextKey] = useState(snapshot.bands.length);
  // The ground-floor band is the one that must always exist: its floor is
  // fixed at 0 and it cannot be removed. Pinned by key rather than by the
  // value "0", so a new band typed as 0 is still removable (the duplicate is
  // then reported on save).
  const [groundKey] = useState(
    () => bands.find((band) => band.minFloor === "0")?.key ?? -1,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateBand(key: number, patch: Partial<BandDraft>) {
    setSaved(false);
    setBands((current) =>
      current.map((band) => (band.key === key ? { ...band, ...patch } : band)),
    );
  }

  function addBand() {
    setSaved(false);
    const highest = bands.reduce(
      (max, band) => Math.max(max, numberFromInput(band.minFloor) || 0),
      0,
    );
    setBands((current) => [
      ...current,
      { key: nextKey, minFloor: String(highest + 3), ratePerHelper: "" },
    ]);
    setNextKey((key) => key + 1);
  }

  async function handleSave() {
    const body = {
      bands: bands.map((band) => ({
        minFloor: numberFromInput(band.minFloor),
        ratePerHelper: numberFromInput(band.ratePerHelper),
      })),
      rules: {
        maxHelpers: numberFromInput(rules.maxHelpers),
        helperIncludedMinutes: numberFromInput(rules.helperIncludedMinutes),
        helperOvertimeIncrementMinutes: numberFromInput(
          rules.helperOvertimeIncrementMinutes,
        ),
        helperOvertimeFeePerIncrement: numberFromInput(
          rules.helperOvertimeFeePerIncrement,
        ),
        elevatorDiscount: percentToFraction(rules.elevatorDiscount),
      },
    };
    // Same parser as the route — this copy is for faster feedback only.
    const parsed = parseHelperTariffBody(body);
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

  /** Floors each band covers, for the "Floors 0–3" hint beside it. */
  const sortedFloors = bands
    .map((band) => numberFromInput(band.minFloor))
    .filter((floor) => Number.isInteger(floor))
    .sort((a, b) => a - b);

  function rangeLabel(minFloor: number): string {
    if (!Number.isInteger(minFloor)) return "";
    const next = sortedFloors.find((floor) => floor > minFloor);
    return next === undefined
      ? tp("floorsAndAbove", { from: minFloor })
      : tp("floorsRange", { from: minFloor, to: next - 1 });
  }

  return (
    <div className="flex flex-col gap-6">
      {snapshot.bandsAreDefault ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {tp("bandsAreDefault")}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{tp("floorBands")}</h2>
        <p className="text-sm text-muted-foreground">{tp("floorBandsHint")}</p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tp("fields.minFloor")}</TableHead>
                <TableHead>{tp("floorsCovered")}</TableHead>
                <TableHead>{tp("fields.ratePerHelper")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bands.map((band) => {
                const isGround = band.key === groundKey;
                return (
                  <TableRow key={band.key}>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={PRICING_BOUNDS.maxFloor}
                        step="1"
                        value={band.minFloor}
                        disabled={pending || isGround}
                        aria-label={tp("fields.minFloor")}
                        className="h-8 w-20 tabular-nums"
                        onChange={(event) =>
                          updateBand(band.key, { minFloor: event.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rangeLabel(numberFromInput(band.minFloor))}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={band.ratePerHelper}
                        disabled={pending}
                        aria-label={tp("fields.ratePerHelper")}
                        className="h-8 w-24 tabular-nums"
                        onChange={(event) =>
                          updateBand(band.key, {
                            ratePerHelper: event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {isGround ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          aria-label={tp("removeBand")}
                          onClick={() => {
                            setSaved(false);
                            setBands((current) =>
                              current.filter((entry) => entry.key !== band.key),
                            );
                          }}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          disabled={pending || bands.length >= PRICING_BOUNDS.maxBands}
          onClick={addBand}
        >
          <Plus data-icon="inline-start" />
          {tp("addBand")}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{tp("helperRules")}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RULE_FIELDS.map(({ field, step }) => (
            <div key={field} className="flex flex-col gap-1.5">
              <Label htmlFor={`helper-rule-${field}`}>
                {tp(`fields.${field}`)}
              </Label>
              <Input
                id={`helper-rule-${field}`}
                type="number"
                min={0}
                step={step}
                value={rules[field]}
                disabled={pending}
                className="h-8 w-32 tabular-nums"
                onChange={(event) => {
                  setSaved(false);
                  setRules((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }));
                }}
              />
              <p className="text-xs text-muted-foreground">
                {tp(`hints.${field}`, { max: PRICING_BOUNDS.maxHelpers })}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={() => void handleSave()}>
          {pending ? tp("saving") : tp("saveHelperTariff")}
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
    </div>
  );
}

/**
 * `/admin/pricing/helpers` — the helper tariff: the per-helper rate by floor
 * band (`HelperFloorBand`; a band at floor 0 always exists) and the helper
 * rules on `PricingConfig` (max helpers per location, included minutes,
 * overtime increment and fee, cargo-elevator discount).
 *
 * Saved together in one `PUT /api/admin/pricing/helpers`, which replaces the
 * bands wholesale, bumps the tariff version and is audit-logged.
 */
export default function AdminPricingHelpersPage() {
  const t = useTranslations("admin.adminPricing");
  const { snapshot, loadError, save } = usePricingSnapshot();

  return (
    <PricingPageFrame
      intro={t("helpersIntro")}
      snapshot={snapshot}
      loadError={loadError}
    >
      {(data) => (
        <HelperTariffEditor
          snapshot={data}
          onSave={(body) => save("/api/admin/pricing/helpers", "PUT", body)}
        />
      )}
    </PricingPageFrame>
  );
}
