import { NextRequest } from "next/server";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { refineMinutes, mdFromRawText } from "@/lib/meetings";

/** POST /api/meetings/refine — 회의 원문(붙여넣기·파일) → 회의록 양식 MD (LLM 정리)
 *  LLM 실패/미설정 시 결정적 휴리스틱 초안으로 응답(always 200). */
export async function POST(req: NextRequest) {
  try {
    await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const rawText = String(body.rawText ?? "").trim();
    if (!rawText) return jsonError(new HttpError(400, "회의 원문이 필요합니다"));
    const title = String(body.title ?? "").trim();
    const { md, title: t } = await refineMinutes(rawText, title || undefined);
    return Response.json({ md, title: t, fallback: mdFromRawText(rawText, title || undefined) === md });
  } catch (e) { return jsonError(e); }
}
