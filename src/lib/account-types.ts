/**
 * Account types shared by the sign-up and sign-in flows. Values mirror the
 * `ClientAccountType` and `DriverAccountType` Prisma enums; they are duplicated
 * here (rather than imported from `@prisma/client`) to keep the server-only
 * Prisma client out of the browser bundle — the same reasoning as
 * `georgian-cities.ts`.
 *
 * Both forms import from here so their wording and value set cannot drift: the
 * sign-in form compares the picked type against the one stored at sign-up, so a
 * divergence between the two would silently reject valid accounts.
 */

/**
 * Covers every account type across clients and drivers. Clients only ever set
 * INDIVIDUAL or BUSINESS; drivers can additionally be an
 * INDIVIDUAL_ENTREPRENEUR.
 */
export type AccountType = "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "BUSINESS";

/** Human-readable label for an account type, used in headings and messaging. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  INDIVIDUAL: "Individual",
  INDIVIDUAL_ENTREPRENEUR: "Individual Entrepreneur",
  BUSINESS: "Business",
};
