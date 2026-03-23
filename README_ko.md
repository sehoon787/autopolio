# Autopolio

> GitHub를 AI로 분석해 전문적인 포트폴리오와 이력서를 자동 생성하세요

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/sehoon787/autopolio/actions/workflows/ci.yml/badge.svg)](https://github.com/sehoon787/autopolio/actions/workflows/ci.yml)
[![Lint](https://github.com/sehoon787/autopolio/actions/workflows/lint.yml/badge.svg)](https://github.com/sehoon787/autopolio/actions/workflows/lint.yml)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![Node](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![Stars](https://img.shields.io/github/stars/sehoon787/autopolio?style=social)](https://github.com/sehoon787/autopolio)
[![Release](https://img.shields.io/github/v/release/sehoon787/autopolio)](https://github.com/sehoon787/autopolio/releases)

[🇺🇸 English README](README.md)

**Autopolio**는 오픈소스 AI 기반 포트폴리오/이력서 자동화 플랫폼입니다. GitHub 레포지토리를 분석하고 경력 정보를 구조화한 뒤, 사람인·리멤버·점핏 등 주요 채용 플랫폼에 맞는 이력서를 자동으로 생성합니다.

---

## 스크린샷

<table>
<tr>
<td><img src="docs/screenshots/01-dashboard.png" width="400" alt="대시보드"/><br/><em>대시보드 & 커리어 타임라인</em></td>
<td><img src="docs/screenshots/02-projects.png" width="400" alt="프로젝트 관리"/><br/><em>프로젝트 관리</em></td>
</tr>
<tr>
<td><img src="docs/screenshots/03-platforms.png" width="400" alt="플랫폼 템플릿"/><br/><em>채용 플랫폼 템플릿</em></td>
<td><img src="docs/screenshots/04-settings-llm.png" width="400" alt="AI 설정"/><br/><em>AI 프로바이더 설정</em></td>
</tr>
</table>

추가 스크린샷: [문서 생성](docs/screenshots/06-generate.png) · [템플릿 관리](docs/screenshots/08-templates.png) · [GitHub 연동 설정](docs/screenshots/07-github-setup.png)

---

## 왜 Autopolio인가

대부분의 개발자는 풍부한 GitHub 히스토리를 가지고 있지만, 이를 이력서로 정리하는 데 많은 시간을 씁니다. 사람인, 리멤버, 점핏 등 플랫폼마다 형식이 달라 반복 작업이 필요합니다. Autopolio는 이 문제를 해결합니다. GitHub를 연결하고 경력 정보를 한 번만 입력하면, AI 파이프라인이 나머지를 처리합니다.

---

## 주요 기능

- **GitHub 레포지토리 분석** — 커밋 내역을 파싱하고 JavaScript, Python, Java, Kotlin, Dart, PHP 등 200+ 기술 스택을 자동 탐지 (LLM 불필요, 빠름)
- **컨트리뷰터별 상세 분석** — 팀 레포에서 나의 커밋만 분리 분석; Conventional Commit 파싱, 작업 영역 감지, 코드 품질 메트릭
- **커리어 Knowledge Base** — 회사, 프로젝트, 성과, 자격증, 학력, 수상 이력 체계적 관리
- **플랫폼별 이력서 템플릿** — 사람인, 리멤버, 점핏 HTML 템플릿 제공; Mustache 문법으로 커스텀 템플릿 지원
- **멀티 LLM AI 요약** — OpenAI GPT-4, Anthropic Claude, Google Gemini 모두 지원; 요청별 전환 가능
- **다중 포맷 출력** — 하나의 데이터에서 DOCX, PDF, Markdown 동시 생성
- **Electron 데스크톱 앱** — Windows exe, macOS dmg, Linux AppImage 크로스 플랫폼 배포; 로컬 CLI 도구 연동
- **국제화(i18n)** — react-i18next 기반 한국어/영어 전체 UI 지원
- **CI/CD 파이프라인** — pytest, Playwright, ruff, tsc, Bandit 보안 스캔, Gemini Code Assist 리뷰 자동화

---

## 동작 방식

```
Step 1 — GitHub Analysis       커밋 분석 및 통계 추출 (병렬 처리)
Step 2 — Code Extraction       코드 패턴 및 프로젝트 아키텍처 탐지
Step 3 — Tech Detection        의존성 파일 기반 기술 스택 자동 탐지 (빠름, LLM 불필요)
Step 4 — Achievement Detection 커밋 메시지에서 정량적 성과 자동 추출
Step 5 — LLM Summarization     AI 기반 프로젝트 요약 생성 (병렬 처리)
Step 6 — Template Mapping      구조화된 데이터를 플랫폼별 템플릿 필드에 매핑
Step 7 — Document Generation   DOCX / PDF / Markdown 문서 생성
```

---

## 빠른 시작

### 방법 A: Docker (권장)

```bash
git clone https://github.com/sehoon787/autopolio.git
cd Autopolio

cp .env.example .env
# .env 파일을 열어 ENCRYPTION_KEY, GITHUB_CLIENT_ID/SECRET, LLM API 키 설정

docker-compose up -d
```

브라우저에서 `http://localhost:3035`를 여세요.

### 방법 B: 개발 스크립트

```bash
git clone https://github.com/sehoon787/autopolio.git
cd Autopolio
cp .env.example .env

# Windows — 백엔드 + 프론트엔드 동시 실행
start-dev.bat

# Linux / macOS
./start-dev.sh
```

### 방법 C: 직접 실행

```bash
# 백엔드 (uv 사용)
uv sync
uv run uvicorn api.main:app --reload --port 8085

# 프론트엔드 (별도 터미널)
cd frontend
npm install
npm run dev
```

| 서비스 | URL |
|--------|-----|
| Frontend | http://localhost:3035 |
| API Docs (Swagger) | http://localhost:8085/docs |
| API Docs (ReDoc) | http://localhost:8085/redoc |

> 포트 설정은 `config/runtime.yaml`에서 관리됩니다.

---

## Electron 데스크톱 앱

```bash
cd frontend

npm run electron:dev             # 개발 모드

npm run electron:build:win       # Windows exe (NSIS)
npm run electron:build:mac       # macOS dmg
npm run electron:build:linux     # Linux AppImage
```

---

## 테스트

```bash
# 전체 테스트: Docker → pytest → Playwright
tests/scripts/run-all.sh          # Linux / macOS
tests/scripts/run-all.bat         # Windows

# API 테스트만
tests/scripts/run-api-tests.sh

# E2E 테스트만
tests/scripts/run-e2e-tests.sh
```

### 시드 데이터

테스트/데모 환경을 위한 종합 샘플 데이터:

```bash
python tests/seed_sample_data.py             # 시드 데이터 삽입
python tests/seed_sample_data.py --clean     # 기존 데이터 삭제 후 삽입
python tests/seed_sample_data.py --create-user  # 사용자 생성 + 삽입
```

회사 3, 프로젝트 6, 학력 2, 교육이력 4, 자격증 3, 수상 2, 논문 3, 특허 2, 활동 2건 삽입.

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| Desktop | Electron, electron-builder, electron-serve |
| State Management | Zustand, TanStack Query |
| 국제화(i18n) | react-i18next, i18next |
| LLM | OpenAI GPT-4 / Anthropic Claude / Google Gemini |
| 문서 생성 | python-docx, reportlab, chevron (Mustache) |
| 패키지 매니저 | uv (Python), npm (Frontend) |
| CI/CD | GitHub Actions + Gemini Code Assist |
| 테스트 | pytest, Playwright |

---

## 프로젝트 구조

```
Autopolio/
├── api/                     # FastAPI 백엔드
│   ├── constants/           # 중앙화된 열거형 및 설정 상수
│   ├── models/              # SQLAlchemy ORM 모델
│   ├── schemas/             # Pydantic 요청/응답 스키마
│   ├── routers/             # API 라우터 (모듈화)
│   └── services/            # 비즈니스 로직 (모듈화)
├── frontend/                # React 프론트엔드 + Electron
│   ├── electron/            # Electron 메인 프로세스 및 서비스
│   └── src/
│       ├── api/             # API 클라이언트 함수
│       ├── components/      # 재사용 가능한 UI 컴포넌트
│       ├── locales/         # i18n 번역 파일 (ko, en)
│       ├── pages/           # 페이지 컴포넌트
│       └── stores/          # Zustand 상태 스토어
├── .github/workflows/       # CI/CD 파이프라인 정의
├── tests/                   # 테스트 스크립트 및 E2E 테스트
├── config/                  # YAML 설정 파일
├── data/                    # SQLite DB 및 플랫폼 HTML 템플릿
├── docs/                    # 프로젝트 문서 및 스크린샷
├── result/                  # 생성된 출력 문서
├── pyproject.toml           # Python 의존성 (uv)
└── docker-compose.yml
```

---

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `POST` | `/api/users` | 사용자 생성 |
| `GET` | `/api/github/repos` | 연결된 레포지토리 목록 |
| `POST` | `/api/github/analyze` | 레포지토리 분석 시작 |
| `GET` | `/api/github/contributor-analysis/{id}` | 사용자별 상세 분석 |
| `GET` | `/api/knowledge/projects` | 프로젝트 목록 |
| `GET` | `/api/platforms` | 플랫폼 이력서 템플릿 목록 |
| `POST` | `/api/platforms/{id}/render` | 사용자 데이터로 템플릿 렌더링 |
| `POST` | `/api/pipeline/run` | 전체 생성 파이프라인 실행 |
| `GET` | `/api/documents` | 생성된 문서 목록 |

전체 API 대화형 문서: `http://localhost:8085/docs`

---

## 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `ENCRYPTION_KEY` | 저장 토큰 Fernet 암호화 키 | 필수 |
| `LLM_PROVIDER` | 기본 LLM 프로바이더 (`openai` / `anthropic` / `gemini`) | 필수 |
| `OPENAI_API_KEY` | OpenAI API 키 | 셋 중 하나 |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | 셋 중 하나 |
| `GEMINI_API_KEY` | Google Gemini API 키 | 셋 중 하나 |
| `GITHUB_CLIENT_ID` | GitHub OAuth App 클라이언트 ID | 필수 |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App 클라이언트 시크릿 | 필수 |
| `DATABASE_URL` | SQLite DB 경로 (기본값: `data/autopolio.db`) | 선택 |

---

## 기여하기

기여를 환영합니다. 버그 신고, 기능 제안, PR 제출 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요. 프로젝트 로드맵은 [docs/ROADMAP.md](docs/ROADMAP.md)에서 확인할 수 있습니다.

이 프로젝트는 [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md)를 따릅니다.

## 라이선스

Apache License 2.0 — 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.
