# 런타임 모드 / 티어 정책 / CLI 인증 체계

> 최종 업데이트: 2026-03-04

---

## 1. 런타임 모드 (RuntimeProfile)

환경변수 `AUTOPOLIO_RUNTIME`으로 결정되며, 4가지 모드가 있다.

| 모드 | 값 | 설정 위치 | 용도 |
|------|---|---------|------|
| **Electron** | `electron` | `electron/main.ts`에서 자동 설정 | 데스크톱 앱 |
| **Local** | `local` | `.env` 또는 수동 설정 | 로컬 개발 (`uvicorn` 직접 실행) |
| **Docker** | `docker` | `docker-compose.yml` → `AUTOPOLIO_RUNTIME=docker` | Docker 컨테이너 배포 |
| **External** | `external` | **기본값** (환경변수 미설정 시) | 클라우드/외부 호스팅 배포 |

### 그룹 분류

**로컬 계열** — `electron`, `local`
- `_is_local_runtime()` = `True`
- **모든 티어 제한을 우회** (프로젝트 수, 내보내기 포맷, LLM 호출 수 모두 무제한)
- 사용자가 직접 설치/실행하는 환경이므로 제한 불필요

**서버 계열** — `docker`, `external`
- `_is_local_runtime()` = `False`
- **티어 제한 적용** (FREE/PRO/ENTERPRISE 구분에 따라 기능 제한)

### 기본값 동작

`AUTOPOLIO_RUNTIME` 미설정 시 → `external`(서버 계열) → 티어 제한 적용

```python
# api/config.py
def _get_runtime_profile() -> str:
    return os.environ.get("AUTOPOLIO_RUNTIME", RuntimeProfile.EXTERNAL)
```

---

## 2. 티어(Plan) 정책

### 티어별 제한 (`api/constants/tiers.py`)

| 항목 | FREE | PRO | ENTERPRISE |
|------|------|-----|-----------|
| 프로젝트 수 | 3 | 20 | **무제한** |
| 프로젝트당 레포 수 | 1 | 5 | **무제한** |
| 월간 LLM 호출 수 | 10 | 200 | **무제한** |
| 내보내기 포맷 | md | md, docx, html | md, docx, html, pdf |

### 티어 가드 함수 (`api/dependencies/tier_guards.py`)

| 함수 | 역할 | 초과 시 에러 코드 |
|------|------|----------------|
| `check_project_limit` | 프로젝트 생성 개수 제한 | `PROJECT_LIMIT_REACHED` (403) |
| `check_llm_call_limit` | 월간 LLM 호출 수 제한 | `LLM_LIMIT_REACHED` (403) |
| `check_export_format` | 내보내기 포맷 허용 여부 | `EXPORT_FORMAT_LOCKED` (403) |
| `check_export_format_dep` | 위와 동일 (엔드포인트 핸들러 내부 직접 호출용) | `EXPORT_FORMAT_LOCKED` (403) |

모든 가드 함수는 `_is_local_runtime() == True`이면 **무조건 통과** (검사 자체를 skip).

### 프론트엔드 반영 (`frontend/src/hooks/useFeatureFlags.ts`)

- **Electron**: 모든 export 플래그 `true` (제한 없음)
- **웹**: `usePlanStore`에서 가져온 `tier` 값에 따라 플래그 결정
  - `FREE`: `canExportDocx=false`, `canExportHtml=false`, `canExportPdf=false`
  - `PRO`: `canExportDocx=true`, `canExportHtml=true`, `canExportPdf=false`
  - `ENTERPRISE`: 전부 `true`

### 신규 사용자 기본 티어

- `tier` 컬럼이 `NULL`인 사용자 → `FREE`로 처리 (`tier_guards.py:get_user_with_tier`)

---

## 3. CLI 인증 체계

### 3.1 인증 우선순위 (절대 원칙)

```
1순위: OAuth / 네이티브 로그인  (사용자가 CLI에서 직접 인증)
2순위: .env API 키             (서버 환경변수 폴백)
```

- **OAuth가 있으면 항상 OAuth 사용**, .env 키는 무시
- .env 키는 OAuth가 없을 때만 폴백으로 사용
- **Capacity Fallback**: OAuth로 실행 중 429(rate limit) 에러 → 짧은 타임아웃 → `force_api_key=True`로 .env 키 전환

### 3.2 CLI별 환경변수 매핑 (`api/constants/config.py`)

```python
CLI_SUBPROCESS_ENV_MAP = {
    "claude_code": ("CLAUDE_CODE_API_KEY", "ANTHROPIC_API_KEY"),
    "codex_cli":   ("CODEX_API_KEY",       "OPENAI_API_KEY"),
    "gemini_cli":  ("GEMINI_CLI_API_KEY",   "GEMINI_API_KEY"),
}
# (source .env var, target subprocess env var)
```

`_get_fallback_api_key()`가 이 매핑에서 source → target 순으로 키를 찾아 subprocess에 주입.

### 3.3 OAuth 인증 판별 (`api/services/llm/cli_service.py`)

```python
@staticmethod
def is_oauth_auth_method(auth_data: dict) -> bool:
    if not auth_data.get("loggedIn", False):
        return False
    return auth_data.get("authMethod") != "api_key"
```

- `loggedIn=True` + `authMethod != "api_key"` → OAuth 인증
- `loggedIn=True` + `authMethod == "api_key"` → .env 키 인증 (OAuth 아님)
- `loggedIn=False` → 미인증

이 함수는 `cli_service.py`와 `cli_llm_service.py` 모두에서 공유.

### 3.4 CLI별 인증 상태 확인

| CLI | 명령어 | OAuth 판별 기준 |
|-----|--------|---------------|
| **Claude Code** | `claude auth status --json` | `loggedIn=true` + `authMethod != "api_key"` |
| **Gemini CLI** | `gemini auth status` | 출력에 `email:` 포함 |
| **Codex CLI** | `codex auth status` | 출력에 `Status: Authenticated` 포함 |

### 3.5 Docker 환경 인증 바인드

`docker-compose.yml`에서 호스트 CLI 인증 디렉토리를 컨테이너에 마운트:

```yaml
volumes:
  - ~/.claude:/root/.claude:rw
  - ~/.gemini:/root/.gemini:rw
  - ~/.codex:/root/.codex:rw
```

호스트에서 `claude login` 등으로 인증하면 → Docker 컨테이너에서도 동일한 인증 정보 사용 가능.

### 3.6 프론트엔드 인증 플로우

1. `useCLIAuth` hook → `/api/llm/cli/status` 호출 → 각 CLI 인증 상태 수신
2. `CLIStatusCard`에서 상태 표시: **Connected** / **Not Connected** / **Checking...**
3. 로그인 버튼 클릭:
   - **Electron**: `electronAPI.startCLILogin()` IPC → CLI subprocess로 OAuth 페이지 오픈
   - **Web**: CLI 로그인 불가 (설치 안내만 표시)

### 3.7 Capacity Fallback 플로우

```
OAuth로 CLI 실행
  ↓ 429 에러 (rate limit / capacity exhausted)
  ↓ 감지 패턴: "model_capacity_exhausted", "quota exceeded", "credit balance" 등
  ↓ timeout 단축 (CLI_OAUTH_ATTEMPT_TIMEOUT = 30초)
  ↓ force_api_key=True
  ↓ .env API 키로 재실행
```

---

## 4. 런타임 모드별 동작 비교 요약

| 기능 | Electron | Local | Docker | External |
|------|----------|-------|--------|----------|
| 티어 제한 | 우회 | 우회 | **적용** | **적용** |
| CLI 로그인 | 직접 가능 (IPC) | 직접 가능 | 호스트 바인드 마운트 | 호스트 바인드 마운트 |
| .env 키 | 폴백 | 폴백 | 폴백 | 폴백 |
| 내보내기 포맷 | 전부 허용 | 전부 허용 | 티어 따름 | 티어 따름 |
| 프로젝트 수 | 무제한 | 무제한 | 티어 따름 | 티어 따름 |
| 프론트엔드 감지 | `window.electronAPI` | `/api/llm/config` runtime 값 | `/api/llm/config` runtime 값 | `/api/llm/config` runtime 값 |
| `AUTOPOLIO_RUNTIME` | `electron` (자동) | `local` (수동) | `docker` (docker-compose) | 미설정 (기본값) |

---

## 5. 관련 파일 목록

| 파일 | 역할 |
|------|------|
| `api/constants/enums.py` | `RuntimeProfile`, `UserTier` enum 정의 |
| `api/constants/tiers.py` | `TIER_LIMITS` 티어별 제한 상수 |
| `api/constants/config.py` | `CLI_SUBPROCESS_ENV_MAP`, CLI 설정 상수 |
| `api/config.py` | `_get_runtime_profile()` 런타임 결정 |
| `api/dependencies/tier_guards.py` | 티어 가드 함수 (`_is_local_runtime`, `check_*`) |
| `api/services/llm/cli_service.py` | `is_oauth_auth_method()`, `check_auth_status()` |
| `api/services/llm/cli_llm_service.py` | `_check_oauth_sync()`, `_get_fallback_api_key()` |
| `frontend/src/hooks/useFeatureFlags.ts` | 프론트엔드 기능 플래그 |
| `frontend/src/hooks/useCLIAuth.ts` | CLI 인증 상태 hook |
| `frontend/src/components/CLIStatusCard.tsx` | CLI 상태 UI 카드 |
| `docker-compose.yml` | `AUTOPOLIO_RUNTIME=docker`, CLI 볼륨 마운트 |
