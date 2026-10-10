"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { readErrorMessage } from "@/components/admin/read-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * One confirmation dialog for every wallet action that needs a single piece of
 * text from staff before it is sent: the reason for rejecting a bank account
 * or a withdrawal, the reason for reversing one, the bank's reference for a
 * payment.
 *
 * It owns the request: `buildRequest` turns the typed text into the call, the
 * dialog sends it, shows the API's own message when it is refused, and tells
 * the page to re-fetch when it lands.
 */
export function WalletActionDialog({
  title,
  description,
  fieldLabel,
  fieldHint,
  multiline,
  maxLength,
  confirmLabel,
  destructive = false,
  fallbackError,
  buildRequest,
  onClose,
  onDone,
}: {
  title: string;
  description: string;
  fieldLabel: string;
  fieldHint?: string;
  /** A textarea (a reason) rather than a one-line input (a reference). */
  multiline: boolean;
  maxLength: number;
  confirmLabel: string;
  destructive?: boolean;
  /** Shown when the request fails without a readable `{ error }` body. */
  fallbackError: string;
  buildRequest: (text: string) => { url: string; body: unknown };
  onClose: () => void;
  /** Called after the action is saved, so the table behind can re-fetch. */
  onDone: () => void;
}) {
  const tShared = useTranslations("common.shared");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);

    const { url, body } = buildRequest(text.trim());

    try {
      const response = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        setError(await readErrorMessage(response, fallbackError));
        setPending(false);
        return;
      }

      onDone();
      onClose();
    } catch {
      setError(fallbackError);
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="wallet-action-text">{fieldLabel}</Label>
          {multiline ? (
            <Textarea
              id="wallet-action-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={maxLength}
              disabled={pending}
            />
          ) : (
            <Input
              id="wallet-action-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={maxLength}
              disabled={pending}
            />
          )}
          {fieldHint ? (
            <p className="text-xs text-muted-foreground">{fieldHint}</p>
          ) : null}
        </div>

        {error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            {tShared("cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending || text.trim() === ""}
            onClick={() => void submit()}
          >
            {pending ? tShared("saving") : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
