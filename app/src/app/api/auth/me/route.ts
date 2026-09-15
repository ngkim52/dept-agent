import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    return Response.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, departmentId: u.departmentId, responseStyle: u.responseStyle } });
  } catch (e) { return jsonError(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const u = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const style = String(body.responseStyle ?? "");
    if (!["coaching", "conclusion"].includes(style)) {
      return Response.json({ error: "responseStyle은 coaching 또는 conclusion이어야 합니다." }, { status: 400 });
    }
    const { db, schema } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    await db.update(schema.users).set({ responseStyle: style as "coaching" | "conclusion" }).where(eq(schema.users.id, u.id));
    return Response.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, departmentId: u.departmentId, responseStyle: style } });
  } catch (e) { return jsonError(e); }
}
