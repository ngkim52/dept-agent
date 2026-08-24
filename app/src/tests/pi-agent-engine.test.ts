import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb } from "./helpers";
import { buildPiAgent, makeSubAgentDelegateTool, type StreamFnLike } from "@/lib/agent/engine";
import { getPersona } from "@/lib/agent/personas";
import { Agent } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";
// eslint-disable-next-line

vi.mock("@/lib/ragflow/client", () => ({
  ragflow: { retrieve: vi.fn(async () => []) },
}));

function fakeModel(): Model<any> {
  return {
    id: "deepseek-v4-flash",
    name: "deepseek-v4-flash",
    provider: "litellm",
    api: "openai-completions",
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32768,
    maxTokens: 8192,
  };
}

/** fake streamFn: createAssistantMessageEventStream로 단일 텍스트 응답을 스트리밍 */
function textStreamFn(response: string): StreamFnLike {
  return () => {
    const s = createAssistantMessageEventStream();
    const partial: any = { role: "assistant", content: [], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "in_progress", timestamp: Date.now() };
    s.push({ type: "start", partial });
    const partial2: any = { ...partial, content: [{ type: "text", text: response, textSignature: "sig" }] };
    s.push({ type: "text_delta", contentIndex: 0, delta: response, partial: partial2 });
    const msg: any = { role: "assistant", content: [{ type: "text", text: response }], api: "openai-completions", provider: "litellm", model: "deepseek-v4-flash", stopReason: "stop", timestamp: Date.now(), usage: { input: 0, output: 0 } };
    s.end(msg as any);
    return s;
  };
}

describe("PI 에이전트 (pi-agent-core Agent) 엔진", () => {
  const model: Model<any> = fakeModel();

  it("delegate 툴은 부서 서브에이전트를 스폰해 결과 text를 반환", async () => {
    const tool = makeSubAgentDelegateTool(textStreamFn("계리 분석 완료: 요율 3대 요소는 위험률·이율·사업비입니다."), model);
    expect(tool.name).toBe("delegate");
    expect(tool.label).toContain("서브에이전트");
    const res = await tool.execute("tool-1", { department: "actuarial", question: "요율 요소?" });
    expect((res.content[0] as any).type).toBe("text");
    expect((res.content[0] as any).text).toContain("계리 분석 완료");
    expect(res.details.department).toBe("actuarial");
  });

  it("buildPiAgent는 persona.systemPrompt를 사용하고 tools에 delegate 툴 포함", () => {
    const persona = getPersona("claims-planning")!;
    const agent = buildPiAgent(persona, textStreamFn("답변"), model);
    expect(agent.state.systemPrompt).toContain("보험금심사기획 부서장");
    expect(agent.state.tools.map((x) => x.name)).toContain("delegate");
    expect(agent.state.model).toBe(model);
  });
});
