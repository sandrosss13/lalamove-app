"use client";

import * as React from "react";
import type { LicenceCategory } from "@prisma/client";

import { Button } from "@/components/ui/button";
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
import { HubCard } from "@/components/driver-hub/hub-primitives";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";
import { cn } from "@/lib/utils";

/**
 * The Drivers screen's "Register a driver" form, rendered in the right rail of
 * the master/detail split.
 *
 * ## Why this form is bigger than the handoff's
 *
 * The design asks for four fields (Full name, Phone, Zone, Assign a vehicle).
 * `POST /api/logistics-company/drivers/register` — the only endpoint that can
 * put a driver on a roster — requires four more: an `email` (it creates a real
 * Better Auth account, and the address is the driver's login), plus
 * `licenceNumber`, `licenceExpiresAt` and a non-empty `licenceCategories`.
 * A company driver never walks the self-serve onboarding wizard, so this form
 * is the *only* moment the platform learns which licence categories they hold,
 * and without that the "a Category C vehicle needs a C driver" rule has nothing
 * to evaluate. Shipping the design's four fields alone would mean every submit
 * returned 400 — a control that silently drops the operator's input, which is
 * exactly what the hub's honesty rule forbids. The extra fields are therefore
 * additions to the design, not deviations from the endpoint.
 *
 * "Zone" is the city picker. There is no zone model in the schema (see
 * `HubDriver.cityLabel`), and `city` is what the endpoint accepts, so the
 * design's free-text zone box becomes the real enum it stands in for.
 *
 * The temporary password the endpoint returns is **not** handled here: it is
 * handed to the parent through `onRegistered` and revealed by the screen, so a
 * re-render of this form can never be what loses it. See `drivers-screen.tsx`.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One selectable vehicle in the "Assign a vehicle" list — a fleet vehicle that
 * nobody currently holds.
 *
 * Shaped by the server page rather than by this component because
 * `requiredLicenceCategory` comes from `VEHICLE_CLASSES`, and resolving it once
 * on the server keeps the class taxonomy out of the decision the operator sees.
 */
export type DriversVehicleOption = {
  id: string;
  plateNumber: string;
  /** "Mercedes-Benz Vito · Large Van" — make, model and class in one line. */
  description: string;
  /**
   * The licence category this vehicle's class demands, or null for a vehicle
   * with no declared class. Null means the endpoint's category gate does not
   * apply — matching `requiredCategoryForVehicle()` in the register route,
   * which lets pre-class vehicles through rather than making them permanently
   * unassignable.
   */
  requiredLicenceCategory: LicenceCategory | null;
};

/**
 * The slice of the register endpoint's 201 body this screen uses.
 *
 * Declared locally, not imported: `POST /api/logistics-company/drivers/register`
 * does not export a response type, and that route is owned by another part of
 * the codebase. The fields below are transcribed from its final
 * `NextResponse.json(...)`.
 */
export type RegisteredDriver = {
  /** `User.id` — what the roster rows and the removal endpoint key on. */
  userId: string;
  name: string;
  email: string;
  /** Returned exactly once, never persisted in readable form. */
  tempPassword: string;
  vehicleAssigned: boolean;
};

export type DriversAddPanelProps = {
  vehicles: readonly DriversVehicleOption[];
  onCancel: () => void;
  onRegistered: (driver: RegisteredDriver) => void;
};

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The three `LicenceCategory` enum members, with the plain-language note the
 * operator needs to pick correctly. Transcribed from
 * `src/lib/driver-onboarding/vehicle-classes.ts`, which is where the
 * class → category mapping actually lives.
 */
const LICENCE_CATEGORY_OPTIONS: readonly {
  value: LicenceCategory;
  note: string;
}[] = [
  { value: "B", note: "Cars and small vans" },
  { value: "C", note: "Rigid trucks" },
  { value: "CE", note: "Articulated combinations" },
];

/** The radio value that means "no vehicle yet" — the endpoint reads it as null. */
const NO_VEHICLE = "";

/** Minimum digits in a phone number, matching the handoff's own rule. */
const MIN_PHONE_DIGITS = 9;

/** The design's "Full name (>2 chars)". */
const MIN_NAME_LENGTH = 2;

/* -------------------------------------------------------------------------- */
/* Field wrapper                                                              */
/* -------------------------------------------------------------------------- */

/** The design's field: a 12px muted caption over a full-width control. */
function PanelField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

/**
 * Every text control in this panel wears the handoff's input metrics:
 * `font-size:14px; padding:9px 11px; border-radius:6px`. Height comes from the
 * padding, exactly as it does in the artboard — a fixed `h-9` fights that
 * padding and leaves these boxes a different size from the sibling
 * `vehicles-add-form.tsx`, which already carries these same three numbers.
 */
const INPUT_CLASSES = "h-auto rounded-md px-[11px] py-[9px] text-sm";

/**
 * The mono variant, for the values the hub always sets in `font-price`.
 *
 * `md:text-[13px]` is not redundant: `Input`'s own base classes end in
 * `md:text-sm`, which would quietly restore 14px above the `md` breakpoint and
 * leave these boxes disagreeing with the design's `font-size:13px`.
 */
const MONO_INPUT_CLASSES = "font-price text-[13px] md:text-[13px]";

/**
 * The design's pick-row, shared by the licence checkboxes and the vehicle
 * radios: `padding: '11px 13px', borderRadius: 8` from the artboard's
 * `pickRow` helper. Two lists of choices in one panel must not disagree about
 * their own geometry.
 */
const PICK_ROW_CLASSES = "rounded-lg border px-[13px] py-[11px]";

/* -------------------------------------------------------------------------- */
/* Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function DriversAddPanel({
  vehicles,
  onCancel,
  onRegistered,
}: DriversAddPanelProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [city, setCity] = React.useState("");
  const [licenceNumber, setLicenceNumber] = React.useState("");
  const [licenceExpiry, setLicenceExpiry] = React.useState("");
  const [categories, setCategories] = React.useState<LicenceCategory[]>([]);
  const [vehicleId, setVehicleId] = React.useState<string>(NO_VEHICLE);

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The endpoint wants `firstName` and `lastName` separately, so the design's
  // single "Full name" box is split on whitespace: the first word is the given
  // name and everything after it is the family name, which is the only split
  // that survives Georgian double-barrelled surnames intact.
  const nameParts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const [firstName = "", ...restOfName] = nameParts;
  const lastName = restOfName.join(" ");

  const phoneDigits = phone.replace(/\D/g, "");
  const selectedVehicle =
    vehicleId === NO_VEHICLE
      ? null
      : (vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null);
  const requiredCategory = selectedVehicle?.requiredLicenceCategory ?? null;

  const nameValid = name.trim().length > MIN_NAME_LENGTH && lastName.length > 0;
  const emailValid = /.+@.+\..+/.test(email.trim());
  const phoneValid = phoneDigits.length >= MIN_PHONE_DIGITS;
  const cityValid = city !== "";
  const licenceNumberValid = licenceNumber.trim().length > 0;
  // Strictly in the future, mirroring the endpoint: a licence expiring today
  // has already stopped being usable by the driver's first order. `Date.parse`
  // of a `type="date"` value is UTC midnight, which is the same instant the
  // server compares against.
  const expiryTimestamp = Date.parse(licenceExpiry);
  const expiryValid =
    Number.isFinite(expiryTimestamp) && expiryTimestamp > Date.now();
  const categoriesValid = categories.length > 0;
  const vehicleCategoryValid =
    requiredCategory === null || categories.includes(requiredCategory);

  const canSubmit =
    nameValid &&
    emailValid &&
    phoneValid &&
    cityValid &&
    licenceNumberValid &&
    expiryValid &&
    categoriesValid &&
    vehicleCategoryValid;

  const cityLabel =
    GEORGIAN_CITY_OPTIONS.find((option) => option.value === city)?.label ?? "";

  // One hint line naming the *first* thing standing in the way, in the order
  // the fields appear — a list of every problem at once reads as a wall and
  // does not tell the operator where to click.
  const hint = canSubmit
    ? `Registers ${name.trim()} in ${cityLabel} with ${
        selectedVehicle === null
          ? "no vehicle yet"
          : selectedVehicle.plateNumber
      }. A temporary password is shown once, here.`
    : !nameValid
      ? "Add a first and last name to continue."
      : !emailValid
        ? "Add the driver's email address — it is their login."
        : !phoneValid
          ? `Add a phone number with at least ${MIN_PHONE_DIGITS} digits.`
          : !cityValid
            ? "Pick the zone this driver works."
            : !licenceNumberValid
              ? "Add the driver's licence number."
              : !expiryValid
                ? "Add a licence expiry date in the future."
                : !categoriesValid
                  ? "Tick at least one licence category."
                  : `${selectedVehicle?.plateNumber ?? "That vehicle"} needs category ${requiredCategory}. Tick it, or assign a different vehicle.`;

  function toggleCategory(category: LicenceCategory, checked: boolean): void {
    setCategories((current) =>
      checked
        ? current.includes(category)
          ? current
          : [...current, category]
        : current.filter((entry) => entry !== category),
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    if (!canSubmit || submitting) {
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/logistics-company/drivers/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName,
          lastName,
          phone: phone.trim(),
          city,
          // Absent, null and "" all mean "no vehicle yet" to the endpoint.
          vehicleId: vehicleId === NO_VEHICLE ? null : vehicleId,
          licenceNumber: licenceNumber.trim(),
          licenceExpiresAt: new Date(expiryTimestamp).toISOString(),
          licenceCategories: categories,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        // Reported inline and without clearing a single field: a rejected email
        // or an already-taken vehicle is something the operator fixes in the
        // form that is still on screen.
        setError(payload?.error ?? "Could not register this driver.");
        return;
      }

      const created = (await response.json()) as RegisteredDriver;
      onRegistered(created);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <HubCard>
      {/* `pr-9` keeps the heading clear of the ✕ that `MasterDetailSplit`
          renders at the panel's top-right. */}
      <div className="pr-9">
        {/* A heading element, like the sibling panels' titles — this is the
            heading of the rail `MasterDetailSplit` just opened, not a stray
            line of body copy. */}
        <h2 className="text-base font-semibold">Register a driver</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          This creates their account. They sign in with the email below and the
          one-time password shown after saving, then set their own.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
        <PanelField label="Full name" htmlFor="hub-driver-name">
          <Input
            id="hub-driver-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Nika Kavtaradze"
            autoComplete="off"
            className={INPUT_CLASSES}
          />
        </PanelField>

        <PanelField label="Email" htmlFor="hub-driver-email">
          <Input
            id="hub-driver-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="driver@example.com"
            autoComplete="off"
            className={INPUT_CLASSES}
          />
        </PanelField>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <PanelField label="Phone" htmlFor="hub-driver-phone">
            <Input
              id="hub-driver-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+995 5XX XXX XXX"
              autoComplete="off"
              className={cn(INPUT_CLASSES, MONO_INPUT_CLASSES)}
            />
          </PanelField>

          <PanelField label="Zone" htmlFor="hub-driver-zone">
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger
                id="hub-driver-zone"
                // `data-[size=default]:h-auto` rather than the plain `h-auto`
                // in `INPUT_CLASSES`: `SelectTrigger`'s own height is written
                // as `data-[size=default]:h-8`, and an attribute selector out-
                // specifies a bare class — without this the trigger would keep
                // its 32px and sit a step shorter than the Phone box beside it.
                className={cn(
                  INPUT_CLASSES,
                  "w-full data-[size=default]:h-auto",
                )}
              >
                <SelectValue placeholder="Pick a city" />
              </SelectTrigger>
              {/* Portalled out of the shell's subtree, so it has to carry
                  `data-admin-surface` itself or it renders in the site palette. */}
              <SelectContent data-admin-surface="" className="max-h-72">
                {GEORGIAN_CITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PanelField>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <PanelField label="Licence number" htmlFor="hub-driver-licence">
            <Input
              id="hub-driver-licence"
              value={licenceNumber}
              onChange={(event) => setLicenceNumber(event.target.value)}
              placeholder="e.g. 01234567"
              autoComplete="off"
              className={cn(INPUT_CLASSES, MONO_INPUT_CLASSES)}
            />
          </PanelField>

          <PanelField label="Expires" htmlFor="hub-driver-licence-expiry">
            <Input
              id="hub-driver-licence-expiry"
              type="date"
              value={licenceExpiry}
              onChange={(event) => setLicenceExpiry(event.target.value)}
              className={cn(INPUT_CLASSES, MONO_INPUT_CLASSES)}
            />
          </PanelField>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            Licence categories
          </legend>
          {LICENCE_CATEGORY_OPTIONS.map((option) => {
            const checked = categories.includes(option.value);

            return (
              <Label
                key={option.value}
                className={cn(
                  "cursor-pointer gap-2.5 text-[13px] font-normal",
                  PICK_ROW_CLASSES,
                  checked
                    ? "border-foreground bg-muted"
                    : "border-border bg-background",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(state) =>
                    toggleCategory(option.value, state === true)
                  }
                />
                <span className="font-price font-semibold">{option.value}</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {option.note}
                </span>
              </Label>
            );
          })}
        </fieldset>

        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Assign a vehicle
          </span>

          {/* Real radios in a visually styled row: keyboard users get arrow-key
              navigation and a single tab stop for free, which a div with
              `onClick` would have had to reimplement.

              The design caps this list at four rows (`.slice(0, 4)`, counting
              its own "Unassigned" row first). Dropping the overflow outright
              would make a fifth free vehicle unassignable from the only form
              that can assign one, so the cap is on the list's *height*
              instead: four rows tall, the rest one scroll away. `-m-0.5 p-0.5`
              keeps a focused row's ring clear of the scroller's own clip. */}
          <div className="-m-0.5 flex max-h-[260px] min-w-0 flex-col gap-2 overflow-y-auto p-0.5">
            <VehicleRadioRow
              label="Unassigned"
              note="Assign later"
              selected={vehicleId === NO_VEHICLE}
              onSelect={() => setVehicleId(NO_VEHICLE)}
            />
            {vehicles.map((vehicle) => (
              <VehicleRadioRow
                key={vehicle.id}
                label={vehicle.plateNumber}
                // `{{ v.model }} · {{ v.class }}`, which is what
                // `description` already holds. The licence category the class
                // demands is not repeated on every row: it only matters for
                // the one vehicle actually picked, and the hint under the
                // buttons names it there — "AB-482-QM needs category C" —
                // where the operator is about to act on it.
                note={vehicle.description}
                selected={vehicleId === vehicle.id}
                onSelect={() => setVehicleId(vehicle.id)}
              />
            ))}
          </div>
          {vehicles.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Every fleet vehicle is currently held by a driver. Register this
              one unassigned and pair them from the Vehicles screen later.
            </p>
          ) : null}
        </div>

        {error === null ? null : (
          <p
            role="alert"
            className="text-[13px] text-[oklch(44.4%_0.177_26.899)]"
          >
            {error}
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap gap-2">
          <Button
            type="submit"
            // Genuinely disabled, not merely grey: a click that silently does
            // nothing is worse than one the browser refuses. The overrides
            // restore the design's "grey fill, muted text, not-allowed" look,
            // which `Button`'s default `disabled:opacity-50` would wash out.
            disabled={!canSubmit || submitting}
            className="h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {submitting ? "Registering…" : "Register driver"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onCancel}
            className="h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium"
          >
            Cancel
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </form>
    </HubCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Vehicle radio row                                                          */
/* -------------------------------------------------------------------------- */

/** The design's pick-row: bordered box, label + note, 14px ring on the right. */
function VehicleRadioRow({
  label,
  note,
  selected,
  onSelect,
}: {
  label: string;
  note: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Label
      className={cn(
        "cursor-pointer items-center justify-between gap-3 font-normal",
        PICK_ROW_CLASSES,
        // The radio itself is `sr-only`, so the focus ring has to be drawn by
        // the row that stands in for it.
        "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        selected ? "border-foreground bg-muted" : "border-border bg-background",
      )}
    >
      <input
        type="radio"
        name="hub-driver-vehicle"
        className="sr-only"
        checked={selected}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block truncate font-price text-[13px] font-medium">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {note}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 flex-none rounded-full border-4 bg-background",
          selected ? "border-foreground" : "border-border",
        )}
      />
    </Label>
  );
}
