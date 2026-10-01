# Handoff: Sign in / Sign up redesign (Lalamove clone)

## Overview
A redesign of the public authentication flow for `sandrosss13/lalamove-app`. It replaces the current two bare role-picker pages with one connected flow: choose role → choose account type → sign in or create an account, plus OTP verification, error, password reset, and success states.

Target repo: `sandrosss13/lalamove-app`, branch `main`. Existing files this replaces or extends:
- `src/app/sign-in/page.tsx`
- `src/app/sign-up/page.tsx`
- `src/components/auth/sign-in-form.tsx`
- `src/components/auth/sign-up-form.tsx`
- `src/lib/auth-client.ts` (auth calls)
- `src/lib/georgian-cities.ts` (city list)
- Not in scope: `src/app/(admin-sign-in)/admin/sign-in/page.tsx` (back office keeps its own screen; the new design only links to it)

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype of the intended look and behavior, not production code to copy. `Auth - Sign in & Sign up.dc.html` is a single-file prototype with a small runtime (`support.js`) that renders an inline-styled template plus a logic class. Do not port that runtime.

The task is to **recreate these designs in the existing Next.js app**, using its established patterns: App Router pages under `src/app/`, client components under `src/components/auth/`, Tailwind v4 utility classes, and the existing shadcn-style component set (`Button`, `Input`, `Label`, `Tabs`, `Select`, `Checkbox`, `Card`) that the prototype consumes as the `LalamoveUI` bundle. Keep the real auth calls in `src/lib/auth-client.ts`; the prototype's navigation is faked.

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, radii, copy, and states are final and should be matched closely. Two caveats:
- Social buttons are text-only ("Google", "Apple", "Facebook") — add the real brand marks from the codebase's icon set.
- No illustration or photography was produced. If a visual is wanted later it needs to be supplied.

## Screens / Views

All screens share the same shell. In the prototype, state is one `screen` string; in the app, screens 1–3 and 6 belong to `/sign-in` and `/sign-up`, with OTP as its own step or route.

### Shell (all screens)
- Root: `min-height: 100vh`, `display:flex`, `flex-direction:column`, background `#faf9f6`, text `#171717`, font `IBM Plex Sans` (`font-body` on the root, with `data-admin-surface`).
- Header: fixed height `64px`, `background:#fff`, `border-bottom:1px solid #e7e4de`, horizontal padding `clamp(20px,5vw,48px)`, `display:flex; align-items:center; justify-content:space-between`.
  - Left: `22×22px` square, `border-radius:6px`, `background:#ff5a1f` (logo placeholder — swap for the real mark) + wordmark "Lalamove Clone" at `16px/600`, `letter-spacing:-0.01em`.
  - Right: `gap:18px`; "Need help?" link `13px`, `#6b675f`; language chip "EN" `12px/500`, `#6b675f`, `1px solid #e7e4de`, `border-radius:999px`, padding `5px 10px`.
- Main: `flex:1`, `display:flex; justify-content:center`, padding `clamp(32px,6vw,64px) clamp(20px,5vw,48px) 140px`.
- Prototype-only: a fixed dark pill nav at the bottom for jumping between screens. **Do not ship it.**

### 1. Role step (`/sign-in` and `/sign-up`, step 1)
- **Purpose**: pick Client vs Driver/fleet, and switch between signing in and creating an account.
- **Layout**: column, `max-width:860px`, `gap:28px`.
- **Components**:
  - Eyebrow: "Step 1 of 3 · Account", `12px/600`, `letter-spacing:0.12em`, uppercase, `#ff5a1f`.
  - H1: "How will you use Lalamove?", `clamp(28px,4vw,40px)`, `line-height:1.1`, weight 600, `letter-spacing:-0.02em`, `text-wrap:pretty`.
  - Sub: "Pick the side of the delivery you are on. You can sign in or create an account from either one." `16px`, `line-height:1.55`, `#6b675f`, `max-width:52ch`.
  - Mode toggle: segmented control, `background:#f1efe9`, `border-radius:10px`, `padding:4px`, `width:fit-content`. Active segment `background:#fff`, `color:#15140f`, `border-radius:7px`, `box-shadow:0 1px 2px rgba(21,20,15,.08)`; inactive `transparent`, `#6b675f`, hover `#15140f`. Segment padding `8px 16px`, `14px/500`. Options: "Sign in" | "Create account".
  - Role cards: `display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px`. Each card: `background:#fff`, `1px solid #e7e4de`, `border-radius:14px`, `padding:24px`, column, `gap:14px`, left-aligned, whole card is the button. Hover: `border-color:#ff5a1f`, `box-shadow:0 8px 24px -16px rgba(21,20,15,.35)`, `transition:border-color .15s, box-shadow .15s`.
    - Numeral badge `40×40px`, `border-radius:10px`, `15px/600`. Client: `background:#fff1ea`, `color:#ff5a1f`, text "01". Driver: `background:#f1efe9`, `color:#15140f`, text "02".
    - Title `20px/600`, `letter-spacing:-0.01em`, `#15140f`. Client: "Client"; Driver: "Driver or fleet".
    - Subtitle `14px`, `line-height:1.5`, `#6b675f`. Client: "Book deliveries for your packages"; Driver: "Deliver packages and earn".
    - Benefit list (toggleable): `padding-top:6px`, `border-top:1px solid #f1efe9`, `gap:8px`, each `13px`, `#3f3c36`.
      - Client: "Instant price quote before you book" / "Same-day delivery across Georgia" / "Live tracking and shared receipts"
      - Driver: "Pick jobs from the load board" / "Weekly payouts, no monthly fee" / "One vehicle or a whole company"
    - Footer line `13px/500`, `#15140f`. Client: "Individual or business  →"; Driver: "Individual, ind. entrepreneur or company  →".
  - Footer: "Staff account?" `13px`, `#6b675f`, with an underlined link "Sign in to the back office" → `/admin/sign-in`.

### 2. Account type (step 2)
- **Purpose**: choose the legal account type; determines the fields collected next.
- **Layout**: column, `max-width:560px`, `gap:24px`. Back link at top: "← Back", `13px`, `#6b675f`, hover `#15140f`.
- **Components**:
  - Eyebrow "Step 2 of 3 · Type" (same style as step 1).
  - H1 "Which describes you?", `clamp(26px,3.4vw,34px)`, `line-height:1.15`, 600, `-0.02em`.
  - Sub "This decides what we ask for next — personal details or company documents." `15px/1.55`, `#6b675f`.
  - Option rows: column, `gap:10px`. Each row `background:#fff`, `1px solid #e7e4de`, `border-radius:12px`, `padding:18px 20px`, `display:flex; align-items:center; gap:14px`; hover `border-color:#ff5a1f`. Radio dot `18×18px`, `border-radius:999px`, `1.5px solid #cfcac0` (selected state should fill with `#ff5a1f` and a white inner dot — the prototype shows unselected only).
    - "Individual" / "A private person, no registration number"
    - "Individual Entrepreneur" / "Registered as an individual entrepreneur (ინდ. მეწარმე)" — **driver role only**
    - "Business" / "A registered company with a VAT ID"
  - Titles `16px/500`, `#15140f`; descriptions `13px`, `#6b675f`.

### 3. Sign in (step 3, `mode = signin`)
- **Purpose**: authenticate by phone OTP (default) or email + password.
- **Layout**: column, `max-width:420px`, `gap:24px`. "← Back" to step 2.
- **Components**:
  - Context chip: `"{Role} · {Type}"` e.g. "Client · Individual". `12px/500`, `#3f3c36`, `background:#f1efe9`, `border-radius:999px`, `padding:5px 10px`.
  - H1 "Sign in", `clamp(26px,3.4vw,34px)/1.15`, 600.
  - `Tabs` (default `phone`), `TabsList` full width, two `TabsTrigger` at `flex-1`: "Phone", "Email".
  - **Phone tab** (`padding-top:20px`, `gap:16px`):
    - `Label` "Phone number"; row `gap:8px` of a static prefix box "+995" (`height:44px`, `padding:0 12px`, `1px solid #e7e4de`, `border-radius:8px`, `background:#fff`, `15px`, `#3f3c36`) + `Input type=tel placeholder="555 12 34 56"` at `h-11 text-base`.
    - Helper `13px`, `#6b675f`: "We text a 6-digit code. No password needed."
    - Primary `Button` full width `h-11 text-base`: "Send code" → OTP screen.
  - **Email tab**:
    - `Label` "Email" + `Input type=email placeholder="you@company.ge"`.
    - Password row: `Label` "Password" on the left, text button "Forgot password?" on the right (`13px`, `#6b675f`, hover `#ff5a1f`); `Input type=password placeholder="••••••••"`.
    - Primary `Button` full width: "Sign in".
  - Social block (toggleable): divider with `1px` rules `#e7e4de` and centered label "or continue with" (`12px`, `#6b675f`); then `grid-template-columns:repeat(3,1fr); gap:8px` of `Button variant="outline" h-11`: Google, Apple, Facebook.
  - Footer: "New to Lalamove?" + inline button "Create an account" (`14px/500`, `#15140f`, `border-bottom:1px solid #d8d4cb`) → sign-up.

### 4. OTP entry
- **Purpose**: verify the 6-digit SMS code.
- **Layout**: column, `max-width:420px`, `gap:24px`. "← Back" to sign in.
- **Components**:
  - H1 "Enter the code".
  - Sub `15px/1.55`, `#6b675f`: "Sent to +995 555 12 34 56." + inline button "Change number".
  - Six inputs in a `flex; gap:8px` row, each `flex:1; min-width:0`, `height:56px`, centered text, `22px/500`, `#15140f`, `background:#fff`, `1px solid #e7e4de`, `border-radius:10px`. Focus: `border-color:#ff5a1f`, `box-shadow:0 0 0 3px rgba(255,90,31,.15)`. `inputmode=numeric`, `maxlength=1`; advance focus on entry, backspace moves back, paste of 6 digits fills all (prototype implements value handling only).
  - Primary `Button` full width: "Verify and continue".
  - Resend line `14px`, `#6b675f`: counts down from `0:24` as "Resend code in 0:24"; at zero becomes "Didn't get it? Resend the code" (make that a button in the app).

### 5. Wrong password / error state
Same as the Sign in email tab, with:
- Alert above the fields: `background:#fdf2ee`, `1px solid #f3c4b4`, `border-radius:10px`, `padding:14px 16px`, `display:flex; gap:12px`, `role="alert"`. Icon `18×18px` circle `background:#c3341a`, white "!", `12px/600`. Title `14px/500`, `#7a2010`: "That email and password don't match." Body `13px/1.5`, `#7a2010`: "Two attempts left before we pause sign-in for 15 minutes."
- Email prefilled (`dispatch@karvani.ge` in the mock).
- Password input in error state: `1px solid #c3341a`, `box-shadow:0 0 0 3px rgba(195,52,26,.12)`.
- "Forgot password?" becomes "Reset it", `13px/500`, `#c3341a`.
- Footer `13px/1.5`, `#6b675f`: "Signed up with a phone number instead?" + inline button "Use a code".

### 6. Forgot password
- **Layout**: column, `max-width:420px`, `gap:24px`. "← Back to sign in".
- H1 "Reset your password"; sub `15px/1.55`, `#6b675f`: "Enter the email on your account. We send a link that stays valid for 30 minutes."
- `Label` "Email" + `Input type=email placeholder="you@company.ge"`; primary `Button` full width "Send reset link".
- Note `13px/1.5`, `#6b675f`: "Back-office accounts reset through your administrator, not this form."

### 7. Sign up (step 3, `mode = signup`)
- **Layout**: column, `max-width:420px`, `gap:24px`. "← Back" to step 2.
- Eyebrow "Step 3 of 3 · Details"; H1 "Create your account"; sub `"{Role} · {Type} · takes about a minute."`
- Fields (`gap:16px`, each field `gap:8px`):
  - Name row: `grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px` — "First name", "Surname".
  - "Phone number" — same `+995` prefix + `Input`; helper "Used to verify your account and to reach you about a delivery."
  - "Email" — `placeholder="you@company.ge"`.
  - "Password" — `Input type=password`; strength meter of three bars `height:4px`, `border-radius:999px`, `gap:4px` (filled `#ff5a1f`, empty `#e7e4de`; mock shows 2/3); helper "At least 8 characters. Add a number to make it stronger."
  - "City" — **driver role only**. `Select` + `SelectTrigger` (`w-full h-11 text-base`), placeholder "Select a city…", items from `src/lib/georgian-cities.ts` (mock: Tbilisi, Batumi, Kutaisi, Rustavi, Zugdidi with values `TBILISI` etc.).
  - Terms: `Checkbox` + label `13px/1.5`, `#3f3c36`, `align-items:flex-start`, `gap:10px`: "I agree to the terms of service and the privacy policy." with both phrases as underlined links.
  - Primary `Button` full width: "Create account" → OTP.
  - Footer: "Already registered?" + inline button "Sign in".
- Business type should also collect company name and VAT ID — **not designed yet**, follow the same field pattern or ask before building.

### 8. Success / redirect
- **Layout**: column, `max-width:420px`, `gap:20px`, `padding-top:clamp(8px,4vw,48px)`.
- Check badge `48×48px` circle, `background:#15140f`, white `✓` at `20px`.
- H1 "You're signed in"; sub `"{Role} · {Type} · taking you to your dashboard."`
- Progress bar `height:4px`, track `#e7e4de`, fill `68%` `#ff5a1f`, both `border-radius:999px`. In the app, animate to 100% then `router.push` to the role's dashboard.
- `Button variant="outline" h-11` "Start over" — prototype affordance only; replace with the real redirect.

## Interactions & Behavior
- **Flow**: role step sets `role` and advances to type; type sets `type` and advances to sign-in or sign-up depending on `mode`; sign-in phone tab and sign-up submit go to OTP; OTP verify and email sign-in go to success.
- **Mode toggle** on step 1 only switches `mode` — it must not skip step 2. (This was a bug in the first prototype pass; both modes run role → type → form.) Header "Sign in" / "Sign up" return to step 1 with the matching mode.
- **Back links** step back one screen and preserve `role` / `type`.
- **Conditional fields**: "Individual Entrepreneur" appears for drivers only; the City select appears for drivers only.
- **Hover**: cards and rows shift `border-color` to `#ff5a1f` over `.15s`; cards add the shadow above; text buttons darken to `#15140f`.
- **Focus**: OTP cells use the orange ring described above; DS `Input`/`Button` keep their own `ring-ring` focus.
- **OTP countdown**: 1s interval from 24 to 0 while the OTP screen is mounted; clear on unmount.
- **Validation** (to implement — prototype does not validate): phone required, 9 digits after `+995`; email format; password ≥ 8 chars; terms checkbox required before "Create account" enables or errors; OTP requires all 6 digits. Show field-level errors in the error styling from screen 5.
- **Loading**: not designed. Use the DS `Button` disabled state with a spinner and keep the label ("Sending code…", "Signing in…").
- **Responsive**: fully fluid, no fixed widths. Role cards collapse from two columns to one under ~610px; the name row collapses under ~330px; social buttons stay a 3-up grid; type scales via `clamp()`. Verified down to ~360px.

## State Management
```
screen: "start" | "type" | "signin" | "otp" | "error" | "forgot" | "signup" | "done"
mode:   "signin" | "signup"          // set by the step-1 toggle / header links
role:   "CLIENT" | "DRIVER"
type:   "INDIVIDUAL" | "INDIVIDUAL_ENTREPRENEUR" | "BUSINESS"
otp:    string[6]
resend: number                        // seconds, counts down on the OTP screen
```
In the app, `role`/`type`/`mode` are better as URL state (`/sign-up?role=driver&type=business`) so back/forward and refresh behave; `otp` and `resend` stay local to the OTP component. Data needs: cities from `src/lib/georgian-cities.ts`; auth, OTP request/verify, and password reset through `src/lib/auth-client.ts`.

## Design Tokens
Colors (prototype literals — map to the app's Tailwind tokens where equivalents exist):

| Value | Use |
|---|---|
| `#ff5a1f` | Accent: eyebrow, hover borders, focus ring, progress, strength meter (exposed as a tweak) |
| `#fff1ea` | Accent tint (Client badge) |
| `#faf9f6` | Page background |
| `#ffffff` | Header, cards, inputs |
| `#f1efe9` | Muted fill: chips, segmented track, driver badge |
| `#15140f` | Ink / primary dark, success badge, bottom nav |
| `#171717` | Body text |
| `#3f3c36` | Secondary text, benefit lines |
| `#6b675f` | Muted text |
| `#e7e4de` | Borders, dividers, empty track |
| `#d8d4cb` | Inline-link underline |
| `#cfcac0` | Radio outline |
| `#c3341a` | Error border / icon |
| `#7a2010` | Error text |
| `#fdf2ee` / `#f3c4b4` | Error surface / border |

Spacing: 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28px; page padding `clamp(20px,5vw,48px)` inline, `clamp(32px,6vw,64px)` top; content max-widths 420 / 560 / 860px.

Type: `IBM Plex Sans` throughout. H1 `clamp(26px,3.4vw,34px)` (step 1: `clamp(28px,4vw,40px)`) / 600 / `line-height:1.1–1.15` / `-0.02em`; card title 20/600; field and body 15–16/400–500; helper and meta 13/400; eyebrow and chips 12/500–600 (eyebrow `+0.12em`, uppercase). Control height 44px (`h-11`), OTP cell 56px.

Radius: 6 (logo), 7 (segment), 8 (input), 10 (badge, OTP cell, alert), 12 (type row), 14 (role card), 999 (chips, bars, nav).

Shadows: `0 1px 2px rgba(21,20,15,.08)` active segment; `0 8px 24px -16px rgba(21,20,15,.35)` card hover; `0 0 0 3px rgba(255,90,31,.15)` focus; `0 0 0 3px rgba(195,52,26,.12)` error.

## Assets
None produced. Needed for production:
- Real Lalamove-clone logo mark (placeholder is a `22px` orange rounded square).
- Google / Apple / Facebook brand marks for the social buttons (text-only in the mock).
- No illustration or photography was designed; the layout works without it.
- Fonts: IBM Plex Sans, already in the repo via the design system's `fonts/fonts.css`.

## Files
- `Auth - Sign in & Sign up.dc.html` — the full prototype, all eight screens. Template markup plus a logic class at the bottom of the file.
- `support.js` — prototype runtime. Reference only; do not port.
- `_ds/lalamove-ui-kit-.../` — the design-system bundle the prototype loads: `styles.css`, `_ds_bundle.css` (compiled Tailwind + tokens), `_ds_bundle.js` (the `LalamoveUI` components), `fonts/`. These are built from the repo's own component set — implement against the repo source, not these copies.
- `github.md` — repo/branch association and screen → source-file map.

Open the prototype in a browser; the dark pill nav at the bottom jumps between all eight screens.
