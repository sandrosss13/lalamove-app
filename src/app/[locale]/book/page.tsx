import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import {
  localeHref,
  resolveRouteLocale,
  type LocaleRouteParams,
} from "@/i18n/server";
import { auth } from "@/lib/auth";
import { BookingForm } from "@/components/home/booking-form";

// Per-session: the same URL renders a guest form or an account form.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: LocaleRouteParams;
}): Promise<Metadata> {
  const locale = await resolveRouteLocale(params);
  const t = await getTranslations({ locale, namespace: "home.bookingForm" });

  return {
    title: t("bookADelivery"),
    // A transactional page, never a search result — the middleware's
    // `X-Robots-Tag` says the same; this covers a crawler reading the HTML.
    robots: { index: false, follow: false },
  };
}

/**
 * `/book` — where the homepage's "Book a delivery" card lands.
 *
 * Public. A signed-out visitor gets the booking form in guest mode (no account
 * needed; contact details are collected at checkout), a signed-in client the
 * same form on their account. Providers do not book deliveries, so a driver or
 * a logistics company is sent to `/dashboard`, as `/` does for them.
 *
 * The form reads the card's draft from `sessionStorage` on mount — see
 * `booking-draft.ts` — so nothing about the route travels in the URL.
 */
export default async function BookPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user.role;

  if (role === "DRIVER" || role === "COMPANY") {
    redirect(await localeHref("/dashboard"));
  }

  return <BookingForm guest={!session} />;
}
