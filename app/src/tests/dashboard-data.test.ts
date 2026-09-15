import { describe, it, expect } from "vitest";
import { claimDashboard, seedDatasets, buildDashboardData } from "@/lib/dashboard/dashboardData";

// 기준: 2026-09-14(어제) → 9월(인덱스 8) 실적 슬라이스
function sep() { return buildDashboardData(new Date(2026, 8, 15, 10), new Date(2026, 8, 14, 10)); }

describe("대시보드 데이터 — 어제(9월) 실적 생성기", () => {
  it("핵심 KPI 5종 + 값 검증 (9월 실적)", () => {
    const d = sep();
    expect(d.kpis).toHaveLength(5);
    expect(d.kpis.map(k => k.key)).toEqual(["cum_paid", "loss_ratio", "claims_aug", "avg_days", "fraud"]);
    const loss = d.kpis.find(k => k.key === "loss_ratio")!;
    expect(loss.big).toBe("83.1");
    expect(loss.tag.text).toContain("+4.1%p");
  });
  it("모니터링 3종 (AI/품질/사기)", () => {
    const d = sep();
    expect(d.monitors).toHaveLength(3);
    expect(d.monitors.map(m => m.key)).toEqual(["ai", "quality", "fraud_m"]);
    expect(d.monitors[0].gaugePct).toBe(72.8); // 9월 자동심사 적용률
  });
  it("추이 데이터 12개월(연간) + 목표 손해율 79.0", () => {
    const d = sep();
    expect(d.trend.months).toHaveLength(12);
    expect(d.trend.paid).toHaveLength(12);
    expect(d.trend.lossRatio).toHaveLength(12);
    expect(d.trend.targetLoss).toBe(79.0);
    expect(d.trend.cumulative).toBe(3831); // 1~9월 누적
  });
  it("파이프라인 5단계 + 처리 흐름 노트 + 기준일(dataNote)이 어제 기준", () => {
    const d = sep();
    expect(d.pipeline).toHaveLength(5);
    expect(d.pipeline[3].label).toBe("지급 확정");
    expect(d.queueRows).toHaveLength(5);
    expect(d.deadlines).toHaveLength(3);
    expect(d.dataNote).toContain("어제(2026-09-14)");
  });
});

describe("RAGFlow 적재 명세 — 올해(12월까지) 연간 데이터", () => {
  it("섹션(항목)별 데이터셋 구성", () => {
    const keys = seedDatasets.map(d => d.key);
    for (const k of ["kpi", "pipeline", "queue", "monitor", "focus", "news"]) expect(keys).toContain(k);
  });
  it("각 데이터셋에 2개 이상의 문서(레코드) 적재", () => {
    for (const d of seedDatasets) {
      expect(d.docs.length, `dataset ${d.key}`).toBeGreaterThanOrEqual(2);
    }
  });
  it("KPI/모니터링은 연간(12월까지) 월별 문서 포함", () => {
    const kpi = seedDatasets.find(d => d.key === "kpi")!;
    const mon = seedDatasets.find(d => d.key === "monitor")!;
    expect(kpi.docs.length).toBe(12);
    expect(kpi.docs.some(x => x.filename.includes("2026년 12월"))).toBe(true);
    expect(mon.docs.length).toBe(12);
  });
  it("데이터셋 이름 고유 + 총 문서 수 (12월까지 연간 확장)", () => {
    const names = seedDatasets.map(d => d.datasetName);
    expect(new Set(names).size).toBe(names.length);
    const total = seedDatasets.reduce((a, d) => a + d.docs.length, 0);
    expect(total).toBe(38);
  });
});
