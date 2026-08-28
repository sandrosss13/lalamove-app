"use client";

/**
 * The post-submission status screen: pending verification, action required
 * (per-document rejection reasons plus re-upload), and approved. Rendered by
 * the shell in place of any wizard step whenever `status !== "DRAFT"`.
 *
 * Placeholder. `task-14` replaces this body with the real screen; it takes no
 * props either — `useOnboardingDraft()` already carries `status`, `reference`,
 * `documents` and `submittedSummary`.
 */
export function ApplicationStatusScreen() {
  return (
    <div className="text-sm text-muted-foreground">
      Application status — coming soon.
    </div>
  );
}
