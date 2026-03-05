# 세션 보고서 — 2026-03-05

## 1. 사용자 보고 오류

### 오류 1: Codex CLI — Electron에서 "연결 안됨" 표시, 동작 안 함
- **증상**: Electron 앱 설정 > CLI Tools 탭에서 Codex CLI가 "연결 안됨(Not Configured)" 뱃지 표시
- **실제 상태**: `~/.codex/auth.json`에 API 키로 인증되어 있고, `codex login status`도 정상
- **원인**: Electron의 `CLIToolManager.testCLI()`가 `auth_status` 필드를 반환하지 않음. 프론트엔드 auto-test에서 `success: false`이면 무조건 `auth_failed`로 처리. OpenAI 할당량 초과(`Quota exceeded`) 에러가 인증 실패로 오분류됨
- **백엔드(Docker) API 응답**: `auth_status: "authenticated"` 정상 반환 — 백엔드는 과금 에러와 인증 에러를 올바르게 구분함
- **Electron 응답**: `auth_status` 필드 자체가 없음 → 프론트엔드가 `success ? 'authenticated' : 'auth_failed'`로 판단 → `auth_failed`

### 오류 2: Claude Code CLI — Electron에서 "연결 안됨" 표시
- **증상**: Electron 앱 설정 > CLI Tools 탭에서 Claude Code CLI가 "연결 안됨(Not Configured)" 뱃지 표시
- **실제 상태**: `claude auth status`로 확인하면 Anthropic API 키로 인증됨
- **원인**: Codex와 동일 — Anthropic 크레딧 부족(`Credit balance is too low`) 에러가 인증 실패로 오분류됨
- **추가 원인**: Claude Code 세션 내에서 Electron을 실행하면 `CLAUDECODE` 환경변수로 인해 "nested session" 에러 발생 가능 (단, `env-utils.ts`에서 이미 strip 처리 코드 존재)

### 오류 3: Claude Code & Codex — "Failed to execute CLI command" 에러 메시지
- **증상**: Electron에서 Claude Code, Codex CLI 테스트 시 "Failed to execute CLI command" 에러 메시지 표시
- **원인**:
  - Claude Code: 크레딧 부족 시 exit non-zero → `executeCLI`가 throw → catch 블록에서 `message: "Failed to run Claude Code CLI"`로 고정 메시지 반환 (실제 에러 내용 미노출)
  - Codex CLI: Quota exceeded 시 exit 1 → 동일하게 고정 메시지 반환. stdout에 JSONL로 출력된 `{"type":"error","message":"Quota exceeded..."}`를 파싱하지 않음
- **핵심**: 사용자에게 "인증 실패"인지 "과금 문제"인지 구분 안 됨. 실제 에러 메시지(Quota exceeded, Credit balance too low)가 UI에 전달되지 않음

---

## 2. CLI 실제 테스트 결과 (터미널 직접 실행)

| CLI | 설치 | 인증 | 실행 결과 | 에러 내용 |
|-----|------|------|---------|---------|
| Claude Code | v2.1.69 | API키(`~/.local/bin/claude`) | 실패 (exit non-zero) | `Credit balance is too low` |
| Codex CLI | v0.106.0 | API키(`~/.codex/auth.json`) | 실패 (exit 1) | `Quota exceeded. Check your plan and billing details.` |
| Gemini CLI | v0.31.0 | OAuth 인증 | **성공** (`OK` 응답) | 없음 |

### 백엔드 API 테스트 (`/api/llm/cli/test/{cli_type}`)

| CLI | success | auth_status | message |
|-----|---------|-------------|---------|
| claude_code | false | **authenticated** | Insufficient credit balance |
| codex_cli | false | **authenticated** | Quota exceeded |
| gemini_cli | true | authenticated | OK |

→ 백엔드는 과금 에러를 올바르게 `auth_status: "authenticated"`로 분류하지만, Electron은 이 구분이 없었음

---

## 3. 수정한 내용 (커밋되지 않음)

### 수정 파일 2개 (이번 세션)

#### 3.1 `frontend/electron/types/cli.ts`
- `CLITestResult` 인터페이스에 `auth_status?: 'authenticated' | 'auth_failed' | 'unknown'` 필드 추가
- 백엔드 API의 응답 구조와 일치시킴

#### 3.2 `frontend/electron/services/cli-tool-manager.ts`

**`testCLI()` 메서드 수정:**

1. **성공 경로**: `auth_status: 'authenticated'` 항상 반환
2. **Codex JSONL 에러 감지**: exit 0이지만 stdout에 `{"type":"error","message":"..."}` 포함 시 `success: false` + 실제 에러 메시지 반환
3. **catch 블록 개선**:
   - `error.stdout`, `error.stderr` 모두 검사하여 과금 에러 여부 판별
   - 과금 키워드(`quota|billing|credit|balance|insufficient|exceeded|overdue|payment`) 매칭 시 `auth_status: 'authenticated'`
   - 인증 에러(`unauthorized|invalid.*key|401`) 시만 `auth_status: 'auth_failed'`
   - 그 외 에러(timeout, network 등)는 `auth_status: 'authenticated'` (설치되어 인증된 CLI의 런타임 에러)
   - 고정 메시지 대신 실제 에러 메시지(`jsonlError || errorMessage`)를 `message`와 `output`에 전달

**`parseCodexJsonl()` 메서드 수정:**
- `{"type":"error","message":"..."}` JSONL 라인 파싱 추가
- 반환 타입에 `error?: string` 추가

**`parseTestOutput()` 메서드:**
- 반환 타입을 `{ content: string; tokens: number; error?: string }`로 변경

### 아직 안 한 것
- **TypeScript → JavaScript 컴파일 안 됨**: `tsc -p electron/tsconfig.json`으로 `.ts` → `.js` 컴파일 필요. Electron은 `.js`를 실행하므로 컴파일하지 않으면 수정 사항이 반영되지 않음
- **`cli-tool-manager.js` 업데이트 안 됨**: 현재 `.js` 파일은 이전 버전 코드

---

## 4. 기존 미커밋 변경사항 (이전 세션에서 작업된 것)

총 61개 파일, +2128/-297 라인 변경. 주요 내용:

### 백엔드 (api/)
- **constants 중앙화**: `enums.py`(StrEnum), `config.py`(LLM/CLI 설정 상수) 신규
- **CLI 인증 체계 구현**: `cli_service.py` (+440줄) — 3개 CLI 인증 상태 확인, 네이티브 OAuth 로그인, 로그아웃
- **CLI LLM 서비스 확장**: `cli_llm_service.py` (+312줄) — CLI별 subprocess 실행, OAuth 우선순위 정책, capacity fallback
- **LLM 라우터 확장**: `llm.py` (+154줄) — CLI 테스트/인증/연결 엔드포인트
- **사용자 모델 확장**: `user.py` — API 키 필드 추가
- **DB 설정**: `database.py` — 런타임 모드 감지

### 프론트엔드 (frontend/src/)
- **LLM 설정 UI 대폭 확장**: `LLMSection/index.tsx` (+146줄), `CLITab.tsx` (+43줄)
- **CLIStatusCard 확장**: (+158줄) — 네이티브 로그인 버튼, API 키 입력, 인증 상태 뱃지
- **API 클라이언트**: `llm.ts` (+36줄) — CLI 테스트/인증/연결 API
- **Electron 타입/API**: `electron.ts` (+106줄) — CLI 인증, 프로세스 관리
- **상수/열거형**: `enums.ts`, `providers.ts` — Provider 메타데이터
- **i18n**: 한국어/영어 번역 추가
- **Feature Flags**: `useFeatureFlags.ts` 확장

### Electron (frontend/electron/)
- **preload.js**: CLI 인증 IPC 핸들러 추가 (+30줄)
- **main.ts/js**: CLI 인증 IPC 등록
- **env-utils.ts**: `CLAUDECODE` 환경변수 strip (중첩 세션 방지)
- **cli-detection-strategies.ts**: PowerShell 감지, 에러 분류 개선

### 기타
- **docker-compose.yml**: 환경변수 추가
- **start-dev.sh/bat**: 개발 스크립트 업데이트
- **tests/api/conftest.py**: 테스트 설정 추가
- **nginx.conf**: 프록시 설정 추가

---

## 5. 남은 작업

1. **TypeScript 컴파일**: `cd frontend && npx tsc -p electron/tsconfig.json` 실행하여 `.ts` → `.js` 변환
2. **Electron에서 실제 동작 확인**: 컴파일 후 Electron 재시작하여 Claude Code/Codex CLI 뱃지가 "연결됨(인증됨)"으로 표시되는지 확인
3. **에러 메시지 UI 전달 확인**: "Failed to execute CLI command" 대신 "Quota exceeded" / "Credit balance too low" 같은 실제 메시지가 표시되는지 확인
4. **과금 문제 해결**: Anthropic 크레딧 충전 또는 OpenAI 할당량 확인 (코드 문제 아님, 계정 문제)
5. **전체 변경사항 커밋/푸시**: 61개 파일의 미커밋 변경사항 정리
