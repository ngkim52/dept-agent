import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { jsonError } from "@/lib/auth/http";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/auth/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const rl = checkRateLimit(req, "login");
    if (!rl.ok) return rateLimitExceededResponse(rl.retryAfterSeconds);
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    if (user.status !== "active") {
      return Response.json({ error: "가입 승인 대기 중입니다. 관리자 승인 후 이용할 수 있습니다." }, { status: 403 });
    }
    const { token, expiresAt } = await createSession(user.id);
    const res = Response.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role, departmentId: user.departmentId } });
    res.headers.set("Set-Cookie", `${config.sessionCookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}${process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`);
    return res;
  } catch (e) { return jsonError(e); }
}
