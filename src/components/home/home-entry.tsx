"use client";

import Link from "next/link";

import { useSession } from "@/lib/auth-client";
import { BookingForm } from "@/components/home/booking-form";
import {
  LandingPage,
  type LandingBanner,
  type LandingSection,
} from "@/components/landing/landing-page";

/**
 * What a signed-in provider (driver or logistics company) sees instead of the
 * booking form: they fulfil deliveries rather than place them, so they are sent
 * to `/dashboard`, where both supply-side flows live.
 */
function ProviderPrompt({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="opacity-70">{message}</p>
      <div className="flex justify-center">
        <Link
          href="/dashboard"
          className="rounded border px-4 py-2 font-medium hover:opacity-70"
        >
          Go to your dashboard →
        </Link>
      </div>
    </main>
  );
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
 * pricing calls and its layout — lives in `BookingForm`.
 */
export function HomeEntry({
  sections,
  heroBanners,
  secondaryBanners,
}: {
  sections?: LandingSection[];
  /** Active banners placed at `home_hero`. */
  heroBanners?: LandingBanner[];
  /** Active banners placed at `home_secondary`. */
  secondaryBanners?: LandingBanner[];
}) {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
        <p className="text-center opacity-50">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <LandingPage
        sections={sections}
        heroBanners={heroBanners}
        secondaryBanners={secondaryBanners}
      />
    );
  }

  // Drivers don't book deliveries — they fulfil them. Point them at their
  // dashboard instead of showing the client booking form.
  if (session.user.role === "DRIVER") {
    return (
      <ProviderPrompt
        title="You're signed in as a driver"
        message="Clients book deliveries here — drivers fulfil them. Head to your dashboard to see what's available and take a job."
      />
    );
  }

  // Companies don't book either: they claim deliveries and dispatch them to
  // their own drivers, all of which lives on the dashboard.
  if (session.user.role === "COMPANY") {
    return (
      <ProviderPrompt
        title="You're signed in as a logistics company"
        message="Clients book deliveries here — your company fulfils them. Head to your dashboard to claim work and dispatch it to your drivers."
      />
    );
  }

  return <BookingForm />;
}
