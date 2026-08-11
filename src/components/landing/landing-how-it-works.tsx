const STEPS = [
  {
    number: "1",
    title: "Set the route",
    body: "Type the pickup and dropoff — addresses autocomplete as you go — then tell us what you're moving: furniture, appliances, retail stock, or a full relocation.",
  },
  {
    number: "2",
    title: "Lock the price",
    body: "Pick a vehicle rated for the load and we quote it on real distance, driving time and whether you need a helper. No auction, no surprise line items at the door.",
  },
  {
    number: "3",
    title: "Track it to the door",
    body: "A nearby driver accepts the job and it goes live on your map. Follow the vehicle from loading to unload, and keep every order in your account.",
  },
];

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 border-b border-line bg-surface py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-accent uppercase">
              How it works
            </p>
            <h2 className="mt-4 max-w-xl font-display text-[clamp(2rem,4.5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.025em] text-paper">
              Three steps from kerb to kerb
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            Built for the load that won&apos;t fit in a car boot — an office
            move, a pallet of stock, a machine that needs a tail lift.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className="rounded-xl border border-line bg-ink p-6 transition-transform hover:-translate-y-1"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-price text-sm leading-none font-semibold text-ink"
              >
                {step.number}
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
