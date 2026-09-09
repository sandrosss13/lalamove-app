# Paste this into Claude Design

Copy everything below the line.

---

Design a **Driver Job Sheet** — the screen a delivery driver works from after they have claimed
a job. Two artboards: **phone (390 × 844) first**, then desktop as a single centred column at
`max-width: 720px`.

## Who uses it

A driver, one-handed, standing at a loading bay or sitting in a cab, often in daylight,
sometimes wearing gloves. This is a work surface, not a dashboard. Legibility and tap-target
size beat density. Market is Georgia — addresses in mixed Georgian/Latin script, `+995` phone
numbers, GEL (`₾`) currency, `en-GB` dates.

## What it must do

1. **Contact and navigate** — who to call at each stop, one tap to open directions.
2. **Move the job forward** — start the delivery, mark it delivered.
3. **Show what is being carried** — cargo, handling, helpers, timing, pay.

No photos, no signature, no uploads of any kind. Delivery is confirmed by a button, not evidence.

## The visual language — match it exactly

A **quiet, dense, information-first admin surface**. shadcn/ui `radix-nova`, neutral base,
lucide icons. Explicitly *not* neobrutalism: no thick borders, no hard offset shadows, no
colour-blocked panels. White cards, 1px hairline borders, colour used **only** for status.

**Light mode only.**

### Colours

| Role | Value |
|---|---|
| Page / card / sheet surface | `oklch(1 0 0)` |
| Primary text | `oklch(0.145 0 0)` |
| Secondary / muted text | `oklch(0.556 0 0)` |
| Muted surface, hover | `oklch(0.97 0 0)` |
| Every 1px border | `oklch(0.922 0 0)` |
| Primary button background | `oklch(0.205 0 0)` |
| Text on primary | `oklch(0.985 0 0)` |
| Focus ring | `oklch(0.708 0 0)` |
| Brand accent (dots, active marks) | `oklch(64% 0.19 48)` |

### Status pills — a closed set of six, do not add a seventh

| Tone | Background | Text | Used for |
|---|---|---|---|
| success | `oklch(96.2% 0.044 156.743)` | `oklch(44.8% 0.119 151.328)` | Delivered |
| info | `oklch(93.2% 0.032 255.585)` | `oklch(42.4% 0.199 265.638)` | In transit |
| danger | `oklch(93.6% 0.032 17.717)` | `oklch(44.4% 0.177 26.899)` | Cancelled |
| warning | `oklch(97.3% 0.071 103.193)` | `oklch(47.6% 0.114 61.907)` | — |
| neutral | `oklch(96.7% 0.003 264.542)` | `oklch(44.6% 0.03 256.802)` | Scheduled |
| demand | `oklch(96% 0.04 60)` | `oklch(48% 0.15 48)` | — |

Pill shape: `border-radius: 999px`, transparent border, padding `3px 9px`, 11px / 600,
`letter-spacing: 0.02em`.

### Type

**IBM Plex Sans** for everything. **IBM Plex Mono for every numeric** — money, counts, order
ids, plates, dates — with `font-variant-numeric: tabular-nums` on anything aligned.

Sizes in use: 11px (uppercase labels, pills) · 12px (meta) · **13px (the workhorse body size)** ·
14px (buttons) · 15px (card title) · 17px→20px (page title, phone→desktop) · 26px (the payout
figure).

Letter-spacing: `0.06em` uppercase on 11px section labels · `-0.02em` on large numerals ·
`-0.015em` on the page title.

### Shape and spacing

- Cards: `border-radius: 14px`, 1px border, `padding: 22px`
- Buttons, inputs: `border-radius: 6px` · Dialogs and sheets: `12px` · Pills: `999px`
- Gaps: 12px dominates; **20px between page sections**
- Two-column spec lists: `grid-template-columns: 96px 1fr`, row gap 8px, column gap 12px, 13px
- Route stop markers: 8px dot — pickup filled `oklch(0.205 0 0)`, dropoff a 2px ring with
  transparent centre
- Shadows: almost none. The only two in the whole product are
  `0 1px 2px rgba(0,0,0,0.06)` and `-8px 0 24px rgba(0,0,0,0.08)`

### Touch

**44px minimum** on every control. **56px** on the two primary state-change buttons. The primary
action is a **persistent bottom-anchored bar**, not a section in the scroll. `tel:` rows are
full-width, not inline links.

### Components that do not exist — do not design with them

No tooltip, no toast, no progress bar, no separator, no avatar, no skeleton, no accordion.
Available: badge, button, calendar, card, checkbox, dialog, dropdown-menu, input, label,
popover, select, sheet, table, tabs, textarea. Async feedback is an inline status line, never a
toast.

## Screens to draw

### 1. ACCEPTED — before pickup

Top to bottom:

1. **Header** — order reference in mono (`GE-48204`), status pill, and the driver's pay at 26px
   / 600 / tabular-nums.
2. **Timing** — scheduled pickup, pickup window, delivery deadline. High up: this is why a
   driver opens the sheet before setting off.
3. **Pick-up** — address, city, contact name, phone. Two actions: **Call**, **Navigate**.
4. **Drop-off** — same shape, visually subordinate for now.
5. **Cargo** — category, packaging, weight, dimensions, quantity, handling tags, helper count.
6. **Bottom bar** — `Start delivery`, full width.

### 2. IN_TRANSIT — after pickup

Same screen, re-weighted: drop-off becomes prominent, pick-up collapses to one completed line,
status pill changes, bottom bar becomes `Mark delivered`.

### 3. Delivery confirmation dialog

Irreversible, so it needs a deliberate confirm. ~440px panel, `border-radius: 12px`, a summary
card inside, then `Cancel` and the primary button side by side at a 1 : 1.6 width ratio.

Contains:
- A line naming the drop-off, so the driver can confirm they are at the right stop
- **Waiting time** — required, whole minutes, defaults to `0`
- **Received by** — optional recipient name
- Confirm / Cancel

### 4. COMPLETED

Read-only. Actions gone. Shows completion time, waiting minutes, overtime pay if any, and the
received-by name. **Contacts stay visible** — a driver may need to call about a finished job.

### 5. Edge states

- **Not your job** — a plain "not found". Do not name the order or explain the permission.
- **Cancelled while held** — terminal state with a route back. Note: the system does not record
  *when* it was cancelled, so do not show a cancellation time.
- **No coordinates** — many jobs have no lat/lng at all. Whatever you draw for Navigate must
  have a designed empty state; it is common, not an edge case.

## Copy — use these strings exactly

| Context | String |
|---|---|
| Page title | `Job sheet` |
| Sections | `Pick-up` / `Drop-off` |
| Primary, before pickup | `Start delivery` |
| Primary, after pickup | `Mark delivered` |
| Stop actions | `Call` / `Navigate` |
| Waiting time label | `Waiting time` |
| Waiting time helper | `Whole minutes spent waiting at either stop. Enter 0 if none.` |
| Recipient | `Received by (optional)` |
| Confirm button | `Confirm delivery` |
| Completed status | `Delivered` |
| Not yours | `This delivery isn't assigned to you.` |
| Cancelled | `This delivery was cancelled.` |

Placeholder for any absent value: an em dash `—`.

## Hard rules

- **Never show the client's price.** The driver sees only their own payout. Showing the client
  price would quote a number that is wrong in the driver's favour.
- **Only three timeline points are truthful**: order placed, picked up, dropped off. The system
  records no "accepted" or "cancelled" timestamp. Do not draw a five-step tracker.
- **Two stops only** — one pickup, one dropoff. Design for two, but not in a way that could
  never extend.

## Questions to answer in the design

1. Where does waiting time get entered — a field in the confirmation dialog, or a timer the
   driver starts on arrival? The field is assumed here; the timer may be better.
2. Waiting time changes the driver's own pay. Should the dialog show them the effect, or just
   take the number?
3. What does a job sheet for a job scheduled days from now look like — the same screen with a
   disabled action, or its own state?
