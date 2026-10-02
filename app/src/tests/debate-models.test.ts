import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers";
import { getPersonaModelOverrides, setPersonaModelOverride, pickPersonaModel } from "@/lib/debate/models";

beforeEach(async () => { await resetDb(); });

describe("페르소나별 모델 설정", () => {
  it("지정값 저장/조회 왕복", async () => {
    expect(await getPersonaModelOverrides()).toEqual({});
    await setPersonaModelOverride("critic", { model: "deepseek/deepseek-v4.1-flash", gateway: "openrouter" });
    await setPersonaModelOverride("optimist", { model: "openai/gpt-5.6-luna", gateway: "openrouter" });
    const o = await getPersonaModelOverrides();
    expect(o.critic).toEqual({ model: "deepseek/deepseek-v4.1-flash", gateway: "openrouter" });
    expect(Object.keys(o).sort()).toEqual(["critic", "optimist"]);
  });

  it("빈 값/null 은 지정 해제", async () => {
    await setPersonaModelOverride("critic", { model: "m1", gateway: "litellm" });
    await setPersonaModelOverride("critic", null);
    expect(await getPersonaModelOverrides()).toEqual({});
    await setPersonaModelOverride("critic", { model: "m1", gateway: "litellm" });
    await setPersonaModelOverride("critic", { model: "", gateway: "litellm" } as any);
    expect(await getPersonaModelOverrides()).toEqual({});
  });

  it("gateway 미지정은 litellm 으로 정규화", async () => {
    await setPersonaModelOverride("fss", { model: "m2" } as any);
    expect((await getPersonaModelOverrides()).fss).toEqual({ model: "m2", gateway: "litellm" });
  });

  it("pickPersonaModel 은 지정된 페르소나만 반환", () => {
    const overrides = { critic: { model: "x", gateway: "openrouter" } };
    expect(pickPersonaModel("critic", overrides)).toEqual({ model: "x", gateway: "openrouter" });
    expect(pickPersonaModel("finance", overrides)).toBeNull();
  });
});
