"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";
import { ROLE_LABELS, type FlowMode, type FlowRole } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

/**
 * The small shared vocabulary every screen of the auth flow composes from —
 * the eyebrow, the headings, the segmented mode toggle, the phone field, the
 * error surfaces and the social block.
 *
 * Anything that has a design-system primitive is that primitive with the
 * handoff's sizing applied on top (`Button`, `Input`, `Label` all default to a
 * 32px control, and this design's controls are 44px, hence the `h-11 text-base`
 * that recurs below). Only the pieces the DS has no equivalent for — the
 * segmented track, the strength meter, the alert — are hand-rolled.
 *
 * Colour rule, matching `auth-shell.tsx`: anything with a `--landing-*` token
 * is written as `var(--landing-…)`, and only the handoff values that have no
 * token are spelled as hex. The theme utilities `text-muted` / `text-accent`
 * are deliberately avoided everywhere on this surface: inside a
 * `data-admin-surface` subtree those two names resolve to the *shadcn* palette,
 * not the landing one (see the `--admin-accent` fallback chain in `globals.css`).
 */

/* -------------------------------------------------------------------------- */
/* Type and text                                                              */
/* -------------------------------------------------------------------------- */

export type EyebrowProps = {
  children: React.ReactNode;
  className?: string;
};

/** The orange step marker above each heading — "Step 1 of 3 · Account". */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        "text-xs font-semibold tracking-[0.12em] uppercase text-[var(--landing-accent)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Heading scale. `lg` is step 1's — the flow's entry point gets the bigger
 * type and the tighter leading; every screen after it uses the default.
 */
export type AuthTextSize = "default" | "lg";

const HEADING_SIZE_CLASSES: Record<AuthTextSize, string> = {
  default: "text-[clamp(26px,3.4vw,34px)] leading-[1.15]",
  lg: "text-[clamp(28px,4vw,40px)] leading-[1.1]",
};

export type AuthHeadingProps = {
  children: React.ReactNode;
  size?: AuthTextSize;
  /** Needed when a heading names a region — step 2's radio group, say. */
  id?: string;
  className?: string;
};

export function AuthHeading({
  children,
  size = "default",
  id,
  className,
}: AuthHeadingProps) {
  return (
    <h1
      id={id}
      className={cn(
        "font-semibold tracking-[-0.02em] text-pretty text-[var(--landing-ink-strong)]",
        HEADING_SIZE_CLASSES[size],
        className,
      )}
    >
      {children}
    </h1>
  );
}

const SUBHEADING_SIZE_CLASSES: Record<AuthTextSize, string> = {
  default: "text-[15px]",
  // Step 1's sub is a full sentence rather than a fragment, so it is capped at
  // a comfortable measure instead of running the full 860px column.
  lg: "text-base max-w-[52ch]",
};

export type AuthSubheadingProps = {
  children: React.ReactNode;
  size?: AuthTextSize;
  id?: string;
  className?: string;
};

export function AuthSubheading({
  children,
  size = "default",
  id,
  className,
}: AuthSubheadingProps) {
  return (
    <p
      id={id}
      className={cn(
        "leading-[1.55] text-pretty text-[var(--landing-muted)]",
        SUBHEADING_SIZE_CLASSES[size],
        className,
      )}
    >
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Navigation and context                                                     */
/* -------------------------------------------------------------------------- */

export type BackLinkProps = {
  onClick: () => void;
  /** Override for a back link that names its destination ("← Back to sign in"). */
  label?: string;
  className?: string;
};

/**
 * The "← Back" affordance at the top of every screen after step 1.
 *
 * A `<button>` rather than an anchor even though the flow is URL-driven: it
 * steps the wizard back through the router, and the exact destination depends
 * on which step the caller is on, so there is no single href to give it.
 */
export function BackLink({
  onClick,
  label = "← Back",
  className,
}: BackLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "self-start text-[13px] text-[var(--landing-muted)] transition-colors hover:text-[var(--landing-ink-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]",
        className,
      )}
    >
      {label}
    </button>
  );
}

export type ContextChipProps = {
  role: FlowRole;
  accountType: AccountType;
  className?: string;
};

/**
 * The "Client · Individual" pill that carries the two earlier picks into step
 * 3, so the form says what it is a form *for* without repeating them in the
 * heading. Uses the short role word rather than the step-1 card headline —
 * "Driver or fleet · Business" would be the card title leaking into a chip.
 */
export function ContextChip({
  role,
  accountType,
  className,
}: ContextChipProps) {
  return (
    <span
      className={cn(
        "w-fit rounded-full bg-[var(--landing-frame)] px-2.5 py-[5px] text-xs font-medium text-[#3f3c36]",
        className,
      )}
    >
      {ROLE_LABELS[role]} · {ACCOUNT_TYPE_LABELS[accountType]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Mode toggle                                                                */
/* -------------------------------------------------------------------------- */

const MODE_SEGMENTS: readonly { value: FlowMode; label: string }[] = [
  { value: "signin", label: "Sign in" },
  { value: "signup", label: "Create account" },
];

export type ModeToggleProps = {
  value: FlowMode;
  onChange: (mode: FlowMode) => void;
  className?: string;
};

/**
 * The step-1 segmented control. Switching it changes which flow the wizard
 * ends in — it must never skip step 2, which both modes run through.
 *
 * Built from `aria-pressed` buttons rather than a Radix `Tabs`, for the reason
 * `FilterStrip` in the driver hub gives: a real tablist wires each trigger to a
 * panel through `aria-controls`, and there is no panel here — the segments
 * change what the *next* screens are, not what is rendered beside them.
 */
export function ModeToggle({ value, onChange, className }: ModeToggleProps) {
  return (
    <div
      className={cn(
        "flex w-fit gap-1.5 rounded-[10px] bg-[var(--landing-frame)] p-1",
        className,
      )}
    >
      {MODE_SEGMENTS.map((segment) => {
        const active = segment.value === value;

        return (
          <button
            key={segment.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "rounded-[7px] px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]",
              active
                ? "bg-white text-[var(--landing-ink-strong)] shadow-[0_1px_2px_rgba(21,20,15,.08)]"
                : "bg-transparent text-[var(--landing-muted)] hover:text-[var(--landing-ink-strong)]",
            )}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Error state for a DS `Input`. Applied *alongside* `aria-invalid`, which is
 * what actually tells assistive tech the field is wrong — but the primitive
 * ships its own `aria-invalid:` treatment in the shadcn destructive red plus a
 * `ring-3`, and both would sit on top of the handoff's. The two `aria-invalid:`
 * variants here exist only to win that override and put the design's border and
 * 3px wash back.
 */
export const ERROR_INPUT_CLASS =
  "border-[#c3341a] shadow-[0_0_0_3px_rgba(195,52,26,.12)] aria-invalid:border-[#c3341a] aria-invalid:ring-0";

export type FormAlertProps = {
  /** The bold first line, e.g. "That email and password don't match." */
  title: React.ReactNode;
  /** Optional second line: what happens next, or what to do about it. */
  children?: React.ReactNode;
  /**
   * Needed when a field the alert explains is marked `aria-invalid` and has to
   * name the reason through its own `aria-describedby` — `role="alert"` is
   * announced once, on mount, so a user who tabs back to the field afterwards
   * would otherwise reach an "invalid" with nothing attached to say why.
   */
  id?: string;
  className?: string;
};

/**
 * The form-level alert above the fields. `role="alert"` so it is announced the
 * moment it mounts — which is the whole point, since it appears in response to
 * a submit the user has already navigated away from with their eyes.
 */
export function FormAlert({ title, children, id, className }: FormAlertProps) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        "flex gap-3 rounded-[10px] border border-[#f3c4b4] bg-[#fdf2ee] px-4 py-3.5",
        className,
      )}
    >
      {/* Decorative: the alert's text already says what went wrong, and "!"
          announced on its own is noise. */}
      <span
        aria-hidden="true"
        className="flex size-[18px] flex-none items-center justify-center rounded-full bg-[#c3341a] text-xs font-semibold text-white"
      >
        !
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-[#7a2010]">{title}</span>
        {children ? (
          <span className="text-[13px] leading-[1.5] text-[#7a2010]">
            {children}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export type FieldErrorProps = {
  /**
   * Must be referenced from the field's `aria-describedby`, so the message
   * reaches a screen reader as part of the input rather than as loose text.
   */
  id: string;
  children: React.ReactNode;
  className?: string;
};

/** Inline, field-level error text — the per-field companion to `FormAlert`. */
export function FieldError({ id, children, className }: FieldErrorProps) {
  return (
    <span
      id={id}
      className={cn("text-[13px] leading-[1.5] text-[#c3341a]", className)}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Phone field                                                                */
/* -------------------------------------------------------------------------- */

export type PhoneFieldProps = {
  /** Ties the label, the input and any helper/error text together. */
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Field label. Defaults to the handoff's wording. */
  label?: string;
  /** Muted line under the field, e.g. "We text a 6-digit code." */
  helper?: React.ReactNode;
  /** Non-empty switches the input to the error styling and announces it. */
  error?: string;
  /**
   * Extra `aria-describedby` target(s), merged ahead of this field's own helper
   * and error ids — for a note that lives outside the field, such as the "code
   * sign-in is not available yet" line under the disabled phone tab.
   */
  describedBy?: string;
  disabled?: boolean;
  /**
   * Announces the field as required without adding the HTML `required`
   * attribute. Callers validate in their own submit handler (see
   * `validateSignUp`), and a native `required` would let the browser's
   * validation bubble fire first and say something this design did not write —
   * the same call `job-sheet-actions.tsx` makes at its waiting-minutes field.
   */
  required?: boolean;
  autoComplete?: string;
  className?: string;
};

/**
 * The "+995" prefix box plus the subscriber-number input.
 *
 * The prefix is presentation only — `aria-hidden`, not focusable, not a
 * `<select>` — because one country is served and a tab stop that cannot change
 * anything is a tab stop in the way. The country code still has to reach a
 * screen reader, though, or the field announces as a bare "Phone number" and
 * the user has no way to know the +995 is already supplied; it rides along in
 * the label as visually hidden text, which puts it in the input's accessible
 * name rather than leaving it as an orphaned graphic.
 */
export function PhoneField({
  id,
  value,
  onChange,
  label = "Phone number",
  helper,
  error,
  describedBy,
  disabled,
  required,
  autoComplete = "tel-national",
  className,
}: PhoneFieldProps) {
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;

  // The caller's ids come first, then this field's own helper and error, so the
  // external note reads before the per-field detail. Empty entries are dropped
  // rather than joined, which is what keeps a lone `describedBy` from arriving
  // as a string with stray spaces in it.
  const describedByIds =
    [describedBy, helper ? helperId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        <span className="sr-only">, Georgia, country code +995</span>
      </Label>

      <div className="flex gap-2">
        <span
          aria-hidden="true"
          className="inline-flex h-11 flex-none items-center rounded-lg border border-[var(--landing-line)] bg-white px-3 text-[15px] text-[#3f3c36]"
        >
          +995
        </span>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          placeholder="555 12 34 56"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-required={required ? "true" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds}
          className={cn("h-11 text-base", error && ERROR_INPUT_CLASS)}
        />
      </div>

      {helper ? (
        <span id={helperId} className="text-[13px] text-[var(--landing-muted)]">
          {helper}
        </span>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Password strength meter                                                    */
/* -------------------------------------------------------------------------- */

const STRENGTH_BARS = [0, 1, 2] as const;

export type PasswordStrengthMeterProps = {
  /** 0–3, from `passwordStrength` in `@/lib/auth-flow`. */
  strength: 0 | 1 | 2 | 3;
  className?: string;
};

/**
 * Three bars under the password field.
 *
 * `aria-hidden` on purpose: the field's helper text ("At least 8 characters.
 * Add a number to make it stronger.") is what carries this meaning to a screen
 * reader, and three unlabelled progress bars would announce as noise on top of
 * it. Colour is never the sole channel here for the same reason.
 */
export function PasswordStrengthMeter({
  strength,
  className,
}: PasswordStrengthMeterProps) {
  return (
    <div aria-hidden="true" className={cn("flex gap-1", className)}>
      {STRENGTH_BARS.map((index) => (
        <span
          key={index}
          className={cn(
            "h-1 flex-1 rounded-full",
            index < strength
              ? "bg-[var(--landing-accent)]"
              : "bg-[var(--landing-line)]",
          )}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inline links                                                               */
/* -------------------------------------------------------------------------- */

const INLINE_LINK_CLASS =
  "text-sm font-medium text-[#15140f] border-b border-[#d8d4cb] transition-colors hover:border-[var(--landing-accent)] hover:text-[var(--landing-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]";

export type InlineLinkButtonProps = {
  children: React.ReactNode;
  className?: string;
} & ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/**
 * The underlined inline affordances in the footers — "Create an account",
 * "Sign in", "Change number", "Use a code".
 *
 * Renders as a `<Link>` when it navigates and as a `<button>` when it only
 * changes the step in place, the same split `PortalCard` already makes in the
 * existing sign-in form: a real destination should be a real link, so it can be
 * opened in a new tab and read as a link by assistive tech.
 */
export function InlineLinkButton({
  children,
  className,
  href,
  onClick,
}: InlineLinkButtonProps) {
  if (href !== undefined) {
    return (
      <Link href={href} className={cn(INLINE_LINK_CLASS, className)}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(INLINE_LINK_CLASS, className)}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Social block                                                               */
/* -------------------------------------------------------------------------- */

// TODO: the handoff asks for the Google / Apple / Facebook brand marks and
// ships none. `lucide-react` cannot supply them either — it dropped brand icons,
// and the `Apple` it exports is the fruit — so these stay text-only until an
// icon asset (or a brand-icon dependency) is added. Labels match the mock.
const SOCIAL_PROVIDERS = ["Google", "Apple", "Facebook"] as const;

export type SocialBlockProps = {
  className?: string;
};

/**
 * The "or continue with" divider and the three provider buttons.
 *
 * Every button is disabled, and says so. `src/lib/auth.ts` configures no
 * `socialProviders` block, so there is no OAuth handler for any of these to
 * call — a live-looking button that dead-ends (or worse, invents a path) is a
 * worse outcome than one that plainly states it is not ready. The note below
 * the grid is the visible half of that, and `aria-describedby` on each button
 * is the half a screen reader gets, since a disabled control announces its
 * state but not its reason.
 */
export function SocialBlock({ className }: SocialBlockProps) {
  const noteId = React.useId();

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-[var(--landing-line)]"
        />
        <span className="text-xs text-[var(--landing-muted)]">
          or continue with
        </span>
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-[var(--landing-line)]"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SOCIAL_PROVIDERS.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            disabled
            title="Social sign-in is coming soon."
            aria-describedby={noteId}
            className="h-11 w-full"
          >
            {provider}
          </Button>
        ))}
      </div>

      {/*
        Points at email and password only. Phone sign-in is disabled on this
        same screen (no `phoneNumber`/`emailOTP` plugin in `src/lib/auth.ts`), so
        naming it here would send the user from one greyed-out control to
        another. Email and password is the one path that actually completes.
      */}
      <p id={noteId} className="text-[13px] text-[var(--landing-muted)]">
        Social sign-in is not available yet — use your email and password.
      </p>
    </div>
  );
}
