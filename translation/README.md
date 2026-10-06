# translation/

Every user-visible English string in the platform, one entry each, waiting for
Georgian. **This folder is the work. Edit the `"ka"` fields and nothing else.**

```json
"savedCardsPanel.savedCards": {
  "en": "Saved cards",
  "ka": "შენახული ბარათები",
  "_source": "src/components/wallet/saved-cards-panel.tsx"
}
```

- `en` — the English as it appears in the app today. Don't edit it here; change
  it in the source and re-run the extractor.
- `ka` — **yours.** Empty means not done.
- `_source` — where the string appears, so you can go and look at it in context
  when the English is ambiguous. Ignored by the importer.

Read [`../src/messages/GLOSSARY.md`](../src/messages/GLOSSARY.md) first. It
settles the terms that must not drift — including the four words this platform
uses for what looks like one thing (`Order` / `Load` / `Job` / `Cargo`), which
are deliberately different and must stay different in Georgian.

## Excel (easiest)

**`translation/georgian-translation.xlsx`** — one workbook, a tab per area,
1,503 rows. Open it, fill the shaded **georgian** column, save, then:

```bash
pip3 install openpyxl                          # once
python3 scripts/translations_xlsx.py --merge   # workbook → translation/*.json
pnpm i18n:import                               # → the app
```

The Overview tab carries the instructions, a worked example and a live progress
count per tab. Untranslated rows sort to the top of every tab, already-done rows
are green, and each tab has a filter row so you can hide what is finished.

To rebuild the workbook after new strings land: `python3 scripts/translations_xlsx.py`.

## Or a spreadsheet as CSV

`translation/sheets/` holds the same strings as CSV, one file per area — useful
for Google Sheets, for splitting the work across people, or if you would rather
not install openpyxl.

```bash
pnpm i18n:sheets         # translation/*.json → translation/sheets/*.csv
#   ... translate the `georgian` column ...
pnpm i18n:sheets:merge   # sheets → translation/*.json
pnpm i18n:import         # → src/messages/{ka,en}/
```

Untranslated rows are sorted to the top of each sheet, so the work is in front
of you and the file visibly shortens as you go. Merging matches on the `key`
column, so you can sort, filter, or hand different sheets to different people
without breaking anything — just don't rename the header row or edit the `key`
column.

Commas, quotes and line breaks in a cell are handled, and the files carry a BOM
so Excel on Windows reads Georgian correctly instead of turning it into
mojibake.

## Working in the JSON directly

```bash
pnpm i18n:extract   # source  → translation/
pnpm i18n:import    # translation/ → src/messages/{ka,en}/
```

Both are safe to run repeatedly, and you can run the importer when the folder is
2% done — it only imports entries whose Georgian is filled in, so a half-finished
screen falls back to English rather than rendering blanks.

Re-running the extractor after a feature lands adds the new strings and keeps the
Georgian you have already written. It drops a translation only when the English
it was written against has changed — a reworded sentence needs a reworded
translation, and silently keeping the old one would ship a mismatch.

## Rules that matter

**Placeholders in `{braces}` must survive.** `{count}`, `{name}`, `{city}` are
substituted at runtime. Word order around them can change freely — that is the
point of having them — but a dropped or renamed placeholder is a crash in one
language and not the other. `tests/i18n-catalogs.spec.ts` checks this.

**Don't translate:** the brand name, order and vehicle IDs, licence plates,
`₾`, email addresses, `API`, `SMS`. Example placeholders like `AB-123-CD` and
`MM/YY` stay as they are; `e.g.` in front of one becomes `მაგ.`.

**Formal address (`თქვენ`) throughout.** Buttons are verbal nouns — `შენახვა`,
not `შეინახე`.

**`common.shared.*` is used in more than one place.** Those 318-odd entries were
hoisted out of the other files precisely because the same English appears in
several screens; each is translated once and used everywhere. Keep them generic
enough to read correctly in every context.

## What is in each file

| File               | Strings | What it covers                                                                                   |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| `admin.json`       | 351     | The whole back office                                                                            |
| `common.json`      | 318     | Shared strings, shadcn primitives, public pages                                                  |
| `driverHub.json`   | 241     | Driver and fleet hub                                                                             |
| `errors.json`      | 163     | API error messages shown to users                                                                |
| `home.json`        | 94      | Booking form and home surfaces                                                                   |
| `cityLanding.json` | 234     | Per-city SEO landing pages (`/gadazidva/{city}`) — hand-written, see the glossary before editing |
| `onboarding.json`  | 59      | Driver onboarding wizard                                                                         |
| `cities.json`      | 74      | City and region names                                                                            |
| `fleet.json`       | 51      | Fleet/company onboarding wizard                                                                  |
| `dashboard.json`   | 49      | Merchant dashboard shell                                                                         |
| `auth.json`        | 42      | Sign in, sign up, password change                                                                |
| `checkout.json`    | 22      | Checkout and payment                                                                             |
| `landing.json`     | 13      | Marketing landing page                                                                           |
| `orders.json`      | 11      | Order list, card and tracking                                                                    |
| `account.json`     | 9       | Client account pages                                                                             |
| `wallet.json`      | 6       | Wallet and saved cards                                                                           |

`cities.json` is city and region names — proper nouns with standard spellings — თბილისი, ბათუმი,
ქუთაისი — not a judgement call. It is the fastest file to finish and a good one
to start on.

## What this folder does not cover

Content staff author in the back office is translated **in the back office**,
not here: landing page sections, banners, Terms and Privacy pages, and
transactional email/SMS templates all store one row per language already. Create
the Georgian row next to the English one under `/admin/content/…`.

Nothing in this folder reaches the site until the importer runs and the app is
rebuilt.
