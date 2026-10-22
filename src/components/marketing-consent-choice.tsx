"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { MARKETING_PRIVACY_POLICY_HREF } from "@/lib/client-profile/marketing-consent";
import { cn } from "@/lib/utils";

/**
 * Class sets for the two surfaces this control sits on. The sign-up form is
 * drawn in the landing palette (`--landing-*` variables, as in
 * `account-type-step.tsx`); `/account` in the app's fixed `ink` / `paper` /
 * `line` / `accent` tokens, as in `account-password-card.tsx`.
 */
const TONES = {
  auth: {
    statement: "text-[13px] leading-[1.5] text-[var(--landing-subtle)]",
    link: "text-[var(--landing-paper)] underline decoration-[var(--landing-line-strong)] underline-offset-4 transition-colors hover:text-[var(--landing-accent)] hover:decoration-[var(--landing-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]",
    group: "border-[var(--landing-line)]",
    option:
      "text-[var(--landing-muted)] hover:text-[var(--landing-paper)] focus-visible:outline-[var(--landing-accent)]",
    checked:
      "bg-[var(--landing-accent)] text-[var(--landing-on-accent)] hover:text-[var(--landing-on-accent)]",
  },
  account: {
    statement: "text-[0.8125rem] leading-snug text-muted",
    link: "text-paper underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    group: "border-line",
    option: "text-muted hover:text-paper focus-visible:outline-accent",
    checked: "bg-accent text-ink hover:text-ink",
  },
} as const;

type MarketingConsentChoiceProps = {
  /** The current answer: `true` is Agree. */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  tone: keyof typeof TONES;
  /**
   * Open the policy in a new tab. The sign-up form passes `true` — following
   * the link in place would throw away everything typed so far; `/account`
   * has nothing unsaved worth protecting and opens it in place.
   */
  policyInNewTab?: boolean;
};

/**
 * The marketing-consent question — "I agree to receive personalized marketing
 * offers…", with a link to the Marketing Privacy Policy — and its Agree /
 * Disagree answer as a two-segment radio group. Rendered by the client sign-up
 * form and by `AccountMarketingConsentCard`.
 *
 * Same radio pattern as `AccountTypeStep`: `role="radio"` buttons inside a
 * `role="radiogroup"` labelled by the statement, one tab stop (the checked
 * option), arrow keys move and select. Controlled: the default (Agree, see
 * `DEFAULT_MARKETING_CONSENT`) is the caller's initial state, not this
 * component's.
 */
export function MarketingConsentChoice({
  value,
  onChange,
  disabled = false,
  tone,
  policyInNewTab = false,
}: MarketingConsentChoiceProps) {
  const t = useTranslations("common.marketingConsent");
  const statementId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const classes = TONES[tone];

  const options = [
    { value: true, label: t("agree") },
    { value: false, label: t("disagree") },
  ];

  /** Arrow keys move the selection, wrapping — the native radio behaviour. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (
      !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();
    // Two options, so either direction lands on the other one: Agree is
    // index 0, Disagree index 1.
    onChange(!value);
    optionRefs.current[value ? 1 : 0]?.focus();
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p id={statementId} className={classes.statement}>
        {t.rich("statement", {
          policy: (chunks) => (
            <Link
              href={MARKETING_PRIVACY_POLICY_HREF}
              className={classes.link}
              {...(policyInNewTab ? { target: "_blank", rel: "noopener" } : {})}
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      <div
        role="radiogroup"
        aria-labelledby={statementId}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : handleKeyDown}
        className={cn(
          "inline-flex self-start rounded-full border p-0.5",
          classes.group,
        )}
      >
        {options.map((option, index) => {
          const checked = option.value === value;

          return (
            <button
              key={option.label}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "h-8 min-w-24 rounded-full px-4 text-[0.8125rem] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                classes.option,
                checked && classes.checked,
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
