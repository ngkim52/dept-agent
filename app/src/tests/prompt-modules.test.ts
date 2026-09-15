
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, withDept } from "./helpers";
import { buildPersonaSystemPromptWithHarness, getPersonaSkills } from "@/lib/agent/skills";
import { classifyQuestion, selectFileSkills, MODULE_WEBSEARCH, MODULE_DATA_QUESTION } from "@/lib/agent/promptModules";

beforeEach(async () => { await resetDb(); await withDept(); });

describe("프롬프트 모듈화 (015-F2/F3)", () => {
  it("카테고리 지정 시 해당 스킬 포함 (예: claims6 → 사업계획KPI)", async () => {
    const all = getPersonaSkills("claims-planning");
    const sel = all.filter((s) => s.name.includes("사업계획KPI") || s.name.includes("사업계획"));
    expect(sel.length).toBeGreaterThan(0);
    const p = await buildPersonaSystemPromptWithHarness("claims-planning", "BASE", { categoryKey: "claims6", style: "conclusion", selectedSkills: sel });
    expect(p).toContain("사업계획KPI");
    expect(p).toContain("응답 스타일: 결론형");
  });

  it("질문 분류: 손해율 질문 → claims1 스킬만 선택, 일반 질문 → 기본처리 스킬", () => {
    const all = getPersonaSkills("claims-planning");
    const 손해율 = selectFileSkills(all, "claims-planning", "손해율이 계획 대비 5% 초과한 원인을 분석해줘", null);
    expect(손해율.some((s) => s.name.includes("지급보험금"))).toBe(true);
    const 일반 = selectFileSkills(all, "claims-planning", "회의실 예약 방법을 알려줘", null);
    expect(일반.some((s) => s.name.includes("기본"))).toBe(true);
  });

  it("데이터 존재 질문 → 데이터 질문 처리 모듈 포함", () => {
    const int = classifyQuestion("claims-planning", "작년 손해율 데이터 있어?", null);
    expect(int.modules).toContain("dataQuestion");
    expect(MODULE_DATA_QUESTION).toContain("데이터 존재 여부");
  });

  it("웹검색 모듈은 분리 관리되며 기본 프롬프트에는 없음", () => {
    expect(MODULE_WEBSEARCH).toContain("websearch");
    // personas.ts 기본(역할) 프롬프트에는 웹검색 섹션이 분리됨
    expect(MODULE_WEBSEARCH).not.toBe("");
  });
});
