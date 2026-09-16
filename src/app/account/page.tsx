import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { DATA_SCREEN_WIDTH_CLASSES } from "@/lib/layout";
import { prisma } from "@/lib/prisma";
import { AccountPasswordCard } from "@/components/account-password-card";
import { AccountSidebar } from "@/components/account-sidebar";
import {
  AccountProfileForm,
  type AccountProfileInitialValues,
} from "@/components/account-profile-form";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

const PANEL_LABEL_CLASSES =
  "text-[0.6875rem] font-semibold tracking-[0.1em] text-muted uppercase";

/**
 * The client's account settings screen: a nav rail beside the settings this
 * client can actually change — their profile, and their password.
 *
 * Not an order list. Orders live on `/orders`, one click away from both the
 * rail here and the global header's own client nav, so duplicating the whole
 * list under these forms only buried them.
 */
export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return (
      <main className="min-h-screen bg-ink text-paper">
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-5 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.025em]">
            My account
          </h1>
          <p className="text-sm text-muted">
            Please sign in to view your account.
          </p>
          <div className="flex justify-center gap-3">
            <Link
              href="/sign-in"
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-ink transition-transform hover:-translate-y-0.5"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-accent/40 hover:text-accent"
            >
              Sign up
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // This page is client-only: drivers and logistics companies manage their
  // fleet, roster and bookings on /dashboard instead.
  if (session.user.role !== "CLIENT") {
    redirect("/dashboard");
  }

  const clientProfile = await prisma.clientProfile.findUnique({
    where: { userId: session.user.id },
  });

  // Defensive: sign-up always creates a profile, but an account without one is
  // still editable — default to an empty individual profile.
  const profileInitialValues: AccountProfileInitialValues = {
    accountType: clientProfile?.accountType ?? "INDIVIDUAL",
    firstName: clientProfile?.firstName ?? null,
    lastName: clientProfile?.lastName ?? null,
    companyName: clientProfile?.companyName ?? null,
    vatId: clientProfile?.vatId ?? null,
    phone: clientProfile?.phone ?? null,
    // `<input type="date">` expects a bare "YYYY-MM-DD" value.
    dateOfBirth: clientProfile?.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: clientProfile?.gender ?? null,
    idNumber: clientProfile?.idNumber ?? null,
  };

  return (
    <main className="min-h-screen bg-ink text-paper">
      {/*
        The nav rail plus the settings beside it is a data screen, so it takes
        the platform's data-screen width instead of the 1152px it was capped at;
        the forms inside keep their own field widths, and the intro paragraph
        below keeps its `max-w-xl` — prose and forms are excluded from this cap
        on purpose, see `DATA_SCREEN_WIDTH_CLASSES`. The `px-5`/`sm:px-8` gutter
        is untouched so nothing runs into the window edge.
      */}
      <div
        className={`${DATA_SCREEN_WIDTH_CLASSES} flex flex-col gap-8 px-5 py-8 sm:px-8 lg:flex-row lg:gap-12`}
      >
        <AccountSidebar />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header>
            <p className={PANEL_LABEL_CLASSES}>
              Settings
              <span aria-hidden="true" className="px-1.5">
                /
              </span>
              <span className="text-accent">Profile</span>
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.5rem,3vw,2rem)] leading-none font-semibold tracking-[-0.025em] text-paper">
              Profile
            </h1>
            <p className="mt-2.5 max-w-xl text-[0.8125rem] leading-relaxed text-muted">
              The details a driver sees when they turn up for one of your
              pickups, and the credentials you sign in with. Keeping your phone
              number current is what stops a delivery stalling at the kerb.
            </p>
          </header>

          <AccountProfileForm
            email={session.user.email}
            initialValues={profileInitialValues}
          />

          <AccountPasswordCard />
        </div>
      </div>
    </main>
  );
}
