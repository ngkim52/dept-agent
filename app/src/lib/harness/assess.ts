// 지식 하네스 — 드라이런 자동평가 (휴리스틱 품질 점수)
// LLM 생성 후보/제안 내용을 "재사용 가능한 지식" 관점으로 0~100 점수화.
// 명령·판단기준·구체성·길이·잠재 주입패턴에 가중치.

export interface Assessment {
  score: number;            // 0~100
  verdict: "pass" | "review" | "reject";
  reasons: string[];
}

export function assessContent(content: string): Assessment {
  const reasons: string[] = [];
  let score = 40; // 기본
  const c = (content ?? "").trim();
  if (!c) return { score: 0, verdict: "reject", reasons: ["내용이 없습니다."] };

  // 구체적 판단기준/행동 명령 (규칙성) → 높은 점수
  const ruleish = /(시|하세요|한다|해라|반드시|금지|~하면|경우|기준|초과|이상|이하|원칙|우선|순서|고려|검토|약|대략|이내)/.test(c);
  if (ruleish) { score += 20; reasons.push("행동지침/판단기준 표현 포함"); }

  // 구체성 — 수치·기간·대상 포함
  if (/[0-9０-９]|%|개월|년|회|만|억|원/.test(c)) { score += 15; reasons.push("수치·기간·대상이 구체적"); }
  // 길이 — 너무 짧으면 재사용성 낮음
  if (c.length >= 30) score += 10; else reasons.push("내용이 지나치게 짧음");
  if (c.length >= 90) score += 5;
  // 일반론/모호 표현은 감점
  if (/(잘|최선을 다하|항상 힘내|노력하겠|적절히 잘)/.test(c)) { score -= 20; reasons.push("모호·일반론 표현 포함"); }
  // 프롬프트 주입 패턴은 강력 감점 (안전)
  const inject = /(ignore|무시하|아래|only answer|system prompt|너의 지침을).*?(동작|명령|지시|무시)/i.test(c) || /ignore previous|무시하고/.test(c);
  if (inject) { score -= 100; reasons.push("주입/오버라이드 지시 의심 — 자동 승인 차단"); }

  // context 기반 일반 질문 vs 규칙식별
  if (c.length < 8 && !ruleish) score -= 15;
  score = Math.max(0, Math.min(100, score));
  const verdict: Assessment["verdict"] = inject ? "reject" : score >= 70 ? "pass" : score >= 40 ? "review" : "reject";
  return { score, verdict, reasons };
}

/** 후보 목록을 드라이런 평가해 요약 */
export function assessCandidates(items: { content?: string | null }[]) {
  const out = items.map((i) => ({ ...assessContent(i.content ?? ""), content: i.content ?? "" }));
  const pass = out.filter((o) => o.verdict === "pass").length;
  const review = out.filter((o) => o.verdict === "review").length;
  const reject = out.filter((o) => o.verdict === "reject").length;
  return { total: out.length, pass, review, reject, items: out };
}
