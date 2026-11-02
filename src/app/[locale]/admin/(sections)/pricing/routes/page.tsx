"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { GeorgianCity } from "@prisma/client";

import type { AdminRouteAllowanceRow } from "@/lib/admin/pricing";
import {
  fractionToPercent,
  parseRouteAllowanceBody,
  percentToFraction,
  ROUTE_ALLOWANCE_PRESETS,
  translatePricingError,
} from "@/lib/admin/pricing-validation";
import { useLocalizedCityOptions } from "@/lib/georgian-cities";
import {
  ConfirmDialog,
  type ConfirmRequest,
} from "@/components/admin/content/home-page-cms/confirm-dialog";
import { PricingPageFrame } from "@/components/admin/pricing/pricing-page-frame";
import { usePricingSnapshot } from "@/components/admin/pricing/use-pricing-snapshot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROUTES_ENDPOINT = "/api/admin/pricing/routes";

/**
 * A percentage input with the High / Medium / Low / Empty-return presets
 * beside it. Controlled; the presets just write their percentage into it.
 */
function AllowanceInput({
  id,
  value,
  onChange,
  disabled,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
}) {
  const t = useTranslations("admin.adminPricing");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Input
          id={id}
          type="number"
          min={0}
          max={100}
          step="1"
          value={value}
          disabled={disabled}
          aria-label={label}
          className="h-8 w-20 tabular-nums"
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-sm text-muted-foreground">%</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {ROUTE_ALLOWANCE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant={
              value === fractionToPercent(preset.allowance)
                ? "secondary"
                : "outline"
            }
            disabled={disabled}
            onClick={() => onChange(fractionToPercent(preset.allowance))}
          >
            {t(`presets.${preset.id}`, {
              percent: fractionToPercent(preset.allowance),
            })}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** The default allowance for unlisted pairs, saved through the config PATCH. */
function DefaultAllowanceForm({
  allowance,
  onSave,
}: {
  allowance: number;
  onSave: (fraction: number) => Promise<string | null>;
}) {
  const tp = useTranslations("admin.adminPricing");
  const [value, setValue] = useState(fractionToPercent(allowance));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    // No client-side copy of the check here: one field, and the route's
    // answer (already in the reader's language) is just as fast to show.
    setPending(true);
    setError(null);
    setError(await onSave(percentToFraction(value)));
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <Label htmlFor="default-allowance" className="font-semibold">
        {tp("fields.defaultReturnAllowance")}
      </Label>
      <p className="text-sm text-muted-foreground">
        {tp("defaultAllowanceHint")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <AllowanceInput
          id="default-allowance"
          value={value}
          onChange={setValue}
          disabled={pending}
          label={tp("fields.defaultReturnAllowance")}
        />
        <Button
          size="sm"
          disabled={pending || value === fractionToPercent(allowance)}
          onClick={() => void handleSave()}
        >
          {pending ? tp("saving") : tp("save")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

/** "Add a pair" — two city pickers and an allowance. */
function AddRouteForm({
  onSave,
}: {
  onSave: (body: unknown) => Promise<string | null>;
}) {
  const t = useTranslations();
  const tp = useTranslations("admin.adminPricing");
  const cities = useLocalizedCityOptions();
  const sortedCities = useMemo(
    () => [...cities].sort((a, b) => a.label.localeCompare(b.label)),
    [cities],
  );
  const [cityA, setCityA] = useState<GeorgianCity | "">("");
  const [cityB, setCityB] = useState<GeorgianCity | "">("");
  const [value, setValue] = useState(
    fractionToPercent(ROUTE_ALLOWANCE_PRESETS[1].allowance),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseRouteAllowanceBody({
      cityA,
      cityB,
      allowance: percentToFraction(value),
    });
    if ("error" in parsed) {
      setError(translatePricingError(t, parsed.error));
      return;
    }
    setPending(true);
    setError(null);
    const failure = await onSave(parsed.data);
    setPending(false);
    setError(failure);
    if (failure === null) {
      setCityA("");
      setCityB("");
    }
  }

  function citySelect(
    id: string,
    label: string,
    city: GeorgianCity | "",
    setCity: (value: GeorgianCity) => void,
  ) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Select
          value={city}
          onValueChange={(next) => setCity(next as GeorgianCity)}
          disabled={pending}
        >
          <SelectTrigger id={id} className="w-48">
            <SelectValue placeholder={tp("pickCity")} />
          </SelectTrigger>
          <SelectContent>
            {sortedCities.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <h2 className="text-sm font-semibold">{tp("addRoute")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        {citySelect("route-city-a", tp("cityA"), cityA, setCityA)}
        {citySelect("route-city-b", tp("cityB"), cityB, setCityB)}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="route-allowance">{tp("fields.allowance")}</Label>
          <AllowanceInput
            id="route-allowance"
            value={value}
            onChange={setValue}
            disabled={pending}
            label={tp("fields.allowance")}
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tp("saving") : tp("addRouteSubmit")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{tp("addRouteHint")}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** One listed pair, with inline allowance edit and delete. */
function RouteRow({
  route,
  cityName,
  onSave,
  onDelete,
}: {
  route: AdminRouteAllowanceRow;
  cityName: (city: GeorgianCity) => string;
  onSave: (allowance: number) => Promise<string | null>;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const tp = useTranslations("admin.adminPricing");
  const initial = fractionToPercent(route.allowance);
  const [value, setValue] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pairLabel = `${cityName(route.cityA)} — ${cityName(route.cityB)}`;

  async function handleSave() {
    const parsed = parseRouteAllowanceBody({
      cityA: route.cityA,
      cityB: route.cityB,
      allowance: percentToFraction(value),
    });
    if ("error" in parsed) {
      setError(translatePricingError(t, parsed.error));
      return;
    }
    setPending(true);
    setError(null);
    const failure = await onSave(parsed.data.allowance);
    setPending(false);
    setError(failure);
  }

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{pairLabel}</TableCell>
        <TableCell>
          <AllowanceInput
            id={`route-${route.id}`}
            value={value}
            onChange={setValue}
            disabled={pending}
            label={`${pairLabel} — ${tp("fields.allowance")}`}
          />
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              disabled={pending || value === initial}
              onClick={() => void handleSave()}
            >
              {pending ? tp("saving") : tp("save")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={tp("deleteRouteLabel", { route: pairLabel })}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {error ? (
        <TableRow>
          <TableCell colSpan={3}>
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
 * `/admin/pricing/routes` — the return allowance per city pair
 * (`RouteAllowance`): the share of the intercity distance charge added
 * because the truck likely drives back empty. Busy corridors get little, remote
 * ones a lot; an unlisted pair uses the default allowance edited at the top.
 *
 * Every add, edit and delete bumps the tariff version and is audit-logged.
 * Pairs are unordered and stored normalised by the API, so adding
 * "Batumi — Tbilisi" when "Tbilisi — Batumi" exists just edits that row.
 */
export default function AdminPricingRoutesPage() {
  const t = useTranslations("admin.adminPricing");
  const { snapshot, loadError, save } = usePricingSnapshot();
  const cities = useLocalizedCityOptions();
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const cityNames = useMemo(
    () => new Map(cities.map((option) => [option.value, option.label])),
    [cities],
  );
  const cityName = (city: GeorgianCity) => cityNames.get(city) ?? city;

  return (
    <PricingPageFrame
      intro={t("routesIntro")}
      snapshot={snapshot}
      loadError={loadError}
    >
      {(data) => {
        const routes = [...data.routes].sort((a, b) =>
          `${cityName(a.cityA)} ${cityName(a.cityB)}`.localeCompare(
            `${cityName(b.cityA)} ${cityName(b.cityB)}`,
          ),
        );
        return (
          <div className="flex flex-col gap-4">
            <DefaultAllowanceForm
              key={`default:${data.config.defaultReturnAllowance}`}
              allowance={data.config.defaultReturnAllowance}
              onSave={(fraction) =>
                save("/api/admin/pricing/config", "PATCH", {
                  defaultReturnAllowance: fraction,
                })
              }
            />

            <AddRouteForm
              onSave={(body) => save(ROUTES_ENDPOINT, "PUT", body)}
            />

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("route")}</TableHead>
                    <TableHead>{t("fields.allowance")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-10 text-center text-muted-foreground"
                      >
                        {t("noRoutes")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    routes.map((route) => (
                      <RouteRow
                        key={`${route.id}:${route.updatedAt}`}
                        route={route}
                        cityName={cityName}
                        onSave={(allowance) =>
                          save(ROUTES_ENDPOINT, "PUT", {
                            cityA: route.cityA,
                            cityB: route.cityB,
                            allowance,
                          })
                        }
                        onDelete={() =>
                          setConfirm({
                            title: t("deleteRouteTitle"),
                            description: t("deleteRouteDescription", {
                              route: `${cityName(route.cityA)} — ${cityName(route.cityB)}`,
                              percent: fractionToPercent(
                                data.config.defaultReturnAllowance,
                              ),
                            }),
                            confirmLabel: t("deleteRoute"),
                            destructive: true,
                            onConfirm: () =>
                              save(
                                `${ROUTES_ENDPOINT}/${encodeURIComponent(route.id)}`,
                                "DELETE",
                              ),
                          })
                        }
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {confirm ? (
              <ConfirmDialog
                request={confirm}
                onClose={() => setConfirm(null)}
              />
            ) : null}
          </div>
        );
      }}
    </PricingPageFrame>
  );
}
