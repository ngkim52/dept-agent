import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { listEpisodes } from "@/lib/harness/review";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const departmentId = req.nextUrl.searchParams.get("departmentId") ?? undefined;
    const episodes = await listEpisodes(departmentId);
    return Response.json({ episodes });
  } catch (e) { return jsonError(e); }
}
