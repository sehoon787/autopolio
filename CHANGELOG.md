# Changelog

All notable changes to Autopolio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - Multi-port OAuth callback support (5173, 5174, 5199, etc.)
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
1. GitHub Analysis → Commit analysis, statistics extraction
2. Code Extraction → Code patterns, architecture detection
3. Tech Detection → Auto technology stack detection
4. LLM Summarization → AI-based summary generation
5. Template Mapping → Platform-specific template mapping
6. Document Gen → DOCX/PDF/MD generation
