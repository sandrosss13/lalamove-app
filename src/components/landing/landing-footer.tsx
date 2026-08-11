import Link from "next/link";

import { LandingWordmark } from "@/components/landing/landing-header";
import { merchantOrigin } from "@/lib/host";

/**
 * Driver registration lives on the merchant host: the landing page is
 * client-host-only, where `/sign-up` only offers CLIENT registration. Falls
 * back to a relative `/sign-up` when the split is disabled. `merchantOrigin()`
 * resolves to a value that's constant for the lifetime of the page in both
 * server and browser contexts, so it is safe to resolve at module scope.
 */
const DRIVER_SIGN_UP_HREF = merchantOrigin()
  ? `${merchantOrigin()}/sign-up`
  : "/sign-up";

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
      { href: DRIVER_SIGN_UP_HREF, label: "Driver sign-up" },
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

/**
 * Dark bookend that closes the page. The driver CTA directly above uses the
 * same `ink-strong` background, so the two read as one continuous panel — hence
 * no rule or divider at the top edge, only a hairline seam inside the panel.
 * Text color is set once on the section so `LandingWordmark`, which inherits
 * `currentColor`, flips to the on-dark tone without a footer-specific variant.
 */
export function LandingFooter() {
  return (
    <footer className="landing-grain border-t border-on-strong/10 bg-ink-strong text-on-strong">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <LandingWordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-on-strong/70">
              On-demand delivery — book a vehicle and move your goods across the
              city.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <h2 className="text-[0.6875rem] font-semibold tracking-[0.16em] text-on-strong/50 uppercase">
                  {column.title}
                </h2>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      {link.href.startsWith("/") ? (
                        <Link
                          href={link.href}
                          className="text-sm text-on-strong/70 transition-colors hover:text-on-strong"
                        >
                          {link.label}
                        </Link>
                      ) : (
                        <a
                          href={link.href}
                          className="text-sm text-on-strong/70 transition-colors hover:text-on-strong"
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

        <div className="mt-16 flex flex-col gap-3 border-t border-on-strong/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-on-strong/50">
            © {new Date().getFullYear()} Lalamove Clone. A demo delivery
            platform.
          </p>
          <p className="flex items-center gap-2 text-[0.625rem] font-semibold tracking-[0.2em] text-on-strong/60 uppercase">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
            />
            Dispatch open 24/7
          </p>
        </div>
      </div>
    </footer>
  );
}
