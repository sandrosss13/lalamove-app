"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HubCard } from "@/components/driver-hub/hub-primitives";
import { changePassword } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * "Account access" for a driver session: one row per credential they can manage
 * themselves, which today is exactly one — their password.
 *
 * ## Why this is not `AccountPasswordCard`
 *
 * Unlike the profile form beside it, the client's password card is *not*
 * CLIENT-scoped in behaviour: it calls Better Auth's `changePassword`, which is
 * role-agnostic and works perfectly well for a driver. What stops it being
 * imported here is its palette, and the failure is not cosmetic.
 *
 * That card is painted in the landing tokens — `bg-ink text-paper ring-line`,
 * with `bg-accent text-ink` on its submit button. Inside the driver hub, which
 * renders under `[data-admin-surface]`, `globals.css` resolves `--color-accent`
 * to the *shadcn* `--accent` (`oklch(0.97 0 0)`, a near-white) rather than to
 * the landing palette's brand orange, while `--color-ink` stays `#ffffff`. Its
 * "Save password" button would therefore be near-white text on a near-white
 * fill — an invisible primary action on the one form in this screen that
 * changes a credential — and its error line, `text-accent`, would be invisible
 * too. Both are exactly the collision the `--admin-accent` fallback chain in
 * `globals.css` exists to manage, and the client card predates the hub and does
 * not participate in it.
 *
 * So the *logic* is reused verbatim and only the surface is redrawn: same
 * `changePassword` call, same pre-flight confirm-match check, same decision not
 * to pass `revokeOtherSessions`, same collapse-on-success. Nothing here is a
 * second implementation of authentication.
 *
 * This is the *voluntary* change, distinct from `/change-password`: that page is
 * the forced reset a company-registered driver is bounced into while holding a
 * temporary password, and it navigates away on success and evicts every other
 * device. Here the driver is already where they want to be, so a successful
 * change just collapses the form back down.
 *
 * Deliberately no passkey row (the plugin isn't configured in `@/lib/auth`) and
 * no delete-account row (nothing in this codebase can delete a user), rather
 * than controls that would look real and do nothing.
 */

/** Matches the minimum Better Auth is configured to accept. */
const MIN_PASSWORD_LENGTH = 8;

const FIELD_LABEL_CLASSES = "text-xs font-medium text-muted-foreground";

const ERROR_TEXT_CLASSES = "text-[13px] text-[oklch(44.4%_0.177_26.899)]";

const SUCCESS_TEXT_CLASSES = "text-[13px] text-[oklch(44.8%_0.119_151.328)]";

const CONTROL_CLASSES =
  "h-auto rounded-md px-[11px] py-[9px] text-sm md:text-sm";

const MISMATCH_ERROR = "Passwords don't match.";

const GENERIC_ERROR = "Could not change your password. Please try again.";

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className={FIELD_LABEL_CLASSES}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function DriverAccountPasswordCard() {
  const formId = React.useId();

  const [open, setOpen] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [changed, setChanged] = React.useState(false);

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
    // is already done, so it stops being the answer to what is on screen now.
    setChanged(false);
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Checked before the request so a typo costs nothing — the round trip
    // would otherwise succeed and leave the driver locked out behind a
    // password they mistyped. Same guard as `/change-password`.
    if (newPassword !== confirmPassword) {
      setError(MISMATCH_ERROR);
      return;
    }

    setSaving(true);

    // No `revokeOtherSessions`, unlike the forced reset on
    // `/change-password`: that flow assumes a temporary password other people
    // may have seen, so it evicts every other device. This one is a driver
    // routinely rotating their own password from a device they are signed in
    // on, and silently signing out their phone mid-shift would be a surprise
    // with a job attached to it.
    const { error: changePasswordError } = await changePassword({
      currentPassword,
      newPassword,
    });

    setSaving(false);

    if (changePasswordError) {
      setError(changePasswordError.message ?? GENERIC_ERROR);
      return;
    }

    resetFields();
    setOpen(false);
    setChanged(true);
  }

  return (
    <HubCard>
      <div>
        <h2 className="text-base font-semibold">Account access</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          The credentials you sign in with.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium">Password</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Used with your email address to sign in.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleToggle}
          aria-expanded={open}
          aria-controls={formId}
          className="h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium"
        >
          {open ? "Cancel" : "Change password"}
        </Button>
      </div>

      {/* Rendered only while open — a collapsed-but-present form would keep
          three password fields in the accessibility tree and in autofill's
          reach for a control the driver has not asked for yet. */}
      {open ? (
        <form
          id={formId}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="mt-4 border-t border-border pt-4"
        >
          <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
            <Field
              label="Current password"
              htmlFor={`${formId}-current`}
              className="sm:col-span-2"
            >
              <Input
                id={`${formId}-current`}
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className={CONTROL_CLASSES}
              />
            </Field>

            <Field label="New password" htmlFor={`${formId}-new`}>
              <Input
                id={`${formId}-new`}
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={CONTROL_CLASSES}
              />
            </Field>

            <Field label="Confirm new password" htmlFor={`${formId}-confirm`}>
              <Input
                id={`${formId}-confirm`}
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={CONTROL_CLASSES}
              />
            </Field>
          </div>

          {error ? (
            <p role="alert" className={cn("mt-4", ERROR_TEXT_CLASSES)}>
              {error}
            </p>
          ) : null}

          <div className="mt-5">
            <Button
              type="submit"
              disabled={saving}
              className="h-auto rounded-md bg-foreground px-[15px] py-[9px] text-[13px] font-medium text-background hover:bg-foreground/90"
            >
              {saving ? "Saving…" : "Save password"}
            </Button>
          </div>
        </form>
      ) : null}

      {changed ? (
        <p role="status" className={cn("mt-4", SUCCESS_TEXT_CLASSES)}>
          Password updated.
        </p>
      ) : null}
    </HubCard>
  );
}
