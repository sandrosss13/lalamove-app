# Task 09: Content management — Messaging templates (content only)

## Status

complete

## Wave

4

## Description

CRUD admin UI for `MessagingTemplate` content — the subject/body text for transactional Email and SMS messages (order confirmed, driver assigned, delivered, cancelled, etc.), per locale. This task manages *content only*: no message is actually sent by anything built here. Wave 5's `task-14-messaging-send-integration.md` is what wires real sending using the content this task lets staff author, once an email/SMS provider is chosen (see `action-required.md`).

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-02-admin-auth-and-shell.md
**Blocks:** task-14-messaging-send-integration.md (Wave 5), task-16-crm-campaigns.md (Wave 6, campaigns reference a `MessagingTemplate`).

**Context from dependencies:** task-01 added `MessagingTemplate` (`key`, `channel: MessagingChannel` (`EMAIL`/`SMS`), `locale: ContentLocale`, `subject?`, `body`, `isActive`, unique on `[key, channel, locale]`). task-02 provides the admin guard/audit helpers, shadcn primitives, and the `/admin/content/*` tab layout (already links to `/admin/content/messaging-templates`).

## Files to Create

- `src/app/admin/(sections)/content/messaging-templates/page.tsx` — table of templates (key, channel, locale, active status, updated date), filterable by channel, "New Template" button, per-row edit/delete.
- `src/components/admin/content/messaging-template-form-dialog.tsx` — form: key (free-text, but show the known event keys listed below as suggestions — same convention as `Banner.placement` in task-06), channel select (`EMAIL`/`SMS`), locale select, subject (shown only when channel is `EMAIL`), body textarea with a note listing supported variable placeholders (see below), active toggle.
- `src/app/api/admin/content/messaging-templates/route.ts` — `GET` (list, filterable by `?channel=`) and `POST` (create).
- `src/app/api/admin/content/messaging-templates/[id]/route.ts` — `PATCH` and `DELETE`.

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. Admin routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CONTENT_MANAGER"])`.
2. Standard Prisma CRUD against `prisma.messagingTemplate`. Enforce the `EMAIL`-requires-`subject` convention in the form (client-side validation is enough; the schema itself leaves `subject` nullable since `SMS` rows never set it).
3. Establish and document (in the form's helper text, and in a short comment atop `messaging-template-form-dialog.tsx`) the known template keys task-14 will look up by convention: `order.confirmed`, `order.driver_assigned`, `order.in_transit`, `order.delivered`, `order.cancelled`. Staff can still create other keys freely (the field is free text, not an enum, per task-01's schema comment), but seeding these five as suggested/default rows (inactive, empty body, for staff to fill in) is a reasonable nice-to-have — not required for acceptance.
4. Document supported variable placeholders as plain text staff type into `body`/`subject` (e.g. `{{orderId}}`, `{{clientName}}`, `{{pickupAddress}}`) — this task does not implement variable *substitution*, that's task-14's job when it actually renders and sends a message. Just show the convention in the UI so content authored now will work once sending exists.
5. `writeAuditLog` on create/update/delete, `action: "messaging_template.create" | "messaging_template.update" | "messaging_template.delete"`, `entityType: "MessagingTemplate"`.

### API Endpoints

- `GET /api/admin/content/messaging-templates?channel=<optional>`
- `POST /api/admin/content/messaging-templates`
- `PATCH /api/admin/content/messaging-templates/[id]`
- `DELETE /api/admin/content/messaging-templates/[id]`

## Acceptance Criteria

- [ ] Staff can create/edit/delete a messaging template, with `subject` only shown/required for `EMAIL`.
- [ ] Filtering by channel works.
- [ ] Non-`CONTENT_MANAGER`/`SUPER_ADMIN` roles get `403` from the admin routes.
- [ ] `pnpm check` passes.

## Notes

- No message is sent by this task under any circumstance — it is pure content CRUD. Confirm this stays true in review; sending belongs entirely to task-14.
