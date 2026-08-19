# Task 14: Messaging send integration

## Status

pending

## Wave

5

## Description

Wires real Email/SMS sending, triggered by order-lifecycle events (order confirmed, driver assigned, in transit, delivered, cancelled), using the `MessagingTemplate` content task-09 lets staff author. **This task is blocked on provider decisions the user has not yet made** (see `action-required.md` — Resend for email and Twilio for SMS were suggested defaults, not confirmed). Do not guess providers and build against them silently.

**⚠ Blocked:** Before starting this task, confirm the email and SMS providers with the user (or check `action-required.md` for an update). If still unresolved, stop here and report back. Account creation/API keys for whichever providers are chosen are human actions this task cannot do (see `action-required.md`'s "During Implementation").

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-09-content-messaging-templates.md
**Blocks:** task-16-crm-campaigns.md (Wave 6, campaign "send" ultimately calls this task's sender).

**Context from dependencies:** task-01 added `MessagingTemplate` (`key`, `channel`, `locale`, `subject?`, `body`, `isActive`). task-09 built the admin CRUD for template content and established the convention of five known trigger keys (`order.confirmed`, `order.driver_assigned`, `order.in_transit`, `order.delivered`, `order.cancelled`) and a `{{variable}}` placeholder convention in template bodies — this task is what actually looks those keys up, substitutes variables, and sends.

## Files to Create (once providers are confirmed)

- `src/lib/messaging/sender.ts` — provider-agnostic `sendEmail({ to, subject, body })` / `sendSms({ to, body })`, isolating the concrete provider SDK calls to their own files below.
- `src/lib/messaging/email-provider.ts` — concrete implementation for the chosen email provider.
- `src/lib/messaging/sms-provider.ts` — concrete implementation for the chosen SMS provider.
- `src/lib/messaging/render-template.ts` — `renderTemplate(key, channel, locale, variables: Record<string, string>): Promise<{ subject?: string; body: string } | null>` — looks up the active `MessagingTemplate` row by `[key, channel, locale]`, substitutes `{{variable}}` placeholders from the `variables` map, returns `null` if no matching active template exists (callers must treat that as "skip sending," not an error — content may simply not be authored yet for a given key/locale).
- `src/lib/messaging/notify-order-event.ts` — `notifyOrderEvent(order, event: "confirmed" | "driver_assigned" | "in_transit" | "delivered" | "cancelled")` — resolves the recipient (client's email/phone from `User`/`ClientProfile`, or driver's, depending on event), the recipient's locale (default `EN` if unknown — no per-user locale preference exists in the schema; note this as a limitation, don't invent a new field for it in this task), calls `renderTemplate`, then `sendEmail`/`sendSms` as appropriate for each active template found for that key (both channels can fire if templates exist for both).

## Files to Modify

- Wherever `Order.status` transitions happen today (the delivery-lifecycle API routes — confirm exact files first, likely under `src/app/api/orders/[id]/` and `src/app/api/logistics-company/orders/`) — call `notifyOrderEvent(...)` at each relevant transition. Keep this a best-effort side effect: a messaging failure must never fail or roll back the underlying order-status update (wrap the call so a thrown error is caught and logged, not propagated).
- `env.example` — document the new provider API keys, following the existing documented style.

## Technical Details

### Implementation Steps

1. Confirm both providers (see "Status: blocked") before writing provider-specific code.
2. Implement `render-template.ts`'s variable substitution as a simple `body.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] ?? "")` — no templating engine needed for this scope.
3. `notify-order-event.ts` must not throw on missing template content (see `render-template.ts`'s `null` contract above) — a not-yet-authored template for a given key/channel/locale is a normal, expected state (especially right after this spec first ships, before `action-required.md`'s "populate initial content" step happens), not a bug.
4. Wrap every call site added in step "Files to Modify" in a try/catch that logs (`console.error` is fine, matching this project's existing error-handling style — check a similar existing route for the exact convention) and continues; never let a messaging failure block or fail the order-lifecycle response.

### Environment Variables

- Email provider API key (e.g. `RESEND_API_KEY`) and SMS provider credentials (e.g. `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) — exact names depend on the chosen providers. Document in `env.example` once known.

## Acceptance Criteria

- [ ] Providers have been confirmed and are documented in `requirements.md`'s Assumptions (update it once known).
- [ ] Each of the five order-lifecycle transitions calls `notifyOrderEvent` at the correct point.
- [ ] A missing/inactive template for a given key/channel/locale is silently skipped, not an error.
- [ ] A messaging-provider failure (simulate by pointing at an invalid API key) does not fail the underlying order-status update.
- [ ] `pnpm check` passes.

## Notes

- No per-user locale preference exists anywhere in the schema (`User`, `ClientProfile`, `DriverProfile` have no `locale` field) — this task defaults every recipient to `EN`. Adding a real per-user locale preference is a reasonable follow-up but is out of scope here (it would mean schema changes, which this spec deliberately confines to task-01's single Wave-1 migration).
