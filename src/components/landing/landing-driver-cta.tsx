import Link from "next/link";

const DRIVER_POINTS = [
  "Pick up the jobs that suit your vehicle and your day.",
  "Every job shows the route and the payout before you accept.",
  "Individual, sole trader or company — all three sign up the same way.",
];

export function LandingDriverCta() {
  return (
    <section
      id="drive"
      className="relative isolate scroll-mt-16 overflow-hidden bg-ink"
    >
      {/* The skew lives on the backdrop, not the content, so nothing clips or
          reflows at narrow widths. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-8 -inset-x-8 -skew-y-2 bg-accent"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-ink/70 uppercase">
            Drive with us
          </p>
          <h2 className="mt-4 font-display text-[clamp(2.5rem,7vw,5rem)] leading-[0.88] text-ink uppercase">
            Own a van?
            <br />
            Put it to work.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-ink/80">
            Sign up as a driver, tell us your city and vehicle, and start
            accepting deliveries from clients near you.
          </p>

          <Link
            href="/sign-up"
            className="group mt-9 inline-flex items-center gap-3 bg-ink px-7 py-3.5 font-display text-2xl leading-none tracking-[0.06em] text-paper uppercase transition-transform hover:-translate-y-0.5"
          >
            Become a driver
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </Link>
        </div>

        <ul className="flex flex-col gap-4">
          {DRIVER_POINTS.map((point) => (
            <li
              key={point}
              className="flex gap-4 border-t border-ink/20 pt-4 text-sm leading-relaxed text-ink"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 bg-ink"
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
