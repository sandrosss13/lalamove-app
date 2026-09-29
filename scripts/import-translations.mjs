/* eslint-disable no-console -- Same as the extractor beside it: the progress
   table this prints is the whole point of running it, and belongs on stdout. */

/**
 * Merges finished Georgian from `translation/` into the catalogs the app
 * actually reads, `src/messages/{ka,en}/`.
 *
 * Run it with `node scripts/import-translations.mjs`. Safe to run at any point
 * — including when the folder is 2% done.
 *
 * The one rule that governs everything here: **a key is imported only when its
 * Georgian is filled in.** An entry still awaiting translation is written to
 * neither locale, not to English-only and not as an empty string. That keeps
 * three things true at once:
 *
 *   - `tests/i18n-catalogs.spec.ts` stays green while the work is in progress.
 *     It asserts the two locales hold identical key sets and that no value is
 *     blank; importing half a pair would fail both.
 *   - A half-translated screen shows English, which is a legible fallback. A
 *     key imported with an empty Georgian value renders as *nothing at all*.
 *   - Progress is measurable — the numbers this prints are the real ones.
 *
 * Dotted keys become nested objects, because that is the shape `next-intl`
 * reads: `wallet.json` holding `{"savedCardsPanel": {"savedCards": "…"}}` is
 * what makes `useTranslations("wallet.savedCardsPanel")` resolve.
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(ROOT, "translation");
const MESSAGES_DIR = path.join(ROOT, "src", "messages");

/**
 * Deep-merges `source` into `target`, source winning on a leaf.
 *
 * The catalogs are merged into rather than replaced because not everything in
 * them comes from `translation/`: `common.languageToggle` was hand-written when
 * the switcher was built, and it is the one string pair that has to work before
 * any of this folder is filled in. A wholesale overwrite would delete it.
 *
 * The cost of merging is that deleting a key from `translation/` no longer
 * deletes it from the catalogs — a stale entry lingers until someone removes it
 * by hand. That is the cheaper mistake: a leftover key is dead weight, a
 * deleted one is a screen rendering its own key name at a customer.
 */
function mergeDeep(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof target[key] !== "object" || target[key] === null)
        target[key] = {};
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

/** Writes `value` at the dotted `key` path, creating objects on the way down. */
function setDeep(target, key, value) {
  const segments = key.split(".");
  const leaf = segments.pop();
  let node = target;

  for (const segment of segments) {
    // A key collides when one entry is `a.b` and another is `a.b.c` — the first
    // claims a string where the second needs an object. Renaming is the fix;
    // silently overwriting would drop one of them.
    if (typeof node[segment] === "string") {
      throw new Error(
        `Key collision at "${key}": "${segments.join(".")}" is already a string. ` +
          `Rename one of the two entries in translation/.`,
      );
    }
    node[segment] ??= {};
    node = node[segment];
  }

  node[leaf] = value;
}

const namespaces = readdirSync(SOURCE_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();

let imported = 0;
let pending = 0;
const report = [];

for (const namespace of namespaces) {
  const entries = JSON.parse(
    readFileSync(path.join(SOURCE_DIR, `${namespace}.json`), "utf8"),
  );

  const ka = {};
  const en = {};
  let done = 0;
  let waiting = 0;

  for (const [key, entry] of Object.entries(entries)) {
    const georgian = (entry.ka ?? "").trim();

    if (!georgian) {
      waiting++;
      continue;
    }

    setDeep(ka, key, georgian);
    setDeep(en, key, entry.en);
    done++;
  }

  for (const [locale, messages] of [
    ["ka", ka],
    ["en", en],
  ]) {
    const dir = path.join(MESSAGES_DIR, locale);
    mkdirSync(dir, { recursive: true });

    const file = path.join(dir, `${namespace}.json`);
    const existing = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : {};

    writeFileSync(
      file,
      `${JSON.stringify(mergeDeep(existing, messages), null, 2)}\n`,
    );
  }

  imported += done;
  pending += waiting;
  report.push([namespace, done, waiting]);
}

for (const [namespace, done, waiting] of report.sort((a, b) => b[1] - a[1])) {
  const total = done + waiting;
  const percent = total ? Math.round((done / total) * 100) : 100;
  console.log(
    `${namespace.padEnd(11)} ${String(done).padStart(5)} / ${String(total).padEnd(5)} ${percent}%`,
  );
}

console.log(
  `\n${imported} translated, ${pending} still to go → src/messages/{ka,en}/`,
);

if (imported === 0) {
  console.log(
    '\nNothing imported yet. Fill in the "ka" fields in translation/*.json first.',
  );
}
