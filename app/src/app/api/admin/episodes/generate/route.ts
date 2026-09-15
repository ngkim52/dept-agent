import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { generateEpisodeForDepartment } from "@/lib/harness/review";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const departmentId = req.nextUrl.searchParams.get("departmentId");
    if (!departmentId) throw new HttpError(400, "departmentId 필요");
    const dept = (await db.select().from(schema.departments).where(eq(schema.departments.id, departmentId)).limit(1))[0];
    const departName = dept?.name ?? departmentId;
    const result = await generateEpisodeForDepartment(departmentId, departName);
    return Response.json({ episode: result.episode, candidates: result.candidates });
  } catch (e) { return jsonError(e); }
}
