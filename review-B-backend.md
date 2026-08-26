# dept-agent 백엔드/인증/보안/데이터 계층 검토 (Review-B)

- 검토 범위: `app/src/app/api/**`(auth/*, chat/stream, conversations, documents, departments, admin/*, skills), `app/src/lib/auth/*`, `app/src/lib/db/*`, `app/src/lib/uploads.ts`, `app/src/lib/settings.ts`, `app/src/lib/config.ts`
- 기준: 1) 인증/세션/권한 2) 채팅 API 인증·소속·파일·RAG 권한 3) 데이터 계층 성능·무결성·동시성 4) 입력 검증/에러 노출 5) 설정/비밀 노출
- 심각도: **P0**(즉시 조치), **P1**(높음), **P2**(중간), **P3**(개선)
- 행: `src/...` 경로는 `app/` 기준.

## 요약 (최우선 조치순)
| # | 심각도 | 위치 | 요약 |
|---|--------|------|------|
| B1 | P0 | lib/auth/ratelimit.ts:9-12 | 클라이언트 통제 `X-Forwarded-For` 직접 신뢰 → rate limit 우회 |
| B18 | P0 | lib/agent/engine.ts / pyexec.ts | LLM 생성 파이썬 임의 실행 → RCE·비밀유출·RAG 프롬프트 주입 확장 |
| B3 | P1 | app/api/chat/stream/route.ts | 채팅/LLM API 레이트리밋 없음 → 비용·자원 남용 |
| B10 | P1 | app/api/documents/route.ts:64-67 | 개인 문서를 부서 공용 RAG에 무조건 주입 → 데이터 격리 위반 |
| B4 | P1 | app/api/auth/login/route.ts:26 | 세션 쿠키 `Secure` 기본 미적용 (HTTP 유출 위험) |
| B5 | P1 | app/api/auth/register/route.ts:39-48 | 최초 가입자 자동관리 승격 + 동시등록 레이스로 관리자 탈취 가능 |
| B6 | P2 | app/api/conversations/route.ts:24-26 | `user.departmentId` null 시 클라이언트 부서 그대로 사용 → 부서 권한 우회 |
| B12 | P2 | app/api/admin/departments/route.ts:19-22 | 부서별 데이터셋 N+1 쿼리 |
| B15 | P2 | lib/db/schema.ts | 주요 FK(userId/conversationId) 인덱스 부재 |
| B16 | P2 | app/api/conversations/[id]/route.ts 등 | 참조 무결성 비트랜잭션(고아 메시지)·삭제 시 RAG 잔존 |
| B25 | P1 | .env(실 키 보유) | 실제 API키 평문 보관; 회전·런타임 주입 권고 |

---

## 1) 인증 / 세션 / 권한

### B1 [P0] Rate limit 완전 우회 — `X-Forwarded-For` 직접 신뢰
- **파일:줄** `src/lib/auth/ratelimit.ts:9-12`
  ```ts
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
  ```
- **설명**: `checkRateLimit`(login/register/key)가 클라이언트가 조작 가능한 헤더의 **첫 번째 값**을 IP로 사용한다. 공격자는 `X-Forwarded-For: <임의IP>`를 바꿔가며 요청해 1분 10회 제한을 무시하고 무제한 로그인/가입 시도(브루트포스, 계정 탈취)가 가능하다. 또 헤더가 없으면 모든 요청이 하나의 `"unknown"` 버킷에 합쳐져 다른 사용자를 오탐(DOS)시킬 수도 있다.
- **수정 제안**: 프록시가 `X-Forwarded-For`를 덮어쓰는 경우에만 신뢰한다. Next.js `request.headers.get('x-real-ip')` 또는 프록시 정규 IP만 사용하고, 실제 단일 신뢰 프록시 환경에서는 `CF-Connecting-IP` 등 신뢰 헤더 한 가지만 사용. 계정 단위+IP 단위 복합 제한과 CAPTCHA(재시도 횟수 초과 시) 병행.

### B2 — P1 `인메모리 Map 무한 누적·멀티 인스턴스 미지원`
- **위치**: `src/lib/auth/ratelimit.ts:26` (`hits.set(id,…)`), 엔드포인트 주석(28)
- **설명**: `hits` Map은 만료 항목을 갱신만 할 뿐 주기 정리/크기 상한이 없다. 서로 다른 IP가 많아지면 메모리 비대. 또 프로세스(인스턴스) 메모리라서 재시작 시 초기화되고, 로드밸런서 다중 인스턴스에서는 서로 다른 카운터로 뚫린다.
- **수정 제안**: TTL 기반 정리(주기 스캔)와 상한 추가; 스케일 필요 시 Redis/공유 스토어. 최소한 `unknown` 폴백은 버킷/거부.

### B3 — [P1] 채팅/LLM 경로 레이트리밋 없음 → 비용·자원 남용
- **위치** `src/app/api/chat/stream/route.ts:20-133` (POST 부분)
- **설명**: `login`/`register`에만 rate limit이 있고, 유료 LLM을 무제한 호출하는 `chat/stream`과 RAGFlow 업로드/파서, `websearch`(Serper/Tavily 키 소모) 경로엔 아무 제한이 없다. 인증된 사용자라도 메시지에 길이 제한도 없어 반복 스트리밍으로 비용(Dollar tokens)·외부 API 쿼터를 고갈시킬 수 있다. 동시 오픈 SSE 스트림은 프로세스 스레드/DB 세션도 점유한다.
- **수정 제안**: per-user 초당/일사용 한도(토큰 예산), 동시 스트림 상한, 메시지 최대길이(예: 20k자), `thinkingLevel` 비용가중 반영.

### B4 — [P1] 세션 쿠키 `Secure` 기본 미적용 → 민감토큰 HTTP 유출
- **위치** `src/app/api/auth/login/route.ts:26`, `.env`(`COOKIE_SECURE=false`)
- **설명**: 쿠키는 `HttpOnly; SameSite=Lax; Path=/`로 나가는데 `Secure`는 `process.env.COOKIE_SECURE === "true"`일 때만 붙는다. 기본값이 false면 HTTPS 앞단 외부로 (예: 프록시에서 HTTP로 내려주거나 사용자가 http로 접근 등) 세션토큰이 평문 전송될 수 있다. `SameSite=Lax`, `__Host-` 접두어, `SameSite`의 기본 구성도 조정 여지.
- **수정 제안**: 프로덕션 환경에 `Secure`을 항상 부여(HTTPS 프록시 뒤라면 기본 `true`), 프론트에 `__Host-` 접두어 사용, 쿠키 세부 속성 중앙화(`config`). `SameSite=Strict` 최소한 상태 변경 경로는 CSRF 토큰 검증.

### B5 — [P1] 최초 가입자 자동 관리자 + 동시등록 레이스
- **위치** `src/app/api/auth/register/route.ts:39-48`
  ```ts
  const userCount = await db.$count(schema.users);
  const isFirst = userCount === 0;
  role: isFirst ? "admin" : ...
  ```
- **설명**: 아무나 최초로 가입하면 즉시 관리자/active가 된다. 두 요청이 동시에 `count=0`을 읽으면 둘 다 관리자가 된다(트랜잭션 없음, `$count`는 스냅샷). 프로덕션에서 시드 계정 배포 전 이 기능이 노출되면, 임의의 외부 사용자가 시스템 관리자를 차지할 수 있다.
- **수정 제안**: "최초 가입자=관리자" 제거. 초기 관리자는 시드 스크립트/환경변수(`ADMIN_EMAIL`)+비밀번호 설정으로 명확히 생성하고, 가입은 전부 `pending`로 시작하게. 동시등록은 `INSERT … ON CONFLICT` 또는 `BEGIN IMMEDIATE` 안에서 카운트하도록 트랜잭션 처리.

### B6 — [P2] 부서 권한 우회 여지 (`user.departmentId` null 시 클라이언트 신뢰)
- **위치** `src/app/api/conversations/route.ts:24-26`
  ```ts
  const departmentId = user.role === "admin"
    ? String(body.departmentId ?? "")
    : (user.departmentId ?? String(body.departmentId ?? ""));
  ```
- **설명**: 일반 사용자(`role==="user"`)의 `user.departmentId`는 정상 흐름에서 가입 시 설정되므로, 현재는 자신 부서로 고정된다. 그러나 스키마상 `department_id`는 nullable(`schema.ts:53`)이고, 사용자 부서가 삭제/변경되어 null이 되면 `body.departmentId`(클라이언트 제공)가 그대로 쓰이며 → 임의 부서 대화 생성 → 해당 부서 RAG 데이터 접근. 관리자 등 다른 유저로 가장 필요한 부서권한 IDOR 경로.
- **수정 제안**: 비관리자는 반드시 `user.departmentId`와 제출값이 일치하는지 서버에서 검증, null이면 400. `requireUser` 후 부서를 DB조인으로 강제해 클라이언트 필드는 무시.

### B7 — [P2/P3] 세션 관리 한계
- **위치** `src/lib/auth/session.ts:7-19,30-36`
- **설명**: 7일 TTL의 세션을 다중 활성화 가능(revoke-all 없음), 비밀번호 변경 시 기존 세션 무효화 없음, 서버측 last-used 로테이션 없음. 단발 토큰은 `sha256` 저장이라 DB 유출 시 역산은 어려움(좋음). SSE 등에 토큰이 노출되는 경로는 없음.
- **수정 제안**: 비밀번호 변경/권한변경 시 해당 유저의 모든 세션 파기; 필요시 서버측 재발급(슬라이딩). 최소 감사는 낮음.

### B8 — [P2] 사용자 열거(enumeration)
- **위치** `src/app/api/auth/register/route.ts:29` (`이미 가입된 이메일입니다.`), `:25`(도메인 오류)
- **설명**: 가입 시점에 이미 존재하는 이메일을 명시적으로 구분 → 임의 이메일 존재 여부 확인 가능(기존 계정 탈취 전단계). 도메인 오류 메시지도 정보 누출.
- **수정 제안**: 가입 실패 시 항상 동일한 일반 메시지를 반환(중복/도메인 오류를 구분 노출하지 않음)하고 재시도를 서버 쿨다운으로 제한. 사용자 편의상 구분을 유지하되, 이는 낮은 위험으로 문서화 권장.

### 관리자 API 권한 (정상)
- `admin/users`·`admin/departments`·`admin/models/*`는 모두 `requireUser`+`requireAdmin(http.ts:6,14)`로 이중 체크됨. **정상**.

## 2. 채팅 API (인증·소속·파일·RAG 권한)

### B10 — [P1] 개인 문서가 부서 공용 RAG에 무조건 주입 (데이터 격리 위반)
- **위치** `src/app/api/documents/route.ts:64-67`
  ```ts
  const datasetIds = await getDepartmentDatasets(user.departmentId ?? "");
  for (const dsId of datasetIds) {
    const up = await ragflow.uploadDocument(dsId, file.name, new Blob([buf]));
  ```
- **설명**: 사용자가 올린 개인 파일을 **소속 부서의 전체 RAGFlow 데이터셋**에 자동 업로드한다. 그리고 `chat/stream`의 `retrieveDepartmentChunks(conversation.departmentId)`는 해당 데이터셋의 모든 청크를 부서원 누구에게나 검색/인용으로 제공한다. 즉, 사원이 "내 자료"로 올린 인적사항·보험금 정보 등이 **같은 부서 다른 사용자가 RAG 검색으로 열람** 가능하게 된다. RAGFlow에는 별도 파일 단위 ACL이 없다. 또 파일 본문이 `documents.content`(DB)에도 복제 저장되어 이중 보관.
- **수정 제안**: (a) 개인 업로드는 userId 기준 `@파일명` 인젝션용으로만 쓰고 부서 공용 RAG에는 **자동 주입하지 않음**. (b) RAG 반영은 부서 관리자가 명시적/검토 후 진행하거나, "부서 공용 자료"와 "개인 자료"를 구분해 별도 개인별 데이터셋 사용. (c) 최소한 각 파일 소유·부서 검증(현재는 부서=RAG 경계를 파일 단위로 위반 가능).

### 채팅 소속/소유 권한 (정상)
- `chat/stream/route.ts:27-31` — `conversation.id`+`userId==user.id` join으로 소유자 외 접근 차단. `fileIds`도 `doc.userId==user.id`로 소유자 파일만 허용(`:61`). `conversations/[id]` GET/DELETE 역시소유자 검증. **해당 경로는 정상이나 B6(부서 선택) 우회 시 RAG 접근 범위가 늘어날 위험이 있음.**

### B11 — [P2] 문서 삭제 시 RAGFlow 잔존 + 개인/부서 데이터셋 비동기 파싱 미검증
- **위치** `src/app/api/documents/[id]/route.ts:11-14`
- **설명**: `DELETE`는 DB·디스크만 지우고 `ragflowDocId`를 통해 올려준 RAGFlow 문서는 삭제하지 않는다. 지운 파일이 채팅 검색 결과로 계속 노출될 수 있다.
- **수정 제안**: 삭제 시 `ragflow.deleteDocuments(dsId, [ragflowDocId])` 호출 (데이터셋별 순회), 실패 로그.

### B18 — [P0] LLM 생성 파이썬 임의 실행 (RCE 확률 높음)
- **위치** `src/lib/agent/engine.ts`(makePythonDataTool) → `src/lib/agent/pyexec.ts:9-86`
- **설명**: `python_data` 툴이 LLM이 만든 `script`를 사용자 계정 프로세스로 그대로 `execFileAsync(PYTHON)` 실행한다. 입력 데이터(업로드 파일본문, RAG 청크, 사용자 프롬프트)를 통한 **프롬프트 주입**으로 모델이 임의 파이썬 코드를 생성하도록 유도 가능 → 하위 자원 소비, **RCE**. 컨텍스트는:
  - `pyexec.ts` 자식 프로세스는 부모 env 상속(`host/app.env`) → `LLM_API_KEY`, `RAGFLOW_API_KEY`, `OPENROUTER_API_KEY`, `SERPER_API_KEY`, `TAVILY_API_KEY` 유출.
  - 업로드 경로(`DATA_DIR/uploads/*`)와 DB(`data/dept.db`: users.passwordHash, sessions) 읽기 가능.
  - 시스템콜로 네트워크 전송/셸 실행 가능 → 외부 유출.
  - 다중 사용자(부서 구성원)가 같은 data 디렉토리를 공유하므로 타인 업로드 파일까지 열람 가능.
- **수정 제안**: 
  1. 파이썬 실행을 **샌드박스**로 (독립 컨테이너/서버리스, 최소권 사용자, `no-subnet-online`, `seccomp`/`chroot`), `subprocess`·network 불허.
  2. 자식 프로세스 env에서 민감 키 **제거**(`env: { PYTHONIOENCODING, PATH }` 만 주입).
  3. 파일 접근을 본 요청의 `filePath` 하나로 제한, 절대경로 화이트리스트.
  4. 명령 세트 화이트리스트 또는 반사적 인가; 신뢰도 조정(최소가 아니라 만능이므로 리스트만 허용).
  5. 실행 타임: 현재 `TIMEOUT_MS=20000` 로컬이지만 자원/출력 상한 유지(기본 양호).

### B3과 병행 — 채팅/LLM 예산 (위 B3 참조).

### B19 — [P3] 메시지 길이 무제한
- **위치** `src/app/api/chat/stream/route.ts:24-26`
- **설명**: `message` 길이 제한 없음. 스트리밍/토큰가격 폭탄의 입력 구멍. 위 B3과 함께 제한(예: 20~50k자) 추가.

## 3. 데이터 계층 (N+1·인덱스·무결성·동시성)

### B12 — [P2] N+1 (admin/departments)
- **위치** `src/app/api/admin/departments/route.ts:20-22`
  ```ts
  for (const d of departments) linked.set(d.id, await getDepartmentDatasets(d.id));
  ```
- **설명**: 부서마다 별도 쿼리 → 부서 수만큼 라운드트립. 소규모지만 확장 시 N+1.
- **수정**: `getDepartmentDatasets` to single `in (department_id)` groupBy 집계; `dataset/access.ts`에 bulk variant 추가.

### B13 — [P3] 중복 조회 (chat)
- **위치** `src/app/api/chat/stream/route.ts:79-80` (`getDepartmentDatasets` + `getDepartmentDatasetInfos`)
- **설명**: 동일 테이블을 두 번 조회. infos가 필요 없을 때 빼거나 한 번에 `{id,name}` 목록으로 병합.

### B14 — [P2] 인덱스 부재 (대화/메시지/문서/세션 조회)
- **위치** `src/lib/db/schema.ts:42-73`
  - `conversations.userId` — `conversations/route.ts:GET` (사용자 대화 목록)로 풀스캔.
  - `messages.conversationId` — `chat/stream` 이력 로드, `conversations/[id]/route.ts` 메시지 목록.
  - `documents.userId` — `documents/route.ts` GET.
  - `sessions.userId` — revoke-all용(현재 미사용).
- **수정 제안**: 각 컬럼에 `index()` 추가(drizzle). `sessions.token_hash` unique는 이미 OK, `session.expires_at` 정리에 인덱스 있으면 유리.

### B15 — [P2] 참조 무결성 비트랜잭션
- **위치** `src/app/api/conversations/[id]/route.ts:DELETE`
  ```ts
  await db.delete(schema.messages).where(...);
  await db.delete(schema.conversations).where(...);
  ```
- **설명**: 사이에서 실패하면 `conversations` 없는 메시지 고아 레코드 → 참조무결성 위반. 또한 `admin/users` 등 다른 업데이트는 단일 문이라 OK하지만 여러 단계는 트랜잭션으로 감싸는 게 좋다.
- **수정**: `db.transaction(async (tx)=>{…})`로 메시지+대화 동시 삭제, 참조키 `ON DELETE CASCADE` 옵션 고려.

### B16 — [P2] 초기 등록 레이스 (B5와 연동)
- `register`의 `$count`+INSERT가 트랜잭션 아님 → 동시 카운트 함. `session` 정리(`delete … where expiresAt<now`)는 createSession마다 수행해 정상이지만 DDL/DML 순서 정리 권장.

### B17 — [P3] SQLite WAL·백업
- `src/lib/db/index.ts` — `journal_mode=WAL`, `foreign_keys=ON` 양호. `busy_timeout` 미설정 시 동시 read/write 충돌은 better-sqlite3(단일 동기연결)로 제한적. MVP 수준으로 인정.

## 4. 입력 검증 / 에러 정보 노출

### B20 — [P2] 요청 바디 타입 검증 부재 (zod 미사용)
- 로그인/가입/대화/채팅/문서/관리 모두 `req.json().catch(()=>({}))` 후 `String(...)`으로 캐스팅만 하며 필드 존재·타입을 강제하지 않는다. `zod`는 의존성에 있으나 사용 안 함. 
- 잘못된 형태(배열/객체)가 `[object Object]` 등으로 저장되거나 후속 쿼리에서 예외를 일으킬 수 있다.
- **수정**: 주요 경로에 zod 스키마(`/login`,`/register`,`/conversations`,`/chat`,`/documents`,`/admin/*`) 파싱, 400 반환.

### B21 — [P3] 에러/로그에서 민감 데이터 유출 가능
- `src/lib/ragflow/client.ts:33` — `text.slice(0,200)`을 error에 포함(외부서버 메시지). 대부분 `jsonError`에서 generic 500으로 변환되나, `console.error`(`chat/stream:95`, `engine` 등)로 에러 바디가 로그에 기록 → 외부 서버 응답에 키가 실려 캐시 여부 확인 필요.
- `pyexec.ts` stderr 최대 3000자 반환 — 사용자에게 (아웃바운드) 노출 가능.

### B22 — [P3] 업로드 형식/확장자 제한 없음
- `documents/route.ts` — `isText` regex로 text 판정하지만 업로드 확장자 자체에 20MB 제한 외 인증/확장자/콘텐츠 검증은 없다. `.py/.xml/.svg` 등이 `content`/ RAG에 들어가 프롬프트 주입 벡터가 될 수 있다(B18/B10과 연계).
- **수정**: 업로드 MIME+확장자 화이트리스트(보험 데이터 형식: csv/xlsx/json/txt/pdf 등), `svg`와 실행 확장자 차단, 사이즈·텍스트 슬라이싱 유지.

## 5. 설정 / 비밀 노출

### B25 — [P1] 실사용 API 키 평문 보관
- **위치** `app/.env` (repo 디렉토리 내 존재)
- **설명**: `app/.env`에 운영용 실키(Live RAGFLOW_API_KEY, LLM_API_KEY, OPENROUTER_API_KEY, SERPER_API_KEY, TAVILY_API_KEY)가 평문 파일로 들어 있다. `.gitignore`,` .dockerignore`가 `.env`를 제외해 **git커밋·이미지에는 안 들어가는 것을 확인**(양호)하지만, 향후 접근 권한이 공유되거나 실수 커밋·백업·스크린캡처로 외부 유출되면 재사용 가능. `.env.example`의 키 필드는 빈값으로 정상.
- **수정 제안**:
  1. 실키는 로컬 개발용으로 한정하고, 프로덕션은 **런타임 구성 관리(예: KMS/Docker Secret, 배포 `--env-file`)**로만 주입.
  2. 키 회전(추정 유출 여지 있으므로) 선택.
  3. (금지할 것) `.env`를 어떤 배포/이미지에도 포함하지 않기(현재 `.dockerignore`가 방지하고 있음).

### B26 — [P2] 관리 API/설정 노출 (제한)
- `admin/models/config` GET이 게이트웨이 `baseUrl`과 `hasKey`(불리언)를, `admin/models/openrouter`가 `source` baseUrl을 반환한다. **관리자 전용이므로 정상 수준**. `dbValues`/`effective`에 모델명·게이트웨이 노출이 UI에 필요한 수준. 키 자체는 노출 안 됨. 다만 `config.ts`에서 `as const`로 게이트웨이 객체 타입을 고정하고 각 라우트는 `(config as any)` 캐스팅.

### B27 — [P3] python 자식 프로세스 env 상속 → 비밀 유출 (B18 연계)
- `pyexec.ts:execFileAsync` 기본 env 상속 → 파이썬에서 `os.getenv`로 키 읽기 가능. B18의 샌드박스화와 함께 **민감 env 제거/허용 목록만 주입** 필수.

### B28 — [P2] 공개 부서 목록 API
- `src/app/api/departments/route.ts:GET` — 로그인 불필요로 의도적(가입화면), 활성 부서만 노출, 민감 필드(`ragflowDatasetId`) 포함! `departments` 테이블 전체(`findMany`) 반환 → `personaKey`·`ragflowDatasetId`(내부 데이터셋 id)가 비로그인 사용자에게 노출.
- **수정**: 공개 응답을 `{id,name}`만 골라 반환(관계·dataset id 제외).

## 추가 참고
- 본 검토는 소스 정적 분석 기반. 소스 정적 분석 기반이며 실제 공격·`npm test`/lint 실행으로 검증하지 않음. B18·B10은 env·데이터가 실제 운영으로 확정 전 확인 필요.

## 마지막 요약
dept-agent의 백엔드는 **소유자 검증(requireUser+ownId), 해시 저장(bcrypt), 토큰 sha256 저장, SQLite WAL/FK, 보안 헤더** 등 기본 방어는 갖추고 있다. 다만 ①레이트리밋은 클라이언트 헤더 신뢰로 즉시 우회 가능(P0), ②LLM-생성 파이썬을 샌드박스 없이 실행해 비밀·DB·임의 코드 접근이 열려 있고(P0), ③개인 문서가 부서 공용 RAG에 자동 반영되어 데이터 격리가 깨진다(P1), ④세션 쿠키 Secure 기본값 미적용·최초가입 관리자 승격 레이스(P1)가 눈에 띄는 고위험점이다. 우선순위: B18·B1 샌드박스/레이트리밋 강화 → B10 RAG 분리 → B4·B5 → 인덱스·트랜잭션(P2) 순으로 수정을 권고한다.
