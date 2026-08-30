import { Badge } from "@/components/ui/badge";
import {
  HUB_STATUS_TONE_CLASSES,
  type HubStatusTone,
} from "@/components/driver-hub/hub-status";
import type {
  EmployeePermissionLevel,
  EmployeeRoleName,
} from "@/lib/dashboard/hub/sample";
import { cn } from "@/lib/utils";

/**
 * The two non-status pills the Employees screen needs.
 *
 * `HubStatusBadge` keys its colour off a *status word* ("Active", "Invited"),
 * and neither a permission level nor a role name is one — feeding them through
 * it would rely on the unknown-word fallback and read as a status to anyone
 * later maintaining `hub-status.ts`. So these two pills map their own values
 * onto the same six tones instead: the vocabulary stays shared (no seventh
 * colour pair is invented here), only the lookup differs.
 */

/** Geometry shared with `HubStatusBadge` — 3px/9px, 11px/600, fully rounded. */
const PILL_CLASSES =
  "h-auto rounded-full border-transparent px-[9px] py-[3px] text-[11px] font-semibold tracking-[0.02em]";

/**
 * Manage is green, View is blue, None is grey — the handoff's own reading of
 * "you own this area / you can look / this area is closed to you".
 */
const TONE_BY_LEVEL: Record<EmployeePermissionLevel, HubStatusTone> = {
  Manage: "success",
  View: "info",
  None: "neutral",
};

export type EmployeePermissionPillProps = {
  level: EmployeePermissionLevel;
  className?: string;
};

/**
 * What a role may do in one area. Part of the **real** role definitions, so it
 * never sits under a `<SampleNote />` — see `employees-role-definitions.tsx`.
 */
export function EmployeePermissionPill({
  level,
  className,
}: EmployeePermissionPillProps) {
  return (
    <Badge
      variant="outline"
      className={cn(PILL_CLASSES, HUB_STATUS_TONE_CLASSES[TONE_BY_LEVEL[level]], className)}
    >
      {level}
    </Badge>
  );
}

export type EmployeeRolePillProps = {
  role: EmployeeRoleName;
  className?: string;
};

/**
 * The grey role tag beside a person's status in the detail panel. Neutral on
 * purpose: a role is a fact about the person, not a state anyone should read as
 * good or bad.
 */
export function EmployeeRolePill({ role, className }: EmployeeRolePillProps) {
  return (
    <Badge
      variant="outline"
      className={cn(PILL_CLASSES, HUB_STATUS_TONE_CLASSES.neutral, className)}
    >
      {role}
    </Badge>
  );
}
