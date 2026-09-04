"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { useSignOut } from "@/components/auth/use-sign-out";
import { LandingThemeToggle } from "@/components/landing/landing-theme-toggle";
import {
  DEFAULT_HOME_PAGE_CONTENT,
  type NavContent,
} from "@/lib/admin/home-page-content";
import { useSession } from "@/lib/auth-client";

/**
 * Shared by the inline row and the mobile panel so both obey one rule for how a
 * CMS href becomes an element — the same rule the footer applies:
 *
 * - `/…` is an in-app route, so it gets `next/link` and client-side navigation.
 * - anything else (a `#anchor`, an absolute URL, a `mailto:`) is a plain `<a>`,
 *   because `next/link` cannot prefetch or route those.
 *
 * `rel="noreferrer"` is added for `http(s)` targets only: they are the only ones
 * that leave the app, and it is meaningless on an in-page anchor.
 *
 * `onSelect` is what closes the mobile panel. It fires for every link, including
 * an in-page anchor, where no navigation event would otherwise tell us the
 * visitor is done with the menu.
 */
function NavLinkElement({
  href,
  className,
  onSelect,
  children,
}: {
  href: string;
  className?: string;
  onSelect?: () => void;
  children: React.ReactNode;
}) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className} onClick={onSelect}>
        {children}
      </Link>
    );
  }

  const isExternal = href.startsWith("http://") || href.startsWith("https://");

  return (
    <a
      href={href}
      className={className}
      onClick={onSelect}
      rel={isExternal ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

/**
 * Every pill control is a pill-shaped 13.5px chip; only the fill differs. Kept
 * as constants rather than repeated literals so the inline row and the mobile
 * panel cannot drift apart, and so the one place a size changes is here.
 */
const CHIP_BASE =
  "rounded-full text-[13.5px] whitespace-nowrap transition-colors";

/** Quiet chip: nav links, Sign in, and the signed-in account link. */
const CHIP_QUIET = `${CHIP_BASE} text-subtle hover:bg-surface-raised hover:text-paper`;

/**
 * Inverted chip: the pill's one prominent action — Sign up signed out, Sign out
 * signed in. `bg-paper` on `text-ink` is the design's foreground-on-background
 * button, which means it flips with the theme for free — dark-on-light in the
 * light theme, light-on-dark in the dark one.
 *
 * `disabled:opacity-60` only ever applies to the `<button>` that renders the
 * sign-out action; on the `<a>`/`Link` chips it is inert.
 */
const CHIP_INVERTED = `${CHIP_BASE} bg-paper font-semibold text-ink hover:opacity-90 disabled:opacity-60`;

/**
 * The floating glass nav pill — the landing page's only persistent chrome, and
 * therefore the only sensible home for the theme toggle.
 *
 * `content` is optional and falls back to the shipped defaults, matching every
 * other landing section: the page renders correctly with zero CMS rows, which
 * is the normal state until the `nav` section is seeded.
 *
 * Colours are token names only (`bg-glass`, `border-line`, `text-subtle`,
 * `text-paper`, `bg-paper`/`text-ink`). The handoff is written in dark-theme
 * rgba literals; none of them appear here, because each token already resolves
 * to the right value in both themes.
 */
export function LandingNavPill({
  content = DEFAULT_HOME_PAGE_CONTENT.nav,
}: {
  content?: NavContent;
}) {
  // The design ships no mobile menu — its links wrap to roughly four rows at
  // 360px, and because the pill is `position: fixed` that block never scrolls
  // away. The handoff flags this as a prototype-only compromise ("In production
  // consider a proper mobile menu"), so below `sm` the links collapse into this
  // disclosure instead.
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  /*
    The pill has to know about the session because it is frequently the *only*
    chrome on the page: `LandingPage` sets `data-hide-site-header` unless
    `showSiteHeader` is passed, which hides the root layout's header — the one
    place a signed-in user would otherwise find their account link and a sign
    out. Without this branch a signed-in visitor to `/home` is offered "Sign in"
    and "Sign up", and on every other landing render has no way out at all.

    `isPending` keeps the signed-out pair rather than swapping in a skeleton:
    that is what the server-rendered markup already shows, so the common
    (signed-out) case never changes after hydration, and the signed-in case
    settles in a single swap.
  */
  const { data: session, isPending } = useSession();
  const { signOut, signingOut } = useSignOut();
  const sessionUser = isPending ? undefined : session?.user;

  // Same split as `AuthStatus`: clients live on /account, while drivers and
  // logistics companies manage their work on /dashboard.
  const isClient = sessionUser?.role === "CLIENT";
  const accountHref = isClient ? "/account" : "/dashboard";
  const accountLabel = isClient ? "My account" : "Dashboard";

  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Focus is only pulled back to the disclosure button when it is about to be
   * lost — i.e. when it currently sits on something inside the pill or panel
   * that is about to unmount. Restoring unconditionally would yank focus away
   * from whatever a visitor clicked out on, which is worse than not restoring.
   */
  function closeMenu() {
    setIsMenuOpen(false);

    const container = containerRef.current;
    if (container && container.contains(document.activeElement)) {
      toggleButtonRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeMenu();
    }

    // `pointerdown` rather than `click`: it fires before focus moves, so the
    // focus-restoration check above still sees the panel's own focused element
    // and can hand focus back rather than letting it fall to `<body>`.
    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current;
      if (container && event.target instanceof Node) {
        if (container.contains(event.target)) return;
      }
      closeMenu();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
    // Only `isMenuOpen` gates the listeners. `closeMenu` is re-created every
    // render but reads nothing except refs and a state setter, so there is no
    // stale value for it to capture.
  }, [isMenuOpen]);

  return (
    // `pointer-events-none` on the wrapper and `pointer-events-auto` on the pill
    // and panel: the wrapper spans the full viewport width, so without this the
    // transparent gutter either side of the pill would swallow every click on
    // the page behind it.
    <div
      ref={containerRef}
      // `--landing-nav-pill-top` is the design's 14px everywhere except the one
      // state that also renders the global site header (the signed-in `/home`
      // preview), where `globals.css` moves the pill below it rather than
      // across it.
      className="pointer-events-none fixed top-[var(--landing-nav-pill-top)] right-0 left-0 z-50 flex flex-col items-center px-4"
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-full border border-line bg-glass py-2 pr-2 pl-[18px] shadow-pill backdrop-blur-glass backdrop-saturate-[1.4]">
        <Link
          href="/"
          className="mr-3.5 text-[16px] leading-none font-bold tracking-[-0.035em] whitespace-nowrap text-paper"
        >
          {content.wordmark}
        </Link>

        {/* Hidden rather than unmounted below `sm` so the links stay in the
            document for crawlers and so nothing depends on a JS breakpoint
            read, which would be wrong on the server. */}
        <div className="hidden flex-wrap items-center justify-center gap-1.5 sm:flex">
          {/* `links` can legitimately be empty — a half-finished admin edit —
              in which case the pill is just wordmark, toggle and buttons. */}
          {content.links.map((link) => (
            <NavLinkElement
              key={`${link.label}-${link.href}`}
              href={link.href}
              className={`${CHIP_QUIET} px-3.5 py-[9px]`}
            >
              {link.label}
            </NavLinkElement>
          ))}

          {/* The quiet slot: the visitor's way in signed out, their way to
              their own surface signed in. The CMS hrefs stay on the signed-out
              branch — an account route is app structure, not editable copy. */}
          {sessionUser ? (
            <NavLinkElement
              href={accountHref}
              className={`${CHIP_QUIET} ml-1.5 px-3.5 py-[9px]`}
            >
              {accountLabel}
            </NavLinkElement>
          ) : (
            <NavLinkElement
              href={content.signInHref}
              className={`${CHIP_QUIET} ml-1.5 px-3.5 py-[9px]`}
            >
              {content.signInLabel}
            </NavLinkElement>
          )}
        </div>

        {/* Between the links and Sign up in the inline row; between the wordmark
            and the disclosure button once the links collapse. One instance in
            both cases — the toggle owns real state, so it is never duplicated. */}
        <LandingThemeToggle />

        {/* Sign out takes the inverted slot Sign up occupies, carrying the same
            padding and `sm:inline-block` so the pill's proportions and its
            single point of visual weight are unchanged by the session. */}
        {sessionUser ? (
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className={`${CHIP_INVERTED} ml-0.5 hidden px-5 py-2.5 sm:inline-block`}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        ) : (
          <NavLinkElement
            href={content.signUpHref}
            className={`${CHIP_INVERTED} ml-0.5 hidden px-5 py-2.5 sm:inline-block`}
          >
            {content.signUpLabel}
          </NavLinkElement>
        )}

        <button
          ref={toggleButtonRef}
          type="button"
          aria-expanded={isMenuOpen}
          aria-controls={panelId}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          onClick={() => (isMenuOpen ? closeMenu() : setIsMenuOpen(true))}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-subtle transition-colors hover:bg-surface-raised hover:text-paper sm:hidden"
        >
          {isMenuOpen ? (
            <X aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Menu aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Mounted only while open, so `aria-controls` points at a live element
          exactly when the button says it is expanded. This is a disclosure, not
          a dialog: no focus trap, no `inert` on the rest of the page. */}
      {isMenuOpen ? (
        <div
          id={panelId}
          className="pointer-events-auto mt-2 w-full max-w-sm rounded-3xl border border-line bg-glass p-3.5 shadow-pill backdrop-blur-glass backdrop-saturate-[1.4] sm:hidden"
        >
          <div className="flex flex-col gap-1">
            {content.links.map((link) => (
              <NavLinkElement
                key={`${link.label}-${link.href}`}
                href={link.href}
                onSelect={closeMenu}
                // `min-h-11` is a 44px tap target, the minimum comfortable size
                // on a phone; the chip's own padding alone would be 32px.
                className={`${CHIP_QUIET} flex min-h-11 items-center px-3.5`}
              >
                {link.label}
              </NavLinkElement>
            ))}

            {/* The same two slots as the inline row, on the same chip
                constants, so the signed-in state cannot appear on one breakpoint
                and not the other. */}
            {sessionUser ? (
              <>
                <NavLinkElement
                  href={accountHref}
                  onSelect={closeMenu}
                  className={`${CHIP_QUIET} flex min-h-11 items-center px-3.5`}
                >
                  {accountLabel}
                </NavLinkElement>

                <button
                  type="button"
                  // Closes the panel exactly as a link does before the sign-out
                  // runs: the visitor is done with the menu either way, and the
                  // hook navigates the whole document away on success, so
                  // leaving the panel open would only flash it during unload.
                  onClick={() => {
                    closeMenu();
                    void signOut();
                  }}
                  disabled={signingOut}
                  className={`${CHIP_INVERTED} mt-1 flex min-h-11 items-center justify-center px-5`}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            ) : (
              <>
                <NavLinkElement
                  href={content.signInHref}
                  onSelect={closeMenu}
                  className={`${CHIP_QUIET} flex min-h-11 items-center px-3.5`}
                >
                  {content.signInLabel}
                </NavLinkElement>

                <NavLinkElement
                  href={content.signUpHref}
                  onSelect={closeMenu}
                  className={`${CHIP_INVERTED} mt-1 flex min-h-11 items-center justify-center px-5`}
                >
                  {content.signUpLabel}
                </NavLinkElement>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
