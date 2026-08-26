# 리뷰 C: UI/에이전트 엔진/RAG/skills/LLM

> 대상 버전: `app/` 의 에이전트 코어 구현
> 검토 대상: `src/lib/agent/{engine,llm,personas,skills,websearch,pyexec}.ts`,
> `src/lib/ragflow/{client,status}.ts`, `src/lib/dataset/access.ts`,
> `src/agent-tools/*`, `src/app/api/chat/stream/route.ts`
> 항목: 1) 엔진 흐름 2) RAG 3) 웹서치/파이썬 보안 4) 컨텍스트/compact 추정 5) 다운폴 유연 실패 6) 슬래시 스킬

---

## 이슈 요약

| # | 심각도 | 위치 | 요지 |
|---|--------|------|------|
| E1 | **P1** | stream/route.ts:81 + engine.ts:27 | RAGFlow 검색이 try 밖 → 전체 500, 응답 누락·히스토리 오염 |
| E2 | **P1** | pyexec.ts:32~86 | 파이썬 “샌드박스”가 실제로는 비격리 — 임의 파일/네트워크/셸 실행 가능, filePath 경로 검증 없음 |
| E3 | **P2** | engine.ts:124~133 | delegate 서브에이전트가 “simple” 모델 게이트웨이를 무시, 타 게이트웨이 시 라우팅 실패·fallback 없음 |
| E4 | **P2** | engine.ts:350~366 | transformContext로 RAG가 매 LLM 턴마다 재주입(도구 반복 시 중복 토큰) |
| E5 | **P2** | engine.ts:257~285, llm.ts:28 | 컨텍스트 창 고정 32768·base 추정 1200에 스킬 본문 미포함 → 압축 판정 부정확 |
| E6 | **P2** | engine.ts:319~330 | 대화마다 전체 히스토리를 다시 읽어 임계 초과 시 턴마다 재요약(비용 비효율) |
| E7 | **P2** | skills.ts:72~78 + api/skills:10~12 | 스킬 본문을 전부 무조건 주입; admin은 타 부서 스킬도 목록 노출하나 프롬프트 미제공 |
| E8 | **P2** | chat/page.tsx:272~278 | 슬래시 정규식에 공백 미포함 — 다단어 스킬명 매칭 실패 |
| E9 | **P3** | websearch.ts:81 | Tavily 폴백 시 네트워크 예외가 비포착 → tool로 전파(안내 부재) |
| E10 | **P3** | engine.ts:96~99 | toPiHistory가 usage=0·모델 고정 → 부속 모델(compact/simple) 왜곡 |
| E11 | **P3** | stream/route.ts:98 | init citations가 120자 원본 후 최종 citations와 중복 전송 |
| E12 | **P3** | engine.ts:134~141 | delegate 하위 응답이 상위에 실시간 스트리밍 안 되고 완성까지 대기 |

---

## 1) 엔진 흐름(thinking·tool·compact·RAG 주입)

**설계 확인(양호)**
- `runPersonaAgent`에서 `getLlmModel("response")` → `models.streamSimple.bind(models)`(engine:311~312)로 하나의 `Agent` 실행.
- thinking: `thinking_start/delta`를 수집해 `cb.onProgress("thinking")`로 노출, 버퍼 상한 100k(engine:375~376, 388~394).
- tool: `tool_execution_start/end`와 `turn_start/tool` 진행 이벤트를 SSE `progress`로 노출(engine:395~407).
- compact: `estimateContextLoad`→`shouldAutoCompact(0.6)`(engine:317~330), 요약은 `compact` 모델로 분리(engine:321~325, 실패 시 `null`로 전체 유지 = 유연 폴백 확보).

**[P2] E4 — RAG 반복 주입**
`transformContext`는 턴마다(도구 반복 턴 포함) `[systemRag]`를 메시지 맨 앞에 붙인다.
`src/lib/agent/engine.ts:350~366`
- LLM 턴별로 같은 `<<<RAG_CONTEXT>>>` 블록이 반복 등장 → 여러 도구 사용 시 최대 N회 중복 주입으로 토큰·비용 증가, 모델 주의 분산.
- 제안: 첫 보조 턴(또는 `turn==0`/최초 1회)에만 prepend하거나 `AgentMessage` 캐시 키로 중복 억제.

### [P3] engine:134-141 — delegate 위임 실시간성
- 하위 에이전트의 `text_delta`를 상위 툴 결과로만 회수, 상위 SSE에 즉시 스트리밍되지 않음.
- 제안: delegate 툴 내에서 수집된 서브텍스트를 `cb.onProgress`/`cb.onTextDelta`로 중계하면 사용자 대기 UX 개선.

### [P3] thinking 수준
- `thinkingLevel`은 route에서 `body.thinkingLevel ?? "off"`(route:99~101)로 전달. UI는 `high` 기본(상단 코드의 `thinkingLevel` state)이라 정상 동작하지만, 서비스 기본값을 “off”로 두는 것은 서버 관점에선 의도함. 명확화 추천.

---

## 2) RAG (topK·유사도·문서명·다중 데이터셋·자동 주입)

**양호 확인**
- 자동 주입은 “도구”가 아니라 전처리(`transformContext`)로 이루어짐(요구사항 부합).
- topK = `config.rag.topK` default 10, similarity = `config.rag.similarityThreshold` default 0.2 (client:76~80).
- 다중 데이터셋: `retrieve(question, datasetIds[], …)` — dataset_ids 배열 전달(engine.ts:27~43, client.ts:79). `dataset/access.ts`가 부서 다중 데이터셋 조회 ✓.
- 문서명: `document_name ?? document_keyword ?? document_id`, 확장 제거(engine:34, client:88). ✓

### [P2] engine:152~169 — `makeRagSearchTool`와 자동주입의 중복
- 자동 주입(topK 10)과 별도 RAG **툴(`search`)** 가 동시에 존재. 도구가 또 한 벌(topK 10) 검색해 동일 자료를 재주입.
- 제안: 자동 주입을 기본으로 하고, `search` 툴을 “범위축소/추가 질의”용으로만 두거나 도구 시 상위 topK를 낮게(예: 3~5) 제한.

### [P2] E1 — RAGFlow 다운하강 (상세는 항목 5)

---

## 3) 웹서치 / 파이썬 샌드박스 보안

### [P1] E2 — `pyexec`는 샌드박스가 아님
`src/lib/agent/pyexec.ts:32-58, 69-86`
- `execFileAsync(PYTHON, [scriptPath])`가 **서버 프로세스와 동일 권한·동일 cwd** 로 실행.
- `filePath`는 LLM이 임의로 지정 가능(경로 조작 가능). `buildPrelude`(line 39~51)가 `Path(file_path)`로 **아무 파일**을 읽도록 하여, `.env`/DB/타 사용자 업로드/시스템 파일까지 접근 가능.
- 스크립트는 `os`/`subprocess`/네트워크(requests 등)를 자유로 import → 임의 명령·외부 송출 가능. `TIMEOUT_MS=20s`, `maxBuffer=4MB` 외 자원 제한 없음.
- 제안(가능한 것):
  1. `filePath`를 신뢰 경계로 만들기 — `uploadPath(doc.id)`를 문자열로 전달하지 말고, `resolve()` 후 `uploadsRoot` 아래이며 해당 doc이 사용자 소유인지 검증 + 매 실행에 직접 공개 없이 docId만 전달.
  2. 실행 격리: 별도 저권한 OS 사용자/네임스페이스(예: `bwrap`/Docker/`firejail`) 실행, 네트워크 차단(필요 시 프록시), cwd를 tmpfs로 제한.
  3. Python 시작 옵션 격리(예: `PYTHONPATH` 정리, `-I`(등 anomalous) — 단, 엑셀 의존이 있으면 적절히), 대량 연산 CPU/메모리 상한.
  4. 입력 데이터는 임시 파일로만 넘기고, filePath 접근을 금지하거나 상단 허용 목록으로 제한.

### [P3] E-9 — Tavily 폴백 우아한 실패
`websearch.ts:66-84`
- Serper 실패 시 Tavily로 `searchTavily()` 호출. Tavily 측 네트워크 예외는 catch하지 않아 툴 실행이 throw → 에이전트 도구 오류 처리.
- 제안: 전 구역 try/catch·짧은 타임아웃, 어떤 실패든 `{ok:false, results:[], provider:"none", error}` 반환(현재 `webSearch` 본문은 Serper만 try).

---

## 4) 컨텍스트/compact 토큰 추정

### [P2] E-5 — 견적 기준 부정확
`engine.ts:257-283`, `llm.ts:28`
- `contextWindow = (model)?.contextWindow ?? 32768`, 그러나 `buildModels`(llm.ts:28)가 **모든 모델을 32768로 고정** → 실제 모델이 8k/128k여도 창이 고정됨.
- `CHAR_PER_TOKEN=2.5` + `basePromptTokens=1200`, 스킬 본문·티어·시스템 프롬프트 길이·툴 스키마 미 반영. 페르소나(긴)+스킬 본문(~수천자)이 실제 베이스이며 대개 1200을 크게 초과 → `아주 낮음` → 압축이 늦게 동작.
- 제안: `estimateContextLoad`에 `systemPromptChars`(스킬 포함) 인자를 넣어 반영, `contextWindow`은 실제 모델(LLM 응답)에서 동적으로 해석하거나 `buildModels`에서 모델별 window 파라미터화.

### E5 — 매 턴 재요약
`engine.ts:319-330, 326`
- DB는 원본 히스토리를 유지 → 매 요청마다 `estimateContextLoad`로 임계 초과 → `history.slice(0,-2)` 전체를 다시 요약. 장기 대화 후에는 매 턴마다 추가 summarize 비용, `compact` 모델 호출 폭이 증가.
- 제안: (a) 최근 요약을 `conversations`에 캐시하고 증분 갱신, 또는 (b) 요약 후 원본 히스토리 임시 퇴장(압축된 DB 상태) 관리. 최소한 요약이 존재하면 다음 턴 요약을 재실행하지 않고 재사용.

### [P3] toPiHistory 사용량 오염 — E10
`engine.ts:96-99`
- `assistant` 메시지의 `model`를 `config.llm.model`로 고정, `usage` 전부 0. 실제 compact/simple/subagent 응답이 기록된 대화를 우상하면 비용·모델 통계 왜곡. → 저장 단계에서 실제 모델/usage를 받아 기록하거나, 조회 시 알려진 (중요하지 않으므로) 기본값임을 명시.

---

## 5) LLM/RAGFlow 다운쓰레인지 + graceful 실패

### P1 — RAGFlow 검색이 트라이 밖 (핵심)
`src/app/api/chat/stream/route.ts:79-81`
- `retrieveDepartmentChunks`가 **`ReadableStream` 내부 try가 아니라 POST 본문에서 await** 됨.
- RAGFlow 미설정(`requireRagConfig` throw) 또는 서버 다운/타임아웃 시 라우트 전체가 500을 반환:
  - 사용자에게 SSE `error` 이벤트 대신 “스트림 연결 실패”.
  - 그리고 **line 50~52의 사용자 메시지는 이미 DB에 저장** → assistant 응답 없는 `user`만 남아 히스토리가 짝이 부러짐(다음 대화에서 느 Bonelli 연속 user 메시지 전달).
- 제안:
  1. RAG 검색을 try/catch로 감싸 실패 시 `ragChunks=[]`(자동 조회 없음)로 진행하고 로그만.
  2. `send("progress",{phase:"tool_done", ok:false})`로 “자료 검색 실패”를 사용자에게 안내.
  3. 사용자 메시지를 유지한 채 툴 오류로도 진행 (에이전트가 “자료 확인 불가”를 답하도록).

### 중간: LLM 다운
- `runPersonaAgent`는 스트림의 `try`(route:88) 안에 있어 실패 시 `error` 이벤트 → 클라 단에서 표시되나, 역시 사용자 메시지는 이미 저장, assistant 미저장. 로컬 graceful(부분 성능)이라도 상태 표시 이벤트(`error`)와 함께 답변 내용을 비운 assistant(또는 에러 설명)를 저장하는 것을 권장 → 응답 누락/중복 방지.

### delegate 스럽팔로우
- 위 E3(engine:124-133). `getLlmModel("simple")` throw 시에만 메인 모델 돼, 라우팅 실패/openrouter로 바뀐 경우는 catch되지 않음.
- 제안: `sub.prompt`를 try/catch하고 실패 시 메인 모델+원본(부모 `Fixture`)로 재실행, 최종 실패 시 툴 결과로 “(서브에이전트 응답 실패)” 반환.

---

## 6) 슬래시 스킬 처리

### 6-1) 아키텍처
- 슬래시는 **클라이언트 전용** 처리(chat/page.tsx:272~306): `/스팀 [나머지]` → `rest || /스팀 절차를 검토해 주세요`로 치환 후 일반 대화로 전송.
- 서버는 스킬명을 구분하지 않음. 스킬 본문은 이미 `buildPersonaSystemPromptWithSkills`로 페르소나 systemPrompt에 전체 내장(`skills.ts:64~78`)되어 있어 모델이 이를 본문에서 참조.
- `/웹검색,/자료,/새대화,/생각`은 기능(별도)로 분리.(`page.tsx:276-301`)

### P2 — 시스템 프롬프트 비대 & 역할 스킬 전부 주입
`skills.ts:71-79`
- 부서의 모든 SKILL.md 본문이 **매 우회의 시스템 프롬프트에 삽입**됨(슬래시 여부와 무관). 팀 스킬이 늘어나면 프롬프트가 불려지고 base 토큰 부풀림.
- 제안: `description`만 나열하고 본문은 lazy(도구/온디맨드) 로드 또는 `/스킬명` 시에만 관련 본문을 메시지에 넣는 방식.

### P2 — admin 여러 부서 스킬 선택 vs 프롬프트 부재
`api/skills/route.ts:10-12`은 admin에게 **두 부서의 스킬을 모두** 제공하지만, 대화의 페르소나는 **한 부서 스킬만** 시스템 프롬프트에 포함(`engine.ts:323 buildPersonaSystemPromptWithSkills(getPersonSkill(부서))`).
→ admin이 계리 대화에서 `보험금 심사 절차 점검`을 선택하면 그 스킬 본문이 컨텍스트에 없음(유일 질문 텍스트만 전달).
- 제안: `/api/skills`는 페르소나(대화) 부서에 따라 필터링하거나, 대화 성격에 맞는 스킬만 노출; 또는 스킬을 호출했을 때 해당 SKILL.md 본문을 주입.

### P2 — 다중 공백 스킬명 파싱 오류 (핵심) — E8
`chat/page.tsx:278`
- 슬래시 파싱 ` /^\/([\p{L}\p{N}_-]+)\s*(...)/u`는 명령에 공백을 금지. 스킬명(예 `보험금 심사 절차 점검`)은 공백 포함.
- `/보험금 심사 절차 점검 옵션` 입력 시 `cmd="보험금"` → `isSkill=false` → 아무 else-if도 매칭 안 됨 → 전체 `/보험금 심사 절차 점검 옵션`이 그대로 질문 전송되어 스킬 명령 처리 실패.
- 수정: 슬래시 명령을 “공백까지” 매칭하교 슬래시 목록(이름)에서 가장 긴 접두사로 매칭, 아니면 슬래시 스킬은 단일 토큰(하이픈/밑줄)로 간명명하도록 가이드.
- (관련) span 크기 안내: 스킬 표기에서 `/스킬명` 뒤 인수 분리를 위해 `:`, `-` 등의 구분자 규칙을 정하는 게 좋음.

---

## 종합 우선 처리 추천
1. `route.ts:81` RAG 검색 try/catch 격리 (다운 폴백, E1) — P1
2. `pyexec.ts` 실행 격리 + filePath 신뢰 제한 (E2) — P1
3. delegate simple 모델 경로/fallback (E2) — P2
4. compact 재요약/추정 정밀화 (E4/E5) — P2
5. 슬래시 스킬 파싱·부서 정합 (E7/E8) — P2
