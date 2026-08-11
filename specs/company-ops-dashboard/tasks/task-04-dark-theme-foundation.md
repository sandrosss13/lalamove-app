# Task 04: Dark theme foundation

## Status

complete

## Wave

1

## Description

The new ops dashboard is a dark, dense console UI, visually distinct from the rest of this app's plain light Tailwind theme. This task adds the CSS custom properties, Tailwind `@theme` mappings, keyframe animations, and font that every dashboard component (built in later waves) will use — scoped so none of it leaks into the light-themed driver dashboard, account pages, or landing page. This follows the exact pattern already used for the landing page's own scoped dark theme (`--landing-*` tokens + `[data-landing-page]` attribute selector), which you should read in `globals.css` before starting.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-06-shell-and-scaffold.md

**Context from dependencies:** None — this task only needs the existing `globals.css` and `layout.tsx` (both fully reproduced below).

## Files to Modify

- `src/app/globals.css` — add `--ops-*` tokens, `@theme inline` mappings, keyframes, and scoping rules.
- `src/app/layout.tsx` — add an IBM Plex variable font, exposed the same opt-in way `--font-display`/`--font-body` already are.

## Technical Details

### Current `globals.css` (full file, for exact context)

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;

  /* Landing-page palette. Deliberately independent of the light/dark tokens
     above: the marketing page is always a fixed light-on-near-black scheme. */
  --landing-ink: #0a0a0a;
  --landing-surface: #16150f;
  --landing-paper: #f5f2ed;
  --landing-muted: #b6b0a7;
  --landing-accent: #ff5a1f;
  --landing-line: rgba(245, 242, 237, 0.14);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);

  --color-ink: var(--landing-ink);
  --color-surface: var(--landing-surface);
  --color-paper: var(--landing-paper);
  --color-muted: var(--landing-muted);
  --color-accent: var(--landing-accent);
  --color-line: var(--landing-line);

  --font-display: var(--font-bebas-neue), sans-serif;
  --font-body: var(--font-archivo), sans-serif;

  --animate-rise: landing-rise 0.75s cubic-bezier(0.16, 1, 0.3, 1) both;
  --animate-wipe: landing-wipe 0.9s cubic-bezier(0.16, 1, 0.3, 1) both;
  --animate-ticker: landing-ticker 45s linear infinite;
}

@keyframes landing-rise { from { opacity: 0; transform: translateY(1.75rem); } to { opacity: 1; transform: translateY(0); } }
@keyframes landing-wipe { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes landing-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

@utility landing-grain { background-image: radial-gradient(rgba(245, 242, 237, 0.06) 1px, transparent 1px); background-size: 3px 3px; }
@utility landing-grid { background-image: linear-gradient(to right, rgba(245, 242, 237, 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(245, 242, 237, 0.05) 1px, transparent 1px); background-size: 4.5rem 4.5rem; }
@utility landing-hazard { background-image: repeating-linear-gradient(-45deg, var(--landing-accent) 0 0.6rem, transparent 0.6rem 1.2rem); }

body {
  background: var(--background);
  color: var(--foreground);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* The landing page ships its own header and owns the full viewport, so the
   global site header would stack a second, light-themed navbar on top of it. */
body:has([data-landing-page]) > header { display: none; }
body:has([data-landing-page]) { background: var(--landing-ink); }

[data-landing-page] a:focus-visible,
[data-landing-page] button:focus-visible {
  outline: 2px solid var(--landing-accent);
  outline-offset: 4px;
}

@media (prefers-reduced-motion: reduce) {
  [data-landing-page] *, [data-landing-page] *::before, [data-landing-page] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Changes to make

**1. In the `:root` block**, add the ops palette right after the `--landing-*` block (mockup colors were OKLCH — reproduce them as OKLCH here too, since that's what gives the intended dark, slightly-warm-neutral console look):

```css
  /* Ops-dashboard palette (logistics company dashboard). Independent of the
     light/dark tokens above and of the landing page's own palette: this is a
     fixed dark scheme regardless of system theme, scoped to [data-ops-dashboard]. */
  --ops-bg: oklch(0.16 0.004 260);
  --ops-surface: oklch(0.19 0.005 260);
  --ops-surface-raised: oklch(0.22 0.006 260);
  --ops-border: oklch(0.26 0.006 260);
  --ops-text: oklch(0.95 0.002 260);
  --ops-text-muted: oklch(0.6 0.012 260);
  --ops-accent: oklch(0.66 0.18 25);
  --ops-accent-fg: oklch(0.14 0.02 25);
  --ops-danger: oklch(0.6 0.18 25);
  --ops-success: oklch(0.7 0.14 145);
```

**2. In `@theme inline`**, add corresponding `--color-ops-*` mappings and two new keyframe-driven animation variables, right after the existing `--animate-ticker` line:

```css
  --color-ops-bg: var(--ops-bg);
  --color-ops-surface: var(--ops-surface);
  --color-ops-surface-raised: var(--ops-surface-raised);
  --color-ops-border: var(--ops-border);
  --color-ops-text: var(--ops-text);
  --color-ops-text-muted: var(--ops-text-muted);
  --color-ops-accent: var(--ops-accent);
  --color-ops-accent-fg: var(--ops-accent-fg);
  --color-ops-danger: var(--ops-danger);
  --color-ops-success: var(--ops-success);

  --font-ops: var(--font-ibm-plex), monospace;

  --animate-ops-drawer-in: ops-drawer-in 0.18s ease;
  --animate-ops-toast-in: ops-toast-in 0.2s ease;
```

**3. New keyframes**, added alongside the existing `landing-*` ones:

```css
@keyframes ops-drawer-in {
  from { transform: translateX(28px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes ops-toast-in {
  from { transform: translateY(14px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

**4. Scoping rules**, added right after the existing `[data-landing-page]` rules (same structural pattern, `ops-dashboard` instead of `landing-page`):

```css
/* The ops dashboard ships its own sidebar and owns the full viewport, so the
   global site header would stack a second, light-themed navbar on top of it. */
body:has([data-ops-dashboard]) > header {
  display: none;
}

body:has([data-ops-dashboard]) {
  background: var(--ops-bg);
}

[data-ops-dashboard] a:focus-visible,
[data-ops-dashboard] button:focus-visible {
  outline: 2px solid var(--ops-accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  [data-ops-dashboard] *,
  [data-ops-dashboard] *::before,
  [data-ops-dashboard] *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**5. Scrollbar styling** — the mockup styled scrollbars globally (`::-webkit-scrollbar`); since this app has no other use of custom scrollbars, scope it to the dashboard too rather than changing global scrollbar appearance app-wide:

```css
[data-ops-dashboard] ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
[data-ops-dashboard] ::-webkit-scrollbar-thumb {
  background: var(--ops-border);
  border-radius: 4px;
}
[data-ops-dashboard] ::-webkit-scrollbar-track {
  background: transparent;
}
```

### `layout.tsx` change

Current file (full, for exact context):

```tsx
import type { Metadata } from "next";
import { Archivo, Bebas_Neue } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AuthStatus } from "@/components/auth-status";

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-bebas-neue",
});

export const metadata: Metadata = {
  title: "Lalamove Clone",
  description: "On-demand delivery platform — book a vehicle and move your goods across the city.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${bebasNeue.variable}`}>
      <body>
        <header className="flex items-center justify-between border-b px-6 py-3">
          <Link href="/" className="font-bold">
            Lalamove Clone
          </Link>
          <AuthStatus />
        </header>
        {children}
      </body>
    </html>
  );
}
```

Add `IBM_Plex_Mono` (the mockup used IBM Plex Sans for body text and IBM Plex Mono for numeric/mono data — pick **IBM Plex Mono** as the single new font variable to keep this addition minimal; it is applied selectively within the dashboard for numeric fields like prices/dates, while regular dashboard text uses the system font stack already used everywhere else in the app). Import it alongside the existing fonts, add its `variable`, and add its className to the `<html>` element exactly like the other two are — **never** apply it to `body` directly, matching how `--font-display`/`--font-body` are opt-in only:

```tsx
import { Archivo, Bebas_Neue, IBM_Plex_Mono } from "next/font/google";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-ibm-plex",
});
```

```tsx
<html lang="en" className={`${archivo.variable} ${bebasNeue.variable} ${ibmPlexMono.variable}`}>
```

No other change to `layout.tsx` — the header, `AuthStatus`, and metadata all stay exactly as they are (they get hidden for the ops dashboard via the CSS rule above, not by editing this component).

## Acceptance Criteria

- [ ] `globals.css` has the `--ops-*` tokens, `@theme inline` mappings, two new keyframes, and the `[data-ops-dashboard]`-scoped rules described above.
- [ ] `layout.tsx` adds `IBM_Plex_Mono` as a third opt-in font variable, applied to `<html>` alongside the existing two, never to `<body>`.
- [ ] `pnpm typecheck` and `pnpm lint` pass.
- [ ] Visually confirmed no change to any existing page (landing page, driver dashboard, account pages) — these tokens/rules are inert until a later wave adds a `data-ops-dashboard` element to the tree.

## Notes

- This task adds CSS and a font only — no component uses `data-ops-dashboard` yet, so there is nothing to visually verify beyond "nothing else changed" until task-06 lands.
