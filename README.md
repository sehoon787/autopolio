# Autopolio

GitHub 레포지토리 분석 기반 포트폴리오/이력서 자동 생성 플랫폼

## 주요 기능

- **GitHub 레포지토리 분석**: 커밋 내역, 기술 스택 자동 탐지
- **확장 분석 (v1.10)**: 컨트리뷰터별 분석, 코드 품질 메트릭, Conventional Commit 파싱
- **Base Knowledge 관리**: 회사, 프로젝트, 성과 정보 체계적 관리
- **템플릿 시스템**: 사람인, 원티드, 리멤버, 노션 등 플랫폼별 템플릿
- **AI 요약 생성**: OpenAI/Anthropic LLM 기반 프로젝트 요약
- **다중 포맷 출력**: DOCX, PDF, Markdown 문서 생성

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| State | Zustand, TanStack Query |
| LLM | OpenAI GPT-4 / Anthropic Claude |
| Document | python-docx, reportlab |
| Package Manager | uv (Python), npm (Frontend) |

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

### 확장 분석 API (v1.10)
- **컨트리뷰터 분석**: 사용자별 기여도, 작업 영역, Conventional Commit 파싱
- **코드 품질 메트릭**: 파일 크기 분포, 테스트/문서 비율, 언어 분포

## 성능 최적화 (v1.9)

- **분석 속도 60~70% 향상**
  - 기술 스택 감지: 40+ 파일 병렬 확인 (30초 → 3~5초)
  - 커밋 상세 조회: 50개 커밋 병렬 조회 (40초 → 5~8초)
  - LLM 호출: 3개 호출 병렬 실행 (30초 → 10~15초)
- **예상 분석 시간**
  - 단일 레포: 40~60초 (기존 2~3분)
  - 5개 프로젝트: 3~5분 (기존 10~15분)

## 빠른 시작

### 1. 환경 설정

```bash
# 저장소 클론
cd C:\Users\kimsehun\Desktop\proj\Autopolio

# 환경 변수 설정
copy .env.example .env
# .env 파일을 열어 API 키 설정
```

### 2. 백엔드 실행 (uv 사용)

```bash
# 의존성 설치 및 가상환경 생성
uv sync

# 서버 실행
uv run uvicorn api.main:app --reload --port 8085
```

### 3. 프론트엔드 실행

```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### 4. 접속

- Frontend: http://localhost:3035
- API Docs: http://localhost:8085/docs

Ports are managed in `config/runtime.yaml` (external vs docker internal).

## 개발 스크립트

```bash
# Windows - 전체 개발 환경 실행
start-dev.bat

# Linux/Mac
chmod +x start-dev.sh
./start-dev.sh
```

## Docker 실행

```bash
# Docker Compose로 전체 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

## 환경 변수

| 변수 | 설명 | 필수 |
|------|------|------|
| `ENCRYPTION_KEY` | Fernet 암호화 키 | O |
| `LLM_PROVIDER` | LLM 제공자 (openai/anthropic) | O |
| `OPENAI_API_KEY` | OpenAI API 키 | △ |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | △ |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | O |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Secret | O |

## 프로젝트 구조

```
Autopolio/
├── api/                    # FastAPI 백엔드
│   ├── main.py             # 엔트리포인트
│   ├── config.py           # 설정
│   ├── database.py         # DB 연결
│   ├── models/             # SQLAlchemy 모델
│   ├── schemas/            # Pydantic 스키마
│   ├── routers/            # API 라우터
│   └── services/           # 비즈니스 로직
├── frontend/               # React 프론트엔드
│   ├── src/
│   │   ├── api/            # API 클라이언트
│   │   ├── components/     # UI 컴포넌트
│   │   ├── pages/          # 페이지
│   │   └── stores/         # Zustand 스토어
│   └── package.json
├── config/                 # YAML 설정
├── data/                   # SQLite DB
├── result/                 # 생성된 문서
├── pyproject.toml          # Python 의존성 (uv)
└── uv.lock                 # Lock 파일
```

## API 엔드포인트

| 경로 | 설명 |
|------|------|
| `POST /api/users` | 사용자 생성 |
| `GET /api/github/repos` | GitHub 레포 목록 |
| `POST /api/github/analyze` | 레포 분석 |
| `GET /api/github/contributors/{id}` | 컨트리뷰터 목록 (v1.10) |
| `GET /api/github/contributor-analysis/{id}` | 사용자별 상세 분석 (v1.10) |
| `GET /api/github/code-quality/{id}` | 코드 품질 메트릭 (v1.10) |
| `GET /api/github/detailed-commits/{id}` | Conventional Commit 파싱 (v1.10) |
| `GET /api/knowledge/companies` | 회사 목록 |
| `GET /api/knowledge/projects` | 프로젝트 목록 |
| `POST /api/pipeline/run` | 파이프라인 실행 |
| `GET /api/documents` | 문서 목록 |
| `GET /api/documents/{id}/download` | 문서 다운로드 |

## 라이센스

MIT License
