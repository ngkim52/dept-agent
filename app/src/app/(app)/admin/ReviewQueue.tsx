"use client";
import { useCallback, useEffect, useState } from "react";

type Candidate = {
  id: string; personaKey: string; sourceKind: string; sourceId: string; summary?: string;
  action: string; targetTitle?: string; proposedContent?: string; confidence: number;
  status: string; adminNote?: string; createdAt: string;
  requestType?: string; proposedByRole?: string; sourceConversationId?: string;
  related?: { type: string; id: string; title: string; content: string; score: number }[];
};
const CAND_ID: Record<string, string> = { knowledge_gap: "직원 확인 요청", judgment_rule: "판단기준 저장", admin_chat: "관리자 채팅", episode: "에피소드" };
type Episode = { id: string; departmentId: string; summary?: string; conclusion?: string; sourceIds?: string; status: string; createdAt: string; tokenCount?: number };
type Edge = { id: string; fromType: string; fromId: string; toType: string; toId: string; rel: string; createdAt?: string };

const ACTION_LABEL: Record<string, string> = {
  create_skill: "스킬 생성", update_skill: "스킬 수정", create_prompt: "프롬프트 생성", update_prompt: "프롬프트 수정", create_memory: "메모리 생성", update_memory: "메모리 수정",
};
const STATUS_LABEL: Record<string, string> = { pending: "대기", approved: "승인", rejected: "거절", applied: "적용", edited: "수정적용" };

export default function ReviewQueue() {
  const [personaKey] = useState("claims-planning");
  const [tab, setTab] = useState<"candidates" | "episodes" | "graph">("candidates");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "applied" | "rejected" | "edited">("all");
  const [cands, setCands] = useState<Candidate[]>([]);
  const [eps, setEps] = useState<Episode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [nodes, setNodes] = useState<Record<string, { label: string; kindLabel: string }>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [graphBusy, setGraphBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, { content: string; note: string; name?: string; description?: string }>>({});
  const [conflicts, setConflicts] = useState<Record<string, any[]>>({});
  const [applyMode, setApplyMode] = useState<Record<string, { mode: "create" | "modify" | "replace"; target?: string }>>({});

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3500); };
  const jh = { "Content-Type": "application/json" };

  const loadCands = useCallback(async () => {
    const d = await (await fetch(`/api/admin/candidates?personaKey=${personaKey}`)).json();
    setCands(d.candidates ?? []);
  }, [personaKey]);
  const loadEps = useCallback(async () => {
    const d = await (await fetch(`/api/admin/episodes?departmentId=${personaKey}`)).json();
    setEps(d.episodes ?? []);
  }, [personaKey]);
  const loadGraph = useCallback(async () => {
    const d = await (await fetch("/api/admin/harness/graph")).json();
    setEdges(d.edges ?? []);
    setNodes(d.nodes ?? {});
  }, []);
  const loadAll = useCallback(() => { loadCands(); loadEps(); loadGraph(); }, [loadCands, loadEps, loadGraph]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function decide(c: Candidate, decision: "reject" | "apply", overrides?: any) {
    const body: any = { decision };
    if (decision === "reject") body.adminNote = draft[c.id]?.note;
    const am = applyMode[c.id];
    body.overrides = { ...(overrides ?? {}), mode: am?.mode ?? "create", targetType: am?.target?.split(":")[0], targetId: am?.target?.split(":").slice(1).join(":") || undefined };
    if ((am?.mode ?? "create") === "create") { delete body.overrides.targetType; delete body.overrides.targetId; }
    const res = await fetch(`/api/admin/candidates/${c.id}`, { method: "PATCH", headers: jh, body: JSON.stringify(body) });
    const d = await res.json();
    if (d.error) { flash(false, d.error); return; }
    flash(true, decision === "reject" ? "거절 처리되었습니다" : "적용되었습니다");
    loadCands();
  }

  async function generate() {
    setGenBusy(true);
    try {
      const res = await fetch(`/api/admin/episodes/generate?departmentId=${personaKey}`, { method: "POST" });
      const d = await res.json();
      if (d.error) { flash(false, d.error); } else { flash(true, `에피소드 압축 완료 — 후보 ${(d.candidates ?? []).length}건 생성`); loadAll(); }
    } finally { setGenBusy(false); }
  }

  async function buildGraph() {
    setGraphBusy(true);
    try {
      const res = await fetch(`/api/admin/harness/graph/build?personaKey=${personaKey}`, { method: "POST" });
      const d = await res.json();
      if (d.error) { flash(false, d.error); } else { flash(true, `LLM 관계 제안 ${d.proposed ?? 0} · 신규 저장 ${d.added ?? 0}건`); loadGraph(); }
    } finally { setGraphBusy(false); }
  }

  const [publishBusy, setPublishBusy] = useState<string | null>(null);
  async function publishEp(id: string) {
    setPublishBusy(id);
    try {
      const res = await fetch("/api/admin/episodes/publish", { method: "POST", headers: jh, body: JSON.stringify({ id }) });
      const d = await res.json();
      if (d.error) { flash(false, d.error); } else { flash(true, `에피소드 결론을 지식(메모리)으로 저장했습니다`); }
    } finally { setPublishBusy(null); }
  }


  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
        <div>
          <h3 className="font-serif text-lg font-semibold tracking-tight text-ink">검토 큐</h3>
          <p className="mt-0.5 text-xs text-ink-soft">부서원 Q&A 압축·부서장 채팅에서 추출된 지식 후보를 검토해 적용/거절합니다.</p>
        </div>
        <button onClick={generate} disabled={genBusy} className="lift rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-[#33312E] disabled:opacity-50">
          {genBusy ? "압축 중…" : "＋ 대화 압축 생성"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["candidates", "episodes", "graph"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${tab === k ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas"}`}>
            {k === "candidates" ? "적용 후보" : k === "episodes" ? "에피소드" : "지식 연결(그래프)"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        {(["all", "pending", "applied", "rejected", "edited"] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium ${statusFilter === s ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas"}`}>
            {s === "all" ? "전체" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {msg && <p className={`mt-4 rounded-md px-3 py-2 text-xs ${msg.ok ? "bg-pale-green text-pale-green-text" : "bg-pale-red text-pale-red-text"}`}>{msg.text}</p>}

      {tab === "candidates" && (
        <div className="mt-4 space-y-3">
          {(() => { const visible = statusFilter === "all" ? cands : cands.filter((c) => c.status === statusFilter); return visible.length === 0
            ? <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-faint">조건에 맞는 후보가 없습니다.</div>
            : visible.map((c) => (
              <div key={c.id} className={`rounded-xl border bg-surface p-4 ${c.status === "pending" ? "border-line" : "border-line opacity-70"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{ACTION_LABEL[c.action] ?? c.action}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "pending" ? "bg-pale-amber text-pale-amber-text" : "bg-canvas text-ink-faint"}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                  <span className="font-mono text-[10px] text-ink-faint">신뢰도 {Math.round(c.confidence * 100)}% · {c.sourceKind}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">{c.requestType && <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] text-ink-faint">{CAND_ID[c.requestType] ?? c.requestType}{c.proposedByRole === "user" ? " (직원)" : c.proposedByRole === "admin" ? " (부장)" : ""}</span>}</div>
                {c.targetTitle && <p className="mt-2 text-sm font-semibold text-ink">{c.targetTitle}</p>}
                {c.summary && <p className="mt-1 text-xs text-ink-soft">{c.summary}</p>}
                {c.status === "pending" && c.action === "create_skill" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      value={draft[c.id]?.name ?? c.targetTitle ?? ""}
                      onChange={e => setDraft(d => ({ ...d, [c.id]: { content: d[c.id]?.content ?? c.proposedContent ?? "", note: d[c.id]?.note ?? "", name: e.target.value, description: d[c.id]?.description ?? c.summary ?? "" } }))}
                      placeholder="스킬 이름" className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" />
                    <input
                      value={draft[c.id]?.description ?? c.summary ?? ""}
                      onChange={e => setDraft(d => ({ ...d, [c.id]: { content: d[c.id]?.content ?? c.proposedContent ?? "", note: d[c.id]?.note ?? "", name: d[c.id]?.name ?? c.targetTitle ?? "", description: e.target.value } }))}
                      placeholder="스킬 설명(발동 조건)" className="rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" />
                  </div>
                )}
                <textarea
                  value={draft[c.id]?.content ?? c.proposedContent ?? ""}
                  onChange={e => setDraft(d => ({ ...d, [c.id]: { content: e.target.value, note: d[c.id]?.note ?? "", name: d[c.id]?.name, description: d[c.id]?.description } }))}
                  className="mt-2 min-h-16 w-full rounded-md border border-line-strong bg-canvas px-3 py-2 font-mono text-xs leading-relaxed text-ink" />
                <input value={draft[c.id]?.note ?? ""} onChange={e => setDraft(d => ({ ...d, [c.id]: { content: d[c.id]?.content ?? c.proposedContent ?? "", note: e.target.value, name: d[c.id]?.name, description: d[c.id]?.description } }))} placeholder="부서장 의견 (거절 이유 등)" className="mt-2 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-xs" />
                {c.status === "pending" && (
                  <>
                    {(c.related && c.related.length > 0) && (
                      <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2">
                        <p className="text-[11px] font-semibold text-amber-800">연관/유사한 기존 지식이 감지됐습니다 — 신규 생성 또는 기존 항목의 수정/교체를 선택하세요.</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {(["create", "modify", "replace"] as const).map((md) => (
                            <label key={md} className="flex cursor-pointer items-center gap-1 text-[11px] text-ink-soft">
                              <input type="radio" name={`mode-${c.id}`} checked={(applyMode[c.id]?.mode ?? "create") === md}
                                onChange={() => setApplyMode(m => ({ ...m, [c.id]: { mode: md, target: m[c.id]?.target ?? `${c.related![0].type}:${c.related![0].id}` } }))} />
                              {md === "create" ? "신규 생성" : md === "modify" ? "기존 수정" : "기존 교체"}
                            </label>
                          ))}
                          {(applyMode[c.id]?.mode ?? "create") !== "create" && (
                            <select value={applyMode[c.id]?.target ?? `${c.related![0].type}:${c.related![0].id}`}
                              onChange={e => setApplyMode(m => ({ ...m, [c.id]: { mode: m[c.id]?.mode ?? "modify", target: e.target.value } }))}
                              className="rounded-md border border-line-strong bg-surface px-2 py-1 text-[11px]">
                              {c.related.map((r) => (
                                <option key={r.id} value={`${r.type}:${r.id}`}>{r.title} · {Math.round(r.score * 100)}% 유사</option>
                              ))}
                            </select>
                          )}
                          {(applyMode[c.id]?.mode ?? "create") !== "create" && (() => {
                            const sel = (c.related ?? []).find((r) => `${r.type}:${r.id}` === applyMode[c.id]?.target) ?? c.related![0];
                            if (!sel) return null;
                            return (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-line bg-canvas p-2">
                                  <p className="text-[10px] font-semibold text-ink-faint">기존 지식 ({sel.type} · {sel.title})</p>
                                  <p className="mt-1 text-[11px] leading-snug text-ink-soft">{sel.content || "(내용 없음)"}</p>
                                </div>
                                <div className="rounded-lg border border-ink/30 bg-[#fff8ec] p-2">
                                  <p className="text-[10px] font-semibold text-ink-faint">새 제안 (후보)</p>
                                  <p className="mt-1 text-[11px] leading-snug text-ink">{draft[c.id]?.content ?? c.proposedContent}</p>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => decide(c, "apply", { content: draft[c.id]?.content ?? c.proposedContent, name: draft[c.id]?.name ?? undefined, description: draft[c.id]?.description ?? undefined })} className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white">적용</button>
                      <button onClick={() => decide(c, "reject")} className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs text-ink-soft">거절</button>
                    </div>
                  </>
                )}
                {c.adminNote && <p className="mt-2 text-xs text-pale-amber-text">의견: {c.adminNote}</p>}
              </div>
            )); })()}
        </div>
      )}

      {tab === "episodes" && (
        <div className="mt-4 space-y-3">
          {eps.length === 0 ? <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center text-sm text-ink-faint">생성된 에피소드가 없습니다. 위 「대화 압축 생성」 버튼을 누르세요.</div>
            : eps.map((e) => (
              <div key={e.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px]">{e.status}</span>
                  <span className="font-mono text-[10px] text-ink-faint">{e.createdAt ? new Date(e.createdAt).toLocaleString() : ""} · {e.tokenCount ?? 0}자</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{e.summary}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{e.conclusion}</p>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => publishEp(e.id)} disabled={publishBusy === e.id || !e.conclusion}
                    className="rounded-md border border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33312E] disabled:opacity-40">
                    {publishBusy === e.id ? "저장 중…" : "결론을 지식(메모리)으로 저장"}
                  </button>
                  <span className="text-[11px] text-ink-faint">에피소드는 대화→지식 파이프라인의 중간 산출물입니다. 결론을 확정·저장하면 부서 페르소나 지식으로 재사용됩니다.</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {tab === "graph" && (
        <div className="mt-4 rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-ink">지식 연결 그래프 <span className="font-mono text-ink-faint">({edges.length}건)</span></p>
            <div className="flex items-center gap-2">
              <button onClick={buildGraph} disabled={graphBusy} className="lift rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#33312E] disabled:opacity-50">
                {graphBusy ? "관계 판단 중…" : "＋ LLM로 관계 자동 구성"}
              </button>
              <button onClick={loadGraph} className="font-mono text-[11px] text-ink-faint hover:text-accent">새로고침</button>
            </div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            한 지식(좌: 출처)이 다른 지식(우: 대상)과 어떻게 이어지는지 보여줍니다.{" "}
            <span className="text-accent">related=서로 연관</span> · <span className="text-accent">source_of=출처에서 파생</span> · <span className="text-accent">supports=지지</span> · <span className="text-accent">refutes=충돌</span> · <span className="text-accent">derives=파생</span>.
            「＋ LLM로 관계 자동 구성」은 LLM이 활성 지식 항목 간 의미 관계를 판단·저장하며, 저장된 연결은 그래프에 즉시 표시됩니다.
          </p>
          <GraphView edges={edges} nodes={nodes} />
        </div>
      )}
    </div>
  );
}

// 지식 그래프 시각화 — 두 레이어(node-link) SVG 렌더
function GraphView({ edges, nodes = {} }: { edges: any[]; nodes?: Record<string, { label: string; kindLabel: string }> }) {
  if (!edges?.length) return <p className="mt-3 text-xs text-ink-faint">연결된 지식이 없습니다.</p>;
  const L = 120, R = 520, RW = 60, colGap = 60;
  const label = (t: string, id: string) => {
    const n = nodes[t + ":" + id];
    return n ? `${n.kindLabel}·${n.label}` : `${t}·${id.slice(0, 8)}`;
  };
  type K = string; const key = (t: string, id: string) => t + ":" + id;
  const srcs: { t: string; id: string }[] = [], tgts: { t: string; id: string }[] = [];
  const sIx = new Map<string, number>(), tIx = new Map<string, number>();
  for (const e of edges) {
    if (!sIx.has(key(e.fromType, e.fromId))) { sIx.set(key(e.fromType, e.fromId), srcs.length); srcs.push({ t: e.fromType, id: e.fromId }); }
    if (!tIx.has(key(e.toType, e.toId))) { tIx.set(key(e.toType, e.toId), tgts.length); tgts.push({ t: e.toType, id: e.toId }); }
  }
  const rows = Math.max(srcs.length, tgts.length, 1);
  const H = rows * 44 + 30;
  const sY = (i: number) => 40 + i * 44;
  const tY = (i: number) => 40 + i * 44;
  const relColor: Record<string, string> = { source_of: "#1F6C9F", related: "#B08600", supports: "#3E8E5A", refutes: "#C2482A", derives: "#7A5BA6" };
  const dots: Record<string, string> = { prompt: "#1F6C9F", skill: "#7A5BA6", memory: "#3E8E5A", episode: "#B08600", candidate: "#C2482A", conversation: "#5B6472" };
  const lab: Record<string, string> = { prompt: "프롬프트", skill: "스킬", memory: "메모리", episode: "에피소드", candidate: "후보", conversation: "대화" };
  // horizontal curve per edge: layer by column to reduce overlap
  return (
    <div className="mt-3 overflow-x-auto">
      <svg width={L + RW + colGap + (R - L) + 40} height={Math.max(H, 120)} viewBox={`0 0 ${L + RW + colGap + (R - L) + 40} ${Math.max(H,120)}`}>
        {/* 레이어 레이블 */}
        <text x={L - 8} y={16} textAnchor="end" fontSize="10" fill="#9AA3AF" fontFamily="inherit">출처</text>
        <text x={R + 8} y={16} fontSize="10" fill="#9AA3AF" fontFamily="inherit">대상</text>
        {/* 엣지 */}
        {edges.map((e, ei) => {
          const si = srcs.findIndex((s) => s.t === e.fromType && s.id === e.fromId);
          const ti = tgts.findIndex((t) => t.t === e.toType && t.id === e.toId);
          const layers = e.id.length % 3;
          const sx = L + RW + layers * (colGap / 3);
          const tx = R - 0;
          const y1 = sY(si), y2 = tY(ti);
          const mid = (sx + tx) / 2;
          return <path key={e.id + ei} d={`M${sx} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${tx} ${y2}`} fill="none" stroke={relColor[e.rel] ?? "#9AA3AF"} strokeWidth="1.4" opacity="0.7" />;
        })}
        {/* 출처 노드 */}
        {srcs.map((n, i) => {
          const x = L, y = sY(i);
          return (
            <g key={"s" + i}>
              <circle cx={x} cy={y} r={5} fill={dots[n.t] ?? "#9AA3AF"} />
              <text x={x + 10} y={y + 3} fontSize="10" fill="#33343A" fontFamily="inherit">{label(n.t, n.id)}</text>
            </g>
          );
        })}
        {/* 대상 노드 */}
        {tgts.map((n, i) => {
          const x = R, y = tY(i);
          return (
            <g key={"t" + i}>
              <circle cx={x} cy={y} r={5} fill={dots[n.t] ?? "#9AA3AF"} />
              <text x={x - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#33343A" fontFamily="inherit">{label(n.t, n.id)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-ink-faint">
        {Object.entries(relColor).map(([k, c]) => (<span key={k} className="flex items-center gap-1"><span className="inline-block h-1.5 w-4 rounded" style={{ background: c }} />{k}</span>))}
      </div>
    </div>
  );
}
