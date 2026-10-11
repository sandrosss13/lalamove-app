"use client";

import { useId, useState } from "react";

import {
  HOME_ACCENT_LINK,
  HOME_CONTAINER,
  HOME_SECTION_HEADING,
} from "@/components/landing/landing-home-styles";
import { LandingLink, hasLink } from "@/components/landing/landing-link";
import { type FaqContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/** Nothing open. */
const NONE_OPEN = -1;

/**
 * The v4 FAQ: heading, intro and optional support link on the left, a
 * single-open accordion card on the right. The first item starts open;
 * clicking the open item closes it. Renders nothing without items.
 */
export function LandingFaqAccordion({ content }: { content: FaqContent }) {
  const [openIndex, setOpenIndex] = useState(0);
  const baseId = useId();

  if (content.items.length === 0) {
    return null;
  }

  return (
    <section
      id="faq"
      className={cn(HOME_CONTAINER, "scroll-mt-28 py-[clamp(56px,7vw,96px)]")}
    >
      <div className="flex flex-wrap gap-[clamp(28px,4vw,64px)]">
        <div data-reveal className="flex-[1_1_280px]">
          <h2 className={cn(HOME_SECTION_HEADING, "mb-3")}>
            {content.heading}
          </h2>
          <p className="m-0 max-w-[34ch] text-[15px] leading-[1.6] text-pretty text-home-muted">
            {content.intro}
          </p>
          {hasLink(content.supportLinkLabel, content.supportLinkHref) ? (
            <LandingLink
              href={content.supportLinkHref ?? ""}
              className={cn(HOME_ACCENT_LINK, "mt-4 inline-block")}
            >
              {content.supportLinkLabel} →
            </LandingLink>
          ) : null}
        </div>
        <div
          data-reveal
          className="min-w-0 flex-[1_1_520px] overflow-hidden rounded-[1.25rem] border border-home-line bg-home-surface"
        >
          {content.items.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `${baseId}-q${index}`;
            const panelId = `${baseId}-a${index}`;

            return (
              <div
                key={`${index}-${item.question}`}
                className="border-b border-home-line last:border-b-0"
              >
                <h3 className="m-0">
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() =>
                      setOpenIndex((current) =>
                        current === index ? NONE_OPEN : index,
                      )
                    }
                    className="flex w-full items-center justify-between gap-5 px-6 py-5 text-left text-home-ink"
                  >
                    <span className="text-[16px] font-semibold tracking-[-0.015em]">
                      {item.question}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-price text-[19px] leading-none text-home-accent-ink"
                    >
                      {isOpen ? "–" : "+"}
                    </span>
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                >
                  <p className="m-0 max-w-[72ch] px-6 pb-[22px] text-[15px] leading-[1.7] text-pretty text-home-muted">
                    {item.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
