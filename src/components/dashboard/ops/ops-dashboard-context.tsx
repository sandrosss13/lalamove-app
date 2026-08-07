"use client";

import { createContext, useContext } from "react";

/**
 * Which slide-over is open, if any. Drawers are addressed by the id of the row
 * that opened them rather than by a copy of the row itself, so the shell always
 * reads the freshest object out of the server-rendered data after a refresh.
 */
export type OpsDrawerState =
  | { type: "order"; id: string }
  | { type: "driver"; id: string }
  | { type: "add-vehicle" }
  | { type: "add-driver" }
  | null;

export type OpsToastState = {
  message: string;
  tone: "success" | "error";
} | null;

export type OpsDashboardContextValue = {
  openDrawer: (drawer: OpsDrawerState) => void;
  closeDrawer: () => void;
  activeDrawer: OpsDrawerState;
  showToast: (message: string, tone?: "success" | "error") => void;
};

/**
 * The cross-cutting UI actions every leaf of the dashboard needs (open/close a
 * drawer, raise a toast), shared through context so tabs, rows and mutation
 * wrappers do not have to prop-drill them down through six tab panels.
 */
export const OpsDashboardContext =
  createContext<OpsDashboardContextValue | null>(null);

/** Throws if used outside `OpsDashboardShell` — every consumer lives inside it. */
export function useOpsDashboard(): OpsDashboardContextValue {
  const ctx = useContext(OpsDashboardContext);
  if (!ctx) {
    throw new Error("useOpsDashboard must be used within OpsDashboardShell.");
  }
  return ctx;
}
