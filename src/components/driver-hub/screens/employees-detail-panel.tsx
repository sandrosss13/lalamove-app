import { HubCard, HubStatusBadge } from "@/components/driver-hub/hub-primitives";
import {
  EmployeePermissionPill,
  EmployeeRolePill,
} from "@/components/driver-hub/screens/employees-permission-pill";
import { Button } from "@/components/ui/button";
import type { SampleEmployee } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/**
 * The right-rail panel for one person on the roster.
 *
 * The person is invented (the roster has no backing model), and so is the
 * grant: the permission rows are **this person's own** `perms`, which is what
 * the design reads (`selectedEmployee.perms.map(...)`). It is not the same list
 * as the role definition further down the screen, and must not be swapped back
 * for one — a grant belongs to the person, so once an `Employee` model exists a
 * role change or a one-off adjustment can leave a row narrower than its role's
 * default. `sample.ts` seeds each person from the real definitions so the two
 * agree today; reading the definition here would hide the day they stop.
 *
 * Removal ships visibly disabled. Nothing backs it — there is no employees
 * endpoint under `/api/logistics-company` at all — so it wears the design's
 * unarmed destructive shape and never arms: a two-step arm→confirm would be
 * theatre over an action that cannot happen.
 */

/**
 * A constant rather than `useId()`: `MasterDetailSplit` renders at most one
 * detail panel at a time, so this id is unique in the document and the
 * component stays hook-free.
 */
const REMOVE_NOTE_ID = "hub-employees-remove-note";

/**
 * The design's destructive button, unarmed — `dangerBtn(false)`: BAD text on a
 * white ground inside a neutral LINE border, the same shape
 * `drivers-detail-panel.tsx` wears before it is armed.
 *
 * There is no armed counterpart here on purpose. `Button`'s own `disabled`
 * styling — a 50% wash and `pointer-events: none`, so nothing reacts to a
 * hover either — stays on top of this, which is what keeps the control reading
 * as the right *kind* of button and still, unmistakably, as one that is off.
 */
const REMOVE_UNARMED_CLASSES =
  "border-border bg-background text-[oklch(57.7%_0.245_27.325)]";

/** Why the remove button is off. Short, and about the system, not the person. */
const REMOVE_NOTE =
  "Employee accounts are not connected to the backend yet, so nobody can be " +
  "removed from here. This turns on with the employee record itself.";

/** "Marika Dolidze" → "MD". Two letters is all the 38px circle holds. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];

  if (first === undefined) {
    return "?";
  }

  const last = words.length > 1 ? words[words.length - 1] : undefined;

  return `${first.slice(0, 1)}${last?.slice(0, 1) ?? ""}`.toUpperCase();
}

export type EmployeeDetailPanelProps = {
  person: SampleEmployee;
};

export function EmployeeDetailPanel({ person }: EmployeeDetailPanelProps) {
  const invited = person.status === "Invited";

  return (
    <HubCard>
      {/* `pr-9` keeps the title clear of the ✕ that `MasterDetailSplit` renders
          into this panel's top-right corner. */}
      <div className="flex min-w-0 items-center gap-3 pr-9">
        <span
          aria-hidden="true"
          className="grid size-[38px] flex-none place-items-center rounded-full bg-muted text-[13px] font-semibold"
        >
          {initialsOf(person.name)}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{person.name}</h2>
          <p className="mt-0.5 truncate font-price text-[11px] text-muted-foreground">
            {person.email}
          </p>
        </div>
      </div>

      <div className="mt-4 mb-5 flex flex-wrap gap-2">
        <HubStatusBadge status={person.status} />
        <EmployeeRolePill role={person.role} />
      </div>

      <p className="text-[13px] leading-normal text-muted-foreground">
        {person.roleNote}
      </p>

      {/* Heading straight to the first row, as the design has it — there is no
          line between the two. What these rows come from is the role note
          already printed above them. */}
      <h3 className="mt-5 mb-0.5 text-[13px] font-semibold">Permissions</h3>
      <dl>
        {person.perms.map((permission) => (
          <div
            key={permission.area}
            className="flex items-center justify-between gap-3 border-t border-muted py-2.5 text-[13px]"
          >
            <dt className="min-w-0 truncate">{permission.area}</dt>
            <dd className="flex-none">
              <EmployeePermissionPill level={permission.level} />
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-5 mb-0.5 text-[13px] font-semibold">Assigned</h3>
      <dl>
        {person.assigned.map((assignment) => (
          <div
            key={assignment.label}
            className="flex justify-between gap-3 border-t border-muted py-[9px] text-[13px]"
          >
            <dt className="min-w-0 truncate text-muted-foreground">
              {assignment.label}
            </dt>
            {/* Counts, ids and plates — mono, like every other value here. */}
            <dd className="flex-none font-price font-medium">
              {assignment.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-[22px] border-t border-border pt-[18px]">
        <Button
          type="button"
          variant="outline"
          disabled
          // A disabled button is out of the tab order, so the explanation is
          // wired up as a description *and* printed underneath — a `title`
          // alone would reach a mouse and nobody else.
          aria-describedby={REMOVE_NOTE_ID}
          className={cn(
            "h-auto rounded-md px-[15px] py-[9px] text-[13px] font-medium",
            REMOVE_UNARMED_CLASSES,
          )}
        >
          {invited ? "Revoke invite" : "Remove employee"}
        </Button>
        <p
          id={REMOVE_NOTE_ID}
          className="mt-[9px] text-xs leading-normal text-muted-foreground"
        >
          {REMOVE_NOTE}
        </p>
      </div>
    </HubCard>
  );
}
