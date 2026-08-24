import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";

export async function GET(req: NextRequest) {
  try {
    const u = await requireUser(req);
    return Response.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, departmentId: u.departmentId } });
  } catch (e) { return jsonError(e); }
}
