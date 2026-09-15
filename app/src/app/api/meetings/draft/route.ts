import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { draftMinutes } from "@/lib/meetings";

/** POST /api/meetings/draft — 원문 → 회의록 초안 */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const rawText = String(body.rawText ?? "").trim();
    if (!rawText) return jsonError(new HttpError(400, "회의 원문이 필요합니다"));
    const { minutes, summary } = draftMinutes(rawText);
    return Response.json({ minutes, summary });
  } catch (e) { return jsonError(e); }
}
