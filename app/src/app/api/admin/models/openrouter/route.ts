import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { config } from "@/lib/config";

// OpenRouter 모델 목록 프록시 — API 키는 서버에만 보관, 클라이언트에 노출하지 않는다
export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const base = config.llm.baseUrl || "https://openrouter.ai/api/v1";
    const apiKey = config.llm.apiKey;
    if (!apiKey) throw new HttpError(400, "LLM_API_KEY가 설정되어 있지 않습니다. OpenRouter 키를 .env에 넣어주세요.");
    const res = await fetch(base.replace(/\/$/, "") + "/models", {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new HttpError(502, `모델 목록 조회 실패 (${res.status})`);
    const data = await res.json();
    const models = (data.data ?? data.models ?? []).map((m: any) => ({
      id: m.id,
      name: m.name ?? m.id,
      context: m.context_length ?? m.context ?? 0,
      input: m.pricing?.prompt ? Number(m.pricing.prompt) : 0,
      input_str: m.pricing?.prompt ?? "",
      output: m.pricing?.completion ? Number(m.pricing.completion) : 0,
      output_str: m.pricing?.completion ?? "",
    })).sort((a: any, b: any) => (a.input || 999) - (b.input || 999));
    return Response.json({ models, source: base });
  } catch (e) { return jsonError(e); }
}
