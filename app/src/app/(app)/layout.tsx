"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { NAV_GROUPS, NAV_ICONS } from "@/lib/nav";

type Me = { user?: { role: string; name: string; email: string } | null };

function Brand() {
  return (
    <div className="flex items-center overflow-hidden">
      <img src="/shinhan-life-logo.png" alt="신한라이프" className="h-7 w-auto shrink-0 object-contain" />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me["user"] | null>(null);
  const [collapsed, setCollapsed] = useState(false);   // 데스크톱 접기/펼치기 (슬라이딩)
  const [mobileOpen, setMobileOpen] = useState(false);
  const [harnessPending, setHarnessPending] = useState<number | null>(null);  // 모바일 오버레이 슬라이드

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => { if (d?.user) setMe(d.user); else router.replace("/login"); });
  }, [router]);

  const isAdmin = me?.role === "admin";
  const groups = NAV_GROUPS.filter(g => !g.admin || isAdmin);
  useEffect(() => {
    if (!isAdmin) return;
    let on = true;
    (async () => {
      try { const r = await fetch("/api/admin/harness/count"); const d = await r.json(); if (on && typeof d?.count === "number") setHarnessPending(d.count); }
      catch { if (on) setHarnessPending(0); }
    })();
    return () => { on = false; };
  }, [isAdmin]);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const SidebarBody = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-4 py-4">
        <Brand />
        <button onClick={() => setCollapsed(c => !c)} title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-canvas hover:text-ink md:flex"
          aria-label="메뉴 토글">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map(g => (
          <div key={g.group} className="mb-5">
            {!collapsed && <p className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint">{g.group}</p>}
            <div className="space-y-0.5">
              {g.items.map(it => {
                const isA = active(it.href);
                return (
                  <button key={it.href} onClick={() => { onNav?.(); router.push(it.href); }}
                    title={it.label}
                    className={`relative flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors md:justify-start ${
                      isA ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas hover:text-ink"
                    }`}>
                    <svg className="shrink-0" viewBox="0 0 24 24" width="17" height="17" fill={isA ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={NAV_ICONS[it.icon]} /></svg>
                    {!collapsed && (
                      <>
                        <span className="overflow-hidden whitespace-nowrap">{it.label}</span>
                        {it.label === "하네스 관리" && harnessPending !== null && harnessPending > 0 && (
                          <span className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${isA ? "bg-white text-ink" : "bg-accent text-white"}`}>{harnessPending > 99 ? "99+" : harnessPending}</span>
                        )}
                      </>
                    )}
                    {collapsed && it.label === "하네스 관리" && harnessPending !== null && harnessPending > 0 && (
                      <span className={`absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${isA ? "bg-white text-ink" : "bg-accent text-white"}`}>{harnessPending > 9 ? "9+" : harnessPending}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line px-4 py-4">
        {!collapsed ? (
          <>
            <p className="truncate text-sm font-medium text-ink">{me?.name ?? me?.email ?? "…"}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-mono text-[11px] text-ink-faint">{isAdmin ? "관리자" : "구성원"}</span>
              <button onClick={() => { fetch("/api/auth/logout"); router.replace("/login"); }} className="flex items-center gap-1 text-xs font-medium text-ink-faint transition-colors hover:text-pale-red-text">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                로그아웃
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => { fetch("/api/auth/logout"); router.replace("/login"); }} title="로그아웃"
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-md text-ink-faint hover:bg-canvas hover:text-pale-red-text">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        )}
      </div>
    </div>
  );

  // 채팅은 자체 몰입형 레이아웃(좌측 레일+슬라이딩 메뉴) 사용 → 셸 사이드바 생략 (메뉴 2중 방지)
  if (pathname === "/chat" || pathname.startsWith("/chat/")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* 데스크톱 사이드바 — 슬라이딩 폭 전환 */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-300 ease-in-out md:flex ${collapsed ? "w-[68px]" : "w-64"}`}>
        <SidebarBody />
      </aside>
      {/* 모바일 오버레이 슬라이드 */}
      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface transition-transform duration-300 ease-in-out md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <SidebarBody onNav={() => setMobileOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => setMobileOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-canvas" aria-label="메뉴">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Brand />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
