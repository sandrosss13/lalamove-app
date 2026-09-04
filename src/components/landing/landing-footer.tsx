import Link from "next/link";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  type FooterContent,
} from "@/lib/admin/home-page-content";
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
 * Sentinel href a CMS editor can put on any footer link to mean "wherever
 * drivers register on this deployment". It exists because that destination is
 * deployment *configuration*, not content — it depends on whether the
 * client/merchant host split is enabled, which no content manager can know.
 * This is the same reasoning `DriverCtaContent` already documents for why the
 * driver CTA's button target is deliberately not editable.
 *
 * Deliberately not a valid URL, so it can never be mistaken for one and can
 * never resolve to something real if the substitution is ever removed.
 */
const DRIVER_SIGN_UP_SENTINEL = "@driver-sign-up";

/**
 * Token the `copyright` line may contain, replaced with the current year at
 * render time. Documented on `FooterContent` in the shared contract: it keeps
 * the whole line editable without an editor having to remember to bump the year
 * every January.
 */
const YEAR_TOKEN = "{year}";

/**
 * Inert for every href but the sentinel, so nothing breaks while the shipped
 * defaults still point driver sign-up at a plain `/sign-up`.
 */
function resolveHref(href: string): string {
  return href === DRIVER_SIGN_UP_SENTINEL ? DRIVER_SIGN_UP_HREF : href;
}

/**
 * One rule for how a CMS href becomes an element, matching the nav pill:
 * `/…` is an in-app route and gets `next/link`; anything else (a `#anchor`, an
 * absolute URL on the merchant host, a `mailto:`) is a plain `<a>`, which is
 * also the only correct element for a cross-origin target.
 */
function FooterLink({ href, label }: { href: string; label: string }) {
  const resolved = resolveHref(href);
  const className = "text-subtle transition-colors hover:text-paper";

  if (resolved.startsWith("/")) {
    return (
      <Link href={resolved} className={className}>
        {label}
      </Link>
    );
  }

  const isExternal =
    resolved.startsWith("http://") || resolved.startsWith("https://");

  return (
    <a
      href={resolved}
      className={className}
      rel={isExternal ? "noreferrer" : undefined}
    >
      {label}
    </a>
  );
}

/**
 * The page's closing grid footer.
 *
 * `content` is optional and falls back to the shipped defaults, matching every
 * other landing section — the page renders correctly with zero CMS rows. Empty
 * `columns` or `legalLinks` render an empty region rather than throwing.
 *
 * Stays a server component: it has no interactivity, and the year substitution
 * is a render-time read that belongs on the server.
 */
export function LandingFooter({
  content = DEFAULT_HOME_PAGE_CONTENT.footer,
}: {
  content?: FooterContent;
}) {
  const copyright = content.copyright.replaceAll(
    YEAR_TOKEN,
    String(new Date().getFullYear()),
  );

  return (
    <footer className="border-t border-line px-[clamp(20px,4vw,48px)] pt-[clamp(44px,5vw,72px)] pb-9">
      <div className="mx-auto max-w-[1200px]">
        {/*
          ONE grid for the brand block and the link columns, with the brand
          block spanning every track. This is load-bearing, not cosmetic: with
          five children in an `auto-fit` track list the brand takes a track of
          its own and the last link column is orphaned onto the next row. Giving
          the brand the full row (`col-span-full` compiles to
          `grid-column: 1 / -1`) leaves the link columns to resolve into equal
          tracks. Do not split this into nested grids or a flex row.
        */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-7">
          <div className="col-span-full">
            <p className="text-[18px] font-bold tracking-[-0.02em] text-paper">
              {content.brandName}
            </p>
            <p className="mt-3 max-w-[30ch] text-[14px] leading-relaxed text-faint">
              {content.brandBlurb}
            </p>
          </div>

          {content.columns.map((column) => (
            // Position is not stable across CMS edits but the title is what the
            // heading and the landmark label both read from, so it is the
            // meaningful identity here.
            <nav key={column.title} aria-label={column.title}>
              <h2 className="font-price text-[10px] tracking-[0.18em] text-faintest uppercase">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-[11px] text-[14px]">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}-${link.href}`}>
                    <FooterLink href={link.href} label={link.label} />
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-[clamp(32px,4vw,56px)] flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-6 font-price text-[11px] tracking-[0.08em] text-faintest">
          {/* Printed verbatim apart from `{year}`: it is authored copy, so a
              content manager stays able to correct every other word of it. */}
          <p>{copyright}</p>

          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {content.legalLinks.map((link, index) => (
              <li
                key={`${link.label}-${link.href}`}
                className="flex items-center gap-x-3"
              >
                {/* Separator between entries only, and decorative — the list
                    semantics already say these are separate items. */}
                {index > 0 ? <span aria-hidden="true">·</span> : null}
                <FooterLink href={link.href} label={link.label} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
