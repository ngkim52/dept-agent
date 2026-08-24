// 최초 1회 실행: 기본 부서 시드 (npm run db:seed)
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
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
