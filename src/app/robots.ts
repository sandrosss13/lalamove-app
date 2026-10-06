import type { MetadataRoute } from "next";
import { headers } from "next/headers";

import { audienceForHost, clientOrigin, merchantOrigin } from "@/lib/host";
import { isIndexableDeployment, requestHost } from "@/lib/seo/site";

/**
 * `/robots.txt`, one per host. All three hosts share one deployment, so the
 * file is built per request from the `Host` header (hence `headers()`, which
 * makes this route dynamic — it is a few hundred bytes and crawlers cache it).
 *
 * Mirrors the indexing policy in `src/lib/seo/site.ts`; the middleware's
 * `X-Robots-Tag` header is the enforcement, this file is the crawl-budget
 * hint. `src/middleware.ts` excludes `.txt` from its matcher, so neither the
 * locale layer nor the pre-launch gate ever sees this path.
 */

/**
 * Signed-in and transactional areas of the client host. Each starts with a
 * `*` path segment standing in for the locale, because every page lives under
 * `/ka` or `/en`.
 */
const CLIENT_DISALLOW = [
  "/api/",
  "/*/account",
  "/*/checkout",
  "/*/orders",
  "/*/wallet",
  "/*/home",
  "/*/change-password",
  "/*/dashboard",
  "/*/admin",
  "/*/sign-in",
];

/** The merchant host's only indexable page: driver sign-up, both languages. */
const MERCHANT_ALLOW = ["/ka/sign-up", "/en/sign-up"];

const DISALLOW_EVERYTHING: MetadataRoute.Robots = {
  rules: { userAgent: "*", disallow: "/" },
};

function sitemapUrl(origin: string): string {
  return `${origin}/sitemap.xml`;
}

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = requestHost(await headers());

  if (!isIndexableDeployment(host)) {
    return DISALLOW_EVERYTHING;
  }

  switch (audienceForHost(host)) {
    case "CLIENT":
    case "BOTH":
      return {
        rules: { userAgent: "*", allow: "/", disallow: CLIENT_DISALLOW },
        sitemap: sitemapUrl(clientOrigin()),
      };
    case "MERCHANT": {
      const origin = merchantOrigin();
      // Unreachable in practice — "MERCHANT" implies the split is configured —
      // but failing closed is the safe answer if it ever is not.
      if (!origin) {
        return DISALLOW_EVERYTHING;
      }
      return {
        // Google and Bing resolve Allow/Disallow by the most specific match, so
        // the two sign-up pages stay crawlable under the blanket Disallow.
        rules: { userAgent: "*", allow: MERCHANT_ALLOW, disallow: "/" },
        sitemap: sitemapUrl(origin),
      };
    }
    case "ADMIN":
      return DISALLOW_EVERYTHING;
  }
}
