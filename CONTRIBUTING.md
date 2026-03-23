# Contributing to Autopolio

Thank you for your interest in contributing to Autopolio! We welcome contributions of all kinds — bug fixes, new features, documentation improvements, and more. This guide will help you get started quickly.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Workflow](#development-workflow)
3. [Code Style](#code-style)
4. [Testing](#testing)
5. [Pull Request Guidelines](#pull-request-guidelines)
6. [Reporting Issues](#reporting-issues)
7. [Code of Conduct](#code-of-conduct)
8. [License](#license)

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- Git

### Setup

```bash
git clone https://github.com/sehoon787/autopolio.git
cd Autopolio
cp .env.example .env
# Edit .env with your API keys
```

**Backend:**

```bash
uv sync
uv run uvicorn api.main:app --reload --port 8085
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The API will be available at `http://localhost:8085` and the frontend at `http://localhost:5173` (or the port Vite assigns).

---

## Development Workflow

1. **Fork** the repository on GitHub.
2. **Create a branch** from `main` with a descriptive name:
   ```bash
   git checkout -b feat/my-new-feature
   # or
   git checkout -b fix/issue-123
   ```
3. **Make your changes** — keep commits small and focused.
4. **Test your changes** (see [Testing](#testing) below).
5. **Push** your branch and open a Pull Request against `main`.

Use conventional commit prefixes in your commit messages:

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `refactor:` | Code change with no functional effect |
| `test:` | Adding or updating tests |
| `chore:` | Build, CI, or tooling changes |

---

## Code Style

**Python (backend):**

- Linting and formatting are handled by [ruff](https://docs.astral.sh/ruff/).
- Run before committing:
  ```bash
  ruff check api/
  ruff format api/
  ```
- Follow the existing module structure under `api/`.

**TypeScript (frontend):**

- Type checking is enforced by `tsc`.
- Run before committing:
  ```bash
  cd frontend
  npx tsc --noEmit
  ```
- Follow the existing component and hook patterns in `frontend/src/`.

**General:**

- Keep files under ~400 lines; extract modules when they grow larger.
- Prefer immutable data patterns.
- No hardcoded secrets or credentials.

---

## Testing

Run these checks before opening a PR:

**API tests:**

```bash
pytest tests/api/ -x
```

**Frontend build:**

```bash
cd frontend
npm run build
```

**Lint:**

```bash
ruff check api/
```

CI also runs Playwright E2E tests and Bandit security scanning automatically on every PR. You do not need to run these locally, but make sure your changes do not break the API or frontend build.

---

## Pull Request Guidelines

- Use a descriptive title (e.g., `feat: add PDF export for platforms`).
- Reference the related issue in the PR description (e.g., `Closes #42`).
- Keep PRs focused — one feature or fix per PR.
- All CI checks must pass before a PR can be merged:
  - **CI** — pytest + Playwright tests
  - **Lint** — ruff + tsc
  - **Security** — Bandit scan
- If your PR is a work in progress, open it as a Draft.

---

## Reporting Issues

Please use the GitHub issue templates to report problems or request features:

| Template | Use for |
|----------|---------|
| [Bug Report](https://github.com/sehoon787/autopolio/issues/new?template=bug_report.yml) | Something is broken |
| [Feature Request](https://github.com/sehoon787/autopolio/issues/new?template=feature_request.yml) | Suggest a new feature |
| [Docs](https://github.com/sehoon787/autopolio/issues/new?template=docs.yml) | Documentation improvements |
| [Question](https://github.com/sehoon787/autopolio/issues/new?template=question.yml) | General questions |

Before opening an issue, please search existing issues to avoid duplicates.

---

## Code of Conduct

This project follows a standard Code of Conduct. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details. By participating, you agree to abide by its terms.

---

## License

By contributing to Autopolio, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
