import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Pricing — wraps its tabs (Vehicle tariffs, Helper tariffs, Route
 * allowances, General, Quote simulator) around whichever leaf page is being
 * viewed. The tab list itself lives in `@/components/admin/admin-nav` so the
 * sidebar and this strip can never disagree; see `AdminSectionLayout` for the
 * role gate it applies. The real boundary is the `FINANCE_MANAGER` check every
 * `/api/admin/pricing/*` route makes.
 */
export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="pricing">{children}</AdminSectionLayout>
  );
}
