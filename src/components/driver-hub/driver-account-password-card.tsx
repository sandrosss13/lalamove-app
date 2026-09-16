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
 * to the *shadcn* `--accent` rather than to the landing palette's brand orange,
 * and `--accent` sits at the same end of the scale as `--color-ink` in
 * whichever theme is on: in light, a near-white `oklch(0.97 0 0)` against an
 * `--color-ink` of `#ffffff`; in dark, a near-black `oklch(0.269 0 0)` against
 * an `--color-ink` of `#08090a`. Its "Save password" button would therefore be
 * near-invisible text on a near-invisible fill in *either* theme — on the one
 * form in this screen that changes a credential — and its error line,
 * `text-accent`, would disappear into the card the same way. Both are exactly
 * the collision the `--admin-accent` fallback chain in `globals.css` exists to
 * manage, and the client card predates the hub and does not participate in it;
 * the dark theme flipped both sides of the collision together rather than
 * resolving it.
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

/**
 * The error line goes through `--destructive` rather than through the handoff's
 * own red. It used to spell `oklch(44.4% 0.177 26.899)` — a fixed dark red that
 * stays dark on a dark card, so under `html.dark` this line was near-invisible
 * on the one form that reports a failed credential change. `text-destructive`
 * is a half-step lighter in light mode (`oklch(0.577 0.245 27.325)` against the
 * literal's darker red) and lifts to `oklch(0.704 0.191 22.216)` in dark, which
 * is the whole point: the token is the only thing here that knows the theme.
 * That small lightening is accepted hub-wide so every error line in the driver
 * hub reads as the same red.
 */
const ERROR_TEXT_CLASSES = "text-[13px] text-destructive";

/**
 * Success has no shadcn token to migrate to, so the light literal stays and a
 * `dark:` counterpart is added beside it: same hue, lightness inverted from
 * 44.8% to 84% so it reads as green on a near-black card instead of vanishing
 * into it. The pair is copied verbatim from the hub's success status-pill
 * foreground (`hub-status.ts`, and the delta tones in `hub-primitives.tsx`) so
 * every green on these screens is the same green in both themes — do not
 * re-tune either half in isolation.
 */
const SUCCESS_TEXT_CLASSES =
  "text-[13px] text-[oklch(44.8%_0.119_151.328)] dark:text-[oklch(84%_0.13_156.743)]";

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
