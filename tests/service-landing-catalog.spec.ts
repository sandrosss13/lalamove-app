import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { LOCALES, type AppLocale } from "@/i18n/routing";
import {
  SERVICE_LANDING_SLUGS,
  type ServiceLandingSlug,
} from "@/lib/seo/services";

/**
 * The copy behind the service landing pages
 * (`/{locale}/momsakhureba/{service}`).
 *
 * The service-page twin of `tests/city-landing-catalog.spec.ts`, and for the
 * same reason: what goes wrong here is silent — a missing key rendered as its
 * own name, a title Google truncates, a keyword that drifts from the phrase
 * searchers type, or copy that promises something zomo does not do.
 * `tests/i18n-catalogs.spec.ts` already covers parity and blanks across every
 * namespace; this spec holds the service-specific contract.
 *
 * Read off disk (see the city spec on why). Pure — no browser, server or
 * database.
 */

const MESSAGES_DIR = join(process.cwd(), "src", "messages");

function catalogPath(locale: AppLocale): string {
  return join(MESSAGES_DIR, locale, "serviceLanding.json");
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

/**
 * The `shared` block's leaves. Copy common to every landing page (calls to
 * action, how it works…) is read from `cityLanding.shared` instead, so only
 * what is specific to the service cluster is here.
 */
const SHARED_KEYS = [
  "nav.covers",
  "nav.services",
  "covers.eyebrow",
  "otherServices.eyebrow",
  "otherServices.heading",
  "cities.eyebrow",
  "cities.heading",
  "footer.servicesTitle",
  "og.subline",
].map((key) => `shared.${key}`);

/** One service's leaves, relative to `services.<slug>`. */
const SERVICE_KEYS = [
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
  "covers.heading",
  "covers.body",
  ...numbered("covers.list", "i", 6),
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
  ...SERVICE_LANDING_SLUGS.flatMap((slug) =>
    SERVICE_KEYS.map((key) => `services.${slug}.${key}`),
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
 * Each service's search keyword (the page's H1), spelled out rather than
 * derived so a typo in the catalog cannot pass by matching itself.
 */
const KEYWORD: Record<AppLocale, Record<ServiceLandingSlug, string>> = {
  ka: {
    "binis-gadazidva": "ბინის გადაზიდვა",
    "avejis-gadazidva": "ავეჯის გადაზიდვა",
    "teqnikis-gadazidva": "საყოფაცხოვრებო ტექნიკის გადაზიდვა",
    "opisis-gadazidva": "ოფისის გადაზიდვა",
    "samsheneblo-masalebis-gadazidva": "სამშენებლო მასალების გადაზიდვა",
    mtvirtavebi: "მტვირთავების მომსახურება",
  },
  en: {
    "binis-gadazidva": "House and apartment moving",
    "avejis-gadazidva": "Furniture delivery and moving",
    "teqnikis-gadazidva": "Appliance delivery",
    "opisis-gadazidva": "Office moving",
    "samsheneblo-masalebis-gadazidva": "Building materials delivery",
    mtvirtavebi: "Movers and loaders",
  },
};

/**
 * Claims zomo cannot back: insurance, round-the-clock service, furniture
 * assembly or packing, storage, ratings, and prices (these pages make no
 * numeric price claims — the price is calculated per route).
 */
const FORBIDDEN: Record<AppLocale, RegExp> = {
  // "აწყობ" (assembly) only at a word start: as a bare substring it also hits
  // "საწყობი" (warehouse), which the copy legitimately uses.
  ka: /დაზღვ|24\/7|(^|[\s,.;:—–-])აწყობ|დაშლ|შეფუთ|შენახვ|რეიტინგ|შეფასებ|₾|ლარ[იად]/,
  en: /\b(insur\w*|assembl\w*|disassembl\w*|packing|storage|ratings?|reviews?|lari|GEL)\b|24\/7|₾/i,
};

/**
 * Fields that carry each service's own copy. Repeating one verbatim across
 * services would make the pages near-duplicates in the index.
 */
const UNIQUE_PER_SERVICE = [
  "keyword",
  "meta.title",
  "meta.description",
  "hero.subtext",
  "intro.heading",
  "intro.p1",
  "intro.p2",
  "covers.heading",
  "covers.body",
  "faq.heading",
  "closing.heading",
];

for (const locale of LOCALES) {
  test.describe(`serviceLanding catalog (${locale})`, () => {
    test.skip(
      !existsSync(catalogPath(locale)),
      `src/messages/${locale}/serviceLanding.json does not exist yet`,
    );

    const leaves = () => flatten(readCatalog(locale));
    const service = (slug: ServiceLandingSlug, key: string) =>
      leaves().get(`services.${slug}.${key}`) as string;

    test("has exactly the expected keys, all non-blank strings", () => {
      const all = leaves();
      expect([...all.keys()].sort()).toEqual(EXPECTED_KEYS);

      for (const [key, value] of all) {
        expect(typeof value, key).toBe("string");
        expect((value as string).trim(), key).not.toBe("");
      }
    });

    test("uses no ICU placeholders or rich-text tags", () => {
      for (const [key, value] of leaves()) {
        expect(value as string, key).not.toMatch(/[{}<>]/);
      }
    });

    test("makes no claims zomo cannot back", () => {
      for (const [key, value] of leaves()) {
        expect(value as string, key).not.toMatch(FORBIDDEN[locale]);
      }
    });

    test("uses the exact search keyword for every service", () => {
      for (const slug of SERVICE_LANDING_SLUGS) {
        expect(service(slug, "keyword"), slug).toBe(KEYWORD[locale][slug]);
      }
    });

    test("keeps titles and descriptions within what search shows", () => {
      for (const slug of SERVICE_LANDING_SLUGS) {
        const keyword = service(slug, "keyword");
        const title = service(slug, "meta.title");
        const description = service(slug, "meta.description");

        expect(title.startsWith(keyword), slug).toBe(true);
        expect(title.length, `${slug}: "${title}"`).toBeLessThanOrEqual(
          MAX_TITLE,
        );
        expect(description, slug).toContain(keyword);
        expect(
          description.length,
          `${slug}: "${description}"`,
        ).toBeLessThanOrEqual(MAX_DESCRIPTION);
      }
    });

    test("gives every service its own copy", () => {
      for (const key of UNIQUE_PER_SERVICE) {
        const values = SERVICE_LANDING_SLUGS.map((slug) => service(slug, key));
        expect(new Set(values).size, key).toBe(values.length);
      }
    });
  });
}
