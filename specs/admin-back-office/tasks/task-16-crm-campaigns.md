# Task 16: CRM — Campaigns

## Status

pending

## Wave

6

## Description

CRUD + send admin UI for `CrmCampaign` — pairing a `CrmSegment` (audience) with a `MessagingTemplate` (content) and a schedule. This is also where the user's undetailed "Marketing" bullet lands (see `requirements.md`'s Assumptions): a campaign *is* the marketing send. The last task in the spec, both by wave number and by how much it depends on: it reads segments (task-15), templates (task-09), and the actual send capability (task-14, Wave 5).

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-09-content-messaging-templates.md, task-14-messaging-send-integration.md, task-15-crm-segments-and-surveys.md
**Blocks:** None.

**Context from dependencies:** task-01 added `CrmCampaign` (`name`, `segmentId?` → `CrmSegment`, `templateId?` → `MessagingTemplate`, `status: CrmCampaignStatus` (`DRAFT`/`SCHEDULED`/`SENT`/`CANCELLED`), `scheduledAt?`, `sentAt?`). task-15 provides `resolveSegmentUserIds(criteria)` (`@/lib/admin/crm-segments`) for turning a segment into an actual recipient list. task-09 is where the `MessagingTemplate` content this task sends comes from. task-14 provides `sendEmail`/`sendSms` (`@/lib/messaging/sender`) — **this task cannot actually send anything until task-14 is unblocked and complete** (see task-14's own blocked status); build the CRUD/scheduling UI regardless, but the "Send now" action's actual dispatch depends on task-14 existing.

## Files to Create

- `src/app/admin/(sections)/crm/campaigns/page.tsx` — table of campaigns (name, segment, template, status, scheduled/sent date), "New Campaign" button, per-row edit/cancel/"Send now".
- `src/components/admin/crm/campaign-form-dialog.tsx` — form: name, segment select, template select (filtered to `isActive` templates), scheduled date/time (optional — leaving it blank keeps the campaign a manually-triggered `DRAFT`).
- `src/app/api/admin/crm/campaigns/route.ts` — `GET` (list) and `POST` (create, `status: "DRAFT"` or `"SCHEDULED"` depending on whether `scheduledAt` was set).
- `src/app/api/admin/crm/campaigns/[id]/route.ts` — `PATCH` (edit while `DRAFT`/`SCHEDULED`) and `DELETE` (only while `DRAFT`).
- `src/app/api/admin/crm/campaigns/[id]/send/route.ts` — `POST`, triggers an immediate send: resolves recipients via `resolveSegmentUserIds`, looks up the campaign's `MessagingTemplate` per recipient's channel/locale (reuse `renderTemplate` from `@/lib/messaging/render-template`, task-14), calls `sendEmail`/`sendSms` per recipient, sets `status: "SENT"`, `sentAt: now()`.
- `src/app/api/admin/crm/campaigns/[id]/cancel/route.ts` — `POST`, sets `status: "CANCELLED"` (only valid from `DRAFT`/`SCHEDULED`).

## Files to Modify

None.

## Technical Details

### Implementation Steps

1. All routes require `requireSystemUser()` + `hasAdminRole(profile, ["SUPER_ADMIN", "CRM_MANAGER"])`.
2. Send flow: `resolveSegmentUserIds(segment.criteria)` → for each user, look up their email/phone (via `User`/`ClientProfile`/`DriverProfile`, same lookup pattern as task-14's `notify-order-event.ts`) → `renderTemplate(campaign.template.key, campaign.template.channel, recipientLocale, variables: { name: user.name })` → `sendEmail`/`sendSms`. Treat an individual recipient's send failure as non-fatal (log and continue to the next recipient) so one bad email address doesn't abort the whole campaign — track a simple success/failure count and return it in the `POST .../send` response.
3. Since this task depends on task-14 for actual sending, and task-14 is itself blocked on a provider decision: if task-14 has not landed yet when this task is picked up, still build everything except the final `sendEmail`/`sendSms` calls — stub the send route to return a clear `501`-style "messaging send integration not yet available" response, and note this explicitly in your final report rather than silently leaving a broken import.
4. Scheduled (non-immediate) sends: this task does not need to build a background job scheduler — `scheduledAt` is stored and shown in the UI, but actually triggering a send at that future time (e.g. via a cron endpoint) is out of scope. Only the "Send now" manual action needs to work end-to-end. Note this limitation in the UI copy near the scheduled-date field.
5. `writeAuditLog` on create/update/delete/send/cancel, `action: "crm_campaign.create" | ... | "crm_campaign.send" | "crm_campaign.cancel"`, `entityType: "CrmCampaign"`, and include the recipient success/failure counts in `metadata` for a send.

### API Endpoints

- `GET /api/admin/crm/campaigns`, `POST /api/admin/crm/campaigns`, `PATCH`/`DELETE /api/admin/crm/campaigns/[id]`
- `POST /api/admin/crm/campaigns/[id]/send`
- `POST /api/admin/crm/campaigns/[id]/cancel`

## Acceptance Criteria

- [ ] Staff can create/edit/delete a campaign linking a segment and a template.
- [ ] "Send now" (once task-14 is available) resolves the segment's current members, sends via the linked template, marks the campaign `SENT`, and reports a success/failure count.
- [ ] If task-14 is not yet available, "Send now" fails clearly (not with an unhandled error) and says why.
- [ ] Cancel is only allowed from `DRAFT`/`SCHEDULED`; delete is only allowed from `DRAFT`.
- [ ] Non-`CRM_MANAGER`/`SUPER_ADMIN` roles get `403`.
- [ ] `pnpm check` passes.

## Notes

- No automatic scheduled dispatch (a cron/queue that fires at `scheduledAt`) is built here — see step 4. If the user wants that, it's a reasonable follow-up once the core CRUD + manual send is proven out.
