import { NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireUser, requireAdmin, jsonError, HttpError } from "@/lib/auth/http";
import { ragflow } from "@/lib/ragflow/client";
import { getDepartmentDatasets, setDepartmentDatasets } from "@/lib/dataset/access";

// 부서 ↔ RAGFlow 데이터셋 연결 관리 (관리자 전용)
export async function GET(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const departments = await db.query.departments.findMany({ orderBy: (d, { asc }) => [asc(d.name)] });
    let datasets: { id: string; name: string }[] = [];
    try {
      datasets = await ragflow.listDatasets().catch(() => [] as { id: string; name: string }[]);
    } catch { datasets = []; }
    // 부서별 연결 데이터셋 목록 (여러 개 가능)
    const linked = new Map<string, string[]>();
    for (const d of departments) {
      linked.set(d.id, await getDepartmentDatasets(d.id));
    }
    return Response.json({
      departments: departments.map(d => ({ id: d.id, name: d.name, personaKey: d.personaKey, datasetIds: linked.get(d.id) ?? [] })),
      datasets,
    });
  } catch (e) { return jsonError(e); }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireUser(req);
    requireAdmin(admin);
    const body = await req.json().catch(() => ({}));
    const departmentId = String(body.departmentId ?? "");
    if (!departmentId) throw new HttpError(400, "departmentId 필요");
    // datasetIds 배열 (없으면 빈 배열 = 연결 해제) 또는 단일 datasetId 폴백
    let datasetIds: string[] = Array.isArray(body.datasetIds) ? body.datasetIds.map(String).filter(Boolean) : [];
    if (datasetIds.length === 0 && body.datasetId !== undefined) {
      datasetIds = body.datasetId === null || body.datasetId === "" ? [] : [String(body.datasetId)];
    }
    const target = await db.query.departments.findFirst({ where: eq(schema.departments.id, departmentId) });
    if (!target) throw new HttpError(404, "부서를 찾을 수 없습니다.");
    await setDepartmentDatasets(departmentId, datasetIds);
    return Response.json({ ok: true, departmentId, datasetIds });
  } catch (e) { return jsonError(e); }
}
