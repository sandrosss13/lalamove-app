import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { LOCALES, type AppLocale } from "@/i18n/routing";
import { CITY_LANDING_SLUGS, type CityLandingSlug } from "@/lib/seo/cities";

/**
 * The copy behind the city landing pages (`/{locale}/gadazidva/{city}`).
 *
 * These pages exist to rank for "cargo delivery in <city>", so the things that
 * go wrong are silent search problems rather than errors: a missing key that
 * renders as its own name, a title Google truncates, a keyword that drifts
 * from the exact phrase searchers type — or, worst, wording that pitches house
 * moving, a service zomo does not offer. `tests/i18n-catalogs.spec.ts` already
 * covers parity and blanks across every namespace; this spec holds the
 * city-specific contract.
 *
 * Read off disk for the same reason as `tests/i18n-catalogs.spec.ts`
 * (Playwright's ESM loader and bare JSON imports). Pure — no browser, server
 * or database.
 */

const MESSAGES_DIR = join(process.cwd(), "src", "messages");

function catalogPath(locale: AppLocale): string {
  return join(MESSAGES_DIR, locale, "cityLanding.json");
}

function readCatalog(locale: AppLocale): unknown {
  return JSON.parse(readFileSync(catalogPath(locale), "utf8"));
}

/** Every leaf path in a value, as dotted keys, mapped to its value. */
function flatten(
  value: unknown,
  prefix = "",
  out = new Map<string, unknown>(),
): Map<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out.set(prefix, value);
  return out;
}

/** `prefix.k1 … prefix.kN` for `count` numbered keys named `k`. */
function numbered(prefix: string, key: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}.${key}${i + 1}`);
}

/** The `shared` block's leaves — the same on every city page. */
const SHARED_KEYS = [
  "breadcrumbHome",
  "hero.chipGated",
  "hero.chipTag",
  "cta.becomeDriver",
  "cta.howItWorks",
  "cta.book",
  "nav.areas",
  "nav.how",
  "nav.vehicles",
  "nav.faq",
  "nav.cities",
  "intro.eyebrow",
  "areas.eyebrow",
  "howItWorks.eyebrow",
  "howItWorks.heading",
  ...numbered("howItWorks.steps", "s", 4).flatMap((step) => [
    `${step}.title`,
    `${step}.body`,
  ]),
  "faq.eyebrow",
  "otherCities.eyebrow",
  "otherCities.heading",
  "closing.bodyGated",
  "closing.bodyLive",
  "footer.citiesTitle",
  "og.subline",
].map((key) => `shared.${key}`);

/** One city's leaves, relative to `cities.<slug>`. */
const CITY_KEYS = [
  "keyword",
  "meta.title",
  "meta.description",
  "hero.subtext",
  "intro.heading",
  "intro.p1",
  "intro.p2",
  ...numbered("why", "w", 3).flatMap((card) => [
    `${card}.title`,
    `${card}.body`,
  ]),
  "areas.heading",
  "areas.body",
  ...numbered("areas.list", "a", 6),
  "faq.heading",
  "faq.intro",
  ...numbered("faq.items", "q", 5).flatMap((item) => [
    `${item}.question`,
    `${item}.answer`,
  ]),
  "closing.heading",
];

const EXPECTED_KEYS = [
  ...SHARED_KEYS,
  ...CITY_LANDING_SLUGS.flatMap((slug) =>
    CITY_KEYS.map((key) => `cities.${slug}.${key}`),
  ),
].sort();

/**
 * The page layout appends `" | zomo"` to every title, and Google shows roughly
 * the first 60 characters — so the catalog's part may use 53 of them.
 */
const TITLE_SUFFIX = " | zomo";
const MAX_RENDERED_TITLE = 60;
const MAX_TITLE = MAX_RENDERED_TITLE - TITLE_SUFFIX.length;

/** Roughly what Google shows of a meta description before truncating it. */
const MAX_DESCRIPTION = 155;

/**
 * Each city's Georgian keyword, in the locative case searchers type
 * ("in Tbilisi" → "თბილისში"). Spelled out rather than derived so a typo in
 * the catalog cannot pass by matching itself.
 */
const KA_KEYWORD: Record<CityLandingSlug, string> = {
  tbilisi: "ტვირთის გადაზიდვა თბილისში",
  batumi: "ტვირთის გადაზიდვა ბათუმში",
  kutaisi: "ტვირთის გადაზიდვა ქუთაისში",
  rustavi: "ტვირთის გადაზიდვა რუსთავში",
  gori: "ტვირთის გადაზიდვა გორში",
  zugdidi: "ტვირთის გადაზიდვა ზუგდიდში",
};

const EN_CITY_NAME: Record<CityLandingSlug, string> = {
  tbilisi: "Tbilisi",
  batumi: "Batumi",
  kutaisi: "Kutaisi",
  rustavi: "Rustavi",
  gori: "Gori",
  zugdidi: "Zugdidi",
};

/**
 * Wording that pitches home or flat moving, which zomo does not offer — cargo
 * only. Georgian "ბინა" (flat) is matched only at a word start: as a bare
 * substring it would also hit "კაბინა" (a truck's cab), which the copy may
 * legitimately use.
 */
const FORBIDDEN: Record<AppLocale, RegExp> = {
  ka: /(^|[\s,.;:—–-])(ბინის|ბინა|ბინებ)|გადასვლ|საცხოვრებ/,
  en: /\b(house|apartment|relocat\w*|removals?)\b|home mov|moving home|flat mov/i,
};

/**
 * Fields that carry each city's own copy. Repeating one verbatim across
 * cities would make the pages near-duplicates in the index.
 */
const UNIQUE_PER_CITY = [
  "meta.title",
  "meta.description",
  "hero.subtext",
  "intro.heading",
  "intro.p1",
  "intro.p2",
  "areas.body",
];

for (const locale of LOCALES) {
  test.describe(`cityLanding catalog (${locale})`, () => {
    test.skip(
      !existsSync(catalogPath(locale)),
      `src/messages/${locale}/cityLanding.json does not exist yet`,
    );

    const leaves = () => flatten(readCatalog(locale));
    const city = (slug: CityLandingSlug, key: string) =>
      leaves().get(`cities.${slug}.${key}`) as string;

    test("has exactly the expected keys, all non-blank strings", () => {
      const all = leaves();
      expect([...all.keys()].sort()).toEqual(EXPECTED_KEYS);

      for (const [key, value] of all) {
        expect(typeof value, key).toBe("string");
        expect((value as string).trim(), key).not.toBe("");
      }
    });

    test("uses no ICU placeholders or rich-text tags", () => {
      // Pages pass these strings around as plain props; a `{city}` or `<b>`
      // would render literally.
      for (const [key, value] of leaves()) {
        expect(value as string, key).not.toMatch(/[{}<>]/);
      }
    });

    test("never pitches home or flat moving", () => {
      for (const [key, value] of leaves()) {
        expect(value as string, key).not.toMatch(FORBIDDEN[locale]);
      }
    });

    test("uses the exact search keyword for every city", () => {
      for (const slug of CITY_LANDING_SLUGS) {
        const keyword = city(slug, "keyword");
        if (locale === "ka") {
          expect(keyword, slug).toMatch(/^ტვირთის გადაზიდვა \S+ში$/);
          expect(keyword, slug).toBe(KA_KEYWORD[slug]);
        } else {
          expect(keyword, slug).toBe(`Cargo delivery in ${EN_CITY_NAME[slug]}`);
        }
      }
    });

    test("keeps titles and descriptions within what search shows", () => {
      for (const slug of CITY_LANDING_SLUGS) {
        const title = city(slug, "meta.title");
        const description = city(slug, "meta.description");

        expect(title.startsWith(city(slug, "keyword")), slug).toBe(true);
        expect(title.length, `${slug}: "${title}"`).toBeLessThanOrEqual(
          MAX_TITLE,
        );
        expect(
          description.length,
          `${slug}: "${description}"`,
        ).toBeLessThanOrEqual(MAX_DESCRIPTION);
      }
    });

    test("gives every city its own copy", () => {
      for (const key of UNIQUE_PER_CITY) {
        const values = CITY_LANDING_SLUGS.map((slug) => city(slug, key));
        expect(new Set(values).size, key).toBe(values.length);
      }
    });
  });
}
