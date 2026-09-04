/* eslint-disable no-console -- A build script's output IS its interface: the
   build log is the only place anyone learns whether migrations ran or were
   skipped, and why. console.warn would put routine success on stderr and read
   as a problem. */

// Applies pending Prisma migrations at deploy time — production only.
//
// Migrations used to be applied by hand, which meant a schema change could ship
// to an environment whose database had not caught up. Running them from the
// build closes that gap, but it must not run on every build:
//
//   - Preview deployments build the same script. If preview and production
//     share a database — which cannot be verified from the CLI, because both
//     DATABASE_URL values are marked Sensitive and redact to "[SENSITIVE]" on
//     `vercel env pull` — then a preview build of any branch would apply that
//     branch's migrations to production, including ones from a pull request
//     that is never merged. That is worse than the manual gap it replaces.
//
//   - Local builds should not touch a shared database as a side effect of
//     `pnpm build`. Developers apply migrations deliberately with
//     `prisma migrate dev`.
//
// So: run on Vercel production builds, skip everywhere else, and say which.
// Set FORCE_MIGRATE_DEPLOY=1 to run it anywhere (e.g. a manual staging deploy).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const vercelEnv = process.env.VERCEL_ENV;
const forced = process.env.FORCE_MIGRATE_DEPLOY === "1";
const onVercelProduction = vercelEnv === "production";

if (!forced && !onVercelProduction) {
  const where = vercelEnv ? `VERCEL_ENV=${vercelEnv}` : "not a Vercel build";
  console.log(
    `[migrate-deploy] Skipped (${where}). ` +
      "Migrations run on Vercel production builds only; " +
      "set FORCE_MIGRATE_DEPLOY=1 to override.",
  );
  process.exit(0);
}

console.log(
  `[migrate-deploy] Applying migrations (${forced ? "forced" : "Vercel production build"}).`,
);

// Resolve the local binary rather than trusting PATH. A package script gets
// node_modules/.bin on PATH, but this file is spawned by node, which does not,
// so a bare "prisma" fails with ENOENT the moment anything invokes the script
// directly instead of through pnpm.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const localPrisma = path.join(repoRoot, "node_modules", ".bin", "prisma");
const prismaBin = existsSync(localPrisma) ? localPrisma : "prisma";

// Inherit stdio so a failed migration's own output reaches the build log, and
// fail the build rather than shipping code against a schema that lags it.
const result = spawnSync(prismaBin, ["migrate", "deploy"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error("[migrate-deploy] Could not run prisma:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
