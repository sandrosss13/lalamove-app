"use client";

/**
 * Step 4 — drivers & assignment: the numbered vehicle/driver table, the 640px
 * two-tab assignment dialog, and the shown-once temporary-password dialog.
 *
 * ─── Why all three live in one file ─────────────────────────────────────────
 *
 * `task-13` names `driver-assignment-dialog.tsx` and `temp-password-dialog.tsx`
 * as separate files. This wave's scope assignment gives this task exactly one
 * file to own — five other agents are editing siblings in the same worktree —
 * so the two dialogs are colocated here instead. Nothing else about them
 * changes: the props each one takes are the ones the task specifies, and either
 * lifts out into its own module unchanged if the split is wanted later.
 *
 * ─── Where the assignment actually lives ────────────────────────────────────
 *
 * `Vehicle` rows do not exist during the wizard (`plateNumber` is globally
 * `@unique`, and an abandoned draft must never claim a real plate), so a
 * `DriverVehicleAssignment` row has nothing to point at yet. The pairing is
 * therefore recorded as `draft.vehicles[i].driverProfileId` and nowhere else —
 * there is no `assignments` draft section — and submit is what creates the real
 * assignment rows.
 *
 * The driver *account* is the exception: `POST /api/logistics-company/drivers/
 * register` creates a real `User` + `DriverProfile` + `DriverLicence`
 * immediately, and returns a temporary password generated server-side by
 * `node:crypto`. That password is rendered exactly once, is never generated in
 * the browser, is never written to the draft, and is unrecoverable once the
 * credentials dialog closes.
 *
 * Client-side eligibility is a convenience, not a control: submit re-checks
 * every rule here against the database, and trusts nothing this file computed.
 *
 * The design's third "Send invitation" tab is deliberately not built — this
 * codebase ships no email or SMS, so a tab that silently sends nothing is worse
 * than a tab that is not there. The `Invited` vehicle status goes with it:
 * Status has exactly two values.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FLEET_SCREENS,
  useFleetDraft,
} from "@/components/fleet-onboarding/fleet-draft-context";
import {
  findVehicleClass,
  type VehicleClassId,
} from "@/lib/driver-onboarding/vehicle-classes";
import type { FleetDraftVehicle } from "@/lib/fleet-onboarding/draft-schema";
import { GEORGIAN_CITY_OPTIONS } from "@/lib/georgian-cities";

const ROSTER_ENDPOINT = "/api/logistics-company/drivers";
const REGISTER_ENDPOINT = "/api/logistics-company/drivers/register";

const ROSTER_ERROR_FALLBACK =
  "We couldn't load your drivers. Check your connection and try again.";
const CREATE_ERROR_FALLBACK =
  "We couldn't create this driver account. Please try again.";

/**
 * The register route's own wording for a taken address, matched verbatim so the
 * message can additionally be mirrored under the email input — that is the one
 * field the company has to change. It arrives as a **400**, not a 409.
 */
const DUPLICATE_EMAIL_ERROR =
  "An account with that email address already exists.";

/** How long an ineligible row stays tinted after it is clicked. */
const FLASH_DURATION_MS = 1400;

/** The design's minimum for a plausible licence number. */
const MIN_LICENCE_NUMBER_LENGTH = 5;

/** Digit-count bounds for a mobile number, after non-digits are stripped. */
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;

/**
 * The design's success green — the `--status-success` token from `globals.css`,
 * which is the "success colour" this comment used to note the file did not have.
 *
 * One ink, one tint, taking different halves of the token. The ink is
 * `status-success` and needs no `dark:` variant: the light green is too close in
 * lightness to `oklch(0.205)` to be read on it, so the token lifts to
 * `oklch(0.72)` at the same hue and chroma on its own.
 *
 * The tint is a `color-mix` against `--card`, a themed token, so the single 12%
 * wash lands as a pale green on the light card and a deep one on the dark card.
 * It mixes `status-success-SOLID`, the half pinned to the design's light value
 * in both themes, because the wash should sit a hair off the card rather than
 * glow off it — see the `-solid` note in `globals.css`.
 *
 * Identical to step 3's "ready" pill, and the same two names back the fleet
 * status screen, the fleet step rail, the driver wizard and the admin review
 * chips. One definition, so they can no longer drift apart.
 */
const ASSIGNED_PILL_CLASS =
  "border-transparent bg-[color-mix(in_oklch,var(--color-status-success-solid)_12%,var(--card))] text-status-success";

/**
 * Design-exact field chrome, shared by every input in the create-account tab.
 *
 * `border-border` is deliberately ABSENT, having been removed rather than left
 * alone. In light it was harmless — `--border` and `--input` are both
 * `oklch(0.922 0 0)`, so it resolved to the same edge the `Input` primitive
 * draws for itself. In dark the two part company: `--border` is white at 10%,
 * `--input` at 15%, and `tailwind-merge` was handing the weaker of the two the
 * win over the primitive's own `border-input`, leaving these fields a third
 * fainter than every other shadcn input in the app for no reason anyone chose.
 * The driver wizard's `step-2-licence.tsx` and `step-3c-technical-details.tsx`
 * carry the same note; the four field classes have to stay in step.
 *
 * `bg-card` stays but only applies in light: `Input` carries `dark:bg-input/30`,
 * and that variant rule survives `tailwind-merge` beside this unprefixed
 * utility and wins in dark. That is the intended shadcn dark-field look — the
 * field sits as a well slightly lifted off the panel. Do not pin `dark:bg-card`
 * to "fix" it; that would put field and panel at the same `oklch(0.205 0 0)`.
 */
const FIELD_CLASS =
  "h-[46px] rounded-[10px] bg-card px-[13px] text-[15px] focus-visible:border-onboarding-accent focus-visible:ring-onboarding-accent/15 md:text-[15px]";

/** Design-exact label chrome. */
const LABEL_CLASS =
  "text-[11.5px] font-semibold tracking-[0.04em] text-muted-foreground uppercase";

/** Short month names, so dates format identically in every browser. */
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The three licence categories, in the order a driver's categories are stored
 * and rendered — so a roster line reads "B, C" regardless of tick order.
 */
const LICENCE_CATEGORIES: DriverLicenceCategory[] = ["B", "C", "CE"];

/**
 * Mirrors the `LicenceCategory` Prisma enum. Declared structurally rather than
 * imported so this client component stays free of `@prisma/client` — the union
 * is identical to what `findVehicleClass().requiredLicenceCategory` returns, so
 * the two are mutually assignable.
 */
type DriverLicenceCategory = "B" | "C" | "CE";

/**
 * One entry of `GET /api/logistics-company/drivers`.
 *
 * The response body is a **bare array**, not `{ drivers: [...] }`, and the
 * licence facts are flat siblings — there is no nested `licence` object and no
 * `assignedVehicle`. "Has no licence on file" is `licenceExpiresAt === null`
 * (equivalently `categories.length === 0`), which happens for an older
 * company-created account predating licence capture.
 */
type RosterEntry = {
  userId: string;
  driverProfileId: string;
  /** "Nino Abashidze" — already joined server-side. There is no `fullName`. */
  name: string;
  email: string;
  phone: string;
  city: string;
  isOnline: boolean;
  categories: DriverLicenceCategory[];
  /** ISO 8601, or null when there is no licence row. */
  licenceExpiresAt: string | null;
  /** The vehicle this driver currently holds, or null. */
  currentAssignment: { vehicleId: string; plateNumber: string } | null;
};

/** The flat 201 body of `POST /api/logistics-company/drivers/register`. */
type RegisterDriverResult = {
  userId: string;
  driverProfileId: string;
  name: string;
  email: string;
  phone: string;
  categories: DriverLicenceCategory[];
  /** 12 characters, server-generated, returned exactly once. */
  tempPassword: string;
  vehicleAssigned: boolean;
};

/** The credentials the temp-password dialog shows, held only in memory. */
type IssuedCredentials = {
  driverName: string;
  email: string;
  tempPassword: string;
};

/** Which other draft vehicle already holds a given driver. */
type DraftHolder = {
  /** 1-based row number of the holding vehicle. */
  index: number;
  plateNumber: string | undefined;
};

/** Whether a roster driver may take this vehicle, and why not if they may not. */
type Eligibility = { eligible: true } | { eligible: false; note: string };

/**
 * Reads an `{ error }` body without letting a non-JSON response (an HTML error
 * page from an unhandled crash, say) throw over the top of the real failure.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return payload?.error ?? fallback;
}

/**
 * Formats an ISO date for display by reading the `YYYY-MM-DD` parts out of the
 * string rather than going through `Date`.
 *
 * Deliberate: `new Date("2027-05-12")` is UTC midnight, so formatting it
 * anywhere west of Greenwich renders the *previous* day — and an off-by-one on
 * a licence expiry reads as a bug. The same call `step-4-review-submit.tsx`
 * makes in the driver flow.
 */
function formatIsoDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }

  const monthName = MONTH_NAMES[Number(month) - 1];
  if (monthName === undefined) return null;

  return `${Number(day)} ${monthName} ${year}`;
}

/**
 * Today as `YYYY-MM-DD` in the company's *own* timezone, for comparison against
 * an `<input type="date">` value (a bare calendar date, not an instant).
 * Deliberately not `toISOString()`, which is UTC: a company in UTC+4 opening
 * the wizard before 04:00 would otherwise be judged against yesterday.
 */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "Nino Abashidze" → "NA": first letters of the first and last words. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return "?";

  const last = words[words.length - 1];
  const second = words.length > 1 && last !== undefined ? last : "";

  return `${first.slice(0, 1)}${second.slice(0, 1)}`.toUpperCase();
}

/**
 * Whether a roster driver may hold this vehicle, reported with the **first**
 * matching note in the order below. Every one of these is re-checked
 * server-side at submit against the database; this exists so an ineligible
 * choice is visibly impossible rather than merely rejected later.
 *
 * The last condition is the one the server can never see: during the wizard
 * nothing is persisted, so a double assignment happens entirely inside the
 * draft and `currentAssignment` cannot know about it. `takenInDraft` excludes
 * the vehicle being edited, so the driver already on this row is never marked
 * ineligible against their own assignment.
 *
 * "Licence expired" is an addition to the design's two notes: submit rejects an
 * expired licence outright, and finding that out on the submit button — after
 * every other vehicle is assigned — is a worse failure than seeing it here.
 */
function evaluateEligibility(
  driver: RosterEntry,
  required: DriverLicenceCategory,
  takenInDraft: Map<string, DraftHolder>,
): Eligibility {
  if (driver.licenceExpiresAt === null) {
    return { eligible: false, note: "No licence on file" };
  }

  if (!driver.categories.includes(required)) {
    return { eligible: false, note: `No category ${required}` };
  }

  const expiresAt = new Date(driver.licenceExpiresAt);
  if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    const formatted = formatIsoDate(driver.licenceExpiresAt);
    return {
      eligible: false,
      note:
        formatted === null ? "Licence expired" : `Licence expired ${formatted}`,
    };
  }

  if (driver.currentAssignment !== null) {
    return {
      eligible: false,
      note: `on ${driver.currentAssignment.plateNumber}`,
    };
  }

  const holder = takenInDraft.get(driver.driverProfileId);
  if (holder !== undefined) {
    return {
      eligible: false,
      note:
        holder.plateNumber !== undefined && holder.plateNumber !== ""
          ? `on ${holder.plateNumber}`
          : `on vehicle ${holder.index}`,
    };
  }

  return { eligible: true };
}

/**
 * Step 4 — the vehicle/driver table and its dialogs.
 *
 * Takes no props: every byte of wizard state comes from `useFleetDraft()`. The
 * roster is the one thing this step fetches for itself, because no other screen
 * needs it and the draft deliberately stores only the `driverProfileId` — name,
 * phone and categories are read from the roster rather than copied into the
 * draft where they would immediately go stale.
 */
export function Step4DriversAssignment() {
  const { draft, updateDraft, goToStep, showToast } = useFleetDraft();

  const [drivers, setDrivers] = useState<RosterEntry[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);
  // Whether the roster has ever been read successfully. Gates the stale-key
  // cleanup below: before the first successful read there is nothing to resolve
  // against, and dropping every `driverProfileId` on an empty list would wipe
  // the company's assignments the moment the step mounted.
  const [rosterLoaded, setRosterLoaded] = useState(false);

  // Which row's dialog is open, as a 0-based index into `vehicles`, or null.
  // One piece of state rather than a boolean per row: the dialog is modal.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // The once-only credentials, held here rather than in the assignment dialog
  // because that dialog closes the moment the account is created.
  const [credentials, setCredentials] = useState<IssuedCredentials | null>(
    null,
  );
  // Messages stay hidden until the first failed Continue.
  const [showErrors, setShowErrors] = useState(false);

  // Monotonic id of the newest roster read. A `GET` that resolves after a newer
  // one — or after a driver has been folded in from a `POST` — must not write
  // its older answer over the newer one, which would make a just-created driver
  // vanish from the list they were about to be assigned from.
  const rosterSequence = useRef(0);

  const loadRoster = useCallback(async (): Promise<void> => {
    const sequence = rosterSequence.current + 1;
    rosterSequence.current = sequence;
    setRosterLoading(true);
    setRosterError(null);

    try {
      const response = await fetch(ROSTER_ENDPOINT);

      // A stale response has nothing useful to say about the current roster.
      if (sequence !== rosterSequence.current) return;

      if (!response.ok) {
        setRosterError(await readErrorMessage(response, ROSTER_ERROR_FALLBACK));
        return;
      }

      // A bare array, not `{ drivers: [...] }`, and `[]` for a company with no
      // `LogisticsCompany` row yet — a 200, never a 404.
      const body = (await response.json()) as RosterEntry[];

      // Re-checked after the body is read: parsing is another await, and the
      // request that supersedes this one may only start during it.
      if (sequence !== rosterSequence.current) return;

      setDrivers(body);
      setRosterLoaded(true);
    } catch {
      if (sequence !== rosterSequence.current) return;
      setRosterError(ROSTER_ERROR_FALLBACK);
    } finally {
      if (sequence === rosterSequence.current) {
        setRosterLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // `draft.vehicles` is stable across renders while it exists; the `?? []`
  // fallback would otherwise mint a new array identity every render and
  // re-trigger the cleanup effect below.
  const vehicles = useMemo<FleetDraftVehicle[]>(
    () => draft.vehicles ?? [],
    [draft.vehicles],
  );

  const driversById = useMemo(
    () => new Map(drivers.map((driver) => [driver.driverProfileId, driver])),
    [drivers],
  );

  /**
   * Drops a `driverProfileId` that points at someone no longer on the roster
   * (deleted out of band between sessions). A dangling id would otherwise pass
   * the client's assigned-count check and fail server-side at submit. The key
   * is removed rather than set to `null`, which `FleetDraftVehicle` does not
   * admit.
   */
  useEffect(() => {
    if (!rosterLoaded) return;

    const hasStale = vehicles.some(
      (vehicle) =>
        vehicle.driverProfileId !== undefined &&
        !driversById.has(vehicle.driverProfileId),
    );
    if (!hasStale) return;

    updateDraft({
      vehicles: vehicles.map((vehicle) => {
        if (
          vehicle.driverProfileId === undefined ||
          driversById.has(vehicle.driverProfileId)
        ) {
          return vehicle;
        }

        const next = { ...vehicle };
        delete next.driverProfileId;
        return next;
      }),
    });
  }, [rosterLoaded, driversById, vehicles, updateDraft]);

  /** The roster entry on a vehicle, or undefined when it has none. */
  const driverFor = useCallback(
    (vehicle: FleetDraftVehicle): RosterEntry | undefined =>
      vehicle.driverProfileId === undefined
        ? undefined
        : driversById.get(vehicle.driverProfileId),
    [driversById],
  );

  const assignedCount = vehicles.filter(
    (vehicle) => driverFor(vehicle) !== undefined,
  ).length;

  /**
   * Which *other* draft vehicle holds each driver, for the "on 34 ABC 128"
   * note. Built excluding the vehicle whose dialog is open, so the driver
   * already on that row is never reported as ineligible against themselves.
   */
  const takenInDraft = useMemo(() => {
    const map = new Map<string, DraftHolder>();

    vehicles.forEach((vehicle, index) => {
      if (index === openIndex) return;
      if (vehicle.driverProfileId === undefined) return;
      map.set(vehicle.driverProfileId, {
        index: index + 1,
        plateNumber: vehicle.plateNumber,
      });
    });

    return map;
  }, [vehicles, openIndex]);

  /** Writes one vehicle's `driverProfileId`, leaving every other row alone. */
  function assignDriver(vehicleIndex: number, driverProfileId: string) {
    updateDraft({
      vehicles: vehicles.map((vehicle, index) =>
        index === vehicleIndex ? { ...vehicle, driverProfileId } : vehicle,
      ),
    });
  }

  /**
   * Deletes one vehicle's `driverProfileId`. The key goes away rather than
   * being set to `null` — the type does not admit `null`, and an explicit null
   * would serialise into the saved draft as a value the parser would have to
   * special-case forever. The driver account is untouched: they stay on the
   * roster and become eligible for another vehicle again.
   */
  function removeDriver(vehicleIndex: number) {
    updateDraft({
      vehicles: vehicles.map((vehicle, index) => {
        if (index !== vehicleIndex) return vehicle;

        const next = { ...vehicle };
        delete next.driverProfileId;
        return next;
      }),
    });
  }

  /**
   * Folds a driver created in the dialog straight into the roster rather than
   * refetching. The sequence bump invalidates any `GET` still in flight, whose
   * pre-creation list would otherwise land on top and make the new driver
   * disappear; `rosterLoading` is cleared here for the same reason, since that
   * request's own `finally` will no longer recognise itself as current.
   */
  function handleDriverCreated(driver: RosterEntry) {
    rosterSequence.current += 1;
    setDrivers((current) => [...current, driver]);
    setRosterLoaded(true);
    setRosterLoading(false);
    setRosterError(null);
  }

  function handleContinue() {
    const firstUnassigned = vehicles.findIndex(
      (vehicle) => driverFor(vehicle) === undefined,
    );

    if (firstUnassigned !== -1) {
      setShowErrors(true);
      // A table step's toast carries the first row's message rather than the
      // form steps' "Fix the highlighted fields to continue.": here the failing
      // control lives inside a closed dialog, so pointing at highlighted fields
      // would point at nothing.
      showToast(
        `Vehicle ${firstUnassigned + 1}: assign a driver before continuing.`,
        "error",
      );
      return;
    }

    goToStep(FLEET_SCREENS.review);
  }

  const openVehicle = openIndex === null ? undefined : vehicles[openIndex];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[560px] text-[13.5px] leading-[1.5] text-muted-foreground">
          Every vehicle needs a named driver. Create the account yourself for
          drivers already on staff, or pick one from your roster.
        </p>
        <p aria-live="polite" className={`shrink-0 font-price ${LABEL_CLASS}`}>
          {assignedCount} of {vehicles.length} assigned
        </p>
      </div>

      {rosterError !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-[15px] py-3.5">
          <p role="alert" className="text-[13px] text-destructive">
            {rosterError}
          </p>
          {/* The table still renders below: a failed roster load must not hide
              the vehicles, only the names that would have gone on them. */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => void loadRoster()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {rosterError === null && rosterLoading ? (
        <p className="text-[12.5px] text-muted-foreground">
          Loading your roster…
        </p>
      ) : null}

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`w-[52px] ${LABEL_CLASS}`}>#</TableHead>
              <TableHead className={LABEL_CLASS}>Vehicle</TableHead>
              <TableHead className={LABEL_CLASS}>Plate</TableHead>
              <TableHead className={LABEL_CLASS}>Driver</TableHead>
              <TableHead className={LABEL_CLASS}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vehicles.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={5}
                  className="px-3 py-6 text-center text-[13px] text-muted-foreground"
                >
                  No vehicles yet — declare your fleet first.
                </TableCell>
              </TableRow>
            ) : null}

            {vehicles.map((vehicle, index) => {
              // `FleetDraftVehicleClassId` and `VehicleClassId` are the same
              // five-literal union, declared apart so the persisted draft shape
              // stays independent of the presentation taxonomy.
              const vehicleClass = findVehicleClass(vehicle.classId);
              const driver = driverFor(vehicle);
              const rowNumber = index + 1;
              const plate = vehicle.plateNumber;
              // A row is only "highlighted" after a failed Continue, per the
              // design's validate-on-continue rule.
              const flagged = showErrors && driver === undefined;

              function openDialog() {
                setOpenIndex(index);
              }

              return (
                <TableRow
                  key={vehicle.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Assign a driver to vehicle ${rowNumber}, ${vehicleClass.name} ${plate ?? ""}`.trim()}
                  onClick={openDialog}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      openDialog();
                      return;
                    }
                    if (event.key === " ") {
                      // Otherwise the space scrolls the page under the dialog
                      // that is about to open over it.
                      event.preventDefault();
                      openDialog();
                    }
                  }}
                  className={`cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                    flagged ? "bg-destructive/5" : ""
                  }`}
                >
                  <TableCell className="px-3 py-3 font-price text-[13px] font-semibold text-muted-foreground">
                    {rowNumber}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span className="block text-[13.5px] font-semibold">
                      {vehicleClass.name}
                    </span>
                    <span className="mt-px block text-[12px] text-muted-foreground">
                      needs category {vehicleClass.requiredLicenceCategory}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-3 font-price text-[13px] font-semibold tracking-[0.12em]">
                    {plate !== undefined && plate !== "" ? plate : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {driver === undefined ? (
                      <span className="text-[13.5px] text-muted-foreground">
                        Not assigned
                      </span>
                    ) : (
                      <>
                        <span className="block text-[13.5px] font-semibold">
                          {driver.name}
                        </span>
                        <span className="mt-px block text-[12px] text-muted-foreground">
                          {driver.categories.length > 0
                            ? `${driver.phone} · ${driver.categories.join(", ")}`
                            : driver.phone}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-[20px] border px-2.5 py-1 font-price text-[11px] font-semibold tracking-[0.06em] uppercase ${
                        driver !== undefined
                          ? ASSIGNED_PILL_CLASS
                          : flagged
                            ? "border-transparent bg-destructive/10 text-destructive"
                            : "border-transparent bg-muted text-muted-foreground"
                      }`}
                    >
                      {driver !== undefined ? "Assigned" : "Unassigned"}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Raw buttons rather than `src/components/ui/button.tsx`: the design's
          48px wizard CTA is well outside that primitive's size scale, and these
          match the accent/outline pair the shell's own welcome screen uses.

          Both are theme-correct as written and neither should grow a `dark:`
          variant. The accent one is `text-white` on the brand orange, which is
          theme-independent by design, so its label is too; the outline one is
          semantic tokens end to end (`border-border`, `bg-card`, `bg-muted` on
          hover), so it follows the theme on its own. The same pair appears on
          the two dialog footers below, for the same reason. */}
      <div className="flex items-center gap-3.5 border-t border-border pt-[22px]">
        <button
          type="button"
          onClick={handleContinue}
          className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => goToStep(FLEET_SCREENS.vehicles)}
          className="h-12 cursor-pointer rounded-[11px] border border-border bg-card px-5 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Back
        </button>
      </div>

      {openIndex !== null && openVehicle !== undefined ? (
        <DriverAssignmentDialog
          // Remounting per vehicle is what recomputes the opening tab and
          // clears the create-account form between rows.
          key={openVehicle.id}
          open
          onOpenChange={(next) => {
            if (!next) setOpenIndex(null);
          }}
          index={openIndex + 1}
          classId={openVehicle.classId}
          plateNumber={openVehicle.plateNumber}
          currentDriverProfileId={openVehicle.driverProfileId ?? null}
          drivers={drivers}
          takenInDraft={takenInDraft}
          defaultCity={draft.company?.city}
          onAssign={(driverProfileId) => {
            assignDriver(openIndex, driverProfileId);
            setOpenIndex(null);
          }}
          onRemove={() => {
            const vehicleNumber = openIndex + 1;
            removeDriver(openIndex);
            setOpenIndex(null);
            showToast(`Driver removed from vehicle ${vehicleNumber}.`);
          }}
          onDriverCreated={handleDriverCreated}
          onCredentialsIssued={setCredentials}
          showToast={showToast}
        />
      ) : null}

      {credentials !== null ? (
        <TempPasswordDialog
          open
          onOpenChange={(next) => {
            if (!next) setCredentials(null);
          }}
          driverName={credentials.driverName}
          email={credentials.email}
          tempPassword={credentials.tempPassword}
          showToast={showToast}
        />
      ) : null}
    </div>
  );
}

/**
 * The 640px assignment dialog: pick a driver already on the roster, or create
 * the account there and then. Exactly two tabs — the design's third "Send
 * invitation" tab is an explicit non-goal and is not built.
 *
 * `onCredentialsIssued` is the one addition to the task's prop list: this
 * dialog closes the instant the account is created, so it cannot own a
 * credentials dialog that has to outlive it. The step renders that one.
 */
function DriverAssignmentDialog({
  open,
  onOpenChange,
  index,
  classId,
  plateNumber,
  currentDriverProfileId,
  drivers,
  takenInDraft,
  defaultCity,
  onAssign,
  onRemove,
  onDriverCreated,
  onCredentialsIssued,
  showToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 1-based row number, for the title. */
  index: number;
  classId: VehicleClassId;
  plateNumber: string | undefined;
  /** The driver currently on this vehicle, or null. */
  currentDriverProfileId: string | null;
  drivers: RosterEntry[];
  /** driverProfileId -> the OTHER vehicle holding them, for the "on …" note. */
  takenInDraft: Map<string, DraftHolder>;
  /** Seeds the Create-account tab's City select from `draft.company?.city`. */
  defaultCity: string | undefined;
  onAssign: (driverProfileId: string) => void;
  onRemove: () => void;
  /** Folds a newly created driver into the step's roster state. */
  onDriverCreated: (driver: RosterEntry) => void;
  /** Hands the once-only credentials to the step, which shows them. */
  onCredentialsIssued: (credentials: IssuedCredentials) => void;
  showToast: (message: string, tone?: "default" | "error") => void;
}) {
  const vehicleClass = findVehicleClass(classId);
  const required: DriverLicenceCategory = vehicleClass.requiredLicenceCategory;

  const rows = useMemo(
    () =>
      drivers.map((driver) => ({
        driver,
        eligibility: evaluateEligibility(driver, required, takenInDraft),
      })),
    [drivers, required, takenInDraft],
  );

  const hasEligible = rows.some((row) => row.eligibility.eligible);

  // Computed once per open, from the roster as it stood when the dialog
  // mounted: the tab opens on the roster when there is someone to pick, and on
  // the form when there is not. The lazy initialiser is what makes it "once" —
  // creating a driver flips `hasEligible` and must not yank the tab.
  const [tab, setTab] = useState<string>(() =>
    hasEligible ? "existing" : "create",
  );

  // Which ineligible row is currently flashing its reason, and a monotonic key
  // so a repeat click on the same row replays the animation instead of the
  // note sitting there unchanged.
  const [flashed, setFlashed] = useState<{
    driverProfileId: string;
    note: string;
    key: number;
  } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flashKey = useRef(0);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  function flashIneligible(driverProfileId: string, note: string) {
    // Cleared first so a second flash gets a full window, not the remainder.
    clearTimeout(flashTimer.current);
    flashKey.current += 1;
    setFlashed({ driverProfileId, note, key: flashKey.current });
    flashTimer.current = setTimeout(() => setFlashed(null), FLASH_DURATION_MS);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `data-onboarding-surface` because the content portals to
          `document.body`, outside the wizard's own surface element — without it
          the `ui` primitives resolve their tokens against the landing palette.
          `sm:max-w-[640px]` overrides the primitive's `sm:max-w-sm` default. */}
      <DialogContent
        data-onboarding-surface=""
        className="grid-rows-[auto_minmax(0,1fr)_auto] w-full max-h-[calc(100dvh-6rem)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[640px]"
      >
        <DialogHeader className="gap-1 border-b border-border px-[22px] pt-5 pb-4">
          <DialogTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
            Vehicle {index} —{" "}
            {plateNumber !== undefined && plateNumber !== ""
              ? plateNumber
              : vehicleClass.name}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5]">
            {vehicleClass.name} · needs licence category {required}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-[22px] py-[18px]">
          {/* Keyed so reopening for a different vehicle re-reads the opening
              tab, which `defaultValue` alone would only do on first mount. */}
          <Tabs key={`${index}:${open}`} value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="existing">Existing driver</TabsTrigger>
              <TabsTrigger value="create">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="pt-3">
              {/* The flash reason, mirrored for screen readers: an ineligible
                  row explains itself visually, and has to explain itself here
                  too. */}
              <p aria-live="assertive" className="sr-only">
                {flashed?.note ?? ""}
              </p>

              {!hasEligible ? (
                <div className="flex flex-col items-start gap-3 rounded-[12px] border border-border bg-muted/40 p-[15px]">
                  <p className="text-[13px] leading-[1.5] text-muted-foreground">
                    No driver on your roster holds the categories this vehicle
                    needs. Create an account instead.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setTab("create")}
                  >
                    Create account
                  </Button>
                </div>
              ) : null}

              {rows.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {rows.map(({ driver, eligibility }) => {
                    const isCurrent =
                      driver.driverProfileId === currentDriverProfileId;
                    // The flash counter for *this* row, or null when it is not
                    // the one flashing. Held as the number rather than a
                    // boolean so the note below can be re-keyed on it.
                    const rowFlashKey =
                      flashed !== null &&
                      flashed.driverProfileId === driver.driverProfileId
                        ? flashed.key
                        : null;
                    const isFlashed = rowFlashKey !== null;

                    return (
                      <button
                        key={driver.driverProfileId}
                        type="button"
                        // Ineligible rows stay focusable and clickable:
                        // clicking is how the company finds out why.
                        aria-disabled={!eligibility.eligible}
                        onClick={() => {
                          if (eligibility.eligible) {
                            onAssign(driver.driverProfileId);
                            return;
                          }
                          flashIneligible(
                            driver.driverProfileId,
                            eligibility.note,
                          );
                        }}
                        className={`flex w-full cursor-pointer items-center gap-3 rounded-[11px] border px-[13px] py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                          !eligibility.eligible
                            ? `opacity-[0.55] ${
                                isFlashed
                                  ? "border-destructive bg-destructive/5"
                                  : "border-border bg-card"
                              }`
                            : isCurrent
                              ? "border-onboarding-accent bg-onboarding-accent/5"
                              : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted font-price text-[13px] font-semibold"
                        >
                          {initialsOf(driver.name)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {driver.name}
                          </span>
                          <span className="mt-px block truncate text-xs text-muted-foreground">
                            {driver.categories.length > 0
                              ? `${driver.phone} · ${driver.categories.join(", ")}`
                              : driver.phone}
                          </span>
                        </span>

                        {eligibility.eligible ? (
                          <span
                            className={`shrink-0 text-xs font-semibold ${
                              isCurrent
                                ? "text-onboarding-accent"
                                : "text-muted-foreground"
                            }`}
                          >
                            {isCurrent ? "Assigned" : "Assign →"}
                          </span>
                        ) : (
                          // Re-keyed on each flash so the animation replays
                          // rather than the note sitting unchanged.
                          <span
                            key={
                              rowFlashKey === null
                                ? "note"
                                : `flash-${rowFlashKey}`
                            }
                            className={`shrink-0 text-xs text-destructive ${
                              isFlashed ? "animate-onboarding-fade-up" : ""
                            }`}
                          >
                            {eligibility.note}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="create" className="pt-3">
              <CreateDriverForm
                required={required}
                defaultCity={defaultCity}
                onCreated={(driver, issued) => {
                  onDriverCreated(driver);
                  onAssign(driver.driverProfileId);
                  onCredentialsIssued(issued);
                }}
                showToast={showToast}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-between gap-3.5 rounded-b-2xl border-t border-border bg-muted/40 px-[22px] py-3.5 sm:justify-between">
          {/* Removing the driver does not delete their account: they stay on
              the roster and become eligible for another vehicle again. */}
          {currentDriverProfileId !== null ? (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={onRemove}
            >
              Remove current driver
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The fields the create-account form collects, in the order it validates them. */
type CreateFieldName =
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "city"
  | "licenceNumber"
  | "expiry"
  | "categories";

type CreateFieldErrors = Partial<Record<CreateFieldName, string>>;

/** Order the first failing message is picked from, for the toast. */
const CREATE_FIELD_ORDER: CreateFieldName[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "licenceNumber",
  "expiry",
  "categories",
];

/**
 * Every rule the create-account form enforces. Pure, and evaluated on every
 * render so the messages correct themselves as the company types rather than
 * staying stale until the next Save.
 *
 * The expiry rule is a convenience only: the register route re-parses the date
 * and re-checks it against its own clock, and is the authoritative one.
 */
function validateCreateDriver(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  licenceNumber: string;
  expiry: string;
  categories: DriverLicenceCategory[];
  required: DriverLicenceCategory;
}): CreateFieldErrors {
  const errors: CreateFieldErrors = {};

  if (!input.firstName.trim()) {
    errors.firstName = "Enter the driver's first name.";
  }

  if (!input.lastName.trim()) {
    errors.lastName = "Enter the driver's last name.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    errors.email = "Enter the driver's email address — they sign in with it.";
  }

  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    errors.phone = "Enter a valid mobile number.";
  }

  if (!GEORGIAN_CITY_OPTIONS.some((option) => option.value === input.city)) {
    errors.city = "Select the driver's city.";
  }

  if (input.licenceNumber.trim().length < MIN_LICENCE_NUMBER_LENGTH) {
    errors.licenceNumber = "Enter the licence number.";
  }

  // Lexicographic comparison is exact for `YYYY-MM-DD` and, unlike parsing both
  // sides into `Date`s, has no timezone edge to get wrong. An empty or
  // malformed value fails the same test and earns the same message.
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry) ||
    input.expiry <= todayIsoDate()
  ) {
    errors.expiry = "That licence has expired. Enter a future expiry date.";
  }

  if (input.categories.length === 0) {
    errors.categories = "Select at least one licence category.";
  } else if (!input.categories.includes(input.required)) {
    // The design's exact message, and the reason the vehicle's required
    // category is prechecked but still uncheckable.
    errors.categories = `This vehicle needs category ${input.required}. Assign a different driver or vehicle.`;
  }

  return errors;
}

/**
 * The Create-account tab: the whole driver account, created for real by
 * `POST /api/logistics-company/drivers/register`.
 *
 * First and last name are two inputs rather than one "Full name" box the client
 * splits: the endpoint takes `firstName` and `lastName`, `DriverProfile` stores
 * them apart, and a whitespace split mangles every two-word surname it meets.
 * The email is required and *is* the driver's login — there is no derived login
 * constructed anywhere in this feature.
 */
function CreateDriverForm({
  required,
  defaultCity,
  onCreated,
  showToast,
}: {
  required: DriverLicenceCategory;
  defaultCity: string | undefined;
  onCreated: (driver: RosterEntry, credentials: IssuedCredentials) => void;
  showToast: (message: string, tone?: "default" | "error") => void;
}) {
  const fieldId = useId();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState<string>(defaultCity ?? "");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  // Prechecked with the vehicle's requirement. Unchecking it is allowed — that
  // is what surfaces the "This vehicle needs category CE." message.
  const [categories, setCategories] = useState<DriverLicenceCategory[]>([
    required,
  ]);

  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const problems = validateCreateDriver({
    firstName,
    lastName,
    email,
    phone,
    city,
    licenceNumber,
    expiry,
    categories,
    required,
  });
  const errors: CreateFieldErrors = showErrors ? problems : {};

  // A taken address comes back as a 400 naming the email, so it is mirrored
  // under that input as well as shown in the dialog's error line: that is the
  // one field the company actually has to change.
  const emailError =
    errors.email ??
    (serverError === DUPLICATE_EMAIL_ERROR ? DUPLICATE_EMAIL_ERROR : undefined);

  function setCategorySelected(code: DriverLicenceCategory, selected: boolean) {
    // Set to an explicit value rather than toggled, so even a doubled
    // activation lands on the state the company asked for.
    setCategories(
      LICENCE_CATEGORIES.filter((category) =>
        category === code ? selected : categories.includes(category),
      ),
    );
  }

  async function handleSave() {
    // A duplicate POST would create a second real account, so a second click
    // while one is in flight is ignored outright.
    if (submitting) return;

    if (Object.keys(problems).length > 0) {
      setShowErrors(true);
      const firstField = CREATE_FIELD_ORDER.find(
        (field) => problems[field] !== undefined,
      );
      const firstMessage =
        firstField === undefined ? undefined : problems[firstField];
      if (firstMessage !== undefined) {
        showToast(firstMessage, "error");
      }
      return;
    }

    setSubmitting(true);
    setServerError(null);

    try {
      // `vehicleId` is deliberately omitted: no `Vehicle` row exists during the
      // wizard, so there is nothing to assign server-side yet.
      const response = await fetch(REGISTER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          city,
          licenceNumber: licenceNumber.trim(),
          licenceExpiresAt: expiry,
          licenceCategories: categories,
        }),
      });

      if (!response.ok) {
        setServerError(await readErrorMessage(response, CREATE_ERROR_FALLBACK));
        return;
      }

      const body = (await response.json()) as RegisterDriverResult;

      // The 201 is flat — no `driver` and no `credentials` wrapper. Folded
      // straight into the roster rather than refetched.
      onCreated(
        {
          userId: body.userId,
          driverProfileId: body.driverProfileId,
          name: body.name,
          email: body.email,
          phone: body.phone,
          city,
          isOnline: false,
          categories: body.categories,
          licenceExpiresAt: new Date(expiry).toISOString(),
          currentAssignment: null,
        },
        {
          driverName: body.name,
          // Both values come straight off the response: the address the company
          // typed and the server-generated password, passed through unchanged.
          email: body.email,
          tempPassword: body.tempPassword,
        },
      );
    } catch {
      setServerError(CREATE_ERROR_FALLBACK);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${fieldId}-first-name`}
          label="First name"
          error={errors.firstName}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
              className={FIELD_CLASS}
            />
          )}
        </FormField>

        <FormField
          id={`${fieldId}-last-name`}
          label="Last name"
          error={errors.lastName}
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
              className={FIELD_CLASS}
            />
          )}
        </FormField>
      </div>

      <FormField
        id={`${fieldId}-email`}
        label="Email address"
        error={emailError}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="driver@example.com"
            autoComplete="off"
            spellCheck={false}
            className={FIELD_CLASS}
          />
        )}
      </FormField>

      <FormField id={`${fieldId}-phone`} label="Mobile" error={errors.phone}>
        {(controlProps) => (
          <Input
            {...controlProps}
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+995 555 12 34 56"
            autoComplete="off"
            className={FIELD_CLASS}
          />
        )}
      </FormField>

      <FormField id={`${fieldId}-city`} label="City" error={errors.city}>
        {(controlProps) => (
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger
              {...controlProps}
              className={`w-full justify-between ${FIELD_CLASS}`}
            >
              <SelectValue placeholder="Select a city" />
            </SelectTrigger>
            {/* Portals to `document.body`, so it carries the marker itself. */}
            <SelectContent data-onboarding-surface="" className="max-h-[280px]">
              {GEORGIAN_CITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label} · {option.region}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField
        id={`${fieldId}-licence-number`}
        label="Licence number"
        error={errors.licenceNumber}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            value={licenceNumber}
            onChange={(event) => setLicenceNumber(event.target.value)}
            placeholder="D4419-88210"
            autoComplete="off"
            className={`${FIELD_CLASS} font-price tracking-[0.05em]`}
          />
        )}
      </FormField>

      <FormField
        id={`${fieldId}-expiry`}
        label="Licence expiry"
        error={errors.expiry}
      >
        {(controlProps) => (
          <Input
            {...controlProps}
            type="date"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            className={FIELD_CLASS}
          />
        )}
      </FormField>

      <div className="flex flex-col gap-2">
        <p className={LABEL_CLASS}>Categories held</p>
        <div className="flex flex-wrap gap-2">
          {LICENCE_CATEGORIES.map((code) => {
            const checkboxId = `${fieldId}-category-${code}`;
            const selected = categories.includes(code);

            return (
              // A label wrapping the checkbox rather than a button containing
              // one: the chip has to be clickable as a whole, and an
              // interactive control inside a <button> is invalid markup.
              <Label
                key={code}
                htmlFor={checkboxId}
                className={`cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2.5 font-normal transition-colors ${
                  selected
                    ? "border-onboarding-accent bg-onboarding-accent/5"
                    : "border-border bg-card hover:border-input"
                }`}
              >
                {/* Only the checked state is overridden, and only to swap the
                    primitive's `--primary` fill for the brand orange. The
                    `text-white` tick that rides on it is correct in both themes
                    — the orange is theme-independent by design, so its tick has
                    to be too, and the primitive's own `data-checked:
                    text-primary-foreground` would invert to near-black against
                    it in dark.

                    The unchecked state is deliberately left entirely to the
                    primitive (`border-input` plus its `dark:bg-input/30` fill),
                    which is what every other checkbox in the app renders. The
                    classes below touch size, radius and border *width* only, so
                    nothing here fights that fill; if the dark unchecked box ever
                    needs more contrast, it needs it in the primitive rather than
                    on this one chip. */}
                <Checkbox
                  id={checkboxId}
                  checked={selected}
                  onCheckedChange={(checked) =>
                    setCategorySelected(code, checked === true)
                  }
                  aria-invalid={errors.categories !== undefined}
                  aria-describedby={
                    errors.categories !== undefined
                      ? `${fieldId}-categories-error`
                      : undefined
                  }
                  className="size-[18px] rounded-[5px] border-[1.5px] data-checked:border-onboarding-accent data-checked:bg-onboarding-accent data-checked:text-white"
                />
                <span className="font-price text-[13px] font-semibold">
                  Category {code}
                </span>
              </Label>
            );
          })}
        </div>
        {errors.categories !== undefined ? (
          <p
            id={`${fieldId}-categories-error`}
            className="text-xs text-destructive"
          >
            {errors.categories}
          </p>
        ) : null}
      </div>

      <div className="rounded-[12px] border border-border bg-muted/40 p-[13px] text-[12.5px] leading-[1.5] text-muted-foreground">
        <p className={LABEL_CLASS}>Temporary password</p>
        <p className="mt-1.5">
          Shown once when you save, for you to pass on. The driver must change
          it at first sign-in and upload their own licence photos before their
          first order.
        </p>
      </div>

      {serverError !== null ? (
        <p role="alert" className="text-[13px] text-destructive">
          {serverError}
        </p>
      ) : null}

      <button
        type="button"
        disabled={submitting}
        onClick={() => void handleSave()}
        className="h-12 cursor-pointer rounded-[11px] bg-onboarding-accent px-[30px] text-[15px] font-semibold tracking-[-0.01em] text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create driver account"}
      </button>
    </div>
  );
}

/**
 * Label + control + inline message, with `aria-invalid` and `aria-describedby`
 * wired to the same message the eye sees. A render prop rather than a wrapper
 * around `Input`, because the City field is a `Select` and has to receive the
 * identical accessibility props on its trigger.
 */
function FormField({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: (controlProps: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </Label>
      {children({
        id,
        "aria-invalid": error !== undefined,
        "aria-describedby": error !== undefined ? errorId : undefined,
      })}
      {error !== undefined ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The shown-once credentials dialog.
 *
 * Both values come straight off the register response — its own `email` and
 * `tempPassword`, passed through unchanged. There is no `credentials` wrapper,
 * no `login` and no `temporaryPassword`: the driver signs in with the address
 * the company typed.
 *
 * The password is 12 characters from `node:crypto`'s `randomInt` over a
 * 56-character ambiguity-free charset. It is **never generated in the browser**
 * — the design prototype's 8-character `Math.random()` version is a placeholder
 * and must not be ported, because this value is a real credential until the
 * driver changes it. It lives in component state only, never reaches the draft,
 * is never sent back, and is unrecoverable once this dialog closes: the server
 * stores only Better Auth's hash.
 */
function TempPasswordDialog({
  open,
  onOpenChange,
  driverName,
  email,
  tempPassword,
  showToast,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  email: string;
  tempPassword: string;
  showToast: (message: string, tone?: "default" | "error") => void;
}) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        `Email: ${email}\nTemporary password: ${tempPassword}`,
      );
      showToast("Credentials copied.");
    } catch {
      // An insecure context, or a browser refusing without a user-gesture
      // heuristic. The dialog stays open and the values are `select-all`
      // precisely so copying by hand is workable.
      showToast(
        "Couldn't copy. Select the details and copy them by hand.",
        "error",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-onboarding-surface=""
        className="w-full gap-0 rounded-2xl p-0 sm:max-w-[440px]"
      >
        <DialogHeader className="gap-1 border-b border-border px-[22px] pt-5 pb-4">
          <DialogTitle className="text-[18px] leading-tight font-semibold tracking-[-0.01em]">
            Driver account created
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.5]">
            {driverName} can sign in with these details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-[22px] py-[18px]">
          <div className="flex flex-col gap-3 rounded-[12px] border border-border bg-card p-[15px]">
            <div className="flex flex-col gap-1">
              <p className={LABEL_CLASS}>Email</p>
              <p className="font-price text-[15px] font-semibold break-all select-all">
                {email}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <p className={LABEL_CLASS}>Temporary password</p>
              <p className="font-price text-[15px] font-semibold break-all select-all">
                {tempPassword}
              </p>
            </div>
          </div>

          <p className="text-xs text-destructive">
            This password is shown once. Copy it before closing — we cannot show
            it again.
          </p>
        </div>

        <DialogFooter className="mx-0 mb-0 flex-row items-center justify-end gap-3 rounded-b-2xl border-t border-border bg-muted/40 px-[22px] py-3.5">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="h-11 cursor-pointer rounded-[11px] bg-onboarding-accent px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-onboarding-accent-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Copy credentials
          </button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
