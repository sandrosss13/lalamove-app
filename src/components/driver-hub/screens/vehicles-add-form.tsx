"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HubCard } from "@/components/driver-hub/hub-primitives";
import type { VehicleTypeOption } from "@/components/vehicle-type-select";
import { formatKilograms } from "@/components/driver-hub/screens/vehicles-format";
import type { HubAccountKind } from "@/lib/dashboard/hub/account";
import { cn } from "@/lib/utils";

/**
 * The "Add a vehicle" form, rendered in the Vehicles screen's right rail.
 *
 * The design's field list and the API's field list are not the same list, and
 * this form resolves that gap **visibly** rather than quietly:
 *
 * - Submitted, because `POST /api/{driver-profile,logistics-company}/vehicles`
 *   accepts them: `plateNumber`, `make`, `model`, `year`, `vehicleTypeCode`
 *   and one or more `photos`.
 * - Rendered disabled with a note, because `Vehicle` has no column for them:
 *   **Odometer** and **Operating cities**.
 * - Rendered disabled with a note, because it is a different resource with its
 *   own lifetime: **Assign to driver** (`DriverVehicleAssignment`, created by
 *   `POST /api/logistics-company/vehicles/[id]/assignment`, which also runs a
 *   licence-category gate this form cannot).
 *
 * Nothing typed into an enabled field is dropped, and nothing that would be
 * dropped can be typed into.
 *
 * Two deviations from the prototype's field list, both forced by the endpoint:
 * its single "Make and model" box is split into the two columns the API
 * actually stores (guessing where a make ends and a model begins is exactly
 * the silent data loss the honesty rule exists to prevent), and a **Photos**
 * field is added because the endpoint rejects a vehicle with none.
 *
 * The class rows are the seeded `VehicleTypeSpec` catalogue read from the
 * public `GET /api/vehicle-types`, not the prototype's three hand-written
 * labels — `vehicleTypeCode` is what the endpoint resolves and stores.
 * (`Vehicle.vehicleClass`, the onboarding wizards' presentation grouping, is
 * not settable through either POST route, so this form does not pretend to
 * set it.)
 */

/** The Georgian civilian plate format the design validates against. */
const PLATE_PATTERN = /^[A-Z]{2}-\d{3}-[A-Z]{2}$/;

/** Oldest accepted manufacturing year; mirrors both POST routes' lower bound. */
const MIN_VEHICLE_YEAR = 1980;

/** Shortest make/model the design accepts, matching its ">2 chars" rule. */
const MIN_NAME_LENGTH = 3;

const TYPES_ENDPOINT = "/api/vehicle-types";
const TYPES_ERROR =
  "Could not load the vehicle types. Refresh and try again.";
const GENERIC_ERROR = "Could not add this vehicle.";
const NETWORK_ERROR = "Network error. Please check your connection.";

/**
 * The design's eight operating cities, kept verbatim so the disabled control
 * looks like the one that will ship. Inert by construction — there is no
 * column to write them to — which is why this is a literal list here rather
 * than `GEORGIAN_CITY_OPTIONS`: importing the real vocabulary would imply the
 * selection goes somewhere.
 */
const DESIGN_OPERATING_CITIES = [
  "Tbilisi",
  "Rustavi",
  "Batumi",
  "Kutaisi",
  "Gori",
  "Zugdidi",
  "Telavi",
  "Mtskheta",
] as const;

const FIELD_LABEL_CLASSES = "text-xs font-medium text-muted-foreground";

const NOT_STORED_NOTE_CLASSES = "text-xs leading-relaxed text-muted-foreground";

export type VehiclesAddFormProps = {
  /** Picks the owner-scoped POST route. */
  kind: HubAccountKind;
  onCancel: () => void;
  /**
   * Fired after a successful create, with the new vehicle's id when the
   * response carried one — the screen selects it, as the design does.
   */
  onCreated: (vehicleId: string | null) => void;
};

/** A labelled column wrapper, so every field lines up the same way. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className={FIELD_LABEL_CLASSES}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function VehiclesAddForm({
  kind,
  onCancel,
  onCreated,
}: VehiclesAddFormProps) {
  const router = useRouter();

  const [plate, setPlate] = React.useState("");
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  const [year, setYear] = React.useState("");
  const [vehicleTypeCode, setVehicleTypeCode] = React.useState("");
  // The file input stays uncontrolled — a `<input type="file">` cannot be
  // controlled — so its count is mirrored here purely to drive validation.
  const [photoCount, setPhotoCount] = React.useState(0);

  const [types, setTypes] = React.useState<VehicleTypeOption[]>([]);
  const [typesError, setTypesError] = React.useState<string | null>(null);
  const [loadingTypes, setLoadingTypes] = React.useState(true);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const photoInputRef = React.useRef<HTMLInputElement>(null);

  // Registrations run a model year ahead of the calendar, so next year is a
  // legitimate choice — the same bound both POST routes enforce.
  const maxYear = new Date().getFullYear() + 1;

  React.useEffect(() => {
    // Aborts if the rail closes mid-flight, so the response never lands on an
    // unmounted panel.
    const controller = new AbortController();

    async function loadTypes() {
      try {
        const response = await fetch(TYPES_ENDPOINT, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setTypesError(TYPES_ERROR);
          return;
        }

        setTypes((await response.json()) as VehicleTypeOption[]);
      } catch {
        // An abort lands here too, but the component is on its way out by
        // then and the state update is skipped along with everything else.
        if (!controller.signal.aborted) {
          setTypesError(TYPES_ERROR);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTypes(false);
        }
      }
    }

    void loadTypes();

    return () => {
      controller.abort();
    };
  }, []);

  const trimmedPlate = plate.trim();
  const parsedYear = Number(year.trim());
  const yearValid =
    year.trim() !== "" &&
    Number.isInteger(parsedYear) &&
    parsedYear >= MIN_VEHICLE_YEAR &&
    parsedYear <= maxYear;

  const selectedType =
    types.find((type) => type.code === vehicleTypeCode) ?? null;

  const canSave =
    PLATE_PATTERN.test(trimmedPlate) &&
    make.trim().length >= MIN_NAME_LENGTH &&
    model.trim().length >= MIN_NAME_LENGTH &&
    yearValid &&
    selectedType !== null &&
    photoCount > 0;

  /**
   * The 12px line under the save button: it reads the selection back when the
   * form is valid, and otherwise names the first thing still missing, in the
   * order the fields appear.
   */
  const hint = canSave
    ? `${selectedType?.label ?? ""} · ${trimmedPlate} · ${photoCount} photo${
        photoCount === 1 ? "" : "s"
      }. It joins the fleet as idle until a driver is assigned to it.`
    : !PLATE_PATTERN.test(trimmedPlate)
      ? "Add a plate in the AB-123-CD format to continue."
      : make.trim().length < MIN_NAME_LENGTH
        ? "Add the make, e.g. Mercedes-Benz."
        : model.trim().length < MIN_NAME_LENGTH
          ? "Add the model, e.g. Sprinter."
          : !yearValid
            ? `Add a manufacturing year between ${MIN_VEHICLE_YEAR} and ${maxYear}.`
            : selectedType === null
              ? "Pick the class this vehicle is registered under."
              : "Add at least one photo of the vehicle.";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSave || selectedType === null) {
      return;
    }

    setError(null);
    setSubmitting(true);

    // Built by hand rather than from the form element: the endpoint takes
    // multipart/form-data, and spelling the payload out is what guarantees a
    // decorative field can never be appended to it by accident.
    const body = new FormData();
    body.set("plateNumber", trimmedPlate);
    body.set("make", make.trim());
    body.set("model", model.trim());
    body.set("year", String(parsedYear));
    body.set("vehicleTypeCode", selectedType.code);

    for (const photo of Array.from(photoInputRef.current?.files ?? [])) {
      body.append("photos", photo);
    }

    try {
      const response = await fetch(
        kind === "BUSINESS"
          ? "/api/logistics-company/vehicles"
          : "/api/driver-profile/vehicles",
        {
          method: "POST",
          // No explicit Content-Type: the browser has to set the multipart
          // boundary itself, and passing one here would break the parse.
          body,
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        // The route's own message is the specific one ("This plate number is
        // already registered.", "year must be a whole number between…").
        setError(payload?.error ?? GENERIC_ERROR);
        return;
      }

      onCreated(payload?.id ?? null);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HubCard>
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        {/* `pr-9` clears the ✕ `MasterDetailSplit` positions at the top-right. */}
        <div className="pr-9">
          <h2 className="text-base font-semibold">Add a vehicle</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            It joins the fleet as idle. Assigning a driver to it is what puts
            it on the road.
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3.5">
          <Field label="Plate" htmlFor="vehicle-plate">
            <Input
              id="vehicle-plate"
              value={plate}
              // Uppercased on input, as the design specifies — and as both
              // POST routes do again server-side, which is what makes the
              // unique constraint on `plateNumber` meaningful.
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              placeholder="AB-123-CD"
              autoComplete="off"
              spellCheck={false}
              className="h-auto rounded-md px-[11px] py-[9px] font-price text-[13px] md:text-[13px]"
            />
          </Field>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <Field label="Make" htmlFor="vehicle-make">
              <Input
                id="vehicle-make"
                value={make}
                onChange={(event) => setMake(event.target.value)}
                placeholder="Ford"
                className="h-auto rounded-md px-[11px] py-[9px] text-sm md:text-sm"
              />
            </Field>
            <Field label="Model" htmlFor="vehicle-model">
              <Input
                id="vehicle-model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="Transit Custom"
                className="h-auto rounded-md px-[11px] py-[9px] text-sm md:text-sm"
              />
            </Field>
          </div>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <Field label="Year" htmlFor="vehicle-year">
              <Input
                id="vehicle-year"
                inputMode="numeric"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                placeholder="2021"
                className="h-auto rounded-md px-[11px] py-[9px] font-price text-[13px] md:text-[13px]"
              />
            </Field>
            <Field label="Odometer (km)" htmlFor="vehicle-odometer">
              <Input
                id="vehicle-odometer"
                disabled
                placeholder="96480"
                aria-describedby="vehicle-odometer-note"
                className="h-auto rounded-md px-[11px] py-[9px] font-price text-[13px] md:text-[13px]"
              />
            </Field>
          </div>
          <p id="vehicle-odometer-note" className={NOT_STORED_NOTE_CLASSES}>
            Odometer is disabled: `Vehicle` has no reading to store it in, so
            anything typed here would be thrown away. It arrives with
            `Vehicle.odometerKm`.
          </p>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className={cn(FIELD_LABEL_CLASSES, "mb-2")}>Class</legend>
            {loadingTypes ? (
              <p className="text-[13px] text-muted-foreground">
                Loading vehicle classes…
              </p>
            ) : typesError !== null ? (
              <p
                role="alert"
                className="text-[13px] text-[oklch(44.4%_0.177_26.899)]"
              >
                {typesError}
              </p>
            ) : (
              types.map((type) => {
                const selected = type.code === vehicleTypeCode;

                return (
                  <label
                    key={type.code}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border p-3 transition-colors",
                      "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                      selected
                        ? "border-foreground bg-muted"
                        : "border-border bg-background hover:bg-muted/50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">
                        {type.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Up to{" "}
                        <span className="font-price">
                          {formatKilograms(type.maxPayloadKg)}
                        </span>
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="vehicleTypeCode"
                      value={type.code}
                      checked={selected}
                      onChange={() => setVehicleTypeCode(type.code)}
                      // Visually replaced by the ring beside it, but kept in
                      // the accessibility tree and the tab order so the group
                      // is operable with the arrow keys like any radio group.
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-3.5 shrink-0 rounded-full",
                        selected
                          ? "border-[5px] border-foreground"
                          : "border border-border",
                      )}
                    />
                  </label>
                );
              })
            )}
          </fieldset>

          <Field label="Photos" htmlFor="vehicle-photos">
            <input
              ref={photoInputRef}
              id="vehicle-photos"
              type="file"
              accept="image/*"
              multiple
              onChange={(event) =>
                setPhotoCount(event.target.files?.length ?? 0)
              }
              className="w-full min-w-0 rounded-md border border-input px-[11px] py-[9px] text-[13px] file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium file:text-foreground"
            />
            <p className={NOT_STORED_NOTE_CLASSES}>
              At least one photo is required — the endpoint rejects a vehicle
              without one. Up to 5 MB each.
            </p>
          </Field>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className={cn(FIELD_LABEL_CLASSES, "mb-2")}>
              Operating cities
            </legend>
            <div
              className="flex flex-wrap gap-2"
              aria-describedby="vehicle-cities-note"
            >
              {DESIGN_OPERATING_CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-full border border-border bg-background px-3 py-[7px] text-[13px] whitespace-nowrap text-muted-foreground opacity-60"
                >
                  {city}
                </button>
              ))}
            </div>
            <p id="vehicle-cities-note" className={NOT_STORED_NOTE_CLASSES}>
              Disabled: a vehicle has no operating-cities column — only the
              company&apos;s fleet-wide list exists — so a per-vehicle
              selection has nowhere to go yet.
            </p>
          </fieldset>

          <Field label="Assign to driver" htmlFor="vehicle-assign">
            <Input
              id="vehicle-assign"
              disabled
              placeholder="Assigned from the Drivers screen"
              aria-describedby="vehicle-assign-note"
              className="h-auto rounded-md px-[11px] py-[9px] text-sm md:text-sm"
            />
            <p id="vehicle-assign-note" className={NOT_STORED_NOTE_CLASSES}>
              Disabled: the driver↔vehicle pairing is its own record with its
              own licence-category check, created after the vehicle exists.
            </p>
          </Field>
        </div>

        {/* Inline, beside the control that failed — never an `alert()`. */}
        {error ? (
          <p
            role="alert"
            className="mt-4 text-[13px] text-[oklch(44.4%_0.177_26.899)]"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="submit"
            disabled={!canSave || submitting}
            className={cn(
              "h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium",
              canSave
                ? "bg-foreground text-background hover:bg-foreground/90"
                : // The design's disabled save is grey-filled and shows a
                  // not-allowed cursor rather than fading out, so the base
                  // variant's `opacity-50` and `pointer-events-none` are both
                  // overridden — the latter is what lets the cursor show.
                  "cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted disabled:pointer-events-auto disabled:opacity-100",
            )}
          >
            {submitting ? "Adding…" : "Add to fleet"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium"
          >
            Cancel
          </Button>
        </div>

        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </form>
    </HubCard>
  );
}
