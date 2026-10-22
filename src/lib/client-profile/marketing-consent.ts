/**
 * The rules for a client's marketing consent (`ClientProfile.marketingConsent`)
 * — "I agree to receive personalized marketing offers", answered Agree or
 * Disagree at sign-up and changeable on `/account`.
 *
 * Shared by its callers so they cannot drift apart:
 *
 * - `POST /api/client-profile` — records the answer given on the sign-up form
 *   when the profile is created.
 * - `POST /api/client-profile/marketing-consent` — the `/account` card's
 *   change.
 * - `MarketingConsentChoice` — the Agree / Disagree control both forms render,
 *   which links to the policy page named here.
 *
 * Pure and dependency-free on purpose: the forms are client components, and
 * this file is covered by `tests/marketing-consent.spec.ts` without a server.
 */

/**
 * The answer pre-selected on both forms, and the column default. The product
 * owner's explicit decision: Agree is the default choice.
 */
export const DEFAULT_MARKETING_CONSENT = true;

/**
 * The CMS static page (`StaticPage.slug`) holding the Marketing Privacy Policy.
 * Seeded, published, with placeholder copy by the
 * `20261023100000_marketing_consent` migration; staff edit it from
 * Content → Pages.
 */
export const MARKETING_PRIVACY_POLICY_SLUG = "marketing-privacy-policy";

/** Locale-less path to the policy, for the i18n `Link`. */
export const MARKETING_PRIVACY_POLICY_HREF = `/pages/${MARKETING_PRIVACY_POLICY_SLUG}`;

/** Why a submitted consent value was refused. */
export type MarketingConsentError = "notABoolean";

/**
 * Parses an optional `marketingConsent` request value:
 *
 * - absent (`undefined`) → `{ marketingConsent: undefined }` — "the request
 *   did not answer", which leaves the stored value alone. Every caller of
 *   `POST /api/client-profile` other than the sign-up form (the `/account`
 *   profile form, the driver-hub form) predates the field and must not reset
 *   it;
 * - `true` / `false` → that answer;
 * - anything else (including `null`, `"true"`, `1`) → `"notABoolean"`. The
 *   answer is a legal record, so nothing is coerced into one.
 */
export function parseMarketingConsent(
  value: unknown,
):
  { marketingConsent: boolean | undefined } | { error: MarketingConsentError } {
  if (value === undefined) {
    return { marketingConsent: undefined };
  }

  if (typeof value !== "boolean") {
    return { error: "notABoolean" };
  }

  return { marketingConsent: value };
}

/**
 * Whether an answer must be written (column + audit event). A new profile
 * always records its sign-up answer; an existing one only when the answer
 * actually changes, so re-saving the same choice does not pad the audit trail.
 * `previous` is `null` when there is no profile yet.
 */
export function shouldRecordMarketingConsent(
  previous: boolean | null,
  next: boolean,
): boolean {
  return previous === null || previous !== next;
}
