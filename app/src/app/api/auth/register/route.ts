import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { config } from "@/lib/config";
import { jsonError } from "@/lib/auth/http";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const rl = checkRateLimit(req, "register");
    if (!rl.ok) return rateLimitExceededResponse(rl.retryAfterSeconds);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const departmentId = String(body.departmentId ?? "");

    if (!email || !name || password.length < 8) {
      return Response.json({ error: "이메일/이름/비밀번호(8자 이상)를 확인해주세요." }, { status: 400 });
    }
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || !config.allowedEmailDomains.includes(domain)) {
      return Response.json({ error: "허용된 회사 이메일 도메인이 아닙니다." }, { status: 400 });
    }
    if (!departmentId) {
      return Response.json({ error: "부서를 선택해주세요." }, { status: 400 });
    }
    const department = await db.query.departments.findFirst({ where: eq(schema.departments.id, departmentId) });
    if (!department || !department.isActive) {
      return Response.json({ error: "존재하지 않거나 비활성화된 부서입니다." }, { status: 400 });
    }

    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (existing) return Response.json({ error: "이미 가입된 이메일입니다." }, { status: 409 });

    // 보안: 모든 가입자는 pending(user). 관리자는 seed 스크립트(ADMIN_EMAIL)로만 생성.
    const now = new Date();
    const user = {
      id: randomUUID(),
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "user" as const,
      status: "pending" as const,
      departmentId,
      createdAt: now,
    };
    await db.insert(schema.users).values(user);
    return Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status } }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
