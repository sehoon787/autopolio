# Autopolio - 포트폴리오/이력서 자동화 플랫폼

**생성일**: 2026-01-19
**프로젝트 상태**: 완성 (v1.3)
**기반 프로젝트**: portfolio, aircok_backoffice

---

## 프로젝트 개요

GitHub 레포지토리 분석, Base Common Knowledge 구축, 템플릿 기반 이력서/포트폴리오 자동 생성 플랫폼.

### 프로젝트 배경

이 프로젝트는 두 기존 프로젝트의 개념을 결합하여 탄생:

1. **portfolio** (`C:\Users\kimsehun\Desktop\proj\portfolio`)
   - 25개 프로젝트 데이터, 30개 Git 저장소 분석
   - 5개 플랫폼별 템플릿 (사람인, 원티드, 리멤버, 노션 등)
   - 구조화된 base knowledge (PROJECTS.md, PROJECT_PERFORMANCE_SUMMARY.md)
   - repos/ 폴더: 분석 대상 repository 클론들

2. **aircok_backoffice** (`C:\Users\kimsehun\Desktop\proj\aircok\aircok_backoffice`)
   - 6단계 파이프라인 아키텍처
   - FastAPI + React/TypeScript 풀스택 구조
   - TaskService 기반 비동기 작업 관리
   - 이종 데이터 상관관계 분석 및 자동 리포트 생성

### 핵심 목표

개발자들이 GitHub 레포지토리와 경력 정보를 기반으로:
1. 모든 커밋 내역, 소스코드를 자동 분석
2. Base Common Knowledge 구축 (플랫폼 공통 패턴)
3. 이력서 플랫폼별 템플릿 자동 생성
4. Word/PDF 양식 업로드 시 자동 채움
5. 다양한 포맷(DOCX, PDF, MD)으로 다운로드

---

## 핵심 기능

### 1. GitHub 레포지토리 분석
- GitHub OAuth App 연동 (다중 사용자 지원)
- 커밋 내역, 메시지, 소스코드 분석
- **기술 스택 자동 탐지 (200+ 기술 지원)**
  - JavaScript/TypeScript: package.json (75+ 기술)
  - Python: requirements.txt, pyproject.toml (80+ 기술)
  - Java/Kotlin: pom.xml, build.gradle (30+ 기술)
  - Flutter/Dart: pubspec.yaml (15+ 기술)
  - PHP: composer.json (20+ 기술)
  - 설정 파일 감지: tsconfig.json, Dockerfile, docker-compose.yml, tailwind.config.js 등 50+ 파일 패턴
- 레포지토리 선택 시 자동 기술 스택 감지 (LLM 미사용, 빠름)
- 프로젝트별 기여도 통계 (커밋 수, 라인 변경)

### 2. Base Common Knowledge 구축
- 회사/조직별 경력 정보 관리
- 프로젝트별 상세 정보 (portfolio의 PROJECTS.md 구조 활용)
- 성과 메트릭스 (PROJECT_PERFORMANCE_SUMMARY.md 구조 활용)
- 기술 스택 인벤토리

### 3. 템플릿 시스템
- 플랫폼별 기본 템플릿: 사람인(1,2,3), 원티드(3), 리멤버(4), 노션(5)
- 커스텀 템플릿 업로드 (Word/PDF 파싱)
- 템플릿 필드 자동 매핑
- **템플릿 에디터** (v1.2 신규)
  - 실시간 미리보기 (사용자 데이터로 렌더링)
  - 클릭으로 필드 삽입 (`{{field_name}}`)
  - 시스템 템플릿 복제 기능
  - Mustache 문법 지원 (`{{#section}}...{{/section}}`)

### 4. 문서 자동 생성
- LLM 기반 프로젝트 요약 생성 (OpenAI + Anthropic 둘 다 지원)
- 다중 포맷 출력 (DOCX, PDF, Markdown)
- 미리보기 및 다운로드

### 5. 성과 자동 감지 (v1.2 신규)
- 커밋 메시지에서 성과 패턴 자동 추출
  - 성능 개선: "80% 향상", "2배 빨라짐"
  - 효율성: "생산성 50% 증가", "시간 단축"
  - 정확도: "정확도 95% 달성"
- 프로젝트 설명에서 성과 추출
- LLM 기반 성과 생성 (선택)

### 6. 리포트 생성 (v1.2 신규)
- **PROJECTS.md 스타일**: 프로젝트 목록 (기간, 소속, 역할, Git URL)
- **성과 요약**: 정량적 성과 중심 리포트
- **회사 통합 리포트**: 회사별 프로젝트 그룹핑

### 7. 회사별 정리 (v1.2 신규)
- 회사별 타임라인 뷰
- 회사별 기술 스택 자동 집계
- 프로젝트 그룹핑 API

### 8. AI & CLI 설정 (v1.3 신규)
- **Claude Code CLI 상태 확인**
  - 설치 여부 감지 (플랫폼별 경로 탐색)
  - 버전 확인 및 최신 버전 비교
  - 설치/업데이트 명령어 안내
  - npm registry에서 최신 버전 조회
- **LLM Provider 설정**
  - OpenAI, Anthropic, Gemini API 키 관리
  - API 키 암호화 저장 (Fernet)
  - API 키 유효성 검증 (실제 API 호출)
  - 기본 Provider 선택

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| State | Zustand, TanStack Query |
| LLM | OpenAI (GPT-4) + Anthropic (Claude) - 설정에서 선택 |
| Document | python-docx, reportlab, PyPDF2 |
| GitHub | OAuth App (다중 사용자 지원) |

---

## 6단계 파이프라인 (aircok 패턴 적용)

```
Step 1: GitHub Analysis    → 커밋 분석, 통계 추출
Step 2: Code Extraction    → 코드 패턴, 아키텍처 탐지
Step 3: Tech Detection     → 기술 스택 자동 탐지
Step 4: LLM Summarization  → AI 기반 요약 생성
Step 5: Template Mapping   → 플랫폼별 템플릿 매핑
Step 6: Document Gen       → DOCX/PDF/MD 생성
```

---

## 프로젝트 구조

```
C:\Users\kimsehun\Desktop\proj\Autopolio\
├── api/                      # FastAPI 백엔드
│   ├── main.py               # 엔트리포인트
│   ├── config.py             # 설정 관리
│   ├── database.py           # DB 연결
│   ├── models/               # SQLAlchemy 모델
│   │   ├── user.py           # 사용자
│   │   ├── company.py        # 회사/조직
│   │   ├── project.py        # 프로젝트
│   │   ├── achievement.py    # 성과
│   │   ├── repo_analysis.py  # 레포 분석 결과
│   │   ├── template.py       # 템플릿
│   │   ├── document.py       # 생성 문서
│   │   └── job.py            # 작업 추적
│   ├── schemas/              # Pydantic 스키마
│   │   ├── user.py
│   │   ├── company.py
│   │   ├── project.py
│   │   ├── template.py
│   │   ├── document.py
│   │   ├── job.py
│   │   ├── github.py
│   │   ├── pipeline.py
│   │   └── llm.py            # v1.3 LLM/CLI 스키마
│   ├── routers/              # API 엔드포인트
│   │   ├── users.py
│   │   ├── github.py
│   │   ├── knowledge/
│   │   │   ├── companies.py
│   │   │   ├── projects.py
│   │   │   └── achievements.py
│   │   ├── templates.py
│   │   ├── pipeline.py
│   │   ├── documents.py
│   │   └── llm.py            # v1.3 LLM/CLI API
│   └── services/             # 비즈니스 로직
│       ├── encryption_service.py
│       ├── task_service.py   # aircok 패턴 적용
│       ├── github_service.py
│       ├── llm_service.py
│       ├── cli_service.py    # v1.3 CLI 감지 서비스
│       ├── document_service.py
│       ├── pipeline_service.py
│       ├── achievement_service.py  # v1.2 성과 자동 감지
│       └── report_service.py       # v1.2 리포트 생성
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── api/              # API 클라이언트
│   │   │   ├── client.ts
│   │   │   ├── users.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── github.ts
│   │   │   ├── templates.ts
│   │   │   ├── pipeline.ts
│   │   │   ├── documents.ts
│   │   │   └── llm.ts        # v1.3 LLM/CLI API 클라이언트
│   │   ├── components/       # UI 컴포넌트
│   │   │   ├── ui/           # Shadcn/ui 컴포넌트
│   │   │   ├── icons/        # 커스텀 아이콘
│   │   │   │   └── LLMIcons.tsx  # v1.3 LLM Provider 아이콘
│   │   │   ├── CLIStatusCard.tsx     # v1.3 CLI 상태 카드
│   │   │   ├── LLMProviderCard.tsx   # v1.3 LLM Provider 카드
│   │   │   └── Layout.tsx
│   │   ├── pages/            # 페이지 컴포넌트
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Setup/
│   │   │   ├── Knowledge/
│   │   │   │   ├── Companies.tsx
│   │   │   │   ├── CompanyTimeline.tsx  # v1.2 타임라인 뷰
│   │   │   │   └── Projects.tsx
│   │   │   ├── Templates/
│   │   │   │   ├── index.tsx
│   │   │   │   └── Editor.tsx           # v1.2 템플릿 에디터
│   │   │   ├── Generate/
│   │   │   ├── Documents/
│   │   │   └── History.tsx
│   │   ├── stores/           # Zustand 스토어
│   │   │   ├── userStore.ts
│   │   │   └── pipelineStore.ts
│   │   └── lib/
│   │       └── utils.ts
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── Dockerfile
├── config/                   # YAML 설정
│   ├── settings.yaml
│   └── platforms.yaml
├── data/                     # 런타임 데이터
│   ├── templates/
│   └── autopolio.db
├── result/                   # 생성 문서
├── requirements.txt
├── docker-compose.yml
├── Dockerfile.api
├── start-dev.bat             # Windows 개발 스크립트
├── start-dev.sh              # Linux/Mac 개발 스크립트
├── .env.example
├── .env
├── .gitignore
├── README.md
└── CLAUDE.md                 # 이 문서
```

---

## 데이터베이스 스키마

### 핵심 테이블

```sql
-- 사용자 (v1.3 API 키 컬럼 추가)
users (id, name, email, github_username, github_token_encrypted, settings,
       openai_api_key_encrypted, anthropic_api_key_encrypted, gemini_api_key_encrypted)

-- 회사/조직
companies (id, user_id, name, position, start_date, end_date, description)

-- 프로젝트 (portfolio PROJECTS.md 구조)
projects (id, user_id, company_id, name, start_date, end_date,
          team_size, description, role, git_url, is_analyzed)

-- 기술 스택
technologies (id, name, category)
project_technologies (project_id, technology_id, is_primary)

-- 성과 (PROJECT_PERFORMANCE_SUMMARY 구조)
project_achievements (id, project_id, metric_name, metric_value, description)

-- 레포 분석 결과
repo_analyses (id, project_id, git_url, total_commits, lines_added,
               lines_deleted, detected_technologies, commit_messages_summary)

-- 템플릿
templates (id, user_id, name, platform, template_content, field_mappings, is_default)

-- 생성 문서
generated_documents (id, user_id, template_id, document_name, file_path, format, created_at)

-- 작업 추적 (aircok TaskService 패턴)
jobs (id, task_id, user_id, job_type, status, progress, current_step, error_message, created_at, updated_at)
```

---

## API 엔드포인트

### 사용자 관리
```
POST   /api/users              # 사용자 생성
GET    /api/users/{id}         # 사용자 조회
PUT    /api/users/{id}         # 사용자 수정
```

### GitHub 연동
```
GET    /api/github/connect         # OAuth 인증 URL
GET    /api/github/callback        # OAuth 콜백
GET    /api/github/status          # 연동 상태 확인 (v1.2) ✨
GET    /api/github/repos           # 레포지토리 목록
GET    /api/github/repo-info       # 레포지토리 기본 정보 (auto-fill용)
GET    /api/github/detect-technologies  # 기술 스택 감지 (LLM 미사용, 빠름)
POST   /api/github/analyze         # 레포지토리 전체 분석
GET    /api/github/analysis/{id}   # 분석 결과 조회
POST   /api/github/generate-description  # AI 설명 생성 (LLM 사용)
DELETE /api/github/disconnect      # GitHub 연동 해제
```

### Base Knowledge
```
# 회사
GET    /api/knowledge/companies
POST   /api/knowledge/companies
GET    /api/knowledge/companies/{id}/summary        # 회사 요약 (v1.2) ✨
GET    /api/knowledge/companies/grouped-by-company  # 회사별 그룹핑 (v1.2) ✨
PUT    /api/knowledge/companies/{id}
DELETE /api/knowledge/companies/{id}

# 프로젝트
GET    /api/knowledge/projects
POST   /api/knowledge/projects
GET    /api/knowledge/projects/{id}
PUT    /api/knowledge/projects/{id}
DELETE /api/knowledge/projects/{id}

# 성과
GET    /api/knowledge/projects/{id}/achievements
POST   /api/knowledge/projects/{id}/achievements
POST   /api/knowledge/achievements/auto-detect      # 성과 자동 감지 (v1.2) ✨
PUT    /api/knowledge/achievements/{id}
DELETE /api/knowledge/achievements/{id}
```

### 템플릿
```
GET    /api/templates              # 템플릿 목록
POST   /api/templates              # 템플릿 생성
GET    /api/templates/{id}         # 템플릿 조회
PUT    /api/templates/{id}         # 템플릿 수정
DELETE /api/templates/{id}         # 템플릿 삭제
POST   /api/templates/{id}/clone   # 템플릿 복제 (v1.2) ✨
POST   /api/templates/preview      # 템플릿 미리보기 (v1.2) ✨
GET    /api/templates/fields       # 사용 가능한 필드 목록 (v1.2) ✨
POST   /api/templates/upload       # 커스텀 템플릿 업로드
```

### 파이프라인
```
POST   /api/pipeline/run       # 전체 파이프라인 실행
GET    /api/pipeline/tasks/{id} # 작업 상태 조회
DELETE /api/pipeline/tasks/{id} # 작업 취소
```

### 문서
```
GET    /api/documents              # 문서 목록
GET    /api/documents/{id}         # 문서 조회
GET    /api/documents/{id}/download # 문서 다운로드
DELETE /api/documents/{id}         # 문서 삭제

# 리포트 생성 (v1.2) ✨
GET    /api/documents/reports/projects           # PROJECTS.md 스타일 리포트
GET    /api/documents/reports/performance        # 성과 요약 리포트
GET    /api/documents/reports/company-integrated # 회사 통합 리포트
```

### LLM & CLI (v1.3 신규) ✨
```
GET    /api/llm/config              # LLM 설정 및 CLI 상태 조회
PUT    /api/llm/config              # API 키 및 기본 Provider 업데이트
POST   /api/llm/validate/{provider} # API 키 유효성 검증
GET    /api/llm/cli/status          # CLI 설치 상태 확인
POST   /api/llm/cli/refresh         # CLI 상태 새로고침
GET    /api/llm/providers           # 지원 Provider 목록
```

---

## 프론트엔드 페이지 구조

```
/dashboard              # 메인 대시보드 - 통계, 최근 활동
/setup                  # 초기 설정 위자드
  /github               # GitHub 연결 (상태 확인 포함)
  /import               # 기존 데이터 임포트
/knowledge              # Base Knowledge 관리
  /companies            # 회사 목록/편집
  /companies/timeline   # 회사별 타임라인 뷰 (v1.2) ✨
  /projects             # 프로젝트 목록/편집
  /projects/:id         # 프로젝트 상세 (성과 포함)
/templates              # 템플릿 관리
  /new                  # 새 템플릿 생성 (v1.2) ✨
  /:id/edit             # 템플릿 편집 (v1.2) ✨
  /upload               # 템플릿 업로드
/generate               # 문서 생성
  /pipeline             # 파이프라인 실행 (6단계 진행 표시)
/documents              # 생성 문서 목록
  /:id                  # 미리보기/다운로드
/history                # 작업 이력
```

---

## 개발 명령어

### 백엔드
```bash
# 가상환경 생성 및 활성화
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# 의존성 설치
pip install -r requirements.txt

# 서버 실행
python -m uvicorn api.main:app --reload --port 8000
```

### 프론트엔드
```bash
cd frontend

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

### Docker
```bash
# 전체 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 종료
docker-compose down
```

### 개발 스크립트
```bash
# Windows - 전체 개발 환경 실행
start-dev.bat

# Linux/Mac
chmod +x start-dev.sh
./start-dev.sh
```

---

## 환경 변수 (.env)

| 변수 | 설명 | 필수 |
|------|------|------|
| `ENCRYPTION_KEY` | Fernet 암호화 키 (토큰 암호화) | O |
| `LLM_PROVIDER` | LLM 제공자 (openai/anthropic) | O |
| `OPENAI_API_KEY` | OpenAI API 키 | △ |
| `ANTHROPIC_API_KEY` | Anthropic API 키 | △ |
| `GITHUB_CLIENT_ID` | GitHub OAuth Client ID | O |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Client Secret | O |
| `DATABASE_URL` | SQLite DB 경로 (기본: data/autopolio.db) | - |

---

## 참조 프로젝트 구조

### portfolio 프로젝트 (`C:\Users\kimsehun\Desktop\proj\portfolio`)
```
portfolio/
├── projects/                           # 프로젝트 문서
│   ├── projects.md                     # 25개 프로젝트 목록
│   ├── DETAILED_COMPLETION_REPORT_COMPLETE.md
│   ├── FINAL_PROJECT_REPORT.md
│   └── PROJECT_PERFORMANCE_SUMMARY.md
├── repos/                              # Git 저장소 클론 (분석용)
├── templates/                          # 플랫폼별 템플릿
│   ├── saramin_template_*.md           # 사람인 템플릿 (1,2,3)
│   ├── wanted_template_*.md            # 원티드 템플릿
│   ├── remember_template_*.md          # 리멤버 템플릿
│   └── notion_template_*.md            # 노션 템플릿
├── CLAUDE.md                           # 작업 요약
└── backup/                             # 백업 파일들
```

### aircok_backoffice 참조 패턴
- **TaskService**: 비동기 작업 관리, 진행 상태 추적
- **PipelineService**: 단계별 파이프라인 실행
- **6단계 분석 파이프라인**: 데이터 수집 → 분석 → 리포트 생성

---

## 주요 서비스 설명

### TaskService (aircok 패턴)
- 비동기 작업 생성 및 관리
- 진행률 실시간 업데이트
- 작업 상태 추적 (pending, running, completed, failed)

### PipelineService
- 6단계 파이프라인 순차 실행
- 각 단계별 진행 상태 관리
- 에러 발생 시 롤백 처리

### GitHubService
- OAuth App 인증 플로우
- 레포지토리 목록 조회
- 커밋 내역 및 파일 분석
- **기술 스택 자동 감지 (200+ 기술)**
  - `_parse_package_json()`: JavaScript/TypeScript 75+ 기술
  - `_parse_requirements()`: Python 80+ 기술
  - `_parse_pyproject_toml()`: Python (Poetry/Hatch)
  - `_parse_pom_xml()`: Java/Spring 15+ 기술
  - `_parse_build_gradle()`: Java/Kotlin (Gradle) 15+ 기술
  - `_parse_pubspec_yaml()`: Flutter/Dart 15+ 기술
  - `_parse_composer_json()`: PHP 20+ 기술
  - 50+ 설정 파일 패턴 매칭 (Dockerfile, tsconfig.json 등)

### LLMService
- OpenAI / Anthropic 통합
- 프로젝트 요약 생성
- 템플릿 필드 자동 채움

### DocumentService
- python-docx: DOCX 생성
- reportlab: PDF 생성
- Markdown 변환

### AchievementService (v1.2 신규)
- 커밋 메시지에서 성과 패턴 감지
- 프로젝트 설명에서 성과 추출
- 코드 통계 기반 성과 생성
- LLM 기반 성과 생성 (선택)
- 성과 패턴: 성능(%), 효율성(배), 정확도(%), 감소(%)

### ReportService (v1.2 신규)
- `generate_projects_md()`: PROJECTS.md 스타일 리포트
- `generate_performance_summary()`: 정량적 성과 요약
- `generate_company_integrated_report()`: 회사별 통합 리포트

### CLIService (v1.3 신규)
- Claude Code CLI 설치 감지 (플랫폼별 경로 탐색)
- `where`/`which` 명령으로 PATH 탐색
- 알려진 설치 경로 직접 확인 (npm, homebrew 등)
- npm registry에서 최신 버전 조회
- 플랫폼별 설치 명령어 제공

---

## 구현 완료 항목

### Phase 1: 기본 인프라 ✅
- FastAPI 프로젝트 셋업
- SQLite 데이터베이스 + SQLAlchemy 모델
- React + Vite + Tailwind + Shadcn/ui 셋업
- TaskService 구현 (aircok 패턴)

### Phase 2: Base Knowledge ✅
- 회사/프로젝트/성과 CRUD API
- Knowledge 관리 프론트엔드
- portfolio 프로젝트 데이터 임포트 기능

### Phase 3: GitHub 연동 ✅
- GitHub OAuth App 연동
- 레포지토리 분석 서비스
- 분석 결과 저장 및 표시

### Phase 4: 템플릿 시스템 ✅
- 5개 기본 템플릿 (portfolio에서 가져오기)
- 템플릿 CRUD
- Word/PDF 업로드 및 파싱

### Phase 5: 파이프라인 구현 ✅
- 6단계 파이프라인 서비스
- LLM 요약 생성
- 진행 상태 실시간 표시

### Phase 6: 문서 생성 ✅
- DOCX/PDF/Markdown 생성
- 미리보기 기능
- 다운로드 기능

### Phase 7: 마무리 ✅
- Dashboard 통계
- 에러 처리 및 검증
- Docker 설정

---

## 작업 규칙

### 코드 품질 원칙 ⚠️ 필수
1. **죽은 코드 정리**: 사용하지 않는 import, 함수, 변수, 파일은 즉시 제거
2. **공통 모듈화**: 반복되는 로직은 공통 유틸/서비스로 추출
3. **재사용성 고려**: 컴포넌트/함수 설계 시 재사용 가능하도록 구현
4. **깨끗한 구조**: 단일 책임 원칙, 명확한 폴더 구조 유지
5. **E2E 테스트**: 기능 구현 시 반드시 브라우저에서 실제 동작 검증

### 구현 시 체크리스트
- [ ] 사용하지 않는 import 제거
- [ ] 중복 코드 공통 모듈로 추출
- [ ] 타입 정의 명확히 (TypeScript)
- [ ] 에러 핸들링 일관성 유지
- [ ] E2E 테스트로 동작 검증

### Git 작업 규칙 ⚠️ 중요
- **모든 git 명령어 실행 전 반드시 사용자 허락 필요**
- 커밋 생성 전 반드시 사용자 확인 필요
- 원격 저장소 푸시 전 반드시 사용자 승인 필요
- 자동으로 커밋/푸시하지 않음
- `git add`, `git commit`, `git push`, `git reset`, `git rebase` 등 모든 git 작업 전 확인

### 파일 수정 규칙
- 기존 파일 수정 시 백업 고려
- API 변경 시 스키마와 라우터 동시 수정
- 프론트엔드 API 클라이언트 동기화 유지

### 데이터베이스 규칙
- 마이그레이션 필요 시 Alembic 사용
- 스키마 변경 시 기존 데이터 보존 고려

### Docker 규칙 ⚠️ 필수
- **코드 수정 완료 후 반드시 Docker 재빌드 및 재시작**
- `npm run build`로 프론트엔드 빌드 검증 후 Docker 빌드
- 수정 완료 시 다음 명령어 자동 실행:
  ```bash
  # 프론트엔드 빌드 검증
  cd frontend && npm run build

  # Docker 재빌드 (변경된 서비스만)
  docker-compose build frontend  # 또는 api

  # 컨테이너 재시작
  docker-compose up -d
  ```
- 사용자가 별도로 요청하지 않아도 수정 완료 시 자동으로 수행

---

## 접속 정보

- **Frontend**: http://localhost:5173
- **API Docs (Swagger)**: http://localhost:8000/docs
- **API Docs (ReDoc)**: http://localhost:8000/redoc

---

## 버전 히스토리

### v1.3 (2026-01-21)
- **AI & CLI 설정 페이지**
  - Claude Code CLI 설치 상태 감지
  - 버전 확인 및 최신 버전 비교
  - 플랫폼별 설치/업데이트 명령어 안내
- **LLM Provider 관리**
  - OpenAI, Anthropic, Gemini API 키 설정
  - API 키 암호화 저장 (Fernet)
  - API 키 유효성 검증 (실제 API 호출 테스트)
  - 기본 Provider 선택 기능
- **새로운 컴포넌트**
  - `CLIStatusCard`: CLI 상태 표시 카드
  - `LLMProviderCard`: Provider 설정 카드
  - `LLMIcons`: Provider별 아이콘
- **API 엔드포인트**
  - `/api/llm/config`: 설정 조회/수정
  - `/api/llm/validate/{provider}`: API 키 검증
  - `/api/llm/cli/status`: CLI 상태 조회
  - `/api/llm/providers`: Provider 목록

### v1.2 (2026-01-20)
- **GitHub 연동 상태 확인**
  - `/api/github/status` 엔드포인트 추가
  - 토큰 유효성 검증 및 재연동 안내
  - OAuth 콜백 리디렉션 수정 (frontend_url 설정)
- **템플릿 에디터**
  - 실시간 미리보기 (사용자 데이터로 렌더링)
  - 클릭으로 필드 삽입 (`{{field}}`, `{{#section}}...{{/section}}`)
  - 사용 가능한 필드 목록 (사용자/회사/프로젝트/성과)
  - 시스템 템플릿 복제 기능
- **성과 자동 감지**
  - AchievementService 추가
  - 커밋 메시지/설명에서 패턴 매칭
  - `/api/knowledge/achievements/auto-detect` 엔드포인트
- **리포트 생성**
  - ReportService 추가
  - PROJECTS.md 스타일 리포트
  - 성과 요약 리포트
  - 회사 통합 리포트
- **회사별 정리**
  - 회사 타임라인 뷰 (`/knowledge/companies/timeline`)
  - 회사별 그룹핑 API
  - 기술 스택 자동 집계

### v1.1 (2026-01-20)
- **기술 스택 감지 대폭 확장** (26개 → 200+개)
  - JavaScript/TypeScript: React, Vue, Angular, Next.js, Redux, MUI, Fabric.js, Three.js 등 75+
  - Python: Django, Flask, FastAPI, Django REST Framework, PostgreSQL 드라이버, scikit-learn 등 80+
  - Java/Kotlin: Spring Boot, Spring Security, Hibernate, Lombok, JUnit 등 30+
  - Flutter/Dart: Provider, Riverpod, GetX, Bloc 등 15+
  - PHP: Laravel, Symfony, Composer 등 20+
- **레포 선택 시 자동 기술 스택 감지** (LLM 미사용)
  - `/api/github/detect-technologies` 엔드포인트 추가
  - 프론트엔드에서 레포 선택 시 자동 호출
  - 병렬 API 호출로 UX 개선
- 50+ 설정 파일 패턴 추가 (Dockerfile, tsconfig.json, tailwind.config.js 등)

### v1.0 (2026-01-19)
- 초기 완성 버전
- 전체 6단계 파이프라인 구현
- GitHub OAuth 연동
- 5개 플랫폼 템플릿
- DOCX/PDF/MD 문서 생성
- Docker 배포 설정

---

**작성자**: Claude Code (Opus 4.5)
**문서 버전**: 1.3
**최종 업데이트**: 2026-01-21 KST
