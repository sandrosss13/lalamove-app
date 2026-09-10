import { headers } from "next/headers";

import { SignInForm } from "@/components/auth/sign-in-form";
import { audienceForHost } from "@/lib/host";

/**
 * Sign-in entry point. The host decides which audience the page serves: the
 * merchant host accepts DRIVER/COMPANY credentials, the client host accepts
 * CLIENT credentials, and with the split disabled the page keeps the original
 * three-way portal picker. Reading the host here (rather than in the form)
 * keeps the decision server-side, so the browser never receives a portal it
 * isn't allowed to use.
 *
 * `x-forwarded-host` takes precedence over `host` because behind Vercel's
 * proxy the original hostname arrives in the forwarded header.
 *
 * The wizard's position lives in the query string (`?role=driver&type=business`,
 * plus `?step=forgot` for the password-reset screen) so browser back/forward
 * walks it a step at a time and a refresh does not dump the user back on step
 * 1. The raw values are handed straight to the form rather than parsed here:
 * the form is the only place that knows both the audience *and* the role→type
 * rules, and it has to re-derive the step on every client navigation anyway.
 *
 * Passing the params down as props rather than reading `useSearchParams()` in
 * the form keeps one source of truth and means a deep link renders the correct
 * step on the server, in its first paint. The cost is that advancing a step
 * waits on an RSC round trip; the route is already dynamic (it reads
 * `headers()`), so that request was happening regardless.
 */

/**
 * Narrows a `searchParams` entry to the single string the form's parsers
 * expect.
 *
 * A query key can legally repeat (`?role=client&role=driver`), which Next
 * surfaces as an array. That is treated exactly like an unknown value — `null`,
 * so the step counts as unanswered and the wizard falls back to the earlier
 * screen. Two contradictory answers to a one-answer question is a hand-edited
 * URL, and asking again is the honest response; silently picking one of them
 * would render a step the visitor never chose. `/sign-up` narrows the same way
 * (`singleParam`), as does `/pages/[slug]` for its `?locale=` — the two halves
 * of one flow must not disagree about what a repeated key means.
 */
function singleParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const audience = audienceForHost(host);

  const params = await searchParams;

  return (
    <SignInForm
      audience={audience}
      roleQuery={singleParam(params.role)}
      accountTypeQuery={singleParam(params.type)}
      stepQuery={singleParam(params.step)}
    />
  );
}
