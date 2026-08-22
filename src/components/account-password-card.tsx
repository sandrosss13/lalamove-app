"use client";

import { useId, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Field styling, re-tokenised off the shadcn defaults for the same reason as in
 * `account-profile-form.tsx`: the primitives' `border-input` / `ring-ring`
 * defaults follow a light/dark token set this fixed-palette page never opted
 * into.
 */
const FIELD_INPUT_CLASSES =
  "h-10 border-line bg-ink text-sm text-paper placeholder:text-muted focus-visible:border-accent focus-visible:ring-accent/20";

const FIELD_LABEL_CLASSES = "text-[0.8125rem] font-medium text-paper";

const MESSAGE_BASE_CLASSES =
  "rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-snug";

/** Matches the minimum Better Auth is configured to accept. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The "Account access" card on `/account`: one row per credential the client
 * can manage themselves, which today is exactly one — their password.
 *
 * Deliberately no passkey row (the plugin isn't configured in `@/lib/auth`) and
 * no delete-account row (nothing in this codebase can delete a user), rather
 * than controls that would look real and do nothing.
 *
 * This is the *voluntary* change, distinct from `/change-password`: that page
 * is the forced reset a driver is bounced into while holding a temporary
 * password, and it navigates away on success. Here the client is already where
 * they want to be, so a successful change just collapses the form back down.
 */
export function AccountPasswordCard() {
  const fieldId = useId();
  const formId = useId();

  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  /** Drops whatever was typed so a password never lingers in a hidden form. */
  function resetFields() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
      setError(null);
      resetFields();
      return;
    }

    // Opening for another go: the previous confirmation is about a change that
    // is already done, so it stops being the answer to what's on screen now.
    setChanged(false);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Checked before the request so a typo costs nothing — the round trip would
    // otherwise succeed and leave the client locked out behind a password they
    // mistyped. Same guard as `/change-password`.
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSaving(true);

    // No `revokeOtherSessions` here, unlike the forced reset on
    // `/change-password`: that flow assumes a temporary password other people
    // may have seen, so it evicts every other device. This one is a client
    // routinely rotating their own password from a device they're signed in
    // on, and silently signing out their other phones would be a surprise.
    const { error: changePasswordError } = await changePassword({
      currentPassword,
      newPassword,
    });

    setSaving(false);

    if (changePasswordError) {
      setError(
        changePasswordError.message ??
          "Could not change your password. Please try again.",
      );
      return;
    }

    resetFields();
    setOpen(false);
    setChanged(true);
  }

  return (
    <Card className="gap-4 bg-ink text-paper ring-line">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold text-paper">
          Account access
        </CardTitle>
        <CardDescription className="text-[0.8125rem] leading-snug text-muted">
          The credentials you sign in with.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-paper">Password</p>
            <p className="mt-0.5 text-xs leading-snug text-muted">
              Used with your email address to sign in.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleToggle}
            aria-expanded={open}
            aria-controls={formId}
            className="h-9 rounded-full border-line bg-ink px-4 text-[0.8125rem] font-semibold text-paper hover:border-accent/40 hover:bg-surface hover:text-accent"
          >
            {open ? "Cancel" : "Change password"}
          </Button>
        </div>

        {/* Rendered only while open — a collapsed-but-present form would keep
            three password fields in the accessibility tree and in autofill's
            reach for a control the client hasn't asked for yet. */}
        {open ? (
          <form
            id={formId}
            onSubmit={handleSubmit}
            className="mt-4 flex flex-col gap-4 border-t border-line pt-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label
                  htmlFor={`${fieldId}-current`}
                  className={FIELD_LABEL_CLASSES}
                >
                  Current password
                </Label>
                <Input
                  id={`${fieldId}-current`}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className={FIELD_INPUT_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`${fieldId}-new`}
                  className={FIELD_LABEL_CLASSES}
                >
                  New password
                </Label>
                <Input
                  id={`${fieldId}-new`}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className={FIELD_INPUT_CLASSES}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`${fieldId}-confirm`}
                  className={FIELD_LABEL_CLASSES}
                >
                  Confirm new password
                </Label>
                <Input
                  id={`${fieldId}-confirm`}
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={FIELD_INPUT_CLASSES}
                />
              </div>
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

            <Button
              type="submit"
              disabled={saving}
              className="h-10 self-start rounded-full bg-accent px-5 text-[0.8125rem] font-semibold text-ink hover:bg-accent"
            >
              {saving ? "Saving…" : "Save password"}
            </Button>
          </form>
        ) : null}

        {changed ? (
          <p
            role="status"
            className={cn(
              MESSAGE_BASE_CLASSES,
              "mt-4 border-emerald-600/30 bg-emerald-50 text-emerald-800",
            )}
          >
            Password updated.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
