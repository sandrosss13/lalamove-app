"use client";

import { useTranslations } from "next-intl";

import {
  AuthHeading,
  AuthSubheading,
  Eyebrow,
  ModeToggle,
} from "@/components/auth/auth-primitives";
import { Link } from "@/i18n/navigation";
import { useRoleCards, type FlowMode, type FlowRole } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

/**
 * `auth.authFlow` keys for the card copy `useRoleCards` does not localise: the
 * three selling points and the footer line. Same order as `ROLE_CARDS`.
 */
const ROLE_CARD_BENEFIT_KEYS = {
  CLIENT: [
    "clientBenefitInstantQuote",
    "clientBenefitSameDay",
    "clientBenefitLiveTracking",
  ],
  DRIVER: [
    "driverBenefitLoadBoard",
    "driverBenefitWeeklyPayouts",
    "driverBenefitFleetSize",
  ],
} as const satisfies Record<FlowRole, readonly string[]>;

const ROLE_CARD_FOOTER_KEYS = {
  CLIENT: "clientFooter",
  DRIVER: "driverFooter",
} as const satisfies Record<FlowRole, string>;

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

/**
 * Per-role badge fill. Client gets the accent tint, Driver the neutral one.
 *
 * The neutral badge is tokens throughout, so it flips on its own. The accent
 * tint does not: `#fff1ea` is a ~6% orange wash mixed against white and there is
 * no `--landing-accent-soft` to hold its dark counterpart, so dark mode borrows
 * `--landing-line-accent` — the palette's existing low-alpha orange, which lays
 * the same wash over whatever ground is behind it instead of punching a pale
 * rectangle into the card. The orange glyph on top is a token and needs nothing.
 */
const BADGE_CLASSES: Record<FlowRole, string> = {
  CLIENT:
    "bg-[#fff1ea] text-[var(--landing-accent)] dark:bg-[var(--landing-line-accent)]",
  DRIVER: "bg-[var(--landing-frame)] text-[var(--landing-paper)]",
};

/**
 * The whole card is the control, so the surface styling has to live on both the
 * `<button>` and the `<a>` branch below.
 *
 * The hover shadow is a light-only rgba by nature — it stops registering against
 * a dark ground, where the hover state is carried by the accent border instead.
 */
const CARD_CLASS =
  "flex flex-col gap-3.5 rounded-[14px] border border-[var(--landing-line)] bg-[var(--landing-surface-raised)] p-6 text-left transition-[border-color,box-shadow] duration-150 hover:border-[var(--landing-accent)] hover:shadow-[0_8px_24px_-16px_rgba(21,20,15,.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--landing-accent)]";

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
  const t = useTranslations("auth.roleStep");
  const tFlow = useTranslations("auth.authFlow");
  const roleCards = useRoleCards();

  return (
    <div className={cn("flex flex-col gap-7", className)}>
      <div className="flex flex-col gap-3">
        <Eyebrow>{t("step1Of3Account")}</Eyebrow>
        <AuthHeading size="lg">{t("howWillYouUseLalamove")}</AuthHeading>
        <AuthSubheading size="lg">
          {t("pickTheSideOfTheDelivery")}
        </AuthSubheading>
      </div>

      <ModeToggle value={mode} onChange={onModeChange} />

      {/* `auto-fit` with a 280px floor is what collapses the pair to one column
          under ~610px — no breakpoint to keep in sync with the content. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {roles.map((role) => {
          const card = roleCards[role];
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
                <span className="text-xl font-semibold tracking-[-0.01em] text-[var(--landing-paper)]">
                  {card.title}
                </span>
                <span className="text-sm leading-[1.5] text-[var(--landing-muted)]">
                  {card.subtitle}
                </span>
              </span>

              <span className="flex flex-col gap-2 border-t border-[var(--landing-frame)] pt-1.5">
                {ROLE_CARD_BENEFIT_KEYS[role].map((benefitKey) => (
                  <span
                    key={benefitKey}
                    className="text-[13px] text-[var(--landing-subtle)]"
                  >
                    {tFlow(benefitKey)}
                  </span>
                ))}
              </span>

              <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--landing-paper)]">
                {tFlow(ROLE_CARD_FOOTER_KEYS[role])}
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
        {t("staffAccount")}{" "}
        <Link
          href={backOfficeHref}
          className="font-medium text-[var(--landing-paper)] underline decoration-[var(--landing-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--landing-accent)]"
        >
          {t("signInToTheBackOffice")}
        </Link>
      </p>
    </div>
  );
}
