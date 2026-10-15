"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { STOP_CONTACT_MAX_LENGTHS } from "@/lib/orders/stop-contact-limits";
import type {
  SavedAddressDto,
  SavedAddressInput,
} from "@/lib/saved-addresses/contract";

import { SavedAddressLabelField } from "./label-field";
import { readErrorMessage } from "./saved-address-format";

/**
 * Edits one saved address: its label and every Contact Info / access field —
 * the same fields the booking form's Contact Info dialog and helper step
 * capture for a stop. The address and its coordinates are read-only: they come
 * from a geocoded booking, and retyping the address here would detach it from
 * the position the driver is routed to. To save a different place, the client
 * books to it and saves it from the confirmation page.
 *
 * Sends `PATCH /api/saved-addresses/[id]` and reports the row the API returns;
 * a failure is shown inline in the server's own wording and the dialog stays
 * open. The draft is re-seeded each time a (different) address opens it.
 */

type Draft = Omit<SavedAddressInput, "address" | "lat" | "lng" | "floor"> & {
  /** The floor as typed: digits only, empty for the ground floor. */
  floor: string;
};

const PHONE_COUNTRY_CODE = "+995";

const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

const FIELD_CLASSES =
  "h-11 w-full rounded-lg border border-line bg-ink px-3.5 text-sm text-paper transition-colors outline-none placeholder:text-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

const SAVE_BUTTON_CLASSES =
  "h-11 rounded-lg bg-accent px-5 text-[0.8125rem] font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-auto disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:opacity-100";

const CANCEL_BUTTON_CLASSES =
  "h-11 rounded-lg px-4 text-[0.8125rem] font-semibold text-accent transition-colors hover:text-accent-hover";

function draftFrom(address: SavedAddressDto): Draft {
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

export function EditSavedAddressDialog({
  address,
  accountType,
  onOpenChange,
  onSaved,
}: {
  /** The address being edited; `null` closes the dialog. */
  address: SavedAddressDto | null;
  accountType: "INDIVIDUAL" | "BUSINESS";
  onOpenChange: (open: boolean) => void;
  onSaved: (address: SavedAddressDto) => void;
}) {
  const t = useTranslations("savedAddresses.editDialog");
  const tShared = useTranslations("common.shared");
  const idPrefix = useId();
  const isIndividual = accountType === "INDIVIDUAL";
  const [draft, setDraft] = useState<Draft | null>(
    address ? draftFrom(address) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Re-seed when a different address opens the dialog, adjusting state during
     render rather than in an effect — the same idiom as
     `stop-contact-dialog.tsx`, keyed off the id rather than the object so a
     parent re-render does not reset fields under the cursor. */
  const [seededId, setSeededId] = useState<string | null>(address?.id ?? null);

  if ((address?.id ?? null) !== seededId) {
    setSeededId(address?.id ?? null);
    if (address) {
      setDraft(draftFrom(address));
      setError(null);
      setSubmitting(false);
    }
  }

  function setField<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !draft || submitting) return;

    setError(null);
    setSubmitting(true);

    const body: Partial<SavedAddressInput> = {
      label: draft.label.trim(),
      contactName: draft.contactName,
      contactPhone: draft.contactPhone,
      buildingName: draft.buildingName,
      entrance: draft.entrance,
      floor: draft.floor === "" ? 0 : Number.parseInt(draft.floor, 10),
      passengerElevator: draft.passengerElevator,
      cargoElevator: draft.cargoElevator,
      // Not sent for a business: it has no comment field, and the API stores
      // "" for one regardless.
      ...(isIndividual ? { comment: draft.comment } : {}),
    };

    try {
      const response = await fetch(
        `/api/saved-addresses/${encodeURIComponent(address.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        setError(await readErrorMessage(response, t("saveFailed")));
        setSubmitting(false);
        return;
      }

      const result: unknown = await response.json().catch(() => null);
      const updated =
        typeof result === "object" && result !== null && "address" in result
          ? (result as { address: SavedAddressDto }).address
          : null;

      // A 2xx without the row would be a contract break; fall back to the
      // draft merged over what was there, so the list still shows the edit.
      onSaved(
        updated ?? {
          ...address,
          ...body,
          comment: body.comment ?? address.comment,
          label: body.label || address.address,
        },
      );
      setSubmitting(false);
      onOpenChange(false);
    } catch {
      setError(t("networkError"));
      setSubmitting(false);
    }
  }

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
    <Dialog
      open={address !== null}
      onOpenChange={(open) => {
        if (!submitting) onOpenChange(open);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto border border-line bg-ink p-5 text-paper ring-0 sm:max-w-[480px]"
      >
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="font-sans text-[0.8125rem] font-semibold tracking-[0.1em] text-muted uppercase">
            {t("title")}
          </DialogTitle>
          {/* The address, read-only: it names which place is being edited. */}
          <DialogDescription className="text-[0.875rem] leading-snug break-words text-paper">
            {address?.address}
          </DialogDescription>
        </DialogHeader>

        <DialogClose asChild>
          <button
            type="button"
            disabled={submitting}
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-paper"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">{tShared("close")}</span>
          </button>
        </DialogClose>

        {draft ? (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-4 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={ids.label} className={FIELD_LABEL_CLASSES}>
                {t("label")}
              </Label>
              <SavedAddressLabelField
                id={ids.label}
                value={draft.label}
                onChange={(value) => setField("label", value)}
                disabled={submitting}
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
                onChange={(event) =>
                  setField("contactName", event.target.value)
                }
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
                <span
                  aria-hidden="true"
                  className="shrink-0 text-sm text-muted"
                >
                  {PHONE_COUNTRY_CODE}
                </span>
                <input
                  id={ids.phone}
                  type="text"
                  inputMode="tel"
                  value={draft.contactPhone}
                  onChange={(event) =>
                    setField("contactPhone", event.target.value)
                  }
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
                onChange={(event) =>
                  setField("buildingName", event.target.value)
                }
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

            {error === null ? null : (
              <p
                role="alert"
                className="text-[0.8125rem] text-red-700 dark:text-red-400"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <button
                  type="button"
                  disabled={submitting}
                  className={CANCEL_BUTTON_CLASSES}
                >
                  {tShared("cancel")}
                </button>
              </DialogClose>
              <button
                type="submit"
                disabled={submitting}
                className={SAVE_BUTTON_CLASSES}
              >
                {submitting ? tShared("saving") : t("save")}
              </button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
