"use client";

import { useId, useState } from "react";
import Link from "next/link";

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

  // The support link is a matched pair in the contract: both halves are
  // optional, and a label without a destination would be a link to nowhere.
  // Read into locals so the render narrows both without a cast.
  const { supportLinkLabel, supportLinkHref } = content;

  return (
    <section
      id="faq"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-[clamp(28px,4vw,64px)]">
        <div data-reveal className="flex-[1_1_280px]">
          <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(28px,4vw,52px)] leading-[1.02] font-semibold tracking-[-.045em] text-balance text-paper">
            {content.heading}
          </h2>
          <p className="mt-5 font-display text-[15px] leading-[1.6] text-pretty text-muted">
            {content.intro}
            {supportLinkLabel && supportLinkHref ? (
              <>
                {" "}
                <Link
                  href={supportLinkHref}
                  className="text-accent underline underline-offset-4 transition-colors hover:text-accent-hover"
                >
                  {supportLinkLabel}
                </Link>
              </>
            ) : null}
          </p>
        </div>

        <ul data-reveal className="flex flex-[1_1_460px] flex-col gap-2.5">
          {content.items.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `${idPrefix}-question-${index}`;
            const panelId = `${idPrefix}-answer-${index}`;

            return (
              // Position, not question text: two entries are free to repeat a
              // question, and the open panel is already tracked by index.
              <li
                key={index}
                className="rounded-2xl border border-line bg-surface"
              >
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="group flex w-full items-center justify-between gap-6 px-6 py-5 text-left"
                  >
                    <span className="font-display text-[16px] leading-snug font-semibold text-paper transition-colors group-hover:text-accent">
                      {item.question}
                    </span>
                    {/* The design specifies a mono +/– pair rather than the
                        animated two-bar glyph this component used to draw — a
                        character swap, deliberately. */}
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-price text-[19px] leading-none text-accent"
                    >
                      {isOpen ? "–" : "+"}
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
                  className="max-w-[72ch] px-6 pb-[22px] font-display text-[15px] leading-[1.7] text-pretty text-muted"
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
