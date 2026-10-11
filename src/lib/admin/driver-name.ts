/**
 * A driver's display name for a back-office listing: the wizard-collected
 * profile name where it exists, otherwise the Better Auth account name, which
 * is always populated. Never an empty string, so a table has nothing to fall
 * back to itself.
 *
 * Pure, with no imports — the same rule `GET /api/admin/driver-applications`
 * keeps a local copy of, lifted here because four routes now need it.
 */
export function driverDisplayName(profile: {
  firstName: string | null;
  lastName: string | null;
  user: { name: string };
}): string {
  const profileName = [profile.firstName, profile.lastName]
    .filter((part): part is string => part !== null && part.trim() !== "")
    .join(" ");

  return profileName !== "" ? profileName : profile.user.name;
}
