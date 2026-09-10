"use client";

import Link from "next/link";

import {
  AuthHeading,
  AuthSubheading,
  Eyebrow,
  ModeToggle,
} from "@/components/auth/auth-primitives";
import { ROLE_CARDS, type FlowMode, type FlowRole } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

/**
 * Step 1: pick Client or Driver/fleet, and choose between signing in and
 * creating an account.
 *
 * Purely presentational — it owns no state and knows nothing about hosts,
 * sessions or routing. Which cards exist and what picking one does are both the
 * caller's decisions, expressed through `roles` and `hrefs`, because that split
 * is a host concern (`src/lib/host.ts`) rather than a design one. The three
 * shapes the existing forms need all fall out of those two props:
 *
 * - `"BOTH"` (split disabled) — default `roles`, no `hrefs`: two buttons.
 * - `"CLIENT"` — default `roles` plus `hrefs.DRIVER`: the Client card advances
 *   in place, the Driver card is a real cross-origin navigation to the merchant
 *   host, which is the only place a driver session can exist.
 * - `"MERCHANT"` — `roles={["DRIVER"]}`: the one role that host can serve.
 */

/** Card ordering when the caller does not narrow it. */
const DEFAULT_ROLES: readonly FlowRole[] = ["CLIENT", "DRIVER"];

/** Where the footer's staff link points unless the caller says otherwise. */
const DEFAULT_BACK_OFFICE_HREF = "/admin/sign-in";

/** Per-role badge fill. Client gets the accent tint, Driver the neutral one. */
const BADGE_CLASSES: Record<FlowRole, string> = {
  CLIENT: "bg-[#fff1ea] text-[var(--landing-accent)]",
  DRIVER: "bg-[var(--landing-frame)] text-[var(--landing-ink-strong)]",
};

/**
 * The whole card is the control, so the surface styling has to live on both the
 * `<button>` and the `<a>` branch below.
 */
const CARD_CLASS =
  "flex flex-col gap-3.5 rounded-[14px] border border-[var(--landing-line)] bg-white p-6 text-left transition-[border-color,box-shadow] duration-150 hover:border-[var(--landing-accent)] hover:shadow-[0_8px_24px_-16px_rgba(21,20,15,.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]";

export type RoleStepProps = {
  mode: FlowMode;
  onModeChange: (mode: FlowMode) => void;
  /** Picking a card that has no `hrefs` entry. */
  onSelectRole: (role: FlowRole) => void;
  /**
   * Which cards to render, in order. Defaults to both. Narrow it on a host that
   * serves one role rather than hiding a card with CSS.
   */
  roles?: readonly FlowRole[];
  /**
   * Renders that role's card as an `<a>` pointing here instead of a button.
   * Cross-origin destinations must be real document navigations — Next's client
   * router only handles same-origin URLs — which is why this is a plain anchor
   * rather than a `<Link>`.
   */
  hrefs?: Partial<Record<FlowRole, string>>;
  /** Overridable for a deployment that serves the back office from its own host. */
  backOfficeHref?: string;
  className?: string;
};

export function RoleStep({
  mode,
  onModeChange,
  onSelectRole,
  roles = DEFAULT_ROLES,
  hrefs,
  backOfficeHref = DEFAULT_BACK_OFFICE_HREF,
  className,
}: RoleStepProps) {
  return (
    <div className={cn("flex flex-col gap-7", className)}>
      <div className="flex flex-col gap-3">
        <Eyebrow>Step 1 of 3 · Account</Eyebrow>
        <AuthHeading size="lg">How will you use Lalamove?</AuthHeading>
        <AuthSubheading size="lg">
          Pick the side of the delivery you are on. You can sign in or create an
          account from either one.
        </AuthSubheading>
      </div>

      <ModeToggle value={mode} onChange={onModeChange} />

      {/* `auto-fit` with a 280px floor is what collapses the pair to one column
          under ~610px — no breakpoint to keep in sync with the content. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {roles.map((role) => {
          const card = ROLE_CARDS[role];
          const href = hrefs?.[role];

          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-10 items-center justify-center rounded-[10px] text-[15px] font-semibold",
                  BADGE_CLASSES[role],
                )}
              >
                {card.badge}
              </span>

              <span className="flex flex-col gap-1">
                <span className="text-xl font-semibold tracking-[-0.01em] text-[var(--landing-ink-strong)]">
                  {card.title}
                </span>
                <span className="text-sm leading-[1.5] text-[var(--landing-muted)]">
                  {card.subtitle}
                </span>
              </span>

              <span className="flex flex-col gap-2 border-t border-[var(--landing-frame)] pt-1.5">
                {card.benefits.map((benefit) => (
                  <span key={benefit} className="text-[13px] text-[#3f3c36]">
                    {benefit}
                  </span>
                ))}
              </span>

              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--landing-ink-strong)]">
                {card.footer}
                <span aria-hidden="true">→</span>
              </span>
            </>
          );

          return href === undefined ? (
            <button
              key={role}
              type="button"
              onClick={() => onSelectRole(role)}
              className={CARD_CLASS}
            >
              {content}
            </button>
          ) : (
            <a key={role} href={href} className={CARD_CLASS}>
              {content}
            </a>
          );
        })}
      </div>

      <p className="text-[13px] text-[var(--landing-muted)]">
        Staff account?{" "}
        <Link
          href={backOfficeHref}
          className="font-medium text-[var(--landing-ink-strong)] underline decoration-[#d8d4cb] underline-offset-4 transition-colors hover:decoration-[var(--landing-accent)]"
        >
          Sign in to the back office
        </Link>
      </p>
    </div>
  );
}
