# 멀티턴(복수 턴) 답변 → 단일 답변 통합 설계서

## 1. 문제 · 목표
- 채팅에서 같은 질문이 **여러 턴**(assistant 메시지 여러 개)에 걸쳐 답변되는 경우가 있다
  (후속 질문으로 자세히 풀어내기, 질문 분해, 장문 답변 순차 완성 등).
- 이렇게 한 세션에서 **검증된 결과**는 그때 한 번 버려진다.
- 목표: 완성된 답변을 **하나의 질문→답변**으로 통합·저장해 두고,
  다음부터 **비슷한 질문**이 들어오면 여러 턴 대신 **한 번에** 답하게 한다.

## 2. 현재 구조 파악
- 대화 저장: `conversations` / `messages`(role: user/assistant, conversationId) — `src/lib/db/schema.ts`
- 지식 계층: DB 지식(업무 내용) + Skill(행동원칙·사고방식) — `skills.ts`(`selectFileSkills`, frontmatter `always`, `getCommonSkills`)
- RAGFlow: `RagflowClient` 데이터셋 + 문서 적재(대시보드 시드에서 이미 사용)
- LLM 호출 패턴: `getLlmModel(purpose)` → `models.completeSimple(...)` — `sectionReview.ts`/`briefing.ts`와 동일

## 3. 두 메커니즘 비교
| | 스킬(Skill) 방식 | 지식그래프(KG) 방식 |
|---|---|---|
| 저장 | 재사용 답변 Skill 파일 (frontmatter `trigger`) | 노드(`qa_consolidations`) + 엣지(`qa_links`) |
| 검색 | 트리거 키워드/의도 매칭 (`selectFileSkills`) | 질문 임베딩 벡터 검색 + 노드 관계 탐색 |
| 장점 | 절차형·행동지침에 강함, 사람이 읽고 관리 쉬움 | 유사 질문 일반화·확장 좋음, 관계 추론 가능 |
| 단점 | 표면 변형 질문 놓침 | 초기 모델링·시드 비용, 임베딩 필요 |

## 4. 권장: 하이브리드 (핵심은 "통합 + 검증 + 재사용")
1. **탐지(Detect)**: 대화가 "한 질문 의도에 대한 복수 답변"으로 끝나면 통합 후보.
2. **통합(Consolidate)**: LLM이 모든 assistant 턴을 **하나의 답변**으로 합침 + 대표 질문·의도·엔티티 추출.
3. **검증(Verify)**: 정적 fallback을 허용하지 않듯, **검증된 것만 재사용**.
   - LLM self-check(답변이 원본 턴의 핵심 사실을 모두 담는지) + 사용자 "이 답변이 맞나요?" 확인.
   - 상태: `draft` → `verified`(재사용 허용)/`rejected`.
4. **저장(Store)**: verified 되면
   - `qa_consolidations`(노드)에 저장 + `qa_links`(엣지, 유사/후속/포함 관계) → **지식그래프**
   - 답변 텍스트를 RAGFlow 데이터셋 "채팅_복수턴_통합답변"에 업로드 → **벡터 검색 인덱스**
   - 신뢰도가 높고 절차형이면 **Skill 파일**로도 승격(트리거: `intent` + 엔티티)
5. **검색(Retrieve)**: 새 질문 입력 시 → (a) `findBestConsolidated`(벡터/유사도), (b) `selectFileSkills`(트리거). 임계값 이상이면 통합 답변을 **단일 턴 컨텍스트**로 주입 → 답변.

## 5. 데이터 모델
```sql
qa_consolidations (
  id TEXT PK,
  canonical_question TEXT,      -- 정규화 대표 질문
  intent TEXT,                 -- 트리거 라벨 (예: 실손_손해율_상승원인)
  merged_answer TEXT,           -- 단일 통합 답변 (MD)
  summary TEXT,
  entities TEXT,               -- JSON array (지식그래프 노드 태그)
  source_conversation_id TEXT,  -- 출처 대화
  status TEXT,                -- draft|verified|rejected
  confidence REAL,
  turns INTEGER,
  used_count INTEGER DEFAULT 0,
  created_at / updated_at
)
qa_links (from_id, to_id, relation TEXT, weight REAL)  -- similar|follow_up|entails
```
- 인덱스: `canonical_question`(키워드), RAGFlow 데이터셋(벡터), `intent`(스킬 트리거)

## 6. 라이프사이클 흐름
```
[채팅 stream]
   사용자 질문
      │
      ▼
 검색(단일 답변 히트?) ── 있으면 ──▶ 통합 답변 1턴으로 응답
      │ 없음
      ▼
  평소대로 대화(여러 턴 가능)
      │
      ▼ (대화 종료/해소 판단)
 통합(LLM) → 검증(self-check + 사용자 확인)
      │ verified
      ▼
 qa_consolidations 저장 + RAGFlow 벡터 인덱스 + (선택) Skill 승격
```
- **하루/세션 단위 캐시**는 기존 `app_settings` 패턴(브리핑 일간 캐시) 재사용.

## 7. 통합 지점 (코드)
- 신규: `src/lib/chat/consolidate.ts` — **이미 구현됨**(통합·검증·유사도·재검색 순수 로직)
- API: `POST /api/chat/consolidate` — **이미 구현됨**(멀티턴 → 통합 Q/A + 검증 결과)
- 테스트: `src/tests/consolidate.test.ts` — **이미 구현됨(6건 통과)**
- 향후 연동:
  - `conversations`/`messages`에서 종료 대화 조회 → `consolidateThread` 호출
  - `qa_consolidations`/`qa_links` 테이블 추가(`schema.ts`) + drizzle 마이그레이션
  - RAGFlow 데이터셋 "채팅_복수턴_통합답변" + 신규 질문 시 `findBestConsolidated`
  - 채팅 stream route: 답변 생성 전 재검색 주입, 대화 종료 시 통합 트리거
  - 관리 UI: draft↔verified 관리(기존 harness/스킬 편집 화면 패턴 참고)

## 8. 이미 구현된 프로토타입 (이 설계의 핵심 검증 가능)
- `consolidateThread(firstQuery, turns)` : LLM이 여러 assistant 턴을 단일 답변(MD)으로 통합
- `answerCoversTurns(qa, turns)` : 답변이 원본 턴 핵심을 빠뜨렸는지 확인(토큰 오버랩, 운영은 LLM self-check)
- `similarityScore` / `findBestConsolidated` : 유사 질문 → 통합 답변 재검색 (빅램 유사도, 운영은 RAGFlow 임베딩)
- `POST /api/chat/consolidate` : 대화 기록을 넣으면 통합 Q/A + 검증 결과 반환

## 8. 구현 현황 (실제 구현·검증 완료)
- **DB(지식그래프)**: `qa_consolidations`(노드) + `qa_links`(엣지) 테이블 — `schema.ts` + 마이그레이션 `drizzle/0008_qa_consolidation.sql` + 멱등 bootstrap. ✓
- **모듈** `src/lib/chat/consolidate.ts`: `consolidateThread`(LLM 통합) · `parseConsolidated` · `answerCoversTurns`(검증) · `queryCoverage`(질문 커버리지 유사도) · `findBestConsolidated`. ✓
- **저장·검색** `src/lib/chat/qaStore.ts`: `ensureQaDataset`(RAGFlow "채팅_복수턴_통합답변") · `saveConsolidation` · `uploadConsolidation` · `findConsolidatedAnswer`(로컬 verified 우선 + RAGFlow 벡터) · `consolidateRecent`. ✓
- **통합(채팅 stream)**: 답변 생성 전 `findConsolidatedAnswer` 주입("이전 통합 답변" 근거) + 답변 2개 이상 완성 시 `consolidateRecent`로 draft 저장. ✓ 라이브 검증 완료.
- **검증 관리 API**: `GET/PATCH /api/chat/consolidations` — draft 목록 조회 → `verified` 승격(이때 RAGFlow 벡터 적재)/`rejected` 폐기. ✓
- **통합 API**: `POST /api/chat/consolidate` — 멀티턴 → 통합 Q/A + 검증 결과. ✓
- **테스트**: `consolidate.test.ts`(6) · `qa-store.test.ts`(2). 전체 194개 통과, tsc clean.

### 운영 전환 시 남은 개선
1. RAGFlow 벡터 유사도만으로 재검색(`queryCoverage` 폴백은 국소 필터 수준) — 임베딩 튜닝.
2. `qa_links` 엣지(유사/후속/포함) 생성·탐색 자동화 → 온전한 지식그래프.
3. 검증 UI(대시보드/관리 화면) — draft 목록에서 한 번에 승격/폐기.
