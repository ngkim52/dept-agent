import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

// 부서에 연결된 모든 RAGFlow 데이터셋 id 반환 (조인 테이블 우선, 레거시 단일 컬럼 폴백)
export async function getDepartmentDatasets(departmentId: string): Promise<string[]> {
  if (!departmentId) return [];
  const rows = await db.query.departmentDatasets.findMany({
    where: (t, { eq }) => eq(t.departmentId, departmentId),
  });
  if (rows.length) return rows.map(r => r.datasetId);
  // 레거시: departments.ragflow_dataset_id 단일 컬럼
  const dept = await db.query.departments.findFirst({ where: eq(schema.departments.id, departmentId) });
  return dept?.ragflowDatasetId ? [dept.ragflowDatasetId] : [];
}

// 부서에 연결된 RAGFlow 데이터셋 (id + 이름) 반환 — 진행표시/로깅용
export async function getDepartmentDatasetInfos(departmentId: string): Promise<{ id: string; name: string }[]> {
  if (!departmentId) return [];
  const rows = await db.query.departmentDatasets.findMany({
    where: (t, { eq }) => eq(t.departmentId, departmentId),
  });
  if (rows.length) return rows.map(r => ({ id: r.datasetId, name: r.datasetName || r.datasetId }));
  const dept = await db.query.departments.findFirst({ where: eq(schema.departments.id, departmentId) });
  if (!dept?.ragflowDatasetId) return [];
  return [{ id: dept.ragflowDatasetId, name: dept.name }];
}

export async function setDepartmentDatasets(departmentId: string, datasetIds: string[]): Promise<void> {
  await db.delete(schema.departmentDatasets).where(eq(schema.departmentDatasets.departmentId, departmentId));
  for (const ds of datasetIds) {
    if (!ds) continue;
    await db.insert(schema.departmentDatasets).values({
      departmentId,
      datasetId: ds,
      createdAt: new Date(),
    }).onConflictDoNothing({ target: [schema.departmentDatasets.departmentId, schema.departmentDatasets.datasetId] });
  }
  // 레거시 단일 컬럼도 첫 번째로 동기화 (폴백 유지)
  const first = datasetIds[0] ?? null;
  await db.update(schema.departments).set({ ragflowDatasetId: first }).where(eq(schema.departments.id, departmentId));
}
