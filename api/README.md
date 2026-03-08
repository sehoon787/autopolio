# Autopolio Backend (API)

FastAPI backend for the Autopolio portfolio/resume automation platform.

## Architecture

```
api/
├── main.py                 # FastAPI app entrypoint
├── config.py               # Settings (env vars, defaults)
├── database.py             # SQLAlchemy async engine + session
├── constants/              # Centralized enums & config constants
│   ├── enums.py            # StrEnum (JobStatus, LLMProvider, CLIType, ...)
│   └── config.py           # LLM token limits, CLI mappings
├── models/                 # SQLAlchemy ORM models
│   ├── user.py
│   ├── company.py
│   ├── project.py
│   ├── achievement.py
│   ├── repo_analysis.py    # Core analysis result (28 fields)
│   ├── contributor_analysis.py
│   ├── template.py
│   ├── platform_template.py
│   ├── document.py
│   └── job.py
├── schemas/                # Pydantic request/response schemas
├── routers/                # API endpoint groups
│   ├── users.py
│   ├── github/             # GitHub OAuth, repos, analysis, edits, jobs
│   ├── knowledge/          # Companies, projects, achievements, credentials
│   ├── documents/          # Document generation, export, reports
│   ├── templates.py
│   ├── platforms.py
│   ├── pipeline.py
│   ├── llm.py
│   ├── lookup.py
│   └── oauth.py
└── services/               # Business logic
    ├── analysis/           # 6-phase analysis workflow
    │   ├── analysis_workflow.py      # AnalysisContext + Phases 1-4
    │   ├── analysis_workflow_llm.py  # Phases 5-6 (LLM generation)
    │   ├── analysis_job_runner.py    # Background single-repo analysis
    │   ├── analysis_job_multi.py     # Background multi-repo analysis
    │   ├── analysis_job_helpers.py   # Shared helpers (save_llm_results)
    │   ├── repo_analyzer.py          # Git statistics extraction
    │   └── technology_detection_service.py  # 200+ tech stack detection
    ├── core/               # Shared services
    │   ├── content_generator.py      # LLM content: impl details, timeline,
    │   │                             #   achievements, architecture patterns
    │   ├── key_tasks_generator.py    # LLM key tasks generation
    │   ├── encryption_service.py     # Fernet API key encryption
    │   ├── task_service.py           # Async job management
    │   └── profile_service.py
    ├── github/             # GitHub API client
    ├── llm/                # LLM providers
    │   ├── llm_service.py            # API-based LLM (OpenAI/Anthropic/Gemini)
    │   ├── cli_llm_service.py        # CLI-based LLM (Claude Code/Gemini CLI/Codex)
    │   └── cli_service.py            # CLI detection & auth status
    ├── document/           # Document generation (DOCX/PDF/MD)
    ├── export/             # Project data export
    ├── report/             # Report generation
    ├── template/           # Template rendering (Mustache)
    └── platform/           # Platform template management
```

## 6-Phase Analysis Pipeline

See [docs/PIPELINE.md](../docs/PIPELINE.md) for full details.

| Phase | Name | Description |
|-------|------|-------------|
| 1 | Validate | Verify user, GitHub token, project |
| 2 | Detect Tech | Static tech stack detection (no LLM) |
| 3 | Git Analysis | Commits, stats, languages, contributor data |
| 4 | Save | Persist analysis to `repo_analyses` table |
| 5 | LLM Generation | Code contributions collection, key tasks, implementation details, timeline, achievements, architecture patterns, AI summary |
| 6 | Tech Versions | Extract dependency versions from manifests |

## Key Services

- **ContentGenerator** (`services/core/content_generator.py`): Generates implementation details, development timeline, detailed achievements, and architecture patterns via parallel (API) or sequential (CLI) LLM calls.
- **CLILLMService** (`services/llm/cli_llm_service.py`): Runs CLI tools (Claude Code, Gemini CLI, Codex) as subprocesses. Follows the [CLI auth priority policy](../docs/RUNTIME_TIER_AUTH.md). Codex CLI JSONL output is parsed with error/turn.failed event handling.
- **CLIService** (`services/llm/cli_service.py`): CLI detection, auth status checks, and OAuth login flow. Uses `stdin=DEVNULL` for login subprocess to ensure localhost callback OAuth (not code-exchange).
- **TechnologyDetectionService**: Parses `package.json`, `requirements.txt`, `pom.xml`, etc. to detect 200+ technologies without LLM.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCRYPTION_KEY` | Fernet key for token encryption | Yes |
| `LLM_PROVIDER` | Default LLM provider (`openai`/`anthropic`/`gemini`) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | If using OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | If using Anthropic |
| `GEMINI_API_KEY` | Gemini API key | If using Gemini |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | Yes |
| `DATABASE_URL` | SQLite path (default: `data/autopolio.db`) | No |

## Running Locally

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Start server
python -m uvicorn api.main:app --reload --port 8085
```

API docs: http://localhost:8085/docs (Swagger) or http://localhost:8085/redoc
