import { describe, it, expect } from "vitest";
import { parseJsonLoose } from "@/lib/util/jsonLoose";

describe("parseJsonLoose — LLM JSON 관용 파서", () => {
  it("깨끗한 객체/배열", () => {
    expect(parseJsonLoose('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
    expect(parseJsonLoose("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("코드블록·앞뒤 잡음 제거", () => {
    const raw = "결과입니다\n```json\n{\"summary\":\"요약\",\"ok\":true}\n```\n끝";
    expect(parseJsonLoose(raw)).toEqual({ summary: "요약", ok: true });
  });

  it("문자열이 잘린(truncated) 경우 부분 복원 — Unterminated string", () => {
    const raw = '{"summary":"질문 요약","conclusion":"결론을 내리';
    expect(parseJsonLoose(raw)).toEqual({ summary: "질문 요약", conclusion: "결론을 내리" });
  });

  it("속성 사이 콤마 누락 복원 — Expected ',' or '}' after property value", () => {
    const raw = '{"summary":"s"\n  "conclusion":"c",\n  "reusable_rules":["r1" "r2"]}';
    const j: any = parseJsonLoose(raw);
    expect(j.summary).toBe("s");
    expect(j.conclusion).toBe("c");
    expect(j.reusable_rules).toEqual(["r1", "r2"]);
  });

  it("trailing comma·문자열 내부 개행(제어문자) 허용", () => {
    const raw = '{"summary":"첫줄\n둘째줄","reusable_rules":["a","b",],}';
    const j: any = parseJsonLoose(raw);
    expect(j.summary).toBe("첫줄\n둘째줄");
    expect(j.reusable_rules).toEqual(["a", "b"]);
  });

  it("배열이 잘린 경우 완전한 원소만 복원", () => {
    const raw = '{"reusable_rules":["a","b","c';
    expect(parseJsonLoose(raw)).toEqual({ reusable_rules: ["a", "b", "c"] });
  });

  it("중첩 깊은 구조가 잘려도 복원", () => {
    const raw = '{"dimensions":[{"key":"relevance","score":90,"reason":"좋음"},{"key":"groundedness","score":45';
    const j: any = parseJsonLoose(raw);
    expect(j.dimensions[0]).toEqual({ key: "relevance", score: 90, reason: "좋음" });
    expect(j.dimensions[1].key).toBe("groundedness");
    expect(j.dimensions[1].score).toBe(45);
  });

  it("JSON이 전혀 없으면 null", () => {
    expect(parseJsonLoose("설명만 있고 JSON은 없습니다.")).toBeNull();
    expect(parseJsonLoose("")).toBeNull();
  });

  it("작은따옴표·리터럴도 관용 처리", () => {
    expect(parseJsonLoose("{'a': true, 'b': null}")).toEqual({ a: true, b: null });
  });
});
