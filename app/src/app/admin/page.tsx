"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = { id: string; email: string; name: string; role: string; status: string; departmentId: string; createdAt: string };

type OrModel = { id: string; name: string; context: number; input: number; input_str: string; output: number; output_str: string };

const OR_MODELS: Record<string, { label: string; desc: string; env: string }> = {
  response: { label: "부서장 응답·종합 의견", desc: "핵심 답변 품질을 결정합니다", env: "LLM_MODEL_RESPONSE" },
  simple: { label: "간단 응답·서브에이전트", desc: "부서 위임·간단 QA (반복 호출)", env: "LLM_MODEL_SIMPLE" },
  bulk: { label: "RAG·대량 데이터", desc: "데이터 해석·검색 요약", env: "LLM_MODEL_BULK" },
  compact: { label: "컨텍스트 압축", desc: "히스토리 요약 (내부 호출)", env: "LLM_MODEL_COMPACT" },
};

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  active: { label: "승인됨", cls: "bg-pale-green text-pale-green-text" },
  pending: { label: "대기", cls: "bg-pale-amber text-pale-amber-text" },
  rejected: { label: "거절", cls: "bg-pale-red text-pale-red-text" },
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // 모델 설정 상태
  const [models, setModels] = useState<OrModel[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState("");
  const [modelSaved, setModelSaved] = useState("");
  const [modelDrafts, setModelDrafts] = useState<Record<string, { model: string; gateway: string }>>({});
  const [modelEffective, setModelEffective] = useState<Record<string, { model: string; gateway: string }>>({});
  const [modelBaseUrl, setModelBaseUrl] = useState("");
  const [modelDefault, setModelDefault] = useState("");
  const [gateways, setGateways] = useState<{ id: string; label: string; baseUrl: string; hasKey: boolean }[]>([]);
  const [activeGateway, setActiveGateway] = useState("openrouter");

  // ── 부서↔데이터셋 설정 ──
  const [deptData, setDeptData] = useState<{ id: string; name: string; datasetIds: string[] }[]>([]);
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptSaved, setDeptSaved] = useState("");
  const [deptDrafts, setDeptDrafts] = useState<Record<string, string[]>>({});
  const [deptError, setDeptError] = useState("");

  async function load() {
    const d = await (await fetch("/api/admin/users")).json();
    setUsers(d.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.user) { router.replace("/"); return; }
      if (d.user.role !== "admin") { router.replace("/chat"); return; }
      load();
      loadModelConfig();
      loadDeptData();
    });
  }, [router]);

  async function setStatus(userId: string, status: "active" | "rejected") {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, status }),
    });
    load();
  }

  const counts = useMemo(() => ({
    pending: users.filter(u => u.status === "pending").length,
    active: users.filter(u => u.status === "active").length,
    rejected: users.filter(u => u.status === "rejected").length,
  }), [users]);

  // ── 모델 설정 ──
  async function loadModelConfig() {
    try {
      const d = await (await fetch("/api/admin/models/config")).json();
      if (d.error) { setModelError(d.error); return; }
      setModelBaseUrl(d.baseUrl ?? "");
      setModelDefault(d.defaultModel ?? "");
      setModelEffective(d.effective ?? {});
      setGateways(d.gateways ?? []);
      if (d.gateways?.length) {
        const withKey = d.gateways.find((g: any) => g.hasKey);
        setActiveGateway(withKey?.id ?? d.gateways[0].id);
      }
      const drafts: Record<string, { model: string; gateway: string }> = {};
      for (const k of Object.keys(d.dbValues ?? {})) {
        const v = d.dbValues[k];
        if (v && v.model) drafts[k] = { model: v.model, gateway: v.gateway ?? "litellm" };
      }
      setModelDrafts(drafts);
    } catch { setModelError("설정 조회 실패"); }
  }

  async function loadDeptData() {
    setDeptLoading(true); setDeptError(""); setDeptSaved("");
    try {
      const d = await (await fetch("/api/admin/departments")).json();
      if (d.error) { setDeptError(d.error); return; }
      setDeptData(d.departments ?? []);
      setDatasets(d.datasets ?? []);
    } catch { setDeptError("부서/데이터셋 조회 실패"); }
    finally { setDeptLoading(false); }
  }

  async function saveDeptDatasets(deptId: string, ids: string[]) {
    setDeptSaved(""); setDeptError("");
    try {
      const res = await fetch("/api/admin/departments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: deptId, datasetIds: ids }),
      });
      const d = await res.json();
      if (!res.ok) { setDeptError(d.error ?? "저장 실패"); return; }
      setDeptSaved("저장 완료 — RAG 검색에 즉시 반영됩니다");
      setDeptDrafts(p => ({ ...p, [deptId]: ids }));
      loadDeptData();
    } catch { setDeptError("저장 실패"); }
  }

  // 체크박스 토글
  function toggleDeptDataset(deptId: string, datasetId: string, checked: boolean) {
    setDeptDrafts(prev => {
      const cur = prev[deptId] ?? deptData.find(d => d.id === deptId)?.datasetIds ?? [];
      const next = checked ? [...cur, datasetId] : cur.filter(x => x !== datasetId);
      return { ...prev, [deptId]: next };
    });
  }

  // 부서 드래프트: 서버에서 로드되면 동기화
  useEffect(() => {
    const init: Record<string, string[]> = {};
    for (const d of deptData) init[d.id] = d.datasetIds ?? [];
    setDeptDrafts(prev => {
      // 새 부서 로드 시에만 초기화 (사용자 편집 보존)
      return { ...prev, ...init };
    });
  }, [deptData]);

  async function loadGatewayModels() {
    setModelLoading(true); setModelError(""); setModelSaved("");
    try {
      const d = await (await fetch(`/api/admin/models/openrouter?gateway=${encodeURIComponent(activeGateway)}`)).json();
      if (d.error) { setModelError(d.error); return; }
      setModels(d.models ?? []);
      if (!d.models?.length) setModelError(`${d.label ?? activeGateway} 모델 목록이 비어있습니다. API 키를 확인해주세요.`);
    } catch { setModelError(`${activeGateway} 조회 실패`); }
    finally { setModelLoading(false); }
  }

  async function saveModels() {
    setModelSaved(""); setModelError("");
    try {
      const res = await fetch("/api/admin/models/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modelDrafts),
      });
      const d = await res.json();
      if (!res.ok) { setModelError(d.error ?? "저장 실패"); return; }
      setModelSaved("저장 완료 — 다음 요청부터 적용됩니다");
      loadModelConfig();
    } catch { setModelError("저장 실패"); }
  }

  function modelPrice(m: OrModel | undefined) {
    if (!m) return "";
    const i = m.input_str || String(m.input || "");
    const o = m.output_str || String(m.output || "");
    return `${i || "?"} / ${o || "?"}`;
  }

  const noActions = users.every(u => u.status === "active");

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* 헤더 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Admin · 승인 관리</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-ink">부서장 페르소나</h1>
            <p className="mt-1 text-sm text-ink-soft">가입 신청자를 승인하면 서비스를 이용할 수 있습니다.</p>
          </div>
          <button onClick={() => router.replace("/chat")}
            className="lift flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-accent-soft hover:text-accent">
            채팅으로 가기
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>

        {/* 요약 */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { count: counts.pending, label: "대기", cls: "bg-pale-amber text-pale-amber-text" },
            { count: counts.active, label: "승인됨", cls: "bg-pale-green text-pale-green-text" },
            { count: counts.rejected, label: "거절", cls: "bg-pale-red text-pale-red-text" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-line bg-surface px-5 py-4">
              <p className="font-mono text-2xl font-semibold tabular-nums text-ink">{s.count}</p>
              <p className="mt-1"><span className={`inline-block rounded-full px-2.5 py-0.5 font-mono text-[11px] ${s.cls}`}>{s.label}</span></p>
            </div>
          ))}
        </div>

        {/* 테이블 */}
        <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-ink-faint">불러오는 중…</div>
          ) : users.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm text-ink-soft">아직 신청한 사용자가 없습니다.</p>
              <p className="mt-1 font-mono text-[11px] text-ink-faint">첫 신청은 자동으로 관리자 계정이 되며, 승인 대기 상태로 표시됩니다</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["이름", "이메일", "가입일", "상태", ""].map((th, i) => (
                    <th key={i} className={`${i === 0 ? "pl-5" : ""} ${i === 4 ? "pr-5" : ""} py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-ink-faint`}>
                      {th || "작업"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {users.map(u => {
                  const st = STATUS_UI[u.status] ?? STATUS_UI.pending;
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-canvas">
                      <td className="py-3 pl-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft font-serif text-sm font-semibold text-accent">
                            {(u.name ?? "?").slice(-2)}
                          </span>
                          <div>
                            <p className="font-medium text-ink">{u.name}</p>
                            <p className="font-mono text-[11px] text-ink-faint">{u.role === "admin" ? "관리자" : "구성원"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-ink-soft">{u.email}</td>
                      <td className="py-3 pr-4 font-mono text-xs text-ink-faint">
                        {new Date(u.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded-full px-2.5 py-1 font-mono text-[11px] ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="py-3 pr-5 text-right">
                        {u.status !== "active" && (
                          <button onClick={() => setStatus(u.id, "active")}
                            className="lift mr-2 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#33312E]">
                            승인
                          </button>
                        )}
                        {u.status === "pending" && (
                          <button onClick={() => setStatus(u.id, "rejected")}
                            className="lift rounded-md border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-pale-red hover:text-pale-red-text">
                            거절
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!loading && users.length > 0 && (
          <p className="mt-4 text-center font-mono text-[11px] text-ink-faint">
            {noActions ? "모든 신청이 처리되었습니다." : "승인 시 해당 부서의 부서장 페르소나 사용이 가능합니다."}
          </p>
        )}

        {/* ── 모델 설정 ── */}
        <div className="mt-12 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Admin · 모델 설정</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-ink">용도별 LLM 모델</h2>
              <p className="mt-1 text-sm text-ink-soft">게이트웨이(OpenRouter/LiteLLM) 목록에서 모델을 선택하면 즉시 적용됩니다.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadGatewayModels} disabled={modelLoading}
                className="lift rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50">
                {modelLoading ? "불러오는 중…" : `${gateways.find(g => g.id === activeGateway)?.label ?? activeGateway} 목록 불러오기`}
              </button>
              <button onClick={saveModels}
                className="lift rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#33312E]">
                저장
              </button>
            </div>
          </div>

          {/* 게이트웨이 선택 */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint">게이트웨이</span>
            {gateways.map(g => (
              <button key={g.id} onClick={() => { setActiveGateway(g.id); setModels([]); }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeGateway === g.id
                    ? "border-ink bg-ink text-white"
                    : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
                }`}>
                {g.label}
                {!g.hasKey && <span className="ml-1 font-mono text-[10px] opacity-70">(키 없음)</span>}
              </button>
            ))}
            {gateways.length === 0 && <span className="text-xs text-ink-faint">게이트웨이 정보 없음</span>}
          </div>

          {modelError && <p role="alert" className="mt-4 rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{modelError}</p>}
          {modelSaved && <p className="mt-4 rounded-md bg-pale-green px-3 py-2 text-xs leading-relaxed text-pale-green-text">{modelSaved}</p>}

          <p className="mt-4 font-mono text-[11px] text-ink-faint">
            게이트웨이: <span className="text-ink-soft">{modelBaseUrl || "(LLM_BASE_URL)"}</span>
            {" · "}기본 모델: <span className="text-ink-soft">{modelDefault || "(LLM_MODEL)"}</span>
          </p>

          <div className="mt-4 space-y-3">
            {Object.entries(OR_MODELS).map(([key, info]) => {
              const sel = modelDrafts[key];
              const selected = sel?.model ?? "";
              const eff = modelEffective[key];
              const cur = models.find(m => m.id === selected);
              const effLabel = eff?.model ? `${eff.gateway === "openrouter" ? "OR" : "LT"}·${eff.model}` : "(기본값)";
              return (
                <div key={key} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{info.label}</p>
                      <p className="mt-0.5 text-xs text-ink-soft">{info.desc}</p>
                    </div>
                    <span className="font-mono text-[10px] text-ink-faint">{info.env}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select value={selected} onChange={e => setModelDrafts(d => ({ ...d, [key]: { model: e.target.value, gateway: activeGateway } }))}
                      className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent">
                      <option value="">(기본값 사용)</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    {cur && (
                      <span className="rounded-full bg-canvas px-2.5 py-1 font-mono text-[10px] text-ink-faint">
                        ${modelPrice(cur)}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-ink-faint">
                    <span className="mr-1 inline-block rounded-full bg-canvas px-1.5 py-0.5 text-[10px]">{gateways.find(g => g.id === activeGateway)?.label ?? activeGateway}</span>
                    적용 중: <span className="text-ink-soft">{effLabel}</span>
                    {sel && selected !== (eff?.model ?? "") && <span className="ml-1 text-pale-amber-text">(저장 대기)</span>}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-4 font-mono text-[11px] leading-relaxed text-ink-faint">
            API 키는 환경변수(LLM_API_KEY)로만 보관됩니다. UI에는 저장되지 않습니다. 모델 목록은 서버에서 조회됩니다.
          </p>
        </div>

        {/* ── 부서 ↔ RAGFlow 데이터셋 연동 ── */}
        <div className="mt-12 border-t border-line pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint">Admin · RAG 연동</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-ink">부서 ↔ 데이터셋</h2>
              <p className="mt-1 text-sm text-ink-soft">각 부서가 RAG 검색에 사용할 RAGFlow 데이터셋을 연결합니다.</p>
            </div>
            <button onClick={loadDeptData} disabled={deptLoading}
              className="lift rounded-md border border-line-strong bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-accent-soft hover:text-accent disabled:opacity-50">
              {deptLoading ? "불러오는 중…" : "새로고침"}
            </button>
          </div>

          {deptError && <p role="alert" className="mt-4 rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{deptError}</p>}
          {deptSaved && <p className="mt-4 rounded-md bg-pale-green px-3 py-2 text-xs leading-relaxed text-pale-green-text">{deptSaved}</p>}

          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
            {deptData.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-ink-faint">부서 정보가 없습니다.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {["부서", "연결할 데이터셋 (복수 선택)", ""].map((th, i) => (
                      <th key={i} className={`${i === 0 ? "pl-5" : ""} ${i === 2 ? "pr-5" : ""} py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-ink-faint`}>{th || "작업"}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {deptData.map(d => {
                    const draft = deptDrafts[d.id] ?? d.datasetIds ?? [];
                    const savedCount = (d.datasetIds ?? []).length;
                    return (
                      <tr key={d.id} className="transition-colors hover:bg-canvas">
                        <td className="py-3 pl-5 align-top">
                          <p className="font-medium text-ink">{d.name}</p>
                          <p className="font-mono text-[10px] text-ink-faint">{d.id}</p>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <div className="flex flex-wrap gap-2">
                            {datasets.length === 0 && <span className="text-xs text-ink-faint">RAGFlow 데이터셋이 없습니다.</span>}
                            {datasets.map(ds => {
                              const checked = draft.includes(ds.id);
                              return (
                                <label key={ds.id} className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                                  checked ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
                                }`}>
                                  <input type="checkbox"
                                    checked={checked}
                                    onChange={e => toggleDeptDataset(d.id, ds.id, e.target.checked)}
                                    className="h-3.5 w-3.5 accent-[#2b2b28]" />
                                  <span className="max-w-[16rem] truncate">{ds.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-3 pr-5 text-right align-top">
                          <div className="flex flex-col items-end gap-1">
                            <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] ${
                              savedCount ? "bg-pale-green text-pale-green-text" : "bg-pale-amber text-pale-amber-text"
                            }`}>
                              {savedCount > 0 ? `${savedCount}개 연결됨` : "미연결"}
                            </span>
                            <button onClick={() => saveDeptDatasets(d.id, draft)}
                              className="lift rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#33312E]">
                              저장
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-4 font-mono text-[11px] text-ink-faint">
            RAGFlow 데이터셋: <span className="text-ink-soft">{datasets.length}개</span>
          </p>
        </div>
      </div>
    </main>
  );
}
