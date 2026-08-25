import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { getAllModelConfig, setSetting, MODEL_PURPOSES } from "@/lib/settings";

// GET: 현재 용도별 모델 설정 (게이트웨이 추가, DB 값 + env fallback 상태)
export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const { requireLlmConfig, config } = await import("@/lib/config");
    const cfg = requireLlmConfig();
    const dbValues = await getAllModelConfig();
    const { getModelForPurpose } = await import("@/lib/settings");
    const effective: Record<string, any> = {};
    for (const p of Object.keys(MODEL_PURPOSES) as (keyof typeof MODEL_PURPOSES)[]) {
      effective[p] = await getModelForPurpose(p);
    }
    const gateways = Object.entries((config as any).llmGateways ?? {}).map(([id, g]: [string, any]) => ({
      id,
      label: g.label ?? id,
      baseUrl: g.baseUrl,
      hasKey: Boolean(g.apiKey),
    }));
    return Response.json({
      baseUrl: cfg.llm.baseUrl,
      defaultModel: cfg.llm.model,
      purposes: MODEL_PURPOSES,
      gateways,
      dbValues,
      effective,
    });
  } catch (e) { return jsonError(e); }
}

// PUT: 용도별 모델 저장 — 값은 { model, gateway } (gateway 기본 litellm), 빈 값은 DB 항목 제거
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object") throw new HttpError(400, "잘못된 요청입니다.");
    const purposes = Object.keys(MODEL_PURPOSES);
    for (const key of Object.keys(body)) {
      if (!purposes.includes(key)) throw new HttpError(400, `알 수 없는 용도: ${key}`);
      const v = body[key as keyof typeof MODEL_PURPOSES];
      if (v == null || v === "") {
        await setSetting(MODEL_PURPOSES[key as keyof typeof MODEL_PURPOSES].key, null);
        continue;
      }
      if (typeof v === "string") {
        // 호환: 문자열이면 litellm 게이트웨이로 저장
        await setSetting(MODEL_PURPOSES[key as keyof typeof MODEL_PURPOSES].key, { model: v, gateway: "litellm" });
        continue;
      }
      if (typeof v === "object") {
        const model = String((v as any).model ?? "").trim();
        const gateway = String((v as any).gateway ?? "litellm").trim() || "litellm";
        if (!model) { await setSetting(MODEL_PURPOSES[key as keyof typeof MODEL_PURPOSES].key, null); continue; }
        await setSetting(MODEL_PURPOSES[key as keyof typeof MODEL_PURPOSES].key, { model, gateway });
      }
    }
    return Response.json({ ok: true });
  } catch (e) { return jsonError(e); }
}
