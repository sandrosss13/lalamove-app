/**
 * Which deployments, hosts and paths search engines may index.
 *
 * One policy, consumed in three places that must never disagree:
 *
 * - `src/middleware.ts` stamps `X-Robots-Tag: noindex, nofollow` on every page
 *   response this policy does not allow — the backstop that holds even if a
 *   page's own `<meta name="robots">` is wrong or missing.
 * - `src/app/robots.ts` turns the same rules into `Allow`/`Disallow` lines.
 * - `src/app/sitemap.ts` lists exactly the URLs this policy allows.
 *
 * Like `src/lib/host.ts` and `src/lib/under-construction.ts`, this module must
 * stay importable from the Edge middleware and from `tests/`: no Prisma, no
 * `server-only`, no Node built-ins. Everything here is a pure function of its
 * arguments (env reads are default parameter values, so specs can pass their
 * own) — which is also why nothing is cached at module load.
 */

import type { Audience } from "@/lib/host";

/**
 * The hostname a request was made to. `x-forwarded-host` is what a proxy
 * (Vercel) sets to the host the browser asked for; `host` is the
 * direct-connection case (local dev). Same precedence as `src/middleware.ts`
 * and the sign-up guard in `src/lib/auth.ts`.
 */
export function requestHost(headers: Pick<Headers, "get">): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

/** The robots directive for anything this policy does not allow. */
export const ROBOTS_NOINDEX = "noindex, nofollow";

/**
 * `VERCEL_ENV` values that are never public. `preview` covers staging
 * (`test.zomo.ge`, the `staging` branch) and every per-branch deployment;
 * `development` is `vercel dev`. Unset — plain `pnpm dev`, CI — is treated as
 * indexable so local behaviour mirrors production and can be tested; nothing
 * local is reachable by a crawler anyway.
 */
const NON_PUBLIC_VERCEL_ENVS = new Set(["preview", "development"]);

/**
 * Vercel's own deployment hostnames. Even a *production* deployment answers on
 * `<project>.vercel.app`, and indexing that would publish a duplicate of the
 * real site under the wrong domain.
 */
const VERCEL_DEPLOYMENT_HOST_SUFFIX = ".vercel.app";

/**
 * Whether this deployment — and, when known, the hostname the request arrived
 * on — may be indexed at all. False on preview/development deployments and on
 * any `*.vercel.app` host; true otherwise.
 *
 * `host` is optional so a caller with no request in hand (page metadata, which
 * must not read `headers()` and give up static rendering) can still ask about
 * the deployment alone.
 */
export function isIndexableDeployment(
  host?: string | null,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  if (vercelEnv && NON_PUBLIC_VERCEL_ENVS.has(vercelEnv.trim().toLowerCase())) {
    return false;
  }

  // A `Host` header may carry a port (`localhost:3000`); only the name matters.
  const hostname = host?.trim().toLowerCase().split(":")[0];
  if (hostname?.endsWith(VERCEL_DEPLOYMENT_HOST_SUFFIX)) {
    return false;
  }

  return true;
}

/** The client host's static content pages: Terms, Privacy, About… */
const STATIC_PAGES_PREFIX = "/pages/";

/** The one merchant-host page worth finding: driver recruitment. */
const MERCHANT_INDEXABLE_PATHS = ["/sign-up"];

/**
 * Whether a page path may be indexed on a host serving `audience`.
 *
 * `pathname` is *unprefixed* — what `splitLocalePrefix` leaves — so `"/"`
 * stands for `/`, `/ka` and `/en` alike, and `"/sign-up"` for both languages'
 * sign-up page.
 *
 * - Client host (or the single shared host while the merchant split is off):
 *   while the pre-launch gate is on, only the root — which serves the "coming
 *   soon" page — so the brand and its keywords are findable before launch.
 *   Every other gated URL renders that same page and would be a duplicate.
 *   Ungated, the landing page plus the published static pages. Account,
 *   checkout, orders and the rest sit behind sign-in and are never indexed.
 * - Merchant host: only driver sign-up. The dashboard is signed-in only.
 * - Admin host: nothing, ever.
 */
export function isIndexablePath(
  audience: Audience,
  pathname: string,
  gated: boolean,
): boolean {
  switch (audience) {
    case "CLIENT":
    case "BOTH":
      if (pathname === "/") {
        return true;
      }
      return (
        !gated &&
        pathname.startsWith(STATIC_PAGES_PREFIX) &&
        pathname.length > STATIC_PAGES_PREFIX.length
      );
    case "MERCHANT":
      return MERCHANT_INDEXABLE_PATHS.includes(pathname);
    case "ADMIN":
      return false;
  }
}

/** Root-level metadata files Next generates from `src/app/*.ts`. */
const METADATA_FILES = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
]);

/**
 * File-convention metadata routes that may sit in any segment, e.g.
 * `/ka/opengraph-image` or `/en/sign-up/twitter-image`. Next appends a hash or
 * id suffix in some cases (`opengraph-image-1a2b3c`), hence the optional tail.
 */
const METADATA_IMAGE_SEGMENT =
  /^(opengraph-image|twitter-image|icon|apple-icon)(-[\w]+)?$/;

/**
 * Whether a request is for a metadata asset rather than a page. The middleware
 * lets these straight through: the pre-launch gate would otherwise rewrite
 * `/ka/opengraph-image` to the "coming soon" HTML, breaking every link preview.
 */
export function isMetadataAssetPath(pathname: string): boolean {
  if (METADATA_FILES.has(pathname)) {
    return true;
  }

  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  return METADATA_IMAGE_SEGMENT.test(lastSegment);
}
