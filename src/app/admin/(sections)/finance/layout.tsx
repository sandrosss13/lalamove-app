import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Finances — wraps its tabs (Payment Methods / Promo Campaigns) around
 * whichever leaf page is being viewed. The tab list itself lives in
 * `@/components/admin/admin-nav` so the sidebar and this strip can never
 * disagree; see `AdminSectionLayout` for the role gate it applies.
 */
export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="finance">{children}</AdminSectionLayout>
  );
}
