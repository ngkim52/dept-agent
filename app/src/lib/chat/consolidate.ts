// ============================================================================
// 복수 턴(멀티턴) 대화 → 단일 통합 답변(Q/A) 관리 프로토타입
// ----------------------------------------------------------------------------
// 목표: 같은 세션에서 답변이 여러 턴(assistant)에 걸쳐 완성된 경우,
//       그 결과를 하나의 "질문→답변"로 통합해 저장하고,
//       이후 유사 질문이 들어오면 여러 턴 대신 한 번에 답할 수 있게 한다.
// ----------------------------------------------------------------------------
// 저장·검색 전략 (선택):
//   1) SQLite  qa_consolidations  테이블 — 정규화 질문·답변·상태(verified)·링크(지식그래프 노드/엣지)
//   2) RAGFlow 데이터셋 "채팅_복수턴_통합답변" — 질문 임베딩 기반 벡터 재검색
//   3) Skill 파일(트리거: 의도/키워드) — 높은 신뢰도의 절차형 답변 재사용
// 이 모듈은 위 저장소에 중립적인 순수 로직(통합·검증·유사도)을 제공합니다.
// ============================================================================
import { getLlmModel } from "@/lib/agent/llm";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ConsolidatedQA = {
  canonicalQuestion: string; // 정규화된 대표 질문
  intent: string;          // 의도(트리거용, 예: "실손_손해율_상승원인")
  mergedAnswer: string;     // 단일 통합 답변(MD) — 여러 턴을 한 번에 담은 최종본
  summary: string;         // 짧은 요약
  entities: string[];      // 관련 엔티티/키워드 (지식그래프 노드 연결용)
  turns: number;          // 통합된 턴 수
  confidence: number;     // 0~1
};

// ── 통합 프롬프트 ────────────────────────────────────────────────────────────────
export function buildConsolidatePrompt(firstQuery: string, turns: ChatTurn[]): string {
  const transcript = turns.map((t) => `[${t.role}]
${t.content}`).join("\n\n");
  return `아래는 한 세션에서 "질문에 답하는 과정"이 여러 턴(대화)으로 나뉘어 완성된 대화 기록입니다.
이 대화를 **하나의 대표 질문(canonicalQuestion) + 하나의 통합 답변(mergedAnswer)**으로 요약하세요.
- canonicalQuestion: 첫 질문의 의도를 그대로 담되, 한 문장으로 정규화.
- intent: 재사용 트리거용 짧은 라벨(한국어 명사구, 예: 실손_손해율_상승원인).
- mergedAnswer: 모든 assistant 턴의 핵심을 빠짐없이 **단일 답변**으로 합친 것(마크다운). 지시문·사족은 제거하고 사실·근거만.
- summary: 1문장 요약.
- entities: 등장한 핵심 키워드 3~8개.
- confidence: 0~1 (답변이 대화 내용에서 확실하게 도출되는 정도).

[대화 기록 시작]
첫 질문: ${firstQuery}
${transcript}
[대화 기록 끝]

반드시 아래 JSON만 마크다운 없이 출력하세요:
{"canonicalQuestion":"...","intent":"...","mergedAnswer":"...# 문단\n- 항목...","summary":"...","entities":["..."],"confidence":0.9}`;
}

export function parseConsolidated(text: string): ConsolidatedQA | null {
  try {
    const m = text.replace(/```json|```/g, "").match(/{[\s\S]*}/);
    if (!m) return null;
    const d = JSON.parse(m[0]);
    if (typeof d.canonicalQuestion !== "string" || typeof d.mergedAnswer !== "string") return null;
    return {
      canonicalQuestion: String(d.canonicalQuestion),
      intent: String(d.intent ?? ""),
      mergedAnswer: String(d.mergedAnswer),
      summary: String(d.summary ?? ""),
      entities: Array.isArray(d.entities) ? d.entities.map(String).slice(0, 10) : [],
      turns: (Array.isArray(d.turns) ? d.turns.length : 0) || 1,
      confidence: typeof d.confidence === "number" ? Math.min(1, Math.max(0, d.confidence)) : 0.5,
    };
  } catch { return null; }
}

/** LLM으로 대화를 단일 Q/A로 통합 */
export async function consolidateThread(firstQuery: string, turns: ChatTurn[]): Promise<ConsolidatedQA | null> {
  const assistantCount = turns.filter((t) => t.role === "assistant").length;
  const { models, model } = await getLlmModel("simple");
  const res = await models.completeSimple(model, {
    messages: [{ role: "user" as const, content: buildConsolidatePrompt(firstQuery, turns), timestamp: Date.now() }],
  });
  const text = (res?.content ?? []).filter((t) => t?.type === "text").map((t) => t.text).join("");
  const qa = parseConsolidated(text);
  if (!qa) return null;
  qa.turns = assistantCount || turns.length;
  return qa;
}

// ── 검증(확인) ────────────────────────────────────────────────────────────────────
// 1) 답변이 원본 대화에서 빠뜨린 핵심 사실이 없는지(LLM self-check 또는 키워드 오버랩)
export function answerCoversTurns(qa: ConsolidatedQA, turns: ChatTurn[], tokenThresh = 0.4): boolean {
  const ans = qa.mergedAnswer.replace(/\s+/g, " ");
  const missing: string[] = [];
  for (const t of turns) {
    if (t.role !== "assistant") continue;
    const words = (t.content.match(/[가-힣]{2,}|[A-Za-z]{4,}|\d+/g) ?? [])
      .filter((w) => w.length > 1);
    const covered = words.filter((w) => ans.includes(w)).length / Math.max(1, words.length);
    if (covered < tokenThresh) missing.push(t.content.slice(0, 30));
  }
  return missing.length === 0;
}
// 신규 질문이 저장된 질문/답변을 "얼마나 커버하는가" — 짧은 질문 → 긴 답변 매칭에 적합(쿼리 쪽 재현율)
export function queryCoverage(query: string, reference: string): number {
  const q = bigrams(query), r = bigrams(reference);
  if (q.size === 0) return 0;
  let inter = 0;
  for (const t of q) if (r.has(t)) inter++;
  return inter / q.size;
}

// ── 유사도 · 재검색 ──
// 한국어는 조사·어미로 표면형이 달라 어휘 토큰 매칭이 약하므로, 공백/문자 제거 후
// 문자 빅램(2-gram) 오버랩(다이스 계수)을 사용한다. 운영에서는 RAGFlow 임베딩으로 대체 가능.
function bigrams(s: string): Set<string> {
  const n = s.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
}
export function similarityScore(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size); // 다이스 계수
}

export function findBestConsolidated(query: string, pool: ConsolidatedQA[], threshold = 0.35): ConsolidatedQA | null {
  let best: ConsolidatedQA | null = null;
  let bestScore = threshold;
  for (const qa of pool) {
    const s = similarityScore(query, qa.canonicalQuestion + " " + qa.intent);
    if (s > bestScore) { bestScore = s; best = qa; }
  }
  return best;
}
