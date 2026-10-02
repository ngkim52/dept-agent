import { describe, it, expect } from "vitest";
import { dedupSources, buildBriefingFromSources, sourceNameOf, BRIEFING_QUERIES, parseBriefingJson, buildBriefingPrompt } from "@/lib/dashboard/briefing";

const s = (id: string, url: string, cat: string) => ({ id, title: "제목 " + id, url, source: "tester", snippet: "요약", category: cat });

describe("업계동향 브리핑 (실검색 기반, 재설계)", () => {
  it("같은 url은 중복 제거된다", () => {
    const list = [s("a", "https://a.com/x", "생명보험회사"), s("b", "https://a.com/x", "생명보험회사"), s("c", "https://b.com/y", "손해보험회사")];
    expect(dedupSources(list).map((x) => x.url)).toEqual(["https://a.com/x", "https://b.com/y"]);
  });
  it("카테고리당 상한(기본 6개)을 지킨다", () => {
    const list = Array.from({ length: 9 }, (_, i) => s("i" + i, "https://x.com/" + i, "생명보험회사"));
    expect(dedupSources(list).length).toBe(6);
  });
  it("buildBriefingFromSources 로 소스목록 기반 브리핑을 만든다", () => {
    const srcs = [s("s0", "https://a.com", "생명보험회사"), s("s1", "https://b.com", "손해보험회사")];
    const b = buildBriefingFromSources(srcs);
    expect(b.flags.sourceCount).toBe(2);
    expect(b.categories).toEqual(BRIEFING_QUERIES.map((c) => c.category));
    expect(b.actions.length).toBe(BRIEFING_QUERIES.length);
    expect(b.actions[0].sources).toContain("s0");
    expect(b.actions[1].sources).toContain("s1");
  });
  it("빈 소스 → sourceCount 0 브리핑", () => {
    expect(buildBriefingFromSources([]).flags.sourceCount).toBe(0);
  });
  it("sourceNameOf 는 www 를 제거한 호스트를 반환한다", () => {
    expect(sourceNameOf("https://www.insnews.co.kr/a")).toBe("insnews.co.kr");
  });
});

describe("신한라이프 대비·준비 브리핑 (v2)", () => {
  it("parseBriefingJson 이 대비 과제 필드(impact/action/owner/urgency)를 채운다", () => {
    const text = "```json\n" + JSON.stringify({
      executiveSummary: "동향 요약. 신한라이프는 심사 기준을 사전 점검해야 합니다.",
      actions: [{ topic: "실손 할인특약 대응", summary: "11월 시행 예정", impact: "심사 기준 변경 필요", action: "청구 접수·전산 반영 점검표 작성", owner: "보험금심사기획", urgency: "즉시", sources: ["s3", "s24"] }],
    }) + "\n```";
    const p = parseBriefingJson(text);
    expect(p?.actions[0].topic).toBe("실손 할인특약 대응");
    expect(p?.actions[0].impact).toBe("심사 기준 변경 필요");
    expect(p?.actions[0].action).toBe("청구 접수·전산 반영 점검표 작성");
    expect(p?.actions[0].owner).toBe("보험금심사기획");
    expect(p?.actions[0].urgency).toBe("즉시");
  });

  it("기존 스키마(topic/summary만)도 action 을 summary 로 폴백해 받아들인다", () => {
    const p = parseBriefingJson('{"executiveSummary":"s","actions":[{"topic":"A","summary":"요약A","sources":["s0"]}]}');
    expect(p?.actions[0].action).toBe("요약A");
    expect(p?.actions[0].impact).toBe("");
    expect(p?.actions[0].urgency).toBe("");
  });

  it("잘린(truncated) LLM 응답도 복원한다", () => {
    const p = parseBriefingJson('{"executiveSummary":"동향","actions":[{"topic":"A","summary":"s","impact":"i","action":"a1"},{"topic":"B","summary":"s2","action":"a2');
    expect(p?.executiveSummary).toBe("동향");
    expect(p?.actions.length).toBe(2);
    expect(p?.actions[1].action).toBe("a2");
  });

  it("알 수 없는 urgency 값은 빈 문자열로 정규화", () => {
    const p = parseBriefingJson('{"executiveSummary":"s","actions":[{"topic":"A","summary":"s","action":"a","urgency":"긴급"}]}');
    expect(p?.actions[0].urgency).toBe("");
  });

  it("buildBriefingPrompt 는 신한라이프 관점의 대비·준비를 요구하고 소스 id를 포함한다", () => {
    const srcs = [s("s0", "https://a.com", "생명보험회사"), s("s1", "https://b.com", "보험업계 · 감독/규제")];
    const prompt = buildBriefingPrompt(srcs);
    expect(prompt).toContain("신한라이프");
    expect(prompt).toContain("대비");
    expect(prompt).toContain("s0");
    expect(prompt).toContain("owner");
    expect(prompt).toContain("urgency");
  });

  it("fallback 브리핑도 대비·준비 필드를 채운다", () => {
    const b = buildBriefingFromSources([s("s0", "https://a.com", "생명보험회사")]);
    expect(b.actions[0].action.length).toBeGreaterThan(0);
    expect(b.actions[0].impact.length).toBeGreaterThan(0);
    expect(b.actions[0].owner).toBe("보험금기획");
  });
});
