import type { LucideIcon } from "lucide-react";
import {
  ChartColumn,
  CreditCard,
  FileText,
  Megaphone,
  Users,
} from "lucide-react";

import type { AdminRole } from "@prisma/client";

/**
 * The complete information architecture of the admin back office.
 *
 * This file is intentionally finished: every section and every leaf route the
 * back office will ever have (for this spec) is listed here already, even
 * though most of the leaf `page.tsx` files land in later, parallel tasks. That
 * way no later task has to edit a shared file to register itself — it only adds
 * its own page and API routes — so those tasks never conflict with each other.
 * Until a leaf's own task lands, its link simply 404s, which is the normal
 * state of a not-yet-built route.
 *
 * `adminRoles` drives which links a staff member sees. That is a *cosmetic*
 * filter only: `hasAdminRole()` in `@/lib/admin/auth` is the real boundary and
 * every admin action/API route has to call it server-side, since hiding a link
 * does nothing about a hand-typed URL. `SUPER_ADMIN` is listed explicitly on
 * every entry for readability, and `hasAdminRole()` additionally lets it
 * through unconditionally.
 */

/** A leaf link — one tab inside a section. */
export type AdminNavItem = {
  label: string;
  href: string;
  adminRoles: AdminRole[];
};

/**
 * Stable identifiers for the five sections, so a section's `layout.tsx` can
 * ask for its own tabs by name instead of restating them.
 */
export type AdminNavSectionId =
  "analytics" | "users" | "content" | "finance" | "crm";

/** A top-level sidebar entry. */
export type AdminNavSection = {
  id: AdminNavSectionId;
  label: string;
  /**
   * Where clicking the section header goes. For sections with tabs this is the
   * first tab, so the section is never a dead end.
   */
  href: string;
  icon: LucideIcon;
  /**
   * Roles that can see the section at all. Always a superset of the union of
   * its items' roles — an item may narrow further (System Users is
   * `SUPER_ADMIN`-only inside a section two other roles can open) but never
   * widen.
   */
  adminRoles: AdminRole[];
  /** Sub-navigation, rendered as tabs by the section's own `layout.tsx`. */
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    id: "analytics",
    label: "Sales Analytics",
    href: "/admin/analytics",
    icon: ChartColumn,
    adminRoles: ["SUPER_ADMIN", "ANALYTICS"],
    // A single page rather than a tab group, so it has no sub-navigation.
    items: [],
  },
  {
    id: "users",
    label: "User Management",
    href: "/admin/users/clients",
    icon: Users,
    // SUPPORT is included because answering a customer ticket needs to read
    // the account it is about; the write actions inside are gated separately.
    adminRoles: ["SUPER_ADMIN", "USER_MANAGER", "SUPPORT"],
    items: [
      {
        label: "Clients",
        href: "/admin/users/clients",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER", "SUPPORT"],
      },
      {
        label: "Sellers",
        href: "/admin/users/sellers",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER", "SUPPORT"],
      },
      {
        // Creating and deactivating internal staff accounts is the one thing
        // no delegated role gets — it would let a USER_MANAGER mint itself a
        // SUPER_ADMIN.
        label: "System Users",
        href: "/admin/users/system",
        adminRoles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    id: "content",
    label: "Content Management",
    href: "/admin/content/banners",
    icon: FileText,
    adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
    items: [
      {
        label: "Banners",
        href: "/admin/content/banners",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Static Pages",
        href: "/admin/content/pages",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Translations",
        href: "/admin/content/translations",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Messaging Templates",
        href: "/admin/content/messaging-templates",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Home Page",
        href: "/admin/content/home-page",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
    ],
  },
  {
    id: "finance",
    label: "Finances",
    href: "/admin/finance/payment-methods",
    icon: CreditCard,
    adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
    items: [
      {
        label: "Payment Methods",
        href: "/admin/finance/payment-methods",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Promo Campaigns",
        href: "/admin/finance/promo-campaigns",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    href: "/admin/crm/segments",
    icon: Megaphone,
    adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
    items: [
      {
        label: "Segments",
        href: "/admin/crm/segments",
        adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
      },
      {
        label: "Surveys",
        href: "/admin/crm/surveys",
        adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
      },
      {
        label: "Campaigns",
        href: "/admin/crm/campaigns",
        adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
      },
    ],
  },
];

/**
 * The section with the given id. Used by the section `layout.tsx` files to
 * render their tab sub-nav, so the tabs are declared once — here — rather than
 * duplicated between the sidebar and each layout.
 *
 * Throws rather than returning `undefined` because the id is a closed union
 * checked at compile time: a miss would mean this file and its own type had
 * drifted apart, which is a bug, not a runtime condition to handle.
 */
export function adminNavSection(id: AdminNavSectionId): AdminNavSection {
  const section = ADMIN_NAV.find((candidate) => candidate.id === id);

  if (!section) {
    throw new Error(`[admin-nav] No section registered for id "${id}".`);
  }

  return section;
}
