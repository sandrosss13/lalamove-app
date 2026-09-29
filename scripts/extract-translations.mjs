/* eslint-disable no-console -- This script's output IS its interface: the
   per-namespace counts are how anyone learns what was extracted and how much is
   left. console.warn would put a routine report on stderr and read as a
   failure. Same rationale as scripts/migrate-deploy.mjs. */

/**
 * Pulls every user-visible English string out of `src/` into `translation/`,
 * the folder a translator actually works in.
 *
 * Run it with `node scripts/extract-translations.mjs`. It is re-runnable and
 * non-destructive: a key that already has Georgian in `translation/` keeps it,
 * so running this again after a feature lands adds the new strings and leaves
 * finished work alone. Nothing under `src/messages` is touched — that is what
 * `scripts/import-translations.mjs` is for.
 *
 * This is a heuristic extractor, not a compiler. It reads the source with
 * regexes rather than a TypeScript AST, which is the right trade for a one-time
 * sweep of a codebase this size but means two things are true:
 *
 *   - It over-collects. A handful of validation messages and internal errors
 *     come along for the ride. Translating one of those is harmless.
 *   - It under-collects. A string built by concatenation, or one sitting in a
 *     shape this file does not look for, will be missed. Those surface during
 *     the code-wiring pass, when a literal has no key to replace it with.
 *
 * Neither is a reason to hand-maintain the list instead: the alternative is a
 * person reading 380 files.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "translation");

/**
 * Which namespace a source file's strings belong to. Order matters — the first
 * match wins, so the specific patterns are above the general ones.
 *
 * These are the same 16 namespaces as `src/messages/<locale>/`, because that is
 * where the finished translations land.
 */
const NS_RULES = [
  [/^src\/components\/driver-hub\//, "driverHub"],
  [/^src\/components\/admin\//, "admin"],
  [/^src\/app\/\[locale\]\/admin\//, "admin"],
  [/^src\/app\/\[locale\]\/\(admin-sign-in\)\//, "admin"],
  [/^src\/lib\/admin\//, "admin"],
  [/^src\/components\/landing\//, "landing"],
  [/^src\/components\/home\//, "home"],
  [/^src\/lib\/home\//, "home"],
  [/^src\/components\/auth\//, "auth"],
  [/^src\/app\/\[locale\]\/(sign-in|sign-up|change-password)\//, "auth"],
  [/^src\/lib\/auth/, "auth"],
  [/^src\/components\/fleet-onboarding\//, "fleet"],
  [/^src\/lib\/fleet-onboarding\//, "fleet"],
  [/^src\/components\/driver-onboarding\//, "onboarding"],
  [/^src\/lib\/driver-onboarding\//, "onboarding"],
  [/^src\/app\/\[locale\]\/checkout\//, "checkout"],
  [/^src\/app\/\[locale\]\/orders\//, "orders"],
  [/^src\/components\/order-/, "orders"],
  [/^src\/lib\/orders\//, "orders"],
  [/^src\/app\/\[locale\]\/wallet\//, "wallet"],
  [/^src\/components\/wallet\//, "wallet"],
  [/^src\/app\/\[locale\]\/account\//, "account"],
  [/^src\/components\/account-/, "account"],
  [/^src\/app\/\[locale\]\/dashboard\//, "dashboard"],
  [/^src\/lib\/dashboard\//, "dashboard"],
  [/^src\/app\/api\//, "errors"],
  [/^src\/lib\/georgian-cities/, "cities"],
  [/^src\/lib\/format-city/, "cities"],
  [/^src\/components\/ui\//, "common"],
  [/^src\/app\/\[locale\]\/\(public\)\//, "common"],
];

const nsFor = (rel) => NS_RULES.find(([re]) => re.test(rel))?.[1] ?? "common";

/** JSX attributes whose value is shown to a person. */
const TEXT_PROPS =
  "placeholder|label|title|aria-label|alt|description|heading|subtitle|summary|hint|cta|emptyState|helpText|caption|legend|tooltip";

/** Object-literal fields that hold copy (nav definitions, column headers, …). */
const OBJ_FIELDS =
  "label|title|description|message|heading|subtitle|summary|hint|cta|emptyState|helpText|caption|name|text|error|blurb|body|question|answer|region|placeholder|note|warning|subtext|helper|tagline|eyebrow|footnote";

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/**
 * Whether a captured string is copy rather than code.
 *
 * The JSX sweep below matches everything between `>` and `<`, and in TypeScript
 * those are also generics and comparison operators — so `useState<Foo>(null);
 * const [a, b] = …` looks exactly like a text node. Most of this function
 * exists to throw that back.
 */
function looksLikeCopy(text) {
  const t = text.trim();

  if (t.length < 2 || t.length > 400) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  // Enum members (`TBILISI`, `IN_TRANSIT`, `DRY_BOX`) are all-caps and either
  // long or underscored; real acronyms a user reads (`CVC`, `VAT`, `PO`) are
  // short and not. Length is a crude line but it puts every value of every
  // enum in this schema on one side and every acronym in the UI on the other.
  if (/^[A-Z0-9_]+$/.test(t) && (t.includes("_") || t.length > 5)) return false;
  if (/^[a-z0-9-]+$/.test(t) && !t.includes(" ")) return false; // slug / identifier
  if (/^(https?:|\/|\.\/|@\/|#|data:|mailto:)/.test(t)) return false;
  if (/^[\w.-]+\.(tsx?|jsx?|json|css|png|jpe?g|svg|webp)$/.test(t))
    return false;
  if (/^[a-z-]+\/[a-z-]+$/.test(t)) return false; // mime type / path
  if (
    /(^|\s)(flex|grid|rounded|text-|bg-|px-|py-|gap-|min-h|max-w|w-full|border)/.test(
      t,
    ) &&
    !/[.!?]/.test(t)
  )
    return false; // tailwind class list
  if (/^\d+(\.\d+)?(px|rem|%|s|ms)?$/.test(t)) return false;

  // Code signals. Real UI copy essentially never contains these.
  if (/[;={}[\]]/.test(t)) return false;
  if (/=>|\)\s*:|&&|\|\||\?\?/.test(t)) return false;
  if (
    /\b(const|let|var|function|return|await|async|typeof|instanceof|null|undefined|use[A-Z]\w+)\b/.test(
      t,
    )
  )
    return false;
  // Leading punctuation is usually a code fragment (`) : cond ? (`, `& Partial`)
  // but a handful of real labels open with a decorative mark — "← New order",
  // "+ Add card", "· Offline", "— open load details". Those are allowed through
  // by name; everything else that does not start with a word character is not.
  if (!/^[A-Za-z0-9₾“"'(]/.test(t) && !/^[+←→·—–•]\s*\S/.test(t)) return false;

  // Developer diagnostics naming environment variables — only ever read in a
  // server log, never by a user.
  if (/[A-Z][A-Z0-9]+_[A-Z0-9_]+/.test(t)) return false;

  return true;
}

/** A readable camelCase key derived from the English text itself. */
function slugKey(text) {
  const words = text
    .toLowerCase()
    .replace(/\{[^}]*\}/g, " ") // ICU placeholders carry no meaning in a key
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

  if (!words.length) return "text";

  return words
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
}

/**
 * A group name for one source file.
 *
 * `page.tsx`, `layout.tsx` and `route.ts` carry no information in their own
 * name — there are 15 files called `page.tsx` and 60-odd called `route.ts` — so
 * those are named after their directory path instead. Route groups `(admin)`
 * and dynamic segments `[id]` are dropped: routing syntax, not subject matter.
 */
function fileSlug(rel) {
  const camel = (name) =>
    name
      .split(/[-_.]/)
      .filter(Boolean)
      .map((w, i) =>
        i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1),
      )
      .join("");

  const base = path.basename(rel).replace(/\.(tsx?|jsx?)$/, "");

  if (["page", "layout", "route", "index"].includes(base)) {
    const segments = path
      .dirname(rel)
      .replace(/^src\/app\/\[locale\]\//, "")
      .replace(/^src\/app\/api\//, "")
      .replace(/^src\/(components|lib)\//, "")
      .split("/")
      .filter((seg) => seg && !/^[([]/.test(seg));

    if (segments.length) {
      return segments
        .map((seg, i) => {
          const c = camel(seg);
          return i === 0 ? c : c[0].toUpperCase() + c.slice(1);
        })
        .join("");
    }
  }

  return camel(base.replace(/\.(client|server)$/, ""));
}

// ---------------------------------------------------------------------------

const files = execSync(
  "find src -name '*.tsx' -o -name '*.ts' | grep -v '/i18n/' | grep -v '/messages/'",
  { cwd: ROOT, encoding: "utf8" },
)
  .trim()
  .split("\n");

/** key -> { ns, en, files:Set<string> } */
const entries = new Map();

for (const rel of files) {
  const source = stripComments(readFileSync(path.join(ROOT, rel), "utf8"));
  const ns = nsFor(rel);
  const slug = fileSlug(rel);
  const found = new Set();

  // A negated character class already spans newlines, so one flat quantifier
  // handles Prettier-wrapped text — and unlike a nested one it cannot backtrack
  // exponentially, which an earlier version of this regex did.
  for (const m of source.matchAll(/>([^<>{}]+)</g)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (looksLikeCopy(t)) found.add(t);
  }
  for (const m of source.matchAll(
    new RegExp(`(?:${TEXT_PROPS})="([^"]+)"`, "g"),
  )) {
    if (looksLikeCopy(m[1])) found.add(m[1]);
  }
  for (const m of source.matchAll(
    new RegExp(`(?:${OBJ_FIELDS})\\s*:\\s*"([^"]+)"`, "g"),
  )) {
    if (looksLikeCopy(m[1])) found.add(m[1]);
  }
  for (const m of source.matchAll(/(?:new Error|Error)\(\s*"([^"]+)"/g)) {
    if (looksLikeCopy(m[1])) found.add(m[1]);
  }

  for (const text of found) {
    const stem = `${ns}.${slug}.${slugKey(text)}`;
    let key = stem;
    let n = 2;
    while (entries.has(key) && entries.get(key).en !== text)
      key = `${stem}${n++}`;

    if (!entries.has(key)) entries.set(key, { ns, en: text, files: new Set() });
    entries.get(key).files.add(rel);
  }
}

/**
 * Strings that appear in more than one file move to `common.shared`.
 *
 * "Unauthorized." is in 44 route handlers and "Cancel" on 27 buttons. Left in
 * place they would be 300-odd separate rows asking a person to translate the
 * same word over and over, and — worse — to translate it *differently* by
 * accident. One key each, one answer each.
 */
const byText = new Map();
for (const [key, entry] of entries) {
  if (!byText.has(entry.en)) byText.set(entry.en, []);
  byText.get(entry.en).push(key);
}

let hoisted = 0;
for (const [text, keys] of byText) {
  const touched = new Set(keys.flatMap((k) => [...entries.get(k).files]));
  if (touched.size < 2) continue;

  // `cities` never gives its strings up. Tbilisi, Batumi, Kutaisi and Rustavi
  // are each named twice — once in `georgian-cities.ts` and again in the
  // landing page's default copy — so the plain rule would move exactly the four
  // best-known cities out of the city list into `common`, leaving a 52-row
  // cities file that looks finished while missing the capital. Computed before
  // the delete below, which is what makes the namespaces unreadable.
  const home = keys.some((k) => entries.get(k).ns === "cities")
    ? "cities"
    : "common";
  const group = home === "cities" ? "georgianCities" : "shared";

  for (const key of keys) entries.delete(key);

  const stem = `${home}.${group}.${slugKey(text)}`;
  let key = stem;
  let n = 2;
  while (entries.has(key) && entries.get(key).en !== text)
    key = `${stem}${n++}`;
  entries.set(key, { ns: home, en: text, files: touched });
  hoisted++;
}

// ---------------------------------------------------------------------------
// Write one file per namespace, preserving any Georgian already written.

mkdirSync(OUT_DIR, { recursive: true });

const byNamespace = new Map();
for (const [key, entry] of entries) {
  const short = key.slice(entry.ns.length + 1);
  if (!byNamespace.has(entry.ns)) byNamespace.set(entry.ns, {});
  byNamespace.get(entry.ns)[short] = entry;
}

let written = 0;
let kept = 0;
const report = [];

for (const [ns, group] of [...byNamespace.entries()].sort()) {
  const file = path.join(OUT_DIR, `${ns}.json`);
  const existing = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : {};

  const next = {};
  for (const key of Object.keys(group).sort()) {
    const { en, files: sources } = group[key];
    const previous = existing[key];

    // Georgian is only carried over when the English it was written against is
    // unchanged. If the source copy was reworded, the old translation is stale
    // and silently keeping it would ship a sentence that no longer matches.
    const ka = previous && previous.en === en ? (previous.ka ?? "") : "";
    if (ka) kept++;

    next[key] = { en, ka, _source: [...sources].sort()[0] };
    written++;
  }

  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  const done = Object.values(next).filter((e) => e.ka).length;
  report.push([ns, Object.keys(next).length, done]);
}

for (const [ns, n, done] of report.sort((a, b) => b[1] - a[1])) {
  console.log(
    `${String(n).padStart(5)}  ${ns.padEnd(10)} ${done ? `${done} translated` : ""}`,
  );
}
console.log(
  `\n${written} strings across ${report.length} files → translation/`,
);
console.log(`${hoisted} shared strings hoisted into common.shared`);
if (kept) console.log(`${kept} existing translations preserved`);
