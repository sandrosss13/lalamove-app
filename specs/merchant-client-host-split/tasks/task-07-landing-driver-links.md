# Task 07: Point driver-acquisition CTAs at the merchant host

## Status

complete

## Wave

2

## Description

The landing page's driver-acquisition funnel — the "Become a driver" button and the footer's "Driver sign-up" link — currently point at `/sign-up`. The landing page itself is client-only (its `/` route is redirected away from the merchant host by the middleware from task-02), and under the split from task-04, `/sign-up` on the client host only ever offers CLIENT registration — so a driver following either link today would hit a dead end once the split is enabled. Both links need to become absolute links to the merchant host's `/sign-up` when the split is on, and continue pointing at plain `/sign-up` when it's off (today's exact behavior). Every *other* link on the landing page (the general "Sign in"/"Create an account" links, the hero CTA, the quote calculator, the header) is client-audience and must NOT be touched — this task's scope is exactly these two driver-specific links.

## Dependencies

**Depends on:** task-01-host-detection-and-auth-config.md
**Blocks:** None

**Context from dependencies:** task-01 creates `src/lib/host.ts`, exporting `merchantOrigin(): string | null` — a static, deployment-level value (not per-request), safe to call directly in a server component (or even at module scope) without opting into dynamic rendering. Both files this task modifies are already plain server components (no `"use client"` directive, no hooks) — they can call `merchantOrigin()` directly. When the split is disabled (default, until task-08 sets `NEXT_PUBLIC_MERCHANT_HOST`), `merchantOrigin()` returns `null`, so both fixes below fall back to today's exact `/sign-up` behavior.

## Files to Modify

- `src/components/landing/landing-driver-cta.tsx` — the "Become a driver" button.
- `src/components/landing/landing-footer.tsx` — the "Driver sign-up" footer link.

## Technical Details

### `src/components/landing/landing-driver-cta.tsx` — current relevant code (read the full file before editing)

```tsx
import Link from "next/link";

const DRIVER_POINTS = [/* ...unchanged... */];

export function LandingDriverCta() {
  return (
    <section id="drive" /* ...unchanged... */>
      {/* ...unchanged... */}
      <Link
        href="/sign-up"
        className="group mt-9 inline-flex items-center gap-3 bg-ink px-7 py-3.5 font-display text-2xl leading-none tracking-[0.06em] text-paper uppercase transition-transform hover:-translate-y-0.5"
      >
        Become a driver
        {/* ...arrow icon, unchanged... */}
      </Link>
      {/* ...unchanged... */}
    </section>
  );
}
```

### The fix

```tsx
import Link from "next/link";

import { merchantOrigin } from "@/lib/host";

const DRIVER_POINTS = [/* ...unchanged... */];

export function LandingDriverCta() {
  const driverSignUpHref = merchantOrigin() ? `${merchantOrigin()}/sign-up` : "/sign-up";

  return (
    <section id="drive" /* ...unchanged... */>
      {/* ...unchanged... */}
      <Link
        href={driverSignUpHref}
        className="group mt-9 inline-flex items-center gap-3 bg-ink px-7 py-3.5 font-display text-2xl leading-none tracking-[0.06em] text-paper uppercase transition-transform hover:-translate-y-0.5"
      >
        Become a driver
        {/* ...arrow icon, unchanged... */}
      </Link>
      {/* ...unchanged... */}
    </section>
  );
}
```

Everything else in this file — `DRIVER_POINTS`, the section markup, styling — is unchanged.

### `src/components/landing/landing-footer.tsx` — current relevant code (read the full file before editing)

```tsx
import Link from "next/link";

import { LandingWordmark } from "@/components/landing/landing-header";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#how-it-works", label: "How it works" },
      { href: "#vehicles", label: "Vehicles" },
      { href: "/sign-up", label: "Create an account" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  {
    title: "Drivers",
    links: [
      { href: "#drive", label: "Become a driver" },
      { href: "/sign-up", label: "Driver sign-up" }, // <-- this entry changes
    ],
  },
  { title: "Company", links: [/* unchanged, all "#" placeholders */] },
  { title: "Legal", links: [/* unchanged, all "#" placeholders */] },
];

export function LandingFooter() {
  return (
    <footer className="bg-ink">
      {/* ... */}
      {FOOTER_COLUMNS.map((column) => (
        <nav key={column.title} aria-label={column.title}>
          {/* ... */}
          <ul className="mt-4 flex flex-col gap-2.5">
            {column.links.map((link) => (
              <li key={`${column.title}-${link.label}`}>
                {link.href.startsWith("/") ? (
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-paper">
                    {link.label}
                  </Link>
                ) : (
                  <a href={link.href} className="text-sm text-muted transition-colors hover:text-paper">
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      ))}
      {/* ... */}
    </footer>
  );
}
```

Note the existing branch: `link.href.startsWith("/")` renders a Next `<Link>` (client-side navigation), otherwise a plain `<a>`. This is actually exactly the right behavior for a cross-origin merchant URL too — an absolute `https://merchant.example.com/sign-up` doesn't start with `/`, so it will automatically render as a plain `<a>` (a full page load, correct for crossing origins) without any change to that branching logic.

### The fix

`FOOTER_COLUMNS` is currently a module-level constant built outside the component. Since `merchantOrigin()` is also a static, module-scope-safe call (not per-request), move the "Driver sign-up" href into a small named constant and reference it in the array — keep `FOOTER_COLUMNS` itself at module scope, structured the same way as today:

```tsx
import Link from "next/link";

import { LandingWordmark } from "@/components/landing/landing-header";
import { merchantOrigin } from "@/lib/host";

const DRIVER_SIGN_UP_HREF = merchantOrigin() ? `${merchantOrigin()}/sign-up` : "/sign-up";

const FOOTER_COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#how-it-works", label: "How it works" },
      { href: "#vehicles", label: "Vehicles" },
      { href: "/sign-up", label: "Create an account" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  {
    title: "Drivers",
    links: [
      { href: "#drive", label: "Become a driver" },
      { href: DRIVER_SIGN_UP_HREF, label: "Driver sign-up" },
    ],
  },
  { title: "Company", links: [/* unchanged */] },
  { title: "Legal", links: [/* unchanged */] },
];
```

The `"Create an account"` and `"Sign in"` entries in the `"Product"` column stay exactly as `/sign-up` and `/sign-in` — those are general client-audience links and must not change. The `"#drive"` in-page anchor in the `"Drivers"` column is untouched. No other file in `landing/` changes as part of this task.

## Acceptance Criteria

- [ ] With `NEXT_PUBLIC_MERCHANT_HOST` unset, both links resolve to plain `/sign-up`, identical to today.
- [ ] With `NEXT_PUBLIC_MERCHANT_HOST` set, both links resolve to `${merchantOrigin()}/sign-up` (an absolute URL to the merchant host).
- [ ] Every other landing-page link (`"Create an account"`, `"Sign in"`, `"How it works"`, `"Vehicles"`, `"#drive"`, and anything in `landing-header.tsx`/`landing-hero.tsx`/`landing-quote-calculator.tsx`) is unmodified by this task.
- [ ] `pnpm lint && pnpm typecheck` pass.
