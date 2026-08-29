import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Business applications — currently a single Applications tab, reviewing
 * self-serve logistics-company fleet registrations. The tab list itself lives
 * in `@/components/admin/admin-nav` so the sidebar and this strip can never
 * disagree; see `AdminSectionLayout` for the role gate it applies.
 */
export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="business">{children}</AdminSectionLayout>
  );
}
