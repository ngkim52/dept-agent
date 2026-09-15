"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BriefingSource = { id: string; title: string; url: string; source: string; snippet: string; category: string };
type BriefAction = { topic: string; summary: string; category: string; sources: string[] };
type CorporateBriefing = {
  date: string; categories: string[]; executiveSummary: string; actions: BriefAction[];
  sources: BriefingSource[]; flags: { engine: string; sourceCount: number; llm: boolean };
};

const CAT_COLOR: Record<string, string> = {
  "생명보험회사": "#1F6C9F",
  "손해보험회사": "#346538",
  "보험업계 · 감독/규제": "#8A6116",
  "보험업계 · 정책/금융위": "#7C5CBF",
};

export default function Briefing() {
  const router = useRouter();
  const [b, setB] = useState<CorporateBriefing | null>(null);
  const [fetchedAt, setFetchedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const doFetch = useCallback(async (refresh = false) => {
    const r = await fetch("/api/briefing" + (refresh ? "?refresh=1" : ""));
    if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
    const d = await r.json();
    if (!d?.briefing) throw new Error(d?.error ?? "브리핑을 불러오지 못했습니다.");
    return d;
  }, [router]);
  function load(refresh = false) {
    setBusy(true);
    (async () => {
      try { const d = await doFetch(refresh); setB(d.briefing); setErr(""); setFetchedAt(d.fetchedAt ?? ""); }
      catch (e) { if ((e as Error).message !== "unauthorized") setErr("브리핑 로드 실패. 잠시 후 다시 시도해 주세요."); }
      finally { setBusy(false); }
    })();
  }
  useEffect(() => {
    let on = true;
    (async () => {
      try { const d = await doFetch(false); if (on) { setB(d.briefing); setFetchedAt(d.fetchedAt ?? ""); } }
      catch { if (on) setErr("브리핑 로드 실패. 잠시 후 다시 시도해 주세요."); }
    })();
    return () => { on = false; };
  }, [doFetch]);

  const srcById = new Map((b?.sources ?? []).map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-ink">업계동향 브리핑</h1>
          <p className="mt-1 text-sm text-ink-soft">생명·손해보험회사 및 보험업계(금감원·금융위) 뉴스를 실시간 검색해, 우리 부서가 참고·검토할 내용을 정리합니다.</p>
          {fetchedAt && <p className="mt-1 font-mono text-[11px] text-ink-faint">조회 시각 {new Date(fetchedAt).toLocaleString("ko-KR")} · 새로고침 전 30분 캐시</p>}
        </div>
        <button onClick={() => load(true)} disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-deep disabled:opacity-50">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={busy ? "animate-spin" : ""}><path d="M21 12a9 9 0 11-2.6-6.3M21 3v6h-6" /></svg>
          {busy ? "조회 중…" : "다시 조회"}
        </button>
      </header>

      {err && <p className="rounded-lg bg-pale-red p-3 text-sm text-pale-red-text">{err}</p>}

      {!b ? (
        !err && <p className="py-16 text-center text-sm text-ink-faint">최근 보험업계 뉴스를 검색하고 있습니다… (수 초 소요)</p>
      ) : (
        <>
          {/* Executive summary */}
          <section className="doppel rise-in">
            <div className="doppel-inner card-core bg-surface p-6">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] text-accent">{b.flags.llm ? "부서장 요약 · LLM" : "부서장 요약"}</span>
                <span className="font-mono text-[10px] text-ink-faint">{b.flags.sourceCount}건 기반</span>
              </div>
              <p className="leading-relaxed text-ink">{b.executiveSummary || "최근 뉴스를 조회하지 못했습니다."}</p>
            </div>
          </section>

          {/* Actions — 검토해야 할 내용 */}
          {b.actions.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 font-serif text-lg font-semibold text-ink">우리 부서가 참고·검토할 내용</h2>
              <div className="space-y-3">
                {b.actions.map((a, i) => {
                  const color = CAT_COLOR[a.category] ?? "#1F6C9F";
                  const linked = a.sources.map((id) => srcById.get(id)).filter(Boolean) as BriefingSource[];
                  return (
                    <div key={i} className="doppel rise-in">
                      <div className="doppel-inner card-core bg-surface p-5">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                          {a.category && <span style={{ color, background: color + "1a", borderColor: color + "40" }} className="rounded-full border px-2 py-0.5 font-mono text-[10px]">{a.category}</span>}
                        </div>
                        <p className="font-serif text-[15px] font-semibold text-ink">{a.topic}</p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-soft">{a.summary}</p>
                        {linked.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {linked.map((s) => (
                              <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-start gap-2 text-xs text-accent hover:text-accent-deep">
                                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14 21 3" /></svg>
                                <span className="leading-snug">{s.title} <span className="text-ink-faint">· {s.source}</span></span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Category filters summary counts */}
          {b.categories.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 font-serif text-sm font-semibold text-ink-soft">조회 분야</h2>
              <div className="flex flex-wrap gap-2">
                {b.categories.map((c) => {
                  const n = b.sources.filter((s) => s.category === c).length;
                  const color = CAT_COLOR[c] ?? "#1F6C9F";
                  return <span key={c} style={{ color, background: color + "12", borderColor: color + "35" }} className="rounded-full border px-2.5 py-1 text-[11px]">{c} <b>{n}</b></span>;
                })}
              </div>
            </section>
          )}

          {/* All sources */}
          {b.sources.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 border-b border-line pb-2 font-serif text-lg font-semibold text-ink">참고한 뉴스 ({b.sources.length})</h2>
              <div className="space-y-1.5">
                {b.sources.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer"
                    className="group block rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent hover:bg-accent/5">
                    <div className="flex items-center gap-2">
                      <span style={{ color: CAT_COLOR[s.category] ?? "#1F6C9F" }} className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]">{s.category}</span>
                      <span className="font-mono text-[10px] text-ink-faint">{s.source}</span>
                    </div>
                    <p className="mt-1 text-[13px] font-medium text-ink group-hover:text-accent">{s.title}</p>
                    {s.snippet && <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{s.snippet}</p>}
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
