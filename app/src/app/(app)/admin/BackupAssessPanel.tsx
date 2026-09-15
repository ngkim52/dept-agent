"use client";
import { useState } from "react";

// Phase 4 — 백업/복원 + 드라이런 자동평가 (관리자 지식 하네스 부가 도구)
export default function BackupAssessPanel() {
  const [tab, setTab] = useState<"backup" | "assess">("backup");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [report, setReport] = useState<{ total: number; pass: number; review: number; reject: number; items: any[] } | null>(null);
  const [assessing, setAssessing] = useState(false);

  async function download() {
    setMsg(""); setErr("");
    try {
      const res = await fetch("/api/admin/backup");
      const d = await res.json();
      if (d.error) { setErr(d.error); return; }
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `지식하네스-백업-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg(`백업 완료 — 프롬프트 ${d.prompts?.length ?? 0} · 스킬 ${d.skills?.length ?? 0} · 메모리 ${d.memories?.length ?? 0} · 에피소드 ${d.episodes?.length ?? 0}건`);
    } catch { setErr("백업 실패"); }
  }

  async function restore(file: File) {
    setMsg(""); setErr("");
    try {
      const j = JSON.parse(await file.text());
      const res = await fetch("/api/admin/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(j) });
      const d = await res.json();
      if (!res.ok || d.error) { setErr(d.error ?? "복원 실패"); return; }
      setMsg(`복원 완료 — 프롬프트 ${d.prompts} · 스킬 ${d.skills} · 메모리 ${d.memories} · 연결 ${d.edges}건`);
    } catch (e: any) { setErr("복원 실패: " + (e?.message ?? e)); }
  }

  async function runAssess() {
    setAssessing(true); setErr(""); setMsg("");
    try {
      const d = await (await fetch("/api/admin/assess")).json();
      if (d.error) { setErr(d.error); return; }
      setReport(d);
    } catch { setErr("드라이런 평가 실패"); }
    finally { setAssessing(false); }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h3 className="font-serif text-lg font-semibold tracking-tight text-ink">백업 & 드라이런 평가</h3>
          <p className="mt-0.5 text-xs text-ink-soft">지식 저장소 전체를 JSON으로 백업/복원하고, 후보 내용을 재사용성 관점에서 사전 점검합니다.</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
          {([["backup", "백업 / 복원"], ["assess", "드라이런 평가"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${tab === k ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"}`}>
              {label}
            </button>
          ))}
        </div>

        {err && <p role="alert" className="mt-4 rounded-md bg-pale-red px-3 py-2 text-xs text-pale-red-text">{err}</p>}
        {msg && <p className="mt-4 rounded-md bg-pale-green px-3 py-2 text-xs text-pale-green-text">{msg}</p>}

        {tab === "backup" && (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-ink">백업 내려받기</p>
              <p className="mt-1 text-xs text-ink-soft">프롬프트·스킬·메모리·버전·후보·에피소드·그래프 전체를 JSON으로 내려받습니다.</p>
              <button onClick={download} className="lift mt-4 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#33312E]">
                JSON 백업 받기
              </button>
            </div>
            <div className="rounded-xl border border-line bg-surface p-5">
              <p className="text-sm font-semibold text-ink">복원 (업로드)</p>
              <p className="mt-1 text-xs text-ink-soft">내려받은 백업 파일로 지식 저장소를 되돌립니다.</p>
              <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); }}
                className="mt-3 block w-full text-xs text-ink-soft file:mr-3 file:rounded-md file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-accent" />
            </div>
          </div>
        )}

        {tab === "assess" && (
          <div className="mt-5 rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">후보 큐 재사용성 드라이런 평가</p>
            <p className="mt-1 text-xs text-ink-soft">pending 후보의 제안 내용을 규칙성·구체성·주입위험 관점에서 0~100 점수로 사전 점검합니다.</p>
            <button onClick={runAssess} disabled={assessing}
              className="lift mt-4 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#33312E] disabled:opacity-50">
              {assessing ? "평가 중…" : "후보 드라이런 평가"}
            </button>
            {report && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {[["전체", report.total, "text-ink"], ["통과(pass)", report.pass, "text-pale-green-text"], ["검토(review)", report.review, "text-pale-amber-text"], ["거절(reject)", report.reject, "text-pale-red-text"]].map(([l, n, c]) => (
                  <div key={l as string} className="rounded-lg border border-line bg-canvas px-3 py-3 text-center">
                    <p className={`font-mono text-xl font-semibold tabular-nums ${c}`}>{n}</p>
                    <p className="mt-0.5 text-[10px] text-ink-faint">{l}</p>
                  </div>
                ))}
              </div>
            )}
            {report?.items?.length ? (
              <div className="mt-4 space-y-2">
                {report.items.map((it, i) => (
                  <div key={i} className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs">
                    <span className={`mr-2 rounded-full px-2 py-0.5 font-mono text-[10px] ${it.verdict === "pass" ? "bg-pale-green text-pale-green-text" : it.verdict === "review" ? "bg-pale-amber text-pale-amber-text" : "bg-pale-red text-pale-red-text"}`}>{it.verdict} · {it.score}</span>
                    <span className="text-ink-soft">{it.content?.slice(0, 90)}</span>
                  </div>
                ))}
              </div>
            ) : report && !report.total ? (
              <p className="mt-4 text-xs text-ink-faint">평가할 후보가 없습니다.</p>
            ) : null}
          </div>
        )}
      </div>
    
  );
}
