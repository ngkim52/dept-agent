"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = { id: string; email: string; name: string; role: string; status: string; departmentId: string; createdAt: string };

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  active: { label: "승인됨", cls: "bg-pale-green text-pale-green-text" },
  pending: { label: "대기", cls: "bg-pale-amber text-pale-amber-text" },
  rejected: { label: "거절", cls: "bg-pale-red text-pale-red-text" },
};

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

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
      </div>
    </main>
  );
}
