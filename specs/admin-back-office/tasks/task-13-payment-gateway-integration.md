# Task 13: Payment gateway integration

## Status

pending

## Wave

5

## Description

Wires a real payment gateway into the order flow so a `CARD` payment can actually be collected, using the `Payment` table task-01 created and gated by the `PaymentMethodConfig` toggles task-11 built. **This task is blocked on a provider decision the user has not yet made** (see `action-required.md` — Polar, matching the repo's existing `polar-payments-expert` subagent, was suggested but not confirmed; Stripe was offered as an alternative). Do not guess a provider and build against it silently.

**⚠ Blocked:** Before starting this task, confirm the payment provider with the user (or check `action-required.md` / the spec's tracking for an update). If still unresolved, stop here and report back rather than picking a provider unilaterally — the account/API-key setup in `action-required.md`'s "During Implementation" section also has to happen for whichever provider is chosen, which is itself a human action this task cannot do.

## Dependencies

**Depends on:** task-01-schema-and-migration.md, task-11-finance-payment-methods-config.md
**Blocks:** None.

**Context from dependencies:** task-01 added `Payment` (`orderId` unique FK to `Order`, `provider: String`, `providerPaymentId?`, `amount`, `status: PaymentStatus` (`PENDING`/`PAID`/`FAILED`/`REFUNDED`), `paidAt?`). task-11 built the `/admin/finance/payment-methods` toggle UI over `PaymentMethodConfig` — this task's checkout-side code must check `PaymentMethodConfig.isEnabled` for `CARD` before offering a card payment option at all.

## Files to Create (once provider is confirmed)

- `src/lib/payments/provider.ts` — a small provider-agnostic interface (`createCheckout(order): Promise<{ checkoutUrl: string; providerPaymentId: string }>`, `verifyWebhookSignature(...)`) so the concrete SDK call sites are isolated to one file.
- `src/lib/payments/<provider>.ts` — the concrete implementation of `provider.ts`'s interface for whichever provider is chosen (e.g. `polar.ts` or `stripe.ts`). If Polar is chosen, consult the repo's `polar-payments-expert` subagent for current best practices before writing checkout/webhook code — do not hand-roll Polar integration from memory.
- `src/app/api/payments/webhook/route.ts` — receives and verifies the provider's payment webhook, updates the matching `Payment.status`/`paidAt`.
- `src/app/api/orders/[id]/checkout/route.ts` — `POST`, creates a `Payment` row (`status: PENDING`) and returns the provider's checkout URL/session for the client to redirect to.

## Files to Modify

- The order booking flow (`src/app/orders/`, `POST /api/orders/route.ts` — confirm exact files by reading the existing order-creation code first) — after an order is created, if `CARD` is the selected method and enabled, redirect to the new checkout route instead of completing immediately.
- `env.example` — document the new provider API key/webhook-secret env vars, following the existing documented style (see `LOCATIONIQ_API_KEY`'s comment for the format to match).

## Technical Details

### Implementation Steps

1. Confirm the provider (see "Status: blocked" above) before writing any provider-specific code.
2. Design `src/lib/payments/provider.ts`'s interface narrowly around what this app actually needs: create a checkout for an `Order.price` amount, and receive a webhook confirming payment succeeded/failed. Do not build support for subscriptions, refund flows beyond marking `REFUNDED`, or multi-currency — none of that applies here (all orders are one-off, single-currency).
3. Webhook route must verify the provider's signature before trusting the payload (every major provider's SDK has a helper for this) — do not update `Payment.status` from an unverified request.
4. On webhook success, set `Payment.status = "PAID"`, `paidAt = now()`, `providerPaymentId`; leave `Order.status` untouched by this task (payment status and delivery status are separate concerns already modeled separately — `Order.status` continues to be driven by the existing delivery-lifecycle code, not by payment).

### Environment Variables

- Provider API key(s) and webhook signing secret — exact names depend on the chosen provider (e.g. `POLAR_ACCESS_TOKEN`/`POLAR_WEBHOOK_SECRET` or `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`). Document in `env.example` once known.

### API Endpoints

- `POST /api/orders/[id]/checkout` — creates a `Payment` (`PENDING`) and returns a checkout URL.
- `POST /api/payments/webhook` — provider webhook receiver.

## Acceptance Criteria

- [ ] A provider has been confirmed and is documented in `requirements.md`'s Assumptions (update it once known — this task file should not be the only place the decision is recorded).
- [ ] Selecting `CARD` at checkout (when enabled via task-11's toggle) creates a `Payment` row and redirects to the provider's checkout.
- [ ] A successful webhook marks the `Payment` `PAID` with `paidAt` set; an unverifiable webhook is rejected, not applied.
- [ ] `CARD` is not offered as an option anywhere in the booking flow while `PaymentMethodConfig` has it disabled.
- [ ] `pnpm check` passes.

## Notes

- This is explicitly the highest-risk task in the spec (real money, external webhook trust boundary) — if picked up by a coder agent, it should get an extra security-focused review pass (e.g. via the project's `security-scanner` agent) before being considered done, beyond the standard review gate.
