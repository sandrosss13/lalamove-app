/**
 * Which `/api/auth/*` paths the catch-all route refuses before Better Auth sees
 * them.
 *
 * `@better-auth/expo` registers an unauthenticated
 * `GET /expo-authorization-proxy` that redirects to any https URL it is handed
 * — an open redirect this app has no use for, since it enables no social
 * providers. `isBlockedAuthPath` is the whole decision the route makes, so it
 * is pinned here as a pure function: the route itself imports `@/lib/auth`,
 * which needs a database, and `DATABASE_URL` on this project is production
 * (see `playwright.config.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { isBlockedAuthPath } from "@/lib/mobile-api/blocked-auth-paths";

test.describe("isBlockedAuthPath", () => {
  test("blocks the expo authorization proxy", () => {
    expect(isBlockedAuthPath("/api/auth/expo-authorization-proxy")).toBe(true);
  });

  const bypassAttempts: Record<string, string> = {
    "a trailing slash": "/api/auth/expo-authorization-proxy/",
    "several trailing slashes": "/api/auth/expo-authorization-proxy///",
    "a doubled slash": "/api/auth//expo-authorization-proxy",
    "upper case": "/api/auth/EXPO-AUTHORIZATION-PROXY",
    "mixed case": "/api/auth/Expo-Authorization-Proxy",
    "an encoded hyphen": "/api/auth/expo%2Dauthorization%2Dproxy",
    "a lower-case encoded hyphen": "/api/auth/expo%2dauthorization-proxy",
    "an encoded letter": "/api/auth/%65xpo-authorization-proxy",
    "a fully encoded segment":
      "/api/auth/%65%78%70%6F%2D%61%75%74%68%6F%72%69%7A%61%74%69%6F%6E%2D%70%72%6F%78%79",
    "double encoding": "/api/auth/expo%252Dauthorization%252Dproxy",
    "triple encoding": "/api/auth/expo%25252Dauthorization-proxy",
    "encoding nested past the decode limit":
      "/api/auth/expo%25252525252525252Dauthorization-proxy",
    "an encoded slash before it": "/api/auth%2Fexpo-authorization-proxy",
    "an encoded trailing slash": "/api/auth/expo-authorization-proxy%2F",
    "a dot segment": "/api/auth/./expo-authorization-proxy",
    "a parent segment": "/api/auth/x/../expo-authorization-proxy",
    "an extra trailing segment": "/api/auth/expo-authorization-proxy/x",
    "a matrix parameter": "/api/auth/expo-authorization-proxy;x=1",
    "a malformed escape beside it": "/api/auth/%zzexpo-authorization-proxy%",
    "encoding plus case": "/api/auth/EXPO%2dAuthorization%2DPROXY/",
  };

  for (const [attempt, pathname] of Object.entries(bypassAttempts)) {
    test(`still blocks it behind ${attempt}`, () => {
      expect(isBlockedAuthPath(pathname)).toBe(true);
    });
  }

  for (const pathname of [
    "/api/auth/sign-in/email",
    "/api/auth/sign-up/email",
    "/api/auth/sign-out",
    "/api/auth/get-session",
    "/api/auth/ok",
    "/api/auth/",
    "/api/auth/expo",
    "/api/auth/authorization-proxy",
    // A malformed escape on an unrelated path must not throw or block.
    "/api/auth/get-session%",
    "/api/auth/sign-in/email%zz",
  ]) {
    test(`lets ${pathname} through`, () => {
      expect(isBlockedAuthPath(pathname)).toBe(false);
    });
  }
});

test.describe("src/app/api/auth/[...all]/route.ts", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/auth/[...all]/route.ts"),
    "utf8",
  );

  // The matcher only protects a method whose handler runs it. A method added
  // later as a bare `betterAuthHandlers.X` export would skip the block.
  test("guards every method it exports", () => {
    const exported = [...source.matchAll(/^export const (\w+) = (\w+)\(/gm)];

    expect(exported.map(([, method]) => method).sort()).toEqual([
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]);

    for (const [, method, wrapper] of exported) {
      expect(wrapper, `${method} must be wrapped`).toBe("guarded");
    }
  });
});
