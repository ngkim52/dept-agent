# dept-agent 보안·품질 개선 계획 (2026-08-26)

## 배경
3개 병렬 리뷰(프론트A/백endB/엔진C) 완료. 우선순위 P0~P3 이슈 통합 후 P0→P1 순으로 수정한다.
검증 기준: `npx vitest run`(현재 59건), `npx tsc --noEmit`, `npx eslint`(현재 87 err).

## 우선순위 통합 맵

### P0 (보안·즉시)
- [ ] B18/E2 — LLM 생성 파이썬 실행 격리 부재(RCE): pyexec 환경변수 최소화 + filePath 신뢰 경계
- [ ] B1 — rate limit `X-Forwarded-For` 직접 신뢰 우회

### P1 (높음)
- [ ] E1 — chat/stream RAG 검색 try/catch 격리(다운 폴백 + history 오염)
- [ ] A-P1 — 스트리밍 중 대화 전환 시 답변 오염(convId 캡처+가드)
- [ ] A-P1 — admin 대화 전환 시 부서 페르소나 고착
- [ ] B3 — chat/LLM 레이트리밋 없음(비용 남용)
- [ ] B4 — 세션 쿠키 Secure 기본 미적용
- [ ] B5 — 최초 가입자 자동관리 승격 레이스
- [ ] B10 — 개인 문서 부서 공용 RAG 자동 주입(데이터 격리)

### P2 (중간)
- [ ] B6 — 부서 권한 null 우회 방지
- [ ] B14 — FK 인덱스 부재
- [ ] B15 — 삭제 트랜잭션
- [ ] B25 — .env 시크릿·보안 점검
- [ ] B28 — 공개 부서 API가 dataset id 노출
- [ ] B20 — 요청 바디 zod 검증
- [ ] E3 — delegate simple 모델 fallback
- [ ] E4 — RAG 반복 주입 억제
- [ ] E5/E6 — compact 견적 정확도·재요약
- [ ] E7/E8 — 슬래시 스킬 공백 파싱·부서 정합
- [ ] A — JSON.parse safe, fileIds finally, loading/error 경계 등

---
## 실행 순서 (무작위 수행 X)
Phase 1 (P0 보안): B-01, B1
Phase 2 (P1 서버): E1, B3, B4, B5, B10
Phase 3 (P1 프론트): A-스트리밍 무결성, A-페르소나 고착
Phase 4 (P2): 백end 인덱스·트랜잭션·zod, 엔진 compact, 프론트 UX
각 피스는 TDD로 진행하고 전체 테스트 통과 확인 후 커밋.
