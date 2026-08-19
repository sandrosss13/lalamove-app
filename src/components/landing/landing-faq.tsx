"use client";

import { useId, useState } from "react";

import {
  DEFAULT_HOME_PAGE_CONTENT,
  type FaqContent,
} from "@/lib/admin/home-page-content";

/**
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the questions the page ships with when the locale has no rows
 * yet — the ones a visitor actually has to answer before booking freight, in
 * the order they hit them.
 */
export function LandingFaq({
  content = DEFAULT_HOME_PAGE_CONTENT.faq,
}: {
  content?: FaqContent;
}) {
  // One panel at a time, and the first is open on arrival so the section reads
  // as answers rather than as a row of closed bars. `null` = all collapsed.
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const idPrefix = useId();

  return (
    <section
      id="faq"
      className="scroll-mt-16 border-b border-line bg-ink py-20 sm:py-28"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[20rem_1fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-paper">
            {content.heading}
          </h2>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            {content.intro}
          </p>
        </div>

        <ul className="border-t border-line">
          {content.items.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `${idPrefix}-question-${index}`;
            const panelId = `${idPrefix}-answer-${index}`;

            return (
              // Position, not question text: two entries are free to repeat a
              // question, and the open panel is already tracked by index.
              <li key={index} className="border-b border-line">
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="group flex w-full items-center justify-between gap-6 py-5 text-left"
                  >
                    <span className="font-display text-base leading-snug font-semibold text-paper transition-colors group-hover:text-accent sm:text-lg">
                      {item.question}
                    </span>
                    {/* Two bars rather than a "+"/"−" glyph: collapsing the
                        vertical one is a transition, where swapping characters
                        would be a jump. */}
                    <span
                      aria-hidden="true"
                      className="relative flex h-6 w-6 shrink-0 items-center justify-center text-muted transition-colors group-hover:text-accent"
                    >
                      <span className="absolute h-px w-3.5 bg-current" />
                      <span
                        className={`absolute h-3.5 w-px bg-current transition-transform duration-300 ${
                          isOpen ? "scale-y-0" : "scale-y-100"
                        }`}
                      />
                    </span>
                  </button>
                </h3>

                {/* Kept in the DOM and hidden with the attribute, so the panel
                    the button points at always exists for assistive tech. */}
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  hidden={!isOpen}
                  className="max-w-[62ch] pb-6 text-sm leading-relaxed text-muted"
                >
                  {item.answer}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
