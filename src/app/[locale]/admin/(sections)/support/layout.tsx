import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Support — the messages drivers send from the app's Support screen. The tab
 * list itself lives in `@/components/admin/admin-nav` so the sidebar and this
 * strip can never disagree; see `AdminSectionLayout` for the role gate it
 * applies.
 */
export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="support">{children}</AdminSectionLayout>
  );
}
