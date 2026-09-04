import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AuthStatus, HeaderBrandLink } from "@/components/auth-status";

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
 * Applied before first paint so the landing page never flashes the wrong theme.
 * This has to be an inline, synchronous `<script>` in `<head>`: a `useEffect`
 * (or `next/script` at any strategy other than `beforeInteractive`) runs after
 * the first paint, which is exactly the flash we are avoiding.
 *
 * Only the class is set here; every token the class selects lives in
 * `globals.css`, scoped to `body:has([data-landing-page])` so the class is inert
 * on the admin back office, the driver hub and the onboarding wizards.
 *
 * `localStorage` throws — not returns null — in a browser with site data blocked
 * and in some private-browsing modes, and an exception here would abort the
 * whole script and leave the page unthemed, so both reads are guarded. The
 * `"theme"` key is restated in `src/components/landing/landing-theme-toggle.tsx`,
 * which writes it; there is no shared constant because this string has to be
 * embedded in a script literal that runs before any module does.
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
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
        substitute. Nothing on the server reads the theme: `src/app/page.tsx` is
        `revalidate = 60` and its HTML is shared between visitors, so the theme
        is a client-only concern by construction.
      */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="flex items-center justify-between border-b px-6 py-3">
          <HeaderBrandLink />
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}
