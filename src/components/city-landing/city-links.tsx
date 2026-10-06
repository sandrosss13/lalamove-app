import { ArrowUpRight } from "lucide-react";

import { type CityLinksContent } from "@/components/city-landing/city-landing-content";
import { Link } from "@/i18n/navigation";

/**
 * Links to every other city page, each anchored with that city's own search
 * keyword ("ტვირთის გადაზიდვა ბათუმში"). This is the cluster's internal
 * linking: it gives crawlers a path between all the city pages and tells them
 * what each one is about.
 *
 * `Link` from `@/i18n/navigation`, so each target keeps the reader's locale.
 */
export function CityLinks({ content }: { content: CityLinksContent }) {
  return (
    <section
      id="cities"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div data-reveal className="mx-auto w-full max-w-[1200px]">
        <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
          {content.eyebrow}
        </p>
        <h2 className="mt-4 max-w-[20ch] font-display text-[clamp(26px,3.4vw,44px)] leading-[1.04] font-semibold tracking-[-.04em] text-balance text-paper">
          {content.heading}
        </h2>

        <ul className="mt-[clamp(24px,3vw,36px)] grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          {content.links.map((link) => (
            <li key={link.slug}>
              <Link
                href={link.href}
                className="group flex h-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px] font-display text-[16px] leading-snug font-semibold text-paper transition-colors hover:border-line-accent-strong hover:text-accent"
              >
                {link.label}
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-accent"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
