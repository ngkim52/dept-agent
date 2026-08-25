import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { getAllModelConfig, setSetting, MODEL_PURPOSES } from "@/lib/settings";

// GET: 현재 용도별 모델 설정 (DB 값 + env fallback 상태)
export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const { requireLlmConfig } = await import("@/lib/config");
    const cfg = requireLlmConfig();
    const dbValues = await getAllModelConfig();
    const { getModelForPurpose } = await import("@/lib/settings");
    const effective: Record<string, string> = {};
    for (const p of Object.keys(MODEL_PURPOSES) as (keyof typeof MODEL_PURPOSES)[]) {
      effective[p] = await getModelForPurpose(p);
    }
    return Response.json({
      baseUrl: cfg.llm.baseUrl,
      defaultModel: cfg.llm.model,
      purposes: MODEL_PURPOSES,
      dbValues,
      effective,
    });
  } catch (e) { return jsonError(e); }
}

// PUT: 용도별 모델 저장 (빈 값은 DB 항목 제거 → env fallback)
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") throw new HttpError(400, "잘못된 요청입니다.");
    const purposes = Object.keys(MODEL_PURPOSES);
    for (const key of Object.keys(body)) {
      if (!purposes.includes(key)) throw new HttpError(400, `알 수 없는 용도: ${key}`);
      const v = String(body[key] ?? "").trim();
      if (v) await setSetting(MODEL_PURPOSES[key as keyof typeof MODEL_PURPOSES].key, v);
      else await setSetting(MODEL_PURPOSES[key as keyof typeof MODEL_PURPOSES].key, null);
    }
    return Response.json({ ok: true });
  } catch (e) { return jsonError(e); }
}
