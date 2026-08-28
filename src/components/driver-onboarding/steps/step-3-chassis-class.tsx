"use client";

/**
 * Step 3a/3b — cargo body type, then vehicle class. Both sub-screens live in
 * this one component; the shell routes to it on
 * `ONBOARDING_SCREENS.vehicleBodyAndClass`, and its own Continue hands off to
 * `ONBOARDING_SCREENS.vehicleTechnical` for 3c.
 *
 * Placeholder. `task-11` replaces this body with the real step; the signature
 * is already final — every step reads and writes through `useOnboardingDraft()`
 * rather than props, so the shell never has to change again once it lands.
 */
export function Step3ChassisClass() {
  return (
    <div className="text-sm text-muted-foreground">Step 3 — coming soon.</div>
  );
}
