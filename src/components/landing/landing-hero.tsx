import Link from "next/link";

import { VEHICLE_TYPE_GROUPS } from "@/lib/vehicle-types";

const VEHICLE_TYPE_COUNT = VEHICLE_TYPE_GROUPS.reduce(
  (total, group) => total + group.options.length,
  0,
);

const HERO_STATS = [
  { value: String(VEHICLE_TYPE_COUNT), label: "Vehicle types" },
  { value: String(VEHICLE_TYPE_GROUPS.length), label: "Fleet categories" },
  { value: "24/7", label: "Dispatch window" },
];

/**
 * Illustrative quote card. Clearly labelled as a sample so it never reads as a
 * live order — the real quote comes from the booking form after sign-in.
 */
function SampleQuoteTicket() {
  return (
    <div className="animate-rise [animation-delay:520ms] relative lg:rotate-2">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-2 translate-y-2 border border-line"
      />
      <article className="landing-grain relative border border-line bg-surface">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="font-display text-lg leading-none tracking-[0.14em] text-muted uppercase">
            Sample quote
          </span>
          <span className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            Dispatch
          </span>
        </header>

        <div className="flex gap-4 px-5 py-6">
          <div aria-hidden="true" className="flex flex-col items-center pt-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-accent" />
            <span className="my-1 w-px flex-1 bg-line" />
            <span className="h-2.5 w-2.5 bg-accent" />
          </div>

          <dl className="flex flex-1 flex-col gap-5 text-sm">
            <div>
              <dt className="text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase">
                Pickup
              </dt>
              <dd className="mt-1 text-paper">Rustaveli Ave 12, Tbilisi</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase">
                Dropoff
              </dt>
              <dd className="mt-1 text-paper">
                Aghmashenebeli Ave 88, Tbilisi
              </dd>
            </div>
          </dl>
        </div>

        <dl className="grid grid-cols-3 border-t border-line">
          <div className="border-r border-line px-5 py-4">
            <dt className="text-[0.625rem] font-semibold tracking-[0.18em] text-muted uppercase">
              Vehicle
            </dt>
            <dd className="mt-1 font-display text-xl leading-none text-paper uppercase">
              Box truck
            </dd>
          </div>
          <div className="border-r border-line px-5 py-4">
            <dt className="text-[0.625rem] font-semibold tracking-[0.18em] text-muted uppercase">
              Distance
            </dt>
            <dd className="mt-1 font-display text-xl leading-none text-paper uppercase">
              8.4 km
            </dd>
          </div>
          <div className="px-5 py-4">
            <dt className="text-[0.625rem] font-semibold tracking-[0.18em] text-muted uppercase">
              Total
            </dt>
            <dd className="mt-1 font-display text-xl leading-none text-accent uppercase">
              $24.60
            </dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-ink">
      <div
        aria-hidden="true"
        className="landing-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-accent/25 blur-[130px]"
      />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pt-16 pb-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:pt-24 lg:pb-28">
        <div>
          <p className="animate-rise flex items-center gap-3 text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
            <span aria-hidden="true" className="h-px w-8 bg-accent sm:w-12" />
            On-demand freight &amp; courier
          </p>

          <h1 className="animate-rise [animation-delay:120ms] mt-5 font-display text-[clamp(3.25rem,11vw,7.5rem)] leading-[0.85] tracking-[0.01em] text-paper uppercase">
            Move anything
            <br />
            across the{" "}
            <span className="relative inline-block text-accent">
              city
              <span
                aria-hidden="true"
                className="animate-wipe [animation-delay:900ms] absolute right-0 -bottom-1 left-0 h-1.5 origin-left bg-accent"
              />
            </span>
          </h1>

          <p className="animate-rise [animation-delay:260ms] mt-7 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
            Set a pickup and a dropoff, pick the vehicle that fits the load, and
            get a price before you book. A nearby driver takes the job — you
            watch it move on the map until it lands.
          </p>

          <div className="animate-rise [animation-delay:380ms] mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/sign-up"
              className="group inline-flex items-center gap-3 bg-accent px-7 py-3.5 font-display text-2xl leading-none tracking-[0.06em] text-ink uppercase transition-transform hover:-translate-y-0.5"
            >
              Get started
              <span
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center border border-line px-7 py-3.5 font-display text-2xl leading-none tracking-[0.06em] text-paper uppercase transition-colors hover:border-accent hover:text-accent"
            >
              Sign in
            </Link>
          </div>

          <dl className="animate-rise [animation-delay:460ms] mt-12 grid max-w-lg grid-cols-3 gap-px border border-line bg-line">
            {HERO_STATS.map((stat) => (
              <div key={stat.label} className="bg-ink px-4 py-4 sm:px-5">
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block font-display text-3xl leading-none text-accent sm:text-4xl">
                    {stat.value}
                  </span>
                  <span className="mt-2 block text-[0.625rem] font-semibold tracking-[0.16em] text-muted uppercase">
                    {stat.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <SampleQuoteTicket />
      </div>
    </section>
  );
}
