import { describe, it, expect } from "vitest";
import { dedupSources, buildBriefingFromSources, sourceNameOf, BRIEFING_QUERIES } from "@/lib/dashboard/briefing";

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
