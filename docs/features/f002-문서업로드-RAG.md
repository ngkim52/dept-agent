# f002. 문서 업로드 → RAG 인덱싱 → 검색

## 목적
- 사용자가 작성한 자료를 올리고, 부서장 에이전트가 그 자료를 근거로 판단/답변.

## 흐름
1. 사용자가 파일 업로드 (PDF/워드/텍스트/마크다운 등)
2. 앱이 해당 부서의 RAGFlow 데이터셋에 문서 추가
   - `POST /api/v1/datasets/{id}/documents` (url 또는 content)
3. RAGFlow가 파싱·청킹 (비동기) → 상태 확인 (parsing)
4. 파싱 완료 → "검색 가능" 상태로 앱 DB에 기록
5. 질문 시: RAGFlow `retrieve` API로 관련 청크 검색 → 에이전트 컨텍스트에 삽입

## 데이터/권한 연동
- 문서는 소유 사용자 + 부서 매핑 → 권한 검사에 사용 (Q3 확인 필요)
- 부서 데이터셋을 분리하면 권한 필터가 단순해짐 (권장 후보)
  - 데이터셋 ID = 부서 ID 매핑 (`Department.ragflow_dataset_id`)

## API (RAGFlow REST, 참고)
- Create dataset: `POST /api/v1/datasets`
- Upload documents: `POST /api/v1/datasets/{dataset_id}/documents`
- List documents: `GET .../documents?page=1&page_size=20`
- Retrieve chunks: `POST /api/v1/retrieval`
- (혹은 Chat Assistant로 위임)

## RAGFlow 접속 (확정 2026-08-20)
- URL: `https://ragflow.ax-demo.com` (HTTPS, 외부 서버)
- 인증: **API 키** — `Authorization: Bearer <API_KEY>` (Bearer 토큰)
- API 기본 경로: `/api/v1/...`
- API 키 발급 (공식 문서 확인, 2026-08-20 Serper 검색):
  1. https://ragflow.ax-demo.com 에 관리자로 **웹 로그인**
  2. 우측 상단 **아바타 클릭** → 설정 화면
  3. **API** 탭 클릭
  4. 새 API 키 생성 → 복사
  (참고: 대안으로 콘솔 세션 토큰 `POST /v1/system/new_token` 방식도 있으나 비표준 → API 키 사용 권장)
- 실제 서버 연동 검증 완료 (2026-08-20, API 키로):
  - GET /api/v1/datasets → 4개 데이터셋 (모두 테스트용)
  - GET /api/v1/datasets/{id}/documents → 문서/파싱상태 확인 OK
  - POST /api/v1/retrieval → 청크+유사도 반환 OK (top_k, similarity_threshold)
  - GET /api/v1/chats → 챗 어시스턴트 2개(테스트)
  - ⚠️ 현재 데이터는 전부 **테스트용** → 사용자가 재정리 후 재업로드 예정

## 미확정
- Q3. 문서 접근 권한 범위
- 업로드 파일 형식/용량 제한



## 스캐폴드 구현 상태 (2026-08-21, 동작 검증 완료)
- 클라이언트: `src/lib/ragflow/client.ts` (datasets CRUD, upload, parse, retrieve — `page_size`로 상위 N 청크)
- 업로드 라우트: `src/app/api/documents/route.ts` — 부서 데이터셋 없으면 `dept-<부서명>` 데이터셋 자동 생성 후 업로드
- 파일 형식 허용: pdf/docx/doc/pptx/txt/md/xlsx/xls, 20MB 제한
- 남음: 파싱 상태 갱신(poll/task), 문서 목록 UI, 삭제


## 스캐폴드 구현 상태 (2026-08-21)
- 업로드/목록 API: `src/app/api/documents/route.ts` — GET(목록+파싱 상태 동기화) / POST(multipart 업로드, 첫 문서 시 부서 데이터셋 자동 생성)
- 파싱 상태: `src/lib/ragflow/status.ts` (DONE→done, FAIL/CANCEL→failed, 그 외 parsing) + `normalizeRun` (run 문자열/객체 호환)
- 화면: `src/app/documents/page.tsx` — 드래그/클릭 업로드, 상태 배지, 파싱 중 4초 폴링, 20MB/확장자 제한
- 검증: RAGFlow 라이브 API(중단될 때까지), 승인 도메인 테스트 (`mocks.listDocsFn`)
- 검색 임계값: `RAG_SIMILARITY_THRESHOLD=0.2` 기본
- 남음: 문서 삭제/재업로드 UI, 공통(전사) 데이터셋(Q3), 파싱 실패 사유 표시
