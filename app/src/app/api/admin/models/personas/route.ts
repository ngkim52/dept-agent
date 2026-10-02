import { NextRequest } from "next/server";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { getPersonaModelOverrides, setPersonaModelOverride } from "@/lib/debate/models";
import { listAllPersonas } from "@/lib/debate/store";
import { getModelForPurpose } from "@/lib/settings";

// 토론방 페르소나별 모델 설정 (관리자 전용)
//  - 페르소나마다 다른 모델을 지정할 수 있다. 미지정이면 "simple" 용도 기본 모델을 쓴다.
async function safeDefault() {
  try {
    return await getModelForPurpose("simple");
  } catch {
    return { model: "", gateway: "litellm" };
  }
}

export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const [personas, overrides, def] = await Promise.all([listAllPersonas(), getPersonaModelOverrides(), safeDefault()]);
    return Response.json({
      defaultSelection: def,
      personas: personas.map((p) => ({
        key: p.key,
        name: p.name,
        emoji: p.emoji,
        role: p.role,
        kind: p.kind,
        builtin: p.builtin,
        override: overrides[p.key] ?? null,
        effective: overrides[p.key] ?? def,
        source: overrides[p.key] ? "persona" : "default",
      })),
    });
  } catch (e) { return jsonError(e); }
}

// PUT { overrides: { personaKey: {model, gateway} | null } } — null/빈 값은 지정 해제
export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const body = await req.json().catch(() => ({}));
    const overrides = (body as { overrides?: unknown }).overrides;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new HttpError(400, "overrides 객체가 필요합니다.");
    const valid = new Set((await listAllPersonas()).map((p) => p.key));
    let applied = 0;
    for (const [key, sel] of Object.entries(overrides as Record<string, unknown>)) {
      if (!valid.has(key)) throw new HttpError(400, `알 수 없는 페르소나: ${key}`);
      const v = sel && typeof sel === "object" ? (sel as Record<string, unknown>) : null;
      const model = v ? String(v.model ?? "").trim() : "";
      const gateway = (v ? String(v.gateway ?? "litellm").trim() : "") || "litellm";
      await setPersonaModelOverride(key, model ? { model, gateway } : null);
      applied++;
    }
    return Response.json({ ok: true, applied });
  } catch (e) { return jsonError(e); }
}
