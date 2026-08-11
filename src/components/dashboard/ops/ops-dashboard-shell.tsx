"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CompanyDashboardData } from "@/lib/company-dashboard-data";
import {
  OpsDashboardContext,
  type OpsDrawerState,
  type OpsToastState,
} from "@/components/dashboard/ops/ops-dashboard-context";
import { OpsSidebar } from "@/components/dashboard/ops/ops-sidebar";
import { OpsToast } from "@/components/dashboard/ops/ops-toast";
import { OpsOverviewTab } from "@/components/dashboard/ops/ops-overview-tab";
import { OpsOrdersTab } from "@/components/dashboard/ops/ops-orders-tab";
import { OpsRevenueTab } from "@/components/dashboard/ops/ops-revenue-tab";
import { OpsFleetTab } from "@/components/dashboard/ops/ops-fleet-tab";
import { OpsDriversTab } from "@/components/dashboard/ops/ops-drivers-tab";
import { OpsVehiclesTab } from "@/components/dashboard/ops/ops-vehicles-tab";
import { OrderDetailDrawer } from "@/components/dashboard/ops/drawers/order-detail-drawer";
import { DriverDetailDrawer } from "@/components/dashboard/ops/drawers/driver-detail-drawer";
import { AddVehicleDrawer } from "@/components/dashboard/ops/drawers/add-vehicle-drawer";
import { AddDriverDrawer } from "@/components/dashboard/ops/drawers/add-driver-drawer";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "revenue", label: "Revenue" },
  { id: "fleet", label: "Fleet" },
  { id: "drivers", label: "Drivers" },
  { id: "vehicles", label: "Vehicles" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_SUBTITLES: Record<TabId, string> = {
  overview: "Fleet-wide performance at a glance",
  orders: "Manage deliveries across your fleet",
  revenue: "Earnings, breakdowns and driver payouts",
  fleet: "Drivers and vehicle status",
  drivers: "Roster, contact info and account status",
  vehicles: "Register vehicles and assign them to drivers",
};

/** How long a toast stays on screen before it dismisses itself, in ms. */
const TOAST_DURATION_MS = 2400;

/**
 * The client half of the ops dashboard: it owns every piece of UI state (active
 * tab, open drawer, current toast) and renders the chrome around whichever tab
 * is selected.
 *
 * All data arrives pre-fetched from the server component in one object, so tab
 * switching is instant — no navigation, no second round-trip. Each tab is handed
 * only the slice of `data` it needs; keep that convention as the real tabs land.
 */
export function OpsDashboardShell({ data }: { data: CompanyDashboardData }) {
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

  return (
    <OpsDashboardContext.Provider value={contextValue}>
      <div className="flex h-screen w-full overflow-hidden">
        <OpsSidebar
          companyName={data.company.companyName}
          companyCity={data.company.city}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabId)}
          tabs={TABS}
        />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-[66px] flex-shrink-0 items-center justify-between border-b border-ops-border px-8">
            <div>
              <div className="text-[19px] font-semibold">
                {TABS.find((tab) => tab.id === activeTab)?.label}
              </div>
              <div className="mt-0.5 text-[13px] text-ops-text-muted">
                {TAB_SUBTITLES[activeTab]}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-6 pb-16">
            {activeTab === "overview" ? (
              <OpsOverviewTab overview={data.overview} />
            ) : null}
            {activeTab === "orders" ? (
              <OpsOrdersTab orders={data.orders} />
            ) : null}
            {activeTab === "revenue" ? (
              <OpsRevenueTab revenue={data.revenue} />
            ) : null}
            {activeTab === "fleet" ? (
              <OpsFleetTab drivers={data.drivers} />
            ) : null}
            {activeTab === "drivers" ? (
              <OpsDriversTab drivers={data.drivers} />
            ) : null}
            {activeTab === "vehicles" ? (
              <OpsVehiclesTab fleet={data.fleet} drivers={data.drivers} />
            ) : null}
          </div>
        </div>
      </div>

      {/* Drawers resolve their row by id at render time rather than capturing it
          when opened, so a `router.refresh()` behind an open drawer updates it. */}
      {activeDrawer?.type === "order" ? (
        <OrderDetailDrawer
          order={
            data.orders.find((order) => order.id === activeDrawer.id) ?? null
          }
          drivers={data.drivers}
          fleet={data.fleet}
        />
      ) : null}
      {activeDrawer?.type === "driver" ? (
        <DriverDetailDrawer
          driver={
            data.drivers.find((driver) => driver.userId === activeDrawer.id) ??
            null
          }
        />
      ) : null}
      {activeDrawer?.type === "add-vehicle" ? <AddVehicleDrawer /> : null}
      {activeDrawer?.type === "add-driver" ? (
        <AddDriverDrawer fleet={data.fleet} />
      ) : null}

      <OpsToast toast={toast} />
    </OpsDashboardContext.Provider>
  );
}
