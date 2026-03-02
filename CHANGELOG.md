# Changelog

All notable changes to Autopolio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.22.1] - 2026-03-02

### Changed
- **Constants/Enum 중앙화 리팩토링**
  - 백엔드: `api/constants/` 모듈 신규 생성 (StrEnum 기반)
    - `JobStatus`, `LLMProvider`, `CLIType`, `DocumentFormat`, `ProjectType`, `ProjectStatus`, `EmploymentType`, `GraduationStatus`, `ActivityType`, `PublicationType`, `SummaryStyle` 열거형
    - `LLM_MAX_TOKENS`, `DEFAULT_MODELS`, `CLI_TIMEOUT_SECONDS` 설정 상수
  - 프론트엔드: `frontend/src/constants/` 모듈 신규 생성 (`as const` 패턴)
    - `LLM_PROVIDERS`, `CLI_TYPES`, `AI_MODES`, `JOB_STATUS`, `DOCUMENT_FORMATS` 상수 객체
    - `STORAGE_KEYS` localStorage 키 중앙화
    - 파생 타입: `LLMProviderType`, `CLIType`, `AIMode`, `JobStatusType`, `DocumentFormatType`
  - 백엔드 25+ 파일, 프론트엔드 15+ 파일의 매직 스트링을 상수/열거형으로 교체
  - StrEnum/`as const` 패턴으로 기존 문자열 비교와 하위 호환성 유지

### Fixed
- **Codex CLI JSONL 파싱 수정**
  - 백엔드 `cli_llm_service.py`: `_parse_codex_jsonl()` 메서드 추가 (JSONL 출력 파싱)
  - Electron `cli-tool-manager.ts`: Codex CLI 명령어 구문 수정 (`exec --json`) 및 JSONL 파서 추가
  - Electron 설정에서 Codex CLI 연결 상태 정상 표시 (녹색 키 아이콘)
- **Codex CLI API 키 조회 오류** (`github_jobs.py`)
  - CLI 모드 제외 튜플에 `codex_cli` 누락 수정
- **BundleDialog 모달 오버플로우** (`BundleDialog.tsx`)
  - 긴 레포지토리 이름이 모달 너비를 벗어나지 않도록 CSS 수정

---

## [1.22] - 2026-02-28

### Fixed
- **파이프라인 문서 생성 FK 오류 수정** (`pipeline_template_step.py`)
  - 정적 템플릿(ID 9101+) 사용 시 `generated_documents.template_id` FK 제약조건 위반으로 Step 7 실패
  - 정적 템플릿일 경우 `template_id=None`으로 설정하여 FK 위반 방지
- **파이프라인 백그라운드 태스크 에러 로깅 개선** (`pipeline.py`)
  - `asyncio.create_task` done callback에서 예외를 `logger.error`로 출력
  - 기존에는 예외가 무시되어 디버깅 불가능했음
- **AnalysisJobStatus schema 수정** (`schemas/github.py`)
  - `project_id`를 `Optional[int]`로 변경 (파이프라인 작업은 project_id가 None)
  - `GET /api/github/active-analyses` Pydantic validation 오류 해결
- **Local 모드 키 관리 UI 표시** (`LLMProviderCard`, `CLIStatusCard`)
  - `isElectronApp || isLocalMode` 조건으로 API 키 입력/CLI 설정 표시
- **API/CLI 인증 에러 메시지 전파** (`authMessage` prop)
  - LLMProviderCard에서 인증 상태 메시지를 부모로 전파
- **시드 데이터 degree 값 소문자 수정** (`seed_sample_data.py`)
  - `Bachelor` → `bachelor` 등 프론트엔드 필터와 일치하도록 수정

### Added
- **CLI 멀티레포 통합 요약 지원** (`llm_generation.py`, `cli_llm_service.py`)
  - `generate_multi_repo_summary_llm()` 공유 함수로 추출
  - `CLILLMService`에 `generate_multi_repo_summary()` 메서드 추가
  - CLI 모드(Claude Code/Gemini CLI)에서도 멀티레포 통합 서사 생성 가능
  - 기존에는 `LLMService`에만 존재하여 CLI 모드에서 `AttributeError` 발생
- **멀티레포 통합 요약 단위 테스트** (`test_multi_repo_summary.py`)
  - 9개 테스트 케이스 (공유 함수 직접 호출, LLMService/CLILLMService 위임 등)
- **교육이력(Trainings) 시드 데이터 4건** (`seed_sample_data.py`)
  - 부스트캠프, 삼성 멀티캠퍼스, FastCampus, GDG Workshop
- **Credential E2E 테스트** (`frontend/e2e/credentials.spec.ts`)
  - 학력/교육이력 데이터 렌더링 검증
- **대시보드 커리어 히트맵 연도 스크롤** (`CareerHeatmap.tsx`)
  - 연도 > 7개일 때 위/아래 버튼 + 스크롤 가능한 연도 사이드바

### Changed
- **LLMProviderCard/CLIStatusCard UI 통일**
  - Auth badge (인증 상태 표시), inline key input, 아이콘 버튼 패턴 적용
  - 일관된 카드 레이아웃 및 상호작용 패턴
- **프론트엔드 컴포넌트 개선**
  - EditableList/EditableStructuredList: 편집 UX 개선
  - ErrorBoundary: 에러 표시 로직 리팩터링
  - KanbanBoard: 칸반 보드 개선
  - FullScreenDialog: 전체화면 다이얼로그 개선
  - Pipeline 페이지: 진행 표시 개선
  - Documents Preview: 문서 미리보기 개선
- **i18n 번역 추가** (한국어/영어)
  - common, documents, github, pipeline, projects 번역 키 추가

---

## [1.20] - 2026-02-24

### Added
- **AI Code Review 워크플로우** (`ai-review.yml`)
  - PR 오픈/업데이트 시 Gemini 2.0 Flash API로 자동 코드 리뷰
  - 리뷰 항목: 버그/로직 오류, 보안 취약점, 성능 이슈, 코드 품질
  - lock 파일, node_modules, dist, .min.js 등 비리뷰 파일 자동 제외
  - diff 200KB 제한 (초과 시 truncate)
  - PR 댓글로 리뷰 결과 게시 (마커 기반 기존 댓글 업데이트, 중복 방지)
  - `GEMINI_API_KEY` 미설정 시 graceful skip (기존 virustotal.yml 패턴)
  - PR 번호 기반 concurrency — 같은 PR의 이전 리뷰 자동 취소

---

## [1.19] - 2026-02-23

### Added
- **GitHub Actions CI/CD 인프라** (`.github/`)
  - **CI 테스트 파이프라인** (`ci.yml`): pytest API 테스트 + Playwright E2E 테스트 (Docker 기반)
  - **코드 품질 검사** (`lint.yml`): Python ruff 린트/포맷 + TypeScript tsc 타입 체크
  - **보안 스캔** (`security.yml`): CodeQL (JS/TS + Python) + Bandit 보안 분석, 주간 자동 실행
  - **릴리즈 자동화** (`release.yml`): 태그 기반 Windows exe + macOS dmg 빌드, GitHub Release 생성, SHA256 체크섬
  - **베타 릴리즈** (`beta-release.yml`): `v*-beta.*` / `v*-rc.*` 태그 기반 프리릴리즈
  - **릴리즈 준비** (`prepare-release.yml`): 버전 범프, CHANGELOG 생성, 릴리즈 브랜치/PR 자동 생성
  - **VirusTotal 스캔** (`virustotal.yml`): 릴리즈 바이너리 악성코드 스캔 + 결과 릴리즈 노트 첨부
  - **PR 자동 라벨링** (`pr-labeler.yml` + `labeler.yml`): 변경 파일 경로 기반 자동 라벨 (api, frontend, electron, tests, ci, docs, docker, dependencies)
  - **이슈 자동 라벨링** (`issue-auto-label.yml`): 이슈 제목/본문 키워드 기반 스마트 라벨링
  - **Stale 관리** (`stale.yml`): 60일 비활성 이슈/PR 자동 경고, 14일 후 자동 종료
  - **신규 기여자 환영** (`welcome.yml`): 첫 PR/이슈 작성자에게 환영 메시지
  - **이슈 템플릿**: 버그 리포트 (`bug_report.yml`), 기능 요청 (`feature_request.yml`) 구조화된 양식

- **테스트 실행 스크립트** (`tests/scripts/`)
  - `run-all.{sh,bat}`: 전체 테스트 (Docker 확인 → pytest → Playwright) 마스터 오케스트레이터
  - `run-api-tests.{sh,bat}`: API 테스트만 실행 (venv 자동 생성, 인자 전달)
  - `run-e2e-tests.{sh,bat}`: E2E 테스트만 실행 (Playwright chromium 자동 설치)
  - `setup-test-db.sh`: 테스트 DB 초기화 (백업 → 테이블 생성 → 템플릿 초기화)
  - `generate-report.sh`: pytest HTML 리포트 + Playwright 리포트 생성
  - Windows (`.bat`) + Unix (`.sh`) 크로스 플랫폼 지원

- **Electron Python 런타임 번들러** (`frontend/scripts/download-python.cjs`)
  - python-build-standalone에서 사전 빌드된 Python 3.11 다운로드
  - 크로스 플랫폼 지원 (win32-x64, darwin-arm64, darwin-x64, linux-x64)
  - pyproject.toml에서 의존성 자동 추출 및 설치
  - site-packages 스트리핑 (테스트, 문서, __pycache__ 제거)로 번들 크기 최적화

### Housekeeping
- **임시 파일 대규모 정리**: 디버그 JSON 35개, 테스트 스크린샷 34개, tmp 파일 1개 삭제
- **.gitignore 강화**
  - `frontend/dist-electron/`, `frontend/release-build/`, `frontend/release-new/` 추가
  - 루트 레벨 디버그 패턴: `/*.png`, `/*_temp.json`, `/*_check.json`, `/*_result.json`, `/docker_*.json`, `/electron_*.json`, `/openapi_*.json`, `/verify_*.json` 등
  - `*.tmp` 패턴 추가

---

## [1.18] - 2026-02-23

### Security
- **Electron .pyc bytecode packaging** - `.py` source files are no longer included in Electron builds; only compiled `.pyc` bytecode is packaged
- **Conditional endpoint registration** - `/api/llm/keys` (decrypted API key retrieval) is now only registered when `AUTOPOLIO_RUNTIME=electron`, preventing exposure in Web/Docker deployments

### Added
- `frontend/scripts/prepare-electron-api.py` - Build script that copies `api/`, `config/`, `data/` to `_electron_api/`, compiles to `.pyc`, and removes `.py` sources
- `api/routers/llm_keys.py` - Separated `/keys` endpoint for Electron-only registration
- `AUTOPOLIO_RUNTIME` environment variable for runtime profile detection
- `prepare:electron-api` npm script in build pipeline

### Changed
- `electron-builder.json` - `extraResources` now reads from `_electron_api/` (precompiled) instead of `../api` (raw source)
- `python-env-manager.ts` - `findBackendPath()` now checks for `main.pyc` in addition to `main.py`
- `backend-manager.ts` - Passes `AUTOPOLIO_RUNTIME=electron` to backend process
- `electron:build` script now runs `prepare:electron-api` automatically before building

---

## [1.17] - 2026-02-13

### Added
- **Multi-Repository Support**
  - `ProjectRepository` model (`api/models/project_repository.py`) for 1:N project-to-repo mapping
  - `Project.repo_analyses` relationship (1:N, replaces old 1:1 `repo_analysis`)
  - `Project.repo_analysis` backward-compatible property (returns primary/first analysis)
  - `RepoAnalysis.project_repository_id` FK linking analysis to specific repository
  - Migration script: `python -m api.migrations.add_multi_repo`
  - Frontend `ProjectFormFields` supports multi-repo via `onAddRepository` callbacks
  - `user_data_collector.py` updated with `selectinload(Project.repositories)`

---

## [1.16] - 2026-02-08

### Changed
- **LLM Analysis Parallelization**
  - Steps 5.2 (key_tasks) + 5.3 (detailed_content) now run via `asyncio.gather()` in both sync and background analysis paths
  - Expected ~15s speedup per analysis in CLI mode
  - AI summary (5.4) correctly runs after parallel tasks complete (depends on key_tasks)
  - `return_exceptions=True` in background runner for error isolation

- **CLI LLM Service Improvements**
  - Enhanced Windows npm global path resolution (`.cmd` file priority)
  - stdin-based prompt delivery for long prompts
  - Improved timeout and logging

### Added
- **Parallelization Unit Tests** (`tests/test_parallel_verify.py`)
  - Concurrent execution verification (2x2s tasks complete in ~2s, not 4s)
  - Error isolation test (one failure doesn't block the other)
  - Sequential dependency test (AI summary waits for key_tasks)
  - Background runner pattern test with `return_exceptions=True`

### Housekeeping
- Deleted stray `frontend/python-env-manager.js` duplicate
- Updated `.gitignore`: added `*.ps1`, `extracted_asar/`, `.claude/`, `frontend/release/`, `frontend/python-runtime/`, `frontend/electron/services/*.js`, `backend.spec`, `backend_entry.py`, `test-*.png`

---

## [1.15] - 2026-02-07

### Added
- **GitHub CLI Authentication in Electron**
  - `gh` CLI detection with multi-path search (PATH, known locations per platform)
  - Device Code OAuth flow (`gh auth login --web`)
  - Auto-extract device code and open browser
  - Token sync from CLI to backend for API operations
  - `github-cli:status`, `github-cli:start-auth`, `github-cli:cancel-auth`, `github-cli:logout`, `github-cli:get-token` IPC handlers

- **GitHub CLI Repository Listing**
  - Multi-endpoint aggregation matching backend's 5-step approach:
    1. `/user/repos` (owner + collaborator + org member)
    2. `/users/{username}/repos` (public profile)
    3. `/user/orgs` → `/orgs/{org}/repos` (org repos)
    4. `/search/repositories` (search fallback)
    5. `/user/memberships/orgs` → `/orgs/{org}/repos` (membership-based)
  - Deduplication by repo ID
  - `github-cli:list-repos` IPC handler

- **Bundled Python Environment Manager**
  - `PythonEnvManager` class for managing bundled/system Python in Electron
  - Cross-platform support (win32, darwin, linux)
  - Bundled Python detection for packaged apps
  - System Python fallback with version validation

### Changed
- **RepoSelector Dual Mode** (Web + Electron)
  - Electron: CLI auth check → gh CLI token → backend token sync
  - Web: Backend OAuth token check (existing flow)
  - Priority: Backend API when token synced, CLI fallback in Electron
  - User ID merge handling when GitHub account linked to different user

- **Electron Main Process Enhancements**
  - CLI status prefetching at app startup with caching
  - Backend process management: PID tracking, auto-restart (max 3), port cleanup
  - Custom protocol handler (`autopolio://`) for OAuth callbacks

---

## [1.14] - 2026-02-05

### Added
- **Credentials Management System**
  - Certifications, Awards, Education, Publications, Volunteer Activities CRUD
  - `credentials` router with dedicated API endpoints
  - OAuth Identity management (`oauth_identities` table)
  - Credentials included in platform template rendering

- **Lookup / Autocomplete Service**
  - University name autocomplete (Korean universities)
  - Certification name autocomplete
  - Issuing organization autocomplete
  - `GET /api/lookup/autocomplete` endpoint

- **File Attachment Service**
  - `AttachmentService` for file upload/management
  - File storage in `data/attachments/` directory

- **CRUD Factory Pattern**
  - `crud_factory.py` for generating standard CRUD routers
  - Reduces boilerplate across knowledge management endpoints

### Changed
- **Backend Service Reorganization**
  - Services split into modular directories: `analysis/`, `core/`, `document/`, `docx/`, `export/`, `github/`, `llm/`, `oauth/`, `pipeline/`, `platform/`, `report/`, `template/`, `user_data/`
  - Routers reorganized: `github/` (6 sub-routers), `documents/` (3 sub-routers), `knowledge/` (4 sub-routers + CRUD factory)
  - `TechnologyDetectionService` extracted from `GitHubService`
  - `ReportBaseService` extracted for common report functionality

- **Frontend Refactoring**
  - `ProjectDetail` split into tab components
  - `LLMSection` split into modular components
  - `useAutocomplete` hook extracted as reusable
  - `SelectableTile` reusable UI component
  - Settings page reorganized into sections

---

## [1.13] - 2026-02-03

### Added
- **Background Analysis Job System**
  - `POST /api/github/analyze-background` for non-blocking analysis
  - `GET /api/github/analysis-job/{task_id}` for progress polling
  - `DELETE /api/github/analysis-job/{task_id}` for cancellation
  - Step-by-step progress tracking with percentage updates
  - Background analysis progress UI in frontend

- **Word Document Generator (Korean Resume)**
  - Specialized DOCX generator for Korean resume templates
  - `DocxGenerator`, `DocxStyles`, `DocxTableBuilder` classes
  - Professional formatting with table layouts

- **General Templates**
  - Career resume template (Word/Markdown)
  - Notion template
  - Platform-specific template filtering

- **User Profile Management**
  - Birthdate and career start year fields
  - Generation options for customizing LLM output
  - Profile data included in template rendering

### Changed
- **E2E Test Infrastructure**
  - Comprehensive Playwright test suite added
  - `createApiContext` helper for test isolation
  - Tests for knowledge, GitHub, platforms, documents, flows
  - Test data fixtures and cleanup

- **Platform Template Improvements**
  - Birthdate and career fields in template rendering
  - Personal projects handled as capabilities (no company)
  - Logo configurations per platform
  - Improved sample data for previews

- **LLM Service Enhancements**
  - Multilingual support (language parameter in all generation)
  - Analysis language initialized from app settings
  - Improved prompt engineering for Korean/English output

### Fixed
- Achievement mapping in pipeline and template export
- Date picker visibility in dark mode
- Render-phase state update warning in UsageDisplay
- DetailedCommit schema fields made optional for backward compatibility
- GitHub OAuth callback and user validation

---

## [1.12] - 2026-02-01

### Added
- **Background Analysis Progress UI**
  - Real-time progress bar for repository analysis
  - Step indicators showing current analysis phase
  - Cancel button for in-progress analyses

- **Owner Filter in Repo Selector**
  - Filter repos by: All, Owned, Forked, Contributed
  - Virtual list (TanStack Virtual) for performance with large repo lists

- **Project Batch Operations**
  - `DELETE /api/knowledge/projects/batch` for bulk deletion
  - Multi-select with SelectableTile components

- **Database Indexes**
  - Added indexes on `projects.user_id`, `projects.company_id`, `projects.is_analyzed`
  - Added indexes on `repo_analyses.project_id`, `project_achievements.project_id`
  - Performance improvement for common queries

### Changed
- **Backend Logging**
  - All `print()` statements converted to `logging` module
  - Korean log messages converted to English for consistency
  - Module-specific loggers throughout

- **Collapsible Document Menu**
  - Document sidebar with collapsible sections
  - Company field added to project detail view

- **Platform Template Auto-Initialization**
  - System templates auto-refresh on server startup
  - Template initialization service for first-run setup

### Fixed
- Pipeline UI improvements and document deletion refresh
- Selection flash animation improvements
- Date range validation for start/end dates

---

## [1.11] - 2026-01-30

### Added
- **Resume Platform Templates**
  - Saramin: Traditional blue theme resume form
  - Remember: Modern gradient timeline style
  - Jumpit: Developer-friendly green card style
  - Wanted: Professional listing format

- **HTML Rendering & Export**
  - Mustache template syntax (`{{field}}`, `{{#section}}...{{/section}}`)
  - User data auto-fill (projects, tech stack, achievements)
  - HTML, Markdown, Word (DOCX) export formats
  - Real-time iframe preview with fullscreen mode
  - Print functionality

### New API Endpoints
- `GET /api/platforms`: Template list
- `POST /api/platforms/init-system`: System template initialization
- `POST /api/platforms/{id}/render`: Data rendering
- `GET /api/platforms/{id}/export/html|md|docx`: Export

### New Model
- `PlatformTemplate`: Platform template storage (HTML, CSS, field mappings)

---

## [1.10] - 2026-01-30

### Added
- **Extended Analysis Features**
  - Contributor-specific analysis (user contribution breakdown)
  - Conventional Commit parsing (feat, fix, refactor, docs, test auto-classification)
  - Work area auto-detection (frontend, backend, tests, devops, docs, database, config)
  - Code quality metrics (file size, test ratio, doc ratio, language distribution)

### New API Endpoints
- `GET /api/github/contributors/{project_id}`: All contributors list
- `GET /api/github/contributor-analysis/{project_id}`: User-specific detailed analysis
- `GET /api/github/code-quality/{project_id}`: Code quality metrics
- `GET /api/github/detailed-commits/{project_id}`: Conventional Commit parsed commits

### New Model
- `ContributorAnalysis`: Per-contributor analysis results with composite index

---

## [1.9] - 2026-01-30

### Changed
- **Analysis Performance (60-70% Time Reduction)**
  - Tech stack detection parallelized: 40+ files checked concurrently (30s → 3-5s)
  - Commit detail queries parallelized: 50 commits concurrent fetch (40s → 5-8s)
  - LLM calls parallelized: 3 concurrent calls (30s → 10-15s)
  - Pipeline project processing parallelized with concurrency limits

- **GitHub API Deduplication**
  - Session-level caching for `get_repo_languages()`
  - Eliminated redundant API calls during same-repo analysis

### Added
- **Concurrency Limit Constants**
  - `MAX_CONCURRENT_FILE_CHECKS = 15`
  - `MAX_CONCURRENT_COMMIT_DETAILS = 10`
  - `MAX_CONCURRENT_LLM_CALLS = 3`
  - `MAX_CONCURRENT_GITHUB_ANALYSIS = 3`
  - `MAX_CONCURRENT_LLM_SUMMARY = 2`

### Performance
- Single repo analysis: 2-3min → 40-60s
- 5 project analysis: 10-15min → 3-5min

---

## [1.8] - 2026-01-29

### Fixed
- **CLI Analysis Not Working**: Fixed CLI-based project analysis that was failing due to Windows command-line length limits
  - Root cause: Prompts (2000~5000 chars) were passed as command-line arguments (`-p <prompt>`)
  - Solution: Changed to stdin-based prompt delivery (`-p -` with `input=prompt_bytes`)
  - Windows command-line limit (~8191 chars) is now bypassed

### Changed
- **CLILLMService Improvements**
  - `_build_args()`: Now uses `-p -` to indicate stdin input
  - `subprocess.run()`: Added `input=prompt_bytes` parameter for stdin delivery
  - Timeout increased from 120s to 180s per CLI call
  - Enhanced logging: prompt length (chars/bytes), CLI command, return code
  - JSON parse failures now log raw output preview for debugging

### Added
- **CLILLMProvider Wrapper Class**: Provides LLMService-compatible interface for CLI tools
  - `provider.generate()` method matching API LLMService
  - System prompt prepending support
  - `provider_name` attribute for tracking (e.g., `cli:claude_code`)
- **Test Suite** (`test_cli.py`)
  - Short prompt test
  - Long prompt test (9000+ chars) - validates stdin fix
  - Special characters test (Korean, symbols)
  - Realistic analysis prompt test

---

## [1.7] - 2026-01-27

### Added
- **Web LLM Provider Selection**
  - Select between `.env` configured LLM providers in web mode
  - "Currently Selected" card showing provider name, model, test button
  - Read-only API key display (server-provided keys only)

### Changed
- **Platform-specific Smart Defaults**
  - Web: Default to Gemini provider, API mode
  - Electron: Auto-detect Claude Code / Gemini CLI on first run
  - Electron: Prefer Claude Code if installed, fallback to Gemini CLI
  - Electron: Auto-switch to API mode if no CLI installed
  - `_defaultsApplied` flag ensures auto-detection runs only once

### Modified Files
- `frontend/src/stores/appStore.ts`: Platform-specific defaults, CLI auto-detection
- `frontend/src/pages/Settings/sections/LLMSection.tsx`: Web provider selection UI

---

## [1.6] - 2026-01-27

### Added
- **Project Export Feature**
  - Export analyzed projects to Markdown/Word format
  - PROJECT_PERFORMANCE_SUMMARY.md style reports
    - "Key Tasks" and "Achievements" per project
    - Overview statistics table
    - Auto-generated table of contents
  - PROJECTS.md style simple list export
  - Real-time preview before export

### New API Endpoints
- `GET /api/documents/export/preview`: Export preview
- `POST /api/documents/export/markdown`: Markdown export
- `POST /api/documents/export/docx`: Word document export
- `GET /api/documents/export/download/{filename}`: Download exported file

### New Components
- `ExportDialog`: Export options dialog
- `RadioGroup`: Radix UI based radio group

### New Services
- `ExportService`: Export report generation service

### i18n
- Added Korean/English translations for export feature

---

## [1.5] - 2026-01-27

### Added
- **Full i18n Support**
  - react-i18next based multilingual system
  - Complete Korean/English UI translation
  - Settings page, GitHub settings page fully translated
  - Analysis result editing UI i18n support

- **Analysis Result Editing**
  - User can edit LLM-generated analysis content
  - Changes saved to DB and persisted
  - Analysis help tooltips added

- **Project UI Improvements**
  - "In Progress" project checkbox
  - shields.io style technology badges
  - Settings moved to sidebar bottom
  - Date display issues fixed

### Changed
- **Electron OAuth Improvements**
  - `autopolio://oauth-callback` custom protocol handler
  - Multi-port OAuth callback support (3035, 3000, 5174, 5199, etc.)
  - Windows .cmd execution quote handling fixed

- **Backend Stability**
  - Auto-restart on backend crash (max 3 times)
  - `--reload-dir api` option to reduce WatchFiles load
  - Connection error detection and user-friendly messages
  - Added `backendError` state to appStore

### Fixed
- Windows shell execution issues
- OAuth multi-port detection

---

## [1.4] - 2026-01-22

### Added
- **Electron Desktop App Support**
  - Windows exe (NSIS installer)
  - macOS dmg
  - Linux AppImage
  - `electron-builder` for packaging
  - `electron-serve` for static file serving (app:// protocol)
  - Vite `base: './'` for relative path support

- **Electron Preload Script**
  - CommonJS format required (ES Module not supported)
  - `contextBridge.exposeInMainWorld` for secure IPC
  - `window.electron` API exposed (isElectron, getBackendUrl, etc.)

- **Feature Flags System**
  - `useFeatureFlags` hook for desktop/web feature branching
  - CLI status, API key settings shown only in desktop
  - Desktop download guide shown in web

### Changed
- **CLI Detection Logic Enhanced**
  - PowerShell `Get-Command` fallback (Windows)
  - `npm root -g` for npm global package path search
  - Gemini CLI detection support added

### New Files/Folders
- `frontend/electron/`: Electron main process
- `frontend/electron-builder.json`: Build configuration
- `frontend/release/`: Build output

### Build Commands
- `npm run electron:dev`: Development mode
- `npm run electron:build:win`: Windows build
- `npm run electron:build:mac`: macOS build
- `npm run electron:build:linux`: Linux build

---

## [1.3] - 2026-01-21

### Added
- **AI & CLI Settings Page**
  - Claude Code CLI installation detection
  - Version check and latest version comparison
  - Platform-specific install/update commands

- **LLM Provider Management**
  - OpenAI, Anthropic, Gemini API key settings
  - Encrypted API key storage (Fernet)
  - API key validation (actual API call test)
  - Default provider selection

### New Components
- `CLIStatusCard`: CLI status display card
- `LLMProviderCard`: Provider settings card
- `LLMIcons`: Provider-specific icons

### New API Endpoints
- `/api/llm/config`: Settings read/write
- `/api/llm/validate/{provider}`: API key validation
- `/api/llm/cli/status`: CLI status check
- `/api/llm/providers`: Provider list

---

## [1.2] - 2026-01-20

### Added
- **GitHub Connection Status Check**
  - `/api/github/status` endpoint
  - Token validity check and reconnection guide
  - OAuth callback redirect fix (frontend_url setting)

- **Template Editor**
  - Real-time preview (rendered with user data)
  - Click to insert fields (`{{field}}`, `{{#section}}...{{/section}}`)
  - Available fields list (user/company/project/achievement)
  - System template clone feature

- **Achievement Auto-Detection**
  - AchievementService added
  - Pattern matching from commit messages/descriptions
  - `/api/knowledge/achievements/auto-detect` endpoint

- **Report Generation**
  - ReportService added
  - PROJECTS.md style report
  - Performance summary report
  - Company integrated report

- **Company Organization**
  - Company timeline view (`/knowledge/companies/timeline`)
  - Company grouping API
  - Tech stack auto-aggregation

---

## [1.1] - 2026-01-20

### Changed
- **Tech Stack Detection Expanded** (26 → 200+ technologies)
  - JavaScript/TypeScript: React, Vue, Angular, Next.js, Redux, MUI, Fabric.js, Three.js, etc. (75+)
  - Python: Django, Flask, FastAPI, Django REST Framework, PostgreSQL drivers, scikit-learn, etc. (80+)
  - Java/Kotlin: Spring Boot, Spring Security, Hibernate, Lombok, JUnit, etc. (30+)
  - Flutter/Dart: Provider, Riverpod, GetX, Bloc, etc. (15+)
  - PHP: Laravel, Symfony, Composer, etc. (20+)

### Added
- **Auto Tech Stack Detection on Repo Selection** (no LLM required)
  - `/api/github/detect-technologies` endpoint
  - Auto-called on repo selection in frontend
  - Parallel API calls for better UX
- 50+ config file patterns (Dockerfile, tsconfig.json, tailwind.config.js, etc.)

---

## [1.0] - 2026-01-19

### Added
- Initial release
- Full 6-stage pipeline implementation
- GitHub OAuth integration
- 5 platform templates (Saramin, Wanted, Remember, Notion)
- DOCX/PDF/Markdown document generation
- Docker deployment configuration

### Features
- GitHub repository analysis
- Base Common Knowledge management
- Template system with Mustache syntax
- LLM-based project summarization (OpenAI + Anthropic)
- Achievement auto-detection from commits
- Multi-format document export

---

## Technical Details

### Architecture
- **Backend**: FastAPI, SQLAlchemy, SQLite
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui
- **Desktop**: Electron, electron-builder, electron-serve
- **State**: Zustand, TanStack Query
- **i18n**: react-i18next, i18next
- **LLM**: OpenAI (GPT-4) + Anthropic (Claude) + CLI tools
- **Document**: python-docx, reportlab, PyPDF2
- **GitHub**: OAuth App (multi-user support)

### Pipeline Stages
1. GitHub Analysis → Commit analysis, statistics extraction (parallelized)
2. Code Extraction → Code patterns, architecture detection
3. Tech Detection → Auto technology stack detection (parallelized)
4. Achievement Detection → Auto achievement detection from commits
5. LLM Summarization → AI-based summary generation (Steps 5.2+5.3 parallelized)
6. Template Mapping → Platform-specific template mapping
7. Document Gen → DOCX/PDF/MD generation
