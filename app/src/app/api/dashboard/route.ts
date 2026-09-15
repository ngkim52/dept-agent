import { NextRequest } from "next/server";
import { requireUser, jsonError } from "@/lib/auth/http";
import { getTodaySnapshot } from "@/lib/dashboard/rebuild";
import { buildDashboardData } from "@/lib/dashboard/dashboardData";
import { getSectionReviews } from "@/lib/dashboard/sectionReview";

// GET /api/dashboard — 배치 구성된 대시보드 스냅샷 (매일 자동 갱신)
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const snap = await getTodaySnapshot();
    const dash = buildDashboardData(); // 기준일 = 오늘, 실적 기준일 = 어제(오늘-1, KST)
    const reviews = await getSectionReviews(dash);
    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, departmentId: user.departmentId };
    return Response.json({
      user: safeUser,
      kpis: snap.kpis,
      analysis: snap.analysis,
      news: snap.news,
      todos: { count: snap.todos.length, items: snap.todos.slice(0, 10) },
      dash,
      reviews,
      date: snap.date,
      builtAt: snap.builtAt,
      isAdmin: user.role === "admin",
    });
  } catch (e) { return jsonError(e); }
}
