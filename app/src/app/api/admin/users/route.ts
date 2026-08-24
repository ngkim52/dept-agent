import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const users = await db.query.users.findMany({ orderBy: (u, { asc }) => [asc(u.createdAt)] });
    return Response.json({ users: users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, departmentId: u.departmentId, createdAt: u.createdAt })) });
  } catch (e) { return jsonError(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const body = await req.json().catch(() => ({}));
    const userId = String(body.userId ?? "");
    const status = String(body.status ?? "");
    if (status !== "active" && status !== "rejected") throw new HttpError(400, "상태 값이 올바르지 않습니다.");
    const target = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (!target) throw new HttpError(404, "사용자가 없습니다.");
    await db.update(schema.users).set({ status: status as "active" | "rejected" }).where(eq(schema.users.id, userId));
    return Response.json({ ok: true });
  } catch (e) { return jsonError(e); }
}
