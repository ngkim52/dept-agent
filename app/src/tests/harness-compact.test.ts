import { describe, it, expect } from "vitest";
import { parseEpisodeJson, extractEpisode, buildEpisodePrompt } from "@/lib/harness/compact";

describe("compact.paresEpisodeJson", () => {
  it("깨끗한 JSON", () => {
    const r = parseEpisodeJson('{"summary":"s","conclusion":"c","reusable_rules":["r1"]}');
    expect(r).toEqual({ summary: "s", conclusion: "c", reusable_rules: ["r1"] });
  });
  it("코드블록과 잡음 제거", () => {
    const raw = "여기 결과입니다\n```json\n{\"summary\":\"질문 요약\",\"conclusion\":\"결론\",\"reusable_rules\":[]}\n```";
    const r = parseEpisodeJson(raw);
    expect(r.summary).toBe("질문 요약");
    expect(r.conclusion).toBe("결론");
  });
});

describe("extractEpisode", () => {
  it("transcript를 프롬프트로 넘겨 compact 콜 결과 파싱", async () => {
    const qas = [
      { messageId: "m1", role: "user" as const, content: "손해율이 5% 초과했어" },
      { messageId: "m2", role: "assistant" as const, content: "원인분석을 시작하세요." },
    ];
    const call = async (prompt: string) => {
      expect(prompt).toContain("손해율이 5% 초과했어");
      expect(prompt).toContain("부서: 보험금기획");
      return JSON.stringify({ summary: "손해율 초과 보고", conclusion: "5% 초과 시 원인분석", reusable_rules: ["무조건 착수"] });
    };
    const r = await extractEpisode(qas, "보험금기획", call);
    expect(r.summary).toBe("손해율 초과 보고");
    expect(r.reusable_rules).toEqual(["무조건 착수"]);
  });

  it("buildEpisodePrompt 구성", () => {
    expect(buildEpisodePrompt("부서", "text")).toContain("대상 부서: 부서");
    expect(buildEpisodePrompt("부서", "text")).toContain("text");
  });
});
