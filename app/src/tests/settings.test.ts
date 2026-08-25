import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers";
import { setSetting, getSetting, getModelForPurpose, getAllModelConfig } from "@/lib/settings";

beforeEach(async () => { await resetDb(); });

describe("app_settings", () => {
  it("set/get 왕복 (JSON 저장)", async () => {
    await setSetting("model_response", "openai/gpt-5.6-terra");
    expect(await getSetting("model_response")).toBe("openai/gpt-5.6-terra");
    await setSetting("model_response", "new/model");
    expect(await getSetting("model_response")).toBe("new/model"); // upsert
  });

  it("용도별 모델 — DB 값 우선, 없으면 env/기본 fallback", async () => {
    // 처음엔 DB 비어있음 → env LLM_MODEL 사용 (테스트 env는 기본 fallback)
    const before = await getModelForPurpose("response");
    expect(before.model).toBeTruthy();
    expect(before.gateway).toBe("litellm");
    await setSetting("model_response", { model: "openai/gpt-5.6-luna", gateway: "openrouter" });
    const after = await getModelForPurpose("response");
    expect(after.model).toBe("openai/gpt-5.6-luna");
    expect(after.gateway).toBe("openrouter");
    // other purpose는 영향 없음
    expect((await getModelForPurpose("compact")).model).toBeTruthy();
  });

  it("getAllModelConfig — 전 용도 DB 값 반환", async () => {
    await setSetting("model_bulk", { model: "deepseek/deepseek-v4-flash", gateway: "litellm" });
    const all = await getAllModelConfig();
    expect(all.bulk).toEqual({ model: "deepseek/deepseek-v4-flash", gateway: "litellm" });
    expect(all.response).toBeNull();
    expect(all.simple).toBeNull();
    expect(all.compact).toBeNull();
  });
});
