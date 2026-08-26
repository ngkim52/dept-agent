# dept-agent 프론트엔드 전면 검토 리포트 (Review A)

## 범위 및 방법
- 디렉터리: `app/`
- 대상 파일: `src/app/chat/page.tsx`(973줄), `src/app/admin/page.tsx`(458줄), `src/app/documents/page.tsx`(191줄), `src/app/page.tsx`(109줄, 로그인), `src/app/register/page.tsx`(102줄), `src/app/layout.tsx`, `src/app/globals.css`
- 실제 코드를 라인 단위로 정독 후 SSE 스트림 API(`api/chat/stream`), 관리 인증 API, 엔진(`lib/agent/engine.ts`), 설정, 인증 API를 교차 확인하여 이슈의 사실 여부를 검증했습니다.
- 우선순위 정의: **P0**=보안·데이터손실·무한루프/크래시, **P1**=오동작·상태 불일치·다운스트림에 영향, **P2**=UX/접근성/일관성/유지보수, **P3**=경미 개선.

> 요약: **P0 0건, P1 2건, P2 14건, P3 10건.** 심각한 키 노출·P0 취약점은 발견되지 않았으나, 채팅 스트리밍 중 대화 전환 시 잘못된 대화에 답변이 저장되는 데이터 무결성 문제(P1)와 admin 부서 페르소나 표시 오류(P1)가 가장 시급합니다.

---

## 1. 사용자 관점 버그 / 상태관리 / 스트리밍 UI

### [P1] | chat/page.tsx:319-323, 368-374 | 스트리밍 도중 대화를 전환하면 답변이 잘못된 대화에 누적됨
- `send()`는 요청 시작 시점의 `convId`를 사용해 `/api/chat/stream`을 호출하지만, 이후 `done`/`text_delta` 처리부는 **현재 선택된 대화와 무관하게 전역 상태 `setMsgs(prev => [...prev, ...])`에 누적**합니다.
- sidebar의 기존 대화 클릭(`openConv`)은 `streaming` 시에도 차단되지 않으므로(차단은 `newConversation`·전송버튼만 적용), 스트리밍 중 다른 대화를 열면 `msgs`가 전환된 대화의 내용으로 바뀐 뒤, 도착한 응답이 현재 화면(전환된 대화)에 이전 대화의 답변을 중복 저장합니다. → 다른 사용자가 보지 못할 데이터까지 오염(대화 내용 혼선/유실, 이전 대화에 속한 응답이 다른 대화로 저장되지 않아 대화 내용 유실).
- 수정 제안: `send` 시작 시 `const targetConvId = convId`를 캡처하고, `done`/`text_delta` 핸들러에서 `if (activeIdRef.current !== targetConvId) { append하면 안 됨 }` 또는 응답을 즉시 DB 기반 해당 대화로만 적용하도록 가드 추가. 스트리밍 진행 중 `activeId`를 바꾸는 UI(대화 리스트·하단)를 `streaming` 시 비활성화하거나 토큰(Txn)으로 요청 소유자를 추적하세요.

### [P1] | app/chat/page.tsx — 165, 232-240, 479-480 | admin: 대화 전환 시 부서 페르소나(헤더/아이콘)가 이전 대화 부서로 고착
- `openConv(id)`가 `if (!activeConvDeptId)` 일 때만 `cv.departmentId`를 설정합니다. `activeConvDeptId`는 클로저 내 렌더 시점 값이라, 첫 대화를 연 뒤 다른 부서의 대화를 열어도 `activeConvDeptId`가 갱신되지 않아 `effectiveDeptId`(479행)가 이전 부서로 유지됩니다. → admin이 여러 부서(심사→계리)의 대화를 오가도 헤더/페르소나/빠른응답 예시가 이전 부서로 표시되는 오동작.
- 수정 제안: `openConv`에서 항상 `const cv = convs.find(...); setActiveConvDeptId(cv?.departmentId ?? "")`로 갱신 (조건문 제거). 상태가 아니라 캡처된 `cv.departmentId`를 근거로 계산하는 것을 권장.

### [P2] | chat/page.tsx — 360-367 vs 373 | 진행 패널에 "완료" 항목이 중복 추가됨
- 서버가 엔진의 `onProgress({type:"done"})`(engine.ts:404)를 `progress done` 이벤트로 전송하고, 별도 `done` SSE 핸들러(373행)에서도 `setProgress(prev=>[...prev,{phase:"done"}])`를 수행 → 패널에 "응답 완료"가 2번 표시. (engine.ts:404의 done 이벤트 확정 확인)
- 수정 제안: 둘 중 한 곳만 done을 기록. 예) progress done 이벤트에서만 push하고 `done` SSE 핸들러에서는 push 제거.

### [P2] | chat/page.tsx — 238-239 | `JSON.parse(m.citations)`가 실패하면 대화 열기/전환이 멈춤
- DB에 저장된 `citations`가 비표준(빈 문자열, 잘못된 JSON)이면 `JSON.parse`가 throw → `openConv` 이후 setMsgs 미갱신으로 화면 정지. `try/catch`로 감싸거나 `safeParse` 유틸 사용.

### [P2] | chat/page.tsx — 320-331, 327 | 네트워크 실패 시에도 `fileIds`가 유지됨
- `setFileIds([])`는 `await fetch` **성공 후** 실행됨(327행). fetch가 throw되면 catch로 빠지면서 `fileIds` 초기화가 이뤄지지 않아, 재전송 시 "일회성 지정 파일" 의도와 달리 이전 파일이 다시 포함됩니다. `finally` 등으로 무조건 초기화.

### [P3] | chat/page.tsx — 184-197 | 페이지 진입 직후 인증/스킬/문서 3개 fetch가 각각 독립적으로 수행
- `/api/auth/me` 결과와 `loadConvs()`가 순차적이지 않고 비동기 경합이 있으나 현재는 동작. 통합 로딩 상태(단일 `useEffect` + `Promise.all`)로 정리하면 중복 렌더량 감소.

### [P3] | chat/page.tsx — 346 | 서버 "start" 이벤트를 프론트에서 처리하지 않음
- 서버가 `start` 이벤트(stream/route.ts의 send("start"))를 보내지만 클라이언트 분기가 없어 무시됨. 불필요하거나 시작 표시(예: "부서장이 검토합니다")에 활용할 수 있음.

---

## 2. 접근성 / 반응형 / 로딩·에러

### [P2] | chat/page.tsx (전체 아이콘 버튼), admin, documents | 아이콘 전용 버튼에 접근 가능한 이름(`aria-label`) 부재
- 로그아웃(541), 사이드바 축소(545), 대화 삭제(602), 파일 업로드(928), 문서 삭제(documents 175) 등 대부분 `title` 만 사용. 키보드/스크린리더 사용자에게 명확한 역할·이름이 없음. `title` 위에 전용 `aria-label`(예: `aria-label="로그아웃"`)을 부여하세요.

### [P2] | chat/page.tsx — 629-637 | 헤더 배지 3종이 좁은 화면에서 가로로 오버플로
- `"자료 근거 기반" / "업무 스킬 · 자동 압축" / "생각 · {level}"` 3개 pill을 `flex items-center gap-1.5`로 배치하고 헤더가 특정 너비가 0 센터에서 줄바꿈하지 않아, 900px 이하에서 wrap/가림 처리 없음. `flex-wrap` 또는 미디어 쿼리로 축소 태그를 숨기는 반응형 필요.

### [P2] | chat/page.tsx — 831-844 | 스트리밍 출력에 screen reader 알림 없음
- 스트리밍 중인 답변 `streamText`가 `aria-live` 영역 밖에 있어 화면 낙지 사용자에게 답변 도착이 전달되지 않음. 답변 블록에 `aria-live="polite"`(또는 완료 시 알림) 추가.

### [P2] | 문서/page.tsx — 125-131 | 업로드 드롭존이 `div` + `onClick`만으로 완성이 되어 키보드 접근 불가
- `div role? + onClick`에 키보드 focus/hover 상태가 없음. `role="button" tabIndex={0}` + `onKeyDown(Enter/Space)`로 바꾸거나 실제 `<button>`/`<label for=input>`로 전환.

### [P3] | documents/page.tsx — 54-58 | `setInterval(load, 4000)`가 요청 겹침 가능
- `load()`가 async로 몇 초 걸려도 다음 타이머가 발사될 수 있고, `loading` 상태도 재활용 안 됨. `setTimeout` 재귀 + 동시 실행 가드(`if (busy) return`) 권장.

### [P3] | documents/page.tsx 88-97, chat 498-498 | 문서 드롭이 파일 1개만 처리하는데 채팅은 다중 파일 허용
- 문서 페이지는 `files?.[0]` 단일, 채팅 드래그는 `uploadFiles(e.dataTransfer.files)` 다중. 일관성 유지 필요.

### [P2] | app 레벨 | 계층별 로딩·에러 경계 없음 (error.tsx / loading.tsx / not-found.tsx)
- `src/app` 어디에도 `error.tsx`, `loading.tsx`, `not-found.tsx`가 없음. SSE 실패나 API 오류 시 화면 전체가 빈/부분 렌더에 그침. 루트에 error 경계와 시멘틱 로딩 스켈레톤 추가 권장.

### [P3] | chat/page.tsx — 643 | 로그인 인증 전에 빈 환영 화면이 잠깐 노출
- `user`가 null인 초기 렌더 동안 "무슨 일을 검토받고 싶으신가요?" 빈 상태가 잠깐 보이다 리다이렉트됨. `user===null`이면 로딩 인디케이터를 먼저 표기.

---

## 3. 과도하게 큰 컴포넌트 분리

### [P2] | chat/page.tsx (전체 973줄) | 단일 파일 과대 — 명확한 하위 컴포넌트로 분리 필요
- 한 파일에 마크다운 렌더러(~90줄), 아이콘 객체 `I`(~20줄), 인라인 SVG 모음, 사이드바, 헤더, 진행 패널, 메시지 목록, 인풋 팔레트(슬래시/멘션), 업로드, 부서 스트리트/상태 20개 useState까지 밀집. 아래로 분리 권장:
  - `components/markdown-renderer.tsx` (Markdown 컴포넌트+헬퍼)
  - `components/icons.tsx` (인라인 SVG)
  - `components/chat-sidebar.tsx`, `components/chat-header.tsx`, `components/progress-panel.tsx`, `components/message-list.tsx`, `components/chat-composer.tsx`
- 분리 시 props/이벤트 콜백으로 경계를 명확히 하여 위 P1 상태 버그의 소지도 줄일 수 있음.

### [P2] | admin/page.tsx — 458줄 | 한 페이지에 3개 독립 기능(사용자 승인 / 모델 설정 / RAG 데이터셋)이 포함
- 사용자 승인, 모델 설정(상태 ~10개), 부서↔데이터셋 설정(상태 ~6개)이 한 컴포넌트에 공존해 드래프트 상태(draft) 간 상호작용 시 오동작 접점이 커짐. `AdminUsersSection`, `ModelSettingsSection`, `DeptDatasetSection`로 분리하고 각각 상태를 격리.

---

## 4. UI 일관성 (글꼴 / 그림자 / rounded-full / 이모지 금지요소)

### [P3] | 전체 | `rounded-full` 금지 요소 위반은 <b>핵심 없음</b> (부분만 작은 indicator 사용)
- `minimalist-ui` 규칙(“large container·card·primary button에만 금지”) 기준, 검출된 `rounded-full`(chat:561/630/633/636/675/714/749/800/840, documents:171, admin:207/253/353/433, page:32)은 모두 **상태 점(1.5~2px)이거나 작은 pill 상태배지(px-2.5)** 로, 카드/버튼에 사용되지 않아 규칙에 부합합니다. 단, 문서·admin 상태배지를 `rounded-full`로 통일 사용 중이므로 향후 배지 디자인 토큰(예: `rounded-lg` + 고정)으로 중앙화하여 일성을 유지 권장.
- 참고: status pill들이 서로 `rounded-full px-2.5`, `rounded-md`, `rounded-lg`가 혼재(admin 353, 359 vs 253) → 이모지 규칙 외에도 라운딩 일성이 필요.

### [P3] | chat/page.tsx — 913 | 이모지 금지요소 소규모 위반 (✕ 문자)
- 파일 제거 버튼에 `✕`(U+2715)를 텍스트 문자로 사용(다른 곳은 모두 인라인 SVG). 유니코드 곱셈기호지만 폰트에 따라 대형 이모지/기호로 렌더될 수 있어 위반으로 결로 보이지 않으니, SVG `x` 아이콘으로 치환 권장. (그 외 `…`, `·`, `→` 등은 일반 구두기호로 문제 없음)

### [P3] | 전역 | 그림자/폰트 일성은 양호
- heavy shadow 없음(`lift`에 0.06 투명 box-shadow), 폰트 시리즈 `sans/serif/mono` 지정, `tabular-nums`·줄높이 일관 — `globals.css`의 웜 모노크롬 토큰이 전 페이지에서 일관 사용 중. 부정적 요소는 없음(양호).

### [P2] | layout.tsx — 1-29 | 외부 CDN 폰트(Google Fonts + jsDelivr)를 `<head>`에 직접 로드
- `next/font`(Google) 또는 자체 호스팅 자산으로 대체하면 (a)배포 환경의 외부 네트워크 의존 제거(오프라인/CSP), (b)preload·font-display 최적화로 FOIT 개선. Pretendard variable도 `/public` 자체 호스팅이 안정적.

### [P2] | 문서/관리 — 모바일에서 `<table>` 가로 오버플로
- admin(222행, 394행), documents의 목록이 `w-full` 테이블로 email·설명이 길면 좁은 화면에서 무한 확장. `overflow-x-auto` 래퍼로 감싸거나 카드형 목록으로 전환.

---

## 5. 보안 노출 (console 토큰 / dangerouslySetInnerHTML)

### [P2] | chat/page.tsx — 32-121 (Markdown 렌더러) | 모델/사용자 콘텐츠를 `dangerouslySetInnerHTML`로 삽입
- 4곳(51/64/109/118행)이 `inline()` 출력을 `dangerouslySetInnerHTML`에 주입. `inline()`이 `esc()`(엔티티 `<>&`)로 사전 이스케이프한 후 `<code>`/`<strong>` 태그만 삽입하므로 **주요 XSS 경로는 차단된 구조**이지만, (a) 이스케이프 우회 가능한 예외(이중 인코딩·기타 HTML 엔티티)·(b) 이후 마크다운 기능 확장 시 누군가 원시 HTML을 통과시키는 실수가 발생하기 쉬운 구조입니다. 리액트 엘리먼트 토큰화(또는 검증된 렌더러 e.g. `react-markdown` + 올바른 스키마)로 `dangerouslySetInnerHTML` 제거를 권장.
- 추가: 같은 `Markdown`이 사용자(`user`) 메시지 렌더링(790행)에도 쓰이는지 — 실제적으로 user 콘텐츠도 표시되므로 이스케이프 경로를 단일화해 유지.

### [P1→P2] | chat/page.tsx — 353-358, 740 | raw reasoning(chain-of-thought)을 클라이언트에 전송·표시
- 서버 `progress/thinking` 이벤트에 `detail=순수 추론` 그대로 전달되어(route.ts:389, engine.ts:389), 확장 패널에 "추론(reasoning)" 원문 노출. 베스트 프랙틱스상 최종 답변 품질의 **중간 CoT를 사용자에게 완전 공개**하는 것은 (a) 프롬프트/사고 모델 노출 (b) 무단 프롬프트 삭감 매개가 될 수 있음. `detail`을 요약·라벨만 보내고 원문은 서버 유지를 권장.

### [확인] | console 토큰 노출 — 없음 (양호)
- 클라이언트(`src/app`, `src/components`) 소스에서 API key/token을 `console`로 출력하는 코드 없음. `/api/admin/models/openrouter`는 서버에서 Bearer key를 사용하고 응답엔 id/name/price만 반환(`route.ts`), `/config`도 `hasKey` 불리언만 반환. 별베 best practice를 유지 중.

### [확인] | 관리자/소유 API 권한 확인 — 양호
- `requireUser`+`requireAdmin`, 대화/문서 조회·삭제 시 `userId` 기반 ownership join(e.g. conversations/[id], documents/[id], chat/stream)이 전부 적용됨.

### [P3] | login/route.ts:26 | 쿠키에 `Secure` 플래그가 환경변수(`COOKIE_SECURE==="true"`)에만 부여
- 기본값 없이 HTTPS 배포에서 강제되지 않음 → `.env` 기본값을 true로 하거나, 프로덕션을 강제 표현하기를 권장.

---

## 6. 목업 (Mock/Hardcode)

### [확인] 전용 모조 데이터는 없음 — 실데이터/코어 흐름만
- `examples`(443-491), `TOOL_LABELS`, `PERSONAS`, `PERSONA_DEFAULT`는 실제 서버 기능에 대응하는 상수·기본값일 뿐 미구현 목업 아님. `docs`, `conversations`, `departments`, `skills` 모두 실제 API에서 로드.
- **[P3] 기본 페르소나 하드코드:** `PERSONAS`에 `claims-planning`, `actuarial`만 있고 이외 부서는 `PERSONA_DEFAULT`(부서장/부문)로 폴백(chat 22-26). 부서가 DB 늘면 화면에 "기본·부"로만 나옴. DB `departments.personaKey`(admin API가 `personaKey` 반환)를 읽어 동적 매핑을 권장(단순성 유지는 선택).

---

## 마지막 우선순위 요약표

| 우선순위 | # | 위치 (파일:줄) | 요약 | 권장 수정 |
|---|---|---|---|---|
| P0 | 0 | — | — | — |
| **P1** | 1 | chat/page.tsx:319-323, 368-374 | 스트리밍 중 대화 전환 시 답변이 잘못된 대화에 누적/저장 | 요청 소유 `convId` 캡처+활성 가드, streaming 중 전환 차단 |
| **P1** | 2 | chat/page.tsx:232-240, 479 | admin 대화 전환 시 부서 페르소나/헤더 고착 오염 | openConv에서 `cv.departmentId`를 무조건 상태로 갱신 |
| P2 | 3 | chat/page.tsx:32-41 | `dangerouslySetInnerHTML`로 모델 콘텐츠 삽입(XSS 방어는 있고 리스크 최소화 수준) | React 엘레먼트 렌더링/`react-markdown` 전환 |
| P2 | 4 | chat/page.tsx:737-740 + route.ts | 추론(CoT) 원문을 클라이언트 노출 | 요약 라벨로 대체, 원문 서버 유지 |
| P2 | 5 | chat/page.tsx:362-373 + engine.ts:404 | 진행 패널 "done" 중복 기록 | progress/`done` 중 하나만 push |
| P2 | 6 | chat/page.tsx:238-239 | `JSON.parse(citations)` throw 시 열기 실패 | try/catch + 안전 파싱 |
| P2 | 7 | chat/page.tsx:328-331 | 네트워크 실패 시 `fileIds` 미초기화 | `finally`에서 초기화 |
| P2 | 8 | chat/page.tsx (아이콘 버튼) / documents:175 | `title`만 있는 아이콘 버튼에 `aria-label` 부재 | 명시 라벨 추가 |
| P2 | 9 | chat/page.tsx:629-637 | 헤더 3개 pill 반응성(가로 오버플로) | `flex-wrap`/모바일 숨김 |
| P2 | 10 | chat/page.tsx:831-844 | 스트리밍 답변에 `aria-live` 없음 | `aria-live="polite"` 등 알림 |
| P2 | 11 | documents/page.tsx:125-131 | 드롭존 키보드 접근 불가 | `role="button" tabIndex`/실제 button |
| P2 | 12 | layout.tsx:12-21 | 외부 CDN 폰트 → 빌드/오프라인 의존 | `next/font`·자체 호스팅 |
| P2 | 13 | 전역 (error/loading/not-found) | 에러 경계/로딩 페이지 부재 | 루트 error.tsx·loading.tsx 추가 |
| P2 | 14 | admin/page.tsx (users/dept drafts) | 승인 실패 무응답·부서 draft가 저장 reload로 유실 | 오류/바쁨 상태·draft 저장 충돌 처리 |
| P3 | 10 | chat/page.tsx:913 | `✕` 이모지or기호 사용 | SVG로 치환 |
| P3 | 11 | chat/page.tsx:643 | 로그인 전 빈 화면 플래시 | `user===null` 로딩 분기 |
| P3 | 12 | chat/page.tsx:22-26, admin api | 페르소나 모음 하드코드(2개 부서만) | DB `personaKey`로 매핑 |
| P3 | 13 | documents(38-58) | 주기 폴링 fetch 중 복 문제 | 재귀 setTimeout+가드 |
| P3 | 14 | page.tsx:27-107 / register | 로그인 화면에서 이미 로그인 시 자동 이동 없음 | `useEffect`로 `/chat` 리다이렉트 |
| P3 | 15 | login/route.ts:28 | `Secure` 쿠키 여분 조건부 | prod 강제 |
| P3 | 16 | chat/page.tsx:346 | 서버 `start` 이벤트 미처리 | 시작 상태 반영 또는 제거 |
| P3 | 17 | admin:222/394 | 관리 테이블 모바일 오버플로 | `overflow-x-auto` |
| P3 | 18 | chat/page.tsx:616-626+346 | 진행 패널 `filter(tool)` 카운트 의미 미묘 | — |

---

## 검토 당시 양호 항목(유지 권장)
- `globals.css`: 축소 모션(`prefers-reduced-motion`) 및 `:focus-visible` 아웃라인 적용, 리프/블링크 애니메이션이 `transform/opacity`만 사용.
- 인증/권한: 소유 join, admin 전용 API, 비밀번호 해시, rate-limit 적용.
- 서버 keys가 클라이언트로 반환되지 않음(모델 목록 프록시에서 price만 전송).

---
*리포트 생성: `/home/ngkim52/work/dept-agent/review-A-frontend.md`*
