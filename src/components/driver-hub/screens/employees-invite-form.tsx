import { HubCard } from "@/components/driver-hub/hub-primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EmployeeRoleDefinition } from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/**
 * "Invite an employee" — the whole form, laid out exactly as the design
 * specifies it, and **switched off**.
 *
 * There is no invitation endpoint and no employee record for an invitation to
 * create, so a working form here would take a name, an email and a role and
 * quietly drop all three. The alternative — hiding the rail until the backend
 * lands — would lose the design and leave the screen looking finished when it
 * is not. So the form is rendered in full, disabled at the fieldset, and says
 * why in one line under the button.
 *
 * The role rows are the one part of this form that is already real: their
 * labels and descriptions come from the product's actual role definitions, not
 * from placeholder copy.
 */

/**
 * Ids are constants rather than `useId()`: at most one invite form exists in
 * the document at a time (`MasterDetailSplit` renders a single right rail), so
 * they cannot collide and the component needs no hooks.
 */
const NAME_ID = "hub-employees-invite-name";
const EMAIL_ID = "hub-employees-invite-email";
const SCOPE_ID = "hub-employees-invite-scope";
const HINT_ID = "hub-employees-invite-hint";

/**
 * The role the design pre-selects. Nothing can change it while the form is
 * disabled, so it is a constant rather than state.
 */
const DEFAULT_ROLE = "Dispatcher";

/** Shared field label styling — 12px/500 muted, sitting 6px above its input. */
const FIELD_LABEL_CLASSES = "text-xs font-medium text-muted-foreground";

/** The design's input box: 9px/11px padding, 6px radius, 1px border. */
const FIELD_INPUT_CLASSES =
  "h-auto w-full min-w-0 rounded-md border-border px-[11px] py-[9px] text-sm";

export type EmployeeInviteFormProps = {
  /** The real role definitions, most privileged first. */
  roles: readonly EmployeeRoleDefinition[];
  /** Closes the rail. The only control on this panel that actually works. */
  onCancel: () => void;
};

export function EmployeeInviteForm({
  roles,
  onCancel,
}: EmployeeInviteFormProps) {
  return (
    <HubCard>
      {/* `pr-9` leaves the corner free for the ✕ `MasterDetailSplit` draws. */}
      <div className="pr-9">
        <h2 className="text-base font-semibold">Invite an employee</h2>
      </div>
      <p className="text-[13px] leading-normal text-muted-foreground">
        They get an email invite. Permissions come from the role and apply once
        they accept.
      </p>

      {/*
        One `disabled` on the fieldset switches off every control inside it —
        text fields and radios alike — so no field can be forgotten as the form
        grows. `aria-describedby` points the whole group at the hint below,
        which explains why nothing here accepts input.
      */}
      <fieldset
        disabled
        aria-describedby={HINT_ID}
        className="mt-5 flex min-w-0 flex-col gap-3.5"
      >
        <legend className="sr-only">Invite an employee</legend>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={NAME_ID} className={FIELD_LABEL_CLASSES}>
            Full name
          </Label>
          <Input
            id={NAME_ID}
            name="name"
            // The validation the form will apply once it is wired up, stated
            // in the markup rather than only in a handler: >2 characters.
            minLength={3}
            required
            placeholder="e.g. Nika Kavtaradze"
            className={FIELD_INPUT_CLASSES}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={EMAIL_ID} className={FIELD_LABEL_CLASSES}>
            Work email
          </Label>
          <Input
            id={EMAIL_ID}
            name="email"
            type="email"
            // The design's own rule, kept verbatim next to `type="email"`.
            pattern=".+@.+\..+"
            required
            placeholder="name@gizocargo.ge"
            // An address is one of the values the hub always sets in mono.
            className={cn(FIELD_INPUT_CLASSES, "font-price text-[13px]")}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={FIELD_LABEL_CLASSES}>Role</span>
          <div className="flex flex-col gap-2">
            {roles.map((definition) => {
              const selected = definition.role === DEFAULT_ROLE;

              return (
                <Label
                  key={definition.role}
                  className={cn(
                    "flex cursor-not-allowed items-center justify-between gap-3 rounded-lg border px-[13px] py-[11px]",
                    selected
                      ? "border-foreground bg-muted"
                      : "border-border bg-background",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      {definition.role}
                    </span>
                    {/* Real product content: what this role can actually do. */}
                    <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                      {definition.summary}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="role"
                    value={definition.role}
                    // `defaultChecked`, not `checked`: nothing can change it
                    // while the fieldset is disabled, and an uncontrolled
                    // radio needs no change handler to stay warning-free.
                    defaultChecked={selected}
                    className={cn(
                      "size-3.5 flex-none appearance-none rounded-full border-4 bg-background",
                      selected ? "border-foreground" : "border-border",
                    )}
                  />
                </Label>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={SCOPE_ID} className={FIELD_LABEL_CLASSES}>
            Scope
          </Label>
          <Input
            id={SCOPE_ID}
            name="scope"
            placeholder="Zones or vehicles they cover"
            className={FIELD_INPUT_CLASSES}
          />
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          disabled
          // Disabled buttons drop out of the tab order, so the reason is both
          // described here and printed below — not hidden in a `title`.
          aria-describedby={HINT_ID}
          className="h-auto rounded-md px-[15px] py-[9px] text-[13px]"
        >
          Send invite
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onCancel}
          className="h-auto rounded-md px-[15px] py-[9px] text-[13px]"
        >
          Cancel
        </Button>
      </div>
      {/*
        The design's hint reads the selection back ("Dispatcher permissions
        will apply to …"). That sentence would be a promise this build cannot
        keep, so the hint says what is actually true instead.
      */}
      <p
        id={HINT_ID}
        className="mt-2.5 text-xs leading-normal text-muted-foreground"
      >
        Employee accounts are not connected to the backend yet, so this form
        cannot send an invite. It is here so the screen is ready the day
        employee records exist.
      </p>
    </HubCard>
  );
}
