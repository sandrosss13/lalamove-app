repo: sandrosss13/lalamove-app
branch: fix/suspended-account-gate

## Last sync

date: 2026-09-09T22:20:00Z

### Produced in this project

- Two self-contained artboards for the driver job sheet — the screen a driver works from **after**
  they claim a load. Phone-first (390 × 844) with desktop as a single 720px column pass.
- `_ds_bundle.css`, `fonts/` and `styles.css` copied byte-for-byte from
  `UI:UX/Order Dashboard/design_handoff_driver_load_board/`, so both artboards render offline.
- No file under `src/` was touched. This handoff is design only.

## Screen map

| Project screen | Repo files |
| --- | --- |
| `Driver Job Sheet — Phone.dc.html` (all five states) | new: `src/app/dashboard/(hub)/jobs/[id]/page.tsx` · reuse: `src/components/driver-hub/screens/jobs-detail-panel.tsx`, `.../loads-detail-parts.tsx`, `.../loads-drawer.tsx`, `src/components/driver-hub/hub-primitives.tsx`, `hub-status.ts` |
| `Driver Job Sheet — Desktop.dc.html` (same five states, 720px column) | same as above |

### Section → source, artboard by artboard

| Artboard section | Repo file it corresponds to | Status |
| --- | --- | --- |
| Job header · status pill | `hub-primitives.tsx` → `HubStatusBadge`; tones in `hub-status.ts` | exists |
| Job header · `driverPayout` at 26px | `loads-drawer.tsx:275-282` (`formatGelExact`, `text-[26px] tracking-[-0.02em]`) | exists |
| Payout + overtime lines, "Paid to you" | `jobs-detail-panel.tsx:226-240, 444-478` (`buildFareLines`) | exists |
| Timeline · 3 steps, dot states, timestamps | `jobs-detail-panel.tsx:139-176, 399-436` | exists |
| Contacts · name, `tel:`, details, both stops | `jobs-detail-panel.tsx:267-308, 499-503` (`StopContactRow`, `toTelHref`) | exists |
| Route stops · markers, city, window, deadline | `loads-drawer.tsx:289-331`; `RouteStopMarker` / `RouteStopHeading` in `loads-detail-parts.tsx:208-247` | exists |
| Cargo spec · 8 rows | `loads-detail-parts.tsx:263-303` (`cargoRows`, `CargoSpecList`) | exists |
| Handling tag pills | `loads-detail-parts.tsx:317-339` (`HandlingTagPills`) | exists |
| Compliance advisories (hazmat, cold chain) | `loads-detail-parts.tsx:407-444` — not drawn (this order carries neither tag), but the slot is above the action bar | exists |
| Empty / not-found state | `hub-primitives.tsx` → `HubEmptyState`; copy from `src/app/orders/[id]/track/page.tsx:96` | exists |
| `SampleNote` badges | `hub-primitives.tsx` → `SampleNote` | exists |
| Card, section label, spec grid, touch classes | `hub-primitives.tsx` → `HubCard`; `SECTION_LABEL_CLASSES` in `loads-detail-parts.tsx:92`; `TOUCH_TARGET_CLASSES` in `loads-detail-sheet.tsx:116` | exists |
| Confirmation dialog geometry | `loads-claim-dialogs.tsx:470-476, 660-720` (`sm:max-w-[440px]`, `flex-1` / `flex-[1.6]`, `data-admin-surface` on the portalled content) | exists |
| Tokens, `[data-admin-surface]` contract | `src/app/globals.css:150-178`, `:626-642` | exists |
| **Start delivery** button | `src/app/api/orders/[id]/start/route.ts` — endpoint exists, **no UI caller anywhere** | new UI |
| **Mark delivered** button + dialog | `src/app/api/orders/[id]/complete/route.ts` — endpoint exists, **no UI caller anywhere** | new UI |
| **Waiting time** field | nothing — no precedent in the product; `complete` 400s without it | new UI |
| **Input with a unit affix** (`min`) | not composable from the 15 files in `src/components/ui/` | new component work |
| **Navigate** | nothing — zero matches for `maps.google`, `geo:`, `waze`, `window.open` | new behaviour |
| **Received by** | nothing — `Order` has no `receivedBy` column | new column + endpoint change |
| **The route itself** | `src/app/dashboard/(hub)/jobs/[id]/page.tsx` — first `[id]` segment in the hub | new route |

### Files that change when this ships

| File | Change |
| --- | --- |
| `src/components/driver-hub/screens/loads-detail-parts.tsx` | delete `JOB_SHEET_TITLE` ("…proof of delivery will live there") — v1 captures no evidence. Keep `ClaimedByYouNote`; it becomes true. |
| `src/components/driver-hub/screens/loads-drawer.tsx:359` | drop `disabled`, swap for `asChild` + `Link` to `/dashboard/jobs/[id]` |
| `src/components/driver-hub/screens/loads-detail-sheet.tsx:386` | same |
| `src/components/driver-hub/screens/loads-mobile.tsx:559` | make it a link |
| `src/components/driver-hub/driver-hub-job-pill.tsx:37-46` | the comment names this exact URL as the route it is waiting for |
| `prisma/schema.prisma` | nullable `receivedBy` on `Order`, only if that field survives review |
| `src/app/api/orders/[id]/complete/route.ts` | accept `receivedBy` alongside `waitingMinutes`, only if that field survives review |

### Data notes carried into the spec

- Read Prisma server-side, not `GET /api/loads`: that endpoint serialises status as only
  `"available" | "claimed" | "mine"`, and telling `ACCEPTED` from `IN_TRANSIT` is exactly what gates
  the two buttons. There is no `GET /api/orders/[id]`.
- Follow `src/app/orders/[id]/track/page.tsx`: server component, `dynamic = "force-dynamic"`,
  `auth.api.getSession`, ownership check, generic not-found.
- Use `CARRIER_ORDER_PARTY_SELECT`. `ORDER_PARTY_SELECT`, which
  `specs/driver-load-board/action-required.md` names, is dead code.
- A job sheet needs a **third view model**: `HubJob` has contacts, timeline and money but no cargo;
  `HubLoad` has cargo and windows but no timeline or raw status.
- `scripts/seed-driver-hub-personas.ts` never sets lat/lng, so the null-coordinate state the
  artboards draw is the state every persona demo is in.

## Rendering notes

- Both artboards link `styles.css`, which imports `fonts/fonts.css` and `_ds_bundle.css`. Tokens
  (`--border`, `--muted-foreground`, `--primary`, `--input`, `--ring`, …) resolve from the bundle's
  copy of `globals.css`, including the `body:has([data-admin-surface])` block — so the artboards
  resolve exactly the values the app does.
- The bundled IBM Plex subsets cover `U+0000-00FF` and a little punctuation. **`₾` (U+20BE) and the
  Georgian block (U+10A0–10FF) are not in them**, so both fall back to a system face — in the
  artboards and in the app alike, since the app ships the same subsets. The lari sign therefore sits
  tight against the first digit. That is the product's real rendering, not an artboard artefact; if
  it is unacceptable, the fix is a wider font subset, in `globals.css`, for every screen at once.
- No `support.js`: the artboards are static HTML with no `{{ }}` bindings, so they render standalone
  in any browser. (The load board artboard references a `support.js` that is not in its folder.)

## In-flight work this handoff did not touch

At the time these artboards were drawn the working tree already carried untracked, in-flight
implementation work for this same feature — `prisma/migrations/20260909120000_order_received_by/`,
`src/lib/dashboard/hub/job-sheet.ts`, `src/components/driver-hub/hub-job-parts.tsx` — plus ~20
modified files across `src/app/api/`, `src/components/home/` and `src/lib/orders/`. None of it was
read into or altered by this handoff, and the "does not exist yet" column above is stated against
the brief, not against that uncommitted tree. If the `receivedBy` migration lands, the two
`SampleNote` badges on that field come off; nothing else in the artboards changes.
