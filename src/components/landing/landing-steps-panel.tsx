import {
  HOME_CONTAINER,
  HOME_SECTION_HEADING,
  HOME_SECTION_SPACING,
} from "@/components/landing/landing-home-styles";
import { type HowItWorksContent } from "@/lib/admin/home-page-content";
import { cn } from "@/lib/utils";

/**
 * The v4 "How it works" panel: a near-black rounded block (in both themes, per
 * the design) with the heading and a row of numbered steps. The number is the
 * step's position, not authored. Renders nothing without steps.
 */
export function LandingStepsPanel({ content }: { content: HowItWorksContent }) {
  if (content.steps.length === 0) {
    return null;
  }

  return (
    <section
      id="how"
      className={cn(HOME_CONTAINER, HOME_SECTION_SPACING, "scroll-mt-28")}
    >
      <div
        data-reveal
        className="rounded-3xl bg-home-night p-[clamp(32px,4.5vw,60px)] text-home-on-night"
      >
        <h2 className={cn(HOME_SECTION_HEADING, "mb-[clamp(28px,3.5vw,44px)]")}>
          {content.heading}
        </h2>
        <ol className="m-0 grid list-none gap-[clamp(20px,2.5vw,32px)] p-0 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {content.steps.map((step, index) => (
            <li
              key={`${index}-${step.title}`}
              className="border-t-2 border-home-on-night/16 pt-5"
            >
              <p className="m-0 mb-3.5 font-price text-[13px] tracking-[0.1em] text-home-accent">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="m-0 mb-2 text-[19px] font-semibold tracking-[-0.02em]">
                {step.title}
              </h3>
              <p className="m-0 text-[14.5px] leading-[1.6] text-pretty text-home-on-night/60">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
