"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { useSignOut } from "@/components/auth/use-sign-out";
import { ZomoLockupThemed } from "@/components/brand/zomo-logo";
import { LandingLink } from "@/components/landing/landing-link";
import { HOME_CONTAINER } from "@/components/landing/landing-home-styles";
import { LandingThemeToggle } from "@/components/landing/landing-theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { Link } from "@/i18n/navigation";
import {
  migrateLegacyBrandCopy,
  type NavContent,
} from "@/lib/admin/home-page-content";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * Mkhedruli sets far wider than Plex Latin, so the Georgian nav runs a step
 * tighter; at the design's size the KA links overflow a 1440px header.
 */
const NAV_LINK =
  "rounded-lg px-3.5 py-2.5 text-[14.5px] font-medium whitespace-nowrap text-home-ink transition-colors hover:bg-home-chip [&:lang(ka)]:px-2.5 [&:lang(ka)]:text-[13px]";

const OUTLINE_BUTTON =
  "inline-flex items-center justify-center rounded-full border border-home-line px-[18px] py-[10px] text-[14.5px] font-semibold whitespace-nowrap text-home-ink transition-colors hover:bg-home-chip";

/**
 * The design's Sign up button is `#08090A` in both themes, which disappears
 * into the dark theme's `#17191A` header. It uses the theme's inverted button
 * pair instead — the same pair the design itself uses for its vehicle tabs.
 */
const SOLID_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-home-btn-bg px-5 py-3 text-[14.5px] font-semibold whitespace-nowrap text-home-btn-fg transition-opacity hover:opacity-90 disabled:opacity-60";

/**
 * The v4 page chrome: a slim near-black utility bar (authored line, a few
 * small links, the KA/EN switch) above a sticky white header with the logo,
 * the section links, the theme toggle and the account actions.
 *
 * Below `xl` the links and account actions collapse into a disclosure panel —
 * the prototype simply lets them wrap, which at phone width stacks the header
 * three rows deep and keeps it pinned over the content.
 *
 * Session-aware for the same reason the v3 nav pill is: on the signed-in
 * `/home` preview this can be the only chrome, so a signed-in visitor gets
 * their account link and Sign out instead of Sign in / Sign up.
 */
export function LandingSiteHeader({ content }: { content: NavContent }) {
  const t = useTranslations("landing.landingNavPill");
  const tShared = useTranslations("common.shared");
  const tAuth = useTranslations("common.authStatus");

  const { data: session, isPending } = useSession();
  const { signOut, signingOut } = useSignOut();
  const sessionUser = isPending ? undefined : session?.user;
  const isClient = sessionUser?.role === "CLIENT";
  const accountHref = isClient ? "/account" : "/dashboard";
  const accountLabel = isClient ? tShared("myAccount") : tShared("dashboard");
  const hasSignIn = content.signInHref.trim() !== "";

  const utilityLinks = content.utilityLinks ?? [];
  const utilityText = content.utilityText?.trim() ?? "";

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const panelId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Focus goes back to the menu button only if it was inside the panel that is
  // about to unmount; otherwise it stays wherever the visitor put it.
  function closeMenu() {
    setIsMenuOpen(false);
    const header = headerRef.current;
    if (header && header.contains(document.activeElement)) {
      toggleButtonRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!isMenuOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    // `pointerdown` fires before focus moves, so `closeMenu` can still see
    // focus inside the panel and hand it back to the button.
    function handlePointerDown(event: PointerEvent) {
      const header = headerRef.current;
      if (header && event.target instanceof Node) {
        if (header.contains(event.target)) return;
      }
      closeMenu();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
    // `closeMenu` reads only refs and a setter, so nothing goes stale.
  }, [isMenuOpen]);

  const accountActions = (layout: "inline" | "panel") => {
    const onSelect = layout === "panel" ? closeMenu : undefined;
    const panelSize = layout === "panel" ? "min-h-11 w-full" : "";

    if (sessionUser) {
      return (
        <>
          <LandingLink
            href={accountHref}
            onClick={onSelect}
            className={cn(OUTLINE_BUTTON, panelSize)}
          >
            {accountLabel}
          </LandingLink>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => {
              onSelect?.();
              void signOut();
            }}
            className={cn(SOLID_BUTTON, panelSize)}
          >
            {signingOut ? tAuth("signingOut") : tAuth("signOut")}
          </button>
        </>
      );
    }

    return (
      <>
        {hasSignIn ? (
          <LandingLink
            href={content.signInHref}
            onClick={onSelect}
            className={cn(OUTLINE_BUTTON, panelSize)}
          >
            {content.signInLabel}
          </LandingLink>
        ) : null}
        <LandingLink
          href={content.signUpHref}
          onClick={onSelect}
          className={cn(SOLID_BUTTON, panelSize)}
        >
          {content.signUpLabel}
        </LandingLink>
      </>
    );
  };

  return (
    <>
      <div className="bg-home-night text-[12.5px] text-home-on-night/62">
        <div
          className={cn(
            HOME_CONTAINER,
            "flex flex-wrap items-center justify-between gap-x-[22px] gap-y-2 py-2",
          )}
        >
          {/* An empty span keeps the switch right-aligned when no line is
              authored. */}
          <span>{utilityText}</span>
          <div className="flex flex-wrap items-center gap-[18px]">
            {utilityLinks.map((link) => (
              <LandingLink
                key={`${link.label}-${link.href}`}
                href={link.href}
                className="text-inherit transition-colors hover:text-home-on-night"
              >
                {link.label}
              </LandingLink>
            ))}
            <LanguageToggle className="h-7 border-home-on-night/20 px-2.5 font-price text-[11px] tracking-[0.08em] text-home-on-night/80 hover:bg-home-on-night/14 hover:text-home-on-night focus-visible:border-home-on-night/20 focus-visible:ring-0" />
          </div>
        </div>
      </div>

      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-home-line bg-home-surface"
      >
        <div
          className={cn(
            HOME_CONTAINER,
            "flex min-h-[68px] items-center gap-x-5 gap-y-2.5",
          )}
        >
          {/* The lockup, never the wordmark set in text (brand book); the CMS
              field becomes its accessible name. */}
          <Link href="/" className="mr-2 flex flex-none items-center">
            <ZomoLockupThemed
              className="h-[30px]"
              label={migrateLegacyBrandCopy(content.wordmark)}
            />
          </Link>

          {/* Hidden rather than unmounted below `xl`, so the links stay in the
              document for crawlers and nothing depends on a JS breakpoint. */}
          <nav
            aria-label={t("primaryNavigation")}
            className="hidden flex-auto gap-1 xl:flex [&:lang(ka)]:gap-0"
          >
            {content.links.map((link) => (
              <LandingLink
                key={`${link.label}-${link.href}`}
                href={link.href}
                className={NAV_LINK}
              >
                {link.label}
              </LandingLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LandingThemeToggle className="h-[42px] w-[42px] border-home-line bg-home-surface text-home-ink hover:bg-home-chip hover:text-home-ink focus-visible:border-home-line" />
            <div className="hidden items-center gap-2 xl:flex">
              {accountActions("inline")}
            </div>
            <button
              ref={toggleButtonRef}
              type="button"
              aria-expanded={isMenuOpen}
              aria-controls={panelId}
              aria-label={isMenuOpen ? t("closeMenu") : t("openMenu")}
              onClick={() => (isMenuOpen ? closeMenu() : setIsMenuOpen(true))}
              className="grid h-[42px] w-[42px] place-items-center rounded-full border border-home-line text-home-ink transition-colors hover:bg-home-chip xl:hidden"
            >
              {isMenuOpen ? (
                <X aria-hidden="true" className="h-[18px] w-[18px]" />
              ) : (
                <Menu aria-hidden="true" className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>

        {/* Mounted only while open, so `aria-controls` points at a live
            element exactly when the button says it is expanded. A disclosure,
            not a dialog: no focus trap. */}
        {isMenuOpen ? (
          <div
            id={panelId}
            className="border-t border-home-line bg-home-surface xl:hidden"
          >
            <div className={cn(HOME_CONTAINER, "flex flex-col gap-1 py-3")}>
              {content.links.map((link) => (
                <LandingLink
                  key={`${link.label}-${link.href}`}
                  href={link.href}
                  onClick={closeMenu}
                  className={cn(NAV_LINK, "flex min-h-11 items-center")}
                >
                  {link.label}
                </LandingLink>
              ))}
              <div className="mt-2 flex gap-2 border-t border-home-line pt-3 [&>*]:flex-1">
                {accountActions("panel")}
              </div>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
}
