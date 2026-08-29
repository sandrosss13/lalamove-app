# Paste this into Claude Code

Copy everything below the line into Claude Code from the repo root.

---

We are implementing a new feature: **business fleet onboarding** — self-serve registration for
logistics companies running multiple vehicles — based on an approved HTML design prototype.
It is the company-account counterpart to the individual driver onboarding flow documented in
`design_handoff_driver_onboarding/`.

**Read these first, in this order:**

1. `design_handoff_business_onboarding/README.md` — the full design spec: screens, fields,
   validation rules, states, and the exact copy. This is the source of truth for behaviour.
2. `design_handoff_business_onboarding/Business Onboarding.dc.html` — the approved visual
   prototype. It is a **design reference only**: standalone HTML with inline styles. Do not
   copy its markup or styling approach. Recreate it in this codebase's real environment
   (Next.js App Router + Tailwind v4 + the `src/components/ui` shadcn components).
3. `design_handoff_business_onboarding/Driver Onboarding.dc.html` and
   `design_handoff_driver_onboarding/README.md` — the individual driver flow. The two share
   the vehicle class taxonomy, body types, colour list, city list and admin review pattern.
   Build shared pieces once, used by both.
4. `AGENTS.md` — the project's working rules, including planning and sub-agent rules.
5. `specs/driver-registration-and-vehicle-assignment/` — the closest existing feature. Mirror
   its spec structure, API conventions and UI conventions.
6. `prisma/schema.prisma` — `LogisticsCompany`, `User`, `DriverProfile`, `Vehicle`,
   `VehicleTypeSpec`, `DriverVehicleAssignment`, `GeorgianCity`, `VehicleCategory`.

**What this feature is.** A logistics company today is created by an internal admin, and its
drivers and vehicles are entered one at a time from the back office. This feature lets a
company register itself, declare its fleet by cargo body type and vehicle class, specify each
vehicle, put a named driver behind every one of them, and submit the whole thing for review.
Operations then verifies the company once and clears or flags each vehicle individually.

**Scope.**

- Five-step business wizard, desktop web: company details → fleet composition → vehicle
  specifications → drivers & assignment → review & submit. Resumable across sessions.
- Fleet composition by count per (body type × vehicle class) combination, which generates the
  vehicle list for the next step.
- Per-vehicle specification editor with make/model selection that prefills payload and cargo
  dimensions from the model's published figures, adjusted for the body type.
- Driver assignment per vehicle with three paths: pick from the company roster, create the
  account now (temp password shown once), or send an invitation the driver completes.
- Licence category gating: a driver cannot be assigned to a vehicle class their categories do
  not cover, and a driver cannot hold two vehicles at once.
- Application status screen with per-vehicle verdicts: company-level status plus each vehicle
  Approved / Flagged / Pending, and a fix-and-resubmit loop for flagged vehicles only.
- Admin review queue for business applications: verify company details, then approve or flag
  each vehicle with a reason; activation requires the company verified and every vehicle
  decided.

**Before you write any code, produce a plan and ask me about the open questions below.**
Several of these are the same gaps the individual driver handoff raised — resolve them once,
for both flows.

1. **Chassis body type** still has no home in the schema (Dry Box / Refrigerated / Open
   Chassis). For a business it matters more: fleet composition is indexed by (body × class).
   Recommend a model — enum on `Vehicle`, field on `VehicleTypeSpec`, or one
   `VehicleTypeSpec` row per (body × class) pair.
2. **Vehicle class taxonomy.** The prototype has five classes (Small Van, Large Van, Medium
   Truck, Heavy Freight Truck, Trailer Truck) with required categories B / B / C / C / CE.
   Confirm this against `VehicleCategory` and tell me what has to change.
3. **Per-model specifications.** The prototype carries payload and internal dimensions per
   model, adjusted by body type (refrigerated loses ~8% payload and ~25/12/16 cm; open decks
   gain payload and use drop-side height). Decide where this lives: a seeded reference table,
   values on `VehicleTypeSpec`, or free entry validated against class limits. The figures in
   the spec are realistic reference values, not a manufacturer database — they need an ops
   review before being seeded.
4. **Multiple cities of operation.** A business operates in several cities; `GeorgianCity` is
   a single-value enum and the prototype lists 36 cities. Propose the relation (join table on
   the company) and whether the enum needs extending.
5. **Driver creation vs invitation.** Creating an account inline needs a temp-password flow
   (the codebase has one for admin-created drivers — confirm it can be reused by a company
   admin). Invitations need a token, an expiry, and a driver-side completion flow — and
   `requirements.md` says there is no email/SMS infrastructure. Tell me whether invitations
   are in scope for v1 or whether we ship create-only.
6. **Application state at fleet granularity.** Company-level status plus a per-vehicle verdict
   with a rejection reason. Propose the models (e.g. `BusinessApplication` +
   `BusinessApplicationVehicle`) and exactly what gates dispatch — the design assumes an
   approved company with at least one approved vehicle can start dispatching.
7. **Who owns the driver account.** A driver created by a company: does the company admin
   retain edit rights, can the driver be moved between vehicles, and what happens to their
   account if the company is deactivated?
8. **Individual vs business at signup.** How does a user land in this flow rather than the
   individual driver flow — an account-type choice at sign-up, separate routes, or an
   entitlement on the user?
9. **Fleet scale.** The prototype caps a combination at 40 vehicles. Confirm the realistic
   upper bound; above roughly 30 vehicles a per-row wizard needs bulk import, which is out of
   scope here but affects how the vehicle step is built.

**Constraints.**

- Follow the existing UI/API conventions exactly: `useState`-per-field client components,
  JSON `fetch` with `{error}` parsed and shown inline (never `alert()`), `router.refresh()`
  after a successful mutation, and the established Tailwind idioms.
- Use the `src/components/ui` primitives. Do not introduce a new component library, and do
  not hand-roll inputs, selects, dialogs or tables that already exist there.
- All validation in the spec must be enforced server-side as well as client-side; the server
  is authoritative. Category gating and the one-driver-one-vehicle rule especially.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` must pass.
- Write the feature up as a new spec folder under `specs/` in the same format as
  `specs/driver-registration-and-vehicle-assignment/` — `README.md` with a dependency graph
  and waves, `requirements.md`, and numbered task files — before implementing. Use sub-agents
  to implement waves in parallel, per `AGENTS.md`.

Start by reading the files listed above, then come back with your plan and your answers to the
nine questions.
