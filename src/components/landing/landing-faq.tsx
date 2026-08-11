"use client";

import { useId, useState } from "react";

/**
 * The questions a visitor actually has to answer before booking freight, in the
 * order they hit them: what the number means, which truck to pick, what the
 * helper adds, who turns up, and whether they can watch it happen.
 *
 * Every answer describes behaviour this app really has — the quote endpoint, the
 * cargo/vehicle rules in `@/lib/cargo`, the order lifecycle and the per-order
 * tracking page — so the page cannot promise something the product does not do.
 */
const FAQ_ITEMS = [
  {
    question: "How is the price worked out?",
    answer:
      "We geocode both addresses and price the distance between them with the vehicle type's own rates: a base fare, a per-kilometre rate and a rate for the estimated time of the trip. A helper, if you ask for one, adds a flat fee on top. You get the total itemised, and the same calculation runs when you place the order — the estimate is not a separate marketing number.",
  },
  {
    question: "Which vehicle should I book?",
    answer:
      "Vehicles come in two duty classes, medium-duty and heavy-duty, and each cargo category only offers the classes that can take it. Furniture, appliances, retail stock and event equipment go either way; a full relocation, industrial supplies and construction materials are heavy-duty only. Every type lists its maximum payload, so you can match the rating to the load.",
  },
  {
    question: "What does adding a helper do?",
    answer:
      "A helper is a second pair of hands who rides along to load and unload with the driver. It is a flat fee on top of the distance and time components, so tick it before you price the job and it is already in the total and in the breakdown you see.",
  },
  {
    question: "Who actually moves my cargo?",
    answer:
      "An order starts out pending until a transport provider takes it. That is either an independent driver, who accepts it with one of the vehicles registered to their profile, or a logistics company, which claims the job and dispatches it to a driver on its own roster.",
  },
  {
    question: "Can I follow the delivery?",
    answer:
      "Yes. Once an order is accepted it gets its own tracking page: pickup and dropoff on a map, plus the driver's position as they report it, refreshed while you watch. The status moves from accepted to in transit to completed, and the order stays in your account afterwards.",
  },
];

export function LandingFaq() {
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
            Questions
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-paper">
            Before you book
          </h2>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            What sits behind the quote, how a vehicle is matched to the load,
            and what happens once a driver takes the job.
          </p>
        </div>

        <ul className="border-t border-line">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `${idPrefix}-question-${index}`;
            const panelId = `${idPrefix}-answer-${index}`;

            return (
              <li key={item.question} className="border-b border-line">
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
