"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Data = { datasets: { id: string; name: string }[]; local: { prompts: number; skills: number; memories: number; pendingCandidates: number }; isAdmin: boolean };

export default function KnowledgeBase() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await fetch("/api/knowledge");
        if (res.status === 401) { router.replace("/login"); return; }
        const d = await res.json();
        if (!res.ok || !d || !(d && d.local)) { if (on) setErr(d?.error ?? "지식베이스를 불러오지 못했습니다."); return; }
        if (on) setData(d);
      } catch { if (on) setErr("지식베이스를 불러오지 못했습니다."); }
    })();
    return () => { on = false; };
  }, [router]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Knowledge Base</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-ink">지식베이스</h1>
        <p className="mt-1 text-sm text-ink-soft">RAG 도큐먼트 데이터셋과 에이전트에 주입되는 큐레이션 지식(하네스) 현황을 확인합니다.</p>
      </header>
      {err && <p className="mt-6 rounded-md bg-pale-red px-3 py-2 text-sm text-pale-red-text">{err}</p>}
      {!data && !err && <p className="mt-10 text-center text-sm text-ink-faint">불러오는 중…</p>}
      {data && (
        <>
          {/* 로컬 지식 개요 */}
          <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[["프롬프트", data.local.prompts, "✦"], ["스킬", data.local.skills, "✦"], ["메모리", data.local.memories, "✦"], ["승인 대기 후보", data.local.pendingCandidates, "◈"]].map(([l, n, ic]) => (
              <button key={l as string} onClick={() => data.isAdmin && router.push("/admin/harness")} className={"rounded-2xl border border-line bg-surface p-5 text-left " + (l === "승인 대기 후보" ? "cursor-pointer hover:border-accent" : "")}>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-faint">{l}</p>
                <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-ink">{n}</p>
              </button>
            ))}
          </section>
          <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
            <h2 className="font-serif text-base font-semibold text-ink">RAGFlow 데이터셋</h2>
            {data.datasets.length === 0 ? (
              <p className="mt-3 rounded-lg bg-canvas px-4 py-6 text-center text-xs text-ink-faint">연결된 RAGFlow 데이터셋이 없습니다. 관리자 설정에서 부서↔데이터셋을 연결해주세요.</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.datasets.map(ds => (
                  <div key={ds.id} className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-accent">▤</span>
                    <span className="truncate text-sm font-medium text-ink">{ds.name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
