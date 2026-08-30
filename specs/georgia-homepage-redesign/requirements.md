# Requirements: Georgia Homepage Redesign

## Summary

The public marketing homepage is rebuilt to the high-fidelity design handoff at
`UI:UX/homepage/design_handoff_georgia_homepage/` (`Home-Georgia-v3.dc.html` plus its
567-line `README.md`, which is the authoritative token/behaviour reference). The handoff
replaces today's light editorial page with a larger, more confident layout: a floating
glass nav pill, a centred hero, a six-slide banner carousel, a partner logo marquee, a
stats row, a bento feature grid, a numbered how-it-works list, a photo-led vehicle
catalogue, a driver panel, a city coverage list, an FAQ accordion, a closing CTA and a
four-column footer.

Two things make this more than a restyle. First, **every banner and every string on the
page must be editable from the admin back office** at `admin.localhost:3000` — that is the
explicit product requirement. The codebase already has the machinery for this
(`HomePageSection` and `Banner` models, admin CRUD under `/admin/content/*`, a shared
contract in `src/lib/admin/home-page-content.ts`), but it only covers six section types
and has never been populated with real content, so the live site always renders the
hardcoded TypeScript fallbacks. This feature extends that contract to cover every new
section, adds real image upload so a content manager can put a banner live without
hosting the file elsewhere first, and seeds the initial content so the CMS is the actual
source of truth rather than a bypassed layer.

Second, the page gains a **light/dark theme toggle**. The handoff is dark
(`#08090A` / accent `#F58220`); the current landing page is light (`#ffffff` /
`#ff5a1f`). Rather than choosing one, both become themes of the same new layout, switched
by a control in the nav pill, persisted per visitor, and applied before first paint so the
page never flashes the wrong theme. This is new ground: the app declares
`@custom-variant dark` in `globals.css` but nothing has ever set the `.dark` class.

## Goals

- Rebuild the signed-out landing page to the `Home-Georgia-v3` design at high fidelity —
  colours, type scale, spacing, radii, shadows and interaction behaviour as specified.
- Make every banner, heading, paragraph, list item, link label, nav item and footer link
  on the page editable from `/admin/content/*` without a code change.
- Add a light/dark theme toggle to the landing page, persisted and flash-free, with the
  handoff's dark palette and the existing light palette as the two themes.
- Give content managers real image upload (Supabase Storage) for hero banners, partner
  logos and vehicle photos, instead of pasting externally-hosted URLs.
- Wire the vehicle catalogue section to the real `VehicleTypeSpec` data rather than the
  handoff's nine placeholder types.
- Adapt the handoff's copy to what this platform actually does, so no section claims a
  feature that does not exist.
- Keep the working quote calculator on the page, restyled, in its own section below the
  hero.
- Seed the initial content so the page renders from the database, not from fallbacks.

## Non-Goals

- **No changes to the signed-in booking app.** `src/components/home/booking-form.tsx`
  (1,367 lines) and `route-preview-map.tsx` (522 lines) render for signed-in CLIENTs at
  `/` and are out of scope. Do not touch them.
- **No dark mode for the rest of the app.** The toggle governs the landing page only. The
  admin back office, driver hub, onboarding wizard and booking app keep their pinned light
  palettes. Their tokens must not move.
- **No new locale.** `ContentLocale` stays `KA | EN`. The handoff's copy mentions Russian
  support as marketing prose; adding a third locale is a schema migration and a full
  translation effort, and is deliberately excluded.
- **No runtime i18n wiring.** `src/lib/translations.ts` remains unused. Locale selection
  stays the existing `?locale=` query param.
- **No rate card.** The vehicle section publishes no prices — the platform does not quote
  a fare until a route is entered. The quote calculator is the only place a number appears.
- **No testimonials section.** The prototype's `quotes` array is defined but never
  rendered in v3; it is dead data.
- **No CRM, analytics or finance admin work.** Unrelated to this feature.
- **No rich-text editor.** Section copy stays plain-text fields, consistent with the rest
  of the admin.

## Acceptance Criteria

- [ ] A signed-out visitor to `localhost:3000` sees the `Home-Georgia-v3` layout: floating
      nav pill, centred hero, banner carousel, marquee, stats, bento grid, how-it-works,
      vehicles, drivers panel, coverage, FAQ, closing CTA, footer.
- [ ] A theme toggle in the nav pill switches the page between light and dark. The choice
      survives a reload and a new tab, and the page never renders in the wrong theme before
      hydrating.
- [ ] Every string on the page can be changed from `/admin/content/home-page` (section
      copy, nav labels, footer columns) or `/admin/content/banners` (banner captions), and
      the change is visible on the public page without a deploy.
- [ ] A content manager can upload a banner image from their machine in the admin and see
      it live in the hero carousel — no external hosting step.
- [ ] The hero carousel shows at most 6 active `home_hero` banners, auto-advances every
      6s, stops auto-advancing permanently after any user interaction, supports arrows,
      dots and touch swipe, and respects `prefers-reduced-motion`.
- [ ] The vehicles section renders the real `VehicleTypeSpec` catalogue grouped by its two
      real categories, with an admin-managed photo per type and no prices.
- [ ] The quote calculator still works end-to-end against `/api/pricing/estimate`, in its
      own section below the hero.
- [ ] No section asserts a product claim the platform does not implement.
- [ ] The page renders correctly with zero CMS rows (falls back to defaults) and with a
      partially-populated CMS.
- [ ] `pnpm check` (lint + typecheck) passes.

## Assumptions

- The handoff's `README.md` wins over the `.dc.html` prototypes wherever they disagree.
  The prototypes carry documented workarounds for their preview renderer (instant carousel
  scroll, no dot transitions, inline styles only) that must **not** be reproduced.
- The bundled `fonts/*.woff2` in the handoff are ignored: `src/app/layout.tsx` already
  loads IBM Plex Sans and IBM Plex Mono via `next/font/google`, which is exactly what the
  design specifies.
- `<image-slot>` elements are prototype-only placeholders and are replaced by real
  `<img>` / `next/image` elements fed from the CMS.
- Partner logos are stored as `Banner` rows under a new placement key rather than a new
  Prisma model — `Banner` already models exactly "an image with a placement, sort order,
  locale and active window".
- The existing light landing palette (`--landing-*` in `globals.css`) is good enough to
  serve as the light theme; it does not need to be redesigned.
- Default theme follows the visitor's `prefers-color-scheme` until they choose explicitly.
- Nobody is relying on the current homepage's exact section order, since it has always
  rendered from hardcoded fallbacks.

## Technical Constraints

- **Next.js 15 App Router, React 19, Tailwind v4 (CSS-first — there is no
  `tailwind.config.*`).** All design tokens live in `src/app/globals.css` under
  `@theme inline`.
- **No validation library.** The project deliberately hand-rolls parsing; follow the
  existing `parse*` helper style in `src/app/api/admin/content/*/validation.ts`.
- **No server actions anywhere in the repo.** Every admin mutation is a REST route under
  `src/app/api/admin/**` called by `fetch` from a `"use client"` page, refreshed by bumping
  a local `reloadToken` or `router.refresh()`. Match that pattern; do not introduce
  `"use server"`.
- **Admin routes are guarded by `authorizeAdminApi(["SUPER_ADMIN", "CONTENT_MANAGER"])`**
  and every mutation writes an audit row via `writeAuditLog()`. `ALLOWED_ROLES` is restated
  per route file on purpose so each endpoint's gate is readable without following an import.
- **`HomePageSection.type` and `.content` are free-form `String`/`Json`.** Adding a section
  type is a content change, not a migration. `src/lib/admin/home-page-content.ts` is the
  single shared contract and is deliberately dependency-free (no Prisma, no `server-only`)
  because client components import it.
- **`LandingSectionRenderer`'s switch is exhaustive over the discriminated union**, so
  adding a type is a compile error until every consumer is updated. That is intended.
- **Supabase Storage buckets are created by hand in the dashboard**, never provisioned in
  code. Uploads go browser → Supabase via a signed URL, bypassing the route-handler body
  limit; the route only mints the URL and records the result.
- **`package.json`'s `"dev": "next dev -H ::"` is load-bearing.** Without `-H ::` the
  cross-host admin redirects collapse into `ERR_TOO_MANY_REDIRECTS`. Do not change it.
- **`localhost:3000` is the client host** and serves the homepage;
  `merchant.localhost:3000` redirects away from `/`. Debug on the right host.
- The landing page must keep emitting `data-landing-page` (so `globals.css` owns the page
  background) and, for signed-out visitors, `data-hide-site-header` (so the root layout's
  global header does not stack a second navbar above the floating pill).
- The shadcn token set in `globals.css` is light-only and several names are contested
  (`--color-muted` already falls back through `--admin-muted`). Introduce landing dark
  values as their own scoped tokens; do not repurpose shared names.
