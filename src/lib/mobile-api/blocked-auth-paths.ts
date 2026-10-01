/**
 * Better Auth endpoints that are registered by a plugin but must not be
 * reachable in this app. `src/app/api/auth/[...all]/route.ts` answers 404 for
 * them before Better Auth sees the request.
 *
 * Today that is one endpoint: `@better-auth/expo`'s
 * `GET /expo-authorization-proxy`. It is unauthenticated, and its only checks
 * on the `authorizationURL` query parameter are "https", "no `#`" and "not this
 * origin" — so it redirects a visitor to any https site an attacker names
 * (an open redirect on our own domain) and stores an attacker-chosen
 * `oauthState` in the `oauth_state` cookie on the way. Its one legitimate job
 * is to start a social-provider OAuth flow from the native app, and this app
 * enables no social providers.
 *
 * **Revisit this if social login is ever enabled**: the native OAuth flow needs
 * the endpoint, so it would have to be unblocked — behind a check that
 * `authorizationURL` points at a configured provider — rather than left open.
 *
 * No runtime imports, so `tests/mobile-api-blocked-auth-paths.spec.ts` pins the
 * matcher without a server.
 */

/** Lower-case endpoint names, matched anywhere in the normalised pathname. */
const BLOCKED_AUTH_ENDPOINTS = ["expo-authorization-proxy"] as const;

/**
 * How many rounds of percent-decoding to attempt. A path still changing after
 * this many is nested-encoded on purpose, and is refused rather than trusted.
 */
const MAX_DECODE_ROUNDS = 5;

const PERCENT_ESCAPE = /%([0-9a-f]{2})/gi;

/**
 * Percent-decodes byte by byte. Unlike `decodeURIComponent` this never throws
 * on a malformed sequence — it leaves what it cannot decode in place — and a
 * blocked name is plain ASCII, so byte-wise decoding is all the match needs.
 */
function decodeOnce(value: string): string {
  return value.replace(PERCENT_ESCAPE, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

/**
 * Whether a request pathname addresses a blocked Better Auth endpoint.
 *
 * Deliberately over-matches: the pathname is percent-decoded until it stops
 * changing and lower-cased, and then the blocked name is looked for *anywhere*
 * in it. Trailing slashes, doubled slashes, case changes, encoded characters
 * (single or nested) and extra segments therefore cannot route around the
 * block — and no real endpoint has the name as a substring, so nothing
 * legitimate is caught. Whatever the router downstream would or would not have
 * matched, a URL that spells the name does not reach it.
 */
export function isBlockedAuthPath(pathname: string): boolean {
  let decoded = pathname;

  for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
    const next = decodeOnce(decoded);

    if (next === decoded) {
      const normalised = decoded.toLowerCase();

      return BLOCKED_AUTH_ENDPOINTS.some((name) => normalised.includes(name));
    }

    decoded = next;
  }

  // Still decoding after MAX_DECODE_ROUNDS: nobody encodes a path that deeply
  // by accident.
  return true;
}
