# Action Required: Admin Back-Office

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Choose a payment gateway provider (Polar or Stripe, or other)** — Wave 5's `task-13-payment-gateway-integration.md` cannot be finished without this. The repo already ships a `polar-payments-expert` subagent, which suggests Polar was the original intent, but this was not confirmed by the user ("not decided yet"). Whoever picks up Wave 5 should either get this decision from the user first, or run Wave 1–4 now and revisit Wave 5 once decided.
- [ ] **Choose email + SMS providers for messaging send integration** — Wave 5's `task-14-messaging-send-integration.md` needs concrete providers (e.g. Resend for email, Twilio for SMS were suggested as defaults but not confirmed). Same guidance as above: confirm before starting Wave 5, or build Waves 1–4 first.

## During Implementation

- [ ] **Create provider accounts and obtain API keys** once the payment and messaging providers are chosen (e.g. Polar/Stripe dashboard + API key, Resend API key, Twilio Account SID/Auth Token/from-number). Add them to `.env` and `env.example` following the existing pattern (see `LOCATIONIQ_API_KEY`, `GOOGLE_PLACES_API_KEY` for the documented style).
- [ ] **Run `pnpm exec prisma db push`** after `task-01-schema-and-migration.md` lands, against the Supabase Postgres instance in `DATABASE_URL`, to apply the new tables/enums.
- [ ] **Create the first `SUPER_ADMIN` system user** manually (e.g. via a one-off script or direct DB insert) once `task-02-admin-auth-and-shell.md` is done — there is no self-serve admin sign-up, by design, so the very first admin account has to be seeded by hand.

## After Implementation

- [ ] **Populate initial content** — at least one home page composition, static pages (Terms/Privacy/About), and starter translation entries, since the site currently has none of this as manageable data (it's hardcoded in landing components today).
- [ ] **Decide payment-method rollout** — after Wave 5, confirm in production which `PaymentMethodType`s should actually be enabled (cash-on-delivery is the obvious safe default while gateway integration is new).

---

> These tasks are also referenced in context within the relevant task files.
