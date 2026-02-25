# Autopolio v1.20

GitHub 레포지토리 분석 기반 포트폴리오/이력서 자동 생성 플랫폼

## 주요 기능

- **GitHub 레포지토리 분석**: 커밋 내역, 기술 스택 자동 탐지 (200+ 기술)
- **확장 분석**: 컨트리뷰터별 분석, 코드 품질 메트릭, Conventional Commit 파싱
- **Base Knowledge 관리**: 회사, 프로젝트, 성과, 자격증/학력 체계적 관리
- **템플릿 시스템**: 사람인, 원티드, 리멤버, 점핏 등 플랫폼별 HTML 템플릿
- **AI 요약 생성**: OpenAI / Anthropic / Gemini LLM 기반 프로젝트 요약
- **다중 포맷 출력**: DOCX, PDF, Markdown 문서 생성
- **Electron 데스크톱 앱**: Windows exe, macOS dmg, Linux AppImage 크로스 플랫폼 배포
- **국제화(i18n)**: 한국어/영어 전체 UI 지원
- **플랫폼 이력서 템플릿**: 사람인, 리멤버, 점핏 HTML 렌더링 및 내보내기
- **Multi-Repo 지원**: 프로젝트당 여러 Git 레포지토리 연결
- **CI/CD**: GitHub Actions 기반 테스트, 린트, 보안 스캔, AI 코드 리뷰, 릴리즈 자동화

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| Desktop | Electron, electron-builder, electron-serve |
| State | Zustand, TanStack Query |
| i18n | react-i18next, i18next |
| LLM | OpenAI GPT-4 / Anthropic Claude / Google Gemini |
| Document | python-docx, reportlab, chevron (Mustache) |
| Package Manager | uv (Python), npm (Frontend) |
| CI/CD | GitHub Actions (pytest, Playwright, ruff, tsc, Bandit, Gemini AI Review) |
| Testing | pytest, Playwright |

## 7단계 파이프라인

```
1. GitHub Analysis       → 커밋 분석, 통계 추출 (병렬 처리)
2. Code Extraction       → 코드 패턴, 아키텍처 탐지
3. Tech Detection        → 기술 스택 자동 탐지 (병렬 API 호출)
4. Achievement Detection → 성과 자동 감지
5. LLM Summarization     → AI 기반 요약 생성 (병렬 처리)
6. Template Mapping      → 플랫폼별 템플릿 매핑
7. Document Gen          → DOCX/PDF/MD 생성
```

## 빠른 시작

### 1. 환경 설정

```bash
# 저장소 클론
git clone https://github.com/<your-org>/Autopolio.git
cd Autopolio

# 환경 변수 설정
cp .env.example .env
# .env 파일을 열어 API 키 설정
```

### 2. 한번에 실행 (개발 스크립트)

```bash
# Windows — 백엔드 + 프론트엔드 동시 실행
start-dev.bat

# Linux/Mac
./start-dev.sh
```

### 3. 개별 실행

```bash
# 백엔드 (uv 사용)
uv sync
uv run uvicorn api.main:app --reload --port 8085

# 프론트엔드
cd frontend
npm install
npm run dev
```

### 4. 접속

- Frontend: http://localhost:3035
- API Docs: http://localhost:8085/docs

Ports are managed in `config/runtime.yaml` (external vs docker internal).

## Docker 실행

```bash
docker-compose up -d
docker-compose logs -f
```

## Electron 데스크톱 앱

```bash
cd frontend

# 개발 모드
npm run electron:dev

# 빌드
npm run electron:build:win   # Windows
npm run electron:build:mac   # macOS
npm run electron:build:linux # Linux
```

## 테스트

```bash
# 전체 테스트 (Docker → pytest → Playwright)
tests/scripts/run-all.bat       # Windows
tests/scripts/run-all.sh        # Linux/Mac

# API 테스트만
tests/scripts/run-api-tests.bat # Windows
tests/scripts/run-api-tests.sh  # Linux/Mac

# E2E 테스트만
tests/scripts/run-e2e-tests.bat # Windows
tests/scripts/run-e2e-tests.sh  # Linux/Mac
```

## 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `ENCRYPTION_KEY` | Fernet 암호화 키 | O |
| `LLM_PROVIDER` | LLM 제공자 (openai/anthropic/gemini) | O |
| `OPENAI_API_KEY` | OpenAI API 키 | △ |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | △ |
| `GEMINI_API_KEY` | Google Gemini API 키 | △ |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | O |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Secret | O |

## 프로젝트 구조

```
Autopolio/
├── api/                    # FastAPI 백엔드
│   ├── main.py             # 엔트리포인트
│   ├── models/             # SQLAlchemy 모델
│   ├── schemas/            # Pydantic 스키마
│   ├── routers/            # API 라우터 (모듈화)
│   └── services/           # 비즈니스 로직 (모듈화)
├── frontend/               # React 프론트엔드 + Electron
│   ├── electron/           # Electron 메인 프로세스
│   ├── src/
│   │   ├── api/            # API 클라이언트
│   │   ├── components/     # UI 컴포넌트
│   │   ├── locales/        # i18n 번역 파일 (ko, en)
│   │   ├── pages/          # 페이지
│   │   └── stores/         # Zustand 스토어
│   └── package.json
├── .github/workflows/      # CI/CD 워크플로우
├── tests/                  # 테스트 인프라
├── config/                 # YAML 설정
├── data/                   # SQLite DB, 템플릿
├── result/                 # 생성된 문서
├── pyproject.toml          # Python 의존성 (uv)
└── docker-compose.yml
```

## API 엔드포인트

| 경로 | 설명 |
|------|------|
| `POST /api/users` | 사용자 생성 |
| `GET /api/github/repos` | GitHub 레포 목록 |
| `POST /api/github/analyze` | 레포 분석 |
| `GET /api/github/contributors/{id}` | 컨트리뷰터 목록 |
| `GET /api/github/contributor-analysis/{id}` | 사용자별 상세 분석 |
| `GET /api/knowledge/companies` | 회사 목록 |
| `GET /api/knowledge/projects` | 프로젝트 목록 |
| `GET /api/platforms` | 플랫폼 템플릿 목록 |
| `POST /api/platforms/{id}/render` | 템플릿 렌더링 |
| `POST /api/pipeline/run` | 파이프라인 실행 |
| `GET /api/documents` | 문서 목록 |
| `GET /api/llm/config` | LLM 설정 조회 |

전체 API 문서: http://localhost:8085/docs

## 라이센스

Copyright (c) 2026 Sehoon Kim. All Rights Reserved.

이 소프트웨어는 독점 소프트웨어입니다. 소유자의 사전 서면 동의 없이 복제, 수정, 배포, 상업적 사용이 금지됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.
