/**
 * Live end-to-end verification of task-04 (fleet vehicles + driver roster).
 * Creates throwaway accounts, exercises every endpoint, asserts DB state, then
 * deletes everything it created.
 */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3014";
const prisma = new PrismaClient();

const STAMP = Date.now();
const COMPANY_EMAIL = `t04-company-${STAMP}@example.test`;
const DRIVER_EMAIL = `t04-driver-${STAMP}@example.test`;
const CLIENT_EMAIL = `t04-client-${STAMP}@example.test`;
const PASSWORD = "Test-Password-12345";

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}`, detail === undefined ? "" : detail);
  }
}

/** A minimal but real 1x1 PNG, so the image/* content-type check passes. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function photoFile(name: string): File {
  return new File([new Uint8Array(PNG_BYTES)], name, { type: "image/png" });
}

async function signUp(
  email: string,
  name: string,
  role: string,
): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: BASE },
    body: JSON.stringify({ email, password: PASSWORD, name, role }),
  });

  if (!response.ok) {
    throw new Error(`sign-up failed for ${email}: ${await response.text()}`);
  }

  const setCookie = response.headers.getSetCookie().join("; ");
  if (!setCookie) {
    throw new Error(`no session cookie returned for ${email}`);
  }

  return setCookie;
}

type Json = Record<string, unknown> | unknown[] | null;

async function api(
  path: string,
  init: RequestInit & { cookie?: string },
): Promise<{ status: number; body: Json }> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);

  const response = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await response.text();

  let body: Json = null;
  try {
    body = JSON.parse(text) as Json;
  } catch {
    body = { raw: text.slice(0, 300) };
  }

  return { status: response.status, body };
}

function vehicleForm(plate: string, code: string): FormData {
  const form = new FormData();
  form.set("plateNumber", plate);
  form.set("make", "Mercedes-Benz");
  form.set("model", "Actros");
  form.set("year", "2021");
  form.set("vehicleTypeCode", code);
  form.append("photos", photoFile("front.png"));
  return form;
}

async function main() {
  // --- Reference data -------------------------------------------------------
  const specs = await prisma.vehicleTypeSpec.findMany({
    select: { code: true },
    orderBy: { code: "asc" },
  });
  check("VehicleTypeSpec rows are seeded", specs.length > 0, specs.length);
  const specCode = specs[0].code;

  // --- Accounts -------------------------------------------------------------
  const companyCookie = await signUp(COMPANY_EMAIL, "T04 Freight Co", "COMPANY");
  const driverCookie = await signUp(DRIVER_EMAIL, "T04 Driver", "DRIVER");
  const clientCookie = await signUp(CLIENT_EMAIL, "T04 Client", "CLIENT");

  // --- Role gating ----------------------------------------------------------
  check(
    "client is 403 on company vehicles",
    (await api("/api/logistics-company/vehicles", { cookie: clientCookie }))
      .status === 403,
  );
  check(
    "anonymous is 401 on company vehicles",
    (await api("/api/logistics-company/vehicles", {})).status === 401,
  );
  check(
    "client is 403 on company roster",
    (await api("/api/logistics-company/drivers", { cookie: clientCookie }))
      .status === 403,
  );

  // --- Company with no profile yet -----------------------------------------
  const emptyFleet = await api("/api/logistics-company/vehicles", {
    cookie: companyCookie,
  });
  check(
    "company without profile gets an empty fleet list",
    emptyFleet.status === 200 &&
      Array.isArray(emptyFleet.body) &&
      emptyFleet.body.length === 0,
    emptyFleet,
  );

  const noProfilePost = await api("/api/logistics-company/vehicles", {
    method: "POST",
    cookie: companyCookie,
    body: vehicleForm(`T4A${STAMP % 10000}`, specCode),
  });
  check(
    "POST fleet vehicle without a company profile is 400 with the guidance message",
    noProfilePost.status === 400 &&
      (noProfilePost.body as { error?: string }).error ===
        "Complete your company profile before adding a vehicle.",
    noProfilePost,
  );

  // --- Profiles -------------------------------------------------------------
  const companyUser = await prisma.user.findUniqueOrThrow({
    where: { email: COMPANY_EMAIL },
    select: { id: true },
  });
  const driverUser = await prisma.user.findUniqueOrThrow({
    where: { email: DRIVER_EMAIL },
    select: { id: true },
  });

  const company = await prisma.logisticsCompany.create({
    data: {
      userId: companyUser.id,
      companyName: "T04 Freight Co",
      vatId: `T04${STAMP}`,
      phone: `+99532${String(STAMP).slice(-7)}`,
      city: "TBILISI",
    },
    select: { id: true },
  });

  const driverProfile = await prisma.driverProfile.create({
    data: {
      userId: driverUser.id,
      city: "TBILISI",
      accountType: "INDIVIDUAL",
      firstName: "T04",
      lastName: "Driver",
      phone: `+99533${String(STAMP).slice(-7)}`,
    },
    select: { id: true },
  });

  // --- Fleet vehicle create -------------------------------------------------
  const fleetPlate = `t4f${STAMP % 100000}`;
  const created = await api("/api/logistics-company/vehicles", {
    method: "POST",
    cookie: companyCookie,
    body: vehicleForm(fleetPlate, specCode),
  });
  check("POST fleet vehicle returns 201", created.status === 201, created);

  const fleetVehicleId = (created.body as { id?: string }).id ?? "";
  const fleetRow = fleetVehicleId
    ? await prisma.vehicle.findUnique({
        where: { id: fleetVehicleId },
        select: {
          companyId: true,
          driverProfileId: true,
          plateNumber: true,
          vehicleTypeSpecId: true,
          photoUrls: true,
        },
      })
    : null;

  check(
    "fleet vehicle is owned by the company only",
    fleetRow?.companyId === company.id && fleetRow?.driverProfileId === null,
    fleetRow,
  );
  check(
    "plate number is upper-cased on write",
    fleetRow?.plateNumber === fleetPlate.toUpperCase(),
    fleetRow?.plateNumber,
  );
  check(
    "photo was uploaded and its URL stored",
    (fleetRow?.photoUrls.length ?? 0) === 1,
    fleetRow?.photoUrls,
  );

  const badType = await api("/api/logistics-company/vehicles", {
    method: "POST",
    cookie: companyCookie,
    body: vehicleForm(`T4X${STAMP % 10000}`, "NOT_A_REAL_CODE"),
  });
  check(
    "unknown vehicleTypeCode is 400 with the documented message",
    badType.status === 400 &&
      (badType.body as { error?: string }).error ===
        "vehicleTypeCode does not match a known vehicle type.",
    badType,
  );

  const dupe = await api("/api/logistics-company/vehicles", {
    method: "POST",
    cookie: companyCookie,
    body: vehicleForm(fleetPlate, specCode),
  });
  check(
    "duplicate plate on the company route is 409",
    dupe.status === 409,
    dupe,
  );

  const fleetList = await api("/api/logistics-company/vehicles", {
    cookie: companyCookie,
  });
  check(
    "GET fleet lists the vehicle with its type spec",
    Array.isArray(fleetList.body) &&
      fleetList.body.length === 1 &&
      typeof (fleetList.body[0] as { vehicleTypeSpec?: { label?: string } })
        .vehicleTypeSpec?.label === "string",
    fleetList.body,
  );

  // --- Driver vehicle create (reworked route) -------------------------------
  const driverPlate = `t4d${STAMP % 100000}`;
  const driverCreated = await api("/api/driver-profile/vehicles", {
    method: "POST",
    cookie: driverCookie,
    body: vehicleForm(driverPlate, specCode),
  });
  check(
    "POST driver vehicle returns 201",
    driverCreated.status === 201,
    driverCreated,
  );

  const driverVehicleId = (driverCreated.body as { id?: string }).id ?? "";
  const driverRow = driverVehicleId
    ? await prisma.vehicle.findUnique({
        where: { id: driverVehicleId },
        select: { companyId: true, driverProfileId: true },
      })
    : null;
  check(
    "driver vehicle is owned by the driver profile only",
    driverRow?.driverProfileId === driverProfile.id &&
      driverRow?.companyId === null,
    driverRow,
  );

  const driverDupe = await api("/api/driver-profile/vehicles", {
    method: "POST",
    cookie: driverCookie,
    body: vehicleForm(fleetPlate, specCode),
  });
  check(
    "a plate already used by a company fleet is 409 on the driver route",
    driverDupe.status === 409,
    driverDupe,
  );

  // --- Cross-owner delete isolation ----------------------------------------
  check(
    "company cannot delete a driver's vehicle (404)",
    (
      await api(`/api/logistics-company/vehicles/${driverVehicleId}`, {
        method: "DELETE",
        cookie: companyCookie,
      })
    ).status === 404,
  );
  check(
    "driver cannot delete a company's vehicle (404)",
    (
      await api(`/api/driver-profile/vehicles/${fleetVehicleId}`, {
        method: "DELETE",
        cookie: driverCookie,
      })
    ).status === 404,
  );

  // --- Roster ---------------------------------------------------------------
  const noSuchDriver = await api("/api/logistics-company/drivers", {
    method: "POST",
    cookie: companyCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverEmail: `nobody-${STAMP}@example.test` }),
  });
  check(
    "adding an unknown email is 400 with a specific message",
    noSuchDriver.status === 400 &&
      (noSuchDriver.body as { error?: string }).error ===
        "No account was found with that email address.",
    noSuchDriver,
  );

  const notADriver = await api("/api/logistics-company/drivers", {
    method: "POST",
    cookie: companyCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverEmail: CLIENT_EMAIL }),
  });
  check(
    "adding a non-driver account is 400 with a specific message",
    notADriver.status === 400 &&
      (notADriver.body as { error?: string }).error ===
        "That account is not a driver account.",
    notADriver,
  );

  // A driver account with no profile yet.
  const profilelessEmail = `t04-noprofile-${STAMP}@example.test`;
  await signUp(profilelessEmail, "T04 No Profile", "DRIVER");
  const noProfile = await api("/api/logistics-company/drivers", {
    method: "POST",
    cookie: companyCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverEmail: profilelessEmail }),
  });
  check(
    "adding a driver with no profile is 400 with the documented message",
    noProfile.status === 400 &&
      (noProfile.body as { error?: string }).error ===
        "This driver hasn't completed their driver profile yet.",
    noProfile,
  );

  const added = await api("/api/logistics-company/drivers", {
    method: "POST",
    cookie: companyCookie,
    headers: { "Content-Type": "application/json" },
    // Upper-cased to prove the lookup is case-insensitive.
    body: JSON.stringify({ driverEmail: DRIVER_EMAIL.toUpperCase() }),
  });
  check("adding a driver returns 201", added.status === 201, added);
  check(
    "roster entry carries the fields the UI needs",
    typeof (added.body as { userId?: string }).userId === "string" &&
      typeof (added.body as { name?: string }).name === "string" &&
      typeof (added.body as { email?: string }).email === "string" &&
      typeof (added.body as { phone?: string }).phone === "string",
    added.body,
  );
  check(
    "DriverProfile.companyId is set in the database",
    (
      await prisma.driverProfile.findUniqueOrThrow({
        where: { id: driverProfile.id },
        select: { companyId: true },
      })
    ).companyId === company.id,
  );

  const alreadyMember = await api("/api/logistics-company/drivers", {
    method: "POST",
    cookie: companyCookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ driverEmail: DRIVER_EMAIL }),
  });
  check(
    "re-adding a driver who already belongs to a company is 400 with the documented message",
    alreadyMember.status === 400 &&
      (alreadyMember.body as { error?: string }).error ===
        "This driver already belongs to a company.",
    alreadyMember,
  );

  const roster = await api("/api/logistics-company/drivers", {
    cookie: companyCookie,
  });
  check(
    "GET roster lists the added driver",
    Array.isArray(roster.body) &&
      roster.body.length === 1 &&
      (roster.body[0] as { email?: string }).email === DRIVER_EMAIL,
    roster.body,
  );

  check(
    "removing a driver who is not on the roster is 404",
    (
      await api(`/api/logistics-company/drivers/${companyUser.id}`, {
        method: "DELETE",
        cookie: companyCookie,
      })
    ).status === 404,
  );

  const removed = await api(
    `/api/logistics-company/drivers/${driverUser.id}`,
    { method: "DELETE", cookie: companyCookie },
  );
  check("removing a roster driver returns 200", removed.status === 200, removed);

  const afterRemoval = await prisma.driverProfile.findUnique({
    where: { id: driverProfile.id },
    select: { companyId: true, userId: true, phone: true },
  });
  check(
    "removal nulls companyId and leaves the profile intact",
    afterRemoval !== null &&
      afterRemoval.companyId === null &&
      afterRemoval.userId === driverUser.id,
    afterRemoval,
  );
  check(
    "the driver's user account survives removal",
    (await prisma.user.findUnique({ where: { id: driverUser.id } })) !== null,
  );

  // --- Vehicle deletes ------------------------------------------------------
  check(
    "company deletes its own fleet vehicle",
    (
      await api(`/api/logistics-company/vehicles/${fleetVehicleId}`, {
        method: "DELETE",
        cookie: companyCookie,
      })
    ).status === 200,
  );
  check(
    "driver deletes their own vehicle",
    (
      await api(`/api/driver-profile/vehicles/${driverVehicleId}`, {
        method: "DELETE",
        cookie: driverCookie,
      })
    ).status === 200,
  );
  check(
    "both vehicle rows are gone",
    (await prisma.vehicle.count({
      where: { id: { in: [fleetVehicleId, driverVehicleId] } },
    })) === 0,
  );
}

async function cleanUp() {
  const emails = [
    COMPANY_EMAIL,
    DRIVER_EMAIL,
    CLIENT_EMAIL,
    `t04-noprofile-${STAMP}@example.test`,
  ];

  // Session/Account/DriverProfile/LogisticsCompany/Vehicle all cascade from User.
  const deleted = await prisma.user.deleteMany({
    where: { email: { in: emails } },
  });
  console.log(`\nCleaned up ${deleted.count} test user(s).`);

  const leftovers = await prisma.vehicle.count({
    where: { plateNumber: { startsWith: `T4` } },
  });
  console.log(`Vehicles left with a T4 plate prefix: ${leftovers}`);
}

main()
  .catch((error: unknown) => {
    failures.push(`threw: ${String(error)}`);
    console.error(error);
  })
  .finally(async () => {
    await cleanUp().catch((error: unknown) => console.error(error));
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failures.length} failed`);
    if (failures.length > 0) {
      console.log(failures.map((f) => ` - ${f}`).join("\n"));
      process.exitCode = 1;
    }
  });
