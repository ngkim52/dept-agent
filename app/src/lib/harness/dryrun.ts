// 지식 하네스 — 드라이런 에이전트 평가 (LLM-as-judge)
// 실제 부서장 에이전트에 업무별 질문을 던져 답변을 받고, LLM 판정자로
// 관련성·근거충실성·지식공백·시점정합성·완결성을 0~100 점수화한다.
// 과거 종료 이벤트를 현재로 오인하는 "시점 오류"를 중점 검증한다.
// 평가·질문·답변의 LLM 호출은 테스트에서 주입 가능(call/ask/judge).

export interface DryrunQuestion { id: string; question: string; intent: string; }
export interface DryrunCategory { key: string; label: string; emoji?: string; questions: DryrunQuestion[]; }

// 업무별 질문 은행 — 보험금기획팀(claims-planning) 사례 기반. 동일 구조로 계리 등 확장 가능.
export const DRYRUN_CATEGORIES: DryrunCategory[] = [
  {
    key: "claims", label: "보험금심사", emoji: "🧾",
    questions: [
      { id: "claims-trend", question: "최근 지급심사에서 손해율·지급률이 오른 상품군은 무엇이고, 그 원인 분석은 무엇인가요?", intent: "과거 이벤트/지표를 현재처럼 오인하는지, 데이터 근거가 있는지 확인" },
      { id: "claims-criterion", question: "보험금 지급 기준을 벗어난 심사 사례가 있다면 어떤 보완 조치를 하고 있나요?", intent: "판단 기준 지식이 있는지, 주관적·할루시네이션 답변인지 확인" },
      { id: "claims-reopen", question: "이미 종결 처리된 심사 건을 재심사해야 하는 기준은 무엇인가요?", intent: "종료/과거 이벤트를 현재 진행 중으로 오인하는지 확인" },
      { id: "claims-reg", question: "보험금 지급 관련 규제·내부준칙 위반 위험을 줄이려면 무엇을 점검해야 하나요?", intent: "규제 지식·행동지침이 있는지 확인" },
      { id: "claims-oh", question: "최근에 지급심사 지연이나 오지급 이슈가 있나요?", intent: "없는 지식(공백)을 단정해 지어내지 않는지 확인" },
    ],
  },
  {
    key: "ops", label: "배치·자동화", emoji: "⚙️",
    questions: [
      { id: "ops-batch", question: "부서에서 자동화된 배치 작업은 무엇이고, 실패 시 복구 절차는 어떻게 되나요?", intent: "자동화 지식이 있는지, 절차가 구체적인지 확인" },
      { id: "ops-tool", question: "심사 업무를 지원하는 내부 툴·시스템 활용법은 무엇인가요?", intent: "툴 지식 공백 여부 확인" },
    ],
  },
  {
    key: "report", label: "보고·규제", emoji: "📊",
    questions: [
      { id: "report-weekly", question: "엑손손해율·지급 현황 주간 보고서는 어떤 지표를 담아야 하나요?", intent: "보고 지식이 있는지, 과거 보고서를 현재로 오인하는지 확인" },
      { id: "report-compl", question: "최근 규제·감독 요구사항 대응 현황은 어떻습니까?", intent: "규제 지식 공백/시점 오류 확인" },
    ],
  },
  {
    key: "team", label: "부서운영", emoji: "👥",
    questions: [
      { id: "team-gap", question: "부서에서 최근 확인·협조 요청된 이슈가 있나요? 처리 현황은요?", intent: "미해결/종료 이벤트 혼동, 지식 공백 확인" },
      { id: "team-lesson", question: "작년 결산기 때 배운 교훈을 올해 어떻게 반영하고 있나요?", intent: "과거 교훈을 현재 한다고 오인하지 않는지 확인" },
    ],
  },
];

export interface DryrunDimension { key: string; label: string; score: number; reason: string; }
export interface DryrunFinding { level: "info" | "warn" | "risk"; text: string; }
export interface DryrunResult {
  personaKey: string;
  question: string;
  intent: string;
  answer: string;
  latencyMs: number;
  dimensions: DryrunDimension[];
  totalScore: number;
  verdict: "양호" | "보완필요" | "위험";
  findings: DryrunFinding[];
}

export const DRYRUN_DIMENSIONS: { key: string; label: string }[] = [
  { key: "relevance", label: "질문 관련성" },
  { key: "groundedness", label: "근거 충실성(출처·할루시네이션)" },
  { key: "knowledge_gap", label: "지식 공백 판단" },
  { key: "temporal", label: "시점 정합성(과거→현재 오인)" },
  { key: "completeness", label: "답변 완결성·헛점" },
];

/** 실제 부서장 에이전트 호출 대비 주입 가능한 ask 기본 구현 (RAG + runPersonaAgent) */
export type AskAnswer = { text: string; retrieved: string[] };
export type AskFn = (question: string) => Promise<AskAnswer>;

export async function defaultAsk(personaKey: string, question: string): Promise<AskAnswer> {
  const { db, schema } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const { getPersona } = await import("@/lib/agent/personas");
  const { retrieveDepartmentChunks, runPersonaAgent } = await import("@/lib/agent/engine");
  const deptRows = await db.select().from(schema.departments).where(eq(schema.departments.id, personaKey)).limit(1);
  let datasetIds: (string | null | undefined)[] = [];
  try {
    const rows = await db.select().from(schema.departmentDatasets).where(eq(schema.departmentDatasets.departmentId, personaKey));
    datasetIds = rows.map((r: any) => r.datasetId);
  } catch { /* dataset table 형태가 다를 수 있음 */ }
  if (datasetIds.length === 0) datasetIds = [deptRows[0]?.ragflowDatasetId];
  const chunks = await retrieveDepartmentChunks(question, datasetIds);
  let text = "";
  const persona = await getPersona(personaKey);
  if (!persona) throw new Error("페르소나를 찾을 수 없습니다: " + personaKey);
  await runPersonaAgent(persona, question, [], chunks, {
    onTextDelta(d) { text += d; },
    onProgress() {},
  }, { thinkingLevel: "off" }, { style: "conclusion" });
  return { text: text.trim(), retrieved: chunks.map((c) => c.content) };
}

const JSON_FENCE = /```(?:json)?\s*([\s\S]*?)\s*```/;

export type JudgeFn = (q: string, a: string, retrieved: string[], call: (p: string) => Promise<string>) => Promise<Pick<DryrunResult, "dimensions" | "findings">>;

export const defaultJudge: JudgeFn = async (q, a, retrieved, call) => {
  const prompt = [
    "당신은 보험금기획팀 부서장 에이전트의 답변 품질 평가자(LLM-as-judge)입니다.",
    "질문과 에이전트 답변, 검색 참조를 보고 5개 차원을 0~100으로 채점하고, '위험(risk)'/'보완(warn)'/'정보(info)' 수준의 지적을 3~6개 제시하세요.",
    "특히 '시점 정합성': 회의록·과거 보고서의 종료된/과거 이벤트를 현재 시점의 진행 사항처럼 단정해 말하면 크게 감점하세요.",
    "JSON만 반환: dimensions 배열, 원소={key, score(0~100), reason}, findings 배열, 원소={level(risk/warn/info), text}.",
    "차원 key: " + DRYRUN_DIMENSIONS.map((d) => d.key).join(", "),
    "--- 질문 ---\n" + q,
    "--- 검색 참조 ---\n" + (retrieved.length ? retrieved.join("\n") : "(없음)"),
    "--- 에이전트 답변 ---\n" + a,
  ].join("\n");
  const raw = (await call(prompt)).trim();
  const m = raw.match(JSON_FENCE);
  const body = (m ? m[1] : raw).replace(/^[^\[{]*/, "").trim();
  const j = JSON.parse(body);
  const dims: DryrunDimension[] = DRYRUN_DIMENSIONS.map((d) => {
    const found = (j.dimensions ?? []).find((x: any) => x.key === d.key);
    return { key: d.key, label: d.label, score: clampScore(Number(found?.score)), reason: String(found?.reason ?? "") };
  });
  const findings: DryrunFinding[] = (j.findings ?? []).slice(0, 8).map((f: any) => ({ level: (["info", "warn", "risk"].includes(f.level) ? f.level : "warn"), text: String(f.text) }));
  return { dimensions: dims, findings };
};

function clampScore(n: number): number { if (!Number.isFinite(n)) return 0; return Math.max(0, Math.min(100, n)); }

export async function runDryrunEvaluation(opts: {
  personaKey: string;
  question: string;
  ask?: AskFn;
  call?: (p: string) => Promise<string>;
}): Promise<DryrunResult> {
  const t0 = Date.now();
  const cat = DRYRUN_CATEGORIES.flatMap((c) => c.questions).find((q) => q.question === opts.question);
  const ask = opts.ask ?? ((q) => defaultAsk(opts.personaKey, q));
  const { text, retrieved } = await ask(opts.question);
  const call = opts.call ?? (async (p) => {
    const { getLlmModel } = await import("@/lib/agent/llm");
    const { models, model } = await getLlmModel("compact");
    const res = await models.completeSimple(model, { systemPrompt: "당신은 보험금 심사 품질 평가자입니다.", messages: [{ role: "user" as const, content: p, timestamp: Date.now() }] });
    return (res?.content ?? []).filter((t: any) => t?.type === "text").map((t: any) => t.text).join("");
  });
  const { dimensions, findings } = await defaultJudge(opts.question, text, retrieved, call);
  const totalScore = Math.round(dimensions.reduce((s, d) => s + d.score, 0) / Math.max(1, dimensions.length));
  const hasRisk = findings.some((f) => f.level === "risk") || dimensions.some((d) => d.key === "temporal" && d.score < 50);
  const verdict: DryrunResult["verdict"] = hasRisk ? "위험" : totalScore >= 75 ? "양호" : "보완필요";
  return { personaKey: opts.personaKey, question: opts.question, intent: cat?.intent ?? "", answer: text, latencyMs: Date.now() - t0, dimensions, totalScore, verdict, findings };
}

/** 업무별 질문 목록 (선택용) */
export function getDryrunQuestionBank(): DryrunCategory[] { return DRYRUN_CATEGORIES; }
