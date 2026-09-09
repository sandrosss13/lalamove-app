# Task 01: Hub persona model + persona-keyed nav

## Status

complete

## Wave

1

## Description

Introduces `HubPersona` — `"INDEPENDENT" | "ROSTER" | "BUSINESS"` — as the
Driver Hub's first-class account axis, derived exactly once inside
`resolveHubAccount()` and carried on `HubAccount` alongside the existing
`HubAccountKind`. Today the hub collapses three genuinely different registered
-driver account shapes into a two-valued `kind`, and the third shape (a driver
employed on a company's roster) is distinguished in exactly two places in the
whole codebase. Nothing downstream can branch on an axis that does not exist,
which is why four screens are byte-identical for all three shapes.

This task also re-keys the sidebar's information architecture onto that axis:
the `businessOnly` / `rosterHidden` boolean pair on `HubNavItem` is replaced by
a single `hiddenFor: readonly HubPersona[]` rule, and the Wallet link joins the
Load Board in being withheld from a roster driver — a new behaviour in this
feature, not a re-expression of an existing one.

**This is the keystone task. Every other task in this spec reads
`account.persona`, so the type name, the union members, the derivation rule and
the field name below are contractual — do not rename them, do not reorder the
union, and do not add a fourth member.** Nine other task files quote this
shape verbatim.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-02-today-persona-data, task-03-earnings-persona-data,
task-04-performance-persona-data, task-05-vehicles-roster-guard,
task-06-today-screen-personas, task-07-earnings-screen-fleet,
task-08-performance-screen-personas, task-09-vehicles-screen-roster,
task-10-shell-persona-chrome

**Context from dependencies:** None — this is the first task in the feature and
depends on nothing. Everything it needs already exists in `main`. What follows
is the context a later task would otherwise have had to be told; it is restated
here because this file must be readable on its own.

The Driver Hub lives under `src/app/dashboard/(hub)/` and is framed by
`DriverHubShell` (`src/components/driver-hub/driver-hub-shell.tsx`), which a
server layout (`src/app/dashboard/(hub)/layout.tsx`) hands a single `HubAccount`
resolved by `resolveHubAccount()` (`src/lib/dashboard/hub/account.ts`). That
account object is handed straight into `"use client"` components, so every field
on it must be plain serialisable data — no `Date`, no Prisma model instance.
`resolveHubAccount()` is wrapped in React's `cache()`, so the layout and the
page beneath it share one query and one derivation per request.

The hub has eight screens, declared once in
`src/components/driver-hub/driver-hub-nav.ts` as `HUB_NAV`. That file is the
single source of truth for the sidebar's links *and* for the sticky header's
per-screen title and subhead. `hubNavForAccount()` filters `HUB_NAV` for the
signed-in account and has exactly one call site — line 189 of
`driver-hub-shell.tsx`.

## The three personas

This table is the feature's central fact. Restate it in your head before you
write a line of code.

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their own vehicle, browses the open Load Board, keeps their own fares. |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer** | Employed driver. Work arrives through company dispatch, and fares are paid to the employer, not to them. |
| `BUSINESS` | `"BUSINESS"` | set — their **own** company | Fleet owner. Gets the Drivers and Employees screens. |

Two traps, both of which have already been hit once in this codebase:

1. **`companyId !== null` is not, on its own, the roster test.** A `BUSINESS`
   account also has a non-null `companyId` — it names *its own* company. The
   roster test is the conjunction `kind === "INDIVIDUAL" && companyId !== null`.
   Reading `companyId` alone classifies every fleet owner as one of their own
   employees and hides the Load Board and the Wallet from precisely the accounts
   those screens exist to serve.
2. **`DriverProfile.accountType` (`DriverAccountType`) is a different axis and
   must never be used for this.** A sole-proprietor driver who registered as a
   business is still `kind: "INDIVIDUAL"` and, with no employer, persona
   `INDEPENDENT`. Branch on `persona`; never on `accountType`.

## Files to Create

None. This task adds no new modules — `HubPersona` belongs beside
`HubAccountKind` in the file that already owns the hub's account shape, and a
separate `persona.ts` would put the type in one file and its only derivation in
another.

## Files to Modify

- `src/lib/dashboard/hub/account.ts` — add the `HubPersona` type, add the
  `persona` field to `HubAccount`, derive it in both branches of
  `resolveHubAccount()`, and correct the driver branch's now-false comment about
  what `companyId` decides.
- `src/components/driver-hub/driver-hub-nav.ts` — replace `businessOnly` and
  `rosterHidden` on `HubNavItem` with `hiddenFor: readonly HubPersona[]`, set
  the new value on all eight `HUB_NAV` entries (adding `"ROSTER"` to `earnings`,
  which is new behaviour), and rewrite `hubNavForAccount()` to filter on
  `account.persona`.
- `src/components/driver-hub/driver-hub-shell.tsx` — **the `hubNavForAccount`
  call site at line 189 and its comment, and nothing else in the file.** The
  call expression itself does not change; the comment above it does, and you
  must verify the narrowed parameter type still accepts a full `HubAccount`.

  In particular, the `<DriverHubSidebar items={items} activeId={activeItem?.id} />`
  render site below it (line 197) is **deliberately left alone**. A later task
  in Wave 3 adds a required `persona` prop to `DriverHubSidebar` and will write
  `persona={account.persona}` there itself, at the same time as it adds the
  prop. Writing that line now would reference a prop that does not exist yet
  and would fail `pnpm typecheck` for the whole of Waves 1 and 2. `account`
  carries `persona` after this task, so the line is *tempting* and *wrong* —
  do not add it.

### Files that were checked and need no change

This was verified, not assumed. The searches and their results are recorded
here so a reviewer does not have to repeat them.

**`git grep -n "HubAccount" -- src/`** — every consumer of the `HubAccount`
*type* takes it as a parameter or a prop. **Not one of them constructs a
`HubAccount` object literal.** The only construction sites in the repository are
the two `return` statements inside `resolveHubAccount()` itself, both of which
this task edits. Adding a required field is therefore a non-breaking change
everywhere else. The full consumer list:

| File | How it uses `HubAccount` | Breaks? |
|---|---|---|
| `src/lib/dashboard/hub/today.ts:55,248,283,383` | `import type`; parameter to `hubOrderScope`, `loadComplianceSource`, `getHubToday` | No |
| `src/lib/dashboard/hub/earnings.ts:54,249,509` | `import type`; parameter | No |
| `src/lib/dashboard/hub/jobs.ts:41,249,409` | `import type`; parameter | No |
| `src/lib/dashboard/hub/performance.ts:53,197,219,241` | `import type`; parameter | No |
| `src/lib/dashboard/hub/vehicles.ts:44,252` | `import type`; parameter | No |
| `src/lib/dashboard/hub/drivers.ts:49,272` | `import type`; parameter | No |
| `src/lib/dashboard/hub/employees.ts:39,99` | `import type`; parameter | No |
| `src/app/api/loads/route.ts:23,351` | `import type`; `resolveScope(account: HubAccount)` | No |
| `src/app/api/dashboard/hub/earnings/export/route.ts:6,202` | `import type`; parameter | No |
| `src/app/dashboard/(hub)/loads/page.tsx:11,94` | `import type`; parameter | No |
| `src/components/driver-hub/driver-hub-header.tsx:10,22` | `import type`; prop | No |
| `src/components/driver-hub/driver-hub-shell.tsx:12,154` | `import type`; prop | No |
| `src/components/driver-hub/driver-hub-nav.ts:15,202` | `import type`; `Pick<…>` parameter | **Yes — this task edits it** |
| `src/lib/dashboard/hub/account.ts:34,144` | Declaration + the two construction sites | **Yes — this task edits it** |

**`git grep -n "businessOnly" -- src/`** and **`git grep -n "rosterHidden" -- src/`**
— both fields appear in **exactly one file**, `driver-hub-nav.ts` (the type
declaration, the eight `HUB_NAV` literals, three doc-comment mentions and the
two `filter` clauses). Nothing outside that file reads either boolean. Notably
`driver-hub-sidebar.tsx` receives `items: readonly HubNavItem[]` already
filtered and never inspects the flags itself.

**Test fixtures, mocks and sample objects: there are none.** The project's only
tests are four Playwright specs in `tests/` (`landing-quote-calculator.spec.ts`,
`carrier-payload-redaction.spec.ts`, `price-formatting.spec.ts`,
`service-level-pricing.spec.ts`); `git grep -n "HubAccount" -- tests/ scripts/ prisma/`
returns nothing. No Storybook, no `__mocks__`, no `*.fixture.ts`. So the usual
hazard of adding a required field — a hand-written literal somewhere that now
fails to typecheck — does not exist in this repository. Confirm this yourself
before you start; if a literal has appeared since this task was written, add it
to the list above and to your diff.

**Untracked `* 2.*` duplicates.** `src/app/api/loads/route 2.ts` and
`src/app/dashboard/(hub)/loads/page 2.tsx` are untracked macOS copy artefacts,
byte-identical to their originals, and Next compiles them because they sit under
`src/app`. Neither reads `businessOnly`, `rosterHidden` or `hubNavForAccount`, so
neither breaks. **Do not edit them and do not delete them** — deleting them is a
human decision recorded in `specs/driver-hub-personas/action-required.md`.

## Technical Details

### 1. The current code, verbatim

Read all three files in full before editing. The two that matter most are quoted
here so that you can see precisely what is changing and — just as importantly —
what is being *preserved*.

#### 1a. `src/lib/dashboard/hub/account.ts`, lines 24–79 (current)

```ts
/**
 * Which of the two hub shapes to render.
 *
 * Deliberately *not* the same axis as `DriverAccountType`: a driver who signed
 * up as a BUSINESS is still one person driving, and a driver on a fleet's
 * roster is too. Only a `LogisticsCompany` session — the fleet owner — gets the
 * business hub with its Drivers and Employees screens.
 */
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";

export type HubAccount = {
  kind: HubAccountKind;
  userId: string;
  /** Person's full name, or the company name for a COMPANY session. */
  displayName: string;
  /** Up to two uppercase initials for the avatar circle. */
  initials: string;
  /** Mono subline under the name, e.g. "Van · Tbilisi" or a VAT id. */
  identifier: string;
  /** Home city label, already humanised from the GeorgianCity enum. */
  city: string;
  /** Current online state; null for a COMPANY session, which has none. */
  isOnline: boolean | null;
  /**
   * … (long `isActivated` doc comment — leave it exactly as it is) …
   */
  isActivated: boolean;
  /**
   * … (long `canToggleOnline` doc comment — leave it exactly as it is) …
   */
  canToggleOnline: boolean;
  /** Set when a DRIVER belongs to a fleet. */
  companyName: string | null;
  driverProfileId: string | null;
  companyId: string | null;
};
```

#### 1b. `src/components/driver-hub/driver-hub-nav.ts`, lines 17–64 (current `HubNavItem`)

This is the exact shape you are changing. Note that `businessOnly` and
`rosterHidden` carry three paragraphs of reasoning between them, and that
reasoning is still true — it is being *relocated and updated*, not deleted.

```ts
/** One sidebar link, and the header copy for the screen behind it. */
export type HubNavItem = {
  /** Stable identifier, so a layout can ask for its own entry by name. */
  id: HubNavItemId;
  /** Sidebar label. */
  label: string;
  href: string;
  /**
   * Business-only screens. This is a *cosmetic* filter: hiding a link does
   * nothing about a hand-typed URL, so `/dashboard/drivers` and
   * `/dashboard/employees` must each also resolve the account kind
   * server-side and `redirect("/dashboard/today")` for an individual driver.
   * The link list is the convenience; the page guard is the boundary.
   */
  businessOnly: boolean;
  /**
   * Hidden for a DRIVER on a company's roster (`DriverProfile.companyId` set).
   *
   * Per `specs/driver-load-board/requirements.md`'s Assumptions: an employed
   * driver receives work through their company's dispatch, not the open
   * market, so the load board is not theirs to browse. The board's own
   * server-side guard (`src/app/dashboard/(hub)/loads/page.tsx`) redirects them
   * away even if they hand-type the URL, and `GET /api/loads` 403s them — this
   * field only controls the sidebar link, exactly the cosmetic-only
   * relationship `businessOnly` above already has to its own page guards.
   *
   * A separate axis from `businessOnly` because it cannot be expressed in
   * terms of it: a roster driver and an independent driver are both
   * `kind: "INDIVIDUAL"`, and the distinction lives on `companyId`.
   *
   * Only `loads` sets this today; every other entry is `false`.
   */
  rosterHidden: boolean;
  /** The 20px page title in the sticky header. */
  title: string;
  /**
   * The 13px muted subhead under the title — the design's copy for this
   * screen, used as the *fallback*.
   *
   * Four of these subheads are derived in the design (Today's date, Earnings'
   * selected range, and the roster counts on Jobs, Vehicles, Drivers and
   * Employees), so those screens pass their own computed string to the header
   * and this literal is only what renders before their data resolves. The
   * strings are transcribed from the prototype's `pageSub` map so the wording
   * and separator style stay the design's, not ours.
   */
  subtitle: string;
};
```

#### 1c. `src/components/driver-hub/driver-hub-nav.ts`, lines 179–218 (current `hubNavForAccount`)

```ts
/**
 * The links this account sees: every entry filtered by `kind` as before, then
 * further filtered by `rosterHidden` for a driver employed on a company's
 * roster.
 *
 * Renamed from `hubNavForKind` (which took only `kind`) because a roster driver
 * and an independent driver are both `kind: "INDIVIDUAL"` — the distinction
 * this function now also has to make lives on `companyId`, which `kind` alone
 * cannot see.
 *
 * **`companyId` alone is not the roster test.** A BUSINESS account's
 * `companyId` names *its own* company and that account must keep every link;
 * only `kind === "INDIVIDUAL" && companyId !== null` is an employed driver on
 * somebody else's roster. Getting this backwards would hide the board from the
 * one account type it exists to serve.
 *
 * Cosmetic only — see `businessOnly` and `rosterHidden` above. The account
 * itself comes from the session (`resolveHubAccount()`), never from a
 * client-side toggle: the prototype's Business/Individual switcher is a
 * prototype affordance and the real header shows a static account-type chip
 * instead.
 */
export function hubNavForAccount(
  account: Pick<HubAccount, "kind" | "companyId">,
): HubNavItem[] {
  const isRosterDriver =
    account.kind === "INDIVIDUAL" && account.companyId !== null;

  return HUB_NAV.filter((item) => {
    if (account.kind !== "BUSINESS" && item.businessOnly) {
      return false;
    }

    if (isRosterDriver && item.rosterHidden) {
      return false;
    }

    return true;
  });
}
```

#### 1d. `src/components/driver-hub/driver-hub-shell.tsx`, lines 186–190 (current)

```tsx
  // Nav filtering is cosmetic — hiding a link does nothing about a hand-typed
  // URL, which is why `drivers/page.tsx`, `employees/page.tsx` and
  // `loads/page.tsx` each re-derive their own rule server-side.
  const items = hubNavForAccount(account);
  const activeItem = hubNavItemForPath(pathname);
```

### 2. `src/lib/dashboard/hub/account.ts` — add `HubPersona`

#### 2.1 Extend the module header comment

The file opens with a doc comment (lines 1–15) that enumerates the facts every
hub screen needs. Two sentences change. Current:

```
 * The hub's shell (sidebar, header, account chip) and each of its seven pages
 * all need the same handful of facts: which kind of account this is, what to
 * print in the avatar block, and whether the online toggle may be operated.
 * Resolving that once, here, is what keeps the nav, the header and the
 * server-side page guards from disagreeing with each other — nav filtering is
 * cosmetic, and the Drivers/Employees pages re-derive their business-only
 * guard from this same `kind`.
```

Replace with:

```
 * The hub's shell (sidebar, header, account chip) and each of its seven pages
 * all need the same handful of facts: which kind of account this is, which of
 * the three personas it is, what to print in the avatar block, and whether the
 * online toggle may be operated. Resolving that once, here, is what keeps the
 * nav, the header and the server-side page guards from disagreeing with each
 * other — nav filtering is cosmetic, the Drivers/Employees pages re-derive
 * their business-only guard from this same `kind`, and every screen withheld
 * from a roster driver re-derives its guard from this same `persona`.
```

Leave the rest of the header (the `server-only` paragraph about plain
serialisable data) untouched — it is more relevant after this change, not less.

#### 2.2 Extend the `HubAccountKind` doc comment

Keep `HubAccountKind` and its existing comment exactly as they are, and append
one paragraph so the two axes cross-reference each other. The union itself does
**not** change:

```ts
/**
 * Which of the two hub shapes to render.
 *
 * Deliberately *not* the same axis as `DriverAccountType`: a driver who signed
 * up as a BUSINESS is still one person driving, and a driver on a fleet's
 * roster is too. Only a `LogisticsCompany` session — the fleet owner — gets the
 * business hub with its Drivers and Employees screens.
 *
 * This is the *coarse* axis: which shell to render, and the one the Vehicles
 * and Loads screens already consume by name (`HubVehiclesData.kind`,
 * `LoadsScreen`'s `accountKind` prop). The finer axis is `HubPersona` below,
 * which splits INDIVIDUAL into the driver who owns their work and the driver
 * on somebody else's roster. A screen that must tell those two apart reads
 * `HubAccount.persona`; this stays for the screens that genuinely only care
 * which of the two shells they are in.
 */
export type HubAccountKind = "BUSINESS" | "INDIVIDUAL";
```

#### 2.3 Add the `HubPersona` type

Insert immediately after `HubAccountKind` and immediately before
`export type HubAccount`. **The union order is `"INDEPENDENT" | "ROSTER" |
"BUSINESS"` — the order in which the three shapes appear in the feature's own
table. Nine other task files quote it this way.**

```ts
/**
 * Which of the three registered-driver account shapes this is — the hub's
 * first-class account axis, and the one every loader and screen branches on.
 *
 * | Persona       | `kind`         | `companyId`                 |
 * |---------------|----------------|-----------------------------|
 * | `INDEPENDENT` | `"INDIVIDUAL"` | `null`                      |
 * | `ROSTER`      | `"INDIVIDUAL"` | set — their *employer*      |
 * | `BUSINESS`    | `"BUSINESS"`   | set — their *own* company   |
 *
 * An `INDEPENDENT` driver owns their vehicle, browses the open Load Board and
 * keeps their own fares. A `ROSTER` driver is employed: work reaches them
 * through their company's dispatch rather than the open market, and the fares
 * they collect are paid to their employer — which is why the Wallet and the
 * Load Board are withheld from them, not merely relabelled. A `BUSINESS`
 * account is the fleet owner, and is the only shape that gets the Drivers and
 * Employees screens.
 *
 * **`companyId !== null` is not, on its own, the roster test.** A BUSINESS
 * account's `companyId` names *its own* company, so the roster case is the
 * conjunction `kind === "INDIVIDUAL" && companyId !== null` and nothing less.
 * Reading `companyId` alone would classify every fleet owner as one of their
 * own employees and would withhold the Load Board and the Wallet from exactly
 * the accounts those screens exist to serve.
 *
 * Deliberately *not* `DriverProfile.accountType` (`DriverAccountType`), which
 * is a different axis entirely: a sole-proprietor driver who registered as a
 * business is still `kind: "INDIVIDUAL"` and, with no employer, persona
 * `INDEPENDENT`. Branch on this; never on `accountType`.
 *
 * Derived once, in `resolveHubAccount()` below, which is React-`cache()`d — so
 * the derivation costs nothing per request and a screen reads
 * `account.persona` rather than re-deriving the conjunction at the point of
 * use. Two sites deriving it independently is precisely how the sidebar and a
 * page guard drift apart.
 */
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";
```

#### 2.4 Add the `persona` field to `HubAccount`

Insert it as the **second** property, immediately after `kind`, so the two axes
sit together and a reader meets both before anything else:

```ts
export type HubAccount = {
  kind: HubAccountKind;
  /**
   * The three-way account shape — see `HubPersona` above.
   *
   * Added *alongside* `kind`, never in place of it: `HubVehiclesData.kind` and
   * `LoadsScreen`'s `accountKind` prop already consume the two-way axis by
   * name, and collapsing them into this one would be a rename with no
   * behavioural gain. Screens that need to tell an employed driver from an
   * independent one read this; screens that only need to know which shell they
   * are in keep reading `kind`.
   */
  persona: HubPersona;
  userId: string;
  // … every remaining field unchanged, in its current order …
};
```

**Do not reorder, retype or re-document any other field.** In particular the
long `isActivated` and `canToggleOnline` comments are load-bearing (they record
why the two are separate fields rather than one), and this task has no business
touching them.

#### 2.5 Derive `persona` in the COMPANY branch

In `resolveHubAccount()`, the `session.user.role === "COMPANY"` branch returns
an object literal beginning `kind: "BUSINESS",` (currently line 176). Add
`persona` directly beneath it:

```ts
    return {
      kind: "BUSINESS",
      // A `LogisticsCompany` session *is* the fleet owner, so the persona is
      // fixed by the branch rather than derived within it — there is no
      // conjunction to evaluate here. Note that `companyId` below names this
      // account's *own* company, which is exactly why the roster test in the
      // driver branch has to be conjoined with `kind` and can never read
      // `companyId` alone.
      persona: "BUSINESS",
      userId,
      // … unchanged …
```

#### 2.6 Derive `persona` in the driver branch, and fix the false comment

The driver branch's final `return` (currently lines 253–277) opens with a
three-line comment. **Both of its claims are wrong** — one already, one about to
be:

```ts
  return {
    // A fleet-affiliated driver is still an individual-shaped hub: they drive,
    // they do not manage a roster. `companyId` only decides whether the header
    // names their company, never which screens they get.
    kind: "INDIVIDUAL",
```

- "**never which screens they get**" becomes false with this task: through
  `persona`, `companyId` now decides exactly which screens they get.
- "**whether the header names their company**" is *already* false today, and was
  probably never true. `companyId` feeds the `companyName` field five lines
  below, and **nothing renders it.** Verify this yourself before you write the
  replacement, because the temptation is to keep the first half of the sentence
  and edit only the second:

  ```bash
  # Only hit: employees-screen.tsx:121 — and that is
  # HubEmployeesData.subhead.companyName, sourced independently from
  # LogisticsCompany in employees.ts:111,124. It is not HubAccount's field.
  git grep -n "companyName" -- src/components/driver-hub/
  ```

  `driver-hub-header.tsx` renders `displayName`, `initials`, `identifier`,
  `kind` (as the account chip), `isOnline` and `canToggleOnline`. It never
  touches `companyName`. `HubAccount.companyName` is written at `account.ts:198`
  and `account.ts:274` and read nowhere in the codebase.

So replace the comment **entirely** — do not preserve either clause — and add
the derivation:

```ts
  return {
    // A fleet-affiliated driver is still an individual-shaped *hub*: they
    // drive, they do not manage a roster, so both kinds of driver share this
    // shell and `kind` cannot tell them apart. That is what `persona` is for.
    kind: "INDIVIDUAL",
    // `companyId` names this driver's **employer** here — contrast the
    // BUSINESS branch above, where it names the account's own company. What it
    // decides is which screens this driver gets: through the persona it
    // withholds the Load Board (work reaches an employed driver through
    // dispatch, not the open market) and the Wallet (the fares they collect
    // are paid to their employer, so a personal earnings total would assert
    // something false about whose money it is).
    //
    // `kind` is `"INDIVIDUAL"` for everything reaching this branch, so the
    // conjunction the roster test requires is already satisfied structurally
    // and this null check is the whole of it *here*. It is not the whole of it
    // anywhere else — see `HubPersona`.
    persona: driverProfile.companyId === null ? "INDEPENDENT" : "ROSTER",
    userId,
    // … unchanged …
```

**Do not** write anything of the form "decides whether the header names their
company". No hub surface names it.

Everything else in the branch — `displayName`, `initials`, `identifier`,
`city`, `isOnline`, `isActivated`, `canToggleOnline`, `companyName`,
`driverProfileId`, `companyId` — stays byte-for-byte as it is, comments
included.

#### 2.7 Do **not** add an exported derivation helper

A `hubPersonaFor(kind, companyId)` helper was considered and deliberately
rejected. Each branch of `resolveHubAccount()` already knows its own `kind`
statically, so a shared helper would take an argument that is a constant at both
call sites, and — worse — exporting one advertises that persona may be re-derived
elsewhere, which is the exact habit `persona` exists to end. The requirement is
"derived once, in `resolveHubAccount()`". Keep it that way: two inline
expressions, no export, no module-private helper.

#### 2.8 No Prisma work

No schema change, no migration, no new `select` field. `resolveHubAccount()`
already reads `driverProfile.companyId` (line 210 of the `select`) and
`company.id`. The derivation is pure arithmetic on data the function already
has, and it adds no query.

### 3. `src/components/driver-hub/driver-hub-nav.ts` — persona-keyed visibility

#### 3.1 Widen the type import

```ts
import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
```

It must stay an `import type`. `account.ts` is `server-only`, and
`driver-hub-nav.ts` is imported by `"use client"` components
(`driver-hub-sidebar.tsx`, `driver-hub-shell.tsx`). A value import would drag
the `server-only` module into the client bundle and fail the build. The existing
import is already type-only; keep it that way.

#### 3.2 Replace the two booleans with `hiddenFor`

Delete `businessOnly: boolean;` and `rosterHidden: boolean;` **together with
their doc comments**, and put one field with one comment in their place. The
comment below preserves every idea the two originals carried — the
cosmetic-filter point, the "hiding a link does nothing about a hand-typed URL"
point, and the "these were two axes because `kind` cannot see a roster driver"
point — while updating each to the new model. **Do not shorten it.**

```ts
  /**
   * The personas this entry is withheld from. Empty means everyone sees it.
   *
   * One persona-keyed list rather than the `businessOnly` / `rosterHidden`
   * boolean pair it replaces. That pair was genuinely two axes and could not
   * be collapsed into one flag: a roster driver and an independent driver are
   * both `kind: "INDIVIDUAL"`, so "business only" and "not for an employed
   * driver" were different questions asked of different fields. Keying on
   * `HubPersona` — the axis that actually distinguishes all three account
   * shapes — makes them the same question, and makes the next rule a list
   * entry rather than a third boolean and a third clause in the filter below.
   *
   * **This is a *cosmetic* filter.** Hiding a link does nothing about a
   * hand-typed URL, a bookmark, or an account whose shape changed since the
   * link was last drawn. Every entry named here must therefore ALSO be
   * enforced server-side: the screen's own `page.tsx` resolves the account and
   * `redirect("/dashboard/today")`s, and where an API backs the screen the
   * route handler refuses on the same terms. Today `/dashboard/drivers` and
   * `/dashboard/employees` each guard on `kind !== "BUSINESS"`, and
   * `/dashboard/loads` guards the roster case while `GET /api/loads` 403s it.
   * The link list is the convenience; the page guard is the boundary.
   */
  hiddenFor: readonly HubPersona[];
```

Name and shape are both deliberate:

- **`hiddenFor`, not `visibleFor`.** Six of the eight entries are visible to
  everybody, and `hiddenFor: []` reads as "no restriction" where
  `visibleFor: ["INDEPENDENT", "ROSTER", "BUSINESS"]` would be six lines of
  noise and a fresh way to get a new persona wrong by forgetting to add it.
- **`readonly HubPersona[]`, not `Set` or a `Record<HubPersona, boolean>`.** The
  lists are at most two entries long, the file is a static literal, and
  `HUB_NAV` is already `readonly HubNavItem[]`. A `Set` would need construction
  at module scope for no measurable gain.
- **No `as const` on the literals.** `HUB_NAV` is annotated
  `readonly HubNavItem[]`, so each entry's `hiddenFor` gets its contextual type
  from the annotation and `["ROSTER"]` infers as `HubPersona[]`, which is
  assignable to `readonly HubPersona[]`. Adding `as const` is unnecessary and
  makes the literals noisier.

#### 3.3 Update the `HUB_NAV` ordering comment

The comment above `HUB_NAV` (currently lines 77–81) is both persona-blind and
already numerically stale — it says "the remaining five" from before the Load
Board entry was added, and there are now six non-business entries. Replace it:

```ts
/**
 * In the design's sidebar order. Drivers and Employees come last because they
 * are the two that disappear for anything but a BUSINESS persona — dropping
 * them leaves the remaining six in an unchanged order.
 *
 * A ROSTER driver additionally loses Load Board and Wallet, which are *not*
 * last and cannot be moved there: the design puts Wallet second and the board
 * third, and reordering the rail per persona would shuffle links under a
 * returning user rather than simply removing two. Filtering by `hiddenFor`
 * preserves the relative order of whatever survives, which is the property
 * that makes per-persona rails feel like the same product.
 */
export const HUB_NAV: readonly HubNavItem[] = [
```

#### 3.4 The eight entries

Every entry loses its `businessOnly` and `rosterHidden` lines and gains one
`hiddenFor` line **in the same position** (between `href` and `title`), so the
diff stays readable. All existing per-entry comments — the long ones on
`earnings`, `loads` and `jobs` explaining their labels — stay exactly as they
are; three entries gain an additional comment on the new field.

| `id` | `hiddenFor` | Change from today |
|---|---|---|
| `today` | `[]` | none (was `false`/`false`) |
| `earnings` | `["ROSTER"]` | **NEW — this is a behaviour change** |
| `loads` | `["ROSTER"]` | none (was `rosterHidden: true`) |
| `jobs` | `[]` | none |
| `performance` | `[]` | none |
| `vehicles` | `[]` | none |
| `drivers` | `["INDEPENDENT", "ROSTER"]` | none (was `businessOnly: true`) |
| `employees` | `["INDEPENDENT", "ROSTER"]` | none (was `businessOnly: true`) |

The resulting visibility, stated the other way round as a cross-check:

| Screen | `INDEPENDENT` | `ROSTER` | `BUSINESS` |
|---|---|---|---|
| Today | ✅ | ✅ | ✅ |
| Wallet (`earnings`) | ✅ | ❌ **new** | ✅ |
| Load Board (`loads`) | ✅ | ❌ | ✅ |
| My orders (`jobs`) | ✅ | ✅ | ✅ |
| Performance | ✅ | ✅ | ✅ |
| Vehicles | ✅ | ✅ | ✅ |
| Drivers | ❌ | ❌ | ✅ |
| Employees | ❌ | ❌ | ✅ |

So a `BUSINESS` account sees all eight, an `INDEPENDENT` driver sees six, and a
`ROSTER` driver sees four: Today, My orders, Performance, Vehicles.

**`earnings`** — keep the existing "Labelled 'Wallet' rather than 'Earnings'"
comment untouched and add a second one on the new field:

```ts
    id: "earnings",
    label: "Wallet",
    href: "/dashboard/earnings",
    // Withheld from a ROSTER driver, and new in this feature. The screen sums
    // `driverPayout` over the orders assigned to the signed-in driver and
    // labels the total as *their* earnings — but an employed driver's fares
    // are paid to their employer, so for them the screen asserts something
    // false about whose money it is. Planning chose to hide it outright rather
    // than relabel it as a non-currency work summary: the failure direction
    // worth engineering against is showing an employee a currency figure that
    // is not theirs.
    hiddenFor: ["ROSTER"],
    title: "Earnings & payouts",
```

**`loads`** — the reasoning currently living on the `rosterHidden` field moves
here rather than evaporating:

```ts
    id: "loads",
    label: "Load Board",
    href: "/dashboard/loads",
    // Withheld from a ROSTER driver. Per
    // `specs/driver-load-board/requirements.md`'s Assumptions, an employed
    // driver receives work through their company's dispatch rather than the
    // open market, so the board is not theirs to browse. Its own server-side
    // guard (`src/app/dashboard/(hub)/loads/page.tsx`) redirects them even if
    // they hand-type the URL, and `GET /api/loads` 403s them; this list only
    // controls the sidebar link.
    hiddenFor: ["ROSTER"],
    title: "Load Board",
```

**`drivers`** — one comment covering both business-only entries:

```ts
    id: "drivers",
    label: "Drivers",
    href: "/dashboard/drivers",
    // Business-only, spelled as the two personas it is withheld from rather
    // than as a "BUSINESS only" flag — one rule shape across all eight entries
    // is worth more than the two characters the inverse would save. The
    // boundary is `drivers/page.tsx`'s own `kind !== "BUSINESS"` guard, which
    // this does not replace.
    hiddenFor: ["INDEPENDENT", "ROSTER"],
    title: "Drivers",
```

**`employees`** — same value, no comment needed (the one on `drivers`
immediately above covers the pair):

```ts
    hiddenFor: ["INDEPENDENT", "ROSTER"],
```

**`today`, `jobs`, `performance`, `vehicles`** — just `hiddenFor: [],` with no
comment. An empty list is self-explanatory and four identical comments would be
noise.

#### 3.5 Rewrite `hubNavForAccount()`

The body collapses to one predicate. The doc comment must **keep** the
`companyId`-is-not-the-roster-test paragraph rather than delete it: the test has
moved, not disappeared, and a reader who arrives here wondering why the function
no longer performs it deserves to be told where it went and why.

```ts
/**
 * The links this account sees: every entry whose `hiddenFor` list does not name
 * this account's persona.
 *
 * It takes the persona and nothing else. The roster test — `kind ===
 * "INDIVIDUAL" && companyId !== null` — used to be evaluated right here,
 * because a roster driver and an independent driver are both
 * `kind: "INDIVIDUAL"` and `kind` alone cannot see the difference. That test
 * has not been dropped; it has moved into `resolveHubAccount()`, which derives
 * `persona` once per request and is now the single place in the codebase where
 * the conjunction is written. The reasoning behind it is still load-bearing and
 * is worth repeating at every site that depends on it:
 *
 * **`companyId` alone is not the roster test.** A BUSINESS account's
 * `companyId` names *its own* company and that account must keep every link;
 * only `kind === "INDIVIDUAL" && companyId !== null` is an employed driver on
 * somebody else's roster. Getting this backwards would hide the Load Board —
 * and now the Wallet too — from the one account shape both exist to serve.
 *
 * Cosmetic only — see `hiddenFor` above. The account itself comes from the
 * session (`resolveHubAccount()`), never from a client-side toggle: the
 * prototype's Business/Individual switcher is a prototype affordance and the
 * real header shows a static account-type chip instead.
 */
export function hubNavForAccount(
  account: Pick<HubAccount, "persona">,
): HubNavItem[] {
  return HUB_NAV.filter((item) => !item.hiddenFor.includes(account.persona));
}
```

Points to get right:

- The parameter narrows from `Pick<HubAccount, "kind" | "companyId">` to
  `Pick<HubAccount, "persona">`. Keep the `Pick` — widening to a bare
  `HubAccount` would let a future edit reach for `companyId` here again, which
  is the mistake this whole task is designed to prevent.
- The return type stays `HubNavItem[]` (mutable array — `Array.prototype.filter`
  on a `readonly` source returns a mutable copy, and the sidebar's prop is
  `readonly HubNavItem[]`, which accepts it). Do not change it to `readonly`;
  nothing needs it and it is churn.
- `readonly HubPersona[]` has `.includes()` on `lib.es2016`+ — the project
  targets `ES2022`, so this compiles with no cast.
- The local `isRosterDriver` disappears. With `noUnusedLocals: true` in
  `tsconfig.json`, leaving it behind is a typecheck error, not a lint warning.
- Leave `hubNavItemForPath()` and `HubNavItemId` completely alone.

### 4. `src/components/driver-hub/driver-hub-shell.tsx` — the call site

**The call expression does not change.** `hubNavForAccount(account)` still
compiles: `account` is a full `HubAccount`, which now has `persona` and is
therefore assignable to `Pick<HubAccount, "persona">`. Verify this rather than
assume it — if it fails, you have missed step 2.4.

What does change is the comment above it, which currently enumerates the three
page guards that back the cosmetic filter and would be incomplete after the
Wallet joins the withheld set. Replace lines 186–188:

```tsx
  // Nav filtering is cosmetic — hiding a link does nothing about a hand-typed
  // URL, so every screen withheld from a persona re-derives its own rule
  // server-side: `drivers/page.tsx` and `employees/page.tsx` on
  // `kind !== "BUSINESS"`, and `loads/page.tsx` on the roster case (which
  // `GET /api/loads` 403s to match). The Wallet is now withheld from a roster
  // driver in the list below, and `earnings/page.tsx` owes it the matching
  // server-side redirect.
  const items = hubNavForAccount(account);
```

The final sentence is deliberately worded as a debt rather than a claim — the
Earnings redirect is not part of this task, and a comment asserting a guard that
does not yet exist is worse than no comment. See §7 below.

Change nothing else in this file. The `useHubSubtitle` / `useHubVehiclePill`
context machinery, the `data-admin-surface` reasoning and `FALLBACK_TITLE` are
all untouched by this task.

**And specifically, leave the `<DriverHubSidebar>` render site exactly as it
is:**

```tsx
      <DriverHubSidebar items={items} activeId={activeItem?.id} />
```

`account.persona` exists after this task, so adding `persona={account.persona}`
here compiles as an *expression* — but `DriverHubSidebarProps` has no such prop
until a Wave 3 task adds it, so the JSX would be an excess-property error and
`pnpm typecheck` would fail for the remainder of Wave 1 and all of Wave 2. That
task adds the prop and this line together. Leave it alone.

### 5. What this task must NOT do

- **No Prisma schema change and no migration.** Persona is derived from columns
  that already exist.
- **Do not touch `hubOrderScope()` / `hubOrderScopeSql()`** in `today.ts`,
  `earnings.ts`, `jobs.ts` or `performance.ts`. They are the tenancy boundary,
  duplicated verbatim in four files, and they fail closed via
  `UNMATCHABLE_COMPANY_ID` rather than letting `{ companyId: null }` read as
  `IS NULL` and match every unclaimed order on the platform. Nothing in this
  spec should need to change them, and this task certainly does not.
- **Do not add `persona` to `HubTodayData`, `HubEarningsData`,
  `HubPerformanceData` or `HubVehiclesData`.** Those belong to the Wave 2 tasks
  that own those loaders, and adding them here would collide with files this
  task does not own.
- **Do not add the `earnings/page.tsx` redirect** or touch the earnings export
  route. Both belong to the Earnings task in Wave 2.
- **Do not remove `HubAccountKind`, and do not change its members.**
  `HubVehiclesData.kind`, `LoadsScreen`'s `accountKind` prop,
  `vehicles-add-form.tsx`, `vehicles-detail-panel.tsx`, `loads-context.tsx` and
  `driver-hub-header.tsx`'s `ACCOUNT_KIND_LABELS: Record<HubAccountKind, string>`
  all depend on it. `persona` is added alongside `kind`, never in place of it.
- **Do not edit `driver-hub-sidebar.tsx`** — including its
  `items: readonly HubNavItem[]` prop comment, which reads "Already filtered for
  the account kind by the shell" and is now imprecise. That file belongs to the
  Wave 3 shell-chrome task; leaving one stale word there is cheaper than a
  merge conflict on a file two tasks both touched. **And do not pass it a
  `persona` prop from the shell** — the prop does not exist until that task
  creates it, and adding the JSX attribute first is a typecheck failure that
  would block every task in Wave 2.
- **Do not remove `HubAccount.companyName`**, even though the audit above shows
  it is written and never read. Deleting a field from the hub's public account
  shape is a separate decision with its own blast radius, and it is not this
  task's to take. Note it and move on.
- **Do not edit `drivers/page.tsx` or `employees/page.tsx`.** Both mention a
  `hubNavForKind()` that was renamed before this feature began. It is
  pre-existing staleness, unrelated to personas, and out of scope here.
- **Do not delete or edit the untracked `* 2.ts` / `* 2.tsx` copy artefacts.**

### 6. Verification

Run these from the repository root, in this order.

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
```

Both must pass clean. `pnpm check` runs the pair. Note that `tsconfig.json` sets
`noUnusedLocals`, `noUnusedParameters` and `noUncheckedIndexedAccess`, so a
leftover `isRosterDriver` or an unused import is a hard failure rather than a
warning.

Then the grep gates, which are also acceptance criteria in
`specs/driver-hub-personas/requirements.md`:

```bash
# Must print nothing at all.
git grep -n "businessOnly\|rosterHidden" -- src/

# Must print only src/components/driver-hub/driver-hub-nav.ts.
git grep -ln "hiddenFor" -- src/

# Must print src/lib/dashboard/hub/account.ts and driver-hub-nav.ts.
git grep -ln "HubPersona" -- src/
```

(The requirements' `git grep` criterion is about *source*: `README.md` and
`requirements.md` in this spec folder both name the old booleans while
describing what was replaced, and that is correct — do not edit the spec docs
to satisfy a grep.)

Finally, exercise the filter directly. `driver-hub-nav.ts` imports only *types*
from the `server-only` account module, so it can be imported and run outside
Next entirely:

```bash
cat > /tmp/persona-nav-check.ts <<'TS'
import { hubNavForAccount } from "@/components/driver-hub/driver-hub-nav";

for (const persona of ["INDEPENDENT", "ROSTER", "BUSINESS"] as const) {
  const ids = hubNavForAccount({ persona }).map((item) => item.id);
  console.warn(persona.padEnd(12), ids.join(", "));
}
TS
pnpm exec tsx --tsconfig tsconfig.json /tmp/persona-nav-check.ts
```

Expected output, exactly:

```
INDEPENDENT  today, earnings, loads, jobs, performance, vehicles
ROSTER       today, jobs, performance, vehicles
BUSINESS     today, earnings, loads, jobs, performance, vehicles, drivers, employees
```

If `tsx` cannot resolve the `@/` alias in your shell, rewrite the import as a
relative path to `src/components/driver-hub/driver-hub-nav.ts`; the point is the
three output lines, not the module specifier. Delete the scratch file afterwards
— it must not be committed.

Runtime verification of the derivation itself needs three signed-in accounts
(one independent driver, one driver with `DriverProfile.companyId` set, one
`role === "COMPANY"` session). Provisioning those is a human step recorded in
`specs/driver-hub-personas/action-required.md`. If they are not available, say
so in your handoff rather than claiming the behaviour was observed: reading the
code and passing `typecheck`/`lint` is what you can honestly assert.

### 7. The known gap this task deliberately leaves open

After this task lands and before the Wave 2 Earnings task lands, a `ROSTER`
driver sees no Wallet link **but `/dashboard/earnings` still serves them the
screen if they type the URL.** This is expected, it is called out here so a
reviewer does not log it as a defect, and it is not something to "fix" inside
this task by reaching into `earnings/page.tsx` — that file belongs to another
task and editing it here would break the wave's file-disjointness guarantee.

The Load Board has no such gap: its server-side guard and its API `403` already
exist and are unaffected by the nav rewrite.

If this feature is ever shipped partially, **the Earnings server-side redirect
is the half that matters.** Hiding the link is a convenience; the redirect is
the boundary.

## Acceptance Criteria

- [ ] `HubPersona` is exported from `src/lib/dashboard/hub/account.ts` as
      `"INDEPENDENT" | "ROSTER" | "BUSINESS"`, in that order, with a doc comment
      that states the persona/`kind`/`companyId` correspondence, warns that
      `companyId` alone is not the roster test, and warns off
      `DriverProfile.accountType`.
- [ ] `HubAccount` has a required `persona: HubPersona` field, positioned
      immediately after `kind`.
- [ ] `HubAccountKind` still exists, still has exactly the members
      `"BUSINESS" | "INDIVIDUAL"`, and is still exported — every existing
      consumer (`vehicles.ts`, `loads-context.tsx`, `loads-screen.tsx`,
      `vehicles-add-form.tsx`, `vehicles-detail-panel.tsx`,
      `driver-hub-header.tsx`) compiles unchanged.
- [ ] `resolveHubAccount()`'s COMPANY branch returns `persona: "BUSINESS"`.
- [ ] `resolveHubAccount()`'s driver branch returns `"ROSTER"` when
      `driverProfile.companyId !== null` and `"INDEPENDENT"` otherwise, derived
      inline — no exported or module-private helper function.
- [ ] The driver branch's comment no longer claims that `companyId` "only
      decides whether the header names their company, never which screens they
      get"; it explains what `companyId` now decides through the persona.
      **Neither half of that sentence survives** — no replacement prose asserts
      that any hub surface names the driver's company, because none does
      (`HubAccount.companyName` is written and never read).
- [ ] `HubNavItem` has `hiddenFor: readonly HubPersona[]` and no
      `businessOnly` or `rosterHidden` field.
- [ ] `hiddenFor`'s doc comment preserves the cosmetic-filter reasoning
      (hiding a link does nothing about a hand-typed URL; the page guard is the
      boundary) and explains why one persona-keyed list replaces two booleans.
- [ ] All eight `HUB_NAV` entries set `hiddenFor`: `[]` for `today`, `jobs`,
      `performance`, `vehicles`; `["ROSTER"]` for `earnings` and `loads`;
      `["INDEPENDENT", "ROSTER"]` for `drivers` and `employees`.
- [ ] The `loads` entry's roster reasoning (dispatch not the open market; the
      page guard and the `GET /api/loads` 403 are the real boundary) survives
      the field rename, relocated onto the entry or the type.
- [ ] The `earnings` entry carries a comment explaining *why* the Wallet is
      withheld from a roster driver — the fares are the employer's — and that
      hiding beat relabelling.
- [ ] `hubNavForAccount()` takes `Pick<HubAccount, "persona">`, filters solely
      on `hiddenFor.includes(account.persona)`, and its doc comment records
      that the `kind && companyId` roster test moved into `resolveHubAccount()`
      rather than being deleted.
- [ ] `driver-hub-shell.tsx`'s `hubNavForAccount(account)` call compiles
      unchanged, and the comment above it names the Wallet's still-missing
      server-side redirect as a debt rather than asserting it exists.
- [ ] **Negative check:** `driver-hub-shell.tsx`'s `<DriverHubSidebar>` render
      site is byte-identical to what it was before this task —
      `items={items} activeId={activeItem?.id}` and no `persona` prop. The
      whole diff for this file is confined to the comment above line 189.
      Confirm with `git diff -- src/components/driver-hub/driver-hub-shell.tsx`.
- [ ] `git grep -n "businessOnly\|rosterHidden" -- src/` returns nothing.
- [ ] `pnpm typecheck` passes clean.
- [ ] `pnpm lint` passes clean.
- [ ] The scratch check in §6 prints exactly six links for `INDEPENDENT`, four
      for `ROSTER` (today, jobs, performance, vehicles) and eight for
      `BUSINESS`, and the scratch file is not committed.
- [ ] No Prisma schema file, migration, loader (`today.ts`, `earnings.ts`,
      `jobs.ts`, `performance.ts`, `vehicles.ts`, `drivers.ts`,
      `employees.ts`), `page.tsx` or API route is modified.

## Notes

**Why this is one task and not three.** The type, the nav rule and the call site
are a single compile unit: adding a required field to `HubAccount` and rewriting
the nav filter cannot land separately without an intermediate state that does
not typecheck. Splitting them would buy nothing and cost a broken commit.

**Why `persona` rather than widening `HubAccountKind` to three members.** It was
considered. `HubAccountKind` is consumed by name in five places that genuinely
only care which of the two *shells* they are in —`HubVehiclesData.kind`,
`LoadsScreen`'s `accountKind`, `vehicles-add-form.tsx`,
`vehicles-detail-panel.tsx` and `driver-hub-header.tsx`'s
`ACCOUNT_KIND_LABELS: Record<HubAccountKind, string>`. Widening the union would
break the `Record` exhaustively (a good thing) and force four other files to
grow a third case they have no opinion about (not a good thing), all inside a
Wave 1 task that is supposed to own three files. Two axes, one coarse and one
fine, is the smaller and more honest change. The requirements make this
explicit: "`persona` is added alongside it, not in place of it".

**The `earnings` visibility change is the only behavioural change in this
task.** Everything else is a refactor that preserves behaviour exactly: the same
six links for an independent driver, the same eight for a business account. If
your diff changes what any other persona sees, something is wrong.

**Order of the union matters for readability, not for correctness.** Nothing
switches on it exhaustively yet. Wave 3 tasks may add
`Record<HubPersona, string>` copy maps, and a stable, documented order keeps
those readable — which is why it is pinned here.

**On preserving comments.** `driver-hub-nav.ts` is one of the more heavily
commented files in this codebase and the comments are not decoration: they
record that nav filtering is cosmetic (which is why every hidden screen needs a
server-side guard), and that `companyId` alone is not the roster test (which is
a bug that would ship silently, because a fleet owner losing the Load Board
looks like a filter working rather than a filter inverted). Both facts must
survive this rewrite. Deleting a comment because the field it documented was
renamed is how a codebase forgets why it is shaped the way it is.

**Incidental finding: `HubAccount.companyName` is a dead field.** It is
populated in both branches of `resolveHubAccount()` (lines 198 and 274) and read
by nothing — `git grep -n "companyName" -- src/components/driver-hub/` returns a
single hit, `employees-screen.tsx:121`, and that is
`HubEmployeesData.subhead.companyName`, which `employees.ts` selects straight
from `LogisticsCompany` rather than taking from the account. This matters here
only because the driver branch's comment claims the header uses it, and a coder
agent correcting the comment's *second* clause would naturally preserve the
first. It does not matter enough to remove the field in a Wave 1 task, and this
spec does not.

**Related human steps** are recorded in
`specs/driver-hub-personas/action-required.md` — notably provisioning the three
test accounts, and deciding what to do about the untracked `* 2.*` duplicates
under `src/app`. Neither blocks this task.
