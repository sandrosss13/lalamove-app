import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Calculator,
  ChartColumn,
  CreditCard,
  FileText,
  LifeBuoy,
  Megaphone,
  Package,
  Truck,
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
  /** English source copy — kept for non-rendering uses (logs, tests). */
  label: string;
  /**
   * Full `next-intl` message path for `label`, resolved with an un-namespaced
   * `useTranslations()` / `getTranslations()` where the link is rendered. A
   * key rather than translated text because this module is a plain constant,
   * evaluated once, with no request locale to translate into.
   */
  labelKey: string;
  href: string;
  adminRoles: AdminRole[];
};

/**
 * Stable identifiers for the sections, so a section's `layout.tsx` can
 * ask for its own tabs by name instead of restating them.
 */
export type AdminNavSectionId =
  | "analytics"
  | "orders"
  | "users"
  | "content"
  | "finance"
  | "pricing"
  | "crm"
  | "drivers"
  | "business"
  | "support";

/** A top-level sidebar entry. */
export type AdminNavSection = {
  id: AdminNavSectionId;
  /** English source copy — kept for non-rendering uses (logs, tests). */
  label: string;
  /**
   * Full `next-intl` message path for `label`, resolved with an un-namespaced
   * `useTranslations()` / `getTranslations()` where the link is rendered. A
   * key rather than translated text because this module is a plain constant,
   * evaluated once, with no request locale to translate into.
   */
  labelKey: string;
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
    labelKey: "admin.adminNav.salesAnalytics",
    href: "/admin/analytics",
    icon: ChartColumn,
    adminRoles: ["SUPER_ADMIN", "ANALYTICS"],
    // A single page rather than a tab group, so it has no sub-navigation.
    items: [],
  },
  {
    id: "orders",
    label: "Orders",
    labelKey: "admin.adminNav.orders",
    href: "/admin/orders",
    icon: Package,
    // Read-only oversight of every order on the platform: its client, route,
    // cargo photos and payment. SUPPORT is here because "where is my order?"
    // is the ticket it answers most; USER_MANAGER because it already reads the
    // client and driver accounts an order ties together. Neither gets anything
    // to change — the section has no write actions at all. FINANCE_MANAGER and
    // ANALYTICS are deliberately absent: the detail page carries client contact
    // details and cargo photos, which their aggregate work does not need.
    adminRoles: ["SUPER_ADMIN", "SUPPORT", "USER_MANAGER"],
    // A list and its detail page rather than a tab group. The section gates
    // itself in `src/app/[locale]/admin/orders/layout.tsx`, as Sales
    // Analytics does, since it sits outside the `(sections)` group.
    items: [],
  },
  {
    id: "users",
    label: "User Management",
    labelKey: "admin.adminNav.userManagement",
    href: "/admin/users/clients",
    icon: Users,
    // SUPPORT is included because answering a customer ticket needs to read
    // the account it is about; the write actions inside are gated separately.
    adminRoles: ["SUPER_ADMIN", "USER_MANAGER", "SUPPORT"],
    items: [
      {
        label: "Clients",
        labelKey: "admin.adminNav.clients",
        href: "/admin/users/clients",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER", "SUPPORT"],
      },
      {
        label: "Sellers",
        labelKey: "admin.adminNav.sellers",
        href: "/admin/users/sellers",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER", "SUPPORT"],
      },
      {
        // Creating and deactivating internal staff accounts is the one thing
        // no delegated role gets — it would let a USER_MANAGER mint itself a
        // SUPER_ADMIN.
        label: "System Users",
        labelKey: "admin.adminNav.systemUsers",
        href: "/admin/users/system",
        adminRoles: ["SUPER_ADMIN"],
      },
    ],
  },
  {
    id: "content",
    label: "Content Management",
    labelKey: "admin.adminNav.contentManagement",
    href: "/admin/content/banners",
    icon: FileText,
    adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
    items: [
      {
        label: "Banners",
        labelKey: "admin.adminNav.banners",
        href: "/admin/content/banners",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Static Pages",
        labelKey: "admin.adminNav.staticPages",
        href: "/admin/content/pages",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Translations",
        labelKey: "admin.adminNav.translations",
        href: "/admin/content/translations",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Messaging Templates",
        labelKey: "admin.adminNav.messagingTemplates",
        href: "/admin/content/messaging-templates",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        label: "Home Page",
        labelKey: "admin.adminNav.homePage",
        href: "/admin/content/home-page",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        // The marketing photo on each `VehicleTypeSpec`, and nothing else about
        // one: payload and dimensions are operational data that drives order
        // matching, so they stay out of the back office entirely. Its tariff
        // is edited under Pricing, by the finance role, not here.
        label: "Vehicle Photos",
        labelKey: "admin.adminNav.vehiclePhotos",
        href: "/admin/content/vehicle-photos",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
      {
        // The goods-first booking item list (`ItemCatalogEntry`): labels,
        // synonyms and the typical figures each item feeds into the load plan.
        // Content, like the vehicle photos above, because it is curated by
        // the same editors; entries are deactivated, never deleted.
        label: "Item Catalogue",
        labelKey: "admin.adminNav.itemCatalogue",
        href: "/admin/content/item-catalogue",
        adminRoles: ["SUPER_ADMIN", "CONTENT_MANAGER"],
      },
    ],
  },
  {
    id: "finance",
    label: "Finances",
    labelKey: "admin.adminNav.finances",
    href: "/admin/finance/payment-methods",
    icon: CreditCard,
    adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
    items: [
      {
        label: "Payment Methods",
        labelKey: "admin.adminNav.paymentMethods",
        href: "/admin/finance/payment-methods",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Promo Campaigns",
        labelKey: "admin.adminNav.promoCampaigns",
        href: "/admin/finance/promo-campaigns",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        // The driver wallet's three back-office surfaces. Verifying where
        // money is sent, sending it, and reading the ledger are all the
        // finance role's work; the one narrower action — a manual adjustment —
        // is gated to SUPER_ADMIN by its own API route, not by this list.
        label: "Bank accounts",
        labelKey: "admin.adminNav.bankAccounts",
        href: "/admin/finance/bank-accounts",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Withdrawals",
        labelKey: "admin.adminNav.withdrawals",
        href: "/admin/finance/withdrawals",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Driver wallets",
        labelKey: "admin.adminNav.driverWallets",
        href: "/admin/finance/wallets",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
    ],
  },
  {
    // Pricing model v1's tariff: per-vehicle rates and commission, helper
    // floor bands and rules, per-city-pair return allowances, and the
    // platform-wide thresholds — plus a read-only quote simulator. The same
    // roles as Finances, since the tariff decides what clients pay and what
    // the platform keeps. Every save bumps `PricingConfig.tariffVersion` and
    // is audit-logged; see `src/app/api/admin/pricing/`.
    id: "pricing",
    label: "Pricing",
    labelKey: "admin.adminNav.pricing",
    href: "/admin/pricing/vehicles",
    icon: Calculator,
    adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
    items: [
      {
        label: "Vehicle tariffs",
        labelKey: "admin.adminNav.vehicleTariffs",
        href: "/admin/pricing/vehicles",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Helper tariffs",
        labelKey: "admin.adminNav.helperTariffs",
        href: "/admin/pricing/helpers",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Route allowances",
        labelKey: "admin.adminNav.routeAllowances",
        href: "/admin/pricing/routes",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "General",
        labelKey: "admin.adminNav.pricingGeneral",
        href: "/admin/pricing/general",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
      {
        label: "Quote simulator",
        labelKey: "admin.adminNav.quoteSimulator",
        href: "/admin/pricing/simulator",
        adminRoles: ["SUPER_ADMIN", "FINANCE_MANAGER"],
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    labelKey: "admin.adminNav.crm",
    href: "/admin/crm/segments",
    icon: Megaphone,
    adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
    items: [
      {
        label: "Segments",
        labelKey: "admin.adminNav.segments",
        href: "/admin/crm/segments",
        adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
      },
      {
        label: "Surveys",
        labelKey: "admin.adminNav.surveys",
        href: "/admin/crm/surveys",
        adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
      },
      {
        label: "Campaigns",
        labelKey: "admin.adminNav.campaigns",
        href: "/admin/crm/campaigns",
        adminRoles: ["SUPER_ADMIN", "CRM_MANAGER"],
      },
    ],
  },
  {
    id: "drivers",
    label: "Drivers",
    labelKey: "common.shared.drivers",
    href: "/admin/drivers/applications",
    icon: Truck,
    // USER_MANAGER is the reviewing role for self-serve driver onboarding.
    // SUPPORT is deliberately absent, unlike User Management: approving a
    // driver's compliance documents is a different responsibility from reading
    // a customer account to answer a ticket.
    adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
    items: [
      {
        label: "Applications",
        labelKey: "admin.adminNav.applications",
        href: "/admin/drivers/applications",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
      },
      {
        // Vehicle registration, uploaded and renewed after onboarding.
        // The same reviewers as the application's own documents.
        label: "Vehicle documents",
        labelKey: "admin.adminNav.vehicleDocuments",
        href: "/admin/drivers/documents",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
      },
    ],
  },
  {
    id: "business",
    label: "Business applications",
    labelKey: "admin.adminNav.businessApplications",
    href: "/admin/business/applications",
    icon: Building2,
    // The same two roles that review individual driver applications. A fleet
    // application carries a company's VAT id, registered address and payout
    // IBAN, so read access is scoped to the roles that hold the review actions
    // — SUPPORT is deliberately absent here for the same reason it is absent
    // from Drivers.
    adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
    items: [
      {
        label: "Applications",
        labelKey: "admin.adminNav.applications",
        href: "/admin/business/applications",
        adminRoles: ["SUPER_ADMIN", "USER_MANAGER"],
      },
    ],
  },
  {
    id: "support",
    label: "Support",
    labelKey: "admin.adminNav.support",
    href: "/admin/support/messages",
    icon: LifeBuoy,
    // Its own section rather than a tab under Drivers: Drivers deliberately
    // excludes `SUPPORT` (reviewing compliance documents is not answering a
    // ticket), and a section's roles must be a superset of its items'. Reading
    // and resolving a driver's message *is* the `SUPPORT` role's job, so it
    // gets a section that role can open. `USER_MANAGER` is included because a
    // message is often about the account or documents that role manages.
    adminRoles: ["SUPER_ADMIN", "SUPPORT", "USER_MANAGER"],
    items: [
      {
        label: "Driver messages",
        labelKey: "admin.adminNav.driverMessages",
        href: "/admin/support/messages",
        adminRoles: ["SUPER_ADMIN", "SUPPORT", "USER_MANAGER"],
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
