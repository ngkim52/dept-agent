
import { describe, it, expect } from "vitest";
import { kpiCatalog, kpiTrendContext, type Kpi } from "@/lib/dashboard/kpis";

describe("KPI 8개 지표 (컨셈§09)", () => {
  it("정확히 8개 + 이름/목표 값검증", () => {
    expect(kpiCatalog).toHaveLength(8);
    const labels = kpiCatalog.map((k) => k.label);
    for (const l of ["자동화율","디지털 처리율","보험금 처리기일","즉시지급률","서류없는 청구 이용율","지급지연율","품질점검 시행율","오류율"]) {
      expect(labels).toContain(l);
    }
    const q = kpiCatalog.find((k) => k.key === "quality_check_rate")!;
    expect(q.target).toBe(13); // 품질점검 시행율 목표 13%
    expect(q.trend).toHaveLength(6); // 최근 6개월 시계열
  });
  it("모든 로우에 trend 6개월 + direction + linkedCategory", () => {
    for (const k of kpiCatalog) {
      expect(k.trend.length).toBeGreaterThanOrEqual(6);
      expect(k.linkedCategory).toBeTruthy();
      expect(["관리","대응"]).toContain(k.direction);
    }
  });
});

describe("전월대비 배지 + 개별/구조 분류 (2단계)", () => {
  it("지급지연율(악화 중 3개월) → 구조적 + 배지 악화", () => {
    const k = kpiCatalog.find((x) => x.key === "delay_rate")!;
    const ctx = kpiTrendContext(k);
    expect(ctx.deltaFromBaseline).toBe(0.8); // 4.2 - 3.4
    expect(ctx.structural).toBe(true);          // 3개월째 지속
    expect(ctx.months).toBeGreaterThanOrEqual(3);
  });
  it("즉시지급률(상승, 목표 근접) → 양호/개선", () => {
    const k = kpiCatalog.find((x) => x.key === "instant_rate")!;
    const ctx = kpiTrendContext(k);
    expect(ctx.months).toBe(0);             // 목표를 벗어나지 않음
    expect(ctx.structural).toBe(false);
  });
  it("오류율(추세 상승, 목표 초과) → 악화", () => {
    const k = kpiCatalog.find((x) => x.key === "error_rate")!;
    const ctx = kpiTrendContext(k);
    expect(badDirCheck(k)).toBe(true);
    expect(ctx.badge).toBe("악화");
  });
});
function badDirCheck(k: Kpi) {
  return k.goodWhen === "down" ? k.value > k.target : k.value < k.target;
}
