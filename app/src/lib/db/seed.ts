// 최초 1회 실행: 기본 부서 시드 (npm run db:seed)
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./index";

const initial: Array<{ id: string; name: string; personaKey: string }> = [
  { id: "claims-planning", name: "보험금심사기획", personaKey: "claims-planning" },
  { id: "actuarial", name: "계리", personaKey: "actuarial" },
];

async function main() {
  for (const d of initial) {
    await db.insert(schema.departments)
      .values({ ...d, isActive: true, createdAt: new Date() })
      .onConflictDoNothing();
  }
  console.log("seeded departments:", initial.map((d) => d.name).join(", "));

  // 관리자 계정 시드 (ADMIN_EMAIL + ADMIN_PASSWORD 환경변수)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const { hashPassword } = await import("@/lib/auth/password");
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, adminEmail) });
    if (!existing) {
      const deptId = initial[0]?.id ?? "claims-planning";
      await db.insert(schema.users).values({
        id: randomUUID(),
        email: adminEmail,
        name: "관리자",
        passwordHash: await hashPassword(adminPassword),
        role: "admin",
        status: "active",
        departmentId: deptId,
        createdAt: new Date(),
      });
      console.log("seeded admin:", adminEmail);
    } else {
      console.log("admin already exists:", adminEmail);
    }
  } else {
    console.log("ADMIN_EMAIL/ADMIN_PASSWORD not set — admin seed skipped");
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
