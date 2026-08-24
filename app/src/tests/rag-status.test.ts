import { describe, it, expect } from "vitest";
import { mapRagRunStatus } from "@/lib/ragflow/status";

describe("mapRagRunStatus", () => {
  it("매핑: DONE → done", () => {
    expect(mapRagRunStatus("DONE")).toBe("done");
    expect(mapRagRunStatus("done")).toBe("done");
  });
  it("매핑: FAIL/CANCEL → failed", () => {
    expect(mapRagRunStatus("FAIL")).toBe("failed");
    expect(mapRagRunStatus("CANCEL")).toBe("failed");
  });
  it("매핑: RUNNING/UNSTART → parsing", () => {
    expect(mapRagRunStatus("RUNNING")).toBe("parsing");
    expect(mapRagRunStatus("UNSTART")).toBe("parsing");
  });
  it("매핑: 알 수 없는 값은 parsing으로 (재조회 대상)", () => {
    expect(mapRagRunStatus(undefined)).toBe("parsing");
    expect(mapRagRunStatus("")).toBe("parsing");
  });
});
