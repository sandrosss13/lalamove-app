"use client";

/**
 * The four steps, verbatim from the design's own `RAIL` array — minus "OTP" in
 * step 1's sub-copy, which this feature drops along with the SMS code screen
 * (see `requirements.md`'s Non-Goals).
 *
 * Exported because the welcome screen's outline list is the same four entries;
 * it lives here rather than in the shell so the shell can import it without the
 * rail having to import back from the shell.
 */
export const ONBOARDING_RAIL = [
  { step: 1, label: "Authorisation & personal", sub: "Phone, ID, city, photo" },
  {
    step: 2,
    label: "Licence verification",
    sub: "Photos, number, expiry, categories",
  },
  {
    step: 3,
    label: "Vehicle registration",
    sub: "Body, class, make, plate, capacity",
  },
  { step: 4, label: "Review & status", sub: "Submit, pending, approved" },
] as const;

/**
 * The wizard's left rail: the four steps, their sub-copy, and which one is
 * current. Purely presentational — it neither reads the draft context nor
 * decides where a click goes, so the shell stays the single place navigation
 * is defined.
 *
 * `currentStep` is the whole-number step (1–4), not the shell's screen number:
 * step 3's sub-screens are all "3" as far as the rail is concerned.
 */
export function OnboardingStepRail({
  currentStep,
  onSelect,
}: {
  currentStep: number;
  onSelect: (step: number) => void;
}) {
  return (
    <nav
      aria-label="Application progress"
      className="flex w-full flex-col gap-4 border-b border-border bg-card p-6 md:h-full md:w-[300px] md:shrink-0 md:border-r md:border-b-0 md:px-[22px] md:py-[26px]"
    >
      <h2 className="font-price text-[10.5px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
        Application progress
      </h2>

      {ONBOARDING_RAIL.map((entry) => {
        const done = currentStep > entry.step;
        const active = currentStep === entry.step;

        return (
          <button
            key={entry.step}
            type="button"
            onClick={() => onSelect(entry.step)}
            aria-current={active ? "step" : undefined}
            className="flex cursor-pointer items-start gap-3 rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full font-price text-[11px] font-bold ${
                active
                  ? "bg-onboarding-accent text-white"
                  : done
                    ? "bg-primary text-primary-foreground"
                    : "bg-border text-muted-foreground"
              }`}
            >
              {entry.step}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-[13.5px] font-semibold ${
                  active ? "text-onboarding-accent" : "text-foreground"
                }`}
              >
                {entry.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-muted-foreground">
                {entry.sub}
              </span>
            </span>
          </button>
        );
      })}

      <p className="mt-auto hidden border-t border-border pt-3.5 text-[11.5px] leading-[1.55] text-muted-foreground md:block">
        Every field validates on continue. Documents flagged in the admin
        console come back here for re-upload.
      </p>
    </nav>
  );
}
