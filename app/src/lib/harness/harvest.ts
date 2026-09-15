// 지식 하네스 — 부서장 채팅 자동 지식 선별(harvest) 파이프라인
// cheap 모델로 대화에서 재사용 가치 있는 지식을 추출하고,
// confidence 임계(기본 0.8) 초과만 후보(createCandidate, 항상 pending)로 생성한다.
import { getLlmModel } from "@/lib/agent/llm";

export const HARVEST_CONFIDENCE_THRESHOLD = 0.8;

export type HarvestCall = (prompt: string) => Promise<string>;

export interface HarvestItem {
  kind: "fact" | "preference" | "decision" | "lesson" | "precedent" | "rule";
  content: string;
  confidence: number; // 0~1
}

export interface HarvestResult {
  extraction: HarvestItem[];
  accepted: HarvestItem[];
  threshold: number;
}

const SYSTEM = `당신은 대화에서 팀의 재사용 가능한 지식을 찾아내는 분석기입니다.
대화에서 다음에 해당하는 지식(판단 기준·결정·선호·선례·교훈)을 추출하세요:
- 다른 질문에도 적용 가능한 업무 원칙/규칙
- 명확한 결정과 그 근거
- 반복 사용할 가치가 있는 선호/관례
각 항목은 반드시 다음 JSON 배열로 출력하세요:
[ { "kind": "fact|preference|decision|lesson|precedent|rule", "content": "재사용 가능한 지식 문장" } ]
- kind는 반드시 지정된 값 중 하나만 사용하세요. (rule=업무원칙/규칙, decision=결정+근거, lesson=교훈, precedent=선례, preference=선호/관례, fact=사실)
- content는 재사용 가능한 지식을 한 문장으로, 구체적이고 일반화 가능하게 작성하세요.
재사용 가치가 없으면 빈 배열 []만 출력합니다.
응답은 코드 블록이나 설명 없이 JSON 배열만 출력합니다.`;

export function buildHarvestPrompt(title: string, transcript: string): string {
  return `대화 제목: ${title}\n\n대화 기록:\n${transcript}\n\n위 대화에서 재사용 가능한 지식을 JSON 배열로 추출하세요.`;
}

/** LLM 호출 기본 구현 — cheap(simple) 모델 사용 */
export async function realHarvestCall(prompt: string): Promise<string> {
  const { models, model } = await getLlmModel("simple");
  const res = await models.completeSimple(model, {
    messages: [{ role: "user" as const, content: prompt, timestamp: Date.now() }],
  });
  const text = (res?.content ?? [])
    .filter((t: any) => t?.type === "text")
    .map((t: any) => t.text)
    .join("");
  if (!text) throw new Error("harvest 모델 응답이 비어 있습니다.");
  return text;
}

/** 응답 파싱 — 코드블록·잡음 제거 후 항목 배열 반환 */
const KIND_ALIASES: Record<string, HarvestItem["kind"]> = {
  fact: "fact", preference: "preference", decision: "decision", lesson: "lesson",
  precedent: "precedent", rule: "rule",
  rule_knowledge: "rule", knowledge_rule: "rule", rules: "rule",
  원인분석: "lesson", 원인_분석: "lesson", 리스크분석: "lesson", risk: "lesson",
  관리방안: "precedent", 관리_방안: "precedent", 방안: "precedent", 대안: "decision",
  승인기준: "rule", 기준: "rule", 판단: "rule",
};

export function parseHarvestJson(raw: string): HarvestItem[] {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  let arr: any[];
  try { arr = JSON.parse(s); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && (typeof x.content === "string" || typeof x.knowledge === "string") && ((x.content && x.content.trim()) || (x.knowledge && x.knowledge.trim())))
    .map((x) => {
      const kindRaw = String(x.kind ?? x.knowledge_type ?? x.ktype ?? "fact").toLowerCase();
      const kind = KIND_ALIASES[kindRaw] ?? KIND_ALIASES[String(x.kind ?? x.knowledge_type ?? "fact")] ?? "fact";
      const confRaw = x.confidence;
      let confidence = typeof confRaw === "number" ? confRaw : typeof confRaw === "string" ? parseFloat(confRaw) : NaN;
      // 스키마상 confidence가 없는 경우 일반화 가능한 지식으로 보고 기본값 1.0 부여 (후보 등록 후 부서장이 승인 판단)
      if (Number.isNaN(confidence)) confidence = 1;
      return {
        kind,
        content: String(x.content ?? x.knowledge).trim(),
        confidence: Math.max(0, Math.min(1, confidence)),
      } as HarvestItem;
    });
}

/** 대화 메시지에서 지식 추출 + 신뢰도 임계 필터 */
export async function harvestConversation(
  title: string,
  messages: { role: string; content: string }[],
  call: HarvestCall = realHarvestCall,
  threshold = HARVEST_CONFIDENCE_THRESHOLD,
): Promise<HarvestResult> {
  const transcript = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `[${m.role === "user" ? "질문" : "답변"}] ${m.content}`)
    .join("\n\n");
  const raw = await call(buildHarvestPrompt(title, transcript));
  const extraction = parseHarvestJson(raw);
  const accepted = extraction.filter((x) => x.confidence >= threshold);
  return { extraction, accepted, threshold };
}

/** 추출된 항목을 후보 큐에 생성 (항상 pending, 무허가 자동 적용 금지) */
export async function createCandidatesFromHarvest(
  personaKey: string,
  conversationId: string,
  items: HarvestItem[],
): Promise<{ createdCount: number }> {
  const { createCandidate } = await import("@/lib/harness/review");
  let createdCount = 0;
  for (const it of items) {
    // 이미 같은 원천·내용의 pending 후보가 있으면 건너뛰기 (재제안 방지)
    const existing = (await import("@/lib/harness/review")).listCandidates({ personaKey, status: "pending" });
    const dup = (await existing).some((c) => c.sourceId === conversationId && (c.proposedContent ?? "").trim() === it.content.trim());
    if (dup) continue;
    await createCandidate({
      personaKey,
      sourceKind: "admin_chat",
      sourceId: conversationId,
      summary: `${it.kind} 지식`,
      action: "create_memory",
      targetTitle: it.content.slice(0, 24),
      proposedContent: it.content,
      confidence: it.confidence,
    });
    createdCount++;
  }
  return { createdCount };
}

export interface HarvestForConversationResult {
  accepted: HarvestItem[];
  createdCount: number;
}

/** 대화를 로드해 harvest → 후보 생성까지 한 번에 실행 */
export async function harvestForConversation(
  conversationId: string,
  call: HarvestCall = realHarvestCall,
): Promise<HarvestForConversationResult> {
  const { db, schema } = await import("@/lib/db");
  const { eq } = await import("drizzle-orm");
  const conv = (await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId)).limit(1))[0];
  if (!conv) throw new Error("대화를 찾을 수 없습니다.");
  const deptRows = conv.departmentId
    ? await db.select().from(schema.departments).where(eq(schema.departments.id, conv.departmentId!)).limit(1)
    : [];
  const personaKey = deptRows[0]?.personaKey ?? conv.departmentId ?? "claims-planning";
  const rows = await db.select({ role: schema.messages.role, content: schema.messages.content })
    .from(schema.messages).where(eq(schema.messages.conversationId, conversationId));
  const result = await harvestConversation(conv.title ?? "제목 없음", rows, call);
  const { createdCount } = await createCandidatesFromHarvest(personaKey, conversationId, result.accepted);
  return { accepted: result.accepted, createdCount };
}
