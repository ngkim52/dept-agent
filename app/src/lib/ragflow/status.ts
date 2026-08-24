// RAGFlow 문서 런 상태 → 앱 문서 상태 매핑 (순수 함수)
export type AppDocStatus = "uploaded" | "parsing" | "done" | "failed";

// RAGFlow run 필드 실측값 예: "UNSTART" | "RUNNING" | "DONE" | "FAIL" | "CANCEL"
export function mapRagRunStatus(runStatus: string | undefined | null): AppDocStatus {
  switch ((runStatus ?? "").toUpperCase()) {
    case "DONE":
      return "done";
    case "FAIL":
    case "CANCEL":
      return "failed";
    case "UNSTART":
    case "RUNNING":
      return "parsing";
    default:
      // 알 수 없으면 재질의 대상으로 파싱중 취급 (완료/실패로 고정하지 않음)
      return "parsing";
  }
}
