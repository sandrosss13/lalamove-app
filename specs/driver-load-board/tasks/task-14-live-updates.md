# Task 14: Live claim updates

## Status

pending

## Wave

5

## Description

Keeps the load board fresh as other drivers claim loads, without disturbing
whatever the current driver is doing on it. The design states the requirement
directly: *"In production this is a subscription/poll on the board; rows
should update in place without losing scroll position or selection."* This
task adds that refresh loop to the shared board state, reconciles it into the
existing list by load `id` instead of replacing the list, and makes sure a
load claimed by someone else transitions visibly rather than vanishing —
including from underneath an open drawer, sheet or confirm dialog.

## Dependencies

**Depends on:** task-10-loads-table, task-12-claim-dialogs
**Blocks:** None

**Context from dependencies:** task-10 built the desktop loads table — the
sortable, seven-column list whose rows this task must be able to update
without remounting the `<table>` or resetting its scroll position. task-12
built the confirm dialog and the lost-the-race dialog, both driven by the
shared board state's `dialogId`/`lostId` fields; this task must not let a
background refresh interfere with either while open. Both were built on top
of task-09's board route and shared state container (wave 3, already complete
by the time this wave runs even though it is not this task's direct
dependency), which holds:

- `tab`, `sortKey`/`sortDir`, filters, `selectedId`, `dialogId`, `lostId`,
  `rejected`, `showRejected`, `statuses` — all UI-owned state this task must
  leave untouched by a poll.
- the fetched `loads` array and an `isLoading` flag — this task's actual
  target: it upgrades a one-shot fetch into a recurring, visibility-aware one.

This task refers to that container as `useLoadsBoard()`
(`src/components/driver-hub/screens/loads-board-state.ts`), matching
task-13's naming assumption — **if task-09 named it differently, apply these
changes to whatever file actually owns the `loads` fetch; the mechanism below
is the fixed requirement, the file name is not.**

Loads come from `GET /api/loads` (task-06): each row carries `id`,
`reference` (`GE-48210` form), client name, pickup/dropoff address and city,
`pickupWindowStart`/`pickupWindowEnd`/`deliveryDeadline`, `cargoCategory`,
`cargoWeightKg`, `cargoLengthM`/`WidthM`/`HeightM`, `packagingDescription`,
`itemQuantity`, `handlingTags`, `helperCount`, `distanceKm`,
`pickupDistanceKm` (nullable), `driverPayout`, a per-km driver rate,
`createdAt`, and `status: "available" | "claimed" | "mine"`. Claiming
(`POST /api/loads/[id]/claim`, task-08) is an atomic conditional update on the
server: it returns 409 with the winning load's `reference` when another
driver already claimed it. **`driverPayout` is the only money figure this
task's code ever touches — this task does not add or change any rendering of
`Order.price`, and nothing here needs to.**

## Files to Create

None.

## Files to Modify

- `src/components/driver-hub/screens/loads-board-state.ts` (task-09's shared
  state container — see naming caveat above) — replace its one-shot fetch
  with a polling effect: fixed-interval refetch, paused while the tab is
  hidden, merged into `loads` by `id` rather than replacing the array, with a
  dwell/claimed-transition rule (see Technical Details).
- `src/components/driver-hub/screens/loads-table.tsx` (task-10) — confirm/adjust
  that rows are keyed by `load.id` (not array index) and that the table body
  is never given a `key` that changes across a refresh, so React reconciles
  in place instead of remounting — this is what actually preserves scroll
  position; the merge logic above only gets the *data* right, this is what
  keeps the *DOM* stable.
- `src/components/driver-hub/screens/loads-confirm-dialog.tsx` and
  `loads-lost-race-dialog.tsx` (or wherever task-12 named them — see the
  naming caveat in that task's own file) — ensure the confirm dialog's
  rendered summary (load reference, route, cargo, price) is captured once
  when `dialogId` is set rather than derived live from `board.loads` on every
  render, so a background poll cannot change the numbers a driver is looking
  at mid-decision (see "Never second-guess an open dialog" below).

## Technical Details

### Polling interval: 10 seconds, paused when hidden

**Recommendation: plain polling for v1, not Supabase Realtime, despite
`@supabase/supabase-js` already being a dependency** (used today only for
signed-upload flows — `src/lib/supabase-browser-client.ts`). Realtime would
need a Postgres publication on `Order`, a channel subscription lifecycle, and
a reconnect/backoff story the board does not have today; polling needs none
of that and is trivially easy to back out or retune (change one constant) if
it turns out to be wrong. Given the board's actual usage pattern — a driver
opens it, scans a short list, and either claims something within roughly a
minute or leaves — the gap between "instant" and "every 10 seconds" is not
something a driver waiting to decide would even notice, while the gap between
"one poller per open tab" and "one persistent WebSocket per open tab" is a
real difference in Supabase connection-pool pressure once enough drivers have
the board open simultaneously (unlike `order-tracking-map.tsx`'s 5-second
poll, which has at most one or two viewers per order, every eligible driver
can have this board open at once). **This interval is explicitly flagged for
review in `specs/driver-load-board/action-required.md`** ("Watch the
live-update poll interval... consider moving to Supabase Realtime") — treat
10 seconds as a considered default, not a settled constant.

```ts
/** How often the board re-fetches while visible. Flagged for review in
 * specs/driver-load-board/action-required.md — see that file before tuning. */
const LOADS_POLL_INTERVAL_MS = 10_000;
```

Implementation, following the `AbortController` + `setInterval` pattern
already established by `src/components/order-tracking-map.tsx`'s
`TrackingMap`, extended with the visibility handling that component does not
need (an order-tracking session is opened and closed by one person watching
one delivery; the load board is left open by a driver between jobs and must
not burn battery or requests while backgrounded):

```ts
useEffect(() => {
  let cancelled = false;
  const controller = new AbortController();

  async function refetch(): Promise<void> {
    try {
      const response = await fetch("/api/loads", { signal: controller.signal });
      if (!response.ok || cancelled) return;
      const payload = (await response.json()) as { loads: LoadRow[] };
      if (cancelled) return;
      mergeLoads(payload.loads);
    } catch {
      // Network blip, or an abort on unmount/refetch overlap — keep the last
      // known snapshot and let the next tick try again, exactly like
      // order-tracking-map.tsx's fetchDriverLocation does.
    }
  }

  void refetch(); // immediately on mount, not just on the first tick

  const timer = setInterval(() => {
    if (document.visibilityState === "hidden") return; // paused while backgrounded
    void refetch();
  }, LOADS_POLL_INTERVAL_MS);

  function onVisibilityChange() {
    if (document.visibilityState === "visible") {
      void refetch(); // refresh immediately on refocus, don't wait for the next tick
    }
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    cancelled = true;
    controller.abort();
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}, []);
```

### Updating rows in place: merge by `id`, never replace-and-remount

The board's derived list is already computed from one `loads` array via a
filter → sort pipeline (vehicle-fit is server-side; tab/rejected/city/
weight/tag filters and sort are client-side over the full response — see
task-09/task-10). A poll response must update that **one** array's contents
without ever calling `setLoads(payload.loads)` directly, because a bare
replace changes every object's identity on every tick, which — combined with
`React.memo`/array `.map()` — is exactly what causes list items to remount,
which is what loses scroll position and can reset any row-local state (e.g. a
button mid-hover/mid-press). Reconcile instead:

```ts
/** How long a row that just flipped to `claimed` (or disappeared from the
 * server's response after having been `available`) stays visible before this
 * task drops it from the Available list. Long enough that a driver who had it
 * open, or was mid-scroll near it, sees the transition rather than a jump. */
const CLAIMED_DWELL_MS = 20_000;

// Tracks when each id was first observed transitioning to claimed-by-other.
// A ref, not state: it must not itself trigger a re-render, only gate what
// mergeLoads keeps on the next tick it runs.
const claimedAtRef = useRef<Map<string, number>>(new Map());

function mergeLoads(incoming: LoadRow[]): void {
  setLoads((prev) => {
    const prevById = new Map(prev.map((l) => [l.id, l]));
    const incomingIds = new Set(incoming.map((l) => l.id));
    const now = Date.now();

    // Every load the server still returns: take its fresh data, and stamp the
    // moment it flips available -> claimed so the dwell window below can find
    // it later (this also covers the case where GET /api/loads keeps
    // returning a recently-claimed row with status "claimed" for a while,
    // rather than dropping it immediately — see Notes).
    const next: LoadRow[] = incoming.map((load) => {
      const prevLoad = prevById.get(load.id);
      if (prevLoad?.status === "available" && load.status !== "available") {
        claimedAtRef.current.set(load.id, now);
      }
      return load;
    });

    // Loads the server no longer returns at all. If one was available a
    // moment ago and is now gone, the most likely explanation is someone else
    // claimed it and it dropped out of the PENDING query task-06 runs — treat
    // that the same as an explicit "claimed" status rather than letting it
    // vanish. Keep it while inside its dwell window, or while the driver
    // still has it open (selected, in a dialog, or the lost-the-race target),
    // whichever is longer.
    for (const prevLoad of prev) {
      if (incomingIds.has(prevLoad.id)) continue;
      if (prevLoad.status === "mine" || prevLoad.status === "claimed") {
        // Already resolved for this driver, or already mid-dwell from an
        // earlier tick with no fresher data to update it — drop silently.
        continue;
      }
      const claimedAt =
        claimedAtRef.current.get(prevLoad.id) ?? (() => {
          claimedAtRef.current.set(prevLoad.id, now);
          return now;
        })();
      const withinDwell = now - claimedAt < CLAIMED_DWELL_MS;
      const isOpen =
        prevLoad.id === selectedIdRef.current ||
        prevLoad.id === dialogIdRef.current;
      if (withinDwell || isOpen) {
        next.push({ ...prevLoad, status: "claimed" });
      }
    }

    return next;
  });
}
```

`selectedIdRef`/`dialogIdRef` are refs mirroring the container's own
`selectedId`/`dialogId` state (updated in the same setter that updates the
state, or via a `useEffect` syncing them) so `mergeLoads` — which must not
itself depend on `selectedId`/`dialogId` changing, or the polling effect above
would need to restart its interval on every selection change — can read their
current value without becoming a new function identity every render.

**`sortKey`, `sortDir`, `tab`, filters, `rejected`, `showRejected` are never
touched by `mergeLoads`.** They live in the same container but are set only
by their own explicit setters (clicking a header, typing a filter, clicking a
tab) — a poll response updates `loads` and nothing else in the container's
state. The derived `visibleLoads` pipeline re-runs automatically because it
depends on `loads`, but its *inputs* besides `loads` are exactly whatever the
driver last set them to.

### A load claimed while its drawer or sheet is open

This is the scenario the design calls out by name (the prototype flips
`GE-48233` to `claimed` 6 seconds after mount specifically to demonstrate it).
With the merge rule above, the mechanism is already in place: the row's
`status` in `loads` flips to `"claimed"`, `visibleLoads` re-derives, and
because `selectedId` (owned by task-09's state, untouched by this task)
still points at that same `id`, the already-open drawer (task-11) or sheet
(task-13) re-renders with its own `claimed` branch — "Claimed by another
driver — no longer available" — instead of disappearing. This task does not
modify `loads-drawer.tsx` or the mobile sheet to make that happen; it falls
out for free from `selectedId` being left alone and the row being kept (not
dropped) for `CLAIMED_DWELL_MS`. The row is removed from the *Available loads*
tab's list only once both conditions lapse: past its dwell window **and** no
longer `selectedId`/`dialogId` — so closing the drawer after seeing the
"claimed" notice is what allows the next poll to finally drop it.

### Never second-guess an open confirm dialog

**The race is resolved server-side, on submit, not by the client watching the
board.** `POST /api/loads/[id]/claim` is an atomic conditional update (the
same pattern as the existing `src/app/api/orders/[id]/accept/route.ts:144` —
`updateMany` with the status/assignment preconditions in the `where` clause,
`count === 0` meaning this request lost) and returns 409 with the winner's
`reference` when the driver's own confirm loses the race. That response —
and only that response — is what opens the lost-the-race dialog
(`board.setDialogId(null); board.setLostId(id)`).

A background poll must not do any of the following while `dialogId` is set:

- close the confirm dialog because the polled row's `status` is no longer
  `"available"`;
- silently swap it for the lost-the-race dialog;
- change any figure the dialog is currently displaying (reference, route,
  cargo summary, price) even if the corresponding `loads` entry updates.

Concretely: the confirm dialog (task-12) must read the load it is showing
from a **snapshot captured once when `dialogId` was set** — e.g. `const
load = useMemo(() => board.loads.find((l) => l.id === dialogId), [dialogId])`
is exactly wrong here, because `board.loads` in the dependency array would be
fine, but reading `.find()` fresh on every render of `board.loads` (which
changes every poll tick) means the summary silently updates even though
`dialogId` itself never changed. The correct shape freezes the snapshot on
the transition into "open":

```ts
const [dialogSnapshot, setDialogSnapshot] = useState<LoadRow | null>(null);

useEffect(() => {
  if (dialogId === null) {
    setDialogSnapshot(null);
    return;
  }
  // Runs only when dialogId itself changes — i.e. only on open — never on a
  // background loads refresh while the same dialog stays open.
  setDialogSnapshot(board.loads.find((l) => l.id === dialogId) ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: must
  // NOT re-run when board.loads changes, only when dialogId does.
}, [dialogId]);
```

The dialog's **submit** handler still calls the live claim endpoint and reacts
to its real response (200 → close, switch to My loads; 409 → close, open
lost-the-race with the *server's* winning reference) — polling is completely
orthogonal to that request/response pair and must never substitute for it or
pre-empt it.

### Not an offer/cascade engine

This task adds freshness, not matching logic. Per requirements.md's
Non-Goals: *"No offer/cascade engine. This is a first-come-first-served open
board. There is no scoring, no countdown, no sequential offer, no
auto-assignment."* Nothing in this task ranks loads for a driver, times out an
offer, or pushes a load toward one driver over another — it only makes sure
the same open board a driver is already looking at reflects what other
drivers have done on it, as fast as `LOADS_POLL_INTERVAL_MS` allows.

## Acceptance Criteria

- [ ] `GET /api/loads` is refetched on a fixed interval
      (`LOADS_POLL_INTERVAL_MS`, documented as `10_000`) rather than once on
      mount only.
- [ ] Polling stops issuing requests while `document.visibilityState ===
      "hidden"` and issues one immediately on the `visibilitychange` back to
      `"visible"`, without waiting for the next scheduled tick.
- [ ] A poll response is merged into the existing `loads` array by `id`
      (upsert semantics) — the merge function never calls the array setter
      with the raw response array.
- [ ] `selectedId`, `dialogId`, `lostId`, `sortKey`/`sortDir`, `tab`, the
      filter fields, and `showRejected` are unread and unwritten by the merge
      function — verified by the merge function's own signature/body not
      referencing them (aside from the read-only refs used to decide dwell
      eligibility).
- [ ] The desktop table's rows are keyed by `load.id`, and its list container
      does not remount across a poll (verified by an unchanged container
      `key`/identity and by scroll position surviving a manual test: scroll
      the table, wait past one poll interval, confirm the scroll offset is
      unchanged).
- [ ] A load open in the drawer or sheet that flips to `claimed` on the server
      is shown with the `claimed` treatment in place, still selected, rather
      than being removed from the list or closing the drawer/sheet.
- [ ] A `claimed`-by-other row remains in the Available list for at least
      `CLAIMED_DWELL_MS` after the transition, or until it is no longer
      selected/dialog-targeted, whichever is later — then is dropped on a
      subsequent poll.
- [ ] The confirm dialog's displayed load data (reference, route, cargo,
      price) is fixed at the moment it opens and does not change value while
      it stays open, even if a poll arrives in the meantime.
- [ ] The confirm dialog never transitions to the lost-the-race dialog except
      as a direct result of its own submit request receiving a 409 — a poll
      alone, no matter what status it reports for the same load, never
      triggers that transition.
- [ ] No scoring, countdown, sequential-offer, or auto-assignment logic is
      introduced anywhere in this task's changes.
- [ ] `pnpm check` passes with no new lint or type errors.

## Notes

- **File-name hedges.** Like task-13, this task assumes `useLoadsBoard()` in
  `loads-board-state.ts`, `loads-table.tsx`, and task-12's two dialog files
  under the names given above. Apply these changes to whatever task-09/10/12
  actually named them; the mechanism (interval, visibility pause, id-merge,
  dwell window, frozen dialog snapshot) is the fixed requirement.
- **Why the merge logic treats "disappeared" the same as an explicit `claimed`
  status.** task-06 (`GET /api/loads`) is not a dependency of this task, and
  its exact query shape is not settled here — it may keep briefly returning a
  freshly-claimed row with `status: "claimed"`, or it may simply stop
  returning it once the underlying order leaves `PENDING`. This task's merge
  logic is written to produce the correct driver-facing behaviour either way,
  so it does not need task-06 to be reopened or clarified to be correct.
- **Realtime remains the documented upgrade path, not a requirement of this
  task.** If polling proves too coarse or too expensive once there is real
  driver volume, `@supabase/supabase-js` (already a dependency) can back a
  channel subscription on `Order` changes with no new package — but that is a
  follow-up, tracked in `specs/driver-load-board/action-required.md`, not
  something this task implements speculatively.
- **Rejections and claims by the current driver are not "live updates" in the
  sense this task handles.** Rejecting or claiming a load is a direct
  request/response the driver initiated (task-07/task-08); this task only
  concerns itself with changes made by *other* drivers surfacing through the
  poll.
