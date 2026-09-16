import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * The frame every screen in the auth flow sits in: a 64px raised bar over the
 * page ground, with the content column centred beneath it.
 *
 * Two things about the root element are load-bearing rather than decorative:
 *
 * - `data-admin-surface` is what hides the global site header from
 *   `src/app/layout.tsx` (`body:has([data-admin-surface]) > header` in
 *   `globals.css`). Without it the app's navbar stacks on top of this one; with
 *   it, this component owns the only header on the page — so never add a second.
 *   That is also why the header below mounts its own `ThemeToggle`: the global
 *   one is inside the header this attribute hides, so without a local copy this
 *   surface would be the one place in the app with no way to switch themes.
 * - `font-body` opts into IBM Plex Sans. The layout exposes the family as a CSS
 *   variable only and never applies it to `body`, so a surface that does not ask
 *   for it renders in the system stack.
 *
 * Colours come from the `--landing-*` tokens, which already hold exactly this
 * palette and now flip with `html.dark` — they used to be declared only for the
 * landing page, which is why this surface was full of light-only literals. They
 * are spelled as `var(...)` in arbitrary values rather than through the
 * `bg-surface` / `text-muted` theme utilities because two of those names —
 * `accent` and `muted` — resolve to the *shadcn* palette inside a
 * `data-admin-surface` subtree (see the `--admin-accent` fallback chain in
 * `globals.css`). Reaching for the variable directly sidesteps that collision
 * and keeps the whole file consistent about where a colour comes from.
 *
 * The two text tokens are easy to mix up, and only one of them is right here:
 * `--landing-paper` is the foreground (near-black on light, near-white on dark),
 * while `--landing-ink-strong` is a *panel fill* that stays dark in both themes
 * and pairs with `--landing-on-strong`. Reaching for `ink-strong` as a text
 * colour is what made the headings on this surface invisible in dark mode.
 *
 * Presentational and server-renderable: it holds no state and no handlers of its
 * own, so it carries no `"use client"` and simply joins whichever bundle its
 * caller belongs to. `ThemeToggle` brings its own directive, so it stays a
 * client island regardless of who renders this.
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
      className="flex min-h-screen flex-col bg-[var(--landing-surface)] font-body text-[var(--landing-paper)] antialiased"
    >
      <header className="flex h-16 flex-none items-center justify-between gap-4 border-b border-[var(--landing-line)] bg-[var(--landing-surface-raised)] px-[clamp(20px,5vw,48px)]">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-[var(--landing-paper)]"
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
          {/*
            Last in the cluster, matching the global site header: it is the
            least-used control up here, and the two items before it are what a
            visitor actually scans for.

            Restyled to the landing palette, because `ThemeToggle`'s defaults are
            shadcn tokens and inside this `data-admin-surface` subtree those are
            the hue-neutral greys the back office uses — correct, but visibly
            cooler than the warm line and muted text it sits between. Sized 32px
            rather than the shared 36px so it matches the EN chip's height in a
            64px bar instead of towering over it.

            The focus treatment is *recoloured*, not replaced: the shared button
            draws a `ring-3` halo, and cancelling it in favour of this surface's
            `focus-visible:outline-2` idiom would mean fighting the base
            `outline-none`. Pointing the existing ring at the landing accent
            gets the same orange focus language for two class names. Both carry
            the `focus-visible:` modifier themselves — twMerge keys its conflict
            groups on the modifier as well as the utility, so an unprefixed
            `border-*` would not override `focus-visible:border-ring`.
          */}
          <ThemeToggle className="h-8 w-8 border-[var(--landing-line)] text-[var(--landing-muted)] hover:bg-[var(--landing-frame)] hover:text-[var(--landing-paper)] focus-visible:border-[var(--landing-accent)] focus-visible:ring-[var(--landing-line-accent-strong)]" />
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
