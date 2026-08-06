"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { useOpsDashboard } from "@/components/dashboard/ops/ops-dashboard-context";

/**
 * Generic slide-over chrome shared by every drawer in the dashboard: backdrop,
 * title row with a close button, and dismissal on `Escape` or a backdrop click.
 * Each drawer supplies only its own body, so all three stay consistent and none
 * of them re-implements focus/dismiss behaviour.
 */
export function OpsDrawerShell({
  title,
  widthClassName = "w-[420px]",
  children,
}: {
  title: string;
  widthClassName?: string;
  children: ReactNode;
}) {
  const { closeDrawer } = useOpsDashboard();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer]);

  return (
    <>
      {/* Dismissal is also on Escape and the close button above, so this
          backdrop is a redundant affordance rather than the only way out. */}
      <div
        onClick={closeDrawer}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/55"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-ops-drawer-in fixed top-0 right-0 z-41 h-full ${widthClassName} overflow-y-auto border-l border-ops-border bg-ops-surface p-6.5`}
      >
        <div className="mb-4.5 flex items-start justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button
            type="button"
            onClick={closeDrawer}
            className="p-1 text-xl leading-none text-ops-text-muted"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
