import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import path from "node:path";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

// 드라이저 스키마 자동 생성 — 마이그레이션 폴더 기준 (첫 실행/기존 DB 모두 안전)
const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(dir, { recursive: true });

const migrationsFolder = path.join(process.cwd(), "drizzle");

const sqlite = new Database(path.join(dir, "dept.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };

// 모듈 로드 시 마이그레이션 수행 (없는 테이블만 생성, 멱등)
try {
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder });
  }
} catch (e) {
  // 초기 스키마 없이도 서버가 뜰 수 있도록 로그만 남기고 계속 (개발 대비)
  console.error("[db] 마이그레이션 실패(무시):", (e as Error).message);
}

// 첫 실행 편의: 기본 부서 보장 + (ADMIN_EMAIL/PASSWORD env 시) 관리자 계정 생성
// better-sqlite3는 동기라 빠르게 완료된다. (Docker 첫 실행 시 자동 관리자)
async function ensureSeed() {
  try {
    const { departments, users } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const DEPTS = [
      { id: "claims-planning", name: "보험금심사기획", personaKey: "claims-planning" },
      { id: "actuarial", name: "계리", personaKey: "actuarial" },
    ];
    for (const dep of DEPTS) {
      const exists = await db.query.departments.findFirst({ where: eq(departments.id, dep.id) });
      if (!exists) {
        await db.insert(departments).values({ ...dep, isActive: true, createdAt: new Date() }).onConflictDoNothing();
      }
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const { hashPassword } = await import("@/lib/auth/password");
      const admin = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
      if (!admin) {
        await db.insert(users).values({
          id: randomUUID(),
          email: adminEmail,
          name: "관리자",
          passwordHash: await hashPassword(adminPassword),
          role: "admin",
          status: "active",
          departmentId: DEPTS[0].id,
          createdAt: new Date(),
        });
        console.log("[db] 관리자 계정 생성:", adminEmail);
      }
    }
  } catch (e) {
    console.error("[db] 초기 데이터 보장 스킵:", (e as Error).message);
  }
}
void ensureSeed();
