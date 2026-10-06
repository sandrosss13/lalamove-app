import { type CityIntroContent } from "@/components/city-landing/city-landing-content";

/**
 * The city page's introduction: what zomo does in this city, then three short
 * reasons to use it. This is the page's main body of unique, city-specific
 * copy, so it sits directly under the hero.
 *
 * Built from the same tokens and type scale as the landing sections it sits
 * between (the FAQ's heading block, the coverage chips' cards), so it reads as
 * one more section of the same page rather than as a new design.
 */
export function CityIntro({ content }: { content: CityIntroContent }) {
  return (
    <section
      id="intro"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-[clamp(32px,3.6vw,52px)]">
        <div
          data-reveal
          className="flex flex-wrap items-start justify-between gap-[clamp(20px,4vw,64px)]"
        >
          <div className="flex-[1_1_320px]">
            <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
              {content.eyebrow}
            </p>
            <h2 className="mt-4 max-w-[18ch] font-display text-[clamp(28px,4vw,52px)] leading-[1.06] font-semibold tracking-[-.045em] text-balance text-paper">
              {content.heading}
            </h2>
          </div>

          <div className="flex flex-[1_1_380px] flex-col gap-4">
            {content.paragraphs.map((paragraph, index) => (
              <p
                // Position, not text: the list is static for the render.
                key={index}
                className="max-w-[62ch] text-[16px] leading-[1.7] text-pretty text-muted"
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <ul
          data-reveal
          className="grid gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
        >
          {content.whyCards.map((card, index) => (
            <li
              key={index}
              className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-[clamp(22px,2.4vw,30px)]"
            >
              {/* Decorative ordinal in the landing's mono accent, matching the
                  how-it-works numbering; the list already conveys order. */}
              <span
                aria-hidden="true"
                className="font-price text-[13px] tracking-[.1em] text-accent"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display text-[clamp(18px,1.8vw,21px)] leading-[1.2] font-semibold tracking-[-.02em] text-paper">
                {card.title}
              </h3>
              <p className="text-[15px] leading-[1.65] text-pretty text-muted">
                {card.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
