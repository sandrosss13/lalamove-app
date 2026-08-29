# design-sync notes for lalamove-app

Scope: only `src/components/ui` (14 shadcn primitives), not the whole app.
Chosen deliberately over the whole `src/components` tree (see conversation)
— app-specific composed components (dashboard/admin/auth/landing) are out
of scope for now.

## Repo shape: no package, no Storybook

This repo has no build output for `src/components/ui` — it's app-internal
code, not a published/buildable package (`package.json` has no
`main`/`module`/`exports`). The converter's normal "package shape, no dist"
fallback (`synthEntry`, auto-discovery from `src/`) does **not** work here
because `resolvePackage` needs `<node-modules>/<pkg>/package.json` to exist
even in synth mode (`exportedNames(PKG_DIR, pkgJson)` reads it
unconditionally before the synth fallback runs).

**Do NOT fix this with a self-referencing `node_modules/lalamove-app`
symlink pointing at the repo root.** I tried that first — it created a
symlink cycle inside `node_modules` (`node_modules/lalamove-app` ->
repo root -> `node_modules/lalamove-app` -> ...) and the build OOM'd
(`ts-morph`/TS module resolution walked the cycle and exhausted the heap
building ever-longer path strings). I removed the symlink immediately.

**The working fix**: `cfg.entry` (`--entry` override) pointed at a real,
non-symlinked barrel file at the **repo root** — `.ds-entry.mjs` (gitignored,
regenerable). Passing `--entry` makes `package-build.mjs` walk up from the
entry file's own directory to find the nearest real `package.json` — since
the entry lives at repo root, that's the repo's own `package.json`
(`name: "lalamove-app"`), no symlink needed, no cycle possible.

Because `.d.ts`-based export discovery then finds nothing (no
`index.d.ts`), **`componentSrcMap` in config.json is the *only* source of
the component list** — all 14 names are pinned there with real paths.
There is no risk of an unwanted export leaking in (e.g. `CardHeader` getting
its own top-level card) because nothing is auto-discovered.

**If a component is added/removed from `src/components/ui`:**
1. Regenerate `.ds-entry.mjs` (command is in its own header comment —
   `for f in src/components/ui/*.tsx; do echo "export * from './$f';"; done > .ds-entry.mjs`).
2. Add/remove its entry in `componentSrcMap`.

## CSS: cfg.cssEntry is a *compiled* file, regenerate before every build

Tailwind v4 is CSS-first (`@import "tailwindcss"` in `src/app/globals.css`)
— there is no static "compiled stylesheet" checked into the repo the way a
component library would ship one. `.ds-sync/compile-css.mjs` runs the app's
own `postcss` + `@tailwindcss/postcss` over `src/app/globals.css` (with
content-detection scanning the whole repo, same as `next build` would) and
writes `.ds-sync/.compiled/globals.css`, which `cfg.cssEntry` points at.
That output directory is gitignored (`.ds-sync/`) — **re-run
`node .ds-sync/compile-css.mjs` before every `package-build.mjs`/resync**,
or `cfg.cssEntry` will be stale or missing.

The compile script also appends a `:root` block defining
`--font-ibm-plex-sans` / `--font-ibm-plex` itself — next/font/google sets
those as an inline style on `<html>` at runtime (a per-build scoped local
family name), so there's no static rule for them anywhere in the source
`globals.css`. See the fonts section below for why those names are safe to
hardcode to real family names.

## Fonts: fetched from Google Fonts, not in the repo

`IBM Plex Sans` (400/500/600/700) and `IBM Plex Mono` (400/500/600), latin
subset — loaded via `next/font/google` in `src/app/layout.tsx`, self-hosted
by Next.js at build time. No `.woff2` files exist anywhere in the repo or
`node_modules`. Fetched manually this run from the Google Fonts CSS2 API
(`fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600`)
with a modern desktop User-Agent to get woff2, downloaded the 4 unique
`fonts.gstatic.com` files, and wrote `.ds-sync/fonts-src/ibm-plex-fonts.css`
(`@font-face` rules with local `url()`s + the `:root` var block — though the
`:root` block there gets **dropped** by `cfg.extraFonts`' parser, which only
harvests `@font-face` blocks; that's why the var definitions live in
`compile-css.mjs`'s output instead, not here). User approved fetching from
the public registry (SIL OFL license) rather than shipping without them.

`.ds-sync/fonts-src/` is gitignored (under `.ds-sync/`) — **if this
directory is missing on a fresh clone/machine, the fonts need re-fetching**
before `cfg.extraFonts` in config.json resolves to anything. The commands
used are reconstructable from this note; consider promoting
`.ds-sync/fonts-src/` to a durable, committed location if this repo re-syncs
from a fresh clone often.

## Provider: `data-admin-surface` wrapper is required, not optional

Found while cross-checking `globals.css`: `src/components/ui/*` primitives
resolve `bg-accent`/`bg-muted` (and the default `border` color) through a
token collision that only resolves correctly under a `body:has([data-admin-surface])`
ancestor — see `.design-sync/conventions.md` for the full explanation. Wired
via `cfg.provider: {"component": "DsAdminSurface"}` + `cfg.extraEntries:
["./.design-sync/provider.tsx"]` (that file is durable/committed — it's a
design-sync-only wrapper, not part of the app's real component set) so
*every* preview renders correctly without each story needing to remember it.
If a future preview is authored that doesn't compose within this wrapper
context (shouldn't happen — it's applied globally by the provider), colors
will look visibly wrong (landing-page warm tones instead of neutral shadcn
tokens) — that's the tell if this regresses.

## Re-sync risks

- **No component preview was ever machine-verified.** Playwright/Chromium
  was never installed this run (user explicitly chose to skip both the
  render check and screenshot-based grading — "author unverified, I'll
  eyeball later" — see conversation). `package-validate.mjs` was run with
  `--no-render-check` throughout; the resync driver's capture stage exits 2
  (playwright not installed) every time until it's installed. All 14
  components are `pendingGrade` in the last verdict. **If a future sync
  installs playwright, run a full grade pass before trusting these cards
  render correctly** — several are non-trivial (Dialog/Popover/DropdownMenu/
  Select open states, Calendar's two-month layout, Table's wide layout).
- The local `.review.html` was served at a `127.0.0.1` port during this run
  and the user was pointed at it, but I did not get explicit confirmation
  back that they reviewed it before upload — treat the bundle as
  eyeballed-pending, not eyeballed-confirmed.
- `cardMode` overrides were set for `Dialog`/`Popover`/`DropdownMenu`/
  `Select` (`single`, forced open via `defaultOpen`) and `Table`/`Calendar`
  (`column`, wide layout) based on reading the source, not a captured
  screenshot — worth a visual sanity check once render-check is available.
- `.ds-sync/`, `.ds-entry.mjs`, and `ds-bundle/` are all gitignored/
  regenerated — a fresh clone needs: stage scripts (base SKILL.md §2.7 `cp -r`
  line), `npm i` in `.ds-sync/` (+ `npm approve-scripts esbuild`), re-fetch
  fonts (see above), `node .ds-sync/compile-css.mjs`, then build/resync.
- Google-hosted font files were fetched over the network mid-session; if
  IBM Plex's hosted files or URLs change upstream, `.ds-sync/fonts-src/`
  would need re-fetching (unlikely, but worth knowing this isn't pinned to
  a checksum).
