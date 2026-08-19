/**
 * Bootstraps the very first `SUPER_ADMIN` back-office account.
 *
 * The admin back office has deliberately no self-serve sign-up: the `before`
 * hook in `@/lib/auth` rejects `role: "ADMIN"` on `POST /sign-up/email`
 * unconditionally, and rejects any sign-up resolving to the admin host. Every
 * `SystemUserProfile` after the first is therefore created by an existing
 * `SUPER_ADMIN` through `POST /api/admin/users/system` — which leaves the
 * chicken-and-egg case this script exists to solve, and nothing else.
 *
 * Run it ONCE, at deployment time, against a database that has no back-office
 * account yet:
 *
 *   pnpm seed:super-admin "Jane Doe" jane@example.com
 *
 * It is NOT a routine tool. Every successful run mints a fully privileged
 * account that can create further staff accounts, change roles and read the
 * whole back office. Once the first `SUPER_ADMIN` exists, create the next staff
 * member from `/admin/users/system` instead, so the action is authorized and
 * lands in the audit log. As a guard against the obvious mistake, the script
 * refuses to run when an active `SUPER_ADMIN` already exists; `--force`
 * overrides that, and exists for the genuine recovery case (the only
 * `SUPER_ADMIN` was deactivated or locked out).
 *
 * The account is created with `mustChangePassword: true`, so whoever receives
 * the one-time temporary password printed below is forced through
 * `/admin/change-password` before they can reach any back-office page (enforced
 * in `src/app/admin/layout.tsx`).
 *
 * Implementation mirrors `src/app/api/admin/users/system/route.ts` — see the
 * comments at the sign-up call for why the account is created as a CLIENT and
 * promoted in a transaction rather than created as an ADMIN directly.
 */
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

/**
 * Bytes of entropy behind the temporary password, matching
 * `src/app/api/admin/users/system/route.ts`. 12 random bytes is ~96 bits and
 * `base64url`-encodes to 16 characters — comfortably over Better Auth's minimum
 * password length while remaining short enough to relay by hand.
 */
const TEMP_PASSWORD_BYTES = 12;

/**
 * Duplicated from `@/lib/admin/auth` rather than imported: that module opens
 * with `import "server-only"`, which throws outside Next.js' bundler (tsx
 * resolves the plain Node condition, and `server-only`'s entrypoint is a bare
 * `throw`), so a single import of it would take this whole script down. Only
 * used to print a sign-in hint, so drift here is cosmetic.
 */
const ADMIN_SIGN_IN_PATH = "/admin/sign-in";

/**
 * Env files to load, highest precedence first — `process.loadEnvFile` never
 * overwrites a variable that is already set, so the first file to define a key
 * wins, and any variable already in the real environment beats both. That
 * ordering reproduces Next.js' own precedence (`.env.local` over `.env`) and
 * lets a one-off production run point the script elsewhere inline:
 *
 *   DATABASE_URL=... pnpm seed:super-admin "Jane Doe" jane@example.com
 */
const ENV_FILES = [".env.local", ".env"] as const;

/**
 * An expected, explainable failure — bad arguments, a taken email address, a
 * `SUPER_ADMIN` that already exists. Reported as a bare message, since a stack
 * trace for these is noise that hides the actual problem. Anything that is not
 * a `SeedError` is a genuine fault and is printed in full.
 */
class SeedError extends Error {}

/** Parsed command line: two positional arguments plus an opt-out flag. */
type SeedArgs = {
  name: string;
  email: string;
  force: boolean;
};

const USAGE = `Usage: pnpm seed:super-admin "<name>" <email> [--force]`;

/**
 * Positional parsing, kept deliberately minimal — this is a one-off operational
 * script, not a CLI. The email is not format-checked here for the same reason
 * the create-system-user route doesn't: Better Auth validates it during sign-up
 * and its message is more precise than anything reimplemented here.
 */
function parseArgs(argv: readonly string[]): SeedArgs {
  const positional: string[] = [];
  let force = false;

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new SeedError(`Unknown option "${arg}".\n${USAGE}`);
    }

    positional.push(arg);
  }

  const [name, email, ...rest] = positional;

  if (name === undefined || email === undefined) {
    throw new SeedError(
      `Both a name and an email address are required.\n${USAGE}`,
    );
  }

  if (rest.length > 0) {
    throw new SeedError(
      `Unexpected extra argument "${rest[0]}". Quote the name if it contains spaces.\n${USAGE}`,
    );
  }

  if (name.trim() === "") {
    throw new SeedError(`The name must not be blank.\n${USAGE}`);
  }

  if (email.trim() === "") {
    throw new SeedError(`The email address must not be blank.\n${USAGE}`);
  }

  return { name: name.trim(), email: email.trim(), force };
}

/**
 * Populate `process.env` from the project's env files.
 *
 * Next.js does this itself; a bare `tsx` process does not, and neither does
 * `@prisma/client` (only the Prisma CLI loads `.env`, which is why
 * `prisma/seed.ts` gets away without this). Without it `new PrismaClient()`
 * fails on a missing `DATABASE_URL` and Better Auth on a missing
 * `BETTER_AUTH_SECRET`.
 *
 * Paths are resolved against this file rather than `process.cwd()` so the
 * script works when invoked from a subdirectory — via `fileURLToPath`, not
 * `URL.pathname`, which would hand `loadEnvFile` a percent-encoded path and
 * fail for any checkout whose directory contains a space. A missing file is not
 * an error — `.env.local` is gitignored and absent on CI, and in a real
 * deployment every variable may come from the environment instead.
 */
function loadEnvFiles(): void {
  for (const file of ENV_FILES) {
    try {
      process.loadEnvFile(
        fileURLToPath(new URL(`../${file}`, import.meta.url)),
      );
    } catch {
      // Absent or unreadable: fall through to the next file, and ultimately to
      // whatever the real environment provides.
    }
  }
}

async function main(): Promise<void> {
  // Parsed before anything else so a typo costs nothing and opens no database
  // connection.
  const { name, email, force } = parseArgs(process.argv.slice(2));

  loadEnvFiles();

  // Imported dynamically, and only after `loadEnvFiles()`: every one of these
  // modules reads `process.env` at module-evaluation time (`@/lib/prisma`
  // constructs a `PrismaClient`, `@/lib/auth` reads `BETTER_AUTH_SECRET`,
  // `@/lib/host` reads the host split's variables). Hoisting any of them to a
  // static `import` would evaluate it before the env files are loaded and break
  // the script. Do not "tidy" these into the import block above.
  const [{ auth }, { prisma }, { AdminRole, UserRole }, { APIError }, host] =
    await Promise.all([
      import("@/lib/auth"),
      import("@/lib/prisma"),
      import("@prisma/client"),
      import("better-auth/api"),
      import("@/lib/host"),
    ]);

  try {
    // The guard against the likely mistake: re-running a bootstrap script on a
    // database that is already bootstrapped. Scoped to *active* profiles so a
    // genuine lockout (the only `SUPER_ADMIN` deactivated) isn't told to use
    // `--force` when it doesn't have to.
    if (!force) {
      const existingSuperAdmin = await prisma.systemUserProfile.findFirst({
        where: { adminRole: AdminRole.SUPER_ADMIN, isActive: true },
        select: { userId: true },
      });

      if (existingSuperAdmin) {
        throw new SeedError(
          "An active SUPER_ADMIN already exists, so this database is already " +
            "bootstrapped.\nCreate further staff accounts from " +
            "/admin/users/system instead, so the action is authorized and " +
            "audited.\nIf you are recovering from a lockout, re-run with " +
            "--force.",
        );
      }
    }

    // Checked up front so a taken address produces a specific message instead
    // of whatever `signUpEmail` happens to throw. Case-insensitive because the
    // address is typed by hand here; `email` is unique, so at most one row can
    // match either way.
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (existingUser) {
      throw new SeedError(
        `An account with the email address "${email}" already exists.\n` +
          "Nothing was created. Use a different address, or promote the " +
          "existing account by hand if it is genuinely meant to be staff.",
      );
    }

    const tempPassword = randomBytes(TEMP_PASSWORD_BYTES).toString("base64url");

    // The account goes through Better Auth's own sign-up logic rather than a
    // raw Prisma insert, so the password is hashed with the same algorithm the
    // sign-in path verifies against — a hand-rolled `Account` row would not
    // actually let the new admin log in. This mirrors
    // `src/app/api/admin/users/system/route.ts`, including the two things it
    // does *not* do:
    //
    // - No request or headers are forwarded. There is no request to forward
    //   here, which is also what makes the call trusted: the sign-up hook in
    //   `@/lib/auth` bails out of its host-audience checks when `ctx.request`
    //   is absent, so this call is not subject to the admin-host rejection.
    // - `role` is sent as CLIENT, not ADMIN, and promoted to ADMIN immediately
    //   below. That same hook rejects `role: "ADMIN"` unconditionally, *before*
    //   its `ctx.request` bail-out, so even a trusted server-side call cannot
    //   ask for it directly. The window in which the row is a CLIENT is one
    //   statement long, no session has been issued for it, and the failure path
    //   below deletes the account outright.
    let createdUserId: string;
    try {
      const signUpResult = await auth.api.signUpEmail({
        body: {
          email,
          name,
          password: tempPassword,
          role: UserRole.CLIENT,
        },
      });
      createdUserId = signUpResult.user.id;
    } catch (error) {
      // Better Auth rejects with its own message for cases not pre-checked
      // above (a malformed address, a password policy, a race on the email
      // uniqueness check); surfacing that verbatim is more useful than a
      // generic failure. Anything that is not an `APIError` is a genuine fault
      // and is rethrown with its stack intact.
      if (error instanceof APIError) {
        throw new SeedError(
          `Better Auth rejected the sign-up: ${error.message}`,
        );
      }

      throw error;
    }

    // One transaction so the account is never left half-promoted: either it is
    // an ADMIN with a back-office profile and a forced password change, or (via
    // the cleanup below) it does not exist at all.
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: createdUserId },
          data: {
            role: UserRole.ADMIN,
            // Forces the recipient of the temporary password below through
            // `/admin/change-password` before any back-office page is
            // reachable; Better Auth's `after` hook clears the flag once they
            // actually pick a password.
            mustChangePassword: true,
          },
        });

        await tx.systemUserProfile.create({
          data: {
            userId: createdUserId,
            adminRole: AdminRole.SUPER_ADMIN,
            isActive: true,
          },
          select: { id: true },
        });
      });
    } catch (error) {
      // `auth.api.signUpEmail` runs its own writes and cannot join the
      // transaction above, so the `User`/`Account` rows already exist and would
      // otherwise be left orphaned — with a live credential and no back-office
      // profile. Best-effort cleanup deletes them (`Account`/`Session` cascade
      // off `User`), which also frees the email address so the run can simply
      // be retried. If even the cleanup fails there is nothing left to try
      // automatically, so both faults are reported for a human.
      console.error("Promoting the new account to SUPER_ADMIN failed:", error);

      try {
        await prisma.user.delete({ where: { id: createdUserId } });
      } catch (cleanupError) {
        console.error(
          `Failed to clean up orphaned user ${createdUserId}. Delete this ` +
            "row by hand before retrying — it holds a live credential with " +
            "no back-office profile:",
          cleanupError,
        );
      }

      throw new SeedError(
        "Could not create the SUPER_ADMIN profile. See the error above.",
      );
    }

    // `adminOrigin()` is null while the admin host split is disabled, in which
    // case `/admin` is served path-based off the main host.
    const signInUrl = `${host.adminOrigin() ?? host.clientOrigin()}${ADMIN_SIGN_IN_PATH}`;

    // `console.log` is disallowed by the project's lint rules; this is a CLI
    // script, so write to stdout directly (same as `prisma/seed.ts`).
    process.stdout.write(
      [
        "",
        "Created the first SUPER_ADMIN system user.",
        "",
        `  User id:  ${createdUserId}`,
        `  Name:     ${name}`,
        `  Email:    ${email}`,
        `  Password: ${tempPassword}`,
        "",
        "The temporary password above is displayed HERE AND NOWHERE ELSE. It",
        "is stored only as a hash and cannot be recovered — copy it now, relay",
        "it out of band, and do not leave it in shell history or a log.",
        "",
        `Sign in at ${signInUrl}`,
        "The account is flagged mustChangePassword, so the first sign-in lands",
        "on /admin/change-password and no back-office page is reachable until",
        "the password is replaced.",
        "",
      ].join("\n"),
    );
  } finally {
    // Always release the pool, including on the failure paths above — a bare
    // `tsx` process has no Next.js runtime to tear it down and would otherwise
    // hang on an open connection.
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  if (error instanceof SeedError) {
    console.error(`\n${error.message}\n`);
  } else {
    console.error("\nSeeding the first SUPER_ADMIN failed:", error);
  }

  process.exitCode = 1;
});
