import Link from "next/link";

import { LandingWordmark } from "@/components/landing/landing-header";

/**
 * Footer link columns. `#` entries are placeholders for pages the app doesn't
 * have yet; everything else points at a real route or landing section.
 */
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
      { href: "/sign-up", label: "Driver sign-up" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#", label: "About" },
      { href: "#", label: "Careers" },
      { href: "#", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#", label: "Terms" },
      { href: "#", label: "Privacy" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="bg-ink">
      <div aria-hidden="true" className="landing-hazard h-2" />

      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <LandingWordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
              On-demand delivery — book a vehicle and move your goods across the
              city.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="font-display text-lg leading-none tracking-[0.14em] text-accent uppercase">
                  {column.title}
                </h2>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      {link.href.startsWith("/") ? (
                        <Link
                          href={link.href}
                          className="text-sm text-muted transition-colors hover:text-paper"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className="text-sm text-muted transition-colors hover:text-paper"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs tracking-wide text-muted">
            © {new Date().getFullYear()} Lalamove Clone. A demo delivery
            platform.
          </p>
          <p className="text-[0.625rem] font-semibold tracking-[0.2em] text-muted uppercase">
            Dispatch open 24/7
          </p>
        </div>
      </div>
    </footer>
  );
}
