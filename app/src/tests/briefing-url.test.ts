import { describe, it, expect } from "vitest";
import { getNews } from "@/lib/news";
import { parseBriefingJson } from "@/lib/dashboard/briefing";

describe("브리핑 JSON 파싱", () => {
  it("JSON 블록(``` 포함)에서 구조를 추출한다", () => {
    const text = `\`\`\`json\n{"executiveSummary":"요약입니다","actions":[{"topic":"A","summary":"요약A","sources":["s0","s1"]}]}\n\`\`\``;
    const p = parseBriefingJson(text);
    expect(p?.executiveSummary).toBe("요약입니다");
    expect(p?.actions[0].sources).toEqual(["s0", "s1"]);
  });
  it("잘못된 JSON은 null", () => {
    expect(parseBriefingJson("not json")).toBeNull();
  });
});

describe("뉴스 1시간 캐시/재구성", () => {
  it("getNews가 검색 결과와 fetchedAt을 반환", async () => {
    const { items, fetchedAt } = await getNews();
    expect(items.length).toBeGreaterThan(0);
    expect(new Date(fetchedAt).getTime()).not.toBeNaN();
  });
});
