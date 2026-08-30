# Action Required: Georgia Homepage Redesign

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Create a public Supabase Storage bucket named `site-media`** (Supabase dashboard →
      Storage → New bucket → Public). Banner images, partner logos and vehicle photos are
      written here. Buckets are never provisioned in code in this project — the existing
      `vehicle-photos` and `driver-documents` buckets were created the same way. Until this
      exists, image upload in the admin will fail at runtime (task-04, task-12, task-13).

- [ ] **Confirm the brand name for the page.** The handoff is written for "Lalamove
      Georgia" throughout (wordmark, footer brand block, copyright line). Confirm this is
      the real brand, or supply the correct name — it appears in the nav pill, the footer
      and the `© 2026 …` line, all of which become CMS-editable but need a correct seeded
      default (task-05, task-15).

- [ ] **Supply or approve the marketing photography.** The design has no images of its
      own — every slot is empty. Needed: 6 hero banners at 2400×900, up to 8 partner logos
      at 360×96 (transparent PNG at 2× or 3×; **SVG is not accepted** — the upload
      allowlist excludes it because `site-media` is a public bucket and an SVG opened
      from a stable URL is an XSS vector), 11 vehicle photos at 720×560 (one per
      `VehicleTypeSpec`), and 1 courier/driver photo at 1200×1000. The page renders
      correctly without them (empty carousel is hidden, vehicle cards fall back to the
      existing inline SVG glyphs), so this does not block implementation — but the page
      will look unfinished until they land (task-15).

- [ ] **Confirm the real service-coverage figures.** The coverage section and the stats row
      need true numbers. The `GeorgianCity` enum has 25 cities; the handoff shows 11 with a
      "Same hour"/"Scheduled" tier split that does not exist anywhere in the data. Confirm
      which cities are actually served and at what tier, and the true values for the four
      stat tiles. Placeholders are seeded and flagged if this is not answered (task-10,
      task-15).

## During Implementation

- [ ] **Review the adapted marketing copy.** Per the planning decision, the handoff's
      courier-product copy is rewritten to match this freight platform — the "twelve second
      booking", "54s median match time", "20 stops per booking", "insured up to ₾5,000",
      "6,400 courier partners", "half price on your first three" and public REST API claims
      are all removed or replaced, because the platform does not implement them. task-02
      lands the replacements as seeded defaults; they need a human read-through for tone and
      factual accuracy before launch.

## After Implementation

- [ ] **Populate the CMS with real content and images** at `admin.localhost:3000` →
      Content. task-15 seeds working defaults so the page is never blank, but the seeded
      copy is a starting point, not final marketing text.

- [ ] **Author the Georgian (`KA`) content.** task-15 deliberately seeds the `EN` locale
      only. Seeding `KA` with English strings would render identically to seeding nothing —
      a `KA` request with no rows already falls back to the same English defaults — while
      filling the admin's KA tab with rows that look authored and translated when they are
      not. So the KA tab starts empty, showing its existing "No sections for this locale
      yet" message, which is both true and actionable. To go live in Georgian: open
      `/admin/content/home-page`, switch to the KA tab, and create each section, copying the
      structure from the EN tab and translating the strings. Note `ContentLocale` is `KA | EN`
      only — there is no Russian locale, and adding one is a schema migration.

- [ ] **Add the homepage banners.** `pnpm seed:home-page` deliberately creates **no** `Banner`
      rows: a banner needs a non-empty `imageUrl`, no images exist yet, and inventing URLs would
      render broken image boxes in the hero carousel and the partner marquee. With no rows, both
      render nothing, which is the empty state they are built for. To fill them, at
      `admin.localhost:3000` → Content → Banners → **New Banner**: upload the image, set
      **Placement** to `home_hero` for a carousel slide (max 6 active per locale — the form and the
      API both enforce it) or `home_partner_logo` for a partner logo, set **Locale** to match the
      page locale (`EN` today), set **Sort order** to the position you want, and leave the dates
      empty for a banner with no start or end. The **Title** becomes the carousel's caption chip, so
      write it as display copy, not as a filename.

- [ ] **Add the vehicle photos.** At `admin.localhost:3000` → Content → Vehicle Photos, upload one
      photo per vehicle type (11 of them). Types with no photo fall back to their illustrated glyph,
      so the page is correct without them — just unfinished.

- [ ] **Verify the Supabase bucket is publicly readable** by loading an uploaded banner URL
      in a private window. A bucket created as private will upload successfully but render
      broken images on the public page.

- [ ] **Restrict the Google Maps API key** if not already done. A live key is committed to
      `.env`, `.env.local` and `.env.prod.check`. Unrelated to this feature but surfaced
      during research — confirm it is HTTP-referrer-restricted and that those files are
      gitignored.

---

> These tasks are also referenced in context within the relevant task files.
