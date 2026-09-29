import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { LOCALES, type AppLocale } from "@/i18n/routing";

const MESSAGES_DIR = join(process.cwd(), "src", "messages");

/**
 * Read off disk rather than imported through `src/messages/<locale>/index.ts`.
 *
 * Two reasons, one practical and one not: Playwright's ESM loader rejects a
 * bare JSON import without an `with { type: "json" }` attribute that the Next
 * bundler does not want, and reading the directory means these specs see a
 * namespace file that exists but was never added to the barrel — which is
 * exactly the mistake that ships a whole section untranslated.
 */
function readCatalogs(locale: AppLocale): Record<string, unknown> {
  const dir = join(MESSAGES_DIR, locale);
  const catalogs: Record<string, unknown> = {};

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    catalogs[file.replace(/\.json$/, "")] = JSON.parse(
      readFileSync(join(dir, file), "utf8"),
    );
  }

  return catalogs;
}

const ka = readCatalogs("ka");
const en = readCatalogs("en");

/**
 * The catalogs are the one part of this feature that a person edits by hand,
 * thousands of entries at a time, across `src/messages/ka` and
 * `src/messages/en`. Everything that can go wrong there is silent at runtime:
 * `next-intl` renders a missing key as the key itself, so an untranslated
 * string ships looking like `driverHub.loads.emptyState` and nobody sees it
 * until a customer does.
 *
 * These specs are the net. Pure functions over the catalogs read above — no
 * browser, no database, no server (see `playwright.config.ts` on why the suite
 * has no second runner).
 */

/** Every leaf path in a catalog, as dotted keys: `loads.emptyState.title`. */
function flatten(
  value: unknown,
  prefix = "",
  out = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === "string") {
    out.set(prefix, value);
    return out;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }

  return out;
}

/**
 * ICU placeholders in a message: `{count}`, `{name, number}`, `{n, plural, …}`.
 * Only the argument name is captured — the format and the plural branches are
 * allowed to differ between languages, and for Georgian they often must.
 */
function placeholders(message: string): Set<string> {
  return new Set(
    [...message.matchAll(/\{\s*(\w+)/g)].map((match) => match[1] ?? ""),
  );
}

const kaMessages = flatten(ka);
const enMessages = flatten(en);

test("both locales hold the same namespaces", () => {
  expect(Object.keys(ka).sort()).toEqual(Object.keys(en).sort());
  expect(LOCALES).toHaveLength(2);
});

test("every namespace file is wired into its locale's barrel", () => {
  // A catalog the barrel does not import is dead weight: `next-intl` never sees
  // it and every key in it renders as its own name.
  for (const locale of LOCALES) {
    const barrel = readFileSync(join(MESSAGES_DIR, locale, "index.ts"), "utf8");

    const missing = Object.keys(readCatalogs(locale)).filter(
      (namespace) => !barrel.includes(`from "./${namespace}.json"`),
    );

    expect({ locale, missing: missing.sort() }).toEqual({
      locale,
      missing: [],
    });
  }
});

test("no key exists in one locale but not the other", () => {
  // Reported as two sorted lists rather than a boolean: when this fails, the
  // failure message should be the to-do list for fixing it.
  const missingFromKa = [...enMessages.keys()]
    .filter((key) => !kaMessages.has(key))
    .sort();
  const missingFromEn = [...kaMessages.keys()]
    .filter((key) => !enMessages.has(key))
    .sort();

  expect({ missingFromKa, missingFromEn }).toEqual({
    missingFromKa: [],
    missingFromEn: [],
  });
});

test("no message is blank", () => {
  // An empty string is what a half-finished translation pass leaves behind, and
  // it renders as nothing at all rather than as a visible missing-key marker.
  const blank: string[] = [];

  for (const [locale, messages] of [
    ["ka", kaMessages],
    ["en", enMessages],
  ] as const) {
    for (const [key, value] of messages) {
      if (value.trim() === "") {
        blank.push(`${locale}: ${key}`);
      }
    }
  }

  expect(blank.sort()).toEqual([]);
});

test("a message's ICU placeholders match across locales", () => {
  // A placeholder dropped in translation is not a typo — `next-intl` throws on
  // a message whose arguments it cannot satisfy, so this is a runtime error in
  // one language and not the other.
  const mismatched: string[] = [];

  for (const [key, kaValue] of kaMessages) {
    const enValue = enMessages.get(key);
    if (enValue === undefined) continue;

    const kaArgs = [...placeholders(kaValue)].sort();
    const enArgs = [...placeholders(enValue)].sort();

    if (kaArgs.join(",") !== enArgs.join(",")) {
      mismatched.push(`${key} — ka: [${kaArgs}] en: [${enArgs}]`);
    }
  }

  expect(mismatched.sort()).toEqual([]);
});

/**
 * Messages the translator deliberately left identical to English: example
 * emails and plates, brand and model names, config identifiers, and a few
 * code fragments the extractor picked up. Translating any of these would be
 * the bug, so they are named here rather than weakening the check below.
 */
const IDENTICAL_BY_DESIGN = new Set([
  "admin.adminContentVehiclePhotos.pnpmExecPrismaDbSeed",
  "admin.adminNav.crm",
  "admin.bannerFormDialog.homeHero",
  "admin.createSystemUserDialog.staffExampleCom",
  "admin.homePageContent.recordRecord",
  "admin.homePageSectionFormDialog.url",
  "admin.messagingTemplateFormDialog.orderConfirmed",
  "admin.translationFormDialog.heroTitle",
  "common.shared.34Abc128",
  "common.shared.driverExampleCom",
  "common.shared.slug",
  "common.shared.vehicletypePricingruleBasefare",
  "common.shared.youCompanyGe",
  "driverHub.driversAddPanel.9955xxXxxXxx",
  "driverHub.employeesInviteForm.nameGizocargoGe",
  "driverHub.fleetAvailabilityFormat.blockStart",
  "driverHub.vehiclesAddForm.ford",
  "driverHub.vehiclesAddForm.transitCustom",
  "fleet.step1CompanyDetails.dispatchCompanyGe",
  "fleet.vehicleEditorDialog.booleanPromise",
  "home.addCardDialog.cvc",
]);

test("Georgian copy is actually in Georgian", () => {
  // A key left at its English value is the most common way a translation pass
  // silently skips something. Messages that are legitimately identical in both
  // languages — a brand name, a currency code, an abbreviation — are the
  // exception, so this only flags values that contain a *word*: three or more
  // Latin letters in a row, and no Mkhedruli anywhere.
  const untranslated: string[] = [];

  for (const [key, value] of kaMessages) {
    if (IDENTICAL_BY_DESIGN.has(key)) continue;
    const hasGeorgian = /[Ⴀ-ჿ]/.test(value);
    const hasLatinWord = /[A-Za-z]{3,}/.test(value);

    if (!hasGeorgian && hasLatinWord && enMessages.get(key) === value) {
      untranslated.push(key);
    }
  }

  expect(untranslated.sort()).toEqual([]);
});
