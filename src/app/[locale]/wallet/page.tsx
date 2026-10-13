import { redirect } from "next/navigation";
import { localeHref } from "@/i18n/server";

/**
 * The wallet now lives inside My account, at `/account/wallet` (see that page
 * for why it moved). This route is kept so existing links and bookmarks still
 * land on it — the same arrangement as `/account/profile`. The signed-out and
 * non-client cases are handled there.
 */
export default async function WalletPage() {
  redirect(await localeHref("/account/wallet"));
}
