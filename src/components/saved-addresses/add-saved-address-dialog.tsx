"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  AddressAutocomplete,
  type AddressAutocompleteClassNames,
} from "@/components/address-autocomplete";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  SavedAddressDto,
  SavedAddressInput,
} from "@/lib/saved-addresses/contract";

import {
  CANCEL_BUTTON_CLASSES,
  EMPTY_SAVED_ADDRESS_DRAFT,
  FIELD_CLASSES,
  FIELD_LABEL_CLASSES,
  SAVE_BUTTON_CLASSES,
  SavedAddressFields,
  bodyFromDraft,
  type SavedAddressDraft,
} from "./saved-address-fields";
import { manualAddressProblem, readErrorMessage } from "./saved-address-format";

/**
 * Adds a saved address by hand, without booking to it first: an address search
 * (the booking form's own `AddressAutocomplete`) above the same label and
 * Contact Info fields the edit dialog has.
 *
 * Only a picked suggestion that resolved to coordinates can be saved — see
 * `manualAddressProblem` — so every hand-added row is one the booking form can
 * pin and price exactly like a booked one. A place already in the list is
 * refused here rather than sent, since the API would fold it into that row.
 *
 * Sends `POST /api/saved-addresses`, the endpoint the after-booking prompt
 * uses, and reports the row it returns; the limit (409) and validation (400)
 * errors are shown inline in the server's own wording and the dialog stays
 * open. The form starts empty each time the dialog opens.
 */

type LatLng = { lat: number; lng: number };

/** The autocomplete dressed in this dialog's field styles. */
const ADDRESS_FIELD_CLASS_NAMES = {
  root: "flex flex-col gap-1.5 text-sm",
  label: "flex flex-col gap-1.5",
  labelText: FIELD_LABEL_CLASSES,
  input: FIELD_CLASSES,
  listbox:
    "max-h-60 overflow-y-auto rounded-lg border border-line bg-surface py-1 text-sm text-paper shadow-lg",
  option:
    "block w-full px-3.5 py-2.5 text-left break-words hover:bg-ink focus-visible:bg-ink focus-visible:outline-none",
} satisfies AddressAutocompleteClassNames;

export function AddSavedAddressDialog({
  open,
  accountType,
  savedAddresses,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  accountType: "INDIVIDUAL" | "BUSINESS";
  /** The address strings already saved, to refuse a duplicate up front. */
  savedAddresses: string[];
  onOpenChange: (open: boolean) => void;
  /** The row the API returned; `duplicate` when it updated an existing one. */
  onSaved: (address: SavedAddressDto, duplicate: boolean) => void;
}) {
  const t = useTranslations("savedAddresses.addDialog");
  const tEdit = useTranslations("savedAddresses.editDialog");
  const tShared = useTranslations("common.shared");
  const isIndividual = accountType === "INDIVIDUAL";
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [draft, setDraft] = useState<SavedAddressDraft>(
    EMPTY_SAVED_ADDRESS_DRAFT,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Start empty on every closed → open transition, adjusting state during
     render as the edit dialog does. Remounting the autocomplete (`key`) clears
     the suggestions and coordinates it holds of its own. */
  const [wasOpen, setWasOpen] = useState(open);
  const [fieldKey, setFieldKey] = useState(0);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setAddress("");
      setLocation(null);
      setDraft(EMPTY_SAVED_ADDRESS_DRAFT);
      setError(null);
      setSubmitting(false);
      setFieldKey((key) => key + 1);
    }
  }

  function setField<K extends keyof SavedAddressDraft>(
    field: K,
    value: SavedAddressDraft[K],
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const problem = manualAddressProblem(address, location, savedAddresses);
    if (problem !== null || location === null) {
      setError(t(problem ?? "pickSuggestion"));
      return;
    }

    setError(null);
    setSubmitting(true);

    const body: Partial<SavedAddressInput> = {
      address: address.trim(),
      lat: location.lat,
      lng: location.lng,
      ...bodyFromDraft(draft, isIndividual),
    };

    try {
      const response = await fetch("/api/saved-addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, t("saveFailed")));
        setSubmitting(false);
        return;
      }

      const result: unknown = await response.json().catch(() => null);
      const saved =
        typeof result === "object" && result !== null && "address" in result
          ? (result as { address: SavedAddressDto; duplicate?: boolean })
          : null;

      // Unlike an edit there is no row to fall back on: without the API's id
      // the list could not edit or remove it, so a contract break is a failure.
      if (saved === null) {
        setError(t("saveFailed"));
        setSubmitting(false);
        return;
      }

      onSaved(saved.address, saved.duplicate === true);
      setSubmitting(false);
      onOpenChange(false);
    } catch {
      setError(tEdit("networkError"));
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
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
          <DialogDescription className="text-[0.8125rem] leading-snug text-muted">
            {t("description")}
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

        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="mt-4 flex flex-col gap-4"
        >
          <AddressAutocomplete
            key={fieldKey}
            id="add-saved-address"
            label={t("address")}
            value={address}
            onChange={(value) => {
              setAddress(value);
              setError(null);
            }}
            onLocationChange={setLocation}
            placeholder={t("addressPlaceholder")}
            classNames={ADDRESS_FIELD_CLASS_NAMES}
            required
          />

          <SavedAddressFields
            draft={draft}
            onFieldChange={setField}
            isIndividual={isIndividual}
            disabled={submitting}
          />

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
      </DialogContent>
    </Dialog>
  );
}
