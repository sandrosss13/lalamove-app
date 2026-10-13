"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { useSession } from "@/lib/auth-client";
import { BookingForm } from "@/components/home/booking-form";
import { isGoodsShortcutCode } from "@/lib/goods-shortcuts";
import {
  LandingPage,
  type LandingBanner,
  type LandingSection,
} from "@/components/landing/landing-page";

/**
 * The holding screen `/` shows while a provider's redirect to `/dashboard` is
 * in flight — a page that is on its way somewhere.
 */
function LoadingScreen() {
  const t = useTranslations("home.homeEntry");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <p className="text-center opacity-50">{t("loading")}</p>
    </main>
  );
}

/**
 * The booking form, opened on the goods shortcut the visitor picked on the
 * landing page (`?goods=<code>`), if any.
 *
 * The query is read here, on the client, and not by `src/app/[locale]/page.tsx`:
 * `searchParams` is a dynamic API, and reading it there would turn the site's
 * ISR front door back into a per-request render (the page's own comment records
 * how long that stopgap cost it). Anything that is not a known shortcut code —
 * a typo, a retired code, a hand-edited URL — opens the form on nothing rather
 * than erroring, so a stale link still lands somewhere useful.
 *
 * `useSearchParams` lives in this component, behind the `<Suspense>` boundary
 * `HomeEntry` puts around it, rather than in `HomeEntry` itself. In a
 * statically rendered route the hook opts everything up to the nearest
 * boundary out of prerendering (`next build` refuses an unbounded one — see the
 * note in `LanguageToggle`), and the nearest boundary would otherwise be the
 * route: the landing page's server-rendered HTML would go with it. Bounded
 * here, the only thing that bails out is this signed-in branch, which the
 * server never renders anyway — it has no session, so it always sends the
 * landing page.
 */
function BookingEntry() {
  const goods = useSearchParams().get("goods");
  const initialGoods =
    goods !== null && isGoodsShortcutCode(goods) ? goods : null;
  return <BookingForm initialGoods={initialGoods} />;
}

/**
 * Everything `/` renders, chosen from the visitor's session.
 *
 * The session is resolved client-side (`useSession`) rather than on the server,
 * which is why this is a client component and `/` is a thin server component
 * wrapping it: the marketing content the signed-out branch needs comes from the
 * database, and only a server component can read it. So `/` loads the content
 * unconditionally and hands it down here, where the session decides whether it
 * is used at all.
 *
 * The content props are optional and pass straight through to `LandingPage`,
 * which falls back to its built-in default composition when they are empty —
 * so a render with no content (or from a caller that passes none) is the page
 * exactly as it looked before it was made editable.
 *
 * This component is only the branch: the client booking flow — its state, its
 * pricing calls and its layout — lives in `BookingForm`, which needs nothing
 * from here but the landing-page shortcut it opens on (see `BookingEntry`). Booking ends in a redirect to the order's own checkout page, so
 * the payment options that used to be threaded down through this component are
 * loaded by that page instead, where the money is actually taken.
 */
export function HomeEntry({
  sections,
  heroBanners,
  partnerBanners,
}: {
  sections?: LandingSection[];
  /** Active banners placed at `home_hero` — the hero carousel's slides. */
  heroBanners?: LandingBanner[];
  /** Active banners placed at `home_partner_logo` — the marquee's logos. */
  partnerBanners?: LandingBanner[];
}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  // Providers don't book deliveries — a driver fulfils them, and a logistics
  // company claims them and dispatches them to its own drivers. Both of those
  // flows live on `/dashboard` and neither has anything on `/`, so `/` sends
  // them there outright instead of rendering a dead-end "you're signed in as a
  // driver" screen with a link they have to click.
  //
  // `replace`, not `push`: the history entry a push would leave behind is this
  // very page, so a back press would land here and be redirected forward
  // again, trapping the user between the two.
  const role = session?.user.role;
  const isProvider = role === "DRIVER" || role === "COMPANY";

  // Effect rather than a render-time redirect: navigating during render is a
  // side effect React may run twice or discard, and the hook has to be called
  // before the branches below return, unconditionally.
  useEffect(() => {
    if (isProvider) {
      router.replace("/dashboard");
    }
  }, [isProvider, router]);

  // The redirect is asynchronous, so the provider branch keeps rendering until
  // it lands: show the holding screen rather than the client booking form,
  // which would flash the wrong page.
  if (isProvider) {
    return <LoadingScreen />;
  }

  // A pending session renders the landing page, not a holding screen. This is
  // also what the server sends (it has no session), so the signed-out visitor —
  // the bulk of this route's traffic — gets the real page in the first paint
  // instead of "Loading…" followed by the page. A signed-in visitor swaps to
  // their booking form (or is redirected) once the session resolves.
  if (isPending || !session) {
    return (
      <LandingPage
        sections={sections}
        heroBanners={heroBanners}
        partnerBanners={partnerBanners}
      />
    );
  }

  // Everything left is a signed-in client: the two provider roles were sent to
  // `/dashboard` above and never reach here. The fallback is the holding screen,
  // but it should never paint: on the client `useSearchParams` reads the URL
  // synchronously and does not suspend.
  return (
    <Suspense fallback={<LoadingScreen />}>
      <BookingEntry />
    </Suspense>
  );
}
