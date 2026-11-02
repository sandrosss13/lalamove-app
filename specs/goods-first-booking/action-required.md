# Action Required: Goods-first booking

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Sign off the seeded catalogue figures.** Task-01 lists every seeded item with a typical weight, dimensions and flags (`stackable`, `needsTwoPeople`, `requiredBody`, handling tags, cargo category). They are reasonable estimates, not measurements. An ops or fleet owner should check them, especially:
  - large appliances
  - beds and wardrobes
  - building-material units (a bag of cement vs a pallet of blocks)

  A weight that is too low under-recommends a vehicle; one that is too high overcharges.
- [ ] **Confirm the fit constants:** `WEIGHT_SAFETY_FACTOR 1.1`, `PACKING_FACTOR 1.4`, `OPEN_BED_NOTIONAL_HEIGHT_M 2.0` (requirements §Assumptions). They decide which vehicle is recommended and therefore the price the client sees first.
- [ ] **Confirm the cargo-category consequence.** The order's category is now derived from the items. "Moving home" with furniture and boxes yields `FURNITURE_FURNISHINGS` (medium or heavy vehicles), not `FULL_RELOCATION` (heavy only). Small moves will be recommended vans instead of trucks. That is the intended outcome, but it changes revenue mix. If whole-flat moves must stay heavy-only, add a "Whole flat (1 bedroom)" bundle item carrying `FULL_RELOCATION`. Do not tie it to the shortcut.
- [ ] **Confirm the building-materials category split.** Paint, tiles, doors, windows and plasterboard packs are `RETAIL_STOCK`, so a home move containing one paint bucket can still use a van. Cement bags, timber, rebar, sand and blocks stay `CONSTRUCTION_MATERIALS`, which is heavy-only: ten cement bags (250 kg) will be recommended a Box Truck. If that is too strict, either move cement bags to `RETAIL_STOCK` or relax `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES` for `CONSTRUCTION_MATERIALS`; the latter is a wider business decision.
- [ ] **Open-chassis loads currently cannot be booked.** Only Flatbed and Curtainsider offer `OPEN_CHASSIS`, and `src/app/api/orders/route.ts:909-911` notes that neither has an activated carrier today. Rebar, sand, blocks and any 6 m timber will therefore always end in "no vehicle available". That is true of today's form too, but the catalogue makes it more visible. Onboard at least one flatbed or curtainsider carrier, or decide to hide those catalogue entries (`active = false`) until one exists.
- [ ] **Confirm pallet presets:** EUR 1.2 × 0.8 m and Industrial 1.2 × 1.0 m; default height 1.2 m; weight presets Light ~150 / Medium ~400 / Heavy ~800 kg.

## During Implementation

- [ ] **Georgian copy.** Every new `src/messages/ka` key and every seeded `labelKa` and `synonymsKa` needs a native review. Task agents will write first drafts only. Synonyms matter most: search fails silently when a client types the word people actually use (e.g. "მაცივარი" for fridge).
- [ ] **Migrate staging by hand.** Production migrates on build; staging does not. Run `FORCE_MIGRATE_DEPLOY=1 node scripts/migrate-deploy.mjs` against staging's `DATABASE_URL`/`DIRECT_URL` after task-01 merges.
- [x] ~~Repair the git worktree link~~ — **done 2026-10-13.** The admin entry had been pruned from both repositories after the folder move, so `git worktree repair` had nothing to reconnect. It was recreated by hand on a new branch `feat/goods-first-booking` off `feat/zomo-rebrand` (`e6e3b9e`), the closest matching commit. Original note: `git status` in `zomo-rebrand-wt` currently fails with `not a git repository: /Users/ketikenia/Desktop/developer/new/template/.git/worktrees/zomo-rebrand-wt`. The path predates the move to `Desktop/developer/Zomo/new`. Run `git worktree repair` from the main checkout so agents can commit.

## After Implementation

- [ ] **Remove the legacy order path.** Task-06 keeps the old typed-weight path for requests without `items`, so the form keeps working through the rollout. Once task-10 has been in production long enough for cached bundles to age out (a week is ample), delete every `LEGACY(goods-first)` branch in `src/app/api/orders/route.ts` and make `items` required.
- [ ] **Tune the catalogue against real orders.** After a few weeks, compare drivers' reports of loads that did not fit (and support tickets) against the recommended class. Adjust item figures or the constants from the admin editor.
- [ ] **Decide whether to schedule task-12 (Claude free text).** Prerequisites:
  - an Anthropic API key in `env.example` and in Vercel
  - a monthly spend cap
  - a decision on whether text clients type (which may include addresses or names) can be sent to a third-party API under the privacy policy
- [ ] **Retire the `vehicle_types` landing section or keep it as an "our fleet" block.** Task-07 removes it from the default section order but leaves the section type available in the CMS, so existing CMS rows keep rendering until an admin removes them.
- [ ] **Consider whether driver-reported "did not fit" should feed back automatically.** Not in scope here; the job sheet has no such field today.

---

> These items are also referenced in context within the relevant task files.
