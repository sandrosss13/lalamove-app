# Action Required: Driver & Vehicle Onboarding

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Sanity-check the (vehicle class × chassis type) → `VehicleTypeSpec` mapping in `task-04-vehicle-classes-constant.md`.** It asserts real-world vehicle-body facts (e.g. "a Small Van has no refrigerated or open-chassis variant in this fleet's catalogue, so those combinations are locked in the UI"; "Heavy Freight Truck has no refrigerated or open-chassis spec above 7t, so those are locked pending a future catalogue addition"). Confirm these are acceptable before wave 4 builds the UI against them, or adjust the mapping first.

## During Implementation

- [ ] **Create the private Supabase Storage bucket `driver-documents`** (Storage → New bucket, **not** public) before `task-03-driver-document-storage.md` is exercised end-to-end. Mirrors the existing manual step for the `vehicle-photos` bucket.
- [ ] **Add the bucket note to `env.example`**, alongside the existing `vehicle-photos` note, if the storage task doesn't already do so as part of its own file changes.
- [ ] **Run `pnpm prisma migrate dev --name add_driver_onboarding` (or the equivalent name chosen in `task-01`) against a reachable dev database.** Requires `DATABASE_URL` — already required for local dev, no new env var.
- [ ] **Verify the `GeorgianCity` enum reconciliation in `task-01`/`task-02` before the migration is generated**: the design's city list transliterates one existing city differently ("Tsqaltubo" vs. the existing enum value `TSKALTUBO`) — confirm the migration adds 38 new cities, not 39, and that no existing driver/company data ends up split across two spellings of the same city.

## After Implementation

- [ ] **Run `pnpm prisma migrate deploy` against the production database** as part of the deploy that ships this feature — the dev-only `migrate dev` in `task-01` does not touch production.
- [ ] **Manually click through the full loop end to end** (see `requirements.md`'s acceptance criteria) once, since no automated test suite exists in this repo: submit an application → as an admin, flag one document with a reason → confirm the driver sees "action required" with that reason → replace the flagged document and resubmit → as an admin, approve all three documents and approve the driver → confirm the driver's account is activated and they can go online.
- [ ] **Confirm `USER_MANAGER` is the right admin role for reviewing applications** (`task-15`) — if the business wants a narrower role, that's a follow-up, not part of this feature.

---

> These tasks are also referenced in context within the relevant task files.
