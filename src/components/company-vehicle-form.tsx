"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { VehicleTypeSelect } from "@/components/vehicle-type-select";

/** Oldest selectable manufacturing year; mirrors the API's lower bound. */
const MIN_VEHICLE_YEAR = 1980;

/**
 * Company-facing form that registers a fleet vehicle via
 * POST /api/logistics-company/vehicles. The vehicle is owned by the company
 * itself, not by any driver on its roster — dispatch is what pairs a driver
 * with a vehicle, and that happens per order.
 *
 * Deliberately the same shape as `VehicleForm`: uncontrolled and submitted as
 * `FormData` built from the form element, because a `<input type="file">`
 * cannot be a controlled React input and the endpoint takes
 * `multipart/form-data` anyway. A successful add resets the fields and
 * refreshes the server component so the new vehicle appears in the fleet list.
 *
 * `onSuccess` is optional and fires only after a successful add, so a host that
 * renders this inside a drawer can close it and raise a toast.
 */
export function CompanyVehicleForm({ onSuccess }: { onSuccess?: () => void }) {
  const t = useTranslations("common.companyVehicleForm");
  const tShared = useTranslations("common.shared");
  // "Add vehicle" was extracted once, from the driver hub's vehicles screen;
  // borrowed from there rather than duplicated so the two buttons agree.
  const tVehicles = useTranslations("driverHub.vehiclesScreen");
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  // The one controlled field: the picker needs it to show the selected type's
  // payload limit. It still submits through `FormData` like the rest.
  const [vehicleTypeCode, setVehicleTypeCode] = useState("");

  // Registrations run a model year ahead of the calendar, so next year is a
  // legitimate choice.
  const maxYear = new Date().getFullYear() + 1;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // `currentTarget` is nulled out once the handler yields at the first
    // `await`, so capture the form while it is still available.
    const form = event.currentTarget;

    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      const response = await fetch("/api/logistics-company/vehicles", {
        method: "POST",
        // No explicit Content-Type: the browser has to set the multipart
        // boundary itself, and passing one here would break the parse.
        body: new FormData(form),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? "Could not add this vehicle.");
        return;
      }

      form.reset();
      // `form.reset()` only restores the uncontrolled fields; React state has
      // to be cleared alongside it.
      setVehicleTypeCode("");
      setSuccess(true);
      router.refresh();
      try {
        onSuccess?.();
      } catch {
        // A bug in the caller's callback must not be reported as this
        // component's own failure: the POST succeeded and the refresh already
        // ran, so surfacing a network error here would be a lie.
      }
    } catch {
      setError(tShared("networkErrorPleaseCheckYourConnection"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t("plateNumber")}
        <input
          type="text"
          name="plateNumber"
          required
          placeholder={t("eGAa123Bb")}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {tShared("make")}
        <input
          type="text"
          name="make"
          required
          placeholder={t("eGMercedesBenz")}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {tShared("model")}
        <input
          type="text"
          name="model"
          required
          placeholder={t("eGActros")}
          className="rounded border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {tShared("year")}
        <input
          type="number"
          name="year"
          required
          min={MIN_VEHICLE_YEAR}
          max={maxYear}
          step={1}
          className="rounded border px-3 py-2"
        />
      </label>

      <VehicleTypeSelect
        value={vehicleTypeCode}
        onChange={setVehicleTypeCode}
      />

      <label className="flex flex-col gap-1 text-sm">
        {tShared("photos")}
        <input
          type="file"
          name="photos"
          accept="image/*"
          multiple
          required
          className="rounded border px-3 py-2"
        />
        <span className="text-xs opacity-60">
          {t("atLeastOnePhotoIsRequired")}
        </span>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? (
        <p className="text-sm text-green-700">{t("vehicleAddedToYourFleet")}</p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded border px-4 py-2 font-medium hover:opacity-70 disabled:opacity-50"
      >
        {submitting ? "Adding…" : tVehicles("addVehicle")}
      </button>
    </form>
  );
}
