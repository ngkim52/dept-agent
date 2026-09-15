import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError } from "@/lib/auth/http";
import { buildGraphWithLLM } from "@/lib/harness/knowledgeGraph";

// 지식 그래프 — LLM이 활성 지식 간 관계를 판단·저장
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req); requireAdmin(user);
    const body = await req.json().catch(() => ({}));
    const personaKey = String(req.nextUrl.searchParams.get("personaKey") ?? body.personaKey ?? "claims-planning");
    const result = await buildGraphWithLLM(personaKey);
    return Response.json(result);
  } catch (e: any) { return jsonError(e); }
}
