"use client";
import { useState, useEffect } from "react";
import ReviewQueue from "../ReviewQueue";
import HarnessPanel from "../HarnessPanel";
import BackupAssessPanel from "../BackupAssessPanel";

type Stage = { stage: string; label: string; key: string; value: number; pending?: number; applied?: number; rejected?: number };
type Stats = { pipeline: Stage[]; pendingCandidates: number; edges: number; versions: number };

// 지식 하네스 · 지속적 자기개선 — 후보/에피소드/그래프 · 스킬 편집 · 백업/드라이런 평가
export default function HarnessPage() {
  const [view, setView] = useState<"review" | "edit" | "backup">("review");
  const [stats, setStats] = useState<Stats>({ pipeline: [], pendingCandidates: 0, edges: 0, versions: 0 });
  const [forbidden, setForbidden] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (!alive) return; if (d?.user?.role !== "admin") { setForbidden(true); return; } })
      .catch(() => {});
    fetch("/api/admin/harness/stats").then(r => r.ok ? r.json() : { error: "denied" }).then(d => { if (alive && d?.pipeline) setStats({ pipeline: d.pipeline, pendingCandidates: d.pendingCandidates ?? 0, edges: d.edges ?? 0, versions: d.versions ?? 0 }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const pendingBadge = stats.pendingCandidates > 0;
  const tabs = [
    { key: "review" as const, label: "후보 · 에피소드 · 그래프", badge: pendingBadge ? stats.pendingCandidates : 0 },
    { key: "edit" as const, label: "스킬 편집" },
    { key: "backup" as const, label: "백업 · 드라이런 평가" },
  ];
  if (forbidden) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center">
        <h1 className="font-serif text-lg font-semibold text-ink">접근 권한 없음</h1>
        <p className="mt-2 text-sm text-ink-soft">이 페이지는 부서장(관리자) 전용입니다. 관리자 계정으로 로그인해 주세요.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <header className="pl-3">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Admin · 지식 하네스</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-ink">지속적 자기개선</h1>
        <p className="mt-1 text-sm text-ink-soft">부서 경험·채팅에서 지식을 선별하고, 검토 승인한 뒤 페르소나에 주입합니다. 적용은 항상 부서장 승인으로만 반영됩니다.</p>
      </header>

      {/* 파이프라인 개요 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-base font-semibold text-ink">지식 파이프라인</h2>
          <span className="font-mono text-[11px] text-ink-faint">연결 {stats.edges} · 변경 이력(버전) {stats.versions}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stats.pipeline.map((p, i) => (
            <div key={p.key + i} className="relative rounded-xl border border-line bg-canvas px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">{p.stage}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-ink">{p.value}</p>
              <p className="text-[11px] text-ink-soft">{p.label}</p>
              {(p.pending ?? p.applied ?? p.rejected) !== undefined && (
                <p className="mt-1 font-mono text-[10px] text-ink-soft">
                  {typeof p.pending === "number" && <span className="text-pale-amber-text">대기 {p.pending}</span>}
                  {typeof p.applied === "number" && <span className="ml-1 text-pale-green-text">적용 {p.applied}</span>}
                  {typeof p.rejected === "number" && <span className="ml-1 text-pale-red-text">거절 {p.rejected}</span>}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setView(t.key)}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              view === t.key ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
            }`}>
            {t.label}
            {!!t.badge && (
              <span className="rounded-full bg-pale-amber px-1.5 py-0.5 font-mono text-[10px] text-pale-amber-text">{t.badge}</span>
            )}
          </button>
        ))}
      </nav>
      {view === "review" && <ReviewQueue />}
      {view === "edit" && <HarnessPanel />}
      {view === "backup" && <BackupAssessPanel />}
    </div>
  );
}
