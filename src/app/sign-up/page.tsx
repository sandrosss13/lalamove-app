import { headers } from "next/headers";

import { audienceForHost } from "@/lib/host";
import { SignUpForm } from "@/components/auth/sign-up-form";

/**
 * Registration entry point. The page itself only classifies the requesting
 * host — the merchant subdomain registers drivers and logistics companies, the
 * main domain registers clients — and hands that audience to the wizard, which
 * scopes which roles it will create. Reading the host makes this route
 * dynamic, which it must be: the same build serves both hostnames.
 *
 * `x-forwarded-host` is preferred over `host` because proxies (Vercel's edge,
 * local tunnels) rewrite `host` to the internal origin.
 */
export default async function SignUpPage() {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const audience = audienceForHost(host);

  return <SignUpForm audience={audience} />;
}
