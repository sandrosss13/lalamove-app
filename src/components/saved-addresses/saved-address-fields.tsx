"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { STOP_CONTACT_MAX_LENGTHS } from "@/lib/orders/stop-contact-limits";
import type {
  SavedAddressDto,
  SavedAddressInput,
} from "@/lib/saved-addresses/contract";

import { SavedAddressLabelField } from "./label-field";

/**
 * The label and every Contact Info / access field of a saved address — the
 * same fields the booking form's Contact Info dialog and helper step capture
 * for a stop. Shared by the manage page's edit and add dialogs, which differ
 * only in what sits above it (the read-only address vs. an address search) and
 * in where they send it.
 */

/** Everything but the place itself, with the floor as typed. */
export type SavedAddressDraft = Omit<
  SavedAddressInput,
  "address" | "lat" | "lng" | "floor"
> & {
  /** The floor as typed: digits only, empty for the ground floor. */
  floor: string;
};

export const EMPTY_SAVED_ADDRESS_DRAFT: SavedAddressDraft = {
  label: "",
  contactName: "",
  contactPhone: "",
  buildingName: "",
  entrance: "",
  floor: "",
  passengerElevator: false,
  cargoElevator: false,
  comment: "",
};

export function draftFromSavedAddress(
  address: SavedAddressDto,
): SavedAddressDraft {
  return {
    label: address.label,
    contactName: address.contactName,
    contactPhone: address.contactPhone,
    buildingName: address.buildingName,
    entrance: address.entrance,
    floor: address.floor > 0 ? String(address.floor) : "",
    passengerElevator: address.passengerElevator,
    cargoElevator: address.cargoElevator,
    comment: address.comment,
  };
}

/**
 * The draft as request fields. The comment is left out for a business: it has
 * no comment field, and the API stores "" for one regardless.
 */
export function bodyFromDraft(
  draft: SavedAddressDraft,
  isIndividual: boolean,
): Omit<Partial<SavedAddressInput>, "address" | "lat" | "lng"> {
  return {
    label: draft.label.trim(),
    contactName: draft.contactName,
    contactPhone: draft.contactPhone,
    buildingName: draft.buildingName,
    entrance: draft.entrance,
    floor: draft.floor === "" ? 0 : Number.parseInt(draft.floor, 10),
    passengerElevator: draft.passengerElevator,
    cargoElevator: draft.cargoElevator,
    ...(isIndividual ? { comment: draft.comment } : {}),
  };
}

const PHONE_COUNTRY_CODE = "+995";

export const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

export const FIELD_CLASSES =
  "h-11 w-full rounded-lg border border-line bg-ink px-3.5 text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

export const SAVE_BUTTON_CLASSES =
  "h-11 rounded-lg bg-accent px-5 text-[0.8125rem] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:opacity-100";

export const CANCEL_BUTTON_CLASSES =
  "h-11 rounded-lg px-4 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-accent-hover";

export function SavedAddressFields({
  draft,
  onFieldChange,
  isIndividual,
  disabled,
}: {
  draft: SavedAddressDraft;
  onFieldChange: <K extends keyof SavedAddressDraft>(
    field: K,
    value: SavedAddressDraft[K],
  ) => void;
  /** A BUSINESS client is not asked for a driver comment. */
  isIndividual: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("savedAddresses.editDialog");
  const idPrefix = useId();
  const setField = onFieldChange;

  const ids = {
    label: `${idPrefix}-label`,
    name: `${idPrefix}-name`,
    phone: `${idPrefix}-phone`,
    building: `${idPrefix}-building`,
    entrance: `${idPrefix}-entrance`,
    floor: `${idPrefix}-floor`,
    passenger: `${idPrefix}-passenger`,
    cargo: `${idPrefix}-cargo`,
    comment: `${idPrefix}-comment`,
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.label} className={FIELD_LABEL_CLASSES}>
          {t("label")}
        </Label>
        <SavedAddressLabelField
          id={ids.label}
          value={draft.label}
          onChange={(value) => setField("label", value)}
          disabled={disabled}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.name} className={FIELD_LABEL_CLASSES}>
          {t("contactName")}
        </Label>
        <input
          id={ids.name}
          type="text"
          value={draft.contactName}
          onChange={(event) => setField("contactName", event.target.value)}
          maxLength={STOP_CONTACT_MAX_LENGTHS.name}
          autoComplete="off"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.phone} className={FIELD_LABEL_CLASSES}>
          {t("contactPhone")}
        </Label>
        {/* Same dialling-code box as the booking form's Contact Info. */}
        <div className="flex h-11 w-full items-center rounded-lg border border-line bg-ink px-3.5 transition-colors has-[:focus-visible]:border-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20">
          <span aria-hidden="true" className="shrink-0 text-sm text-muted">
            {PHONE_COUNTRY_CODE}
          </span>
          <input
            id={ids.phone}
            type="text"
            inputMode="tel"
            value={draft.contactPhone}
            onChange={(event) => setField("contactPhone", event.target.value)}
            maxLength={STOP_CONTACT_MAX_LENGTHS.phone}
            autoComplete="off"
            className="h-full w-full min-w-0 border-0 bg-transparent pl-3 text-sm text-paper outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ids.building} className={FIELD_LABEL_CLASSES}>
          {t("buildingName")}
        </Label>
        <input
          id={ids.building}
          type="text"
          value={draft.buildingName}
          onChange={(event) => setField("buildingName", event.target.value)}
          maxLength={STOP_CONTACT_MAX_LENGTHS.buildingName}
          autoComplete="off"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={ids.entrance} className={FIELD_LABEL_CLASSES}>
            {t("entrance")}
          </Label>
          <input
            id={ids.entrance}
            type="text"
            value={draft.entrance}
            onChange={(event) => setField("entrance", event.target.value)}
            maxLength={STOP_CONTACT_MAX_LENGTHS.entrance}
            autoComplete="off"
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={ids.floor} className={FIELD_LABEL_CLASSES}>
            {t("floor")}
          </Label>
          <input
            id={ids.floor}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={draft.floor}
            onChange={(event) =>
              setField("floor", event.target.value.replace(/\D/g, ""))
            }
            placeholder={t("floorPlaceholder")}
            autoComplete="off"
            className={`${FIELD_CLASSES} font-price tabular-nums`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2.5">
        <div className="flex items-center gap-2.5">
          <input
            id={ids.passenger}
            type="checkbox"
            checked={draft.passengerElevator}
            onChange={(event) =>
              setField("passengerElevator", event.target.checked)
            }
            className="size-4 shrink-0 accent-accent"
          />
          <Label
            htmlFor={ids.passenger}
            className="text-[0.8125rem] font-normal text-paper"
          >
            {t("passengerElevator")}
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <input
            id={ids.cargo}
            type="checkbox"
            checked={draft.cargoElevator}
            onChange={(event) =>
              setField("cargoElevator", event.target.checked)
            }
            className="size-4 shrink-0 accent-accent"
          />
          <Label
            htmlFor={ids.cargo}
            className="text-[0.8125rem] font-normal text-paper"
          >
            {t("cargoElevator")}
          </Label>
        </div>
      </div>

      {isIndividual ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.comment} className={FIELD_LABEL_CLASSES}>
            {t("comment")}
          </Label>
          <textarea
            id={ids.comment}
            value={draft.comment}
            onChange={(event) => setField("comment", event.target.value)}
            placeholder={t("commentPlaceholder")}
            rows={3}
            maxLength={STOP_CONTACT_MAX_LENGTHS.comment}
            className="min-h-[84px] w-full resize-y rounded-lg border border-line bg-ink px-3.5 py-3 text-sm leading-snug text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20"
          />
        </div>
      ) : null}
    </>
  );
}
