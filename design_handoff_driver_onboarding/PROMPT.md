# Paste this into Claude Code

Copy everything below the line into Claude Code from the repo root.

---

We are implementing a new feature: **self-serve driver & vehicle onboarding** (Lalamove-style), based on an approved HTML design prototype.

**Read these first, in this order:**

1. `design_handoff_driver_onboarding/README.md` — the full design spec: screens, fields, validation rules, states, and the exact copy. This is the source of truth for behaviour and layout.
2. `design_handoff_driver_onboarding/Driver Onboarding.dc.html` — the approved visual prototype. It is a **design reference only**: standalone HTML with inline styles. Do not copy its markup or its styling approach into the app. Recreate it in this codebase's real environment (Next.js App Router + Tailwind v4 + the `src/components/ui` shadcn components) using existing patterns.
3. `AGENTS.md` — the project's working rules. Follow them, including the planning and sub-agent rules.
4. `specs/driver-registration-and-vehicle-assignment/` — the closest existing feature. Mirror its spec structure, its API conventions, and its UI conventions.
5. `prisma/schema.prisma` — `User`, `DriverProfile`, `Vehicle`, `VehicleTypeSpec`, `DriverVehicleAssignment`, `GeorgianCity`, `DriverAccountType`, `VehicleCategory`, `LoadingAccessType`.

**What this feature is.** Today a driver either self-registers at `/sign-up` or is created by a company admin (`POST /api/logistics-company/drivers/register`). Neither path collects the licence, vehicle specification, or documents needed before a driver can legally be dispatched freight, and nothing reviews them. This feature adds a four-step onboarding wizard for the driver plus an admin review queue that gates account activation.

**Scope.**

- Driver-facing wizard, desktop web, at a route under the driver's authenticated area. Four steps: (1) authorisation & personal, (2) licence verification, (3) vehicle registration, (4) review & submit. Progress must be resumable across sessions.
- An application-status screen after submission with three states: pending verification, action required (per-document rejection with a reason), approved.
- An admin review queue in the back office: list applications, filter by status, open one, approve or flag each uploaded document with a reason, then request changes or approve the driver. Approving activates the account.
- Documents are **upload only** — no camera capture anywhere.

**Before you write any code, produce a plan and ask me about the open questions below.** Do not assume answers.

1. **Chassis body type** has no home in the schema. The design's Dry Box / Refrigerated / Open Chassis choice is a property of the vehicle body, and `VehicleTypeSpec` currently carries `category` + `loadingAccessType`. Options: a new `ChassisType` enum on `Vehicle`; a new field on `VehicleTypeSpec`; or seeding more `VehicleTypeSpec` rows so each (class × body) pair is its own spec. Recommend one and say why.
2. **Cities.** The design lists 63 Georgian cities; `GeorgianCity` has 25. Extend the enum, or restrict the dropdown to the existing 25?
3. **Licence categories (B / C / CE).** No schema representation exists. The design uses them to gate which vehicle classes a driver may select. Propose a model — enum array on `DriverProfile`, or a separate `DriverLicence` model holding number, expiry, categories, and document URLs.
4. **Vehicle payload and cargo dimensions.** The design collects these per vehicle; the schema deliberately derives them from `VehicleTypeSpec` ("a single source of truth per vehicle class"). Decide whether the driver's entered values are stored as overrides on `Vehicle`, used only to pick the matching spec, or dropped.
5. **Application state.** There is no model for a submitted application, its per-document review verdicts, or its status. Propose one (e.g. `DriverApplication` + `DriverApplicationDocument` with status enums and a rejection reason) and how it relates to activation — what exactly gates a driver from going online.
6. **Phone OTP.** The design shows SMS OTP verification. `requirements.md` in the existing spec states there is no email/SMS infrastructure in this codebase. Confirm whether OTP is in scope; if not, I want the phone field kept and the OTP step stubbed or removed.
7. **Document storage.** `Vehicle.photoUrls` uses public Supabase Storage URLs. Confirm identity and licence documents go to a **private** bucket with signed URLs instead, and propose the access rule for admin reviewers.
8. **Who can onboard.** Does this wizard serve independent drivers only, or also company-created drivers completing their own profile after the admin creates the account?

**Constraints.**

- Follow the existing UI/API conventions exactly: `useState`-per-field client components, JSON `fetch` with `{error}` parsed and shown inline (never `alert()`), `router.refresh()` after a successful mutation, and the established Tailwind idioms.
- Use the `src/components/ui` primitives. Do not introduce a new component library, and do not hand-roll inputs, selects, or dialogs that already exist there.
- All validation in the spec must be enforced server-side as well as in the client, and the server is authoritative.
- `pnpm lint`, `pnpm typecheck` and `pnpm build` must pass.
- Write the feature up as a new spec folder under `specs/` in the same format as `specs/driver-registration-and-vehicle-assignment/` — `README.md` with a dependency graph and waves, `requirements.md`, and numbered task files — before implementing. Use sub-agents to implement waves in parallel, per `AGENTS.md`.

Start by reading the files listed above, then come back with your plan and your answers to the eight questions.
