import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The frame every screen in the auth flow sits in: a 64px white bar over the
 * warm off-white page, with the content column centred beneath it.
 *
 * Two things about the root element are load-bearing rather than decorative:
 *
 * - `data-admin-surface` is what hides the global site header from
 *   `src/app/layout.tsx` (`body:has([data-admin-surface]) > header` in
 *   `globals.css`). Without it the app's navbar stacks on top of this one; with
 *   it, this component owns the only header on the page — so never add a second.
 *   The same attribute also pins the shadcn token set to its light values, which
 *   is what keeps the `Button`/`Input`/`Tabs` primitives readable on this page
 *   for a visitor whose system is in dark mode.
 * - `font-body` opts into IBM Plex Sans. The layout exposes the family as a CSS
 *   variable only and never applies it to `body`, so a surface that does not ask
 *   for it renders in the system stack.
 *
 * Colours come from the `--landing-*` tokens, which already hold exactly this
 * palette. They are spelled as `var(...)` in arbitrary values rather than
 * through the `bg-surface` / `text-muted` theme utilities because two of those
 * names — `accent` and `muted` — resolve to the *shadcn* palette inside a
 * `data-admin-surface` subtree (see the `--admin-accent` fallback chain in
 * `globals.css`). Reaching for the variable directly sidesteps that collision
 * and keeps the whole file consistent about where a colour comes from.
 *
 * Presentational and server-renderable: it holds no state and no handlers, so
 * it carries no `"use client"` of its own and simply joins whichever bundle its
 * caller belongs to.
 */

/** The three content widths the handoff uses, in px. */
export type AuthShellMaxWidth = "420" | "560" | "860";

const MAX_WIDTH_CLASSES: Record<AuthShellMaxWidth, string> = {
  "420": "max-w-[420px]",
  "560": "max-w-[560px]",
  "860": "max-w-[860px]",
};

export type AuthShellProps = {
  /**
   * Width of the content column: 420 for the forms, 560 for the account-type
   * step, 860 for the role step.
   */
  maxWidth: AuthShellMaxWidth;
  /**
   * Applied to the content column, which is already `flex flex-col`. The gap
   * between sections is the caller's to set (28px on step 1, 24px elsewhere),
   * since it varies per screen.
   */
  className?: string;
  children: React.ReactNode;
};

export function AuthShell({ maxWidth, className, children }: AuthShellProps) {
  return (
    <div
      data-admin-surface
      className="flex min-h-screen flex-col bg-[var(--landing-surface)] font-body text-[#171717] antialiased"
    >
      <header className="flex h-16 flex-none items-center justify-between gap-4 border-b border-[var(--landing-line)] bg-white px-[clamp(20px,5vw,48px)]">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-[var(--landing-ink-strong)]"
        >
          {/* Placeholder mark. The handoff ships no logo asset — see its
              "Assets" section — so this is the 22px orange square it specifies,
              to be swapped for the real mark when one exists. */}
          <span
            aria-hidden="true"
            className="size-[22px] flex-none rounded-[6px] bg-[var(--landing-accent)]"
          />
          Lalamove Clone
        </Link>

        <div className="flex items-center gap-[18px]">
          {/* Not a link: this app has no support route, and a dead `href="#"`
              is worse than plain text — it lands keyboard focus on something
              that does nothing. Make it a `<Link>` the day `/support` exists. */}
          <span className="text-[13px] text-[var(--landing-muted)]">
            Need help?
          </span>
          {/* Static for now — one locale is shipped, so a chip that cannot
              change anything is a label rather than a control. */}
          <span className="rounded-full border border-[var(--landing-line)] px-2.5 py-[5px] text-xs font-medium text-[var(--landing-muted)]">
            EN
          </span>
        </div>
      </header>

      <main className="flex flex-1 justify-center px-[clamp(20px,5vw,48px)] pt-[clamp(32px,6vw,64px)] pb-[140px]">
        <div
          className={cn(
            "flex w-full flex-col",
            MAX_WIDTH_CLASSES[maxWidth],
            className,
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
