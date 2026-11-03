"use client";

import * as React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import {
  AuthHeading,
  AuthSubheading,
  ERROR_INPUT_CLASS,
  FieldError,
  FormAlert,
  InlineLinkButton,
  PasswordStrengthMeter,
} from "@/components/auth/auth-primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { MIN_PASSWORD_LENGTH, passwordStrength } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

/** Where "Request a new link" goes: the sign-in form's forgot screen. */
const FORGOT_PASSWORD_HREF = "/sign-in?step=forgot";

/** Where a successful reset goes; the sign-in page shows a confirmation. */
const AFTER_RESET_HREF = "/sign-in?reset=done";

/** Better Auth's error code for a token that is unknown, expired or used. */
const INVALID_TOKEN_CODE = "INVALID_TOKEN";

type ResetPasswordFormProps = {
  /**
   * `?token=` as Better Auth's callback redirect put it there, or `null` when
   * the link carried none — or carried `?error=INVALID_TOKEN` instead, which
   * the page folds into the same "this link no longer works" screen.
   */
  token: string | null;
};

/**
 * The page an emailed reset link lands on (`/[locale]/reset-password`).
 *
 * The link goes through Better Auth's `GET /api/auth/reset-password/:token`
 * first, which checks the token and redirects here with `?token=` when it is
 * still good and `?error=INVALID_TOKEN` when it is not, so an expired link is
 * reported before anyone types a password. The token is only *consumed* by the
 * `POST` below, so it can still turn out to be invalid on submit (used in
 * another tab, or expired while the form was open); that lands on the same
 * screen.
 *
 * Same rules as sign-up for the new password — `MIN_PASSWORD_LENGTH`, the same
 * strength meter and helper — and the same confirm-field check as
 * `/change-password`, so a typo cannot lock someone out with a password they
 * never meant. Better Auth enforces the length again server-side.
 *
 * No session is needed or read: the token is the credential. A successful
 * reset ends every session the account had (`revokeSessionsOnPasswordReset`
 * in `src/lib/auth.ts`), including one this browser may hold, which is why
 * success goes to sign-in rather than into the app.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations("auth.resetPassword");
  const tShared = useTranslations("common.shared");
  const router = useRouter();
  const fieldId = React.useId();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tokenInvalid, setTokenInvalid] = useState(token === null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token === null) return;

    const nextPasswordError =
      newPassword.length < MIN_PASSWORD_LENGTH
        ? t("useAtLeastCharacters", { min: MIN_PASSWORD_LENGTH })
        : null;
    const nextConfirmError =
      nextPasswordError === null && newPassword !== confirmPassword
        ? tShared("passwordsDonTMatch")
        : null;

    setPasswordError(nextPasswordError);
    setConfirmError(nextConfirmError);
    setFormError(null);

    if (nextPasswordError !== null || nextConfirmError !== null) {
      return;
    }

    setLoading(true);

    const { error } = await authClient.resetPassword({ newPassword, token });

    if (error) {
      setLoading(false);

      if (error.code === INVALID_TOKEN_CODE) {
        setTokenInvalid(true);
        return;
      }

      setFormError(error.message ?? t("couldNotResetYourPassword"));
      return;
    }

    // Left in the loading state on purpose: the page is navigating away, and
    // re-enabling the button would offer a second submit of a spent token.
    router.replace(AFTER_RESET_HREF);
  }

  if (tokenInvalid) {
    return (
      <AuthShell maxWidth="420" className="gap-6">
        <div className="flex flex-col gap-2.5">
          <AuthHeading>{tShared("setANewPassword")}</AuthHeading>
        </div>

        <FormAlert title={t("linkInvalidTitle")}>
          {t("linkInvalidBody")}
        </FormAlert>

        <p className="text-sm">
          <InlineLinkButton href={FORGOT_PASSWORD_HREF}>
            {t("requestANewLink")}
          </InlineLinkButton>
        </p>
      </AuthShell>
    );
  }

  const passwordId = `${fieldId}-new-password`;
  const passwordHelperId = `${passwordId}-helper`;
  const passwordErrorId = `${passwordId}-error`;
  const confirmId = `${fieldId}-confirm-password`;
  const confirmErrorId = `${confirmId}-error`;

  return (
    <AuthShell maxWidth="420" className="gap-6">
      <div className="flex flex-col gap-2.5">
        <AuthHeading>{tShared("setANewPassword")}</AuthHeading>
        <AuthSubheading>{t("chooseANewPassword")}</AuthSubheading>
      </div>

      {/*
        `noValidate` for the same reason as the sign-in form: the messages
        below are the ones this flow writes, and a browser bubble would sit on
        top of them saying something else.
      */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError ? <FormAlert title={formError} /> : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor={passwordId}>{tShared("newPassword")}</Label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setPasswordError(null);
            }}
            aria-invalid={passwordError !== null ? true : undefined}
            aria-describedby={
              passwordError
                ? `${passwordHelperId} ${passwordErrorId}`
                : passwordHelperId
            }
            className={cn("h-11 text-base", passwordError && ERROR_INPUT_CLASS)}
          />
          <PasswordStrengthMeter strength={passwordStrength(newPassword)} />
          <span
            id={passwordHelperId}
            className="text-[13px] text-[var(--landing-muted)]"
          >
            {t("passwordHelper")}
          </span>
          {passwordError ? (
            <FieldError id={passwordErrorId}>{passwordError}</FieldError>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={confirmId}>{tShared("confirmNewPassword")}</Label>
          <Input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setConfirmError(null);
            }}
            aria-invalid={confirmError !== null ? true : undefined}
            aria-describedby={confirmError ? confirmErrorId : undefined}
            className={cn("h-11 text-base", confirmError && ERROR_INPUT_CLASS)}
          />
          {confirmError ? (
            <FieldError id={confirmErrorId}>{confirmError}</FieldError>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full text-base"
        >
          {loading ? t("saving") : t("savePassword")}
        </Button>
      </form>
    </AuthShell>
  );
}
