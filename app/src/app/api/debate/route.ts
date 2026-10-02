import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser, jsonError, HttpError } from "@/lib/auth/http";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/auth/ratelimit";
import { createSession, listSessions, listAllPersonas } from "@/lib/debate/store";
import { clampDuration, normalizeParticipantKeys, MIN_PARTICIPANTS } from "@/lib/debate/validate";

// GET /api/debate — 토론 목록 (최근순)
export async function GET(req: NextRequest) {
  try {
    await requireUser(req);
    const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 30);
    const sessions = await listSessions({ limit: Number.isFinite(limitRaw) ? limitRaw : 30 });
    return Response.json({ sessions });
  } catch (e) { return jsonError(e); }
}

// POST /api/debate — 토론 세션 생성 { title, brief?, durationSec?, participantKeys? }
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const rl = checkRateLimit(req, `debate:${user.id}`, 10);
    if (!rl.ok) return rateLimitExceededResponse(rl.retryAfterSeconds);

    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    if (!title) throw new HttpError(400, "토론 주제(title)가 필요합니다.");
    const brief = String(body.brief ?? "").trim();
    const attachmentName = body.attachmentName ? String(body.attachmentName).slice(0, 200).trim() : null;
    const durationSec = clampDuration(body.durationSec);

    const personas = await listAllPersonas();
    const valid = new Set(personas.filter((p) => p.kind !== "conclusion").map((p) => p.key));
    const participantKeys = normalizeParticipantKeys(body.participantKeys, valid);
    if (participantKeys.length < MIN_PARTICIPANTS) throw new HttpError(400, "참가자를 2명 이상 선택해 주세요.");

    const session = await createSession({ id: randomUUID(), title, brief, attachmentName, durationSec, participantKeys, createdBy: user.id });
    return Response.json({ session }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
