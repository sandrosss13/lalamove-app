"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import type { AdminVehicleTariffRow } from "@/lib/admin/pricing";
import {
  fractionToPercent,
  numberFromInput,
  parseVehicleTariffBody,
  percentToFraction,
  translatePricingError,
  type VehicleTariffInput,
} from "@/lib/admin/pricing-validation";
import { PricingPageFrame } from "@/components/admin/pricing/pricing-page-frame";
import { usePricingSnapshot } from "@/components/admin/pricing/use-pricing-snapshot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * The editable columns in table order, and whether each is shown as a
 * percentage (stored as a 0..1 fraction). The order is the sheet's: city
 * rates, intercity rates, commission, then the vehicle waiting overtime.
 */
const COLUMNS: readonly {
  field: keyof VehicleTariffInput;
  percent?: boolean;
  step: string;
}[] = [
  { field: "cityBaseFare", step: "0.01" },
  { field: "cityPricePerKm", step: "0.01" },
  { field: "cityPricePerMinute", step: "0.01" },
  { field: "cityMinimumFare", step: "0.01" },
  { field: "intercityBaseFare", step: "0.01" },
  { field: "intercityPricePerKm", step: "0.01" },
  { field: "cityCommissionRate", percent: true, step: "0.1" },
  { field: "intercityCommissionRate", percent: true, step: "0.1" },
  { field: "freeLoadingMinutes", step: "1" },
  { field: "overtimeRatePerMinute", step: "0.01" },
];

type Draft = Record<keyof VehicleTariffInput, string>;

/** A stored rule as the strings the inputs edit; blanks for a vehicle with none. */
function toDraft(rule: AdminVehicleTariffRow["rule"]): Draft {
  return Object.fromEntries(
    COLUMNS.map(({ field, percent }) => {
      if (!rule) return [field, ""];
      const value = rule[field];
      return [field, percent ? fractionToPercent(value) : String(value)];
    }),
  ) as Draft;
}

/** The inputs as the API body: percentages back to fractions, blanks to NaN. */
function fromDraft(draft: Draft): Record<string, number> {
  return Object.fromEntries(
    COLUMNS.map(({ field, percent }) => [
      field,
      percent ? percentToFraction(draft[field]) : numberFromInput(draft[field]),
    ]),
  );
}

/**
 * One vehicle's row. Holds its own draft, pending and error state so editing
 * or saving one vehicle never locks the rest of the table. Keyed by the rule's
 * `updatedAt` upstream, so a successful save (which changes it) resets the
 * draft to what the database now holds.
 */
function VehicleTariffEditorRow({
  vehicle,
  onSave,
}: {
  vehicle: AdminVehicleTariffRow;
  onSave: (body: VehicleTariffInput) => Promise<string | null>;
}) {
  const t = useTranslations();
  const initial = toDraft(vehicle.rule);
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = COLUMNS.some(({ field }) => draft[field] !== initial[field]);

  async function handleSave() {
    // Same parser as the route — this copy is for faster feedback only.
    const parsed = parseVehicleTariffBody(fromDraft(draft));
    if ("error" in parsed) {
      setError(translatePricingError(t, parsed.error));
      return;
    }
    setPending(true);
    setError(null);
    const failure = await onSave(parsed.data);
    setPending(false);
    setError(failure);
  }

  return (
    <>
      <TableRow>
        <TableCell className="align-top">
          <div className="flex min-w-36 flex-col gap-1">
            <span className="font-medium">{vehicle.label}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {vehicle.code}
            </span>
            {vehicle.rule ? null : (
              <Badge variant="destructive" className="w-fit">
                {t("admin.adminPricing.noTariff")}
              </Badge>
            )}
          </div>
        </TableCell>
        {COLUMNS.map(({ field, percent, step }) => (
          <TableCell key={field} className="align-top">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={percent ? 100 : undefined}
              step={step}
              value={draft[field]}
              disabled={pending}
              aria-label={`${vehicle.label} — ${t(`admin.adminPricing.fields.${field}`)}`}
              className="h-8 w-20 tabular-nums"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            />
          </TableCell>
        ))}
        <TableCell className="text-right align-top">
          <Button
            size="sm"
            disabled={pending || (!dirty && vehicle.rule !== null)}
            onClick={() => void handleSave()}
          >
            {pending
              ? t("admin.adminPricing.saving")
              : t("admin.adminPricing.save")}
          </Button>
        </TableCell>
      </TableRow>
      {error ? (
        <TableRow>
          <TableCell colSpan={COLUMNS.length + 2}>
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/**
 * `/admin/pricing/vehicles` — every vehicle type's `PricingRule`: city base,
 * per-km, per-minute and minimum fare; intercity base and per-km; the
 * platform commission for each trip type (shown as %); and the vehicle
 * waiting overtime (free minutes, then per minute).
 *
 * Each row saves on its own (`PUT /api/admin/pricing/vehicles/[id]`), which
 * bumps the tariff version and is audit-logged. The legacy `helperFee` column
 * is not shown: the v1 engine prices helpers from the Helper tariffs tab.
 */
export default function AdminPricingVehiclesPage() {
  const t = useTranslations("admin.adminPricing");
  const { snapshot, loadError, save } = usePricingSnapshot();

  return (
    <PricingPageFrame
      intro={t("vehiclesIntro")}
      snapshot={snapshot}
      loadError={loadError}
    >
      {(data) => (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2}>{t("vehicle")}</TableHead>
                <TableHead colSpan={4} className="text-center">
                  {t("groupCity")}
                </TableHead>
                <TableHead colSpan={2} className="text-center">
                  {t("groupIntercity")}
                </TableHead>
                <TableHead colSpan={2} className="text-center">
                  {t("groupCommission")}
                </TableHead>
                <TableHead colSpan={2} className="text-center">
                  {t("groupWaiting")}
                </TableHead>
                <TableHead rowSpan={2} />
              </TableRow>
              <TableRow>
                {COLUMNS.map(({ field }) => (
                  <TableHead key={field} className="text-xs">
                    {t(`columns.${field}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.vehicles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMNS.length + 2}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t("noVehicles")}
                  </TableCell>
                </TableRow>
              ) : (
                data.vehicles.map((vehicle) => (
                  <VehicleTariffEditorRow
                    key={`${vehicle.vehicleTypeSpecId}:${vehicle.rule?.updatedAt ?? "none"}`}
                    vehicle={vehicle}
                    onSave={(body) =>
                      save(
                        `/api/admin/pricing/vehicles/${encodeURIComponent(vehicle.vehicleTypeSpecId)}`,
                        "PUT",
                        body,
                      )
                    }
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </PricingPageFrame>
  );
}
