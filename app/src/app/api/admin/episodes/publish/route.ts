import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { publishEpisodeConclusion } from "@/lib/harness/review";

// 에피소드 결론 → 지식(메모리) 즉시 저장
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id) throw new HttpError(400, "id 필요");
    const result = await publishEpisodeConclusion(id, user.id);
    return Response.json(result);
  } catch (e) { return jsonError(e); }
}
