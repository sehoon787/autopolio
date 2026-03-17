# Autopolio

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/sehoon787/Autopolio/actions/workflows/ci.yml/badge.svg)](https://github.com/sehoon787/Autopolio/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![GitHub Stars](https://img.shields.io/github/stars/sehoon787/Autopolio?style=social)](https://github.com/sehoon787/Autopolio)

[🇰🇷 한국어 README](README_ko.md)

---

**Autopolio** is an open-source portfolio and resume automation platform. It analyzes your GitHub repositories, builds a structured knowledge base from your career history, and generates tailored resumes for major job platforms — all powered by AI.

## Overview

Autopolio connects to your GitHub account, walks through your commit history and source code, automatically detects the technologies you used, and produces polished resumes or portfolio documents in DOCX, PDF, and Markdown formats.

**Who it's for:** Software engineers who want to turn their GitHub activity into a professional resume without manually writing every line.

**Key workflow:**
1. Connect GitHub and select repositories
2. Build your career knowledge base (companies, projects, achievements)
3. Choose a platform template (or create your own)
4. Run the AI pipeline to generate and export your resume

<!-- Screenshots coming soon -->

## Key Features

- **GitHub Repository Analysis** — Parses commit history and auto-detects 200+ technologies across JavaScript, Python, Java, Kotlin, Dart, PHP, and more
- **Extended Analysis** — Per-contributor breakdowns, Conventional Commit parsing, code quality metrics, and work area detection
- **Career Knowledge Base** — Structured management of companies, projects, achievements, certifications, education, and awards
- **Platform Resume Templates** — Pre-built HTML templates for Saramin, Remember, and Jumpit; Mustache syntax for custom templates
- **AI Summarization** — OpenAI GPT-4, Anthropic Claude, and Google Gemini all supported; switchable per request
- **Multiple Export Formats** — DOCX, PDF, and Markdown output
- **Electron Desktop App** — Cross-platform installer for Windows (exe), macOS (dmg), and Linux (AppImage)
- **Internationalization** — Full UI in Korean and English via react-i18next
- **CI/CD Pipeline** — GitHub Actions with pytest, Playwright, ruff, tsc, Bandit security scanning, and Gemini Code Assist review
- **Seed Data** — Sample data script for testing and demos

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| Desktop | Electron, electron-builder, electron-serve |
| State Management | Zustand, TanStack Query |
| Internationalization | react-i18next, i18next |
| LLM | OpenAI GPT-4 / Anthropic Claude / Google Gemini |
| Document Generation | python-docx, reportlab, chevron (Mustache) |
| Package Managers | uv (Python), npm (Frontend) |
| CI/CD | GitHub Actions + Gemini Code Assist |
| Testing | pytest, Playwright |

## 7-Step Pipeline

```
1. GitHub Analysis       → Fetch commits, extract statistics (parallel)
2. Code Extraction       → Detect code patterns and architecture
3. Tech Detection        → Auto-detect tech stack (parallel API calls)
4. Achievement Detection → Extract quantitative achievements from commits
5. LLM Summarization     → Generate AI-powered project summaries (parallel)
6. Template Mapping      → Map data to platform-specific template fields
7. Document Generation   → Produce DOCX / PDF / Markdown output
```

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/sehoon787/Autopolio.git
cd Autopolio

# Copy the example env file and fill in your keys
cp .env.example .env
```

### 2. Run with the dev script (recommended)

```bash
# Windows — starts backend and frontend together
start-dev.bat

# Linux / macOS
./start-dev.sh
```

### 3. Run services individually

```bash
# Backend (using uv)
uv sync
uv run uvicorn api.main:app --reload --port 8085

# Frontend
cd frontend
npm install
npm run dev
```

### 4. Open in your browser

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3035 |
| API Docs (Swagger) | http://localhost:8085/docs |
| API Docs (ReDoc) | http://localhost:8085/redoc |

> Ports are configured in `config/runtime.yaml`.

## Docker

```bash
# Start all services
docker-compose up -d

# Follow logs
docker-compose logs -f

# Stop
docker-compose down
```

## Electron Desktop App

```bash
cd frontend

# Development mode (Vite dev server + Electron)
npm run electron:dev

# Build installers
npm run electron:build:win    # Windows exe (NSIS)
npm run electron:build:mac    # macOS dmg
npm run electron:build:linux  # Linux AppImage
```

## Testing

```bash
# Full test suite (Docker → pytest → Playwright)
tests/scripts/run-all.bat        # Windows
tests/scripts/run-all.sh         # Linux / macOS

# API tests only
tests/scripts/run-api-tests.bat  # Windows
tests/scripts/run-api-tests.sh   # Linux / macOS

# E2E tests only
tests/scripts/run-e2e-tests.bat  # Windows
tests/scripts/run-e2e-tests.sh   # Linux / macOS
```

### Seed Data

Populate a test or demo environment with realistic sample data:

```bash
# Insert sample data for the default user
python tests/seed_sample_data.py

# Wipe existing data first, then insert
python tests/seed_sample_data.py --clean

# Create a new user and insert sample data
python tests/seed_sample_data.py --create-user
```

The script inserts 3 companies, 6 projects, 2 education records, 4 training records, 3 certifications, 2 awards, 3 publications, 2 patents, and 2 activities.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCRYPTION_KEY` | Fernet encryption key for stored tokens | Yes |
| `LLM_PROVIDER` | Default LLM provider (`openai` / `anthropic` / `gemini`) | Yes |
| `OPENAI_API_KEY` | OpenAI API key | One of these |
| `ANTHROPIC_API_KEY` | Anthropic API key | One of these |
| `GEMINI_API_KEY` | Google Gemini API key | One of these |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | Yes |
| `DATABASE_URL` | SQLite database path (default: `data/autopolio.db`) | No |

## Project Structure

```
Autopolio/
├── api/                     # FastAPI backend
│   ├── main.py              # Application entry point
│   ├── constants/           # Centralized enums and config constants
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── routers/             # API route handlers (modularized)
│   └── services/            # Business logic (modularized)
├── frontend/                # React frontend + Electron
│   ├── electron/            # Electron main process
│   └── src/
│       ├── api/             # API client functions
│       ├── components/      # Reusable UI components
│       ├── locales/         # i18n translation files (ko, en)
│       ├── pages/           # Page components
│       └── stores/          # Zustand state stores
├── .github/workflows/       # CI/CD workflow definitions
├── tests/                   # Test infrastructure and scripts
├── config/                  # YAML configuration files
├── data/                    # SQLite database and HTML templates
├── result/                  # Generated output documents
├── pyproject.toml           # Python dependencies (uv)
└── docker-compose.yml
```

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/users` | Create a user |
| `GET` | `/api/github/repos` | List connected repositories |
| `POST` | `/api/github/analyze` | Start repository analysis |
| `GET` | `/api/github/contributors/{id}` | List all contributors |
| `GET` | `/api/github/contributor-analysis/{id}` | Per-user detailed analysis |
| `GET` | `/api/knowledge/companies` | List companies |
| `GET` | `/api/knowledge/projects` | List projects |
| `GET` | `/api/platforms` | List platform resume templates |
| `POST` | `/api/platforms/{id}/render` | Render a template with user data |
| `POST` | `/api/pipeline/run` | Run the full generation pipeline |
| `GET` | `/api/documents` | List generated documents |
| `GET` | `/api/llm/config` | Get LLM configuration |

Full interactive API documentation is available at `http://localhost:8085/docs` when the server is running.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to report bugs, propose features, and submit pull requests.

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## License

This project is licensed under the Apache License 2.0 — see the [LICENSE](LICENSE) file for details.
