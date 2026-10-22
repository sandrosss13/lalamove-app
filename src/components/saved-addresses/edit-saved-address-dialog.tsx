"use client";

import { useState } from "react";
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
import type {
  SavedAddressDto,
  SavedAddressInput,
} from "@/lib/saved-addresses/contract";

import {
  CANCEL_BUTTON_CLASSES,
  SAVE_BUTTON_CLASSES,
  SavedAddressFields,
  bodyFromDraft,
  draftFromSavedAddress,
  type SavedAddressDraft,
} from "./saved-address-fields";
import { readErrorMessage } from "./saved-address-format";

/**
 * Edits one saved address: its label and every Contact Info / access field —
 * the same fields the booking form's Contact Info dialog and helper step
 * capture for a stop. The address and its coordinates are read-only: they come
 * from a geocoded booking or search, and retyping the address here would detach
 * it from the position the driver is routed to. To save a different place, the
 * client adds it (`AddSavedAddressDialog`) or saves it after booking to it.
 *
 * Sends `PATCH /api/saved-addresses/[id]` and reports the row the API returns;
 * a failure is shown inline in the server's own wording and the dialog stays
 * open. The draft is re-seeded each time a (different) address opens it.
 */

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
  const isIndividual = accountType === "INDIVIDUAL";
  const [draft, setDraft] = useState<SavedAddressDraft | null>(
    address ? draftFromSavedAddress(address) : null,
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
      setDraft(draftFromSavedAddress(address));
      setError(null);
      setSubmitting(false);
    }
  }

  function setField<K extends keyof SavedAddressDraft>(
    field: K,
    value: SavedAddressDraft[K],
  ) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !draft || submitting) return;

    setError(null);
    setSubmitting(true);

    const body: Partial<SavedAddressInput> = bodyFromDraft(draft, isIndividual);

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
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
