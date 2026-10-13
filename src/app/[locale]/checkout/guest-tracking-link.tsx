"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * The guest's private tracking link on the success page, with a copy button.
 *
 * Rendered from a path (`/{locale}/track/{token}`) and completed to an absolute
 * URL in the browser, so the link the guest copies is the one for the host they
 * are actually on — the server has no reliable notion of that behind a proxy.
 * The first render shows the path; the origin is filled in after mount.
 *
 * The link is the guest's only way back to the order from another device or
 * after the cookie is cleared — no email is sent — hence the note to keep it.
 */
export function GuestTrackingLink({ path }: { path: string }) {
  const t = useTranslations("checkout.guestTrackingLink");
  const [href, setHref] = useState(path);
  const [copied, setCopied] = useState(false);
  const noteId = useId();

  useEffect(() => {
    setHref(`${window.location.origin}${path}`);
  }, [path]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
    } catch {
      // Clipboard refused (insecure context, permissions): the link is still on
      // screen and selectable.
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line bg-ink p-4">
      <p className="text-[13px] font-semibold text-paper">
        {t("yourTrackingLink")}
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <a
          href={href}
          aria-describedby={noteId}
          className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface px-3 py-2.5 font-price text-[13px] text-paper hover:border-accent/40"
        >
          {href}
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-10 flex-none items-center justify-center gap-2 rounded-lg border border-line px-4 text-[13px] font-semibold text-paper transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? t("copied") : t("copyLink")}
        </button>
      </div>
      <p id={noteId} className="mt-2 text-xs leading-relaxed text-muted">
        {t("keepThisLink")}
      </p>
    </div>
  );
}
