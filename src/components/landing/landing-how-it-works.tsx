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
 * reading 1, 2, 4.
 */
export function LandingHowItWorks({
  content = DEFAULT_HOME_PAGE_CONTENT.how_it_works,
}: {
  content?: HowItWorksContent;
}) {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 border-b border-line bg-surface py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-accent uppercase">
              {content.eyebrow}
            </p>
            <h2 className="mt-4 max-w-xl font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.025em] text-paper">
              {content.heading}
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            {content.aside}
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {content.steps.map((step, index) => (
            <li
              // Position, not title: two steps are free to share a title, and
              // the list is static for the lifetime of the render.
              key={index}
              className="rounded-xl border border-line bg-ink p-6 transition-transform hover:-translate-y-1"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-price text-sm leading-none font-semibold text-ink"
              >
                {index + 1}
              </span>
              <h3 className="mt-5 font-display text-lg leading-snug font-semibold tracking-[-0.01em] text-paper">
                {step.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
