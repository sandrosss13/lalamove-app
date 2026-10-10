import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Drivers — Applications (self-serve onboarding submissions) and Vehicle
 * documents (registration and insurance, uploaded and renewed afterwards). The tab list itself lives in
 * `@/components/admin/admin-nav` so the sidebar and this strip can never
 * disagree; see `AdminSectionLayout` for the role gate it applies.
 */
export default function DriversLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="drivers">{children}</AdminSectionLayout>
  );
}
