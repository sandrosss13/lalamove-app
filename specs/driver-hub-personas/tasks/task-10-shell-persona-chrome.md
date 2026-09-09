# Task 10: Shell Persona Chrome

## Status

complete

## Wave

3

## Description

The Driver Hub's two chrome components — the left rail (`driver-hub-sidebar.tsx`) and the sticky top bar (`driver-hub-header.tsx`) — are the last two surfaces in the hub that still render the same thing for all three registered-driver personas. Two things are wrong with that. First, the rail pins a **"Weekly incentive"** progress card to its bottom edge; that card is 100% sampled data ("12/15 jobs · 3 more jobs by Sunday for a ₾40 bonus") and it is not merely unsourced for two of the three personas, it is *meaningless* for them — a salaried driver on a company's roster does not earn a per-job bonus, and a fleet owner is not the person driving the jobs the bar counts. Second, the header's account chip is keyed on `HubAccountKind`, a two-value type, and therefore prints the identical word "Individual" for an independent owner-driver and for an employed roster driver — the exact conflation this whole feature exists to end.

This task hides the incentive card for anyone but `INDEPENDENT`, and re-keys the header chip from `HubAccountKind` to the `HubPersona` that task-01 adds to `HubAccount`. It changes no data loader, no page guard, no schema and no sampled value: the incentive card's numbers stay sampled and stay `<SampleNote />`-badged for the one persona that still sees them. It is the smallest task in Wave 3 and the only one that touches the shell's own components rather than a screen. It also carries one line of `driver-hub-shell.tsx` — the `<DriverHubSidebar>` render site, which has to pass the new prop; that carve-out is explained in §2.3 and is the only part of that file this task may touch.

Two things this task deliberately does **not** do, both explained in full under Technical Details so the implementer does not "helpfully" do them anyway: it does not restore the prototype's client-side "Preview as Business / Individual" switcher (the static session-derived chip that replaced it was the correct call), and it does not touch the header's three deferred-feature comment blocks, which explain in detail why the notifications bell, the "My account" link and the active-job pill from the design handoff are not built.

## Dependencies

**Depends on:** `task-01-hub-persona-model.md`

**Blocks:** None

**Context from dependencies:**

`task-01-hub-persona-model.md` establishes the persona axis this task branches on. Everything below is what task-01 leaves behind; you do not need to read that file, but you *do* need to confirm these facts hold in the code before you start, because this task is meaningless if task-01 has not landed.

**1. The three personas.** The hub serves three genuinely different registered-driver account shapes:

| Persona | `HubAccount.kind` | `HubAccount.companyId` | Who they are |
|---|---|---|---|
| `INDEPENDENT` | `"INDIVIDUAL"` | `null` | Owns their own vehicle, browses the open Load Board, keeps their own fares |
| `ROSTER` | `"INDIVIDUAL"` | set — their **employer's** company id | An employed driver. Work arrives via their company's dispatch, not the open market; the fare is paid to the employer, not to them |
| `BUSINESS` | `"BUSINESS"` | set — **their own** company id | A fleet owner. Gets the Drivers and Employees screens; does not personally drive |

**`companyId !== null` alone is NOT the roster test.** A `BUSINESS` account also has a `companyId` — its own. The roster test is the conjunction `kind === "INDIVIDUAL" && companyId !== null`. Getting this backwards would hide the Load Board and the Wallet from fleet owners, who are entitled to both. You will not have to write that test yourself in this task — task-01 has already derived it once — but you must not re-derive it ad hoc either.

**`DriverProfile.accountType` (the `DriverAccountType` enum) is a different axis entirely and must never be used for this.** A sole-proprietor driver who registered as a business is still `kind: "INDIVIDUAL"` and, with no employer, persona `INDEPENDENT`.

**2. What task-01 adds to `src/lib/dashboard/hub/account.ts`:**

```ts
/** The hub's first-class account axis. */
export type HubPersona = "INDEPENDENT" | "ROSTER" | "BUSINESS";

export type HubAccount = {
  /** Unchanged and still present — Vehicles and Loads consume it. */
  kind: HubAccountKind;          // "BUSINESS" | "INDIVIDUAL"
  /** NEW in task-01. Derived once, inside `resolveHubAccount()`. */
  persona: HubPersona;
  userId: string;
  displayName: string;           // person's full name, or the company name
  initials: string;              // up to two uppercase letters for the avatar
  identifier: string;            // mono subline: "Cargo Van · Tbilisi", or a VAT id
  city: string;
  isOnline: boolean | null;      // null for a COMPANY session — it has no online state
  isActivated: boolean;
  canToggleOnline: boolean;
  companyName: string | null;    // set when a DRIVER belongs to a fleet
  driverProfileId: string | null;
  companyId: string | null;
};
```

`persona` is derived inside `resolveHubAccount()`: `BUSINESS` when `kind === "BUSINESS"`; `ROSTER` when `kind === "INDIVIDUAL" && companyId !== null`; `INDEPENDENT` otherwise. `resolveHubAccount()` is React-`cache()`d, so this costs nothing per request — and it is the *only* place persona is derived. Never re-derive it in a component.

`HubAccountKind` (`"BUSINESS" | "INDIVIDUAL"`) still exists after task-01 and still means what it always meant. `persona` is added **alongside** it, not in place of it, so `vehicles.ts` and `loads-screen.tsx` — which consume `kind` — keep compiling.

**3. What task-01 changes in `src/components/driver-hub/driver-hub-nav.ts`:** the `businessOnly: boolean` and `rosterHidden: boolean` fields on `HubNavItem` are replaced by a single persona-keyed rule (`hiddenFor: readonly HubPersona[]` or equivalent), and `hubNavForAccount(account)` filters on `account.persona`. Post-task-01 visibility: `today`, `jobs`, `performance`, `vehicles` visible to all three; `loads` hidden for `ROSTER`; `earnings` ("Wallet") hidden for `ROSTER` (new in this feature); `drivers` and `employees` visible to `BUSINESS` only. **`HubNavItem`'s other fields — `id`, `label`, `href`, `title`, `subtitle` — and the `HubNavItemId` union are unchanged**, which matters here because the sidebar consumes exactly those and nothing else. `HubNavItemId` is:

```ts
export type HubNavItemId =
  | "today" | "earnings" | "loads" | "jobs"
  | "performance" | "vehicles" | "drivers" | "employees";
```

**4. What task-01 changes in `src/components/driver-hub/driver-hub-shell.tsx`, and what it deliberately leaves alone.** Task-01 owns most of this file: it updates the `hubNavForAccount(account)` call site at line 189 and the three-line comment above it at 186–188 as part of re-keying nav visibility on persona. It does **not** touch the `<DriverHubSidebar>` render site at line 197 — it cannot, because the sidebar's `persona` prop does not exist until this task adds it, and adding the attribute in Wave 1 would fail `pnpm typecheck` for the whole of Waves 1 and 2.

That one line is therefore **yours**. This task owns the `<DriverHubSidebar …>` render site at line 197 and nothing else in that file, so that the prop and the value that fills it land in the same commit. See §2.3.

## Files to Create

None.

## Files to Modify

- `src/components/driver-hub/driver-hub-sidebar.tsx` — accept the resolved `HubPersona`, and render the sampled "Weekly incentive" card only for `INDEPENDENT`.
- `src/components/driver-hub/driver-hub-header.tsx` — replace the two-value `ACCOUNT_KIND_LABELS: Record<HubAccountKind, string>` chip lookup with a three-value persona-keyed one, and swap the now-unused `HubAccountKind` type import for `HubPersona`.
- `src/components/driver-hub/driver-hub-shell.tsx` — **one line only.** Pass the new prop at the `<DriverHubSidebar>` render site (line 197), so `persona={account.persona}` lands in the same commit as the prop that requires it. Nothing else in this file is yours.

> **Scope warning on `driver-hub-shell.tsx`.** Task-01 owns the rest of it — specifically the `hubNavForAccount(account)` call at line 189 and its comment at 186–188, which task-01 rewrites when it re-keys nav visibility on persona. Your diff in this file must be the `<DriverHubSidebar …>` element at line 197 and nothing else: not line 189, not the `<DriverHubHeader>` props at 200–205, not the header-override context, not the `data-admin-surface` root. See §2.3.

## Technical Details

### 1. The two files as they stand today (verified against the working tree)

Read both files in full before you touch either. The line numbers below were checked against the current `main`-derived branch; if task-01 has shifted them, trust the code, not this list.

**`src/components/driver-hub/driver-hub-sidebar.tsx` — 143 lines.**

| Lines | What is there |
|---|---|
| 1 | `"use client";` |
| 3 | `import Link from "next/link";` |
| 5–8 | `import type { HubNavItem, HubNavItemId } from "@/components/driver-hub/driver-hub-nav";` |
| 9 | `import { SampleNote } from "@/components/driver-hub/hub-primitives";` |
| 10 | `import { SAMPLE_WEEKLY_INCENTIVE } from "@/lib/dashboard/hub/sample";` |
| 11 | `import { cn } from "@/lib/utils";` |
| 13–15 | `ACCENT_BG` — the brand orange, spelled out as `"bg-[oklch(64%_0.19_48)]"` because it has no `--color-*` token |
| 17–32 | `export type DriverHubSidebarProps` — `items`, `activeId`, `counts?` |
| 34–41 | The component's doc block (brand row / nav / incentive card; why `<Link>` not `<button>`) |
| 42–46 | `export function DriverHubSidebar({ items, activeId, counts = {} }: DriverHubSidebarProps) {` |
| 47 | `const { jobsDone, jobsTarget, note } = SAMPLE_WEEKLY_INCENTIVE;` |
| 49–53 | `incentivePercent` — clamped 0–1 then ×100 |
| 55–61 | `<aside …>`, with the sticky/248px class string on line 60 |
| 62–70 | The brand row |
| 72–106 | `<nav aria-label="Driver hub">` — the `items.map()`, including the `counts[item.id]` badge at 76 and 93–102 |
| 108–140 | The Weekly incentive `<section>`, preceded by its 3-line JSX comment at 108–110 |
| 141–143 | `</aside>`, close |

The card itself, verbatim, is the whole of lines 108–140:

```tsx
      {/* Weekly incentive. Entirely sampled — there is no incentive or bonus
          model in the schema — so it carries the honesty badge rather than
          passing itself off as this driver's real progress. */}
      <section
        aria-label="Weekly incentive"
        className="mt-auto rounded-xl border border-border p-3.5"
      >
        <p className="mb-2 text-[11px] tracking-[0.08em] uppercase text-muted-foreground">
          Weekly incentive
        </p>
        <p className="font-price text-[20px] font-semibold">
          {jobsDone}
          <span className="text-sm text-muted-foreground">/{jobsTarget}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Jobs towards this week's bonus"
          aria-valuenow={incentivePercent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2.5 mb-2 h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className={cn("h-full rounded-full", ACCENT_BG)}
            style={{ width: `${incentivePercent}%` }}
          />
        </div>
        <p className="text-xs leading-[1.4] text-muted-foreground">{note}</p>
        <SampleNote
          note="Needs an incentive/bonus model — the schema records no weekly target or bonus."
          className="mt-2.5"
        />
      </section>
```

Its data source is `src/lib/dashboard/hub/sample.ts:407`:

```ts
/**
 * The weekly-incentive progress card pinned to the bottom of the sidebar.
 *
 * Retire with the `Incentive` model — a target, a count against it and a payout
 * are all campaign facts the schema has no place for.
 */
export const SAMPLE_WEEKLY_INCENTIVE = {
  jobsDone: 12,
  jobsTarget: 15,
  note: "3 more jobs by Sunday for a ₾40 bonus.",
} as const;
```

`driver-hub-sidebar.tsx` is `SAMPLE_WEEKLY_INCENTIVE`'s only consumer in the repo. **Do not delete the export** — it stays, and it stays rendered for `INDEPENDENT`.

**`src/components/driver-hub/driver-hub-header.tsx` — 172 lines.**

| Lines | What is there |
|---|---|
| 1 | `"use client";` |
| 3–9 | `ReactNode`, `LogOut`, `useSignOut`, `HubOnlineToggle`, `Badge`, `Button` imports |
| 10 | `import type { HubAccount, HubAccountKind } from "@/lib/dashboard/hub/account";` |
| 12–19 | The chip's label map (see below) |
| 21–41 | `export type DriverHubHeaderProps` — `account`, `title`, `subtitle`, `vehiclePill?` |
| 43–84 | The component's long doc block: the "do not re-add the switcher" paragraph at 47–54, then the three deferred-feature bullets at 56–79, then what the handoff *did* land at 81–83 |
| 85–90 | `export function DriverHubHeader({ account, title, subtitle, vehiclePill }: DriverHubHeaderProps) {` |
| 91 | `const { signOut, signingOut } = useSignOut();` |
| 94 | `<header className="sticky top-0 z-10 …">` |
| 95–102 | Title + subtitle block |
| 104 | `<div className="flex items-center gap-[18px]">` — the right-hand cluster |
| 105–108 | The `vehiclePill` slot and its comment |
| 110–115 | **The account chip** |
| 117–125 | The online toggle and its BUSINESS-omission comment |
| 127–143 | The avatar block: `initials`, `displayName`, mono `identifier` |
| 145–168 | The sign-out button and the long comment on why it lives here |
| 169–172 | Closes |

The chip lookup, verbatim, lines 12–19:

```ts
/**
 * The chip's copy. A lookup rather than a `toLowerCase()` so the two words are
 * written out where a reviewer can read them, not derived from an enum.
 */
const ACCOUNT_KIND_LABELS: Record<HubAccountKind, string> = {
  BUSINESS: "Business",
  INDIVIDUAL: "Individual",
};
```

and its one render site, lines 110–115:

```tsx
        <Badge
          variant="outline"
          className="h-auto rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground"
        >
          {ACCOUNT_KIND_LABELS[account.kind]}
        </Badge>
```

`ACCOUNT_KIND_LABELS` is module-private and has exactly that one reference. `git grep ACCOUNT_KIND_LABELS` returns only lines 16 and 114 of this file.

### 2. Sidebar — hide the sampled incentive card off-persona

#### 2.1 Why it is hidden rather than adapted

The requirement is in `requirements.md`'s acceptance criteria: *"The sidebar's sampled 'Weekly incentive' card does not render for a roster driver or a business account."* The reasoning, which belongs in the code comment you leave behind:

- **`ROSTER`** — an employed driver is paid by their employer. The `Order.driverPayout` that would feed a real incentive is revenue that goes to the company, not to them. This whole feature's premise is that the hub currently asserts something false to a roster driver (their Wallet totals money that is not theirs, which is why task-01 and task-03 remove that screen from them entirely). A per-job bonus bar is the same lie in miniature, and hiding it is the same fix.
- **`BUSINESS`** — a fleet owner is not the person completing the 12 jobs the bar counts. Even with a real `Incentive` model behind it, a per-driver weekly bonus is not a fleet-level fact; the fleet-level equivalent would be a different card with a different query, and that card is not in this spec.
- **`INDEPENDENT`** — the one persona for whom the card describes a real, if not-yet-implemented, product concept. It keeps the card, keeps the sampled numbers, and keeps the `<SampleNote />`.

**This is a visibility change, not a de-mocking.** `requirements.md`'s non-goals are explicit: *"Sampled values stay sampled and stay badged with `<SampleNote />`. Where a sampled card is meaningless for a persona … it is hidden, not made real."* Do **not** try to source `jobsDone` from `Order` rows, do not compute a real target, and do not remove the `<SampleNote />` from the surviving card. There is no incentive or bonus model in `prisma/schema.prisma`; making this real is a schema change, and this spec makes none.

#### 2.2 The change

Add a required `persona` prop and extract the card into a file-local component so the sample import and the percentage arithmetic sit with the thing they serve rather than in the shared render path:

```tsx
"use client";

import Link from "next/link";

import type {
  HubNavItem,
  HubNavItemId,
} from "@/components/driver-hub/driver-hub-nav";
import { SampleNote } from "@/components/driver-hub/hub-primitives";
import type { HubPersona } from "@/lib/dashboard/hub/account";
import { SAMPLE_WEEKLY_INCENTIVE } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/** The brand orange. It has no `--color-*` token, so it is spelled out — the
 *  same call `hub-primitives.tsx` and `hub-status.ts` already make. */
const ACCENT_BG = "bg-[oklch(64%_0.19_48)]";

export type DriverHubSidebarProps = {
  /** Already filtered for the persona by the shell. */
  items: readonly HubNavItem[];
  /** The entry the current pathname resolves to, if any. */
  activeId: HubNavItemId | undefined;
  /**
   * Which of the three account shapes is signed in, resolved once by
   * `resolveHubAccount()` and passed down by the shell.
   *
   * The rail reads it for exactly one decision — whether the weekly-incentive
   * card belongs to this account at all. Required rather than optional and
   * defaulted, so a future render site that forgets it fails at `tsc` instead
   * of silently showing an independent driver's bonus bar to a fleet owner.
   */
  persona: HubPersona;
  /**
   * Optional right-aligned count badges, keyed by nav id — the design's accent
   * pill beside "Employees".
   *
   * Nothing passes one today and that is deliberate: the only count the design
   * shows is "1 invite pending", which has no schema behind it, and a nav pill
   * has nowhere to hang the `<SampleNote />` the honesty rule would require. A
   * screen with a *real* count (an unread dispatch, say) wires it in here.
   */
  counts?: Partial<Record<HubNavItemId, number>>;
};
```

The component body then becomes:

```tsx
export function DriverHubSidebar({
  items,
  activeId,
  persona,
  counts = {},
}: DriverHubSidebarProps) {
  return (
    <aside
      // Sticky at full viewport height rather than `fixed`, so the rail scrolls
      // with a short page and pins on a long one without the main column
      // needing a compensating left margin.
      className="sticky top-0 flex h-screen w-[248px] flex-none flex-col gap-7 border-r border-border bg-background px-4 py-6"
    >
      {/* …brand row and <nav> unchanged… */}

      {/* The incentive card is an independent driver's fact and nobody else's:
          a roster driver is paid by their employer, so a per-job bonus is not
          theirs to earn, and a fleet owner is not the person completing the
          jobs the bar counts. Hidden rather than adapted — the numbers behind
          it are sampled, and this spec does not make sampled data real. */}
      {persona === "INDEPENDENT" ? <WeeklyIncentiveCard /> : null}
    </aside>
  );
}

/**
 * The rail's bottom card: progress towards a weekly job target.
 *
 * Entirely sampled — there is no incentive or bonus model in the schema — so it
 * carries the honesty badge rather than passing itself off as this driver's
 * real progress. Rendered for `INDEPENDENT` only; see the call site above.
 *
 * A file-local component rather than an inline block so the sampled import and
 * the percentage arithmetic live with the one thing that uses them, instead of
 * running on every render of a rail that is not going to show them.
 */
function WeeklyIncentiveCard() {
  const { jobsDone, jobsTarget, note } = SAMPLE_WEEKLY_INCENTIVE;

  // Clamped so a future target of 0 (or an overshoot) cannot paint a fill
  // wider than its track.
  const incentivePercent = Math.round(
    Math.min(1, Math.max(0, jobsTarget > 0 ? jobsDone / jobsTarget : 0)) * 100,
  );

  return (
    <section
      aria-label="Weekly incentive"
      className="mt-auto rounded-xl border border-border p-3.5"
    >
      {/* …the whole of today's lines 115–139, moved verbatim… */}
    </section>
  );
}
```

Rules for the move:

- **Move the card's markup verbatim.** Same `aria-label="Weekly incentive"`, same `role="progressbar"` with its `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, same `aria-label="Jobs towards this week's bonus"`, same copy, same classes, same `<SampleNote note="Needs an incentive/bonus model — the schema records no weekly target or bonus." className="mt-2.5" />`. This task changes *who sees the card*, not *what the card says*.
- **Keep `mt-auto` on the `<section>`.** It is what pins the card to the bottom of the flex column. When the card is absent nothing else claims the free space and the rail simply ends after the nav — that is correct and intended. Do **not** add a spacer `<div className="flex-1" />` or move `mt-auto` onto the `<nav>` to "preserve the layout"; the design has nothing else down there.
- **No hooks are involved.** `DriverHubSidebar` calls none today and `WeeklyIncentiveCard` calls none either, so a conditional render carries no rules-of-hooks hazard. The extraction is for readability and to keep the sampled import off the shared path, nothing more.
- Keep `ACCENT_BG` at module scope — both the nav's count pill (line 96–97) and the incentive card's progress fill use it.
- Update the component's doc block (today's lines 34–41) so "brand row, the nav, and the weekly-incentive card" reads honestly, e.g. "…and, for an independent driver, the weekly-incentive card."

#### 2.3 The one line in the shell — and it is yours to write

`DriverHubSidebar` has exactly one render site in the repo: `src/components/driver-hub/driver-hub-shell.tsx:197`. Verified verbatim as it stands today:

```tsx
      <DriverHubSidebar items={items} activeId={activeItem?.id} />
```

Change it to:

```tsx
      <DriverHubSidebar
        items={items}
        activeId={activeItem?.id}
        persona={account.persona}
      />
```

**That single element is this task's entire diff in `driver-hub-shell.tsx`.** The prop and the value that fills it belong in the same commit: `persona` does not exist on `DriverHubSidebarProps` until you add it in §2.2, so nobody earlier in the spec could have passed it — task-01 is Wave 1, and an attribute referring to a prop that will not exist until Wave 3 would have failed `pnpm typecheck` for the whole of Waves 1 and 2. You add both halves together and the tree stays green at every commit.

`account` is already in scope at that point: `DriverHubShell` takes `account: HubAccount` as a prop (line 154 in `DriverHubShellProps`), uses it at line 189 and passes it whole to the header at line 201. No new import, no new local, no destructuring — just the one attribute.

**Making `persona` required rather than optional-with-a-default is the deliberate half of this design.** If the attribute is ever dropped — here, or at some future second render site — `pnpm typecheck` fails with "Property 'persona' is missing in type … but required in type 'DriverHubSidebarProps'" pointing straight at the call site. That is the intended loud failure. An optional prop defaulting to `"INDEPENDENT"` would compile clean and quietly ship an independent driver's sampled bonus bar to every fleet owner in production, which is precisely the class of bug this feature exists to remove.

**What you must not touch in this file.** Task-01 owns the rest of it. In particular, leave these exactly as you find them:

- **Line 189, `const items = hubNavForAccount(account);`, and the comment at 186–188** ("Nav filtering is cosmetic — hiding a link does nothing about a hand-typed URL, which is why `drivers/page.tsx`, `employees/page.tsx` and `loads/page.tsx` each re-derive their own rule server-side."). Task-01 rewrites this call and its comment when it re-keys `hubNavForAccount` on persona. If it looks already-updated when you arrive, that is task-01's work and it is correct — do not second-guess it, and do not "improve" the comment.
- **Lines 200–205, the `<DriverHubHeader>` call.** It needs **no** change at all: it already passes `account={account}`, so the header sees `account.persona` the moment task-01 adds the field to `HubAccount`. Adding a redundant `persona={account.persona}` there would be wrong — the header takes the whole account, not a persona.
- The `data-admin-surface` root, the `<main>` body, `HubHeaderContext` and its provider, `useHubSubtitle`, `useHubVehiclePill`, `FALLBACK_TITLE`, and the file's long doc blocks. None of it is in scope for either half of this task.

If your `git diff src/components/driver-hub/driver-hub-shell.tsx` shows anything beyond the `<DriverHubSidebar>` element, revert the excess before you finish.

### 3. Header — a persona-keyed account chip

#### 3.1 Why the two-value map no longer covers the space

`ACCOUNT_KIND_LABELS` is `Record<HubAccountKind, string>` — two keys, because `HubAccountKind` has two members. Since a roster driver and an independent driver are both `kind: "INDIVIDUAL"`, the chip prints "Individual" for both. That is the conflation this feature exists to end, and the chip is the one place in the hub where the account shape is stated to the user in words.

Replace the map with a persona-keyed one:

```ts
/**
 * The chip's copy, one label per persona.
 *
 * A lookup rather than something derived from the enum, so the three strings
 * are written out where a reviewer can read them — and so the two individual
 * shapes are visibly distinct. `HubAccountKind` cannot carry this: an
 * independent owner-driver and a driver on a company's roster are both
 * `kind: "INDIVIDUAL"`, and the chip that called both of them "Individual" was
 * the one place in the hub that stated the conflation out loud.
 *
 * "Company driver" rather than "Roster": `ROSTER` is this codebase's word for
 * the shape, not the driver's word for their own job.
 */
const ACCOUNT_PERSONA_LABELS: Record<HubPersona, string> = {
  INDEPENDENT: "Independent",
  ROSTER: "Company driver",
  BUSINESS: "Business",
};
```

and its render site:

```tsx
        <Badge
          variant="outline"
          className="h-auto rounded-full px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em] text-muted-foreground"
        >
          {ACCOUNT_PERSONA_LABELS[account.persona]}
        </Badge>
```

`Record<HubPersona, string>` is a mapped type over a literal union, so `noUncheckedIndexedAccess` (on in `tsconfig.json`) does not widen the lookup to `string | undefined` — exactly as it does not today for `Record<HubAccountKind, string>`. No `?? ""` fallback is needed and none should be added; the point of the exhaustive `Record` is that adding a fourth persona later is a compile error here rather than a blank chip in production.

**The `Badge` element itself does not change.** Same `variant="outline"`, same class string, same position in the right-hand cluster (after `vehiclePill`, before the online toggle). `Badge` is `src/components/ui/badge.tsx`; its base `cva` string includes `whitespace-nowrap` and `overflow-hidden`, which is a constraint on chip copy — see Notes.

#### 3.2 The import

Line 10 today is:

```ts
import type { HubAccount, HubAccountKind } from "@/lib/dashboard/hub/account";
```

After the change, `HubAccountKind` has no remaining reference in this file. Swap it:

```ts
import type { HubAccount, HubPersona } from "@/lib/dashboard/hub/account";
```

Leaving `HubAccountKind` in place is an eslint error, not a warning: the config at `eslint.config.mjs` spreads `tseslint.configs.recommended`, which turns on `@typescript-eslint/no-unused-vars`. `pnpm lint` will catch it, but catch it yourself first.

#### 3.3 Do NOT re-add the "Preview as" switcher

The header's doc block already carries this instruction at lines 47–54 and it is repeated here because it is the single most likely wrong turn on this task:

> The prototype puts a Business/Individual **segmented control** here. That is a prototype affordance — it exists so one HTML file can demo both shapes of the product. In the real app the account kind is derived from the session by `resolveHubAccount()` and is the same fact the Drivers/Employees pages guard on server-side, so a client-side switcher would be a control that either lies (the pages still redirect) or grants screens the session does not entitle the user to. Hence the static chip below. Do not re-add the switcher.

For the record, so the next reader has the full picture — three facts worth stating in the file while you are editing it:

1. **The design handoff contains no account-type badge at all.** In `UI:UX/Registered Driver account (New)/Driver dashboard header alignment/Driver Header.dc.html`, the desktop bar is: wordmark, left nav, the active-job pill, the notifications bell with its count, the driver's name, "My account". No chip. The file's `accountKind` prop (an enum of `"Business" | "Individual"`) is a *prototype knob* that drives the job pill's copy — `isFleet ? \`${jobsInProgress} jobs in progress\` : "Job in progress · TB4821"` — and its only rendered appearance is as a mono subline inside the mobile drawer's identity block. The chip in this repo is therefore an **invention of this codebase**, not a transcription of the design.
2. **What it replaced sits in the prototype's left rail, not its header.** `Driver Dashboard v2.dc.html` puts a `margin-top:auto` block labelled "Preview as" with a two-tab `Business` / `Individual` segmented control immediately above the weekly-incentive card, wired to `this.setState({ account: a, … })` — a client-side state flip that also bounces you off `employees`/`drivers` when you switch to Individual. (The existing header comment says the prototype "puts the segmented control here", meaning *in the chrome*; the control is in the rail. Correct the comment's wording if you like, but do not weaken its instruction.)
3. **Replacing that switcher with a session-derived static chip was the right call and is not up for revision.** The real app resolves the account from the Better Auth session in `resolveHubAccount()`; `/dashboard/drivers` and `/dashboard/employees` re-derive the same fact server-side and `redirect()` on it. A client-side switcher could only ever be cosmetic — flipping it to "Business" would not make the Drivers page load — so it would be a control that lies. This task keeps the chip static and merely gives it a third value.

#### 3.4 Preserve the BUSINESS online-toggle omission exactly as it is

Lines 117–125 today:

```tsx
        {/* A company session has no availability to flip — `isOnline` is
            `null` for it, and the endpoint 403s a non-DRIVER outright — so the
            pill is absent rather than rendered in a permanently dead state. */}
        {account.isOnline !== null ? (
          <HubOnlineToggle
            isOnline={account.isOnline}
            canToggleOnline={account.canToggleOnline}
          />
        ) : null}
```

Verified correct and already persona-aware in effect: `resolveHubAccount()`'s `COMPANY` branch sets `isOnline: null` and `canToggleOnline: false` with a long comment explaining that a fleet is not a driver and `PATCH /api/driver-profile/status` rejects a `COMPANY` session outright. So a `BUSINESS` account gets no toggle, and the `isOnline !== null` test is also what narrows `boolean | null` down to the `boolean` that `HubOnlineToggleProps.isOnline` requires.

**Leave this block byte-for-byte alone.** Three specific temptations to resist:

- Do **not** rewrite the condition as `account.persona !== "BUSINESS"`. It would be behaviourally equivalent today but it loses the type narrowing — `account.isOnline` would stay `boolean | null` and fail to satisfy `HubOnlineToggleProps.isOnline: boolean`, forcing a non-null assertion where a genuine narrowing exists. The `null` check *is* the better test.
- Do **not** hide the toggle for `ROSTER`. An employed driver is still a driver: they have a real `DriverProfile.isOnline`, `PATCH /api/driver-profile/status` accepts them, and their availability is exactly as meaningful as an independent driver's. This spec withholds the Wallet and the Load Board from a roster driver; it does not touch their online state.
- Do **not** add a persona branch to `HubOnlineToggle` itself. `src/components/driver-hub/hub-online-toggle.tsx` is outside this task's file set.

#### 3.5 Leave the three deferred-feature comment blocks intact

Lines 56–83 of the header carry a long doc block explaining what the header-alignment handoff added and what it deliberately did not build:

- **No notifications bell** (≈ lines 62–69) — there is no notification system anywhere in this repo: no model in `prisma/schema.prisma`, nothing under `src/lib` or `src/app/api`. A bell needs a table, a read/unread model, write points at every order-lifecycle event and a delivery mechanism. Deferred to its own spec.
- **No "My account" link** (≈ lines 70–73) — `/account` is client-only and `src/app/account/page.tsx` redirects any non-CLIENT role back to `/dashboard`, so the link would be a loop.
- **No active-job indicator** (≈ lines 74–79) — its data (`getHubToday()`) is resolved per-screen, and the shell's contract is that nothing in the header fetches.

**These are out of scope for this task and the comments must survive it verbatim.** They sit immediately above the function you are editing and are the most likely casualty of a careless reformat. They are not stale TODOs: each one records a *fact about this codebase* that a future implementer would otherwise have to rediscover, and `requirements.md` lists the header rebuild among the non-goals precisely because these three are real work with data layers behind them. Do not delete them, do not shorten them, do not convert them to a `TODO:` line. Note also that `action-required.md` already flags that the handoff's `github.md` wrongly claims the bell and the "My account" screen landed — a human is to correct that file; deleting these comments would remove the only in-repo record of the truth.

Equally, do not delete the sign-out button's comment at lines 145–155 (it explains that `globals.css` hides the global site header for any `data-admin-surface` subtree, so this is the hub's only way out) or the `vehiclePill` slot comment at 105–107.

### 4. The `counts` prop, and why it stays unpassed

You asked the right question if you noticed it: `DriverHubSidebarProps.counts` (line 31) exists, is optional, defaults to `{}` at line 45, is read at line 76 and rendered as an accent pill at lines 93–102 — and **nothing in the repo passes it.** The shell's call at `driver-hub-shell.tsx:197` supplies `items` and `activeId` only today, and after §2.3 it supplies `items`, `activeId` and `persona` — still no `counts`. So the pill is dead code, and stays dead.

That is deliberate and it stays that way. **Do not remove the prop, and do not wire it up.** The reasoning, already in the file's own doc comment at lines 22–30 and worth restating here:

- The one count the design shows is the accent `1` beside "Employees" in `Driver Dashboard v2.dc.html` — `this.navItem('employees', 'Employees', 1)`, described in the prototype as "1 invite pending".
- **There is no schema behind it.** No pending-invite model, no unread counter. A `1` rendered there would be an invented number.
- **A nav pill has nowhere to hang a `<SampleNote />`.** The honesty convention (`requirements.md`, Technical Constraints) is that anything fed by `sample.ts` renders the badge. `SampleNote` is itself a `Badge` — a pill with a dot, a label and screen-reader text — and it does not fit inside a 20px-wide count pill in a 248px rail. So the two available options are "an unbadged invented number" (which the convention forbids) or "no number", and the file chose the latter while keeping the prop ready for the day a screen has a *real* count to pass (an unread dispatch, say).
- Removing the prop would be a small regression in intent: the type, the render branch and the comment together are the design's Employees badge, documented as unfulfillable rather than silently dropped.

If anything, tighten the prop's doc comment to say "persona" where it says "account kind", to match the rest of the rail after this change. Nothing else.

### 5. Verification

There are no unit tests for the hub chrome — `tests/` holds four Playwright specs, none of which touches the Driver Hub, and `requirements.md` lists "No new tests" among the non-goals, so add none. Verify like this:

1. `pnpm typecheck` — must pass clean. This is the check that proves the shell passes `persona` and that `ACCOUNT_PERSONA_LABELS` is exhaustive over `HubPersona`. A useful way to confirm the guard is real rather than assumed: temporarily delete the `persona={account.persona}` attribute, watch `tsc` fail at `driver-hub-shell.tsx:197`, then put it back.
2. `pnpm lint` — must pass clean. This is the check that catches a leftover `HubAccountKind` import.
3. `pnpm check` runs both.
4. `git grep -n "ACCOUNT_KIND_LABELS"` — must return nothing.
5. `git grep -n "SAMPLE_WEEKLY_INCENTIVE"` — must return exactly two hits, both in `driver-hub-sidebar.tsx` (the import, and the destructure inside `WeeklyIncentiveCard`), plus the export in `sample.ts`.
6. Read your own diff of `driver-hub-header.tsx` and confirm the deferred-feature block (bell / "My account" / active-job) and the online-toggle block appear in it as *context*, not as changed lines.
7. `git diff src/components/driver-hub/driver-hub-shell.tsx` — must show the `<DriverHubSidebar …>` element and nothing else. Anything touching line 189 or the header props at 200–205 is out of scope and belongs to task-01; revert it.
8. Runtime verification needs three signed-in sessions and is gated on a human — `action-required.md` asks for one independent driver, one driver with `DriverProfile.companyId` set, and one `role === "COMPANY"` account. If they exist, check: the rail's bottom card is present for the independent driver only, and the chip reads "Independent", "Company driver" and "Business" respectively. If they do not exist, say so in your completion note rather than claiming the runtime behaviour was verified.

## Acceptance Criteria

- [ ] `DriverHubSidebarProps` carries a **required** `persona: HubPersona`, imported as a type from `@/lib/dashboard/hub/account`.
- [ ] The "Weekly incentive" `<section>` renders when `persona === "INDEPENDENT"` and does not render for `"ROSTER"` or `"BUSINESS"`.
- [ ] The surviving card is unchanged in copy, classes and accessibility attributes — same `aria-label="Weekly incentive"`, same `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`, same `aria-label="Jobs towards this week's bonus"`, same `mt-auto`.
- [ ] The card still renders its `<SampleNote note="Needs an incentive/bonus model — the schema records no weekly target or bonus." className="mt-2.5" />`. Nothing about the card was de-mocked.
- [ ] `SAMPLE_WEEKLY_INCENTIVE` still exists in `src/lib/dashboard/hub/sample.ts`, unchanged, with its retirement comment intact.
- [ ] No spacer element was added to the rail to compensate for the hidden card, and `mt-auto` still lives on the card's own `<section>`.
- [ ] `DriverHubSidebarProps.counts` still exists, is still optional, is still read in the nav loop, and is still passed by nobody. Its doc comment still explains why.
- [ ] `ACCOUNT_KIND_LABELS` is gone; a `Record<HubPersona, string>` with all three keys replaces it, and the chip renders `[account.persona]`.
- [ ] The chip's `<Badge variant="outline" …>` element and class string are unchanged, and it still sits between the `vehiclePill` slot and the online toggle.
- [ ] `driver-hub-header.tsx` imports `HubPersona` and no longer imports `HubAccountKind`; `pnpm lint` is clean.
- [ ] No client-side account-type switcher was added anywhere, and the "Do not re-add the switcher" paragraph survives in the header's doc block.
- [ ] The `{account.isOnline !== null ? <HubOnlineToggle … /> : null}` block and its comment are byte-for-byte unchanged, and the toggle still renders for `ROSTER`.
- [ ] The header's three deferred-feature comment blocks (notifications bell, "My account" link, active-job indicator) and the sign-out button's comment are present and unshortened.
- [ ] `src/components/driver-hub/driver-hub-shell.tsx` passes `persona={account.persona}` to `<DriverHubSidebar>` at line 197.
- [ ] That is the **only** change in `driver-hub-shell.tsx`: `git diff` on it shows the `<DriverHubSidebar …>` element and nothing else — line 189's `hubNavForAccount(account)` call, the comment above it, and the `<DriverHubHeader>` props at 200–205 are untouched.
- [ ] No Prisma schema change, no migration, no new test file.
- [ ] `pnpm lint` and `pnpm typecheck` both pass clean.

## Notes

- **The mobile shell is out of scope, and the rail is the reason someone will want to fix it here.** `driver-hub-sidebar.tsx:60` is a hard `w-[248px] flex-none` with no breakpoint and no drawer, and `driver-hub-shell.tsx` is `px-8` at every width — 312px of fixed chrome on a 375px phone. That is a real defect and it is explicitly a non-goal of this spec (`requirements.md`, Non-Goals: "No mobile shell work"). Do not add a breakpoint, a `hidden md:flex`, a `Sheet`, a hamburger, or a responsive width — not in the rail, and not in the shell while you are there for the one-line prop pass. It is called out here only so you recognise it as known rather than as something you have just discovered.
- **Chip copy is a judgement call, and the constraint on it is width.** `Badge`'s base `cva` in `src/components/ui/badge.tsx` includes `whitespace-nowrap` and `overflow-hidden`; the chip sits in a `gap-[18px]` flex row that also holds a screen's `vehiclePill`, the online toggle, the avatar block and the sign-out button. "Company driver" is the longest of the three labels at 14 characters and is comfortable. If a reviewer prefers different words, keep them short and keep the map exhaustive.
- **Naming the employer on the chip was considered and not taken.** `HubAccount.companyName` is populated for a roster driver (`resolveHubAccount()` reads `company: { select: { companyName: true } }`) and is currently rendered *nowhere* in the hub chrome — `git grep companyName src/components/driver-hub` returns only `employees-screen.tsx:121`. A chip reading the employer's name would be more informative than "Company driver", but a company name is unbounded and the chip is `whitespace-nowrap`, so a long name would push the identity block off the bar. It is also a header-content decision, and the header rebuild is a non-goal here. Leave it; if it is wanted later, the natural home is the avatar block's mono `identifier` line, not the chip.
- **A stale comment you will read in `account.ts`.** The driver branch of `resolveHubAccount()` says "`companyId` only decides whether the header names their company, never which screens they get." Both halves are now out of date: the header names nobody's company (it never did), and after task-01 `companyId` *is* part of what decides which screens a roster driver gets. Fixing that comment belongs to task-01, which owns `account.ts` — do not edit it from here, and do not take it as a spec for the chip.
- **The chip is the hub's only visible statement of account shape.** After this task it is the only place a roster driver can see that the hub knows they are employed. That makes it worth getting the copy right, and it makes it a poor place for a stale string — which is exactly why the exhaustive `Record<HubPersona, string>` is preferable to a ternary. A fourth persona would break the build here, loudly, at the one place a user reads the answer.
- **Scope discipline.** This task's whole diff should be three files — two components edited properly, plus a one-line prop pass in the shell — and well under a hundred changed lines. If you find yourself editing a loader, a `page.tsx`, `driver-hub-nav.ts`, `account.ts`, `hub-online-toggle.tsx`, `hub-primitives.tsx`, `sample.ts`, or the shell beyond the single `<DriverHubSidebar>` element in §2.3, stop — that work belongs to another task in this spec.
- **Why the shell is split between two tasks, in case a reviewer queries it.** `driver-hub-shell.tsx` normally belongs to task-01, which rewrites its `hubNavForAccount(account)` call at line 189. The `<DriverHubSidebar>` render site at line 197 is carved out to this task instead, because the prop it fills does not exist until this task creates it: had task-01 written `persona={account.persona}` in Wave 1, `pnpm typecheck` would have been red across Waves 1 and 2. The two edits are in different functions on different lines and no other Wave 3 task (06, 07, 08, 09) touches this file, so the split is conflict-free — but it does mean this is the one file in the spec with two owners, and both halves must be present before it reads correctly.
