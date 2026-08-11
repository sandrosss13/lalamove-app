"use client";

import { formatCity } from "@/lib/format-city";

/**
 * The driver console's fixed left rail: brand mark, the tab list, and the
 * signed-in driver's identity at the foot. It owns no state — the active tab and
 * the change handler both come from `DriverOpsDashboardShell`, which is the
 * single owner of tab state.
 *
 * The tab list is a prop rather than a module constant because a rostered
 * driver's rail is one tab shorter than an independent driver's.
 */
export function DriverOpsSidebar({
  driverName,
  driverCity,
  activeTab,
  onTabChange,
  tabs,
}: {
  driverName: string;
  driverCity: string;
  activeTab: string;
  onTabChange: (id: string) => void;
  tabs: readonly { id: string; label: string }[];
}) {
  return (
    <div className="flex w-[232px] flex-shrink-0 flex-col border-r border-ops-border bg-ops-surface p-3.5">
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-ops-accent text-[15px] font-bold text-ops-accent-fg">
          W
        </div>
        <div className="text-[17px] font-semibold tracking-tight">Waypoint</div>
      </div>

      <div className="flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                active
                  ? "bg-ops-accent/20 text-ops-accent"
                  : "text-ops-text-muted hover:bg-ops-surface-raised"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${active ? "bg-ops-accent" : "bg-ops-text-muted"}`}
              />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 border-t border-ops-border px-2 pt-3.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-ops-surface-raised text-xs font-semibold">
          {driverName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{driverName}</div>
          <div className="truncate text-[11px] text-ops-text-muted">
            {formatCity(driverCity)}
          </div>
        </div>
      </div>
    </div>
  );
}
