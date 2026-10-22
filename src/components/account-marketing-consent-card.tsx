"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarketingConsentChoice } from "@/components/marketing-consent-choice";
import { cn } from "@/lib/utils";

const MESSAGE_BASE_CLASSES =
  "rounded-lg border px-3.5 py-2.5 text-[0.8125rem] leading-snug";

type AccountMarketingConsentCardProps = {
  /** The stored `ClientProfile.marketingConsent`. */
  initialConsent: boolean;
};

/**
 * The "Marketing offers" card on `/account`: the client's Agree / Disagree
 * answer to receiving personalized marketing offers, first given at sign-up.
 *
 * Saved through its own button, like the profile and password cards beside
 * it, to `POST /api/client-profile/marketing-consent` — which records every
 * change as a `MarketingConsentEvent`. The button stays disabled until the
 * choice differs from what is stored, so a click always means a real change.
 */
export function AccountMarketingConsentCard({
  initialConsent,
}: AccountMarketingConsentCardProps) {
  const t = useTranslations("common.shared");
  const tCard = useTranslations("account.accountMarketingConsentCard");

  const [savedConsent, setSavedConsent] = useState(initialConsent);
  const [consent, setConsent] = useState(initialConsent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleChange(next: boolean) {
    setConsent(next);
    // The confirmation and any error are about the previous attempt.
    setSaved(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/client-profile/marketing-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marketingConsent: consent }),
    }).catch(() => null);

    setSaving(false);

    if (!response?.ok) {
      const payload = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error ?? tCard("couldNotSave"));
      return;
    }

    setSavedConsent(consent);
    setSaved(true);
  }

  return (
    <Card className="gap-4 bg-ink text-paper ring-line">
      <CardHeader>
        <CardTitle className="font-display text-base font-semibold text-paper">
          {tCard("title")}
        </CardTitle>
        <CardDescription className="text-[0.8125rem] leading-snug text-muted">
          {tCard("description")}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="border-t border-line pt-4">
          <MarketingConsentChoice
            tone="account"
            value={consent}
            onChange={handleChange}
            disabled={saving}
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

        {saved ? (
          <p
            role="status"
            className={cn(
              MESSAGE_BASE_CLASSES,
              // Same success green as `account-password-card.tsx`; see the
              // note there for why the dark half is spelled out.
              "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300",
            )}
          >
            {tCard("saved")}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || consent === savedConsent}
          className="h-10 self-start rounded-full bg-accent px-5 text-[0.8125rem] font-semibold text-ink hover:bg-accent"
        >
          {saving ? t("saving") : tCard("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
