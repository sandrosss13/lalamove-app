"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  /** Destructive styling for the confirm button — deletes and overwrites. */
  destructive?: boolean;
  /**
   * The confirmed action. A returned string is shown as an error and keeps the
   * dialog open; anything else closes it.
   */
  onConfirm: () => Promise<string | null | void> | string | null | void;
};

/**
 * One confirmation dialog for every destructive CMS action (copy a locale over
 * another, restore defaults, remove a banner, delete a retired section,
 * discard unsaved edits), so each caller describes *what* is confirmed rather
 * than re-building the dialog.
 *
 * Mounted only while a request is pending — the parent keys it by request — so
 * its busy/error state always starts clean.
 */
export function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest;
  onClose: () => void;
}) {
  const t = useTranslations("admin.homePageCms");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);

    try {
      const result = await request.onConfirm();

      if (typeof result === "string") {
        setError(result);
        setBusy(false);
        return;
      }

      onClose();
    } catch {
      setError(t("somethingWentWrong"));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Escape, the overlay and the close button all land here; none of them
        // should interrupt an action already in flight.
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>{request.description}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={request.destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={() => void handleConfirm()}
          >
            {busy ? t("working") : request.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
