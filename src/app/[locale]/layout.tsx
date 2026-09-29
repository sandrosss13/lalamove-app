import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Noto_Sans_Georgian,
} from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import "../globals.css";
import { AuthStatus, HeaderBrandLink } from "@/components/auth-status";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { LOCALES, routing } from "@/i18n/routing";

// Exposed as CSS variables only (never applied to `body`), so these are opt-in
// per route via the `font-display` / `font-body` / `font-price` utilities. Both
// the landing page's headings and its body copy are the same family
// (IBM Plex Sans), differentiated by weight rather than by a separate
// display face.
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-ibm-plex-sans",
});

// Used for numeric data (prices, dates, IDs) where tabular alignment matters —
// the driver hub's regular text and the landing page's body/display text both
// stay on their own sans stacks; only figures opt into this one.
//
// The lari sign (U+20BE) is NOT in IBM Plex — neither the mono nor the sans
// face — so every ₾ on the site renders in the system fallback. Do not try to
// fix that by adding the "latin-ext" subset: Google declares U+20AD-20C0 on
// that subset generically across families, so it looks like the right answer,
// but IBM Plex has no lari glyph and downloading the subset changes nothing.
// Measured in a browser: ₾ is 25.2px wide whether IBM Plex Mono is requested or
// a font that does not exist, while € (U+20AC, which IBM Plex does have) is
// 20.4px — one mono cell, same as every digit.
//
// This is cosmetic rather than a layout bug: every money string goes through a
// formatGel helper, so they all carry the same ₾ at the same width and price
// columns still align with each other. Fixing it properly means loading a face
// that actually has the glyph, which is a design decision, not a config change.
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-ibm-plex",
});

/**
 * Georgian coverage for every stack above. IBM Plex — neither the sans nor the
 * mono face — has a single Mkhedruli glyph, and both are loaded with
 * `subsets: ["latin"]`, so without this every Georgian string on the site would
 * render in whatever the OS happened to pick: Sylfaen on Windows, Noto on most
 * Linux, a serif on some Android builds. Three different faces for the primary
 * language of the platform.
 *
 * It is appended to the font stacks in `globals.css` rather than applied to any
 * element directly, so the browser reaches for it per *glyph* rather than per
 * element: Latin text (a licence plate, an email address, a vehicle model) keeps
 * rendering in IBM Plex even mid-sentence in a Georgian paragraph, and only the
 * characters IBM Plex cannot draw fall through to this face. That also means it
 * is loaded on the English site too, which is intended — Georgian city and
 * driver names appear in English copy.
 *
 * Bonus, and not a small one: Noto Sans Georgian has the lari sign (U+20BE).
 * The long comment on `ibmPlexMono` above documents that `₾` renders 25.2px
 * wide in the system fallback against a 20.4px mono cell; with this face in the
 * stack the glyph now comes from a font that actually has it.
 */
const notoSansGeorgian = Noto_Sans_Georgian({
  subsets: ["georgian"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-noto-georgian",
});

/**
 * Applied before first paint so no page ever flashes the wrong theme. This has
 * to be an inline, synchronous `<script>` in `<head>`: a `useEffect` (or
 * `next/script` at any strategy other than `beforeInteractive`) runs after the
 * first paint, which is exactly the flash we are avoiding.
 *
 * Only the class is set here; every token the class selects lives in
 * `globals.css`, under `html.dark`. That used to be scoped to
 * `body:has([data-landing-page])`, which made the class inert on the admin back
 * office, the driver hub and the onboarding wizards — it is not any more. The
 * class now themes the whole app, so this script's correctness matters on every
 * route rather than just on `/`.
 *
 * This is also why `globals.css` no longer carries a
 * `@media (prefers-color-scheme: dark)` fallback: the script resolves the system
 * preference into the class itself, so the class is the single source of truth
 * and a media query alongside it would override an explicit "light" choice made
 * on a system-dark machine.
 *
 * `localStorage` throws — not returns null — in a browser with site data blocked
 * and in some private-browsing modes, and an exception here would abort the
 * whole script and leave the page unthemed, so both reads are guarded. The
 * `"theme"` key is restated in `src/components/theme-toggle.tsx`, which writes
 * it; there is no shared constant because this string has to be embedded in a
 * script literal that runs before any module does.
 *
 * Kept minified on one line: a readable multi-line literal would add bytes to
 * every HTML response for no benefit.
 */
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("theme");var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){try{if(window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}}catch(e2){}}})();`;

export const metadata: Metadata = {
  title: "Lalamove Clone",
  description:
    "On-demand delivery platform — book a vehicle and move your goods across the city.",
};

/**
 * Both locales are known at build time and neither depends on request data, so
 * every route under this layout can stay statically rendered — including
 * `/[locale]` itself, which is `revalidate = 60`. Without this, the `[locale]`
 * segment would make the whole tree dynamic and quietly drop that ISR window.
 */
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // The segment comes out of the URL, so it is untrusted input: `/xx/home` and
  // `/../home` both arrive here as a `locale` string. `notFound()` rather than a
  // fallback to Georgian, so an unknown language is an honest 404 instead of a
  // page that claims — to a reader and to a crawler — that a translation exists.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Opts this subtree out of dynamic rendering. `generateStaticParams` above
  // supplies the values; this is what lets `useTranslations` run in a statically
  // rendered server component rather than forcing it dynamic on first use.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${notoSansGeorgian.variable}`}
      // The script below adds `dark` to this element's class list before React
      // hydrates, so the server-rendered markup and the live DOM legitimately
      // differ here. Suppression is one level deep — it covers `<html>`'s own
      // attributes and nothing inside.
      suppressHydrationWarning
    >
      {/*
        An explicit `<head>` is safe: the App Router merges it with the
        `metadata` output above. A bare `<script>` here is rendered verbatim and
        is the only form guaranteed to run before paint — `next/script` is not a
        substitute. Nothing on the server reads the theme: `src/app/[locale]/page.tsx`
        is `revalidate = 60` and its HTML is shared between visitors, so the theme
        is a client-only concern by construction.
      */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {/*
          Messages are read from the request config (`src/i18n/request.ts`) and
          handed to the client tree here, once. Two thirds of this app's
          components are `"use client"`, so passing the catalogs down from the
          root is the only arrangement that does not have every one of them
          fetch its own.
        */}
        <NextIntlClientProvider>
          <header className="flex items-center justify-between border-b px-6 py-3">
            <HeaderBrandLink />
            {/*
            `AuthStatus` renders its own flex row, so the toggle gets a wrapper
            rather than being dropped in beside it — otherwise it would be a
            sibling of that row and the two would sit against each other with no
            gap. `gap-3` matches the spacing `AuthStatus` uses internally, so the
            toggle reads as one more item in the same run of controls.

            The toggle is deliberately last: it is the least-used control here,
            and putting it after the sign-out/dashboard links keeps those two in
            the position returning visitors already reach for.

            This header is hidden on the surfaces that ship their own — the
            landing page (`[data-hide-site-header]`) and the admin back office
            (`[data-admin-surface]`), both handled by rules in `globals.css`. So
            this instance covers /home, the account pages, orders, wallet and
            checkout; every other surface mounts its own `ThemeToggle` in its own
            header.
          */}
            <div className="flex items-center gap-3">
              <AuthStatus />
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </header>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
