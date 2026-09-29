import { redirect } from "next/navigation";
import { localeHref } from "@/i18n/server";

// Profile editing now lives inline on the account dashboard; this route is kept
// so existing links and bookmarks still land somewhere useful.
export default async function ProfilePage() {
  redirect(await localeHref("/account"));
}
