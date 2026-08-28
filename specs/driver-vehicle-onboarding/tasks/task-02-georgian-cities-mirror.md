# Task 02: Georgian Cities Browser Mirror — Extend to 63 Cities + Region

## Status

complete

## Wave

1

## Description

`src/lib/georgian-cities.ts` is a hand-maintained, deliberately duplicated mirror of the `GeorgianCity` Prisma enum — duplicated (rather than imported from `@prisma/client`) specifically to keep the server-only Prisma client out of the browser bundle. `task-01` extends the underlying enum from 25 to 63 cities; this task extends the mirror to match, and adds a `region` field each city option didn't have before, needed by the onboarding wizard's city dropdown (`task-09`) to render "Batumi · Adjara" style rows. This task does not touch `prisma/schema.prisma` and has no dependency on `task-01` completing first — the city list and its enum-value spellings are fully specified below, independently of that task's own copy of the same list.

## Dependencies

**Depends on:** None (Wave 1)
**Blocks:** task-09-onboarding-step1-auth-personal.md

**Context from dependencies:** None — this task's data is self-contained below. (`task-01`, run in parallel, adds the same 63 `GeorgianCity` enum values to the database — the two lists must agree, which is why the exact same 63 names/spellings are reproduced in full here rather than referenced.)

## Files to Modify

- `src/lib/georgian-cities.ts` — extend `GEORGIAN_CITY_OPTIONS` from 25 to 63 entries, add a `region` field to every entry.

## Technical Details

### Full replacement content for `src/lib/georgian-cities.ts`

The existing 25 entries keep their exact `value`/`label`, gaining only a `region`. The 38 new entries are appended in the same order `task-01` adds them to the enum (append-only, matching that task's ordering exactly, so the two files can be diffed against each other if needed). The design's "Tsqaltubo" is represented as the existing `TSKALTUBO`/`"Tskaltubo"` entry — no new `TSQALTUBO` value.

```ts
/**
 * Selectable driver cities. Values mirror the `GeorgianCity` Prisma enum; they
 * are duplicated here (rather than imported from `@prisma/client`) to keep the
 * server-only Prisma client out of the browser bundle. `region` is used by the
 * onboarding wizard's searchable city dropdown ("Batumi · Adjara") — existing
 * callers that only read `value`/`label` (the sign-up form, the company
 * dashboard's add-driver drawer) are unaffected by its addition.
 */
export const GEORGIAN_CITY_OPTIONS = [
  { value: "TBILISI", label: "Tbilisi", region: "Tbilisi" },
  { value: "BATUMI", label: "Batumi", region: "Adjara" },
  { value: "KUTAISI", label: "Kutaisi", region: "Imereti" },
  { value: "RUSTAVI", label: "Rustavi", region: "Kvemo Kartli" },
  { value: "ZUGDIDI", label: "Zugdidi", region: "Samegrelo" },
  { value: "GORI", label: "Gori", region: "Shida Kartli" },
  { value: "POTI", label: "Poti", region: "Samegrelo" },
  { value: "SAMTREDIA", label: "Samtredia", region: "Imereti" },
  { value: "KHASHURI", label: "Khashuri", region: "Shida Kartli" },
  { value: "SENAKI", label: "Senaki", region: "Samegrelo" },
  { value: "ZESTAPONI", label: "Zestaponi", region: "Imereti" },
  { value: "MARNEULI", label: "Marneuli", region: "Kvemo Kartli" },
  { value: "TELAVI", label: "Telavi", region: "Kakheti" },
  { value: "AKHALTSIKHE", label: "Akhaltsikhe", region: "Samtskhe-Javakheti" },
  { value: "OZURGETI", label: "Ozurgeti", region: "Guria" },
  { value: "KOBULETI", label: "Kobuleti", region: "Adjara" },
  { value: "CHIATURA", label: "Chiatura", region: "Imereti" },
  { value: "TSKALTUBO", label: "Tskaltubo", region: "Imereti" },
  { value: "SAGAREJO", label: "Sagarejo", region: "Kakheti" },
  { value: "GARDABANI", label: "Gardabani", region: "Kvemo Kartli" },
  { value: "BOLNISI", label: "Bolnisi", region: "Kvemo Kartli" },
  { value: "AKHALKALAKI", label: "Akhalkalaki", region: "Samtskhe-Javakheti" },
  { value: "BORJOMI", label: "Borjomi", region: "Samtskhe-Javakheti" },
  { value: "KASPI", label: "Kaspi", region: "Shida Kartli" },
  { value: "MTSKHETA", label: "Mtskheta", region: "Mtskheta-Mtianeti" },
  { value: "TKIBULI", label: "Tkibuli", region: "Imereti" },
  { value: "KARELI", label: "Kareli", region: "Shida Kartli" },
  { value: "GURJAANI", label: "Gurjaani", region: "Kakheti" },
  { value: "KVARELI", label: "Kvareli", region: "Kakheti" },
  { value: "LANCHKHUTI", label: "Lanchkhuti", region: "Guria" },
  { value: "SACHKHERE", label: "Sachkhere", region: "Imereti" },
  { value: "TERJOLA", label: "Terjola", region: "Imereti" },
  { value: "KHOBI", label: "Khobi", region: "Samegrelo" },
  { value: "MARTVILI", label: "Martvili", region: "Samegrelo" },
  { value: "TSALENJIKHA", label: "Tsalenjikha", region: "Samegrelo" },
  { value: "ABASHA", label: "Abasha", region: "Samegrelo" },
  { value: "AMBROLAURI", label: "Ambrolauri", region: "Racha-Lechkhumi" },
  { value: "TSAGERI", label: "Tsageri", region: "Racha-Lechkhumi" },
  { value: "ONI", label: "Oni", region: "Racha-Lechkhumi" },
  { value: "MESTIA", label: "Mestia", region: "Svaneti" },
  { value: "SIGHNAGHI", label: "Sighnaghi", region: "Kakheti" },
  { value: "DEDOPLISTSQARO", label: "Dedoplistsqaro", region: "Kakheti" },
  { value: "LAGODEKHI", label: "Lagodekhi", region: "Kakheti" },
  { value: "AKHMETA", label: "Akhmeta", region: "Kakheti" },
  { value: "DUSHETI", label: "Dusheti", region: "Mtskheta-Mtianeti" },
  { value: "TIANETI", label: "Tianeti", region: "Mtskheta-Mtianeti" },
  { value: "TSALKA", label: "Tsalka", region: "Kvemo Kartli" },
  { value: "DMANISI", label: "Dmanisi", region: "Kvemo Kartli" },
  { value: "TETRITSQARO", label: "Tetritsqaro", region: "Kvemo Kartli" },
  { value: "NINOTSMINDA", label: "Ninotsminda", region: "Samtskhe-Javakheti" },
  { value: "ADIGENI", label: "Adigeni", region: "Samtskhe-Javakheti" },
  { value: "ASPINDZA", label: "Aspindza", region: "Samtskhe-Javakheti" },
  { value: "VALE", label: "Vale", region: "Samtskhe-Javakheti" },
  { value: "BAGHDATI", label: "Baghdati", region: "Imereti" },
  { value: "VANI", label: "Vani", region: "Imereti" },
  { value: "KHARAGAULI", label: "Kharagauli", region: "Imereti" },
  { value: "KHONI", label: "Khoni", region: "Imereti" },
  { value: "CHKHOROTSQU", label: "Chkhorotsqu", region: "Samegrelo" },
  { value: "JVARI", label: "Jvari", region: "Samegrelo" },
  { value: "KEDA", label: "Keda", region: "Adjara" },
  { value: "KHELVACHAURI", label: "Khelvachauri", region: "Adjara" },
  { value: "KHULO", label: "Khulo", region: "Adjara" },
  { value: "SHUAKHEVI", label: "Shuakhevi", region: "Adjara" },
] as const;
```

### `src/lib/format-city.ts` — no change needed, but verify

Its doc comment states the assumption it relies on: *"Every `GeorgianCity` value is a single word, so capitalising the first letter is enough."* Every one of the 38 new values above is a single word (no hyphens, spaces, or apostrophes), so `formatCity` continues to work unchanged for all 63 cities. Do not edit this file — just confirm by inspection that the assumption still holds (it does; this is stated so the assumption isn't silently invalidated by a future edit without noticing).

## Acceptance Criteria

- [ ] `GEORGIAN_CITY_OPTIONS` has exactly 63 entries, each with `value`, `label`, and `region`.
- [ ] The first 25 entries are unchanged in `value`/`label`/order from before this task, each gaining only a `region`.
- [ ] There is no `TSQALTUBO` entry — the design's "Tsqaltubo" is represented by the existing `TSKALTUBO` entry (`region: "Imereti"`).
- [ ] `src/components/auth/sign-up-form.tsx` and any other existing consumer of `GEORGIAN_CITY_OPTIONS` still compile and render unchanged (they read `value`/`label` only and ignore the new `region` field).
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Notes

- Do not import `region` into `src/components/auth/sign-up-form.tsx`'s plain `<select>` or the company dashboard's add-driver drawer — the "City · Region" display is specific to the onboarding wizard's searchable dropdown (`task-09`), not a retrofit onto the existing simple selects.
