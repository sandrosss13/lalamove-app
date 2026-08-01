import Link from "next/link";

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#vehicles", label: "Vehicles" },
  { href: "#drive", label: "Become a driver" },
];

/** Wordmark used by both the landing header and footer. */
export function LandingWordmark() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 shrink-0 place-items-center bg-accent"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-ink">
          <path d="M2 10h11V5l9 7-9 7v-5H2z" />
        </svg>
      </span>
      <span className="font-display text-xl leading-none tracking-[0.06em] whitespace-nowrap text-paper uppercase sm:text-2xl">
        Lalamove<span className="text-accent">/</span>Clone
      </span>
    </Link>
  );
}

/**
 * Landing-only header. The global site header is hidden while this page is
 * mounted (see the `data-landing-page` rule in `globals.css`).
 */
export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <LandingWordmark />

        <nav
          aria-label="Landing page sections"
          className="hidden items-center gap-8 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="relative text-sm font-medium tracking-wide text-muted transition-colors hover:text-paper"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <Link
            href="/sign-in"
            className="text-sm font-semibold tracking-wide whitespace-nowrap text-paper transition-opacity hover:opacity-70"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="bg-accent px-3 py-2 font-display text-lg leading-none tracking-[0.08em] whitespace-nowrap text-ink uppercase transition-transform hover:-translate-y-0.5 sm:px-4"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
