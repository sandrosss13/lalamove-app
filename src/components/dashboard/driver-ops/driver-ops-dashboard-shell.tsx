"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DriverDashboardData } from "@/lib/driver-dashboard-data";
import {
  OpsDashboardContext,
  type OpsDrawerState,
  type OpsToastState,
} from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsToast } from "@/components/dashboard/ops/ops-toast";
import { DriverOpsSidebar } from "@/components/dashboard/driver-ops/driver-ops-sidebar";
import { DriverOpsOverviewTab } from "@/components/dashboard/driver-ops/driver-ops-overview-tab";
import { DriverOpsDeliveriesTab } from "@/components/dashboard/driver-ops/driver-ops-deliveries-tab";
import { DriverOpsEarningsTab } from "@/components/dashboard/driver-ops/driver-ops-earnings-tab";
import { DriverOpsVehicleTab } from "@/components/dashboard/driver-ops/driver-ops-vehicle-tab";
import { DriverOrderDetailDrawer } from "@/components/dashboard/driver-ops/drawers/driver-order-detail-drawer";
import { DriverAddVehicleDrawer } from "@/components/dashboard/driver-ops/drawers/driver-add-vehicle-drawer";

type TabId = "overview" | "deliveries" | "earnings" | "vehicle";

/** Tabs every driver sees, in rail order. */
const BASE_TABS: readonly { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "deliveries", label: "Deliveries" },
  { id: "earnings", label: "Earnings" },
];

/**
 * Independent drivers only: a rostered driver never manages vehicles of their
 * own, since the fleet belongs to their company.
 */
const VEHICLE_TAB: { id: TabId; label: string } = {
  id: "vehicle",
  label: "Vehicle",
};

const TAB_SUBTITLES: Record<TabId, string> = {
  overview: "Your status at a glance",
  deliveries: "Available and assigned deliveries",
  earnings: "Your earnings over time",
  vehicle: "Manage the vehicle(s) you drive",
};

/** How long a toast stays on screen before it dismisses itself, in ms. */
const TOAST_DURATION_MS = 2400;

/**
 * The client half of the driver ops dashboard: it owns every piece of UI state
 * (active tab, open drawer, current toast) and renders the chrome around
 * whichever tab is selected.
 *
 * All data arrives pre-fetched from the server component in one object, so tab
 * switching is instant — no navigation, no second round-trip. Each tab is handed
 * only the slice of `data` it needs; keep that convention as the real tabs land.
 */
export function DriverOpsDashboardShell({
  data,
}: {
  data: DriverDashboardData;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [activeDrawer, setActiveDrawer] = useState<OpsDrawerState>(null);
  const [toast, setToast] = useState<OpsToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Clearing the previous timer first means a second toast raised while the
  // first is still showing gets a full display window, not the remainder of it.
  const showToast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      clearTimeout(toastTimer.current);
      setToast({ message, tone });
      toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    },
    [],
  );

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const openDrawer = useCallback(
    (drawer: OpsDrawerState) => setActiveDrawer(drawer),
    [],
  );
  const closeDrawer = useCallback(() => setActiveDrawer(null), []);

  // The three callbacks are stable, so this identity only changes when a drawer
  // opens or closes — an inline object literal would re-render every consumer
  // on any shell state change, including unrelated ones like the toast.
  const contextValue = useMemo(
    () => ({ openDrawer, closeDrawer, activeDrawer, showToast }),
    [openDrawer, closeDrawer, activeDrawer, showToast],
  );

  const isIndependent = data.driver.isIndependent;
  const tabs = useMemo(
    () => (isIndependent ? [...BASE_TABS, VEHICLE_TAB] : BASE_TABS),
    [isIndependent],
  );

  return (
    <OpsDashboardContext.Provider value={contextValue}>
      <div className="flex h-screen w-full overflow-hidden">
        <DriverOpsSidebar
          driverName={data.driver.name}
          driverCity={data.driver.city}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
          tabs={tabs}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[66px] flex-shrink-0 items-center justify-between border-b border-ops-border px-8">
            <div>
              <div className="text-[19px] font-semibold">
                {tabs.find((tab) => tab.id === activeTab)?.label}
              </div>
              <div className="mt-0.5 text-[13px] text-ops-text-muted">
                {TAB_SUBTITLES[activeTab]}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 pb-16">
            {activeTab === "overview" ? (
              <DriverOpsOverviewTab
                driver={data.driver}
                overview={data.overview}
              />
            ) : null}
            {activeTab === "deliveries" ? (
              <DriverOpsDeliveriesTab
                orders={data.orders}
                isIndependent={isIndependent}
              />
            ) : null}
            {activeTab === "earnings" ? (
              <DriverOpsEarningsTab earnings={data.earnings} />
            ) : null}
            {/* The `isIndependent` guard is belt-and-braces: a rostered driver
                has no Vehicle tab to click in the first place. */}
            {activeTab === "vehicle" && isIndependent ? (
              <DriverOpsVehicleTab vehicles={data.vehicles} />
            ) : null}
          </div>
        </div>
      </div>

      {/* Drawers resolve their row by id at render time rather than capturing it
          when opened, so a `router.refresh()` behind an open drawer updates it.
          Only the "order" and "add-vehicle" variants of the shared drawer state
          are ever produced here; "driver" belongs to the company console. */}
      {activeDrawer?.type === "order" ? (
        <DriverOrderDetailDrawer
          order={
            data.orders.find((order) => order.id === activeDrawer.id) ?? null
          }
          vehicles={data.vehicles}
          isIndependent={isIndependent}
        />
      ) : null}
      {activeDrawer?.type === "add-vehicle" ? <DriverAddVehicleDrawer /> : null}

      <OpsToast toast={toast} />
    </OpsDashboardContext.Provider>
  );
}
