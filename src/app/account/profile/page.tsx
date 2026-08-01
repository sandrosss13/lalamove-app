import { redirect } from "next/navigation";

// Profile editing now lives inline on the account dashboard; this route is kept
// so existing links and bookmarks still land somewhere useful.
export default function ProfilePage() {
  redirect("/account");
}
