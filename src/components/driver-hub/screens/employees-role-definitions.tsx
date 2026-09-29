import { useTranslations } from "next-intl";

import { HubCard } from "@/components/driver-hub/hub-primitives";
import { useHubStatusLabel } from "@/components/driver-hub/use-hub-status-label";
import { EmployeePermissionPill } from "@/components/driver-hub/screens/employees-permission-pill";
import type { EmployeeRoleDefinition } from "@/lib/dashboard/hub/sample";

/**
 * The five roles and exactly what each one may do.
 *
 * **This section carries no sample badge, and that is deliberate.** Everything
 * else on the Employees screen — the tiles, the roster, the invite flow — is
 * invented, because no `Employee` model exists yet. The role definitions are
 * not: they are the product's access-control design, written down. They live in
 * `sample.ts` only because there is no `EmployeeRole` table to hold them, and
 * `getHubEmployees()` hands them over in their own field so this distinction
 * survives the trip to the client.
 *
 * Badging them "Sample data" would tell an operator that the permission model
 * is provisional. It is not — only the people holding those permissions are.
 *
 * The matrix is drawn as one block per role rather than a roles × areas grid
 * because the areas are not shared: an Accountant is scoped over "Invoices &
 * tax" and a Mechanic over "Service log", so a single table would be mostly
 * empty cells.
 */

export type EmployeeRoleDefinitionsProps = {
  roles: readonly EmployeeRoleDefinition[];
};

export function EmployeeRoleDefinitions({
  roles,
}: EmployeeRoleDefinitionsProps) {
  const t = useTranslations("driverHub.employeesRoleDefinitions");
  const roleLabel = useHubStatusLabel();

  return (
    <HubCard title={t("roleDefinitions")} action={t("appliesToEveryEmployee")}>
      <p className="max-w-[70ch] text-[13px] leading-normal text-muted-foreground">
        {t("intro")}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.map((definition) => (
          <div
            key={definition.role}
            className="min-w-0 rounded-[10px] border border-border p-4"
          >
            <h3 className="text-[13px] font-semibold">
              {roleLabel(definition.role)}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {definition.summary}
            </p>

            <dl className="mt-3">
              {definition.permissions.map((permission) => (
                <div
                  key={permission.area}
                  className="flex items-center justify-between gap-3 border-t border-muted py-2 text-[13px]"
                >
                  <dt className="min-w-0 truncate">{permission.area}</dt>
                  <dd className="flex-none">
                    <EmployeePermissionPill level={permission.level} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </HubCard>
  );
}
