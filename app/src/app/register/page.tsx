"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Department = { id: string; name: string };

export default function RegisterPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/departments").then(r => r.json()).then(d => setDepartments(d.departments ?? []));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password, departmentId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "가입 실패"); setBusy(false); return; }
      if (data.user.status === "active") {
        setDone("가입되었습니다. 로그인해 주세요.");
      } else {
        setDone("가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.");
      }
    } catch { setError("네트워크 오류"); setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.25em] text-ink-faint hover:text-ink">Dept · Agent</Link>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink">가입 신청</h1>
          <p className="mt-1 text-sm text-ink-soft">회사 이메일로 가입한 뒤 부서를 선택합니다.</p>
        </div>

        {done ? (
          <div className="rise rounded-xl border border-line bg-surface p-8">
            <p className="rounded-md bg-pale-green px-3 py-2 text-sm leading-relaxed text-pale-green-text">{done}</p>
            <Link href="/" className="lift mt-5 block rounded-md bg-ink py-2.5 text-center text-sm font-semibold text-white hover:bg-[#33312E]">
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rise space-y-4 rounded-xl border border-line bg-surface p-8">
            <div>
              <label htmlFor="email" className="text-xs font-medium text-ink-soft">회사 이메일</label>
              <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="name@shinhan.com"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
            </div>
            <div>
              <label htmlFor="name" className="text-xs font-medium text-ink-soft">이름</label>
              <input id="name" required autoComplete="name" value={name} onChange={e => setName(e.target.value)}
                placeholder="홍길동"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
            </div>
            <div>
              <label htmlFor="password" className="text-xs font-medium text-ink-soft">비밀번호</label>
              <input id="password" type="password" required minLength={8} autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="8자 이상"
                className="mt-1.5 w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent" />
            </div>
            <div>
              <label htmlFor="dept" className="text-xs font-medium text-ink-soft">소속 부서</label>
              <select id="dept" required value={departmentId} onChange={e => setDepartmentId(e.target.value)}
                className="mt-1.5 w-full appearance-none rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none transition-colors focus:border-accent">
                <option value="">부서를 선택하세요</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {error && <p role="alert" className="rounded-md bg-pale-red px-3 py-2 text-xs leading-relaxed text-pale-red-text">{error}</p>}
            <button type="submit" disabled={busy}
              className="lift w-full rounded-md bg-ink py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#33312E] disabled:cursor-not-allowed disabled:opacity-50">
              {busy ? "신청 중…" : "가입 신청"}
            </button>
            <p className="text-center text-sm text-ink-soft">
              이미 계정이 있으신가요?{" "}
              <Link href="/" className="font-medium text-accent hover:text-accent-deep">로그인</Link>
            </p>
          </form>
        )}
        <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
          첫 가입자는 관리자로 승인됩니다
        </p>
      </div>
    </main>
  );
}
