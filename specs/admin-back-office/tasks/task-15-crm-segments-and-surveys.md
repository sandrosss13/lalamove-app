# Task 15: CRM — Segments and surveys

## Status

pending

## Wave

6

## Description

CRUD admin UI for `CrmSegment` (saved audience filters) and `CrmSurvey` (question sets). This is the most speculative section of the spec — scoped intentionally down to simple CRUD over a JSON filter/question list, not a rules engine (see `requirements.md`'s Non-Goals). Segments feed into `task-16-crm-campaigns.md`'s audience selection; surveys stand alone (no public survey-taking UI is built here — see Notes).

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** task-16-crm-campaigns.md (campaigns select a `CrmSegment`).

**Context from dependencies:** task-01 added `CrmSegment` (`name`, `description?`, `criteria: Json`) and `CrmSurvey`/`CrmSurveyResponse` (`title`, `questions: Json` array of `{id, prompt, type, options?}`, `isActive`). task-02 provides the admin guard/audit helpers, shadcn primitives, and the `/admin/crm/*` tab layout (`src/app/admin/(sections)/crm/layout.tsx`, already links to `/admin/crm/segments` and `/admin/crm/surveys`).

## Files to Create

- `src/app/admin/(sections)/crm/segments/page.tsx` — table of segments (name, description, criteria summary, matching-user count preview, created date), "New Segment" button, edit/delete.
- `src/components/admin/crm/segment-form-dialog.tsx` — form: name, description, and a **constrained** criteria builder (not a raw JSON textarea) covering the small set of filters below — this keeps `criteria` predictable enough for `resolveSegmentUserIds` (below) to interpret.
- `src/app/admin/(sections)/crm/surveys/page.tsx` — table of surveys (title, question count, active status), "New Survey" button, edit/delete.
- `src/components/admin/crm/survey-form-dialog.tsx` — form: title, active toggle, a repeatable question list (prompt + type select: `TEXT`/`SINGLE_CHOICE`/`MULTI_CHOICE`, and an options list editor shown for the choice types).
- `src/app/api/admin/crm/segments/route.ts` — `GET` (list) and `POST` (create).
- `src/app/api/admin/crm/segments/[id]/route.ts` — `PATCH`, `DELETE`.
- `src/app/api/admin/crm/segments/[id]/preview/route.ts` — `GET`, returns the count (and optionally a capped sample) of users currently matching the segment's criteria, using `resolveSegmentUserIds` below.
- `src/lib/admin/crm-segments.ts` — `resolveSegmentUserIds(criteria): Promise<string[]>` interpreting the constrained criteria shape (role, minOrders, city, accountType — see below) into a Prisma query against `User`/`Order`. This is what task-16 also calls to resolve a campaign's actual recipient list.
- `src/app/api/admin/crm/surveys/route.ts` — `GET` (list) and `POST` (create).
- `src/app/api/admin/crm/surveys/[id]/route.ts` — `PATCH`, `DELETE`.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. All routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CRM_MANAGER"])`.
2. Define the constrained `criteria` shape as a small discriminated set of optional filters, all AND-ed together — do not build an arbitrary query DSL:
   ```ts
   type SegmentCriteria = {
     role?: "CLIENT" | "DRIVER" | "COMPANY";
     city?: string; // GeorgianCity value, clients don't have a city field today — see Notes
     minOrders?: number; // clients: orders placed; drivers: deliveries fulfilled
     accountType?: string; // ClientAccountType or DriverAccountType value, matched against whichever `role` is set
   };
   ```
3. `resolveSegmentUserIds` implementation sketch: start from `prisma.user.findMany({ where: { role: criteria.role } })` (omit the `role` filter if unset), then apply `minOrders`/`accountType`/`city` as additional `where` clauses joined through the relevant profile relation (`clientProfile`, `driverProfile`) — keep this a single Prisma query with nested `where`, not an in-memory filter over all users, since the whole point is this scales past a handful of rows.
4. `writeAuditLog` on every mutation, `action: "crm_segment.create" | ... | "crm_survey.create" | ...`, `entityType: "CrmSegment"`/`"CrmSurvey"`.

### API Endpoints

- `GET /api/admin/crm/segments`, `POST /api/admin/crm/segments`, `PATCH`/`DELETE /api/admin/crm/segments/[id]`
- `GET /api/admin/crm/segments/[id]/preview`
- `GET /api/admin/crm/surveys`, `POST /api/admin/crm/surveys`, `PATCH`/`DELETE /api/admin/crm/surveys/[id]`

## Acceptance Criteria

- [ ] Staff can create a segment with any combination of the constrained filters and see a live matching-user count in the preview.
- [ ] Staff can create/edit a survey with a repeatable question list of the three supported types.
- [ ] Non-`CRM_MANAGER`/`SUPER_ADMIN` roles get `403`.
- [ ] `pnpm check` passes.

## Notes

- `ClientProfile` has no `city` field today (only `DriverProfile`/`LogisticsCompany` do) — if `city` is set as a segment filter alongside `role: "CLIENT"`, `resolveSegmentUserIds` should just return no matches for that combination rather than erroring; don't add a `city` field to `ClientProfile` in this task (that's outside this spec's single Wave-1 schema task).
- No public survey-taking UI is built here — `CrmSurveyResponse` exists in the schema for future use but nothing writes to it yet. That's expected; this task only covers survey *authoring*.
