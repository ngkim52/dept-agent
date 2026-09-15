"use client";
import { useState, useEffect } from "react";

type Q = { id: string; question: string; intent: string };
type Cat = { key: string; label: string; emoji?: string; questions: Q[] };
type Dim = { key: string; label: string; score: number; reason: string };
type Finding = { level: "info" | "warn" | "risk"; text: string };
type Result = { personaKey: string; question: string; intent: string; answer: string; latencyMs: number; dimensions: Dim[]; totalScore: number; verdict: string; findings: Finding[] };

const VERDICT_STYLE: Record<string, string> = {
  "양호": "bg-pale-green text-pale-green-text",
  "보완필요": "bg-pale-amber text-pale-amber-text",
  "위험": "bg-pale-red text-pale-red-text",
};

export default function DryRunPanel() {
  const [personaKey, setPersonaKey] = useState("claims-planning");
  const [cats, setCats] = useState<Cat[]>([]);
  const [sel, setSel] = useState<Q | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/admin/dryrun/questions").then((r) => r.json()).then((d) => setCats(d.categories ?? [])).catch(() => {});
  }, []);

  async function evaluate(q: Q) {
    setRunning(true); setErr(""); setResult(q ? null : result);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/admin/dryrun/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personaKey, question: q.question }) });
      const d = await res.json();
      if (d.error) { setErr(d.error); return; }
      setResult(d.result);
    } catch { setErr("평가 실행 실패"); }
    finally { setRunning(false); }
  }

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-ink-soft">부서:</span>
        {["claims-planning", "actuarial"].map((k) => (
          <button key={k} onClick={() => { setPersonaKey(k); setResult(null); }}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${personaKey === k ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"}`}>
            {k === "claims-planning" ? "보험금심사기획" : "계리"}
          </button>
        ))}
      </div>

      {err && <p role="alert" className="rounded-md bg-pale-red px-3 py-2 text-xs text-pale-red-text">{err}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {cats.map((c) => (
          <div key={c.key} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink">{c.emoji} {c.label}</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {c.questions.map((q) => (
                <button key={q.id} onClick={() => { setSel(q); setResult(null); }} disabled={running}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${sel?.id === q.id ? "border-ink bg-ink text-white" : "border-line bg-canvas text-ink hover:border-line-strong"}`}>
                  {q.question}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!cats.length && <p className="text-xs text-ink-faint">업무별 질문을 불러오는 중…</p>}

      {sel && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{sel.question}</p>
            <button onClick={() => evaluate(sel)} disabled={running}
              className="lift rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-[#33312E] disabled:opacity-50">
              {running ? "부서장 에이전트 질문·평가 중…" : "평가 실행"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-ink-faint">검증: 지식 공백·헛점 · 과거 종료 이벤트를 현재로 오인하지 않는지 · 근거·관련성 · 완결성</p>
          {running && <p className="mt-3 animate-pulse text-xs text-ink-soft">질문 생성 → 부서장 에이전트 답변 → LLM-as-judge 평가 중 (보통 수십 초, 과거 회의록 오인 여부까지 확인)…</p>}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">평가 결과</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-ink-faint">소요 {result.latencyMs}ms</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${VERDICT_STYLE[result.verdict] ?? "bg-canvas text-ink"}`}>{result.verdict} · 종합 {result.totalScore}</span>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {result.dimensions.map((d) => (
              <div key={d.key} className="rounded-lg border border-line bg-canvas px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-ink">{d.label}</p>
                  <span className={`font-mono text-sm font-bold ${d.score >= 70 ? "text-pale-green-text" : d.score >= 45 ? "text-pale-amber-text" : "text-pale-red-text"}`}>{d.score}</span>
                </div>
                <p className="mt-1 text-[10px] leading-snug text-ink-faint">{d.reason}</p>
              </div>
            ))}
          </div>
          {result.findings.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {result.findings.map((f, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-md px-3 py-1.5 text-xs ${f.level === "risk" ? "bg-pale-red text-pale-red-text" : f.level === "warn" ? "bg-pale-amber text-pale-amber-text" : "bg-canvas text-ink-soft"}`}>
                  <span className="font-mono text-[10px]">{f.level === "risk" ? "위험" : f.level === "warn" ? "보완" : "정보"}</span>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 rounded-lg border border-line bg-canvas p-3">
            <p className="text-[11px] font-semibold text-ink-soft">에이전트 답변</p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink">{result.answer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
