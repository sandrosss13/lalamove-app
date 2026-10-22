import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

/**
 * The back office's own 404, rendered inside the admin layout (shell, nav and
 * language toggle included) for any `/admin/**` path with no page — reached via
 * the `[...missing]` catch-all beside it. Its only way out is the admin home,
 * so staff are never sent off the admin host.
 */
export default async function AdminNotFound() {
  const t = await getTranslations("admin.adminNotFound");

  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("description")}
      </p>
      <Button asChild>
        <Link href="/admin">{t("backHome")}</Link>
      </Button>
    </div>
  );
}
