// 부서별 에이전트 도구 설정 인덱스 — 새 부서를 추가하거나 도구 목록을 바꾸려면
// src/agent-tools/<부서키>.ts 파일을 만들고 아래 매핑에 등록하세요.
import { departmentToolNames as claimsPlanningTools } from "@/agent-tools/claims-planning";
import { departmentToolNames as actuarialTools } from "@/agent-tools/actuarial";

const registry: Record<string, string[]> = {
  "claims-planning": claimsPlanningTools,
  actuarial: actuarialTools,
};

const FALLBACK = ["delegate", "rag_search", "websearch", "python_data"];

/** 부서 키 → 사용할 도구명 목록 (등록 안 된 부서는 기본 목록) */
export function getDepartmentToolNames(personaKey: string): string[] {
  return registry[personaKey] ?? FALLBACK;
}
