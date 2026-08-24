# Dept-Agent (부서장 페르소나 에이전트)

사용자가 웹에서 로그인하여 업무 질문을 하고, 만든 자료를 업로드하면,
**부서장 페르소나 에이전트**가 업무적 판단으로 검증·조언·아이디어를 제공하는 시스템.

## 현재 상태 (2026-08-21)
- 설계 문서 완성 + **스캐폴드 구현 완료 (동작 검증됨)**
- 앱: `app/` (Next.js 16, App Router, TypeScript, Drizzle+SQLite)
- 검증 완료: 회원가입(도메인 화이트리스트)→관리자 승인→로그인(세션)→부서→대화→**SSE 스트리밍**(pi-ai→LiteLLM)→RAGFlow 검색·인용
- 확정 사항: `docs/004-인터뷰-로그.md` / 기능 분해: `docs/features/*.md`

## 구조
```
[웹(Next.js)] → [세션/권한] → [에이전트(pi-ai + 부서 페르소나)]
                                    ├─ RAGFlow(부서=데이터셋, 검색·인용)
                                    └─ LiteLLM → DeepSeek
```

## 문서
| 문서 | 내용 |
|---|---|
| docs/000-요구사항.md | 요구사항 |
| docs/001-아키텍처.md | 아키텍처 |
| docs/002-폴더-구조.md | 저장소 구조 |
| docs/003-데이터-모델.md | DB 스키마 |
| docs/004-인터뷰-로그.md | 인터뷰·결정 기록 |
| docs/features/*.md | 기능별 구현 지시서 |

## 앱 실행 (app/)
```bash
cd app
npm install
cp .env.example .env    # RAGFLOW_API_KEY, LLM_BASE_URL, LLM_API_KEY 설정
npm run db:push         # 스키마 생성
npm run db:seed         # 부서 시드 (보험금심사기획, 계리)
npm run dev            # http://localhost:3000
```
- 첫 가입자가 자동 관리자(active), 이후 가입자는 관리자 승인(pending)
- 부서↔RAGFlow 데이터셋: 첫 문서 업로드 시 `dept-<부서명>` 데이터셋 자동 생성·연결
- 배포: `docker build` → Node 22 + SQLite 볼륨(`DATA_DIR=/app/data`) — `docker-compose.yml`(루트) 예시 제공, RAGFlow는 별도 서비스
- 테스트: `npm test` (Vitest, 실 SQLite + 마이그레이션, LLM/RAG 목 — 24건)

### 스크립트
| 명령 | 역할 |
|---|---|
| `npm run db:push` | drizzle 스키마 반영 |
| `npm run db:seed` | 부서 시드 |
| `npm run db:generate` | 스키마→마이그레이션 생성 (`app/drizzle/`) |
| `npm test` / `npm run test:watch` | Vitest 통합 테스트 |
| `npm run lint` / `tsc --noEmit` / `build` | 정적 검증 / 타입 / 프로덕션 빌드(standalone) |
