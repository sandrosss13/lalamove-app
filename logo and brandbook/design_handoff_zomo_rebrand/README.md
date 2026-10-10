# Handoff: Lalamove → zomo rebrand (logo + naming)

## Overview
"Lalamove" was a placeholder name. The official brand is **zomo** (always lowercase). Replace every name, logo, favicon and app icon across the three products:
- zomo.ge: customer web app (+ customer mobile app)
- driver.zomo.ge: driver & fleet hub (+ driver mobile app)
- admin.zomo.ge: internal operations console

The visual design of the UI does not change. This is a swap of name, logo and icon assets only.

## About the files
Files in `svg/` and `png/` are **final production assets**. Use them as they are and don't redraw them. `reference/brand-book.dc.html` is an HTML design reference for usage rules. It is not code to ship.

## Fidelity
High-fidelity. Use the exact SVGs and hex values below.

## Task for Claude Code
1. **Find all naming.** Search the repo, case-insensitively, for `lalamove`, `Lalamove`, `LALAMOVE`, `lala-move`, `lala_move` and `ლალამუვი`. Check:
   - UI copy and i18n files (en + ka), page titles, meta tags, OpenGraph and Twitter cards
   - `package.json` name/description, `manifest.json` / `site.webmanifest`, PWA `name` and `short_name`
   - iOS `Info.plist` (CFBundleDisplayName) and Android `strings.xml` (app_name)
   - emails, SMS templates, push notification copy, PDFs and receipts
   - env vars, domains and URLs, which should become `zomo.ge`, `driver.zomo.ge` and `admin.zomo.ge`
   - component names such as `LalamoveLogo`, which should become `ZomoLogo`
   Rules: write **zomo** in lowercase, even at the start of a sentence in the UI. Written in Georgian it is **ზომო**. Do not rename third-party package identifiers, DB columns or API contracts without confirming first. List them for review instead.
2. **Replace logo components** with inline SVG from `svg/`, or import the files directly:
   - Header on light backgrounds: `lockup-horizontal-primary.svg` (orange symbol, ink wordmark)
   - Dark footer and driver sections (#15140f): `lockup-horizontal-dark.svg`
   - Orange backgrounds: `lockup-horizontal-white.svg`
   - Single colour: `lockup-horizontal-ink.svg` or `lockup-horizontal-white.svg`
   - Compact spaces (sidebar collapsed, avatar, loader): `symbol-*.svg`
   - Splash or centred screens: `lockup-stacked-*.svg`
   - Admin console: the same primary lockup. Optionally add a separate "admin" text label in muted #6b675f, but never merge it into the logo.
3. **Favicons (web).** Use `favicon.svg` as `<link rel="icon" type="image/svg+xml">`, plus `favicon-32.png` and `favicon-16.png`, plus `app-icon-customer-180.png` as apple-touch-icon.
   - For driver.zomo.ge, use `app-icon-driver-180.png` as the touch icon.
4. **App icons.**
   - **Customer app:** use `app-icon-customer-*.png` (orange #ff5a1f background).
   - **Driver app:** use `app-icon-driver-*.png` (dark #15140f background, bright orange #f58220 symbol).
   - The icons are full-bleed squares. Let iOS and Android apply their own masks. For an Android adaptive icon, use the SVG background colour as the background layer and the symbol, at 60% scale and centred, as the foreground. Regenerate the other densities from the 1024 PNG or the SVG.
   - Web manifest icons: 192 and 512.

## Logo rules
- **Clear space:** keep a gap on every side at least 24% of the symbol's height.
- **Minimum sizes:** horizontal lockup 80px wide, stacked lockup 48px wide, symbol 16px.
- **Never:** stretch, rotate, recolour outside the palette, add shadows or gradients, rearrange the lockup, or set "zomo" in a font in place of the wordmark.
- **Orange text:** #ff5a1f on white is only about 3:1 contrast. Use it for the symbol and large fills only. For orange text or thin lines on light backgrounds, use #b4530f.

## Design tokens (brand palette, fixed)
- Brand orange #ff5a1f
- Deep orange #b4530f (small text and thin strokes on light backgrounds)
- Bright orange #f58220 (orange on dark backgrounds)
- Ink #201f1c
- Dark panel #15140f, with off-white #f5f2ea on top
- White #ffffff, warm off-white #faf9f6
- Muted #6b675f
- Line #e7e4de
- Type for UI text: IBM Plex Sans and IBM Plex Sans Georgian. The wordmark is custom lettering and is not a font.

## Assets
- `svg/symbol-{orange,ink,white,offwhite,bright}.svg`: viewBox 0 0 100 100
- `svg/wordmark-{orange,ink,white,offwhite,bright}.svg`: viewBox 0 0 482 100
- `svg/lockup-horizontal-{primary,dark,ink,white}.svg`: viewBox 0 0 382 100
- `svg/lockup-stacked-{primary,dark,ink,white}.svg`: viewBox 0 0 212 158
- `svg/app-icon-customer.svg`, `svg/app-icon-driver.svg`, `svg/favicon.svg`
- `png/app-icon-{customer,driver}-{1024,512,192,180}.png`
- `png/favicon-{32,16}.png`

Note: the symbol here is the "route z" (concept 1a). If a round-2 symbol is chosen later, these files will be replaced, but the filenames and the steps stay the same.

## Acceptance checklist
- [ ] `grep -ri lalamove` returns only items the team has approved to keep
- [ ] Browser tab shows the zomo favicon on all three subdomains
- [ ] Both mobile apps show the new launcher icons and display names "zomo" / "zomo driver"
- [ ] The logo is crisp at every size, never smaller than the minimum sizes, with clear space respected
