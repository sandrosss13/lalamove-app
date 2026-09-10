/**
 * The vocabulary the redesigned sign-in and sign-up flows share: the URL-state
 * codec for `role` / `type` / `mode`, the static card copy from the handoff
 * (`UI:UX/Sign-in:up/design_handoff_auth_redesign/README.md`, sections 1 and 2),
 * and the client-side validation rules its "Validation" section specifies.
 *
 * Browser-safe by construction — no Prisma, no `server-only`, no `next/headers`
 * — for the same reason `account-types.ts` and `georgian-cities.ts` are: both
 * forms are client components, so anything they import ships to the browser.
 *
 * Both forms import from here so their copy and their value set cannot drift.
 * That matters beyond tidiness: the sign-in form compares the account type the
 * user picks against the one stored at sign-up, so a divergence between the two
 * screens would silently reject valid accounts.
 */

import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/account-types";

// Re-exported so a form can take its whole flow vocabulary from one module
// rather than importing the type from `account-types` and everything else here.
// The labels stay owned by `account-types.ts`; this module never restates them.
export type { AccountType };

/**
 * The two cards step 1 offers. Deliberately narrower than the schema's
 * `UserRole`: COMPANY is not a card, it is what the Driver card resolves to
 * once the Business account type is picked, and ADMIN has no card at all (the
 * back office keeps its own screen, which step 1 only links to).
 */
export type FlowRole = "CLIENT" | "DRIVER";

/** Which of the two flows the step-1 toggle is currently pointing at. */
export type FlowMode = "signin" | "signup";

/* -------------------------------------------------------------------------- */
/* URL state                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Role and account type live in the query string (`/sign-up?role=driver&type=business`)
 * rather than in component state, so browser back/forward walks the wizard a
 * step at a time and a refresh does not dump the user back on step 1.
 *
 * The parsers are the trust boundary: a query string is user input, so they
 * return `null` for anything they do not recognise and callers treat that as
 * "this step has not been answered yet". They are case-insensitive because a
 * hand-typed or hand-edited URL is a normal way to arrive here; the serialisers
 * only ever emit lowercase, so links this app generates round-trip exactly.
 */
export function parseRole(value: string | null): FlowRole | null {
  switch (value?.toLowerCase()) {
    case "client":
      return "CLIENT";
    case "driver":
      return "DRIVER";
    default:
      return null;
  }
}

export function parseAccountType(value: string | null): AccountType | null {
  switch (value?.toLowerCase()) {
    case "individual":
      return "INDIVIDUAL";
    case "individual_entrepreneur":
      return "INDIVIDUAL_ENTREPRENEUR";
    case "business":
      return "BUSINESS";
    default:
      return null;
  }
}

export function parseMode(value: string | null): FlowMode | null {
  switch (value?.toLowerCase()) {
    case "signin":
      return "signin";
    case "signup":
      return "signup";
    default:
      return null;
  }
}

/** Lowercase serialisers — the inverse of the parsers above. */
export function roleParam(role: FlowRole): string {
  return role.toLowerCase();
}

export function accountTypeParam(accountType: AccountType): string {
  return accountType.toLowerCase();
}

export function modeParam(mode: FlowMode): string {
  return mode;
}

/**
 * The route each mode belongs to. The step-1 toggle switches mode, and because
 * the two modes are two different pages, switching it is a navigation rather
 * than a `setState` — this is the map that navigation uses (carrying whatever
 * `role`/`type` the user has already picked along in the query string).
 */
export const MODE_PATHS: Record<FlowMode, string> = {
  signin: "/sign-in",
  signup: "/sign-up",
};

/* -------------------------------------------------------------------------- */
/* Step 1 — role cards                                                        */
/* -------------------------------------------------------------------------- */

export type RoleCardContent = {
  /** The numeral in the card's badge: "01" for Client, "02" for Driver. */
  badge: string;
  /** Card headline. */
  title: string;
  /** One line on who the portal is for. */
  subtitle: string;
  /** The three selling points under the card's hairline rule. */
  benefits: readonly string[];
  /** The footer line, rendered with a trailing arrow by the card itself. */
  footer: string;
};

/**
 * Step-1 card copy, verbatim from the handoff. Note the Driver card is titled
 * "Driver or fleet": one card now covers the individual driver, the individual
 * entrepreneur and the logistics company, which is what step 2 then separates.
 */
export const ROLE_CARDS: Record<FlowRole, RoleCardContent> = {
  CLIENT: {
    badge: "01",
    title: "Client",
    subtitle: "Book deliveries for your packages",
    benefits: [
      "Instant price quote before you book",
      "Same-day delivery across Georgia",
      "Live tracking and shared receipts",
    ],
    footer: "Individual or business",
  },
  DRIVER: {
    badge: "02",
    title: "Driver or fleet",
    subtitle: "Deliver packages and earn",
    benefits: [
      "Pick jobs from the load board",
      "Weekly payouts, no monthly fee",
      "One vehicle or a whole company",
    ],
    footer: "Individual, ind. entrepreneur or company",
  },
};

/**
 * Short role names for running text — the context chip ("Client · Individual"),
 * the sign-up sub-line. Separate from `ROLE_CARDS[role].title` on purpose: a
 * chip reading "Driver or fleet · Business" is the card headline leaking into a
 * place that wants one word.
 */
export const ROLE_LABELS: Record<FlowRole, string> = {
  CLIENT: "Client",
  DRIVER: "Driver",
};

/* -------------------------------------------------------------------------- */
/* Step 2 — account type rows                                                 */
/* -------------------------------------------------------------------------- */

export type AccountTypeRow = {
  value: AccountType;
  /** The 13px line under the title. Titles come from `ACCOUNT_TYPE_LABELS`. */
  description: string;
  /**
   * Only drivers can be an individual entrepreneur — clients see two rows, not
   * three. Kept as data rather than a branch in the step component so the rule
   * lives next to the row it governs.
   */
  driverOnly: boolean;
};

export const ACCOUNT_TYPE_ROWS: readonly AccountTypeRow[] = [
  {
    value: "INDIVIDUAL",
    description: "A private person, no registration number",
    driverOnly: false,
  },
  {
    value: "INDIVIDUAL_ENTREPRENEUR",
    description: "Registered as an individual entrepreneur (ინდ. მეწარმე)",
    driverOnly: true,
  },
  {
    value: "BUSINESS",
    description: "A registered company with a VAT ID",
    driverOnly: false,
  },
];

/** The rows step 2 offers for a role, in the handoff's order. */
export function accountTypeRowsForRole(
  role: FlowRole,
): readonly AccountTypeRow[] {
  return ACCOUNT_TYPE_ROWS.filter(
    (row) => !row.driverOnly || role === "DRIVER",
  );
}

/** Title for a row. A thin alias so step 2 never hard-codes a type's wording. */
export function accountTypeLabel(accountType: AccountType): string {
  return ACCOUNT_TYPE_LABELS[accountType];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/** Georgian mobile numbers are 9 digits after the +995 country code. */
const GEORGIAN_SUBSCRIBER_DIGITS = 9;

/** Better Auth's own minimum, restated so the form can enforce it up front. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Strips a typed phone number down to the digits `isValidGeorgianPhone` expects.
 *
 * The field is presented as a fixed "+995" prefix plus a subscriber number, and
 * the placeholder ("555 12 34 56") invites spaces, so the raw value is never
 * digits-only. A pasted full number is also common, and a paste of
 * "+995 555 12 34 56" would otherwise fail validation for having 12 digits, so
 * a leading country code is dropped when it is unambiguously that — 12 digits
 * beginning `995`, which no 9-digit subscriber number can be.
 */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");

  return digits.length === GEORGIAN_SUBSCRIBER_DIGITS + 3 &&
    digits.startsWith("995")
    ? digits.slice(3)
    : digits;
}

/** True for exactly 9 digits. Expects the output of `phoneDigits`. */
export function isValidGeorgianPhone(digits: string): boolean {
  return new RegExp(`^\\d{${GEORGIAN_SUBSCRIBER_DIGITS}}$`).test(digits);
}

/**
 * A deliberately loose shape check: something, an `@`, something, a dot, a TLD.
 *
 * Anything stricter rejects real addresses, and this is not the authority
 * anyway — the server and the verification email are. Its only job is to catch
 * the typo before a round trip, so it errs towards accepting.
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** How many of the three strength-meter bars are filled. */
export type PasswordStrength = 0 | 1 | 2 | 3;

/**
 * Scores a password out of three, one point per rule, for the three-bar meter:
 *
 * 1. at least `MIN_PASSWORD_LENGTH` characters — the only rule that is also a
 *    hard requirement, so a password that fails it can never fill a bar;
 * 2. contains a digit — what the field's helper text asks for next;
 * 3. mixes upper and lower case, **or** reaches 12 characters — length is a
 *    genuine substitute for character variety, so a long all-lowercase
 *    passphrase is not scored below a short `Password1`.
 *
 * An empty field scores 0, and so does any password meeting none of the rules:
 * the meter is an encouragement, not a gate, and the field's own error text is
 * what states the actual minimum.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return 0;
  }

  const rules = [
    password.length >= MIN_PASSWORD_LENGTH,
    /\d/.test(password),
    (/[a-z]/.test(password) && /[A-Z]/.test(password)) || password.length >= 12,
  ];

  return rules.filter(Boolean).length as PasswordStrength;
}
