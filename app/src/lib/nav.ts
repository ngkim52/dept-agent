// 전역 에이전트 메뉴 정의 (AppShell 사이드바 · chat 슬라이딩 메뉴 공용)
export type NavItem = { href: string; label: string; icon: string; admin?: boolean };
export type NavGroup = { group: string; admin?: boolean; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    group: "업무",
    items: [
      { href: "/dashboard", label: "대시보드", icon: "grid" },
      { href: "/chat", label: "채팅", icon: "chat" },
      { href: "/knowledge", label: "지식베이스", icon: "book" },
      { href: "/documents", label: "자료 관리", icon: "folder" },
      { href: "/briefing", label: "업계동향 브리핑", icon: "briefing" },
      { href: "/debate", label: "토론방", icon: "debate" },
      { href: "/meetings", label: "회의록", icon: "mic" },
    ],
  },
  {
    group: "관리",
    admin: true,
    items: [
      { href: "/admin/harness", label: "하네스 관리", icon: "spark" },
      { href: "/admin/settings", label: "설정", icon: "gear" },
    ],
  },
];

export const NAV_ICONS: Record<string, string> = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  chat: "M4 5h16v11H9l-5 4z",
  book: "M4 19V5a2 2 0 012-2h14v14H6a2 2 0 00-2 2zM16 3v14",
  folder: "M4 4h6l2 2h8a1 1 0 011 1v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z",
  briefing: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 17h.01M12 8v5",
  debate: "M4 5h16v10H9l-5 4zM8 9h8M8 12h5M17 17h3v4",
  mic: "M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM19 11a7 7 0 01-14 0M12 18v3",
  spark: "M12 3l1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7z",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.2-1.7l2-1.6-2-3.4-2.4 1a7 7 0 00-2.9-1.7L13.4 2h-4l-.3 2.6a7 7 0 00-2.9 1.7l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .6.1 1.2.2 1.7l-2 1.6 2 3.4 2.4-1a7 7 0 002.9 1.7l.3 2.6h4l.3-2.6a7 7 0 002.9-1.7l2.4 1 2-3.4-2-1.6c.1-.5.2-1.1.2-1.7z",
};
