"use client";

import * as React from "react";

import { useHubSubtitle } from "@/components/driver-hub/driver-hub-shell";
import {
  FilterStrip,
  HubCard,
  HubEmptyState,
  HubStatusBadge,
  MasterDetailSplit,
  MetricTile,
  SampleNote,
  type FilterStripItem,
} from "@/components/driver-hub/hub-primitives";
import { EmployeeDetailPanel } from "@/components/driver-hub/screens/employees-detail-panel";
import { EmployeeInviteForm } from "@/components/driver-hub/screens/employees-invite-form";
import { EmployeeRoleDefinitions } from "@/components/driver-hub/screens/employees-role-definitions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HubEmployeesData } from "@/lib/dashboard/hub/employees";
import { cn } from "@/lib/utils";

/**
 * Employees & roles — who works for this fleet, and what each of them may do.
 *
 * ## Two kinds of content, kept apart on purpose
 *
 * The company name in the subhead is real. **Everything else about the people
 * is invented**: there is no `Employee` model, so the roster, the four tiles
 * and both mutations are placeholders, and the screen says so twice — once in a
 * banner above the tiles, once on the roster card itself.
 *
 * The **role definitions** are not placeholders. The five roles and their
 * Manage/View/None matrices are the product's access-control design; they sit
 * in `sample.ts` only because no table exists to hold them yet.
 * `HubEmployeesData` hands them over in their own field so this screen can
 * render them as what they are — an un-badged section of real product content,
 * and the source of the permission rows in the detail panel and the role rows
 * in the invite form.
 *
 * Conflating the two would be the one mistake here that actually misleads: an
 * operator who writes off the permission matrix as filler has written off the
 * real thing.
 *
 * ## Nothing here writes
 *
 * `mutationsEnabled` is the literal `false`. The invite form and the remove
 * action are therefore rendered in full and visibly disabled, each with a plain
 * note wired up through `aria-describedby`. A control that accepted a name, an
 * email and a role and then dropped all three would be worse than no control.
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                    */
/* -------------------------------------------------------------------------- */

const EMPLOYEE_TABS = [
  { value: "All", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Invited", label: "Invited" },
  { value: "Suspended", label: "Suspended" },
] as const satisfies readonly FilterStripItem[];

type EmployeesTab = (typeof EMPLOYEE_TABS)[number]["value"];

/** `FilterStrip` hands back a plain string; this is the narrowing back. */
function isEmployeesTab(value: string): value is EmployeesTab {
  return EMPLOYEE_TABS.some((tab) => tab.value === value);
}

/* -------------------------------------------------------------------------- */
/* Table geometry                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The design's data table is a CSS grid, not a `<table>` layout — fractional
 * and fixed columns side by side, which no table-layout algorithm reproduces.
 * So the rows are grids and the table element is a block, and every table role
 * is stated explicitly: a `display` other than `table` is enough for some
 * browsers to drop the implicit roles, and this *is* tabular data.
 *
 * Columns are static class strings rather than an inline `gridTemplateColumns`
 * so Tailwind can see them at build time.
 */
const COLUMNS_FULL = "grid-cols-[1.4fr_130px_1fr_130px_110px] min-w-[780px]";
const COLUMNS_SPLIT = "grid-cols-[1.6fr_110px_110px] min-w-[400px]";

const HEAD_CLASSES =
  "h-auto px-0 pb-2.5 text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground";
const CELL_CLASSES = "min-w-0 px-0 py-3.5";

/* -------------------------------------------------------------------------- */
/* Honesty copy                                                               */
/* -------------------------------------------------------------------------- */

/** What would make the roster real, shown on every `<SampleNote />` here. */
const ROSTER_SAMPLE_NOTE =
  "No employee record exists in the schema yet — the roster, the counts and " +
  "both actions are placeholders. The role definitions below are real.";

export type EmployeesScreenProps = {
  data: HubEmployeesData;
};

export function EmployeesScreen({ data }: EmployeesScreenProps) {
  const { subhead, roster, tiles, roleDefinitions } = data;

  const [tab, setTab] = React.useState<EmployeesTab>("All");
  const [selectedEmail, setSelectedEmail] = React.useState<string | null>(null);
  const [inviting, setInviting] = React.useState(false);

  useHubSubtitle(
    `${subhead.companyName} · ${subhead.peopleCount} ${plural(
      subhead.peopleCount,
      "person",
      "people",
    )}, ${subhead.roleCount} ${plural(subhead.roleCount, "role", "roles")} · ${
      subhead.invitesPendingCount
    } ${plural(
      subhead.invitesPendingCount,
      "invite",
      "invites",
    )} pending`,
  );

  // The rail shows one thing at a time, and the invite form wins: opening it
  // clears the selection, and picking a person closes it.
  const selectedPerson = inviting
    ? null
    : (roster.find((person) => person.email === selectedEmail) ?? null);

  const visible =
    tab === "All" ? roster : roster.filter((person) => person.status === tab);

  const selectPerson = React.useCallback((email: string) => {
    setSelectedEmail(email);
    setInviting(false);
  }, []);

  const closeDetail = React.useCallback(() => {
    setSelectedEmail(null);
    setInviting(false);
  }, []);

  // In the split state the table drops Scope and Last active, per the handoff.
  const split = inviting || selectedPerson !== null;
  const columns = split ? COLUMNS_SPLIT : COLUMNS_FULL;

  const detail = inviting ? (
    <EmployeeInviteForm roles={roleDefinitions} onCancel={closeDetail} />
  ) : selectedPerson ? (
    <EmployeeDetailPanel person={selectedPerson} />
  ) : undefined;

  const detailLabel = inviting
    ? "the invite employee form"
    : `${selectedPerson?.name ?? "employee"} details`;

  return (
    <>
      {/*
        The prominent marker. One banner for the whole fictional half of the
        screen beats a badge on every tile and every row: the roster is not
        partly invented, it is entirely invented, and saying that once — while
        naming what *is* real — is the honest version.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-border px-4 py-3.5">
        <SampleNote label="Sample roster" note={ROSTER_SAMPLE_NOTE} />
        <p className="min-w-0 flex-1 text-[13px] leading-normal text-muted-foreground">
          There is no employee record in the system yet, so the counts and the
          people below are invented — nobody has been invited and nothing here
          grants access. The role definitions further down are the real product
          content.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Employees"
          value={tiles.employees.value}
          note={tiles.employees.note}
        />
        <MetricTile
          label="Roles in use"
          value={tiles.rolesInUse.value}
          note={tiles.rolesInUse.note}
        />
        <MetricTile
          label="Can move money"
          value={tiles.canMoveMoney.value}
          note={tiles.canMoveMoney.note}
        />
        <MetricTile
          label="Needs review"
          value={tiles.needsReview.value}
          note={tiles.needsReview.note}
        />
      </div>

      <MasterDetailSplit
        detailLabel={detailLabel}
        detail={detail}
        onCloseDetail={closeDetail}
        master={
          <HubCard>
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <FilterStrip
                items={EMPLOYEE_TABS}
                value={tab}
                onChange={(next) => {
                  if (isEmployeesTab(next)) {
                    setTab(next);
                  }
                }}
                ariaLabel="Filter employees by status"
              />
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                {/* Repeated here so the table carries its own marker for
                    anyone who scrolls straight to it. */}
                <SampleNote label="Sample roster" note={ROSTER_SAMPLE_NOTE} />
                <span className="text-xs text-muted-foreground">
                  <span className="font-price">{visible.length}</span> of{" "}
                  <span className="font-price">{roster.length}</span> shown
                </span>
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setInviting(true);
                    setSelectedEmail(null);
                  }}
                  className="h-auto rounded-md px-[14px] py-2 text-[13px]"
                >
                  Invite employee
                </Button>
              </div>
            </div>

            {/* `Table` brings its own `overflow-x-auto` wrapper — the min-width
                below is what makes that wrapper scroll on a narrow pane. */}
            <Table role="table" className={cn("block", columns)}>
              <TableHeader role="rowgroup" className="block">
                <TableRow
                  role="row"
                  className={cn(
                    "grid items-center gap-3 border-b border-border hover:bg-transparent",
                    columns,
                  )}
                >
                  <TableHead role="columnheader" className={HEAD_CLASSES}>
                    Person
                  </TableHead>
                  <TableHead role="columnheader" className={HEAD_CLASSES}>
                    Role
                  </TableHead>
                  {split ? null : (
                    <>
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        Scope
                      </TableHead>
                      <TableHead role="columnheader" className={HEAD_CLASSES}>
                        Last active
                      </TableHead>
                    </>
                  )}
                  <TableHead
                    role="columnheader"
                    className={cn(HEAD_CLASSES, "text-right")}
                  >
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody role="rowgroup" className="block">
                {visible.map((person) => {
                  const selected = person.email === selectedPerson?.email;

                  return (
                    <TableRow
                      key={person.email}
                      role="row"
                      // Mouse convenience only — the keyboard path is the
                      // button in the Person cell, which does the same thing.
                      onClick={() => selectPerson(person.email)}
                      data-state={selected ? "selected" : undefined}
                      className={cn(
                        "grid cursor-pointer items-center gap-3 border-b border-muted text-sm",
                        columns,
                      )}
                    >
                      <TableCell role="cell" className={CELL_CLASSES}>
                        <button
                          type="button"
                          onClick={() => selectPerson(person.email)}
                          aria-current={selected ? "true" : undefined}
                          className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="block truncate font-medium">
                            {person.name}
                          </span>
                          {/* An address is a value, so it is mono. */}
                          <span className="mt-0.5 block truncate font-price text-[11px] text-muted-foreground">
                            {person.email}
                          </span>
                        </button>
                      </TableCell>

                      <TableCell
                        role="cell"
                        className={cn(CELL_CLASSES, "truncate text-[13px]")}
                      >
                        {person.role}
                      </TableCell>

                      {split ? null : (
                        <>
                          <TableCell
                            role="cell"
                            className={cn(
                              CELL_CLASSES,
                              "truncate text-[13px] text-muted-foreground",
                            )}
                          >
                            {person.scope}
                          </TableCell>
                          <TableCell
                            role="cell"
                            className={cn(
                              CELL_CLASSES,
                              "truncate font-price text-[13px] text-muted-foreground",
                            )}
                          >
                            {person.lastActive}
                          </TableCell>
                        </>
                      )}

                      <TableCell
                        role="cell"
                        className={cn(CELL_CLASSES, "text-right")}
                      >
                        <HubStatusBadge status={person.status} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {visible.length === 0 ? (
              <HubEmptyState message={`No ${tab.toLowerCase()} employees.`} />
            ) : null}
          </HubCard>
        }
      />

      <EmployeeRoleDefinitions roles={roleDefinitions} />
    </>
  );
}

/** Singular/plural for the three counts in the header subhead. */
function plural(count: number, singular: string, many: string): string {
  return count === 1 ? singular : many;
}
