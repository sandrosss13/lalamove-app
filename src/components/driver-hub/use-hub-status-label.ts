import { useTranslations } from "next-intl";

/**
 * The display label for a hub status word — or another sampled identifier
 * (an employee role, a permission level) — in the active locale.
 *
 * The hub's status words ("Online", "Suspended", "Paid", …) are identifiers as
 * well as copy: screens filter and switch on the English values, and
 * `hubStatusTone()` picks a pill colour from them. So the words stay English in
 * the data, and this translates one only at the point it is shown — typically
 * as `HubStatusBadge`'s `label`, next to the untouched `status` that drives its
 * tone.
 *
 * Keys are root-relative. A word with no entry here is returned unchanged, so
 * a new status renders in English rather than as a missing key.
 */
const STATUS_LABEL_KEYS: Readonly<Record<string, string>> = {
  Online: "driverHub.driversScreen.online",
  Offline: "driverHub.driversScreen.offline",
  Active: "common.shared.active",
  Suspended: "common.shared.suspended",
  "In review": "dashboard.sample.inReview",
  "Not activated": "driverHub.hubStatusLabels.notActivated",
  Invited: "driverHub.employeesScreen.invited",
  Paid: "dashboard.sample.paid",
  Processing: "dashboard.sample.processing",
  Verified: "dashboard.sample.verified",
  Valid: "dashboard.sample.valid",
  Expired: "dashboard.sample.expired",
  "Expiring soon": "dashboard.sample.expiringSoon",
  // Employee role names (`EmployeeRoleName`).
  "Fleet manager": "fleet.step1CompanyDetails.fleetManager",
  Dispatcher: "dashboard.sample.dispatcher",
  Accountant: "dashboard.sample.accountant",
  Mechanic: "dashboard.sample.mechanic",
  Driver: "common.shared.driver",
  // Permission levels (`EmployeePermissionLevel`).
  Manage: "dashboard.sample.manage",
  View: "dashboard.sample.view",
  None: "dashboard.sample.none",
};

export function useHubStatusLabel(): (status: string) => string {
  const t = useTranslations();

  return (status) => {
    const key = STATUS_LABEL_KEYS[status];
    return key === undefined ? status : t(key);
  };
}
