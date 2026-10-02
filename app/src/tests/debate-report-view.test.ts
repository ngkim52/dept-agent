import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReportView from "@/app/(app)/debate/[id]/ReportView";

const MD = `# 토론 최종 보고서 — 안건

## 1. 결론 (판정: 조건부 추진)

요약입니다.

## 5. 쟁점

| 쟁점 | 찬성 논거 | 반대 논거 |
| --- | --- | --- |
| 비용 | 12억 절감 | 4.8억 투입 |
`;

describe("토론 최종 보고서 뷰", () => {
  it("기본값이 '뷰어' — 원문 기호(#, |) 없이 HTML 로 렌더링한다", () => {
    const html = renderToStaticMarkup(createElement(ReportView, { id: "s1", md: MD, verdict: "조건부 추진", onReload: () => {} }));
    expect(html).toContain("<h1>토론 최종 보고서");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>비용</td>");
    expect(html).not.toContain("| --- |");
    expect(html).toContain("MD 뷰어 표시 중");
    expect(html).toContain("MD 파일 저장");
  });

  it("이스케이프된 개행(\\n 두 글자)이 섞여 있어도 뷰어가 문단으로 나눈다", () => {
    const escaped = "# 제목\\n\\n## 1. 결론\\n\\n본문";
    const html = renderToStaticMarkup(createElement(ReportView, { id: "s1", md: escaped, verdict: null, onReload: () => {} }));
    expect(html).toContain("<h1>제목</h1>");
    expect(html).toContain("<h2>1. 결론</h2>");
    expect(html).not.toContain("\\n");
  });

  it("보고서가 없으면 안내와 새로고침을 보여준다", () => {
    const html = renderToStaticMarkup(createElement(ReportView, { id: "s1", md: null, verdict: null, onReload: () => {} }));
    expect(html).toContain("아직 최종 보고서가 생성되지 않았습니다");
  });
});
