import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MarkdownViewer from "@/components/MarkdownViewer";

const MD = `# 토론 최종 보고서 — 안건

- 작성: 최종 결론 에이전트
- 참가자: 금감원, 재무

## 1. 결론 (판정: 조건부 추진)

요약 문장입니다. **강조**와 \`코드\` 포함.

## 5. 쟁점

| 쟁점 | 찬성 논거 | 반대 논거 |
| --- | --- | --- |
| 비용 | 12억 절감 | 4.8억 투입 |

## 10. 권고 액션

1. 파일럿 3개월
2. 오탐률 1.5% 이하

> 조건부 합의
`;

describe("MarkdownViewer", () => {
  it("제목/목록/표/인용을 HTML 로 렌더링한다(원문 기호 노출 금지)", () => {
    const html = renderToStaticMarkup(MarkdownViewer({ content: MD }) as any);
    expect(html).toContain("<h1>토론 최종 보고서");
    expect(html).toContain("<h2>1. 결론 (판정: 조건부 추진)</h2>");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>쟁점</th>");
    expect(html).toContain("<td>비용</td>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<strong>강조</strong>");
    expect(html).not.toContain("## ");
    expect(html).not.toContain("| --- |");
  });
});
