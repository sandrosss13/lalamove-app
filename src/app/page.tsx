import { HomeEntry } from "@/components/home/home-entry";
import {
  loadHomePageContent,
  resolveHomePageLocale,
} from "@/lib/admin/home-page-data";
import { loadBookingPaymentOptions } from "@/lib/home/booking-payment-options";

/**
 * Content edits go live within a minute rather than at the next deploy.
 *
 * Deliberately not `force-dynamic`: this is the site's front door and its
 * highest-traffic route, so it should not pay for a database round trip on
 * every request when the marketing copy changes a few times a month. A bounded
 * staleness window is the trade the back office is designed around — `/home`
 * stays `force-dynamic` and is the route staff use to check an edit
 * immediately.
 *
 * Note that the `?locale=` stopgap below reads `searchParams`, which is a
 * dynamic API, so Next renders this on demand today and this value only takes
 * effect as an ISR window once a real locale mechanism (path prefix or cookie)
 * replaces it. It is set now so the route's intent survives that change.
 */
export const revalidate = 60;

/**
 * `/` — what a visitor lands on.
 *
 * Signed out, this is the marketing landing page composed from the
 * `HomePageSection` and `Banner` rows staff edit under `/admin/content`;
 * signed in, it is the client booking form or a pointer to the provider
 * dashboard. That branch depends on a client-side session, so it lives in
 * `HomeEntry`; this component's only job is to read the content the signed-out
 * branch needs, which requires the server.
 *
 * The content is loaded unconditionally, before the session is known. That
 * costs two indexed reads on a signed-in render, which is the price of keeping
 * the existing session handling untouched — and it is what makes the landing
 * page's HTML server-rendered for crawlers rather than assembled after
 * hydration.
 *
 * With no rows authored for the locale, both lists come back empty and
 * `LandingPage` falls back to its built-in default composition — the same copy
 * the page rendered before it was made editable.
 *
 * The booking form's payment options are the one thing here that *is* read
 * per-session, because they have to be: the enabled payment methods are admin's
 * switchboard and the purchase-order field is BUSINESS-only, and neither may be
 * decided in the browser (see `loadBookingPaymentOptions`). Reading the session
 * server-side is a dynamic API, so it pins this route to on-demand rendering —
 * which is where the `searchParams` stopgap above already had it, and it is also
 * what keeps a per-client response out of any shared cache. A signed-out
 * visitor, a driver and a logistics company each cost one session read and no
 * query at all.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const locale = resolveHomePageLocale(query.locale);

  const [{ sections, heroBanners, partnerBanners }, payment] =
    await Promise.all([
      loadHomePageContent(locale),
      loadBookingPaymentOptions(),
    ]);

  return (
    <HomeEntry
      sections={sections}
      heroBanners={heroBanners}
      partnerBanners={partnerBanners}
      payment={payment}
    />
  );
}
