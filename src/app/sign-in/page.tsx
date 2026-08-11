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
 */
export default async function SignInPage() {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const audience = audienceForHost(host);

  return <SignInForm audience={audience} />;
}
