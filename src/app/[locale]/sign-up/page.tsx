import { headers } from "next/headers";

import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  accountTypeRowsForRole,
  parseAccountType,
  parseRole,
  type AccountType,
  type FlowRole,
} from "@/lib/auth-flow";
import { audienceForHost, type Audience } from "@/lib/host";

/**
 * Registration entry point.
 *
 * Two jobs, both of which have to happen on the server:
 *
 * 1. Classify the requesting host — the merchant subdomain registers drivers
 *    and logistics companies, the main domain registers clients — and hand that
 *    audience to the wizard, which scopes which roles it will create. Reading
 *    the host makes this route dynamic, which it must be: the same build serves
 *    both hostnames.
 * 2. Resolve the wizard's position from `?role=` and `?type=`. The redesign
 *    keeps those two picks in the URL so browser back/forward walks the wizard
 *    a step at a time and a refresh stays put — which also means they are now
 *    user input, arriving from a hand-edited address bar as readily as from a
 *    link this app generated. Everything below treats them that way.
 *
 * `x-forwarded-host` is preferred over `host` because proxies (Vercel's edge,
 * local tunnels) rewrite `host` to the internal origin.
 */

/**
 * Which roles this host may actually create.
 *
 * Deliberately *not* the same list as the cards step 1 draws: the client host
 * shows a Driver card, but it is a link to the merchant host rather than a role
 * it can register, so `?role=driver` on the client host is a request this page
 * refuses. The form owns the card set (a presentation decision); this owns the
 * permission (a trust decision), and it is the one that has to be right.
 *
 * `"BOTH"` is the split-disabled default — every role is legitimate. `"ADMIN"`
 * falls through to the same branch, matching how the pre-redesign form treated
 * it: the back office keeps its own sign-in screen, and the admin host does not
 * route `/sign-up` here in the first place.
 */
function creatableRoles(audience: Audience): readonly FlowRole[] {
  switch (audience) {
    case "MERCHANT":
      return ["DRIVER"];
    case "CLIENT":
      return ["CLIENT"];
    default:
      return ["CLIENT", "DRIVER"];
  }
}

/**
 * Narrows a `searchParams` entry to the single string the parsers expect.
 *
 * A repeated parameter (`?role=client&role=driver`) arrives as an array, which
 * is treated exactly like an unknown value: the caller sees `null` and the step
 * counts as unanswered. Same call `/pages/[slug]` makes for its `?locale=`.
 */
function singleParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * `?role=`, or `null` when it is missing, malformed, or names a role this host
 * cannot register. All three fall back to step 1 rather than erroring: an
 * unusable URL should put the visitor at the start of the flow, not in front of
 * a message about query strings.
 */
function resolveRole(
  raw: string | string[] | undefined,
  audience: Audience,
): FlowRole | null {
  const role = parseRole(singleParam(raw));

  return role !== null && creatableRoles(audience).includes(role) ? role : null;
}

/**
 * `?type=`, or `null` when it is missing, malformed, or not offered for the
 * role in hand — `type=individual_entrepreneur&role=client` being the case that
 * matters, since only drivers can be an individual entrepreneur. Falling back
 * to `null` lands the visitor on step 2 with the role they picked intact.
 */
function resolveAccountType(
  raw: string | string[] | undefined,
  role: FlowRole,
): AccountType | null {
  const accountType = parseAccountType(singleParam(raw));

  return accountType !== null &&
    accountTypeRowsForRole(role).some((row) => row.value === accountType)
    ? accountType
    : null;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const audience = audienceForHost(host);

  const query = await searchParams;
  const role = resolveRole(query.role, audience);
  // A type without a role is meaningless — the role is what decides which types
  // are on offer — so an unanswered step 1 discards step 2's answer too.
  const accountType =
    role === null ? null : resolveAccountType(query.type, role);

  return (
    <SignUpForm audience={audience} role={role} accountType={accountType} />
  );
}
