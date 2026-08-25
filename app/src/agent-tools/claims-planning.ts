// 보험금심사기획팀 에이전트 도구 설정 — 이 파일에서 이 팀 에이전트가 사용할 도구를 지정합니다.
// 사용 가능한 도구명: "delegate"(부서원 위임), "rag_search"(자료 검색), "websearch"(웹 검색), "python_data"(파이썬 데이터 처리)
// 예: ["delegate", "python_data"] 로 바꾸면 웹검색/자료검색 없이 위임+데이터처리만 사용합니다.
export const departmentToolNames: string[] = [
  "delegate",
  "rag_search",
  "websearch",
  "python_data",
];
