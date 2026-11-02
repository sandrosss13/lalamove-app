# Requirements: Goods-first booking

## Summary

The booking form asks the client the wrong questions. Step 4 asks for a **total weight bracket**, step 5 asks them to **pick a vehicle class** (and a load space), and step 6 asks for the **exact weight and the length, width and height of the largest item**. Individual clients do not know any of these, and most business clients do not know total weight either — they know how many pallets they are sending.

This feature turns the form around: the client says **what** they are moving, the platform works out **how big and heavy** it is and **which vehicle** fits, and the client confirms. Concretely:

- Step 3 becomes **goods shortcuts** (Moving home, Furniture, Appliances, Boxes & parcels, Chilled food, Building materials, Event equipment, Pallets).
- Step 4 becomes an **item list**: pick items from a seeded, admin-editable catalogue with quantities, or add a custom item. Business clients can also describe the load as **pallets**.
- Weight, dimensions, volume, cargo category, handling tags and (for individuals) load space are **derived** from the list by a pure, shared module — never typed by the client.
- Step 5 becomes a **recommendation**: the cheapest vehicle that fits, a "one size up" option, and a "Change vehicle" disclosure holding the existing grid. Business clients must **explicitly choose** a load space (Dry box / Refrigerated / Open chassis); individuals never see that question.
- Step 6 loses its four number fields.

Claude-powered free-text input ("a 3-seat sofa and 15 boxes of books") is specified as a **later phase** (task-12), behind the catalogue it maps onto.

## Goals

- An individual client can book without knowing any weight, dimension or vehicle name.
- A business client can describe a load as pallets or as items, and must choose the load space.
- Every figure that reaches `Order` (weight, envelope, volume, cargo category, body type) is **re-derived on the server** from the submitted item lines. The client's totals are never trusted.
- The vehicle suggestion and the server's fit check read the **same functions**, as `booking-fit.ts` already does for oversize checks.
- The catalogue is data (a table), seeded once and editable from the admin back office without a deploy.
- Goods shortcuts replace vehicles as the entry point on the landing page and in the booking form.

## Non-Goals

- **No change to pricing.** `src/lib/pricing.ts` keeps pricing by vehicle class, distance, time and helpers. Items influence price only through the vehicle they select. No per-item or per-m³ fare.
- **No change to the load board's fit filter or the dispatch fit check.** They keep reading `Order.cargoWeightKg/LengthM/WidthM/HeightM`, which this feature keeps populating.
- **No 3D bin packing.** The fit heuristic is weight + largest-item envelope + packed volume + floor area for non-stackable items. See Assumptions.
- **No rotation** of items inside a vehicle, inherited from `booking-fit.ts`.
- **No Claude in phase 1.** Task-12 is specified but not scheduled until phase 1 ships and the catalogue has been tuned against real orders.
- **No photo-based estimation.**
- **No guest booking.** Guests still quote on the landing calculator and are sent to sign-up; this feature only makes the shortcut they picked survive that trip.
- No multi-stop, no per-item pickup/dropoff.

## Acceptance Criteria

### Goods and items
- [ ] Step 3 shows goods shortcuts instead of the seven cargo-category cards. Picking one opens step 4 on that shortcut's catalogue group; it does **not** fix the order's cargo category.
- [ ] Step 4 lets the client search the catalogue (English and Georgian labels plus synonyms), browse by group, set a quantity per line (1–99) and remove lines.
- [ ] Step 4 has an "Other item" entry taking a label, quantity, and an approximate size and weight (S / M / L / XL presets, or exact figures).
- [ ] A running summary under the list reads e.g. `~320 kg · ~2.1 m³ · largest item 2.0 × 0.9 × 0.8 m`, every figure prefixed `~`.
- [ ] A business client sees an **Items | Pallets** switch in step 4. Pallets takes pallet type (EUR 1.2 × 0.8 m, Industrial 1.2 × 1.0 m), count, height per pallet and weight per pallet (Light ~150 kg / Medium ~400 kg / Heavy ~800 kg presets, or exact).
- [ ] An individual client never sees the Pallets mode.
- [ ] Step 6 no longer asks for weight, length, width or height.
- [ ] Handling tags in step 6 arrive pre-selected from the items (a fridge sets `UPRIGHT_ONLY` and `HEAVY_ITEM`; chilled goods set `COLD_CHAIN`). The client can still change them.

### Vehicle
- [ ] Step 5 shows one recommended vehicle (the cheapest serviceable class that fits the load plan) and, where one exists, a "one size up" option, each with its quote once addresses are set.
- [ ] A "Change vehicle" disclosure reveals the existing vehicle grid. Classes that fail the load plan stay in the grid, disabled in place with the reason on the card, as today.
- [ ] A class that passes the hard checks (weight, largest item) but fails a soft one (volume, floor area) is selectable with the warning `May not fit everything — about X m³ of load for Y m³ of space`.
- [ ] Individual clients never see the load-space question. Their body type is derived: any `REFRIGERATED` item → Refrigerated; any `OPEN_CHASSIS` item → Open chassis; otherwise Dry box. Chilled and open-chassis items in the same list produce an alert asking the client to book them separately.
- [ ] Business clients see the load-space picker with **no default**; step 5 cannot complete until one is picked. Options that conflict with the items (Dry box when chilled items are listed) are disabled with the reason.
- [ ] Step 7 suggests a crew of 2 when any item is flagged `needsTwoPeople`, without forcing it.

### Server
- [ ] `POST /api/orders` accepts `items[]` and refuses an order without at least one line.
- [ ] The server re-derives weight, envelope, volume, cargo category and (for individuals) body type from the lines, writes them to `Order`, and ignores any client-sent totals.
- [ ] It persists one `OrderItem` per line, snapshotting label, unit weight and dimensions so later catalogue edits do not rewrite history.
- [ ] It refuses a business order without a `bodyType`, and refuses any order whose chosen body conflicts with the items.
- [ ] Hard fit (weight, envelope) is still enforced by the existing `oversizeAxes` path. Soft fit is never a server refusal.
- [ ] In items mode `Order.itemQuantity` is filled with a server-built summary (`1 × Fridge, double door, 15 × Box, medium`, ≤ 200 chars). In pallets mode `Order.packagingDescription` is (`4 × EUR pallet`). Either way the board and job sheet show the load with no driver-side change, and nothing the client typed is overwritten.
- [ ] Requests without `items` still take the current path unchanged until the legacy path is removed (rollout safety).
- [ ] The vehicle the form recommends is serviceable **for the order's body type**, using the same rule the server applies.

### Catalogue and landing
- [ ] `GET /api/item-catalogue` returns the active catalogue in the request locale. It is public and cached.
- [ ] Admins can create, edit, reorder and deactivate catalogue entries. Entries are deactivated, never deleted.
- [ ] The landing page shows goods shortcuts where it showed vehicles. A shortcut carries through sign-up/sign-in and opens the booking form on that shortcut.

### Quality
- [ ] `tests/load-plan.spec.ts` covers the derivation and recommendation rules listed in task-02.
- [ ] `tests/i18n-catalogs.spec.ts` still passes; every new key exists in `en` and `ka`.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test` pass.

## Decisions (agreed 2026-10-13)

| Question | Decision |
|---|---|
| Claude free text in v1? | **No — later phase** (task-12). V1 is catalogue + "Other item". |
| Vehicle visibility for individuals | **Suggest + allow change.** Recommendation, one size up, "Change vehicle" link. |
| Business load input | **Pallets and item list.** The exact-weight-and-dimensions mode is dropped; a business that knows exact figures enters an "Other item" or pallet line with exact values. |
| Catalogue ownership | **Seeded now, admin-editable** (task-08). |
| Business load space | **Required, no default.** Individuals: derived and hidden. |

## Assumptions

- **"Main page" means two surfaces.** A signed-in client's home page *is* the booking form (`src/components/home/home-entry.tsx:108`), and its vehicle question is step 5. The signed-out landing page has no vehicle picker in a booking widget — its quote calculator silently picks the cheapest eligible class (`landing-quote-calculator.tsx:155-171`) — but it does carry a display-only `vehicle_types` section and a cargo-category dropdown. Both surfaces change: the booking form in tasks 10–11, the landing page in task-07.
- **The order's cargo category is derived from the items, not from the shortcut.** Each catalogue entry carries a `CargoCategory`. The order takes the **most restrictive** category present (the one whose `CARGO_CATEGORY_ALLOWED_VEHICLE_CATEGORIES` set is smallest). Ties go to the category with the most weight. This keeps the existing `cargo_vehicle_mismatch` rule in `pricing.ts` meaningful without the client ever picking a category. Consequence: picking "Moving home" with a sofa and ten boxes yields `FURNITURE_FURNISHINGS`, not `FULL_RELOCATION`, so a studio move is no longer forced into a heavy truck. That is intended. Flagged in action-required.
- **Fit heuristic constants** (tunable, in `load-plan.ts`):
  - `WEIGHT_SAFETY_FACTOR = 1.1`: the recommendation needs the total × 1.1 to be within payload.
  - `PACKING_FACTOR = 1.4`: the packed volume is the sum of item volumes × 1.4.
  - `OPEN_BED_NOTIONAL_HEIGHT_M = 2.0`: used for the volume of a class whose `cargoHeightM` is the `0` open-bed sentinel. It is read through `specCapability`, never from the raw column.
  - Floor area: the summed footprint of non-stackable items must be ≤ the deck's L × W.
- **Hard vs soft fit.** Weight (raw, no safety factor) and the largest-item envelope are hard: the server refuses them, exactly as today. The safety factor, packing volume and floor area only steer the recommendation and print warnings. They are estimates of estimates, and refusing a booking on them would refuse loads that fit.
- **Envelope semantics are unchanged.** `Order.cargoLengthM/WidthM/HeightM` keep meaning "size of the largest item". They are filled with the per-axis maximum over all lines after normalising each item so length ≥ width. That is the conservative reading `oversizeAxes` already expects.
- **Catalogue labels live in the database** (`labelEn`, `labelKa`), not in `src/messages`, because admins edit them. UI chrome copy lives in `src/messages` as usual.
- **Account type comes from `ClientProfile.accountType`**, fetched by the form from `GET /api/client-profile`. It is **not** resolved in `src/app/[locale]/page.tsx`, which is ISR-cached (`revalidate = 60`) and must stay free of per-client data. A client with no profile row, or a failed fetch, is treated as `INDIVIDUAL`. The server re-reads the account type itself.
- **Items are sized as carried, never rotated.** The fit check inherits `booking-fit.ts`'s no-rotation rule, and the tallest medium-duty class is 1.8 m. So wardrobes and bookcases are catalogued lying down or dismantled, while upright-only items (fridges, TVs) keep their standing height and therefore need a Closed Box Van or larger.
- **Small building items are `RETAIL_STOCK`.** `CONSTRUCTION_MATERIALS` is heavy-only and the order takes the most restrictive category, so paint, tiles, doors and plasterboard packs are catalogued as `RETAIL_STOCK`. Only bulk materials keep `CONSTRUCTION_MATERIALS`. Pallet lines declare their contents for the same reason.
- **Existing orders are untouched.** Orders placed before this feature have no `OrderItem` rows and keep their typed figures; every reader must tolerate zero items.

## Technical Constraints

House rules from `specs/client-dashboard-booking-and-payment/requirements.md` §Technical Constraints apply unchanged. In particular:

- **No `dark:` utilities** on the booking page.
- Landing token utilities only.
- `--font-price` with `tabular-nums` for every figure.
- `en-GB`-pinned `Intl`.
- British English, sentence case, no exclamation marks.
- Errors render inline as `<p role="alert">`.

Constraints specific to this feature:

- **`src/components/home/booking-form.tsx` is ~3,900 lines.** Only one task per wave may edit it. Tasks 04, 10 and 11 are serialised on it. Move new UI into sibling components (`item-list-picker.tsx`, `vehicle-recommendation.tsx`) and keep the form's edits to wiring.
- **`src/lib/orders/load-plan.ts` must be client-safe:** no `server-only`, no Prisma imports, no Prisma types in signatures. It is the same rule `booking-fit.ts` and `dispatch-fit.ts` follow, for the same reason: the form and the route must run one implementation.
- **Do not use `prisma db seed` to install the catalogue** on any shared database. `specs/client-dashboard-booking-and-payment/action-required.md` records that the seed's update branch overwrites tuned rows. Install the catalogue with an insert-only migration (`ON CONFLICT (code) DO NOTHING`), so admin edits survive.
- Migrations run automatically on Vercel **production** builds only (`scripts/migrate-deploy.mjs`). Staging must be migrated by hand.
- New native radio groups use `fieldset`/`legend` with `sr-only` radios, matching the crew and load-space pickers.
- The item search is a combobox. Use the shadcn primitives already in `src/components/ui` (check for `command`/`popover`) before hand-rolling one.
