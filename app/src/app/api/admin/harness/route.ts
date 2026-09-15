import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { listPrompts, listSkills, listMemories, createPrompt, createSkill, createMemory } from "@/lib/harness/store";
import { listEffective } from "@/lib/harness/inventory";
import type { HarnessEntryType } from "@/lib/harness/store";

const TYPES = new Set(["prompt", "skill", "memory"]);

function routes(userId: string) {
  return {
    async list(type: HarnessEntryType, personaKey?: string) {
      if (type === "prompt") return listPrompts(personaKey);
      if (type === "skill") return listSkills(personaKey);
      return listMemories(personaKey);
    },
    async create(type: HarnessEntryType, body: any) {
      if (type === "prompt") {
        if (!body.content) throw new HttpError(400, "content 필요");
        return createPrompt({
          personaKey: String(body.personaKey ?? "claims-planning"),
          kind: body.kind ?? "addendum", title: String(body.title ?? "제목 없음"),
          content: String(body.content), origin: body.origin ?? "manual",
          confidence: typeof body.confidence === "number" ? body.confidence : 1,
          sourceType: body.sourceType, sourceId: body.sourceId,
          orderIdx: typeof body.orderIdx === "number" ? body.orderIdx : 0,
        }, userId);
      }
      if (type === "skill") {
        if (!body.content) throw new HttpError(400, "content 필요");
        return createSkill({
          personaKey: String(body.personaKey ?? "claims-planning"),
          name: String(body.name ?? "새 스킬"), description: String(body.description ?? ""),
          content: String(body.content), origin: body.origin ?? "manual",
          confidence: typeof body.confidence === "number" ? body.confidence : 1,
          sourceType: body.sourceType, sourceId: body.sourceId,
          orderIdx: typeof body.orderIdx === "number" ? body.orderIdx : 0,
        }, userId);
      }
      if (!body.content) throw new HttpError(400, "content 필요");
      return createMemory({
        personaKey: String(body.personaKey ?? "claims-planning"),
        kind: body.kind ?? "fact", content: String(body.content),
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        origin: body.origin ?? "manual", confidence: typeof body.confidence === "number" ? body.confidence : 1,
        sourceConversationId: body.sourceConversationId, sourceMessageId: body.sourceMessageId,
      }, userId);
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const type = (req.nextUrl.searchParams.get("type") ?? "") as HarnessEntryType;
    if (!TYPES.has(type)) throw new HttpError(400, "type 필요 (prompt|skill|memory)");
    const personaKey = req.nextUrl.searchParams.get("personaKey") ?? undefined;
    const items = await listEffective(type, personaKey); // 기본(base)+학습(learned) 병합 목록
    return Response.json({ type, items, merged: true });
  } catch (e) { return jsonError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const type = (req.nextUrl.searchParams.get("type") ?? "") as HarnessEntryType;
    if (!TYPES.has(type)) throw new HttpError(400, "type 필요 (prompt|skill|memory)");
    const body = await req.json().catch(() => ({}));
    const item = await routes(user.id).create(type, body);
    return Response.json({ item }, { status: 201 });
  } catch (e) { return jsonError(e); }
}
