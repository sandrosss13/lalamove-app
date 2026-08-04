const STEPS = [
  {
    number: "01",
    title: "Set the route",
    body: "Type the pickup and dropoff — addresses autocomplete as you go — then tell us what you're moving: furniture, appliances, retail stock, or a full relocation.",
    // Staggered top margins break the row into a descending diagonal on wide
    // screens; they collapse back to a plain stack on mobile.
    offset: "",
  },
  {
    number: "02",
    title: "Lock the price",
    body: "Pick a vehicle rated for the load and we quote it on real distance, driving time and whether you need a helper. No auction, no surprise line items at the door.",
    offset: "md:mt-10",
  },
  {
    number: "03",
    title: "Track it to the door",
    body: "A nearby driver accepts the job and it goes live on your map. Follow the vehicle from loading to unload, and keep every order in your account.",
    offset: "md:mt-20",
  },
];

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="landing-grain scroll-mt-16 border-b border-line bg-ink py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-accent uppercase">
              How it works
            </p>
            <h2 className="mt-4 max-w-xl font-display text-[clamp(2.5rem,6vw,4.5rem)] leading-[0.9] text-paper uppercase">
              Three steps from kerb to kerb
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted">
            Built for the load that won&apos;t fit in a car boot — an office
            move, a pallet of stock, a machine that needs a tail lift.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className={`group relative border-l-2 border-line pl-6 transition-colors hover:border-accent ${step.offset}`}
            >
              <span className="block font-display text-6xl leading-none text-accent/40 transition-colors group-hover:text-accent sm:text-7xl">
                {step.number}
              </span>
              <h3 className="mt-5 font-display text-3xl leading-none text-paper uppercase">
                {step.title}
              </h3>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
