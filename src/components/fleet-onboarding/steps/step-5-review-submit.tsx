"use client";

/**
 * Step 5 — review & submit: four summary cards over everything the company has
 * entered, and the button that turns the draft into real rows.
 *
 * Every row reads straight out of `useFleetDraft()`'s in-memory draft. The draft
 * is deliberately **not** re-fetched here: the debounced `PATCH` already saved
 * exactly what the server is about to validate, so re-reading it would only put
 * a spinner between the company and the button they came here to press.
 *
 * The one request this screen makes is the driver roster, because the draft
 * stores only a `driverProfileId` and a summary card cannot render an id. That
 * fetch is read-only convenience — `POST /api/logistics-company/onboarding/submit`
 * re-reads every driver from the database and trusts nothing rendered here.
 *
 * Nothing on this screen is authoritative. Every rule these values had to pass
 * is re-checked server-side; this shows what is about to be sent, it does not
 * gate it.
 */

import { useEffect, useState } from "react";

import {
  FLEET_SCREENS,
  useFleetDraft,
} from "@/components/fleet-onboarding/fleet-draft-context";
import {
  BODY_TYPES,
  VEHICLE_CLASSES,
  findVehicleClass,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import type {
  FleetDraftV1,
  FleetDraftVehicle,
} from "@/lib/fleet-onboarding/draft-schema";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { cn } from "@/lib/utils";

/**
 * The class ids `findVehicleClass` will accept, derived from the taxonomy rather
 * than restated: that function throws on an unknown id, and a draft written by
 * an older client can legitimately carry one.
 */
const KNOWN_CLASS_IDS: string[] = VEHICLE_CLASSES.map(
  (vehicleClass) => vehicleClass.id,
);

const SUBMIT_ENDPOINT = "/api/logistics-company/onboarding/submit";

/**
 * The roster endpoint is `/api/logistics-company/drivers` — not
 * `/api/logistics-company/fleet/drivers`, which does not exist — and it answers
 * with a bare array, not `{ drivers: [...] }`.
 */
const ROSTER_ENDPOINT = "/api/logistics-company/drivers";

const SUBMIT_ERROR_FALLBACK =
  "We couldn't submit your application. Check your connection and try again.";

/** Placeholder for a row the draft has nothing for, per the design. */
const EMPTY_VALUE = "—";

/** The fields this screen reads off a roster entry. `name` is already joined
 *  server-side (there is no `fullName`), and `categories` is flat and empty for
 *  a driver with no licence on file. */
type RosterEntry = {
  driverProfileId: string;
  name: string;
  categories: string[];
};

type SummaryRow = {
  /**
   * React key. Distinct from `label` because two vehicles can carry the same
   * plate in a half-filled draft — submit rejects that, but this screen has to
   * render it without duplicate keys on the way there.
   */
  key: string;
  label: string;
  value: string;
  labelClassName?: string;
  valueClassName?: string;
};

type SummaryCard = {
  title: string;
  /** The wizard screen this card's Edit link jumps back to. */
  editStep: number;
  /** Lower-cased noun for the Edit button's screen-reader suffix. */
  editLabel: string;
  rows: SummaryRow[];
};

/** Renders `value` if it is usable, otherwise the design's em-dash placeholder. */
function orPlaceholder(value: string | null | undefined): string {
  return value !== null && value !== undefined && value !== ""
    ? value
    : EMPTY_VALUE;
}

/** "TBILISI" → "Tbilisi", via the same option list the city picker uses. */
function formatCity(value: string): string {
  const option = GEORGIAN_CITY_OPTIONS.find((entry) => entry.value === value);
  return option?.label ?? value;
}

/** "2 vehicles", "1 vehicle". */
function vehicleCountLabel(count: number): string {
  return `${count} vehicle${count === 1 ? "" : "s"}`;
}

/** The company card's rows, in the design's order. */
function buildCompanyRows(draft: FleetDraftV1): SummaryRow[] {
  const company = draft.company ?? {};

  const cities = (company.citiesOfOperation ?? []).map(formatCity).join(", ");

  // Rendered as one row because operations always reads the two together —
  // "Nino Kapanadze · Fleet Manager" is who you call, not two facts.
  const contact = [company.contactName, company.contactRole]
    .filter(Boolean)
    .join(" · ");

  return [
    {
      key: "companyName",
      label: "Company name",
      value: orPlaceholder(company.companyName),
    },
    {
      key: "vatId",
      label: "VAT / tax ID",
      value: orPlaceholder(company.vatId),
      valueClassName: "font-price",
    },
    {
      key: "registeredAddress",
      label: "Registered address",
      value: orPlaceholder(company.registeredAddress),
    },
    {
      key: "citiesOfOperation",
      label: "Cities of operation",
      value: orPlaceholder(cities),
    },
    { key: "contact", label: "Contact", value: orPlaceholder(contact) },
    {
      key: "contactEmail",
      label: "Company email",
      value: orPlaceholder(company.contactEmail),
    },
    { key: "phone", label: "Phone", value: orPlaceholder(company.phone) },
    {
      key: "bankAccountIban",
      label: "Payout account",
      value: orPlaceholder(company.bankAccountIban),
      valueClassName: "font-price",
    },
  ];
}

/**
 * The fleet card's rows: one per cargo body that actually has vehicles, then a
 * bold total.
 *
 * Counted from `draft.vehicles` rather than from `draft.fleet.counts` on
 * purpose. The counts grid is what *generated* the vehicle rows in step 2, but
 * the vehicles are what step 3 edited and what submit will write, so tallying
 * them here means this card can never disagree with the Vehicles card below it.
 */
function buildFleetRows(vehicles: FleetDraftVehicle[]): SummaryRow[] {
  const rows: SummaryRow[] = [];

  for (const body of BODY_TYPES) {
    const count = vehicles.filter(
      (vehicle) => vehicle.chassisType === body.id,
    ).length;

    if (count === 0) continue;

    rows.push({
      key: body.id,
      label: body.shortLabel,
      value: vehicleCountLabel(count),
    });
  }

  rows.push({
    key: "total",
    label: "Total",
    value: vehicleCountLabel(vehicles.length),
    valueClassName: "font-semibold",
  });

  return rows;
}

/** The vehicles card's rows — one per vehicle, in the draft's own order. */
function buildVehicleRows(vehicles: FleetDraftVehicle[]): SummaryRow[] {
  return vehicles.map((vehicle, index) => {
    const className = KNOWN_CLASS_IDS.includes(vehicle.classId)
      ? findVehicleClass(vehicle.classId as VehicleClassId).name
      : null;
    const bodyLabel = BODY_TYPES.find(
      (body) => body.id === vehicle.chassisType,
    )?.shortLabel;

    const label = [className, bodyLabel].filter(Boolean).join(" · ");

    const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
    const payload =
      vehicle.payloadKg === undefined
        ? null
        : `${vehicle.payloadKg.toLocaleString("en-US")} kg`;

    const value = [makeModel, vehicle.plateNumber, payload]
      .filter(Boolean)
      .join(" · ");

    return {
      key: vehicle.id,
      label: `${index + 1}. ${label || EMPTY_VALUE}`,
      value: orPlaceholder(value),
    };
  });
}

/**
 * The drivers card's rows — one per vehicle, keyed by plate so the company reads
 * it the same way it filled step 4 in.
 *
 * `roster` is null while the fetch is in flight, which renders every value as
 * the placeholder rather than flashing wrong names.
 */
function buildDriverRows(
  vehicles: FleetDraftVehicle[],
  roster: Map<string, RosterEntry> | null,
): SummaryRow[] {
  return vehicles.map((vehicle, index) => {
    const label = vehicle.plateNumber ?? `Vehicle ${index + 1}`;
    const driver =
      vehicle.driverProfileId === undefined
        ? undefined
        : roster?.get(vehicle.driverProfileId);

    // A driver with no licence on file has no categories; their name alone is
    // the whole of what this row can say.
    const value =
      driver === undefined
        ? null
        : [driver.name, driver.categories.join(", ")]
            .filter(Boolean)
            .join(" · ");

    return {
      key: vehicle.id,
      label,
      // The plate is the identifier here, so it gets the mono treatment the rest
      // of the wizard gives plates; a fallback "Vehicle 3" is prose.
      labelClassName: vehicle.plateNumber ? "font-price" : undefined,
      value: orPlaceholder(value),
    };
  });
}

/**
 * Reads an `{ error }` body without letting a non-JSON response (an HTML error
 * page from an unhandled crash, say) throw over the top of the real failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return payload?.error ?? fallback;
}

export function Step5ReviewSubmit() {
  const { draft, goToStep, refetch } = useFleetDraft();

  const [roster, setRoster] = useState<Map<string, RosterEntry> | null>(null);
  const [rosterFailed, setRosterFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRoster() {
      try {
        const response = await fetch(ROSTER_ENDPOINT);
        if (!response.ok) throw new Error(String(response.status));

        const entries = (await response.json()) as RosterEntry[];
        if (!active) return;

        setRoster(
          new Map(entries.map((entry) => [entry.driverProfileId, entry])),
        );
      } catch {
        // A failed roster costs this card its names, not the company its submit
        // button: the endpoint re-reads every driver anyway.
        if (active) setRosterFailed(true);
      }
    }

    void loadRoster();

    return () => {
      active = false;
    };
  }, []);

  const vehicles = draft.vehicles ?? [];
  const assignedCount = vehicles.filter(
    (vehicle) => vehicle.driverProfileId !== undefined,
  ).length;

  const cards: SummaryCard[] = [
    {
      title: "Company",
      editStep: FLEET_SCREENS.company,
      editLabel: "company",
      rows: buildCompanyRows(draft),
    },
    {
      title: "Fleet",
      editStep: FLEET_SCREENS.fleet,
      editLabel: "fleet",
      rows: buildFleetRows(vehicles),
    },
    {
      title: "Vehicles",
      editStep: FLEET_SCREENS.vehicles,
      editLabel: "vehicles",
      rows: buildVehicleRows(vehicles),
    },
    {
      title: "Drivers",
      editStep: FLEET_SCREENS.drivers,
      editLabel: "drivers",
      rows: rosterFailed
        ? // The raw count, rather than a card full of placeholders or no card at
          // all, when the roster could not be read.
          [
            {
              key: "assigned",
              label: "Assigned",
              value: `${assignedCount} of ${vehicleCountLabel(vehicles.length)}`,
            },
          ]
        : buildDriverRows(vehicles, roster),
    },
  ];

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    let response: Response;
    try {
      // No body on purpose: the server validates its own saved state, so there
      // is nothing left for this screen to send.
      response = await fetch(SUBMIT_ENDPOINT, { method: "POST" });
    } catch {
      setSubmitError(SUBMIT_ERROR_FALLBACK);
      setSubmitting(false);
      return;
    }

    if (!response.ok) {
      setSubmitError(await readErrorMessage(response, SUBMIT_ERROR_FALLBACK));
      setSubmitting(false);
      return;
    }

    // The shell swaps this whole wizard for the status screen as soon as the
    // refetched `status` is no longer "DRAFT", so `submitting` is deliberately
    // left set: the button stays disabled for the instant before it unmounts,
    // rather than flicking back to "Submit application".
    await refetch();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-[1.5] text-muted-foreground">
        The company is reviewed as a whole. Individual vehicles can be sent back
        without holding up the rest of the fleet.
      </p>

      {cards.map((card) => (
        <section
          key={card.title}
          className="overflow-hidden rounded-[13px] border border-border bg-card"
        >
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-[13px] py-[11px]">
            <h2 className="text-[12.5px] font-semibold">{card.title}</h2>
            <button
              type="button"
              onClick={() => goToStep(card.editStep)}
              className="cursor-pointer text-xs font-semibold text-onboarding-accent transition-colors hover:text-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              Edit
              <span className="sr-only"> {card.editLabel}</span>
            </button>
          </div>

          <dl className="px-[13px] pt-1 pb-2.5">
            {card.rows.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline justify-between gap-3.5 py-1.5"
              >
                <dt
                  className={cn(
                    "shrink-0 text-[12.5px] text-muted-foreground",
                    row.labelClassName,
                  )}
                >
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "text-right text-[12.5px] font-medium",
                    row.valueClassName,
                  )}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <div className="mt-5 border-t border-border pt-[22px]">
        {submitError !== null ? (
          <p role="alert" className="mb-3 text-[13px] text-destructive">
            {submitError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </div>
  );
}
