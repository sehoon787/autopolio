# Changelog

All notable changes to Autopolio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
