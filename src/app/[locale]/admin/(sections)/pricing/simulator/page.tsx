"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { GeorgianCity, ServiceLevel, TripType } from "@prisma/client";

import type { AdminPricingResponse } from "@/app/api/admin/pricing/route";
import {
  fractionToPercent,
  numberFromInput,
} from "@/lib/admin/pricing-validation";
import { useLocalizedCityOptions } from "@/lib/georgian-cities";
import { quotedOrderPayout } from "@/lib/orders/payout";
import {
  commissionRateFor,
  computeQuote,
  isManualQuoteRequired,
  serviceLevelAdjustment,
  type LocationHelp,
} from "@/lib/pricing-engine";
import { PricingPageFrame } from "@/components/admin/pricing/pricing-page-frame";
import { usePricingSnapshot } from "@/components/admin/pricing/use-pricing-snapshot";
import { Checkbox } from "@/components/ui/checkbox";
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

const SERVICE_LEVELS: readonly ServiceLevel[] = [
  "REGULAR",
  "PRIORITY",
  "POOLING",
];

/** "No specific pair" in the route picker — the default allowance applies. */
const ANY_PAIR = "ANY";

/**
 * Stand-in cities that make `computeQuote` classify the trip the way the
 * simulator was told to: two different cities are always INTERCITY, and the
 * same city twice is CITY — once the distance threshold is lifted for the
 * simulation (a real same-city route at or over `intercityThresholdKm` is
 * INTERCITY, see `classifyTrip`; here the admin chose the trip type). With
 * no pair picked, the routes are withheld so the default allowance applies.
 */
const CITY_STAND_IN: GeorgianCity = "TBILISI";
const OTHER_STAND_IN: GeorgianCity = "BATUMI";

type HelpDraft = { helpers: string; floor: string; cargoElevator: boolean };

function toHelp(draft: HelpDraft): LocationHelp {
  return {
    helpers: Math.max(0, Math.floor(numberFromInput(draft.helpers) || 0)),
    floor: Math.max(0, Math.floor(numberFromInput(draft.floor) || 0)),
    cargoElevator: draft.cargoElevator,
  };
}

function formatGel(value: number): string {
  return value.toFixed(2);
}

function HelpInputs({
  idPrefix,
  title,
  value,
  onChange,
}: {
  idPrefix: string;
  title: string;
  value: HelpDraft;
  onChange: (value: HelpDraft) => void;
}) {
  const tp = useTranslations("admin.adminPricing");
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-helpers`}>{tp("simHelpers")}</Label>
          <Input
            id={`${idPrefix}-helpers`}
            type="number"
            min={0}
            step="1"
            value={value.helpers}
            className="h-8 w-20 tabular-nums"
            onChange={(event) =>
              onChange({ ...value, helpers: event.target.value })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-floor`}>{tp("simFloor")}</Label>
          <Input
            id={`${idPrefix}-floor`}
            type="number"
            min={0}
            step="1"
            value={value.floor}
            className="h-8 w-20 tabular-nums"
            onChange={(event) =>
              onChange({ ...value, floor: event.target.value })
            }
          />
        </div>
        <label className="flex h-8 items-center gap-2 text-sm">
          <Checkbox
            checked={value.cargoElevator}
            onCheckedChange={(checked) =>
              onChange({ ...value, cargoElevator: checked === true })
            }
          />
          {tp("simCargoElevator")}
        </label>
      </div>
    </fieldset>
  );
}

function QuoteSimulator({ snapshot }: { snapshot: AdminPricingResponse }) {
  const tp = useTranslations("admin.adminPricing");
  const cities = useLocalizedCityOptions();
  const cityNames = useMemo(
    () => new Map(cities.map((option) => [option.value, option.label])),
    [cities],
  );
  const priced = snapshot.vehicles.filter((vehicle) => vehicle.rule !== null);

  // Prefilled with the pricing sheet's own verification case, so the first
  // thing the owner sees is a figure they can check against the spreadsheet.
  const [vehicleId, setVehicleId] = useState(
    () =>
      (priced.find((vehicle) => vehicle.code === "MINIVAN") ?? priced[0])
        ?.vehicleTypeSpecId ?? "",
  );
  const [tripType, setTripType] = useState<TripType>("INTERCITY");
  const [routeId, setRouteId] = useState<string>(ANY_PAIR);
  const [km, setKm] = useState("259.4");
  const [minutes, setMinutes] = useState("300");
  const [pickup, setPickup] = useState<HelpDraft>({
    helpers: "2",
    floor: "3",
    cargoElevator: false,
  });
  const [dropoff, setDropoff] = useState<HelpDraft>({
    helpers: "2",
    floor: "6",
    cargoElevator: false,
  });

  const vehicle = priced.find((entry) => entry.vehicleTypeSpecId === vehicleId);
  const route = snapshot.routes.find((entry) => entry.id === routeId);
  const distanceKm = numberFromInput(km);
  const durationMinutes = numberFromInput(minutes);
  const inputsValid =
    Number.isFinite(distanceKm) &&
    distanceKm >= 0 &&
    Number.isFinite(durationMinutes) &&
    durationMinutes >= 0;

  const pickupHelp = toHelp(pickup);
  const dropoffHelp = toHelp(dropoff);

  const quote =
    vehicle?.rule && inputsValid
      ? computeQuote(
          {
            distanceKm,
            durationMinutes,
            pickupCity:
              tripType === "CITY"
                ? CITY_STAND_IN
                : (route?.cityA ?? CITY_STAND_IN),
            dropoffCity:
              tripType === "CITY"
                ? CITY_STAND_IN
                : (route?.cityB ?? OTHER_STAND_IN),
            pickupHelp,
            dropoffHelp,
          },
          {
            rates: vehicle.rule,
            // Lift the same-city distance guard: the admin picked CITY.
            config:
              tripType === "CITY"
                ? {
                    ...snapshot.config,
                    intercityThresholdKm: Number.POSITIVE_INFINITY,
                  }
                : snapshot.config,
            bands: snapshot.bands,
            routes: route ? [route] : [],
          },
        )
      : null;

  const commissionRate = vehicle?.rule
    ? commissionRateFor(vehicle.rule, tripType)
    : 0;

  const warnings: string[] = [];
  if (
    inputsValid &&
    isManualQuoteRequired(distanceKm, snapshot.config.manualQuoteThresholdKm)
  ) {
    warnings.push(
      tp("simManualQuote", { km: snapshot.config.manualQuoteThresholdKm }),
    );
  }
  if (
    pickupHelp.helpers > snapshot.config.maxHelpers ||
    dropoffHelp.helpers > snapshot.config.maxHelpers
  ) {
    warnings.push(tp("simTooManyHelpers", { max: snapshot.config.maxHelpers }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-vehicle">{tp("vehicle")}</Label>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger id="sim-vehicle" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {priced.map((entry) => (
                <SelectItem
                  key={entry.vehicleTypeSpecId}
                  value={entry.vehicleTypeSpecId}
                >
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-trip-type">{tp("simTripType")}</Label>
          <Select
            value={tripType}
            onValueChange={(value) => setTripType(value as TripType)}
          >
            <SelectTrigger id="sim-trip-type" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CITY">{tp("tripTypes.CITY")}</SelectItem>
              <SelectItem value="INTERCITY">
                {tp("tripTypes.INTERCITY")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {tripType === "INTERCITY" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sim-route">{tp("route")}</Label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger id="sim-route" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_PAIR}>
                  {tp("simUnlistedPair", {
                    percent: fractionToPercent(
                      snapshot.config.defaultReturnAllowance,
                    ),
                  })}
                </SelectItem>
                {snapshot.routes.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {`${cityNames.get(entry.cityA) ?? entry.cityA} — ${cityNames.get(entry.cityB) ?? entry.cityB} (${fractionToPercent(entry.allowance)}%)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-km">{tp("simDistanceKm")}</Label>
          <Input
            id="sim-km"
            type="number"
            min={0}
            step="0.1"
            value={km}
            className="h-8 w-28 tabular-nums"
            onChange={(event) => setKm(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sim-minutes">{tp("simDrivingMinutes")}</Label>
          <Input
            id="sim-minutes"
            type="number"
            min={0}
            step="1"
            value={minutes}
            className="h-8 w-28 tabular-nums"
            onChange={(event) => setMinutes(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <HelpInputs
          idPrefix="sim-pickup"
          title={tp("simPickup")}
          value={pickup}
          onChange={setPickup}
        />
        <HelpInputs
          idPrefix="sim-dropoff"
          title={tp("simDropoff")}
          value={dropoff}
          onChange={setDropoff}
        />
      </div>

      {warnings.map((warning) => (
        <p
          key={warning}
          role="status"
          className="rounded-lg bg-muted px-3 py-2 text-sm text-destructive"
        >
          {warning}
        </p>
      ))}

      {quote ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableBody>
                {(
                  [
                    ["simBaseFare", quote.baseFare],
                    ["simDistanceFare", quote.distanceFare],
                    ["simTimeFare", quote.timeFare],
                    ["simReturnFare", quote.returnFare],
                  ] as const
                ).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell>
                      {key === "simReturnFare"
                        ? tp(key, {
                            percent: fractionToPercent(quote.returnAllowance),
                          })
                        : tp(key)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatGel(value)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>{tp("simTransport")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatGel(quote.transportFare)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{tp("simPickupHelpers")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatGel(quote.pickupHelperFee)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{tp("simDropoffHelpers")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatGel(quote.dropoffHelperFee)}
                  </TableCell>
                </TableRow>
                <TableRow className="font-semibold">
                  <TableCell>{tp("simPrice")}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatGel(quote.price)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tp("simServiceLevel")}</TableHead>
                  <TableHead className="text-right">
                    {tp("simClientTotal")}
                  </TableHead>
                  <TableHead className="text-right">
                    {tp("simCommission", {
                      percent: fractionToPercent(commissionRate),
                    })}
                  </TableHead>
                  <TableHead className="text-right">
                    {tp("simDriverPayout")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SERVICE_LEVELS.map((level) => {
                  const adjustment = serviceLevelAdjustment(
                    level,
                    quote.transportFare,
                  );
                  const payout = quotedOrderPayout({
                    transportFare: quote.transportFare,
                    serviceLevelAdjustment: adjustment,
                    helperFee: quote.helperFee,
                    commissionRate,
                  });
                  return (
                    <TableRow key={level}>
                      <TableCell>{tp(`serviceLevels.${level}`)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGel(
                          payout.commissionBasis + payout.helperPayout,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGel(payout.commission)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatGel(payout.driverPayout)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {priced.length === 0 ? tp("noVehicles") : tp("simInvalidInputs")}
        </p>
      )}
    </div>
  );
}

/**
 * `/admin/pricing/simulator` — a read-only quote calculator over the SAVED
 * tariff, so the owner can sanity-check prices the way the pricing sheet
 * does: pick a vehicle, a trip type (and, for intercity, a listed city pair),
 * type the kilometres, driving minutes and helpers, and read off the itemised
 * quote plus the client total, commission and driver payout per service
 * level.
 *
 * It runs the same pure engine the estimate endpoint uses (`computeQuote`,
 * `quotedOrderPayout`) in the browser; nothing is written. Unsaved edits on
 * the other tabs are not reflected until saved.
 */
export default function AdminPricingSimulatorPage() {
  const t = useTranslations("admin.adminPricing");
  const { snapshot, loadError } = usePricingSnapshot();

  return (
    <PricingPageFrame
      intro={t("simulatorIntro")}
      snapshot={snapshot}
      loadError={loadError}
    >
      {(data) => <QuoteSimulator snapshot={data} />}
    </PricingPageFrame>
  );
}
