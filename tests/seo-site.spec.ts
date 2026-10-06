import { expect, test } from "@playwright/test";

import {
  isIndexableDeployment,
  isIndexablePath,
  isMetadataAssetPath,
  requestHost,
} from "@/lib/seo/site";
import {
  CITY_LANDING_GEORGIAN_CITY,
  CITY_LANDING_SLUGS,
  cityLandingPath,
  isCityLandingPath,
  isCityLandingSlug,
} from "@/lib/seo/cities";
import {
  breadcrumbJsonLd,
  cityServiceJsonLd,
  faqPageJsonLd,
} from "@/lib/seo/json-ld";

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
  test("gated client host: only the root and the city pages", () => {
    expect(isIndexablePath("CLIENT", "/", true)).toBe(true);
    for (const slug of CITY_LANDING_SLUGS) {
      const path = cityLandingPath(slug);
      expect(isIndexablePath("CLIENT", path, true), path).toBe(true);
    }
    for (const path of [
      "/pages/terms",
      "/home",
      "/coming-soon",
      "/sign-up",
      "/gadazidva",
      "/gadazidva/atlantis",
      "/gadazidva/tbilisi/extra",
    ]) {
      expect(isIndexablePath("CLIENT", path, true), path).toBe(false);
    }
  });

  test("ungated client host: root, city and static pages", () => {
    for (const audience of ["CLIENT", "BOTH"] as const) {
      expect(isIndexablePath(audience, "/", false)).toBe(true);
      expect(isIndexablePath(audience, "/pages/terms", false)).toBe(true);
      expect(isIndexablePath(audience, "/gadazidva/batumi", false)).toBe(true);
      for (const path of [
        "/gadazidva/atlantis",
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
      for (const path of [
        "/",
        "/dashboard",
        "/sign-in",
        "/sign-up/extra",
        "/gadazidva/tbilisi",
      ]) {
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
      "/ka/gadazidva/tbilisi/opengraph-image",
      "/en/gadazidva/batumi/twitter-image",
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

test.describe("city landing routes", () => {
  test("builds and recognises exactly the known city paths", () => {
    expect(cityLandingPath("tbilisi")).toBe("/gadazidva/tbilisi");
    for (const slug of CITY_LANDING_SLUGS) {
      expect(isCityLandingSlug(slug), slug).toBe(true);
      expect(isCityLandingPath(cityLandingPath(slug)), slug).toBe(true);
      expect(CITY_LANDING_GEORGIAN_CITY[slug], slug).toBe(slug.toUpperCase());
    }
    for (const value of ["", "Tbilisi", "atlantis", "poti"]) {
      expect(isCityLandingSlug(value), value).toBe(false);
    }
    for (const path of [
      "/gadazidva",
      "/gadazidva/",
      "/gadazidva/tbilisi/",
      "/gadazidva/tbilisi/x",
      "/ka/gadazidva/tbilisi",
      "/xgadazidva/tbilisi",
    ]) {
      expect(isCityLandingPath(path), path).toBe(false);
    }
  });
});

test.describe("city landing JSON-LD", () => {
  const origin = "https://zomo.ge";
  const pageUrl = "https://zomo.ge/ka/gadazidva/batumi";

  test("describes the service in one city, provided by the organisation", () => {
    expect(
      cityServiceJsonLd(origin, pageUrl, {
        name: "Cargo delivery in Batumi",
        description: "d",
        cityName: "Batumi",
        countryName: "Georgia",
      }),
    ).toEqual({
      "@type": "Service",
      "@id": `${pageUrl}#service`,
      serviceType: "Cargo delivery",
      name: "Cargo delivery in Batumi",
      description: "d",
      url: pageUrl,
      provider: { "@id": "https://zomo.ge/#organization" },
      areaServed: {
        "@type": "City",
        name: "Batumi",
        containedInPlace: { "@type": "Country", name: "Georgia" },
      },
    });
  });

  test("numbers breadcrumb items from one", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Home", url: "https://zomo.ge/ka" },
        { name: "City", url: pageUrl },
      ]),
    ).toEqual({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://zomo.ge/ka",
        },
        { "@type": "ListItem", position: 2, name: "City", item: pageUrl },
      ],
    });
  });

  test("maps FAQ items to questions with accepted answers", () => {
    const faq = faqPageJsonLd(pageUrl, [{ question: "Q?", answer: "A." }]);
    expect(faq).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Q?",
          acceptedAnswer: { "@type": "Answer", text: "A." },
        },
      ],
    });
  });
});
