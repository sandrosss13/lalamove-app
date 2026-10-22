"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Switch } from "@/components/ui/switch";
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
    // On is the solid `paper` (near-black in light, near-white in dark) with
    // an `ink` thumb, so the thumb always contrasts with the track; off is a
    // grey track whose thumb follows the theme the same way. The `dark:`
    // thumb rules are spelled out because the primitive's own `dark:` thumb
    // colours outrank a plain `[&>span]:` override.
    switch:
      "focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)] data-[state=checked]:bg-[var(--landing-paper)] data-[state=unchecked]:bg-[var(--landing-line-stronger)] [&>span]:bg-[var(--landing-ink)] dark:[&>span]:data-[state=checked]:bg-[var(--landing-ink)] dark:[&>span]:data-[state=unchecked]:bg-[var(--landing-paper)]",
  },
  account: {
    statement: "text-[0.8125rem] leading-snug text-muted",
    link: "text-paper underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    switch:
      "focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=checked]:bg-paper data-[state=unchecked]:bg-line-stronger [&>span]:bg-ink dark:[&>span]:data-[state=checked]:bg-ink dark:[&>span]:data-[state=unchecked]:bg-paper",
  },
} as const;

/**
 * Size and thumb travel shared by both tones: a 44×24 pill with a 2px inset,
 * so the 18px thumb travels exactly 20px. The primitive's own `calc` travel
 * only fits its default 32px width.
 */
const SWITCH_SIZE_CLASSES =
  "h-6 w-11 p-0.5 shadow-none [&>span]:size-[18px] [&>span]:shadow-sm [&>span]:data-[state=checked]:translate-x-5";

type MarketingConsentChoiceProps = {
  /** The current answer: `true` (switched on) is consent. */
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
 * offers…", with a link to the Marketing Privacy Policy — with an on / off
 * switch to its right (on is consent). Rendered by the client sign-up form and
 * by `AccountMarketingConsentCard`.
 *
 * The sentence wraps in its own flexible column and the switch keeps its size
 * at any width (`shrink-0` in the primitive), pinned to the first line. The
 * switch is labelled by the sentence. Controlled: the default (on, see
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
  const classes = TONES[tone];

  return (
    <div className="flex items-start justify-between gap-4">
      <p id={statementId} className={cn("min-w-0 flex-1", classes.statement)}>
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

      <Switch
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-labelledby={statementId}
        className={cn(SWITCH_SIZE_CLASSES, classes.switch)}
      />
    </div>
  );
}
