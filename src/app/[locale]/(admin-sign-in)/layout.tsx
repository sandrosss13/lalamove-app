import type { Metadata } from "next";

/**
 * `/admin/sign-in` and `/admin/change-password` live outside the back office's
 * guarded layout (see `admin/layout.tsx` for why), so they do not inherit its
 * `noindex` — and both pages are client components, which cannot export
 * metadata themselves. This pass-through layout exists to carry it for them.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminSignInGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
