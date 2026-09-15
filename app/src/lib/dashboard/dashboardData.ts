// 보험금심사기획팀 대시보드 데이터 — 생성기(2026년 1~12월 연간 시계열 기반)
// - 기준일은 항상 "어제(today-1, KST)" — asOf/dataNote 는 오늘 날짜 기준 표기.
// - 올해(1~12월) 전체 데이터 생성(RAGFlow 적재 소스) + UI는 어제가 속한 달 실적 슬라이스 조회.
import { kstYmd, kstDateStr, kstDocDateStr } from "@/lib/dates";

export const YEAR = 2026;
export const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const MONTHS = MONTH_LABELS.map((m) => `${YEAR}년 ${m}`);

// ---------- 연간(1~12월) 시계열 ----------
const RECEIPT = [112400,114800,117200,119600,121100,122400,121050,128540,130900,133200,135800,138100]; // 청구 접수(건)
const PAID    = [109800,111200,113800,115600,117100,118900,121050,125902,128200,130600,133100,135400]; // 지급 처리(건)
const PAID_AMT= [380,391,402,412,419,431,445,468,483,497,512,528]; // 월 지급보험금(억 원)
const LOSS    = [76.2,77.0,77.8,78.6,79.4,80.1,81.3,82.4,83.1,83.6,84.0,84.3]; // 손해율(%)
const AUTO_PCT= [58.0,59.5,61.0,63.2,65.4,67.8,69.6,71.3,72.8,74.2,75.4,76.5]; // 자동심사 적용률(%)
const FRAUD   = [168,176,182,190,201,218,243,214,226,211,198,205];   // 보험사기 의심 적발(건)
const DAYS    = [5.1,4.9,4.7,4.4,4.2,4.0,3.5,3.2,3.0,2.9,2.8,2.7]; // 평균 지급 소요(일)
const TARGET_LOSS = 79.0;

const fmt = (n: number) => n.toLocaleString("ko-KR");
const touch = (n: number) => n.toFixed(1);
const cum = (arr: number[], i: number) => arr.slice(0, i + 1).reduce((a, b) => a + b, 0);

export type KpiCard = {
  key: string; label: string; big: string; unit: string;
  tag: { text: string; tone: "g"|"r"|"a"|"b"|"n" };
  foot: string; barPct?: number; barLabel?: string; trend?: number[];
};
function buildKpis(i: number): KpiCard[] {
  const monthNo = i + 1;
  const lossDelta = Math.round((LOSS[i] - TARGET_LOSS) * 10) / 10;
  const cumAmt = cum(PAID_AMT, i);
  const avg = Math.round(cumAmt / monthNo);
  return [
    { key: "cum_paid", label: `누적 지급보험금 (1–${monthNo}월)`, big: fmt(cumAmt), unit: "억 원",
      tag: { text: "전년 동기 +6.8%", tone: "g" }, foot: `월평균 ${avg}억`,
      trend: PAID_AMT.slice(0, i + 1).map((_, k) => cum(PAID_AMT, k)) },
    { key: "loss_ratio", label: "지급보험금 손해율", big: touch(LOSS[i]), unit: "%",
      tag: { text: `목표 +${lossDelta}%p 초과`, tone: "r" },
      foot: `목표 ${TARGET_LOSS}% · ${monthNo - 1}월 ${touch(LOSS[i - 1])}% → ${monthNo}월 ${touch(LOSS[i])}%`,
      barPct: LOSS[i], barLabel: `${TARGET_LOSS}`, trend: LOSS.slice(0, i + 1) },
    { key: "claims_aug", label: `${monthNo}월 청구 처리`, big: fmt(PAID[i]), unit: "건",
      tag: { text: "처리율 97.9%", tone: "g" }, foot: `접수 ${fmt(RECEIPT[i])}건`, trend: PAID.slice(0, i + 1) },
    { key: "avg_days", label: "평균 지급 소요", big: touch(DAYS[i]), unit: "일",
      tag: { text: "목표 5일 이내", tone: "g" }, foot: `전월 ${touch(DAYS[i - 1])}일`, barPct: Math.round((DAYS[i] / 5) * 100), barLabel: "5.0", trend: DAYS.slice(0, i + 1) },
    { key: "fraud", label: "보험사기 의심 적발", big: fmt(FRAUD[i]), unit: "건",
      tag: { text: FRAUD[i] <= FRAUD[i - 1] ? "전월比 -" + (Math.round((1 - FRAUD[i] / FRAUD[i - 1]) * 10) / 10) : "전월比 +" + (Math.round((FRAUD[i] / FRAUD[i - 1] - 1) * 10) / 10), tone: "a" },
      foot: "적발액 37.8억 · 회수 22.5억", trend: FRAUD.slice(0, i + 1) },
  ];
}

export type PipeStage = { label: string; num: string; unit: string; sub: string; tone: "n"|"b"|"a"|"g"|"r" };
function buildPipeline(i: number): PipeStage[] {
  const auto = Math.round(RECEIPT[i] * AUTO_PCT[i] / 100);
  const manual = RECEIPT[i] - auto;
  return [
    { label: "접수", num: fmt(RECEIPT[i]), unit: "건", tone: "n", sub: "전월比 +6.2% · 실손·상해 급증" },
    { label: "AI 자동심사", num: fmt(auto), unit: "건", tone: "b", sub: `적용률 ${touch(AUTO_PCT[i])}% · 절감 약 2.1만 인시` },
    { label: "수동심사", num: fmt(manual), unit: "건", tone: "a", sub: "대기 928 · 초과 156 · 평균 4.1일" },
    { label: "지급 확정", num: fmt(PAID[i]), unit: "건", tone: "g", sub: `누적 ${fmt(cum(PAID_AMT, i))}억 원 · 평균 ${touch(DAYS[i])}일` },
    { label: "민원 내용", num: "30", unit: "건", tone: "r", sub: "보류 12 · 민원 8 · 기한 초과 10건" },
  ];
}
export const pipelineFlowNote = "전체 처리율 97.9% · 미처리 2,638건 → 수동심사 대기 928 + 보류 확인 1,084 + 재검토 214 + 기타 412";

export type QueueRow = { label: string; cnt: string; pct: number; overPct?: number; status: string; tone: "g"|"a"|"b"|"n"|"r" };
function buildQueue(): QueueRow[] {
  return [
    { label: "자동심사 대기", cnt: "0", pct: 0, status: "즉시 처리", tone: "g" },
    { label: "수동심사 대기", cnt: "928", pct: 60, overPct: 10, status: "기한 내 772", tone: "a" },
    { label: "AI 재검토 지적", cnt: "214", pct: 22, status: "재검토 대기", tone: "b" },
    { label: "지급보류 확인", cnt: "1,084", pct: 70, status: "소명 6.5일", tone: "n" },
    { label: "민원 내용 접수", cnt: "9", pct: 4, status: "금주 -2", tone: "r" },
  ];
}
export const queueSummary = (i: number) => `${MONTH_LABELS[i]} 처리율 97.9% · 기한 초과 총 156건`;

export type Deadline = { day: string; weekday: string; title: string; sub: string; state: string; tone: "a"|"r"|"b" };
function buildDeadlines(now: Date, i: number): Deadline[] {
  const { year, month, day } = kstYmd(now);
  const wk = ["일","월","화","수","목","금","토"];
  const mk = (offset: number) => {
    const base = new Date(Date.UTC(year, month - 1, day + offset));
    return { m: base.getUTCMonth() + 1, d: base.getUTCDate(), wd: wk[base.getUTCDay()] };
  };
  const a = mk(3), b = mk(7), c = mk(12);
  return [
    { day: `${a.m}/${a.d}`, weekday: `${a.wd} · D-3`, title: `손해율 ${month - 1}월 보고서 제출`, sub: "담당 김민지 · 결재 박 팀장", state: "작성 중", tone: "a" },
    { day: `${b.m}/${b.d}`, weekday: `${b.wd} · D-7`, title: "AI 자동심사 한도 확대 결재안", sub: "리스크 검토 · A/B 검증 첨부", state: "검증 필요", tone: "r" },
    { day: `${c.m}/${c.d}`, weekday: `${c.wd} · D-12`, title: `${MONTH_LABELS[i]} 실적 검토 회의 자료`, sub: "팀원 협의 · 공시 파트 연계", state: "준비 중", tone: "b" },
  ];
}

export type Monitor = {
  key: string; title: string; icon: string; tone: "b"|"g"|"r";
  gaugeLabel: string; gaugeRight: string; gaugePct: number; gaugeColor?: string; big: string; bigUnit: string;
  planLine: string; planTag: { text: string; tone: "b"|"a"|"g"|"r"|"n" };
  items: { dot: string; text: string }[];
};
function buildMonitors(i: number): Monitor[] {
  const auto = Math.round(RECEIPT[i] * AUTO_PCT[i] / 100);
  const av = touch(AUTO_PCT[i]);
  return [
    { key: "ai", title: "AI 자동심사 운영", icon: "bolt", tone: "b",
      gaugeLabel: "적용률", gaugeRight: "목표 80%", gaugePct: AUTO_PCT[i], big: av, bigUnit: "%",
      planLine: `자동 지급 ${fmt(auto)}건 · 정확도 99.6%`, planTag: { text: "재검토율 6.2%", tone: "b" },
      items: [
        { dot: "#1F6C9F", text: "현행: <b>300만 원 이하</b> 자동심사 전수 스크리닝 — 고액·비정형은 수동 전환" },
        { dot: "#8A6116", text: "확대 검토: <b>500만 원</b> — 샘플 3,000건 A/B 검증 진행" },
        { dot: "#346538", text: "CTR: 지급 오류 <b>0.4%</b> (업계 평균 1.1%) — 정확성 양호" },
      ] },
    { key: "quality", title: "품질 점검 (샘플링 13%)", icon: "chk", tone: "g",
      gaugeLabel: "검토 완료", gaugeRight: "표본 16,710건", gaugePct: 92, gaugeColor: "#346538", big: "92", bigUnit: "%",
      planLine: "지적 <b>156건</b> · 시정 완료 132건", planTag: { text: "미시정 24건", tone: "g" },
      items: [
        { dot: "#9F2F2D", text: "<b>조서·약관 확인 누락 58건</b> — 자동심사 통과 건 중심" },
        { dot: "#8A6116", text: "지급한도 재검토 누락 <b>41건</b> — 300만 원 근접 건 집중" },
        { dot: "#A8A29E", text: "서류 보완 지연 <b>33건</b> + 기타 24건" },
      ] },
    { key: "fraud_m", title: "보험사기 모니터링", icon: "shield", tone: "r",
      gaugeLabel: "적발 금액", gaugeRight: "전월比 변동", gaugePct: 100, gaugeColor: "#9F2F2D", big: "37.8", bigUnit: "억",
      planLine: `의심 건 <b>${fmt(FRAUD[i])}건</b> · 회수 진행 22.5억`, planTag: { text: "금감원 통보 3건", tone: "r" },
      items: [
        { dot: "#9F2F2D", text: "집중 유형: 계약 전 알릴 의무 위반 <b>38%</b> · 허위·위조 서류 27%" },
        { dot: "#8A6116", text: "면책사유 다빈도 <b>21%</b> — 병원·설계사 연루 정밀 분석 중" },
        { dot: "#1F6C9F", text: "금감원 특별단속 발표 → 의심 건 연계 대응 확인" },
      ] },
  ];
}

export type FocusItem = { icon: string; tone: "r"|"b"|"g"; title: string; sub: string; tag: string; tagTone: "r"|"b"|"g" };
function buildFocus(i: number): FocusItem[] {
  return [
    { icon: "tri", tone: "r", title: "손해율 목표 초과 지속", sub: `${MONTH_LABELS[i]} 누적 ${touch(LOSS[i])}% · 목표 ${TARGET_LOSS}% 대비 초과, 상승 지속`, tag: "주의 · 원인 분석 착수", tagTone: "r" },
    { icon: "bolt", tone: "b", title: "AI 자동심사 한도 확대 검토", sub: "현행 한도 300만 원 → 500만 원 · 결재안 제출 예정", tag: "결재 준비", tagTone: "b" },
    { icon: "news", tone: "g", title: "금감원 보험사기 특별단속 발표", sub: "하반기 단속 착수 · 신고포상·검사 강화 — 우리 팀 대응 확인 필요", tag: "오늘의 동향", tagTone: "g" },
  ];
}

export type NewsItem = { date: string; title: string; sub: string };
export function buildNews(i: number): { fssNews: NewsItem[]; insNews: NewsItem[] } {
  const m = String(i + 1).padStart(2, "0");
  return {
    fssNews: [
      { date: `${m}.14`, title: "보험업감독규정 개정예고 — 보험사기 예방·대응 체계 강화", sub: "규정개정예고 · 의견수렴 기간 중" },
      { date: `${m}.12`, title: `${YEAR}년 상반기 보험회사 경영실태 평가 결과 공개`, sub: "지급여력·건전성 부문 우리 회사 순위 확인 필요" },
      { date: `${m}.10`, title: "금융소비자보호 우수사례 공모 안내", sub: "신속 지급·소통 개선 사례 제출 검토 가능" },
      { date: `${m}.06`, title: "보험상품 비교공시 확대 방안 (의견수렴)", sub: "비교 대상 상품군 확대 — 지급 기준 설명 강화 영향" },
    ],
    insNews: [
      { date: `${m}.15`, title: "금감원, 하반기 보험사기 특별단속… 병원·설계사 연루 정밀 분석", sub: "신고포상 확대 · 검사 착수 통보 — 오늘자" },
      { date: `${m}.12`, title: "실손보험 손해율 악화 지속… 보험업계 요율·보장 조정 본격화", sub: "실손 청구 급증과 우리 팀 접수 급증 연관 가능성" },
      { date: `${m}.10`, title: "AI 보험심사 확산… 금감원 투명성·오류 책임 가이드라인 마련", sub: "자동심사 확대 시 규제 기준 사전 점검 필요" },
      { date: `${m}.06`, title: "보험사기 신고포상금 지급액, 전년 대비 34% 증가", sub: "내부 신고 채널 활성화 캠페인 참고" },
    ],
  };
}

export function buildTrend(i: number) {
  return {
    months: MONTH_LABELS,
    paid: PAID_AMT,
    paidPrevYear: [361,369,376,384,390,397,403,418,424,431,438,446],
    lossRatio: LOSS,
    targetLoss: TARGET_LOSS,
    cumulative: cum(PAID_AMT, i),
  };
}

function iOf(d: Date = new Date()): number {
  const { month } = kstYmd(d);
  return Math.min(11, Math.max(0, month - 1));
}

export type ClaimDashboard = {
  asOf: string; dataNote: string;
  focusItems: FocusItem[]; kpis: KpiCard[]; pipeline: PipeStage[];
  pipelineFlowNote: string; queueRows: QueueRow[]; queueSummary: string;
  deadlines: Deadline[]; monitors: Monitor[]; fssNews: NewsItem[]; insNews: NewsItem[];
  trend: ReturnType<typeof buildTrend>; builtAt: number;
};

export function buildDashboardData(now: Date = new Date(), baseline = new Date(Date.now() - 24 * 3600 * 1000)): ClaimDashboard {
  const i = iOf(baseline);
  const news = buildNews(i);
  return {
    asOf: kstDocDateStr(now),
    dataNote: `AS OF 어제(${kstDateStr(baseline)}) 실적 · ${MONTH_LABELS[i]} 재고`,
    focusItems: buildFocus(i),
    kpis: buildKpis(i),
    pipeline: buildPipeline(i),
    pipelineFlowNote,
    queueRows: buildQueue(),
    queueSummary: queueSummary(i),
    deadlines: buildDeadlines(now, i),
    monitors: buildMonitors(i),
    fssNews: news.fssNews,
    insNews: news.insNews,
    trend: buildTrend(i),
    builtAt: Date.now(),
  };
}

export const claimDashboard: ClaimDashboard = buildDashboardData();

// ============================================================================
// RAGFlow 적재 명세 — 항목별 데이터셋 + 올해(1~12월) 전체 월별/보고 문서
// "올해 12월까지 필요한 데이터를 모두 만들어 적재" 후 오늘(=어제) 기준 조회
// ============================================================================
export type SeedDoc = { filename: string; content: string };
export type SeedDataset = { key: string; title: string; datasetName: string; docs: SeedDoc[] };

function md(title: string, body: string) { return `# ${title}\n\n${body}`; }

export function kpiDocs(): SeedDoc[] {
  return MONTHS.map((m, i) => {
    const prev = i === 0 ? LOSS[0] : LOSS[i - 1];
    return {
      filename: `${m}-지급보험금실적.md`,
      content: md(`지급보험금 실적 보고 — ${m}`, [
        `- 청구 접수: ${fmt(RECEIPT[i])}건`,
        `- 지급 처리: ${fmt(PAID[i])}건`,
        `- 월 지급보험금: ${PAID_AMT[i]}억 원 (누적 ${fmt(cum(PAID_AMT, i))}억)`,
        `- 지급보험금 손해율: ${touch(LOSS[i])}% (전월 ${touch(prev)}%)`,
        `- AI 자동심사 적용률: ${touch(AUTO_PCT[i])}%`,
        `- 보험사기 의심 적발: ${fmt(FRAUD[i])}건`,
      ].join("\n")),
    };
  });
}

export function monitorDocs(): SeedDoc[] {
  return MONTHS.map((m, i) => {
    const auto = Math.round(RECEIPT[i] * AUTO_PCT[i] / 100);
    return {
      filename: `${m}-업무진도모니터링.md`,
      content: md(`업무 진도 모니터링 — ${m}`, [
        `## AI 자동심사 운영`,
        `- 적용률: ${touch(AUTO_PCT[i])}% (목표 80%) · 자동 지급 ${fmt(auto)}건 · 정확도 99.6% · 재검토율 6.2% · 지급 오류 0.4% (업계 평균 1.1%)`,
        `## 품질 점검 (샘플링 13%)`,
        `- 표본: 16,710건 · 검토 완료 92% · 지적 156건(시정 132 · 미시정 24)`,
        `- 유형: 조서·약관 확인 누락 58건 · 지급한도 재검토 누락 41건 · 서류 보완 지연 33건 · 기타 24건`,
        `## 보험사기 모니터링`,
        `- 의심 적발: ${fmt(FRAUD[i])}건 · 적발액 37.8억 · 회수 22.5억`,
        `- 집중 유형: 계약 전 알릴 의무 위반 38% · 허위·위조 서류 27% · 면책사유 21%`,
      ].join("\n")),
    };
  });
}

export function pipelineDocs(): SeedDoc[] {
  return MONTHS.slice(5).map((m, i) => {
    const j = i + 5;
    const auto = Math.round(RECEIPT[j] * AUTO_PCT[j] / 100);
    return {
      filename: `${m}-처리흐름.md`,
      content: md(`지급보험금 처리 흐름 — ${m}`, [
        `- 접수: ${fmt(RECEIPT[j])}건`,
        `- AI 자동심사: ${fmt(auto)}건 · 적용률 ${touch(AUTO_PCT[j])}% · 절감 약 2.1만 인시`,
        `- 수동심사: ${fmt(RECEIPT[j] - auto)}건 · 대기 928 · 기한 초과 156 · 평균 4.1일`,
        `- 지급 확정: ${fmt(PAID[j])}건 · 누적 ${fmt(cum(PAID_AMT, j))}억 원 · 평균 ${touch(DAYS[j])}일`,
        `- 민원 내용: 30건 (보류 12 · 민원 8 · 기한 초과 10)`,
        `- 전체 처리율: 97.9% · 미처리 2,638건`,
      ].join("\n")),
    };
  });
}


export function queueDocs(): SeedDoc[] {
  return [
    { filename: "최신-수동심사대기.md", content: md("수동심사 대기 처리 큐", "- 수동심사 대기: 928건 (기한 내 772 · 초과 156) \n- 평균 대기 4.1일 \n- 미처리 2,638건 (보류 1,084 · 재검토 214 · 기타 412)") },
    { filename: "최신-지급보류현황.md", content: md("지급보류 확인 현황", "- 지급보류: 1,084건 \n- 소명 자료 6.5일 내 · 미응답 214건") },
    { filename: "최신-민원접수.md", content: md("민원 내용 접수 현황", "- 민원 내용 접수: 9건 \n- 누적 보류 12 · 민원 8 · 기한 초과 10건") },
  ];
}

export function focusDocs(): SeedDoc[] {
  return [
    { filename: "최신-오늘의집중-손해율AI.md", content: md("오늘의 집중 (1) 손해율·AI", [
      "## 손해율 목표 초과 지속",
      `- ${MONTH_LABELS[8]} 누적 83.1% · 목표 79.0% 대비 +4.1%p · 상승 지속 → 원인 분석 착수`,
      "## AI 자동심사 한도 확대 검토",
      "- 현행 한도 300만 원 → 500만 원 · A/B 검증 중 · 결재안 제출 예정",
    ].join("\n")) },
    { filename: "최신-오늘의집중-금감원.md", content: md("오늘의 집중 (2) 금감원 특별단속", [
      "## 금감원 보험사기 특별단속 발표",
      "- 하반기 단속 착수 · 신고포상 확대 · 병원·설계사 연루 정밀 분석 → 우리 팀 대응 확인",
      "## 대응 액션",
      "- 의심 건 연계 조회 · 내부 신고 채널 활성화 · 결재안 반영",
    ].join("\n")) },
  ];
}

export function newsDocs(): SeedDoc[] {
  const n = buildNews(8);
  return [
    { filename: "최신-금감원공시.md", content: md("금감원 공시 · 뉴스 (조사/전망)", n.fssNews.map((x) => `- [${x.date}] ${x.title} — ${x.sub}`).join("\n")) },
    { filename: "최신-보험뉴스.md", content: md("보험업계 뉴스 (시장 동향)", n.insNews.map((x) => `- [${x.date}] ${x.title} — ${x.sub}`).join("\n")) },
  ];
}

export const seedDatasets: SeedDataset[] = [
  { key: "kpi", title: "핵심 KPI · 연간 실적", datasetName: "보험금기획_핵심KPI", docs: kpiDocs() },
  { key: "pipeline", title: "지급보험금 처리 흐름", datasetName: "보험금기획_처리흐름", docs: pipelineDocs() },
  { key: "monitor", title: "업무 진도 모니터링", datasetName: "보험금기획_모니터링", docs: monitorDocs() },
  { key: "queue", title: "심사 처리 큐와 마감", datasetName: "보험금기획_처리큐", docs: queueDocs() },
  { key: "focus", title: "오늘의 집중", datasetName: "보험금기획_오늘의집중", docs: focusDocs() },
  { key: "news", title: "금감원 공시 & 보험뉴스", datasetName: "보험금기획_뉴스", docs: newsDocs() },
];
