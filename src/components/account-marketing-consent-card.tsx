"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MarketingConsentChoice } from "@/components/marketing-consent-choice";
import { cn } from "@/lib/utils";

const MESSAGE_BASE_CLASSES =
  "rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-snug";

/** How long the "Saved" confirmation stays up after a successful flip. */
const SAVED_VISIBLE_MS = 2000;

type AccountMarketingConsentCardProps = {
  /** The stored `ClientProfile.marketingConsent`. */
  initialConsent: boolean;
};

/**
 * The "Marketing offers" card on `/account`: the client's on / off switch for
 * receiving personalized marketing offers, first set at sign-up.
 *
 * No Save button: every flip is saved at once to
 * `POST /api/client-profile/marketing-consent`, which records each change as a
 * `MarketingConsentEvent`. The switch moves optimistically and snaps back, with
 * the error below it, if the save fails; a success shows a brief "Saved".
 */
export function AccountMarketingConsentCard({
  initialConsent,
}: AccountMarketingConsentCardProps) {
  const tCard = useTranslations("account.accountMarketingConsentCard");

  const [consent, setConsent] = useState(initialConsent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  async function handleChange(next: boolean) {
    // One save at a time, so a quick double flip cannot land out of order.
    // The switch stays enabled (and focused) meanwhile; flips are ignored.
    if (saving) return;

    const previous = consent;
    setConsent(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    if (savedTimer.current) clearTimeout(savedTimer.current);

    const response = await fetch("/api/client-profile/marketing-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingConsent: next }),
    }).catch(() => null);

    setSaving(false);

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setConsent(previous);
      setError(payload?.error ?? tCard("couldNotSave"));
      return;
    }

    setSaved(true);
    savedTimer.current = setTimeout(() => setSaved(false), SAVED_VISIBLE_MS);
  }

  return (
    <Card className="gap-4 bg-ink text-paper ring-line">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold text-paper">
          {tCard("title")}
        </CardTitle>
        {/* Always mounted so the live region exists before it has anything
            to announce; empty until a save succeeds. Beside the title rather
            than under the switch, so it never pushes the card taller. */}
        <CardAction
          role="status"
          className="text-[0.8125rem] leading-snug font-medium text-emerald-700 dark:text-emerald-300"
        >
          {saved ? tCard("saved") : null}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="border-t border-line pt-4">
          <MarketingConsentChoice
            tone="account"
            value={consent}
            onChange={(next) => void handleChange(next)}
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
      </CardContent>
    </Card>
  );
}
