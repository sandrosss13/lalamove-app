import Link from "next/link";

import { merchantOrigin } from "@/lib/host";

const DRIVER_POINTS = [
  "Take the loads that suit your vehicle, your payload rating and your day.",
  "Every job shows the route, the cargo and the payout before you accept.",
  "Driving your own truck or running a fleet — both sign up here.",
];

export function LandingDriverCta() {
  // The landing page is client-host-only, and `/sign-up` there only offers
  // CLIENT registration — so a driver has to be sent across to the merchant
  // host. When the split is disabled, this stays a plain relative `/sign-up`.
  const origin = merchantOrigin();
  const driverSignUpHref = origin ? `${origin}/sign-up` : "/sign-up";

  return (
    <section
      id="drive"
      className="relative isolate scroll-mt-16 overflow-hidden bg-ink-strong"
    >
      {/* The skew lives on the backdrop, not the content, so nothing clips or
          reflows at narrow widths. */}
      <div
        aria-hidden="true"
        className="absolute inset-y-8 -inset-x-8 -skew-y-2 bg-accent"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-ink-strong/70 uppercase">
            For transport providers
          </p>
          <h2 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.025em] text-ink-strong">
            Own a truck?
            <br />
            Put it to work.
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-ink-strong/80">
            Sign up as a driver or a logistics company, register your vehicles,
            and start accepting freight jobs from shippers near you.
          </p>

          <Link
            href={driverSignUpHref}
            className="group mt-9 inline-flex items-center gap-2.5 rounded-lg bg-ink-strong px-6 py-3.5 text-[0.9375rem] leading-none font-semibold text-on-strong transition-transform hover:-translate-y-0.5"
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
              className="flex gap-4 border-t border-ink-strong/20 pt-4 text-sm leading-relaxed text-ink-strong"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink-strong"
              />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
