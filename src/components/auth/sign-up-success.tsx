"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { AuthHeading, AuthSubheading } from "@/components/auth/auth-primitives";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  accountTypeLabel,
  ROLE_LABELS,
  type AccountType,
  type FlowRole,
} from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

/**
 * Screen 8 of the auth handoff: the beat between a successful sign-up and the
 * redirect that follows it.
 *
 * It exists because the account is already created by the time this renders —
 * the session cookie is set, the profile row is written — so there is nothing
 * left to confirm and nothing to go back to. Its whole job is to say what
 * happened and then leave, which is why the progress bar is a real timer rather
 * than decoration: when it reaches the end, the redirect fires.
 *
 * The handoff's "Start over" button is deliberately absent. Its own note calls
 * it a prototype affordance to be replaced by the real redirect, and on a live
 * account it would be actively wrong — there is no "over" to start from once
 * the user is signed in.
 */

/**
 * How long the bar takes to fill, and therefore how long the screen is shown.
 * Long enough to read one short sentence, short enough not to feel like a
 * stall. The same constant drives the CSS transition (as an inline
 * `transitionDuration`) and the redirect timer, so the two can never drift.
 */
const FILL_DURATION_MS = 1200;

/**
 * Under `prefers-reduced-motion` there is no fill to wait for, but redirecting
 * in the same tick as the paint would mean the message never renders at all.
 * One frame's grace, not a second of it.
 */
const REDUCED_MOTION_DELAY_MS = 150;

/** Bar states: the from-state, the animated fill, and the motion-free jump. */
type FillState = "empty" | "animated" | "instant";

export type SignUpSuccessProps = {
  role: FlowRole;
  accountType: AccountType;
  /**
   * Where the new session belongs. Decided by the caller (`sign-up-form.tsx`),
   * which is the component that knows the audience and whether the Driver card
   * resolved to a company — this screen only performs the navigation.
   */
  destination: string;
};

export function SignUpSuccess({
  role,
  accountType,
  destination,
}: SignUpSuccessProps) {
  const router = useRouter();
  const [fill, setFill] = React.useState<FillState>("empty");

  React.useEffect(() => {
    // Read in an effect, never during render: there is no `window` on the
    // server, and `matchMedia` is additionally absent from jsdom. Same idiom as
    // `landing-hero-carousel.tsx`, minus its `change` subscription — this screen
    // lives for about a second, so a preference flipped mid-redirect is not a
    // case worth wiring up.
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /**
     * `push` then `refresh`, exactly as the pre-redesign form did it: the push
     * moves to the destination, and the refresh re-runs the server components
     * there so they read the session that was just created rather than the
     * cached signed-out render.
     */
    const redirect = () => {
      router.push(destination);
      router.refresh();
    };

    if (prefersReducedMotion) {
      setFill("instant");
      const timer = setTimeout(redirect, REDUCED_MOTION_DELAY_MS);
      return () => clearTimeout(timer);
    }

    // A frame between mount and the width change, so the browser paints the 0%
    // state first and the transition actually runs instead of snapping.
    const frame = requestAnimationFrame(() => setFill("animated"));
    const timer = setTimeout(redirect, FILL_DURATION_MS);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [destination, router]);

  return (
    <AuthShell maxWidth="420" className="gap-5 pt-[clamp(8px,4vw,48px)]">
      {/*
        A live region, because this screen replaces the form in place — no
        navigation happens, so nothing else would tell a screen-reader user that
        the submit succeeded. The sr-only line says the part the visible copy
        only implies: "You're signed in" describes the session, not the account
        that was just created.
      */}
      <div role="status" className="flex flex-col gap-5">
        <span className="sr-only">Your account has been created.</span>

        {/* The check is the picture of the sentence beside it. */}
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-[var(--landing-ink-strong)] text-xl text-white"
        >
          ✓
        </span>

        <div className="flex flex-col gap-2.5">
          <AuthHeading>You&rsquo;re signed in</AuthHeading>
          <AuthSubheading>
            {ROLE_LABELS[role]} · {accountTypeLabel(accountType)} · taking you
            to your dashboard.
          </AuthSubheading>
        </div>
      </div>

      {/*
        Decorative: the bar is a picture of the timer above it, and the live
        region has already said a redirect is coming. A `progressbar` role here
        would announce a value that means nothing to act on.
      */}
      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--landing-line)]"
      >
        <div
          className={cn(
            "h-full rounded-full bg-[var(--landing-accent)]",
            fill === "animated" && "transition-[width] ease-out",
          )}
          style={{
            width: fill === "empty" ? "0%" : "100%",
            transitionDuration:
              fill === "animated" ? `${FILL_DURATION_MS}ms` : undefined,
          }}
        />
      </div>
    </AuthShell>
  );
}
