import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const company = await p.logisticsCompany.findFirst({
  select: { id: true, companyName: true, userId: true, city: true,
    drivers: { select: { id: true, userId: true, firstName: true, lastName: true, companyId: true } },
    vehicles: { select: { id: true, plateNumber: true, make: true, model: true, vehicleTypeSpecId: true } } },
});
console.log("COMPANY:", JSON.stringify(company, null, 1));
const clients = await p.user.findMany({ where: { role: "CLIENT" }, select: { id: true, email: true }, take: 5 });
console.log("CLIENTS:", JSON.stringify(clients, null, 1));
const keti = await p.driverProfile.findFirst({
  where: { user: { email: "keti@driver.ge" } },
  select: { id: true, userId: true, companyId: true, vehicles: { select: { id: true, plateNumber: true, vehicleTypeSpecId: true } } },
});
console.log("KETI:", JSON.stringify(keti, null, 1));
console.log("SPECS:", JSON.stringify(await p.vehicleTypeSpec.findMany({ select: { id: true, code: true, label: true } }), null, 1));
await p.$disconnect();
