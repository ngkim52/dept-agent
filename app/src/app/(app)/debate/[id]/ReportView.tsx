"use client";
import { useState } from "react";
import MarkdownViewer from "@/components/MarkdownViewer";

/** 저장된 보고서 원문에 이스케이프된 개행(\n 두 글자)이 섞여 있으면 실제 개행으로 되돌린다 */
function normalizeMd(md: string): string {
  if (md.includes("\\n") && !md.includes("\n")) return md.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  return md;
}

// 최종 보고서 뷰 — 기본은 MD 뷰어(렌더링), 필요하면 원문, 파일로도 저장
export default function ReportView({ id, md, verdict, onReload }: { id: string; md: string | null; verdict: string | null; onReload: () => void }) {
  const [mode, setMode] = useState<"viewer" | "raw">("viewer");

  if (!md) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
        <p className="text-sm text-ink-soft">아직 최종 보고서가 생성되지 않았습니다.</p>
        <p className="mt-1 text-xs text-ink-faint">토론이 끝나면 최종 결론 에이전트가 보고서를 작성합니다.</p>
        <button onClick={onReload} className="lift mt-4 rounded-md border border-line-strong bg-surface px-3 py-2 text-xs font-medium text-ink-soft hover:bg-accent-soft hover:text-accent">
          새로고침
        </button>
      </div>
    );
  }

  const text = normalizeMd(md);
  return (
    <div className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-serif text-lg font-semibold text-ink">최종 보고서</p>
          {verdict && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">{verdict}</span>}
          <span className="font-mono text-[10px] text-ink-faint">MD 뷰어 표시 중</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-line bg-canvas p-1">
            {([["viewer", "뷰어"], ["raw", "MD 원문"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  mode === k ? "bg-ink text-white" : "text-ink-soft hover:bg-accent-soft hover:text-accent"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <a href={`/api/debate/${id}/report?download=1`}
            className="lift rounded-md border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-accent-soft hover:text-accent">
            MD 파일 저장
          </a>
        </div>
      </div>

      <div className="mt-4">
        {mode === "viewer" ? (
          <MarkdownViewer content={text} />
        ) : (
          <pre className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-canvas p-4 font-mono text-[12px] leading-relaxed text-ink-soft">{text}</pre>
        )}
      </div>
    </div>
  );
}
