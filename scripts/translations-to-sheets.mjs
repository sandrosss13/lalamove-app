/* eslint-disable no-console -- Same as the other two i18n scripts: the progress
   table this prints is the whole point of running it, and belongs on stdout. */

/**
 * Turns `translation/*.json` into spreadsheets a person can actually sit down
 * and translate in, and reads the finished ones back.
 *
 *   node scripts/translations-to-sheets.mjs          # JSON  → translation/sheets/*.csv
 *   node scripts/translations-to-sheets.mjs --merge  # CSVs  → translation/*.json
 *
 * The JSON files remain the source of truth that `import-translations.mjs`
 * reads; these CSVs are a working surface on top of them. Translate in the
 * spreadsheet, `--merge` to fold the Georgian back into the JSON, then
 * `pnpm i18n:import` to reach the app. Merging is keyed on the `key` column, so
 * rows may be sorted, filtered or split across people without breaking it.
 *
 * CSV rather than a bespoke editor because every translator already has a tool
 * that opens it — Excel, Numbers, Google Sheets — with find-and-replace, spell
 * check and the ability to sort by "empty Georgian" built in.
 *
 * Written with a hand-rolled CSV reader/writer rather than a dependency: the
 * format is four columns of text, and the only genuinely tricky parts (quotes,
 * embedded newlines, and the BOM that stops Excel mangling Georgian) are each a
 * few lines.
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
const JSON_DIR = path.join(ROOT, "translation");
const SHEET_DIR = path.join(JSON_DIR, "sheets");

const COLUMNS = ["key", "english", "georgian", "source"];

/**
 * Excel on Windows reads a BOM-less UTF-8 file as the local 8-bit codepage and
 * turns every Georgian character into mojibake — and worse, silently writes the
 * mojibake back on save. The BOM is what makes it read UTF-8.
 */
const BOM = "﻿";

/**
 * Drops a leading byte-order mark.
 *
 * Compared by code point rather than matched with a regex: Prettier rewrites a
 * `\uFEFF` escape inside a regex literal into the raw character, and ESLint
 * then flags that as irregular whitespace. This survives formatting.
 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A minimal RFC 4180 reader: honours quoting, doubled quotes and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

const namespaces = readdirSync(JSON_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();

// ---------------------------------------------------------------------------

if (process.argv.includes("--merge")) {
  if (!existsSync(SHEET_DIR)) {
    console.error(
      "No translation/sheets/ to merge. Run this script without --merge first.",
    );
    process.exit(1);
  }

  let merged = 0;
  let unknown = 0;
  const report = [];

  for (const namespace of namespaces) {
    const file = path.join(SHEET_DIR, `${namespace}.csv`);
    if (!existsSync(file)) continue;

    const jsonPath = path.join(JSON_DIR, `${namespace}.json`);
    const entries = JSON.parse(readFileSync(jsonPath, "utf8"));

    const rows = parseCsv(stripBom(readFileSync(file, "utf8")));
    const header = rows.shift() ?? [];
    const keyAt = header.indexOf("key");
    const georgianAt = header.indexOf("georgian");

    if (keyAt === -1 || georgianAt === -1) {
      console.error(
        `${namespace}.csv is missing a "key" or "georgian" column — skipped. ` +
          `Do not rename the header row.`,
      );
      continue;
    }

    let count = 0;
    for (const row of rows) {
      const key = (row[keyAt] ?? "").trim();
      const georgian = (row[georgianAt] ?? "").trim();
      if (!key || !georgian) continue;

      // A key that is not in the JSON means the spreadsheet is out of date with
      // the source — usually a string that was reworded or deleted since the
      // export. Reported rather than dropped silently, so the work is not lost
      // without anyone noticing.
      if (!entries[key]) {
        unknown++;
        continue;
      }

      if (entries[key].ka !== georgian) count++;
      entries[key].ka = georgian;
    }

    writeFileSync(jsonPath, `${JSON.stringify(entries, null, 2)}\n`);
    merged += count;
    report.push([namespace, count]);
  }

  for (const [namespace, count] of report.filter(([, n]) => n > 0)) {
    console.log(`${namespace.padEnd(11)} ${count} updated`);
  }
  console.log(`\n${merged} translations merged into translation/*.json`);
  if (unknown) {
    console.log(
      `${unknown} row(s) had keys not in the JSON — re-export and re-check those.`,
    );
  }
  console.log("Next: pnpm i18n:import");
} else {
  mkdirSync(SHEET_DIR, { recursive: true });

  let total = 0;
  let done = 0;
  const report = [];

  for (const namespace of namespaces) {
    const entries = JSON.parse(
      readFileSync(path.join(JSON_DIR, `${namespace}.json`), "utf8"),
    );

    const lines = [COLUMNS.join(",")];
    let filled = 0;

    // Untranslated rows first: the work sits at the top of the file instead of
    // scattered through it, and the sheet shortens visibly as it is done.
    const rows = Object.entries(entries).sort((a, b) => {
      const aDone = a[1].ka ? 1 : 0;
      const bDone = b[1].ka ? 1 : 0;
      return aDone - bDone || a[0].localeCompare(b[0]);
    });

    for (const [key, entry] of rows) {
      if (entry.ka) filled++;
      lines.push(
        [key, entry.en, entry.ka ?? "", entry._source ?? ""]
          .map(escapeCell)
          .join(","),
      );
    }

    writeFileSync(
      path.join(SHEET_DIR, `${namespace}.csv`),
      BOM + lines.join("\n") + "\n",
    );

    total += rows.length;
    done += filled;
    report.push([namespace, rows.length, filled]);
  }

  for (const [namespace, count, filled] of report.sort((a, b) => b[1] - a[1])) {
    console.log(
      `${String(count).padStart(5)}  ${namespace.padEnd(11)}${filled ? ` ${filled} done` : ""}`,
    );
  }
  console.log(
    `\n${total} rows across ${report.length} sheets → translation/sheets/`,
  );
  console.log(`${total - done} still to translate`);
  console.log("\nFill the `georgian` column, then:");
  console.log("  node scripts/translations-to-sheets.mjs --merge");
  console.log("  pnpm i18n:import");
}
