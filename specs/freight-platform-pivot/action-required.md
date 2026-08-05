# Action Required: Freight & Cargo Logistics Platform Pivot

Manual steps that must be completed by a human. These cannot be automated.

## Before Implementation

- [ ] **Acknowledge that dev data will be wiped** — `task-01-schema-and-seed.md` truncates the
      `Order` and `Vehicle` tables in the dev database (their shape is incompatible with the new
      model). This was confirmed during planning, but re-confirm before running if any dev data in
      those tables currently matters to you.

## During Implementation

None — every other step (schema migration, seed data, code changes) is automated by the coder
agents per task.

## After Implementation

- [ ] **Review the seeded pricing numbers** — `task-01-schema-and-seed.md` seeds `PricingRule` rows
      with illustrative placeholder rates (base fare, per-km, per-minute, helper fee, etc.) for each
      vehicle type. These are not real business figures. Once you have actual rates, update the
      seeded rows directly (a data change, not a code change — see the task file for the exact
      table).
- [ ] **Review the cargo-category → vehicle-category eligibility mapping** in
      `task-02-pricing-engine.md` (e.g. full relocations/industrial supplies/construction materials
      are restricted to heavy-duty vehicles only) and adjust if your real business rules differ.

---

> These tasks are also referenced in context within the relevant task files.
