
import { describe, it, expect } from "vitest";
import { buildReportDraft } from "@/lib/dashboard/report";
import { strategyMindMap, linkStrategy, perspectiveLabel } from "@/lib/dashboard/strategy";

describe("보고서 초안 (컨셈§11)", () => {
  it("대화 → 5개 섹션 보고서 골격 생성", () => {
    const d = buildReportDraft([
      { role: "user", content: "부정청구 탐지 강화 방안 검토해줘" },
      { role: "assistant", content: "탐지 모델과 심사 기준을 제시합니다." },
    ]);
    expect(d.status).toBe("초안");
    expect(d.sections.map((s) => s.id)).toEqual(["상황", "분석", "평가·결론", "권고안", "후속조치"]);
    expect(d.title).toContain("부정청구");
    expect(d.sourceCount).toBe(1);
  });
  it("상황 섹션에 첫 사용자 질문 포함", () => {
    const d = buildReportDraft([{ role: "user", content: "즉시지급 확대" }]);
    expect(d.sections[0].content).toContain("즉시지급");
  });
});

describe("전략나침반 (컨셈§10)", () => {
  it("4개 퍼스펙티브 마인드맵", () => {
    const m = strategyMindMap();
    expect(m.perspectives).toHaveLength(4);
    expect(m.perspectives.every((p) => (p.children ?? []).length > 0)).toBe(true);
  });
  it("문서/카테고리 → 전략연결태그", () => {
    expect(linkStrategy("자동심사 대상 확대")).toBe("speed");
    expect(linkStrategy("서류없는 청구 편의성")).toBe("cx");
    expect(linkStrategy("부정청구 리스크")).toBe("anti");
    expect(linkStrategy({ key: "claims4" })).toBe("quality");
    expect(linkStrategy("점심시간")).toBeUndefined();
  });
  it("퍼스펙티브 label 조회", () => {
    expect(perspectiveLabel("quality")).toBe("품질·신뢰");
    expect(perspectiveLabel("없음")).toBe("없음");
  });
});
