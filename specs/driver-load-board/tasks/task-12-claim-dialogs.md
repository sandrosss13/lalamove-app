# Task 12: Confirm & lost-race dialogs

## Status

pending

## Wave

4

## Description

The two dialogs that decide whether a driver actually gets a load: the
confirm dialog (`"Confirm this shipment"`) a driver sees after clicking
Accept anywhere on the board, and the lost-the-race dialog it can hand off
to when another driver's confirm wins first. Implements sections 4 and 5 of
the design handoff (`UI:UX/Order Dashboard/design_handoff_driver_load_board/README.md`)
verbatim. The confirm dialog is the one place on the whole board that
actually calls the claim endpoint — the table, the drawer and the mobile
view all only ever *open* this dialog by id, never claim a load directly —
so this is also where the feature's core correctness property lives: the
race is decided by the server's atomic conditional update, never by a
client-side guess about whether a load is still open. Every money figure
this component renders is the driver's payout, never `Order.price`.

## Dependencies

**Depends on:** task-09-board-shell
**Blocks:** task-14-live-updates

**Context from dependencies:** task-09 builds the board route at
`/dashboard/loads`, the hub nav entry, the header, tabs, filter panel, and a
shared board state container holding `tab`, filters, `sortKey`/`sortDir`,
`selectedId` (the drawer's target), `dialogId` (**this task's** confirm
dialog target — the id of the load being confirmed, `null` when no confirm
dialog is open), `lostId` (**this task's** lost-the-race dialog target —
see "What `lostId` actually holds" below), `rejected` and `showRejected`. It
also creates **this task's file as an unfinished placeholder**, already
imported and rendered unconditionally by the board screen (both exported
dialogs render `null`/nothing when their target prop is `null`, so an
always-mounted placeholder is inert until the board sets `dialogId` or
`lostId`). This task replaces that placeholder's body, it does not create
the file from nothing. If task-09 lands with the placeholder under a
different path or export names than the ones this task declares below, treat
this task's names as the contract and update the board screen's imports to
match, not the reverse.

Loads come from `GET /api/loads` (task-06), returning per row: `id`,
`reference` (`GE-48210` form, IBM Plex Mono), a client name,
`pickupAddress`/`pickupCity`, `dropoffAddress`/`dropoffCity`,
`pickupWindowStart`/`pickupWindowEnd`/`deliveryDeadline`, `cargoCategory`,
`cargoWeightKg`, `cargoLengthM`/`cargoWidthM`/`cargoHeightM`,
`packagingDescription`, `itemQuantity`, `handlingTags` (`FRAGILE`,
`COLD_CHAIN`, `HAZMAT`, `TIME_CRITICAL`, `UPRIGHT_ONLY`, `HEAVY_ITEM`),
`helperCount`, `distanceKm`, `pickupDistanceKm` (nullable, unused by this
task), `driverPayout`, a per-km driver rate (unused by this task),
`createdAt` (unused by this task), and a row `state` of `"available" |
"claimed" | "mine"`. Claiming (task-08) returns 409 with the load's
`reference` when another driver won the race, and a distinct response when
the calling driver is offline — the exact shapes this task assumes for both
are given below, since the parent spec does not pin them precisely and
task-08 may not exist yet when this task is implemented.

## Files to Create

None — see Files to Modify.

## Files to Modify

- `src/components/driver-hub/screens/loads-claim-dialogs.tsx` — task-09
  creates this as a placeholder; this task replaces its contents, exporting
  `LoadsConfirmDialog` and `LoadsLostRaceDialog` as named exports (both
  dialogs live in one file, per this task's scope).

## Technical Details

### The money rule

Every money figure in both dialogs is `driverPayout`, already resolved
server-side by `driverPayoutFor` (`src/lib/orders/payout.ts`) and returned
on the row by `GET /api/loads`. **`Order.price` must never be imported,
requested or rendered here.** The confirm dialog's footer strip literally
reads "You are paid" — that line, and only that line, is `driverPayout`,
full stop; there is no derived sub-figure to reinterpret here the way
task-11's waiting allowance had to be.

### `data-admin-surface`

Both dialogs are shadcn `Dialog`s, which portal their `DialogContent`
outside the tree the driver hub shell's `data-admin-surface` root wraps.
Repeat `data-admin-surface=""` directly on every `DialogContent` this file
renders — two dialogs, two attributes, not one shared wrapper. Without it
the Lalamove `bg-accent`/`bg-muted`/border tokens both dialogs use resolve
to the marketing palette instead. See the doc comment on `DriverHubShell` in
`src/components/driver-hub/driver-hub-shell.tsx`.

### Row type

Identical to task-11-load-drawer.md's `LoadBoardRow` (repeated here so this
file is independently implementable; if a shared type already exists under
that name by the time this is built, import it instead of redefining it —
do not fork the field names):

```ts
type LoadRowState = "available" | "claimed" | "mine";

type LoadBoardRow = {
  id: string;
  reference: string;
  clientName: string;
  pickupAddress: string;
  pickupCity: string;
  dropoffAddress: string;
  dropoffCity: string;
  pickupWindowStart: string | null;
  pickupWindowEnd: string | null;
  deliveryDeadline: string | null;
  cargoCategory: CargoCategory;
  cargoWeightKg: number;
  cargoLengthM: number;
  cargoWidthM: number;
  cargoHeightM: number;
  packagingDescription: string | null;
  itemQuantity: string | null;
  handlingTags: CargoHandlingTag[];
  helperCount: number;
  distanceKm: number;
  pickupDistanceKm: number | null;
  driverPayout: number;
  driverRatePerKm: number;
  createdAt: string;
  state: LoadRowState;
};
```

Import `CargoCategory` and `CargoHandlingTag` as types only from
`@prisma/client`, matching `src/lib/cargo.ts`'s convention — this is a
`"use client"` file.

### `LoadsConfirmDialog`

```ts
export type LoadsConfirmDialogProps = {
  /** The load being confirmed, or `null` — `dialogId === null` closes this. */
  load: LoadBoardRow | null;
  /**
   * `HubAccount.kind` from `src/lib/dashboard/hub/account.ts` — `"BUSINESS"`
   * is this codebase's name for what the design and requirements.md call a
   * "COMPANY account". Drives the needs-assignment note below.
   */
  accountKind: "BUSINESS" | "INDIVIDUAL";
  /**
   * `HubAccount.isOnline` — `boolean | null`. `null` only for a `"BUSINESS"`
   * session, which has no online/offline concept at all (a company does not
   * itself drive). The offline-prompt flow below is therefore only ever
   * shown for `accountKind === "INDIVIDUAL"`.
   */
  driverIsOnline: boolean | null;
  /** Cancel, Escape (when not submitting), or overlay click (same). */
  onClose: () => void;
  /** 200 from the claim endpoint: move this load to `mine`, switch to My loads. */
  onClaimed: (load: LoadBoardRow) => void;
  /** 409 from the claim endpoint: close this dialog, open the lost-race one. */
  onLostRace: (reference: string) => void;
};
```

**The claim endpoint.** This task assumes task-08 exposes
`POST /api/loads/[id]/claim`, following the same `/api/loads/[id]/…` path
convention task-07's reject endpoint already uses
(`POST`/`DELETE /api/loads/[id]/reject`). If task-08's actual path differs,
the only change this task needs is the URL string in the `fetch` call below
— nothing else in this component's logic depends on the exact path.

**Response shapes this task assumes, and what to do if task-08 does not yet
match them exactly:**

- **Success:** any `2xx` response. This task does not need to parse a
  response body on success — call `onClaimed(load)` with the row already
  held in props, since the claim endpoint's only job is to flip that same
  load's ownership.
- **Lost the race (409):** a JSON body carrying the winning load's
  human-readable reference, per the parent spec's own description ("returns
  409 with the load's `reference`"). Assume the field is literally named
  `reference` (`{ error: string; reference: string }`). If task-08 names it
  differently (e.g. `loadReference`), adjust only the parse — the behaviour
  (close this dialog, open the lost-race dialog with that string) is
  unchanged. Do not fall back to `load.reference` from props: the whole
  point of reading it off the response is that the server, not this
  component's stale local copy, is the source of truth for what actually
  happened.
- **Offline (a distinct response from a generic failure):** assume
  `403` with a JSON body shaped `{ error: string; code: "DRIVER_OFFLINE" }`.
  A distinct `code` field is what lets this dialog tell "you are offline"
  apart from any other `403` (e.g. an unapproved account) without
  pattern-matching the human-readable `error` string, which is fragile and
  will silently stop working the moment somebody rewords the message. If
  task-08 does not yet emit a `code` field on this response, add one — a
  small, additive change to its route handler that does not affect any
  other caller of that endpoint, since nothing else reads this field today.
- **Any other non-2xx:** show `error` (or a generic fallback) as an inline
  message inside the dialog, matching the failure-display pattern already
  established in `src/components/driver-hub/hub-online-toggle.tsx` (inline
  `role="alert"` text next to the control, never a browser `alert()`).

**Submit flow:**

```
1. Driver clicks "Confirm and claim".
2. Set submitting = true, clear any prior error.
3. POST /api/loads/{load.id}/claim, body {} (no vehicle/company selection —
   see the needs-assignment note below for why COMPANY accounts submit no
   body field either).
4. response.ok            → onClaimed(load); (the board's own state update
                             is what actually moves it to "mine" and
                             switches tabs — see onClaimed's doc comment
                             above)
5. status === 409          → parse { reference }, call onLostRace(reference)
6. status === 403 with
   code === "DRIVER_OFFLINE" → show the offline prompt (below); do not
                                treat this as a terminal error
7. anything else            → show the inline error message; submitting = false
```

**The offline prompt (INDIVIDUAL accounts only).** Per task-08's contract,
an offline driver's claim is refused rather than silently allowed. Do not
dead-end on that refusal — replace the button row with an inline prompt:

> "You're offline — go online to claim?"
> **[Stay offline]** (outline) **[Go online & claim]** (default)

- "Stay offline" dismisses the prompt and returns the dialog to its normal
  state (buttons re-enabled, no request made).
- "Go online & claim" calls `PATCH /api/driver-profile/status` with body
  `{ isOnline: true }` — the exact endpoint and body
  `src/components/driver-hub/hub-online-toggle.tsx` already uses for the
  header's own toggle. On a `200` response (`{ isOnline: true }`),
  automatically re-submit the claim (step 3 above) without requiring a
  second click — the driver already expressed intent by clicking "Go
  online & claim" once. On a non-`200` response, show that endpoint's own
  `error` message inline (mirroring `HubOnlineToggle`'s own error handling)
  and leave the prompt up rather than silently reverting to the plain
  Confirm/Cancel buttons.
- This entire prompt only ever renders when `accountKind === "INDIVIDUAL"`.
  A `"BUSINESS"` session's `driverIsOnline` is `null` by construction (a
  company account has no online/offline concept), so the 403/`DRIVER_OFFLINE`
  response should never occur for one in practice — but defensively, if it
  ever did, fall through to the generic error message rather than rendering
  a prompt that offers to toggle a concept that does not exist for that
  account kind.

**COMPANY (`accountKind === "BUSINESS"`) needs-assignment note.** Per the
handoff's own "Open questions carried out of design" #1 and its resolution
in `specs/driver-load-board/requirements.md`'s Assumptions ("A company
claims with its account, not a specific truck... claim first, assign
afterwards"), a `"BUSINESS"` session claims a load with the company's
account as a whole — there is no vehicle or driver picker in this dialog.
Render an additional note between the summary card and the footer strip,
using a neutral tone (`bg-muted`, `border-border`, `rounded-md`, 13px, no
special colour — this is informational, not a warning): "You're claiming
with your company account. Assign a driver and vehicle to this load
afterwards." Shown only when `accountKind === "BUSINESS"`; an `INDIVIDUAL`
session sees no such note, since it claims for itself.

**HAZMAT acknowledgement.** If `load.handlingTags.includes("HAZMAT")`,
render a `Checkbox` (from `src/components/ui/checkbox.tsx`) with a label:
"I confirm my vehicle and licence meet this load's hazmat handling
requirements." **The "Confirm and claim" button is disabled until this box
is checked**, for a HAZMAT load only — a non-HAZMAT load's button is never
gated by this checkbox because the checkbox does not render for it. As with
task-11's HAZMAT note, state plainly in this component's doc comment that
this is a UI-only gate: nothing server-side checks it (`DriverLicence` has
no certification field — `specs/driver-load-board/requirements.md`'s
Non-Goals and `specs/driver-load-board/action-required.md`'s "Gate hazmat
loads on driver certification" item), so a driver who checks the box
inaccurately is not stopped by anything downstream. This checkbox exists to
make the driver pause and attest, not to enforce compliance.

**Layout (440px panel):**

```
Title: "Confirm this shipment"                              16px/600
Subtitle: "First come, first served. Confirming claims the
           order and closes it to other drivers."           13px muted

┌─ summary card (1px border, radius 0.5rem, margin 16px 20px) ─┐
│ 92px 1fr grid, 13px:                                          │
│   Load        {reference}                                     │
│   Pick-up      {pickupCity} · {window or "—"}                  │
│   Drop-off     {dropoffCity} · by {deadline or "—"}             │
│   Cargo        {cargoCategory label} · {packagingDescription ?? "—"} │
│   Helpers      {helper text, same rule as task-11's drawer}    │
│   Weight       {weight kg} · {dims}                             │
│   Distance     {distanceKm} km · 2 stops   ← constant 2, see below │
│ ─ footer strip (bg-muted, 1px top border) ─                    │
│   You are paid                          {driverPayout} 20px/600 │
└──────────────────────────────────────────────────────────────┘

[BUSINESS-only needs-assignment note]
[HAZMAT-only acknowledgement checkbox]
[offline prompt, replacing the buttons below, when applicable]

[Cancel  flex:1]  [Confirm and claim  flex:1.6]     both h-10 (40px)
```

**Stop count is a constant `2`** in this dialog too, for the same reason as
task-11's drawer: the schema supports exactly one pickup and one dropoff.
`specs/driver-load-board/requirements.md`'s Non-Goals: "No multi-stop... the
schema supports exactly one pickup and one dropoff." Hard-code the literal
string, do not derive it from any field.

**"Confirm and claim" disabled states:** disabled while `submitting`,
disabled while the offline prompt is showing (the prompt's own buttons are
what's actionable then), and disabled when `load.handlingTags` includes
`"HAZMAT"` and the acknowledgement checkbox is unchecked. Label reads
"Confirm and claim" normally and "Claiming…" while `submitting`, matching
the text-swap pattern (not a spinner icon) `HubOnlineToggle` already uses.

### `LoadsLostRaceDialog`

```ts
export type LoadsLostRaceDialogProps = {
  /** The reference of the load that was lost, or `null` to render nothing. */
  reference: string | null;
  /** "Back to load board" — clears `lostId`. */
  onBack: () => void;
};
```

**What `lostId` actually holds.** Despite its name (inherited from the
prototype's own state shape, which task-09 carries forward), this board
state value holds the **human-readable `reference` string** from the
claim endpoint's 409 response (e.g. `"GE-48233"`), not a database id. This
is deliberate: once a driver has lost the race, the board's local list may
no longer even contain that load (another driver claimed it, and a refetch
can drop it from the available list before this dialog closes), so there is
no reliable local row to look an id up against — the 409 response itself is
the only source of truth for what to name in this dialog. Wire this
component's `reference` prop directly to the board's `lostId` state value;
do not attempt to resolve it back to a `LoadBoardRow`.

**Layout (380px panel, 20px padding):**

```
"Just claimed by another driver"                              16px/600
"{reference} was confirmed a moment before you. It has
 been removed from your available list."                       13px muted

[Back to load board]   full width, h-10, default variant
```

`onBack` is the only interactive element besides the button that already
closes it (Escape/overlay) — clicking it, pressing Escape, or clicking
outside all call `onBack`.

### Focus, Escape and focus trapping

shadcn's `Dialog` (built on Radix `Dialog`) already provides a focus trap,
Escape-to-close, and focus restoration to whatever had focus when the
dialog opened, for free, as long as it is driven through `open` /
`onOpenChange` rather than mounted/unmounted by the parent. What this task
still has to do on top of that default:

1. **Wire `open`/`onOpenChange` to the board's state**, not to local
   component state: `<Dialog open={load !== null} onOpenChange={(open) => { if (!open) onClose(); }}>` for the confirm dialog, and the equivalent for the lost-race dialog keyed on `reference !== null`.
2. **Block Escape and outside-click while a claim request is in flight.**
   The default behaviour would let a driver dismiss the confirm dialog
   mid-submit, after which the eventual response (claimed, lost the race,
   or offline) would have nowhere to render. On `DialogContent`, pass
   `onEscapeKeyDown` and `onPointerDownOutside` handlers that call
   `event.preventDefault()` whenever `submitting` is true:
   ```tsx
   <DialogContent
     onEscapeKeyDown={(event) => { if (submitting) event.preventDefault(); }}
     onPointerDownOutside={(event) => { if (submitting) event.preventDefault(); }}
   >
   ```
3. **Repeat `data-admin-surface=""` on both `DialogContent`s** — Radix
   portals are the one thing the framework does not do for this codebase
   automatically; see the `data-admin-surface` section above.
4. Default `autoFocus` (Radix focuses the first focusable element —
   effectively the Cancel button in the confirm dialog) is unchanged by the
   design and needs no override.

## Acceptance Criteria

- [ ] `src/components/driver-hub/screens/loads-claim-dialogs.tsx` exports
      `LoadsConfirmDialog` and `LoadsLostRaceDialog` with the prop shapes
      above; each renders nothing when its target prop is `null`.
- [ ] Both dialogs' `DialogContent` carry `data-admin-surface=""`.
- [ ] Neither `Order.price` nor any variable/prop named `price` is read,
      imported or referenced anywhere in the file — verified by grep. "You
      are paid" renders `driverPayout` exactly as returned by the API, at
      20px/600, tabular-nums.
- [ ] The confirm dialog never assumes the load is still available before
      submitting — clicking "Confirm and claim" always issues
      `POST /api/loads/{id}/claim` and branches only on that response; no
      client-side pre-check of `load.state` skips or short-circuits the
      request.
- [ ] A `409` response with a `reference` field closes the confirm dialog
      (clears its target) and opens the lost-race dialog with that exact
      reference string — verified with a mocked `409` response in a
      component test or manual check.
- [ ] A `2xx` response calls `onClaimed(load)`; the confirm dialog does not
      itself flip `load.state` to `"mine"` or switch tabs — that is the
      board's responsibility on receiving the callback.
- [ ] A `403` response with `code === "DRIVER_OFFLINE"` replaces the button
      row with the offline prompt; clicking "Go online & claim" issues
      `PATCH /api/driver-profile/status` with `{ isOnline: true }` and,
      on success, automatically retries the claim request without a second
      click.
- [ ] The needs-assignment note renders only when `accountKind ===
      "BUSINESS"`; the HAZMAT checkbox renders only when
      `load.handlingTags` includes `"HAZMAT"`, and "Confirm and claim" is
      disabled until it is checked in that case.
- [ ] The summary card's Distance row always ends in the literal string
      `"2 stops"`, never a value derived from a field.
- [ ] `DialogContent` ignores Escape and outside-click while `submitting`
      is `true` in the confirm dialog.
- [ ] The lost-race dialog's body names the load by the `reference` prop
      value, not by any id, and its only interactive control besides
      dismissal is "Back to load board", which calls `onBack`.
- [ ] `pnpm check` passes with no lint or type errors.

## Notes

- This task does not touch `src/components/driver-hub/screens/loads-screen.tsx`,
  `loads-table.tsx`, the board's state container, `loads-detail-drawer.tsx`
  (task-11), or any mobile-view file (task-13) — all in the same wave. If
  any of those do not yet exist when this task starts, build against the
  props interfaces defined above and let the board screen's own task wire
  the call sites.
- task-14 (live updates, the next wave) depends on this task specifically
  because it needs to know how a claimed-elsewhere load is represented once
  this dialog's flow has run — read `onClaimed`/`onLostRace`'s doc comments
  above if implementing that task later; they are the contract task-14
  builds its polling reconciliation against.
- Small formatters (clock/date formatting pinned to `HUB_TIME_ZONE`, the
  helper-count text, etc.) are defined locally in this file, mirroring
  task-11's drawer, rather than shared through a cross-screen format module
  — see that task's Notes for why.
