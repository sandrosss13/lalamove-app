import { AdminSectionLayout } from "@/components/admin/admin-section-layout";

// Session + Prisma access can't be statically rendered.
export const dynamic = "force-dynamic";

/**
 * Content Management — wraps its tabs (Banners / Static Pages / Translations /
 * Messaging Templates / Home Page / Vehicle Photos) around
 * whichever leaf page is being viewed. The tab list itself lives in
 * `@/components/admin/admin-nav` so the sidebar and this strip can never
 * disagree; see `AdminSectionLayout` for the role gate it applies.
 */
export default function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSectionLayout sectionId="content">{children}</AdminSectionLayout>
  );
}
