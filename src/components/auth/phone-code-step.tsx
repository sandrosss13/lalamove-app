"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import {
  ERROR_INPUT_CLASS,
  FieldError,
  InlineLinkButton,
} from "@/components/auth/auth-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  formatPhoneForDisplay,
  isCompletePhoneCode,
  PHONE_CODE_LENGTH,
  resendSecondsLeft,
  sanitizePhoneCode,
} from "./phone-auth-flow";

/* -------------------------------------------------------------------------- */
/* Resend cooldown                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The resend cooldown as component state: `start()` on every successful send,
 * `secondsLeft` to render. Ticks once a second only while a cooldown is
 * running, so an idle form schedules nothing.
 *
 * The arithmetic is `resendSecondsLeft`, a pure function of the send time and
 * the clock, so a tab put to sleep mid-countdown wakes up to the right number
 * rather than resuming from where its interval paused.
 */
export function useResendCooldown(): {
  secondsLeft: number;
  start: () => void;
} {
  const [sentAt, setSentAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const secondsLeft = sentAt === null ? 0 : resendSecondsLeft(sentAt, now);

  React.useEffect(() => {
    if (sentAt === null || secondsLeft === 0) return;

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sentAt, secondsLeft]);

  const start = React.useCallback(() => {
    const current = Date.now();
    setSentAt(current);
    setNow(current);
  }, []);

  return { secondsLeft, start };
}

/* -------------------------------------------------------------------------- */
/* The code screen                                                            */
/* -------------------------------------------------------------------------- */

export type PhoneCodeStepProps = {
  /** Base for this screen's element ids. */
  id: string;
  /** E.164, as sent — shown back grouped so the person can spot a typo. */
  phoneNumber: string;
  code: string;
  onCodeChange: (code: string) => void;
  /** Field-level message for the code input (a wrong or spent code). */
  codeError?: string | null;
  /**
   * The form-level `FormAlert`, rendered above everything else, or nothing.
   * A slot rather than a message so each form keeps its own recovery links
   * ("Sign up", "Go to the driver site") inside the alert they explain.
   */
  alert?: React.ReactNode;
  /** Fires with a full code only — the button is disabled until then. */
  onVerify: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
  verifying: boolean;
  resending: boolean;
  /** From `useResendCooldown`. */
  resendSecondsLeft: number;
  /** Button text while idle — "Verify and create account" / "Verify and sign in". */
  submitLabel: string;
};

/**
 * The second half of every phone flow: "we sent a code to …", one numeric
 * input, Verify, and the two ways out — resend once the cooldown allows it,
 * or go back and change the number.
 *
 * One `<input>` rather than six boxes. `autoComplete="one-time-code"` is what
 * lets iOS and Android offer the code straight from the SMS, and that offer
 * fills a single field; split boxes need focus-juggling scripts to accept it
 * and still break on paste in some browsers. `sanitizePhoneCode` keeps digits
 * only, so pasting the whole SMS line works too.
 *
 * `noValidate` and `aria-required` for the reason the sign-up form's
 * `TextField` gives: the messages are the ones this flow writes, not a browser
 * bubble.
 */
export function PhoneCodeStep({
  id,
  phoneNumber,
  code,
  onCodeChange,
  codeError,
  alert,
  onVerify,
  onResend,
  onChangeNumber,
  verifying,
  resending,
  resendSecondsLeft: secondsLeft,
  submitLabel,
}: PhoneCodeStepProps) {
  const t = useTranslations("auth.phoneAuth");
  const inputId = `${id}-code`;
  const sentId = `${id}-code-sent`;
  const errorId = `${id}-code-error`;
  const complete = isCompletePhoneCode(code);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !verifying) onVerify(code);
      }}
      className="flex flex-col gap-4"
    >
      {alert}

      {/* Polite live region: after "Send code" the whole form swaps for this
          one, and this line is what says where the code went. */}
      <p
        id={sentId}
        aria-live="polite"
        className="text-sm leading-[1.5] text-[var(--landing-subtle)]"
      >
        {t("codeSentTo", { phone: formatPhoneForDisplay(phoneNumber) })}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>{t("codeLabel")}</Label>
        <Input
          id={inputId}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // A hint for mobile keyboards; the sanitiser is the real filter.
          pattern="[0-9]*"
          maxLength={PHONE_CODE_LENGTH}
          // Focus lands here when the screen appears: the only thing left to
          // do on it is type the code.
          autoFocus
          placeholder={"•".repeat(PHONE_CODE_LENGTH)}
          value={code}
          onChange={(event) =>
            onCodeChange(sanitizePhoneCode(event.target.value))
          }
          aria-required="true"
          aria-invalid={codeError ? true : undefined}
          aria-describedby={[sentId, codeError ? errorId : null]
            .filter(Boolean)
            .join(" ")}
          className={cn(
            "h-11 text-base tracking-[0.3em]",
            codeError && ERROR_INPUT_CLASS,
          )}
        />
        {codeError ? <FieldError id={errorId}>{codeError}</FieldError> : null}
      </div>

      <Button
        type="submit"
        disabled={verifying || !complete}
        className="h-11 w-full text-base"
      >
        {verifying ? t("verifying") : submitLabel}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-[var(--landing-muted)]">
        {secondsLeft > 0 ? (
          <span>{t("resendIn", { seconds: secondsLeft })}</span>
        ) : resending ? (
          <span>{t("sendingCode")}</span>
        ) : (
          <InlineLinkButton onClick={onResend}>
            {t("resendCode")}
          </InlineLinkButton>
        )}
        <InlineLinkButton onClick={onChangeNumber}>
          {t("changeNumber")}
        </InlineLinkButton>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Method hint                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The line under the Phone | Email switch while neither side is picked — the
 * individual client's neutral start (`defaultAuthMethod` returns `null`). It
 * is what tells the person the empty space below the switch is waiting on
 * them, not still loading.
 */
export function ChooseMethodHint({ id, text }: { id: string; text: string }) {
  return (
    <p
      id={id}
      className="pt-5 text-[13px] leading-[1.5] text-[var(--landing-muted)]"
    >
      {text}
    </p>
  );
}
