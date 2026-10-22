import { notFound } from "next/navigation";

/**
 * Catches every `/admin/**` path no real route matches and hands it to
 * `src/app/[locale]/admin/not-found.tsx`, so a missing admin page is answered
 * inside the admin shell. Without it Next falls through to the site-wide 404,
 * whose links lead to the customer home page — which on the admin host is
 * somewhere staff should never be sent.
 */
export default function AdminMissingPage() {
  notFound();
}
