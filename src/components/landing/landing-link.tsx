"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";

import { Link } from "@/i18n/navigation";
import { isAppLocale, withLocalePrefix } from "@/i18n/routing";
import { merchantOrigin } from "@/lib/host";

/**
 * Where a driver applies: the sign-up flow with the driver role preselected
 * (`/sign-up?role=driver`, read by `src/app/[locale]/sign-up/page.tsx`).
 */
const DRIVER_SIGN_UP_PATH = "/sign-up?role=driver";

/**
 * Hrefs that mean "wherever drivers apply on this deployment" rather than a
 * literal target. That destination is deployment configuration — on a split
 * deployment driver registration lives on the merchant host — so content can
 * only name it, never spell it out.
 *
 * - `@driver-sign-up` is the sentinel the footer already understands.
 * - `#drivers` is the anchor the default nav and closing CTA still point at.
 *   v4 has no drivers panel on the page to scroll to, so instead of a dead
 *   anchor it resolves to the real application flow ("For Drivers" in the
 *   design's nav).
 */
const DRIVER_SIGN_UP_ALIASES = new Set(["@driver-sign-up", "#drivers"]);

/**
 * Resolves a CMS href to what the browser should follow, substituting the
 * driver sign-up aliases above. Every other href passes through unchanged.
 */
export function useLandingHref(href: string): string {
  const locale = useLocale();

  if (!DRIVER_SIGN_UP_ALIASES.has(href)) {
    return href;
  }

  const origin = merchantOrigin();
  if (!origin || !isAppLocale(locale)) {
    return DRIVER_SIGN_UP_PATH;
  }

  // Cross-origin, so `next-intl`'s `Link` cannot add the locale prefix for us.
  return `${origin}${withLocalePrefix(locale, DRIVER_SIGN_UP_PATH)}`;
}

/**
 * One rule for how a CMS href becomes an element on the v4 homepage, the same
 * rule the nav pill and footer apply:
 *
 * - `/…` is an in-app route and gets `next-intl`'s `Link` (locale-aware,
 *   client-side navigation).
 * - anything else — an in-page `#anchor`, an absolute URL, a `mailto:` — is a
 *   plain `<a>`, the only correct element for those. `rel="noreferrer"` is
 *   added for `http(s)` targets only, the ones that leave the app.
 */
export function LandingLink({
  href,
  className,
  onClick,
  children,
  ariaLabel,
}: {
  href: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  const resolved = useLandingHref(href);

  if (resolved.startsWith("/")) {
    return (
      <Link
        href={resolved}
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </Link>
    );
  }

  const isExternal =
    resolved.startsWith("http://") || resolved.startsWith("https://");

  return (
    <a
      href={resolved}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      rel={isExternal ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

/** Whether a matched label/href pair is complete enough to render as a link. */
export function hasLink(
  label: string | null | undefined,
  href: string | null | undefined,
): boolean {
  return Boolean(label?.trim()) && Boolean(href?.trim());
}
