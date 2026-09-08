process.loadEnvFile('.env.local');
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const users = await p.user.findMany({ select: { email: true, name: true, role: true, clientProfile: { select: { accountType: true, companyName: true } } } });
process.stdout.write(JSON.stringify(users, null, 2) + '\n');
await p.$disconnect();
