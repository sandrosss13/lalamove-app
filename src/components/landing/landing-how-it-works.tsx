import {
  DEFAULT_HOME_PAGE_CONTENT,
  type HowItWorksContent,
} from "@/lib/admin/home-page-content";

/**
 * `content` comes from the matching `HomePageSection` row when one exists, and
 * falls back to the copy the page has today when the locale has no rows yet.
 *
 * A step's displayed number is its position in the list rather than a field, so
 * reordering or removing a step in the admin form can never leave the sequence
 * reading 1, 2, 4. The list is whatever length was authored — four is the
 * seeded default, not an assumption in this markup.
 *
 * The design shows only the H2, but `eyebrow` and `aside` are still rendered:
 * both are live fields in the shipped contract and are still offered by the
 * admin form, and orphaning an editable field is a worse outcome than a
 * two-element deviation from the design. `aside` is optional in the contract,
 * so it is rendered only when a row actually carries one.
 */
export function LandingHowItWorks({
  content = DEFAULT_HOME_PAGE_CONTENT.how_it_works,
}: {
  content?: HowItWorksContent;
}) {
  return (
    <section
      id="how"
      className="scroll-mt-28 px-[clamp(20px,4vw,48px)] py-[clamp(56px,7vw,104px)]"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        {/* Two items that wrap to a stack, not an equal-width row — flex is
            correct here for the same reason as the bento's row A. */}
        <div
          data-reveal
          className="flex flex-wrap items-end justify-between gap-8"
        >
          <div>
            <p className="font-price text-[11px] tracking-[.18em] text-accent uppercase">
              {content.eyebrow}
            </p>
            <h2 className="mt-4 max-w-[20ch] font-display text-[clamp(30px,4.6vw,62px)] leading-none font-semibold tracking-[-.045em] text-balance text-paper">
              {content.heading}
            </h2>
          </div>
          {content.aside ? (
            <p className="max-w-[44ch] text-[16px] leading-[1.6] text-pretty text-muted">
              {content.aside}
            </p>
          ) : null}
        </div>

        <ol data-reveal className="mt-[clamp(36px,4vw,56px)]">
          {content.steps.map((step, index) => (
            <li
              // Position, not title: two steps are free to share a title, and
              // the list is static for the lifetime of the render.
              key={index}
              className="flex flex-wrap items-baseline gap-[clamp(18px,3vw,44px)] border-t border-line-strong py-[clamp(24px,2.8vw,34px)]"
            >
              {/* The number restates the <ol> position visually; a screen
                  reader already numbers the list, so it is hidden from one. */}
              <span
                aria-hidden="true"
                className="w-11 shrink-0 font-price text-[13px] tracking-[.1em] text-accent"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="flex-[1_1_260px] font-display text-[clamp(21px,2.4vw,30px)] leading-[1.15] font-semibold tracking-[-.03em] text-paper">
                {step.title}
              </h3>
              <p className="flex-[1_1_320px] text-[15.5px] leading-[1.65] text-pretty text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
