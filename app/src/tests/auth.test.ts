import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { resetDb, withDept } from "./helpers";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, getUserBySessionToken, destroySession } from "@/lib/auth/session";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

async function callPost(handler: (req: NextRequest) => Promise<Response>, body: unknown, cookie?: string) {
  return handler(new NextRequest("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  }));
}

describe("auth/password", () => {
  it("비밀번호 해시/검증 왕복", async () => {
    const h = await hashPassword("secret123");
    expect(h).not.toContain("secret123");
    expect(await verifyPassword("secret123", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("auth/session", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  it("세션 생성 → 조회 → 파기", async () => {
    await db.insert(schema.users).values({ id: "u1", email: "a@shinhan.com", name: "A", passwordHash: "h", role: "user", status: "active", departmentId: "claims-planning", createdAt: new Date() });
    const { token } = await createSession("u1");
    const u = await getUserBySessionToken(token);
    expect(u?.id).toBe("u1");
    await destroySession(token);
    expect(await getUserBySessionToken(token)).toBeNull();
  });

  it("만료 세션은 유효하지 않음", async () => {
    await db.insert(schema.users).values({ id: "u1", email: "a@shinhan.com", name: "A", passwordHash: "h", role: "user", status: "active", departmentId: "claims-planning", createdAt: new Date() });
    const { token } = await createSession("u1");
    const rows = await db.query.sessions.findMany({});
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.sessions.id, rows[0].id));
    expect(await getUserBySessionToken(token)).toBeNull();
  });

  it("pending 사용자는 세션으로 로그인 불가", async () => {
    await db.insert(schema.users).values({ id: "u1", email: "a@shinhan.com", name: "A", passwordHash: "h", role: "user", status: "pending", departmentId: "claims-planning", createdAt: new Date() });
    const { token } = await createSession("u1");
    expect(await getUserBySessionToken(token)).toBeNull();
  });
});

describe("auth/register", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  it("존재하지 않는 부서는 400", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await callPost(POST, { email: "x@shinhan.com", name: "홍", password: "secret123", departmentId: "no-such-dept" });
    expect(res.status).toBe(400);
  });

  it("허용 도메인 외 이메일 차단", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await callPost(POST, { email: "x@gmail.com", name: "홍", password: "secret123", departmentId: "claims-planning" });
    expect(res.status).toBe(400);
  });

  it("첫 가입자는 자동 admin+active", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await callPost(POST, { email: "first@shinhan.com", name: "첫사람", password: "secret123", departmentId: "claims-planning" });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user.role).toBe("admin");
    expect(data.user.status).toBe("active");
  });

  it("두 번째 가입자는 pending(user)", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    await callPost(POST, { email: "first@shinhan.com", name: "첫사람", password: "secret123", departmentId: "claims-planning" });
    const res = await callPost(POST, { email: "second@shinhan.com", name: "둘째", password: "secret123", departmentId: "claims-planning" });
    const data = await res.json();
    expect(data.user.role).toBe("user");
    expect(data.user.status).toBe("pending");
  });

  it("중복 이메일 거부", async () => {
    const { POST } = await import("@/app/api/auth/register/route");
    await callPost(POST, { email: "a@shinhan.com", name: "A", password: "secret123", departmentId: "claims-planning" });
    const res = await callPost(POST, { email: "a@shinhan.com", name: "B", password: "secret123", departmentId: "claims-planning" });
    expect(res.status).toBe(409);
  });
});

describe("auth/login+me", () => {
  beforeEach(async () => { await resetDb(); await withDept(); });

  async function makeActiveUser() {
    const { POST } = await import("@/app/api/auth/register/route");
    await callPost(POST, { email: "first@shinhan.com", name: "첫사람", password: "secret123", departmentId: "claims-planning" });
  }

  it("올바른 비밀번호 → 세션 쿠키 발급, me 조회 가능", async () => {
    await makeActiveUser();
    const { POST: login } = await import("@/app/api/auth/login/route");
    const res = await callPost(login, { email: "first@shinhan.com", password: "secret123" });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    const token = setCookie.match(/dept_session=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    const { GET: me } = await import("@/app/api/auth/me/route");
    const meRes = await me(new NextRequest("http://localhost/api/auth/me", { headers: { Cookie: `dept_session=${token}` } }));
    const data = await meRes.json();
    expect(data.user.email).toBe("first@shinhan.com");
  });

  it("잘못된 비밀번호 → 401", async () => {
    await makeActiveUser();
    const { POST: login } = await import("@/app/api/auth/login/route");
    const res = await callPost(login, { email: "first@shinhan.com", password: "wrongpass" });
    expect(res.status).toBe(401);
  });

  it("pending 사용자는 로그인 불가(403)", async () => {
    const { POST: register } = await import("@/app/api/auth/register/route");
    await callPost(register, { email: "a@shinhan.com", name: "A", password: "secret123", departmentId: "claims-planning" });
    await callPost(register, { email: "b@shinhan.com", name: "B", password: "secret123", departmentId: "claims-planning" });
    const { POST: login } = await import("@/app/api/auth/login/route");
    const res = await callPost(login, { email: "b@shinhan.com", password: "secret123" });
    expect(res.status).toBe(403);
  });
});
