"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";

import { useSignOut } from "@/components/auth/use-sign-out";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCOUNT_DELETION_CONFIRMATION_WORDS,
  ACCOUNT_DELETION_REFUSAL,
  type AccountDeletionRefusal,
} from "@/lib/account-deletion/rules";
import { cn } from "@/lib/utils";

/** Same field styling as `account-password-card.tsx`, for the same reason. */
const FIELD_INPUT_CLASSES =
  "h-10 border-line bg-ink text-sm text-paper placeholder:text-muted focus-visible:border-accent focus-visible:ring-accent/20";

const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

const MESSAGE_BASE_CLASSES =
  "rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-snug";

/**
 * The danger red, in both themes — spelled out per theme for the reason the
 * password card's success green is: a palette utility is a fixed hex.
 */
const DANGER_TEXT_CLASSES = "text-red-700 dark:text-red-400";

const DANGER_BUTTON_CLASSES =
  "h-9 rounded-full bg-red-600 px-4 text-[0.8125rem] font-semibold text-white hover:bg-red-700 disabled:opacity-50 dark:bg-red-500 dark:hover:bg-red-600";

/** `account.accountDeleteCard` key for each refusal. */
const REFUSAL_MESSAGE_KEYS: Record<AccountDeletionRefusal, string> = {
  [ACCOUNT_DELETION_REFUSAL.ACTIVE_ORDERS]: "blockedActiveOrders",
  [ACCOUNT_DELETION_REFUSAL.WALLET_BALANCE]: "blockedWalletBalance",
};

/**
 * The "Delete account" danger zone at the foot of `/account`.
 *
 * What it does is deactivate-and-anonymise, not a row delete — see
 * `@/lib/account-deletion/rules`. The card says so in the client's terms: past
 * orders stay (anonymised), it cannot be undone, and the phone number is free
 * to register again.
 *
 * `refusal` is the server's answer at render time. While it is set the reason
 * is shown and the button is disabled, so the client learns about an active
 * order before they go through the confirmation, not after. The API re-checks
 * under a lock regardless, and a refusal it returns is shown in the dialog.
 *
 * The confirmation is an in-page dialog where the client types a word
 * (`ACCOUNT_DELETION_CONFIRMATION_WORDS`, per locale) — never a browser
 * `confirm()`, which one stray Enter dismisses. On success the session is
 * already gone server-side; `useSignOut` clears the cookie and does the full
 * navigation home, the same exit every other sign-out takes.
 */
export function AccountDeleteCard({
  refusal,
}: {
  refusal: AccountDeletionRefusal | null;
}) {
  const t = useTranslations("account.accountDeleteCard");
  const tShared = useTranslations("common.shared");
  const locale = useLocale();
  const fieldId = useId();
  const { signOut } = useSignOut();

  const word =
    ACCOUNT_DELETION_CONFIRMATION_WORDS[
      locale as keyof typeof ACCOUNT_DELETION_CONFIRMATION_WORDS
    ] ?? ACCOUNT_DELETION_CONFIRMATION_WORDS.en;

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim() === word;

  function handleOpenChange(next: boolean) {
    // Once the deletion has gone through, the dialog stays up until the
    // navigation home replaces the page — there is nothing to go back to.
    if (deleting || deleted) {
      return;
    }

    setOpen(next);
    setTyped("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) {
      return;
    }

    setError(null);
    setDeleting(true);

    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: typed.trim() }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(payload?.error ?? t("couldNotDelete"));
        setDeleting(false);
        return;
      }
    } catch {
      setError(tShared("networkErrorPleaseCheckYourConnection"));
      setDeleting(false);
      return;
    }

    setDeleted(true);
    await signOut();
  }

  return (
    <Card className="gap-4 bg-ink text-paper ring-red-500/30">
      <CardHeader>
        <CardTitle
          className={cn(
            "font-display text-base font-semibold",
            DANGER_TEXT_CLASSES,
          )}
        >
          {t("title")}
        </CardTitle>
        <CardDescription className="text-[0.8125rem] leading-snug text-muted">
          {t("description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <ul className="flex list-disc flex-col gap-1.5 border-t border-line pt-4 pl-5 text-[0.8125rem] leading-snug text-muted">
          <li>{t("whatHappensOrdersKept")}</li>
          <li>{t("whatHappensDataRemoved")}</li>
          <li>{t("whatHappensPhoneFree")}</li>
          <li className="font-medium text-paper">
            {t("whatHappensCannotBeUndone")}
          </li>
        </ul>

        {refusal ? (
          <p
            role="status"
            className={cn(
              MESSAGE_BASE_CLASSES,
              "border-accent/30 bg-accent/10 text-accent",
            )}
          >
            {t(REFUSAL_MESSAGE_KEYS[refusal])}
          </p>
        ) : null}

        <Button
          type="button"
          disabled={refusal !== null}
          onClick={() => handleOpenChange(true)}
          className={cn(DANGER_BUTTON_CLASSES, "self-start")}
        >
          {t("deleteAccount")}
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Retinted to this page's fixed palette, like `add-card-dialog.tsx`;
            `ring-0` so the primitive's ring does not double the border. */}
        <DialogContent
          showCloseButton={false}
          className="gap-0 border border-line bg-ink p-5 text-paper ring-0 sm:max-w-[440px]"
        >
          <DialogHeader className="gap-1 pr-8">
            <DialogTitle
              className={cn(
                "font-display text-base font-semibold",
                DANGER_TEXT_CLASSES,
              )}
            >
              {t("dialogTitle")}
            </DialogTitle>
            <DialogDescription className="text-[0.8125rem] leading-snug text-muted">
              {t("dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogClose asChild>
            <button
              type="button"
              disabled={deleting || deleted}
              className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-paper disabled:opacity-50"
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">{tShared("close")}</span>
            </button>
          </DialogClose>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={fieldId} className={FIELD_LABEL_CLASSES}>
                {t("typeToConfirm", { word })}
              </Label>
              <Input
                id={fieldId}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={typed}
                disabled={deleting || deleted}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={word}
                className={FIELD_INPUT_CLASSES}
              />
            </div>

            {error ? (
              <p
                role="alert"
                className={cn(
                  MESSAGE_BASE_CLASSES,
                  "border-accent/30 bg-accent/10 text-accent",
                )}
              >
                {error}
              </p>
            ) : null}

            {deleted ? (
              <p
                role="status"
                className={cn(
                  MESSAGE_BASE_CLASSES,
                  "border-line bg-surface text-paper",
                )}
              >
                {t("deletedRedirecting")}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={deleting || deleted}
                onClick={() => handleOpenChange(false)}
                className="h-9 rounded-full border-line bg-ink px-4 text-[0.8125rem] font-semibold text-paper hover:border-accent/40 hover:bg-surface hover:text-accent"
              >
                {tShared("cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!confirmed || deleting || deleted}
                className={DANGER_BUTTON_CLASSES}
              >
                {deleting || deleted ? t("deleting") : t("confirmDelete")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
