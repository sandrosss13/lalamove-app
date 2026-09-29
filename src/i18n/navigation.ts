import { createNavigation } from "next-intl/navigation";

import { routing } from "@/i18n/routing";

/**
 * Locale-aware replacements for Next's own navigation primitives.
 *
 * **Import these instead of `next/link` and `next/navigation` in any code that
 * links within the app.** Every URL in this codebase is written unprefixed —
 * `<Link href="/orders">` — and these wrappers attach the active locale, so the
 * same line produces `/ka/orders` for a Georgian visitor and `/en/orders` for an
 * English one.
 *
 * Using the bare `next/link` instead would emit `/orders`, which the middleware
 * would then have to redirect: an extra round trip on every internal
 * navigation, and — worse — a redirect that resolves through cookie/header
 * negotiation rather than from the page the visitor is actually on, so an
 * English reader following an un-wrapped link could land back in Georgian.
 *
 * `next/navigation`'s other exports are unaffected and still come from there:
 * `useSearchParams`, `useParams`, `notFound` and `useSelectedLayoutSegment(s)`
 * know nothing about locales.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
