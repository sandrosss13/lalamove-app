import Link from "next/link";

const NAV_LINKS = [
  { href: "#ship", label: "What we carry" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#vehicles", label: "Vehicles" },
  { href: "#faq", label: "FAQ" },
];

/**
 * Wordmark shared by the light header and the dark footer bookend, so it
 * inherits its text color from whichever section renders it instead of pinning
 * one that would be unreadable in the other.
 */
export function LandingWordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-ink">
          <path d="M2 10h11V5l9 7-9 7v-5H2z" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap sm:text-xl">
        Lalamove<span className="text-accent">/</span>Clone
      </span>
    </Link>
  );
}

/**
 * Landing-only header. The global site header is hidden while this page is
 * mounted (see the `data-landing-page` rule in `globals.css`).
 *
 * Two tiers: a slim utility strip over the main nav row. The header sticks with
 * a negative offset equal to the strip's height, so the strip scrolls away and
 * only the 4rem nav row stays pinned — which is the offset every section's
 * `scroll-mt-16` already assumes.
 */
export function LandingHeader() {
  return (
    <header className="sticky -top-10 z-50">
      <div className="h-10 border-b border-line bg-surface">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <a
            href="#drive"
            className="text-[0.625rem] font-semibold tracking-[0.16em] text-muted uppercase transition-colors hover:text-paper sm:text-[0.6875rem]"
          >
            For transport providers
          </a>

          <div className="flex shrink-0 items-center gap-3 text-xs">
            <Link
              href="/sign-in"
              className="font-medium text-muted transition-colors hover:text-paper"
            >
              Sign in
            </Link>
            <span aria-hidden="true" className="h-3 w-px bg-line" />
            <Link
              href="/sign-up"
              className="font-semibold text-paper transition-opacity hover:opacity-70"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b border-line bg-ink/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-5 sm:px-8">
          <LandingWordmark />

          <nav
            aria-label="Landing page sections"
            className="hidden items-center gap-7 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm text-muted transition-colors hover:text-paper"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <Link
            href="/sign-up"
            className="ml-auto shrink-0 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-paper transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
