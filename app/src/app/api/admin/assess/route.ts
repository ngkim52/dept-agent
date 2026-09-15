import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { assessCandidates } from "@/lib/harness/assess";
import { listCandidates } from "@/lib/harness/review";

// GET /api/admin/assess?personaKey=&status=pending — 후보 큐 드라이런 평가
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as any;
    const candidates = await listCandidates({ personaKey, status });
    const report = assessCandidates(candidates.map((c) => ({ content: c.proposedContent })));
    return Response.json(report);
  } catch (e) { return jsonError(e); }
}
