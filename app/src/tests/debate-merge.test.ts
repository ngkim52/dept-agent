import { describe, it, expect } from "vitest";
import { mergeIncoming, maxSeqOf } from "@/lib/debate/merge";

const m = (id: string, seq: number) => ({ id, seq });

describe("관전 화면 메시지 병합 (중복 키 방지)", () => {
  it("이미 가진 id 는 다시 넣지 않는다", () => {
    const existing = [m("a", 1), m("b", 2)];
    const r = mergeIncoming(existing, [m("a", 1), m("b", 2)], 2);
    expect(r.added).toBe(0);
    expect(r.messages).toBe(existing);   // 동일 참조 유지(불필요한 리렌더 방지)
    expect(r.messages).toHaveLength(2);
  });

  it("초기 로드와 첫 폴링이 겹쳐 전체를 다시 받아도 중복되지 않는다", () => {
    const all = [m("a", 1), m("b", 2), m("c", 3)];
    // 초기 로드로 전체를 받은 직후, since=0 폴링 응답이 그대로 도착한 상황
    const r = mergeIncoming(all, all, 3);
    expect(r.added).toBe(0);
    expect(r.messages.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(new Set(r.messages.map((x) => x.id)).size).toBe(3);
  });

  it("커서 이후의 새 메시지만 추가하고 lastSeq 를 갱신한다", () => {
    const existing = [m("a", 1), m("b", 2)];
    const r = mergeIncoming(existing, [m("b", 2), m("c", 3)], 2);
    expect(r.added).toBe(1);
    expect(r.messages.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(r.lastSeq).toBe(3);
  });

  it("seq 가 뒤섞여 와도 seq 순서로 정렬한다", () => {
    const r = mergeIncoming([m("a", 1)], [m("c", 3), m("b", 2)], 1);
    expect(r.messages.map((x) => x.seq)).toEqual([1, 2, 3]);
    expect(r.lastSeq).toBe(3);
  });

  it("lastSeq 계산은 최대값", () => {
    expect(maxSeqOf([m("a", 1), m("b", 7), m("c", 3)])).toBe(7);
    expect(maxSeqOf([])).toBe(0);
  });
});
