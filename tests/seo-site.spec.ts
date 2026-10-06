import { expect, test } from "@playwright/test";

import {
  isIndexableDeployment,
  isIndexablePath,
  isMetadataAssetPath,
  requestHost,
} from "@/lib/seo/site";

/**
 * The indexing policy behind the middleware's `X-Robots-Tag`, `robots.txt` and
 * `sitemap.xml`. The costly failures here are silent in both directions: a
 * staging copy or a signed-in page in search results, or the one page meant to
 * be found (the root while gated, driver sign-up) quietly noindexed.
 *
 * Pure functions — no browser, server or database. The end-to-end header
 * behaviour is covered through the middleware in
 * `tests/under-construction.spec.ts`.
 */

test.describe("isIndexableDeployment", () => {
  test("is false on preview and development deployments", () => {
    for (const env of ["preview", "development", " Preview "]) {
      expect(isIndexableDeployment("zomo.ge", env), env).toBe(false);
    }
  });

  test("is true on production and when unset", () => {
    expect(isIndexableDeployment("zomo.ge", "production")).toBe(true);
    expect(isIndexableDeployment("zomo.ge", undefined)).toBe(true);
    expect(isIndexableDeployment(undefined, "production")).toBe(true);
  });

  test("is false on vercel.app hosts, even in production", () => {
    expect(isIndexableDeployment("lalamove-app.vercel.app", "production")).toBe(
      false,
    );
    expect(isIndexableDeployment("Foo.Vercel.App:443", "production")).toBe(
      false,
    );
  });
});

test.describe("isIndexablePath", () => {
  test("gated client host: only the root", () => {
    expect(isIndexablePath("CLIENT", "/", true)).toBe(true);
    for (const path of ["/pages/terms", "/home", "/coming-soon", "/sign-up"]) {
      expect(isIndexablePath("CLIENT", path, true), path).toBe(false);
    }
  });

  test("ungated client host: root and static pages", () => {
    for (const audience of ["CLIENT", "BOTH"] as const) {
      expect(isIndexablePath(audience, "/", false)).toBe(true);
      expect(isIndexablePath(audience, "/pages/terms", false)).toBe(true);
      for (const path of [
        "/pages/",
        "/pages",
        "/account",
        "/checkout/1",
        "/orders",
        "/sign-in",
        "/dashboard",
      ]) {
        expect(isIndexablePath(audience, path, false), path).toBe(false);
      }
    }
  });

  test("merchant host: only sign-up", () => {
    for (const gated of [true, false]) {
      expect(isIndexablePath("MERCHANT", "/sign-up", gated)).toBe(true);
      for (const path of ["/", "/dashboard", "/sign-in", "/sign-up/extra"]) {
        expect(isIndexablePath("MERCHANT", path, gated), path).toBe(false);
      }
    }
  });

  test("admin host: nothing", () => {
    for (const path of ["/", "/admin", "/sign-up", "/pages/terms"]) {
      expect(isIndexablePath("ADMIN", path, false), path).toBe(false);
    }
  });
});

test.describe("isMetadataAssetPath", () => {
  test("matches root metadata files and generated images", () => {
    for (const path of [
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/ka/opengraph-image",
      "/en/twitter-image",
      "/ka/sign-up/opengraph-image",
      "/ka/opengraph-image-1a2b3c",
      "/icon",
      "/apple-icon",
    ]) {
      expect(isMetadataAssetPath(path), path).toBe(true);
    }
  });

  test("leaves pages alone", () => {
    for (const path of [
      "/",
      "/ka",
      "/ka/sign-up",
      "/en/pages/terms",
      "/ka/opengraph-images",
      "/ka/robots.txt",
    ]) {
      expect(isMetadataAssetPath(path), path).toBe(false);
    }
  });
});

test.describe("requestHost", () => {
  test("prefers the forwarded host over the direct one", () => {
    expect(
      requestHost(
        new Headers({ host: "internal:3000", "x-forwarded-host": "zomo.ge" }),
      ),
    ).toBe("zomo.ge");
    expect(requestHost(new Headers({ host: "localhost:3000" }))).toBe(
      "localhost:3000",
    );
    expect(requestHost(new Headers())).toBeNull();
  });
});
