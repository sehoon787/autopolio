# Autopolio - 포트폴리오/이력서 자동화 플랫폼

**생성일**: 2026-01-19
**프로젝트 상태**: 완성 (v1.19)
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
- **Gemini CLI 상태 확인** (v1.4)
  - 동일한 다중 경로 탐색 로직
  - npm 전역 패키지 경로 자동 탐색
- **LLM Provider 설정**
  - OpenAI, Anthropic, Gemini API 키 관리
  - API 키 암호화 저장 (Fernet)
  - API 키 유효성 검증 (실제 API 호출)
  - 기본 Provider 선택
- **웹/Electron 모드별 LLM 기본값** (v1.7)
  - 웹: `.env` 설정된 Provider만 표시, 기본값 Gemini
  - 웹: Provider 선택 가능 (API 키 입력 불가, readOnly)
  - Electron: 설치된 CLI 자동 감지 (Claude Code 우선, Gemini CLI 폴백)
  - Electron: CLI 미설치 시 API 모드 자동 전환

### 9. Electron 데스크톱 앱 (v1.4 신규)
- **크로스 플랫폼 배포**
  - Windows exe (NSIS 인스톨러)
  - macOS dmg
  - Linux AppImage
- **로컬 전용 기능**
  - CLI 도구 설치 상태 확인 (Claude Code, Gemini CLI)
  - API 키 로컬 저장 및 관리
  - 로컬 백엔드와 직접 통신
- **Feature Flags**
  - 데스크톱: CLI 상태, API 키 설정 표시
  - 웹: 데스크톱 다운로드 안내 표시
- **OAuth Custom Protocol** (v1.5)
  - `autopolio://oauth-callback` 프로토콜 핸들러
  - 다중 포트 OAuth 콜백 지원 (3035, 3000, 5174, 5199 등)
- **백엔드 안정성** (v1.5)
  - 백엔드 크래시 시 자동 재시작 (최대 3회)
  - `--reload-dir api` 옵션으로 WatchFiles 부하 감소
  - 연결 오류 시 사용자 친화적 메시지 표시

### 10. 국제화(i18n) 지원 (v1.5 신규)
- **다국어 UI 지원**
  - 한국어/영어 전체 UI 번역
  - react-i18next 기반 번역 시스템
  - 언어 설정 저장 및 자동 적용
- **번역된 페이지**
  - 설정 페이지 전체
  - GitHub 설정 페이지
  - 분석 결과 및 편집 UI
  - 날짜 입력 컴포넌트

### 11. 분석 결과 편집 (v1.5 신규)
- **LLM 분석 내용 편집**
  - 자동 생성된 분석 결과 사용자 수정 가능
  - 수정 내용 DB 저장 및 유지
  - 분석 도움말 툴팁
- **진행 중 프로젝트**
  - "진행 중" 체크박스 추가
  - 종료일 없는 프로젝트 표시
- **기술 스택 배지**
  - shields.io 스타일 배지 표시
  - 카테고리별 색상 구분

### 12. 프로젝트 내보내기 (v1.6 신규)
- **성과 보고서 내보내기**
  - PROJECT_PERFORMANCE_SUMMARY.md 스타일 보고서 생성
  - 프로젝트별 "주요 수행 업무" 및 "성과" 포함
  - 전체 프로젝트 개요 통계
  - 목차 자동 생성
- **프로젝트 목록 내보내기**
  - PROJECTS.md 스타일 간단한 목록
  - 기본 프로젝트 정보 (기간, 소속, 역할, 기술스택)
- **내보내기 형식**
  - Markdown (.md)
  - Word 문서 (.docx)
- **미리보기 기능**
  - 내보내기 전 실시간 미리보기
  - 분석된 프로젝트 통계 표시

### 13. 확장 분석 기능 (v1.10 신규)
- **컨트리뷰터별 상세 분석**
  - 로그인 사용자의 기여도만 별도 분석
  - 커밋 수, 라인 추가/삭제 통계
  - 파일 확장자별 작업 분포 (`.py`, `.ts`, `.tsx` 등)
  - 작업 영역 자동 감지 (frontend, backend, tests, devops, docs, database, config)
  - 사용 기술 스택 추출
- **Conventional Commit 파싱**
  - `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style` 자동 분류
  - 커밋 scope 추출 (예: `feat(auth): add login`)
  - Breaking change 감지 (`feat!:`)
- **코드 품질 메트릭**
  - 파일 크기 분포 (평균, 최대)
  - 테스트 파일 비율
  - 문서 파일 비율
  - 코드 파일 비율
  - 언어 분포 (확장자별 비중)
- **분석 데이터 캐싱**
  - ContributorAnalysis 모델로 DB 저장
  - 중복 분석 방지
  - 새로고침 옵션 제공

### 14. 이력서 플랫폼 템플릿 (v1.11 신규)
- **플랫폼별 시스템 템플릿**
  - 사람인: 전통적인 블루 테마 이력서 양식
  - 리멤버: 모던 그라디언트 타임라인 스타일
  - 점핏: 개발자 친화적 그린 카드 스타일
- **HTML 렌더링 및 내보내기**
  - Mustache 템플릿 문법 지원 (`{{field}}`, `{{#section}}...{{/section}}`)
  - 사용자 데이터 자동 채움 (프로젝트, 기술스택, 성과 등)
  - HTML, Markdown, Word(DOCX) 형식으로 내보내기
- **미리보기 기능**
  - 실시간 HTML 미리보기 (iframe)
  - 전체화면 미리보기 모드
  - 인쇄 기능
- **플랫폼 템플릿 관리**
  - 시스템 템플릿 초기화
  - 플랫폼별 색상 및 스타일 정의
  - 필드 매핑 설정 (YAML)

### 15. GitHub Actions CI/CD (v1.19 신규)
- **자동화된 테스트 파이프라인**
  - Push/PR 시 pytest API 테스트 + Playwright E2E 테스트 자동 실행
  - Docker 기반 E2E 테스트 (실제 컨테이너에서 검증)
  - Python ruff 린트/포맷 + TypeScript tsc 타입 체크
- **보안 스캔**
  - CodeQL (JavaScript/TypeScript + Python) 시맨틱 분석
  - Bandit Python 보안 취약점 스캔
  - 주간 자동 보안 스캔 (월요일 06:00 UTC)
- **릴리즈 자동화**
  - `vX.Y.Z` 태그 → Windows exe + macOS dmg 자동 빌드
  - GitHub Release 생성 + SHA256 체크섬
  - 베타/RC 프리릴리즈 지원 (`v*-beta.*`, `v*-rc.*`)
  - VirusTotal 바이너리 악성코드 스캔 (선택)
  - 버전 범프 + CHANGELOG 생성 + 릴리즈 PR 자동화
- **프로젝트 관리 자동화**
  - PR 변경 파일 기반 자동 라벨링 (api, frontend, electron, tests 등)
  - 이슈 키워드 기반 스마트 라벨링
  - 60일 비활성 이슈/PR 자동 경고 + 14일 후 종료
  - 신규 기여자 환영 메시지

### 16. 테스트 인프라 (v1.19 신규)
- **크로스 플랫폼 테스트 스크립트** (`tests/scripts/`)
  - Windows `.bat` + Unix `.sh` 동시 지원
  - 전체 테스트 오케스트레이터 (Docker → pytest → Playwright)
  - API 테스트/E2E 테스트 개별 실행
  - 테스트 DB 초기화 스크립트
  - HTML 리포트 생성
- **Electron Python 런타임 번들링** (`frontend/scripts/download-python.cjs`)
  - python-build-standalone 기반 사전 빌드 Python 다운로드
  - 4개 플랫폼 지원 (win32-x64, darwin-arm64/x64, linux-x64)
  - pyproject.toml 의존성 자동 추출 및 설치
  - 번들 크기 최적화 (불필요 파일 스트리핑)

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| Backend | FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Shadcn/ui |
| Desktop | Electron, electron-builder, electron-serve |
| State | Zustand, TanStack Query |
| i18n | react-i18next, i18next (v1.5) |
| LLM | OpenAI (GPT-4) + Anthropic (Claude) - 설정에서 선택 |
| Document | python-docx, reportlab, PyPDF2 |
| GitHub | OAuth App (다중 사용자 지원) |
| CI/CD | GitHub Actions (v1.19) |
| Security | CodeQL, Bandit, VirusTotal (v1.19) |
| Testing | pytest, Playwright, ruff (v1.19) |

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
│   │   ├── contributor_analysis.py  # v1.10 컨트리뷰터 분석
│   │   ├── template.py       # 템플릿
│   │   ├── platform_template.py  # v1.11 플랫폼 템플릿
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
│   │   ├── llm.py            # v1.3 LLM/CLI 스키마
│   │   └── platform.py       # v1.11 플랫폼 템플릿 스키마
│   ├── routers/              # API 엔드포인트 (v1.14 모듈화)
│   │   ├── users.py
│   │   ├── github/           # GitHub 관련 라우터 분리
│   │   │   ├── github.py          # 메인 라우터
│   │   │   ├── github_analysis.py # 분석 (병렬화 v1.16)
│   │   │   ├── github_batch.py    # 배치 작업
│   │   │   ├── github_edits.py    # 분석 결과 편집
│   │   │   ├── github_jobs.py     # 백그라운드 작업
│   │   │   ├── github_oauth.py    # OAuth 콜백
│   │   │   └── github_repos.py    # 레포지토리 목록
│   │   ├── knowledge/
│   │   │   ├── companies.py
│   │   │   ├── projects.py
│   │   │   ├── achievements.py
│   │   │   ├── credentials.py    # v1.14 자격증/학력/수상
│   │   │   └── crud_factory.py   # v1.14 CRUD 팩토리
│   │   ├── documents/        # 문서 라우터 분리
│   │   │   ├── documents.py
│   │   │   ├── documents_export.py
│   │   │   └── documents_reports.py
│   │   ├── templates.py
│   │   ├── pipeline.py
│   │   ├── llm.py
│   │   ├── platforms.py
│   │   ├── lookup.py         # v1.14 자동완성 API
│   │   └── oauth.py          # v1.14 OAuth 관리
│   └── services/             # 비즈니스 로직 (v1.14 모듈화)
│       ├── achievement/      # 성과 감지
│       ├── analysis/         # 분석 워크플로우 (v1.16 병렬화)
│       │   ├── analysis_job_runner.py   # 백그라운드 분석
│       │   ├── analysis_job_service.py  # 작업 관리
│       │   ├── analysis_workflow.py     # 분석 단계별 로직
│       │   ├── repo_analyzer.py         # 레포 분석
│       │   ├── technology_detection_service.py  # 기술 스택 감지
│       │   └── role_service.py
│       ├── core/             # 공통 서비스
│       │   ├── encryption_service.py
│       │   ├── task_service.py
│       │   ├── lookup_service.py   # v1.14 자동완성
│       │   ├── profile_service.py  # v1.13 프로필
│       │   └── attachment_service.py  # v1.14 첨부파일
│       ├── document/         # 문서 생성
│       ├── docx/             # v1.13 Word 문서 생성기
│       ├── export/           # 내보내기
│       ├── github/           # GitHub API 클라이언트
│       ├── llm/              # LLM 서비스
│       │   ├── llm_service.py
│       │   ├── cli_llm_service.py  # v1.8 CLI LLM
│       │   └── cli_service.py
│       ├── oauth/            # v1.14 OAuth 관리
│       ├── pipeline/         # 파이프라인
│       ├── platform/         # 플랫폼 템플릿
│       ├── report/           # 리포트 생성
│       ├── template/         # 템플릿 렌더링
│       └── user_data/        # 사용자 데이터 수집
├── frontend/                 # React 프론트엔드 + Electron
│   ├── electron/             # v1.4 Electron 메인 프로세스
│   │   ├── main.ts           # Electron 메인 (TypeScript)
│   │   ├── main.js           # 컴파일된 메인 (ES Module)
│   │   ├── preload.js        # 프리로드 스크립트 (CommonJS 필수)
│   │   ├── tsconfig.json     # Electron용 TypeScript 설정
│   │   ├── types/            # v1.15 CLI 타입 정의
│   │   │   └── cli.ts
│   │   └── services/         # v1.15 Electron 서비스
│   │       ├── cli-tool-manager.ts      # CLI 도구 감지/관리
│   │       ├── agent-process-manager.ts # CLI 프로세스 관리
│   │       └── python-env-manager.ts    # Python 환경 관리
│   ├── src/
│   │   ├── api/              # API 클라이언트
│   │   │   ├── client.ts
│   │   │   ├── users.ts
│   │   │   ├── knowledge.ts
│   │   │   ├── github.ts
│   │   │   ├── templates.ts
│   │   │   ├── pipeline.ts
│   │   │   ├── documents.ts
│   │   │   ├── llm.ts        # v1.3 LLM/CLI API 클라이언트
│   │   │   └── platforms.ts  # v1.11 플랫폼 템플릿 API 클라이언트
│   │   ├── components/       # UI 컴포넌트
│   │   │   ├── ui/           # Shadcn/ui 컴포넌트
│   │   │   ├── icons/        # 커스텀 아이콘
│   │   │   │   └── LLMIcons.tsx  # v1.3 LLM Provider 아이콘
│   │   │   ├── CLIStatusCard.tsx     # v1.3 CLI 상태 카드
│   │   │   ├── LLMProviderCard.tsx   # v1.3 LLM Provider 카드
│   │   │   └── Layout.tsx
│   │   ├── locales/          # v1.5 i18n 번역 파일
│   │   │   ├── en/           # 영어
│   │   │   │   ├── common.json
│   │   │   │   ├── settings.json
│   │   │   │   └── github.json
│   │   │   └── ko/           # 한국어
│   │   │       ├── common.json
│   │   │       ├── settings.json
│   │   │       └── github.json
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
│   │   │   ├── Platforms/             # v1.11 플랫폼 템플릿
│   │   │   │   ├── index.tsx          # 템플릿 목록
│   │   │   │   ├── Export.tsx         # 내보내기 페이지
│   │   │   │   └── Preview.tsx        # 미리보기 페이지
│   │   │   └── History.tsx
│   │   ├── stores/           # Zustand 스토어
│   │   │   ├── userStore.ts
│   │   │   └── pipelineStore.ts
│   │   └── lib/
│   │       └── utils.ts
│   ├── scripts/
│   │   └── download-python.cjs  # v1.19 Electron Python 번들러
│   ├── package.json
│   ├── vite.config.ts          # base: './' for Electron
│   ├── electron-builder.json   # v1.4 Electron 빌드 설정
│   ├── tailwind.config.js
│   ├── release/                # v1.4 빌드된 exe/dmg 파일
│   └── Dockerfile
├── .github/                  # v1.19 GitHub Actions CI/CD
│   ├── ISSUE_TEMPLATE/       # 이슈 템플릿
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   ├── labeler.yml           # PR 자동 라벨 설정
│   └── workflows/            # CI/CD 워크플로우
│       ├── ci.yml            # pytest + Playwright 테스트
│       ├── lint.yml          # ruff + tsc 코드 품질
│       ├── security.yml      # CodeQL + Bandit 보안 스캔
│       ├── release.yml       # 정식 릴리즈 빌드
│       ├── beta-release.yml  # 베타/RC 릴리즈
│       ├── prepare-release.yml # 릴리즈 준비 자동화
│       ├── virustotal.yml    # 바이너리 악성코드 스캔
│       ├── pr-labeler.yml    # PR 자동 라벨링
│       ├── issue-auto-label.yml # 이슈 스마트 라벨링
│       ├── stale.yml         # 비활성 이슈/PR 관리
│       └── welcome.yml       # 신규 기여자 환영
├── tests/                    # v1.19 테스트 인프라
│   └── scripts/              # 테스트 실행 스크립트
│       ├── run-all.{sh,bat}         # 전체 테스트
│       ├── run-api-tests.{sh,bat}   # API 테스트
│       ├── run-e2e-tests.{sh,bat}   # E2E 테스트
│       ├── setup-test-db.sh         # DB 초기화
│       └── generate-report.sh       # 리포트 생성
├── config/                   # YAML 설정
│   ├── settings.yaml
│   ├── platforms.yaml
│   └── platform_field_mappings.yaml  # v1.11 필드 매핑 설정
├── data/                     # 런타임 데이터
│   ├── templates/
│   ├── platform_templates/        # v1.11 플랫폼 HTML 템플릿
│   │   ├── saramin.html           # 사람인 이력서 양식
│   │   ├── remember.html          # 리멤버 프로필 양식
│   │   └── jumpit.html            # 점핏 이력서 양식
│   └── autopolio.db
├── result/                   # 생성 문서
├── requirements.txt
├── docker-compose.yml
├── Dockerfile.api
├── start-dev.bat             # Windows 개발 스크립트
├── start-dev.sh              # Linux/Mac 개발 스크립트
├── .env.example
├── .env
├── test_cli.py               # v1.8 CLI LLM 서비스 테스트
├── CHANGELOG.md              # v1.8 변경 이력 (신규)
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

-- 레포 분석 결과 (v1.10 확장)
repo_analyses (id, project_id, git_url, total_commits, lines_added,
               lines_deleted, detected_technologies, commit_messages_summary,
               repo_technologies, all_contributors, code_quality_metrics)

-- 컨트리뷰터별 분석 (v1.10 신규)
contributor_analyses (id, repo_analysis_id, username, email, is_primary,
                      total_commits, first_commit_date, last_commit_date,
                      lines_added, lines_deleted, file_extensions, work_areas,
                      detected_technologies, detailed_commits, commit_types)

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

# 확장 분석 (v1.10 신규) ✨
GET    /api/github/contributors/{project_id}          # 전체 컨트리뷰터 목록
GET    /api/github/contributor-analysis/{project_id}  # 사용자별 상세 분석
GET    /api/github/code-quality/{project_id}          # 코드 품질 메트릭
GET    /api/github/detailed-commits/{project_id}      # 상세 커밋 내역 (Conventional Commit 파싱)
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

### 플랫폼 템플릿 (v1.11 신규) ✨
```
GET    /api/platforms                    # 플랫폼 템플릿 목록
GET    /api/platforms/{id}               # 템플릿 상세 조회
POST   /api/platforms/init-system        # 시스템 템플릿 초기화
POST   /api/platforms/{id}/render        # 사용자 데이터로 렌더링
POST   /api/platforms/{id}/render-from-db # DB 데이터로 렌더링
GET    /api/platforms/{id}/export/html   # HTML 파일 내보내기
GET    /api/platforms/{id}/export/md     # Markdown 파일 내보내기
GET    /api/platforms/{id}/export/docx   # Word 파일 내보내기
POST   /api/platforms/{id}/preview       # 미리보기 HTML 반환
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
/platforms              # 플랫폼 템플릿 (v1.11) ✨
  /:id/export           # 내보내기 페이지
  /:id/preview          # 미리보기 페이지
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
python -m uvicorn api.main:app --reload --port 8085
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

### Electron 데스크톱 앱 (v1.4)
```bash
cd frontend

# Electron 개발 모드 (Vite dev + Electron)
npm run electron:dev

# Windows exe 빌드
npm run electron:build:win

# macOS dmg 빌드
npm run electron:build:mac

# Linux AppImage 빌드
npm run electron:build:linux
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

### CLIService (v1.3, v1.4 개선)
- **Claude Code CLI 감지**
  - `where`/`which` 명령으로 PATH 탐색
  - PowerShell `Get-Command` 폴백 (Windows)
  - `npm root -g`로 npm 전역 패키지 경로 탐색
  - 알려진 설치 경로 직접 확인 (npm, homebrew 등)
  - npm registry에서 최신 버전 조회
- **Gemini CLI 감지** (v1.4)
  - 동일한 다중 경로 탐색 로직 적용
  - `@google/gemini-cli` npm 패키지 버전 조회
- 플랫폼별 설치 명령어 제공

### CLILLMService (v1.8 개선)
- **stdin 기반 프롬프트 전달**
  - 커맨드라인 인수 대신 stdin으로 프롬프트 전달
  - Windows 커맨드라인 길이 제한(~8191자) 우회
  - 긴 프롬프트(2000~5000자) 안정적 처리
- **CLILLMProvider 래퍼 클래스**
  - LLMService 인터페이스와 호환
  - `provider.generate()` 메서드 지원
  - 시스템 프롬프트 프리펜드 처리
- **Windows npm 전역 경로 탐색**
  - `.cmd` 파일 우선 탐색
  - `%APPDATA%\npm` 경로 직접 확인
  - `shutil.which` 폴백
- **향상된 로깅 및 에러 핸들링**
  - 프롬프트 길이(문자/바이트) 로깅
  - JSON 파싱 실패 시 상세 진단
  - stderr 출력 포함한 에러 메시지

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

### E2E 테스트 규칙 ⚠️ 필수
- **프론트엔드/백엔드 테스트 시 반드시 Docker로 진행**
- 브라우저 테스트 전에 Docker 재빌드 및 `docker-compose up -d` 실행
- 로컬 dev 서버(vite dev, uvicorn)가 아닌 Docker 컨테이너에서 테스트
- 테스트 절차:
  ```bash
  # 1. Docker 재빌드
  docker-compose build

  # 2. 컨테이너 시작
  docker-compose up -d

  # 3. 브라우저에서 테스트 진행
  # http://localhost:3035 (또는 Docker 설정에 따른 포트)
  ```

---

## 접속 정보

- **Frontend**: http://localhost:3035
- **API Docs (Swagger)**: http://localhost:8085/docs
- **API Docs (ReDoc)**: http://localhost:8085/redoc

---

## 버전 히스토리

### v1.19 (2026-02-23)
- **GitHub Actions CI/CD 인프라**
  - CI 테스트: pytest API + Playwright E2E (Docker 기반)
  - 코드 품질: ruff 린트/포맷 + tsc 타입 체크
  - 보안 스캔: CodeQL + Bandit (주간 자동 실행)
  - 릴리즈 자동화: 태그 기반 exe/dmg 빌드 + GitHub Release + SHA256
  - 베타/RC 프리릴리즈 지원
  - 릴리즈 준비: 버전 범프 + CHANGELOG + PR 자동화
  - VirusTotal 바이너리 악성코드 스캔
  - PR/이슈 자동 라벨링, Stale 관리, 신규 기여자 환영
  - 이슈 템플릿 (버그 리포트, 기능 요청)
- **테스트 실행 스크립트** (`tests/scripts/`)
  - Windows `.bat` + Unix `.sh` 크로스 플랫폼 지원
  - 전체/API/E2E 테스트 개별 실행
  - 테스트 DB 초기화 + HTML 리포트 생성
- **Electron Python 런타임 번들러** (`frontend/scripts/download-python.cjs`)
  - python-build-standalone 기반 4개 플랫폼 Python 번들링
  - pyproject.toml 의존성 자동 추출 + 번들 크기 최적화
- **파일 정리**
  - 디버그 JSON/PNG 70개 파일 삭제
  - .gitignore에 디버그 패턴, 빌드 아티팩트 패턴 추가

### v1.18 (2026-02-23)
- **Electron Profile Build 보안 강화**
  - `.py` 소스코드 제거 → `.pyc` 바이트코드만 패키징
  - `frontend/scripts/prepare-electron-api.py` 빌드 스크립트 추가
  - `compileall.compile_dir(legacy=True)`로 인플레이스 `.pyc` 컴파일
  - Python 3.11 버전 호환성 검증
  - `electron:build` 시 자동으로 `prepare:electron-api` 실행
- **민감 엔드포인트 조건부 등록**
  - `AUTOPOLIO_RUNTIME` 환경변수 기반 런타임 프로파일
  - `/api/llm/keys` (복호화된 API 키 반환) → Electron 전용
  - `api/routers/llm_keys.py`로 분리, `electron` 모드에서만 등록
  - Web/Docker 모드에서는 404 반환 (엔드포인트 자체가 미등록)
- **Electron 빌드 파이프라인 변경**
  - `electron-builder.json`: `"from": "../api"` → `"from": "_electron_api/api"`
  - `.pyc` 파일 포함, `.py` 파일 제외 (방어적 필터)
  - `python-env-manager.ts`: `main.pyc` 존재 체크 추가
  - `backend-manager.ts`: `AUTOPOLIO_RUNTIME=electron` 환경변수 전달

### v1.16 (2026-02-08)
- **LLM 분석 병렬화**
  - Steps 5.2 (key_tasks + detailed_content) + 5.3 (development_timeline + achievements) `asyncio.gather` 병렬 실행
  - 동기 분석 엔드포인트 (`github_analysis.py`) 및 백그라운드 분석 (`analysis_job_runner.py`) 모두 적용
  - 타이밍 로그 추가 (`[Analyze] Steps 5.2+5.3 parallel completed in %.1fs`)
- **병렬화 단위 테스트**
  - `tests/test_parallel_verify.py`: 4개 테스트 케이스
  - 동기/백그라운드 병렬 실행, 에러 격리, 순차 의존성 검증
- **.gitignore 정리**
  - `*.ps1`, `extracted_asar/`, `.claude/`, `frontend/release/`, `frontend/python-runtime/` 등 추가
  - 불필요 파일 삭제 (`frontend/python-env-manager.js`)

### v1.15 (2026-02-07)
- **GitHub CLI 인증 (Electron)**
  - `gh` CLI 설치 감지 및 Device Code OAuth 플로우
  - `cli-tool-manager.ts`: 다중 경로 CLI 도구 감지
  - `agent-process-manager.ts`: CLI 프로세스 관리
- **GitHub CLI 레포 목록**
  - 5단계 다중 엔드포인트 집계 (user repos, orgs, collaborator, search)
  - 중복 제거 및 정렬
- **Python 환경 관리자**
  - `python-env-manager.ts`: 번들/시스템 Python 감지
  - Electron 빌드 시 Python 런타임 번들링 지원
- **RepoSelector 듀얼 모드**
  - 웹: GitHub OAuth API 기반 레포 목록
  - Electron: `gh` CLI 기반 레포 목록
- **Electron 서비스 모듈화**
  - `frontend/electron/services/` 디렉토리 구조
  - `frontend/electron/types/` 타입 정의

### v1.14 (2026-02-05)
- **자격증/학력/수상 관리 시스템**
  - `credentials.py` 라우터: 자격증, 학력, 수상 CRUD
  - `CredentialBase`, `EducationBase`, `AwardBase` 모델
- **CRUD 팩토리 패턴**
  - `crud_factory.py`: 공통 CRUD 엔드포인트 자동 생성
  - 반복 코드 제거, 일관된 API 패턴
- **자동완성 서비스**
  - `lookup_service.py`: 대학교, 자격증 이름 자동완성
  - `lookup.py` 라우터
- **백엔드 서비스 모듈화**
  - `api/services/` 하위 디렉토리 구조 재편
  - `analysis/`, `core/`, `document/`, `docx/`, `export/`, `github/`, `llm/`, `oauth/`, `pipeline/`, `platform/`, `report/`, `template/`, `user_data/`
- **라우터 모듈화**
  - `api/routers/github/`: GitHub 관련 라우터 분리 (6개 파일)
  - `api/routers/knowledge/`: Knowledge 관련 라우터 분리
  - `api/routers/documents/`: 문서 관련 라우터 분리
- **OAuth 관리**
  - `oauth.py` 라우터, `oauth/` 서비스 모듈
- **첨부파일 서비스**
  - `attachment_service.py`: 파일 업로드/다운로드 관리

### v1.13 (2026-02-03)
- **백그라운드 분석 작업 시스템**
  - `analysis_job_runner.py`: 백그라운드 분석 실행
  - `analysis_job_service.py`: 작업 상태 관리
  - `analysis_workflow.py`: 분석 단계별 로직 분리
- **Word 문서 생성기**
  - `api/services/docx/`: 한국어 이력서 Word 문서 생성
  - 테이블, 스타일, 한글 폰트 지원
- **사용자 프로필 관리**
  - `profile_service.py`: 프로필 CRUD
- **E2E 테스트 인프라**
  - Playwright 기반 테스트 설정

### v1.12 (2026-02-01)
- **백그라운드 분석 진행 UI**
  - 분석 작업 진행률 실시간 표시
  - 작업 상태 폴링 및 완료 알림
- **레포 선택기 소유자 필터**
  - 레포지토리를 소유자(org/user)별로 필터링
- **프로젝트 배치 삭제**
  - 다중 프로젝트 선택 후 일괄 삭제
- **데이터베이스 인덱스 추가**
  - 주요 쿼리 성능 개선을 위한 인덱스

### v1.11 (2026-01-30)
- **이력서 플랫폼 템플릿 기능 추가**
  - 사람인, 리멤버, 점핏 3개 플랫폼 시스템 템플릿 제공
  - 각 플랫폼별 고유 스타일링 (색상, 레이아웃)
  - Mustache 템플릿 문법으로 동적 데이터 렌더링
- **HTML 내보내기 및 미리보기**
  - HTML, Markdown, Word(DOCX) 형식 내보내기
  - 실시간 미리보기 (iframe 렌더링)
  - 전체화면 미리보기 모드
  - 인쇄 기능
- **새로운 모델**
  - `PlatformTemplate`: 플랫폼 템플릿 저장 (HTML, CSS, 필드 매핑)
- **새로운 API 엔드포인트**
  - `GET /api/platforms`: 템플릿 목록
  - `POST /api/platforms/init-system`: 시스템 템플릿 초기화
  - `POST /api/platforms/{id}/render`: 데이터 렌더링
  - `GET /api/platforms/{id}/export/html|md|docx`: 내보내기
- **새로운 서비스**
  - `PlatformTemplateService`: 템플릿 CRUD, 렌더링, 내보내기
- **프론트엔드 페이지**
  - `/platforms`: 플랫폼 템플릿 목록
  - `/platforms/:id/export`: 내보내기 페이지
  - `/platforms/:id/preview`: 미리보기 페이지
- **i18n 지원**
  - 한국어/영어 플랫폼 관련 번역 추가

### v1.10 (2026-01-30)
- **확장 분석 기능 추가**
  - 컨트리뷰터별 상세 분석 (사용자 기여도만 별도 분석)
  - Conventional Commit 파싱 (feat, fix, refactor, docs, test 등 자동 분류)
  - 작업 영역 자동 감지 (frontend, backend, tests, devops, docs, database, config)
  - 코드 품질 메트릭 (파일 크기, 테스트 비율, 문서 비율, 언어 분포)
- **새로운 모델**
  - `ContributorAnalysis`: 컨트리뷰터별 분석 결과 저장
  - 복합 인덱스 추가 (`repo_analysis_id` + `username`)
- **RepoAnalysis 모델 확장**
  - `repo_technologies`: 레포 전체 기술 스택
  - `all_contributors`: 전체 컨트리뷰터 요약
  - `contributors` relationship 추가
- **새로운 API 엔드포인트**
  - `GET /api/github/contributors/{project_id}`: 전체 컨트리뷰터 목록
  - `GET /api/github/contributor-analysis/{project_id}`: 사용자별 상세 분석
  - `GET /api/github/code-quality/{project_id}`: 코드 품질 메트릭
  - `GET /api/github/detailed-commits/{project_id}`: Conventional Commit 파싱된 커밋 내역
- **GitHubService 확장 메서드**
  - `get_all_contributors()`: 레포지토리 전체 컨트리뷰터 조회
  - `analyze_contributor()`: 특정 사용자의 상세 기여도 분석
  - `analyze_code_quality()`: 코드 품질 메트릭 분석
  - `get_detailed_commits()`: Conventional Commit 파싱된 커밋 내역
  - `_parse_conventional_commit()`: 커밋 메시지 파싱
  - `_detect_work_areas()`: 파일 경로에서 작업 영역 감지
  - `_extract_file_extensions()`: 파일 확장자 추출
  - `_detect_technologies_from_files()`: 파일 패턴으로 기술 감지
- **새로운 스키마**
  - `ContributorAnalysisResponse`, `ContributorSummary`
  - `CodeQualityMetrics`, `FileCountByType`
  - `DetailedCommit`, `ExtendedRepoAnalysisResponse`
- **프론트엔드 API 클라이언트**
  - `getContributors()`, `getContributorAnalysis()`
  - `getCodeQuality()`, `getDetailedCommits()`
- **보안 강화**
  - GitHub 사용자명 정규식 검증 추가

### v1.9 (2026-01-30)
- **분석 성능 대폭 개선 (60~70% 시간 단축)**
  - 기술 스택 감지 병렬화: 40+ 파일 동시 확인 (30초 → 3~5초)
  - 커밋 상세 조회 병렬화: 50개 커밋 동시 조회 (40초 → 5~8초)
  - LLM 호출 병렬화: 3개 LLM 호출 동시 실행 (30초 → 10~15초)
  - 파이프라인 프로젝트 병렬 처리: 동시 분석 (동시성 제한 적용)
- **GitHub API 중복 호출 제거**
  - `get_repo_languages()` 세션 내 캐싱
  - 동일 레포 분석 시 중복 API 호출 방지
- **새로운 병렬화 헬퍼 메서드**
  - `_check_file_for_parsing()`: 의존성 파일 파싱
  - `_check_file_presence()`: 설정 파일 존재 확인
  - `_get_commit_details_safe()`: 커밋 상세 조회
  - `_generate_implementation_details()`: LLM 구현 상세 생성
  - `_generate_development_timeline()`: LLM 타임라인 생성
  - `_generate_detailed_achievements()`: LLM 성과 생성
  - `_analyze_single_project()`: 단일 프로젝트 분석
  - `_generate_single_summary()`: 단일 프로젝트 요약 생성
- **동시성 제한 상수**
  - `MAX_CONCURRENT_FILE_CHECKS = 15`: GitHub API 파일 확인
  - `MAX_CONCURRENT_COMMIT_DETAILS = 10`: 커밋 상세 조회
  - `MAX_CONCURRENT_LLM_CALLS = 3`: LLM API 호출
  - `MAX_CONCURRENT_GITHUB_ANALYSIS = 3`: 프로젝트 분석
  - `MAX_CONCURRENT_LLM_SUMMARY = 2`: LLM 요약 생성
- **예상 성능 개선**
  - 단일 레포 분석: 2~3분 → 40~60초
  - 5개 프로젝트 분석: 10~15분 → 3~5분
- **수정된 파일**
  - `api/services/github_service.py`: 병렬화 적용
  - `api/services/pipeline_service.py`: 병렬화 적용

### v1.8 (2026-01-29)
- **CLI 분석 기능 수정**
  - 프롬프트를 커맨드라인 인수(`-p <prompt>`) 대신 stdin으로 전달
  - Windows 커맨드라인 최대 길이(~8191자) 제한 우회
  - 긴 프롬프트(분석 시 2000~5000자)가 잘리지 않고 정상 전달
  - 특수문자, 한글, 따옴표 등 escape 처리 불필요
- **CLILLMService 개선**
  - `_build_args()`: `-p -` 형식으로 stdin 읽기 지시
  - `subprocess.run()`: `input=prompt_bytes` 파라미터 추가
  - `CLILLMProvider` 래퍼 클래스 추가 (LLMService 인터페이스 호환)
  - Windows npm 전역 경로(`.cmd` 파일) 우선 탐색
  - 타임아웃 120초 → 180초로 증가
- **테스트 스위트 추가**
  - `test_cli.py`: CLI LLM 서비스 테스트
  - 4가지 테스트 케이스: 짧은 프롬프트, 긴 프롬프트(9000+자), 특수문자/한글, 실제 분석 프롬프트
- **향상된 로깅**
  - 프롬프트 길이(문자/바이트) 로깅
  - CLI 실행 명령어 및 파라미터 로깅
  - JSON 파싱 실패 시 raw output 미리보기

### v1.7 (2026-01-27)
- **웹 LLM Provider 선택 기능**
  - 웹 모드에서 `.env` 설정된 LLM Provider 간 선택 가능
  - "현재 선택" 카드 표시 (Provider 이름, 모델, 테스트 버튼)
  - API 키 입력 불가 (readOnly) — 서버 제공 키만 사용
- **플랫폼별 스마트 기본값**
  - 웹: 기본 LLM Provider를 Gemini로 설정, aiMode를 API로 설정
  - Electron: 첫 실행 시 Claude Code / Gemini CLI 설치 여부 자동 감지
  - Electron: Claude Code 설치 → 기본 CLI, Gemini CLI만 설치 → Gemini CLI 기본
  - Electron: CLI 미설치 시 자동으로 API 모드 전환
  - `_defaultsApplied` 플래그로 자동 감지 1회만 실행 (localStorage 영속)
- **수정된 파일**
  - `frontend/src/stores/appStore.ts`: 플랫폼별 기본값, CLI 자동 감지 로직
  - `frontend/src/pages/Settings/sections/LLMSection.tsx`: 웹 Provider 선택 UI

### v1.6 (2026-01-27)
- **프로젝트 내보내기 기능**
  - 분석된 프로젝트를 Markdown/Word 형식으로 내보내기
  - PROJECT_PERFORMANCE_SUMMARY.md 스타일 보고서 생성
    - 프로젝트별 "주요 수행 업무" 및 "성과" 포함
    - 전체 프로젝트 개요 통계 테이블
    - 목차 자동 생성
  - PROJECTS.md 스타일 간단한 목록 내보내기
  - 실시간 미리보기 기능
- **새로운 API 엔드포인트**
  - `GET /api/documents/export/preview`: 내보내기 미리보기
  - `POST /api/documents/export/markdown`: Markdown 내보내기
  - `POST /api/documents/export/docx`: Word 문서 내보내기
  - `GET /api/documents/export/download/{filename}`: 내보낸 파일 다운로드
- **새로운 컴포넌트**
  - `ExportDialog`: 내보내기 옵션 선택 다이얼로그
  - `RadioGroup`: Radix UI 기반 라디오 그룹
- **새로운 서비스**
  - `ExportService`: 내보내기 보고서 생성 서비스
- **i18n 지원**
  - 내보내기 관련 한국어/영어 번역 추가

### v1.5 (2026-01-27)
- **국제화(i18n) 전면 지원**
  - react-i18next 기반 다국어 시스템
  - 한국어/영어 전체 UI 번역
  - 설정 페이지, GitHub 설정 페이지 완전 번역
  - 분석 결과 편집 UI i18n 지원
- **분석 결과 편집 기능**
  - LLM 생성 분석 내용 사용자 편집 가능
  - 수정 내용 DB 저장 및 유지
  - 분석 도움말 툴팁 추가
- **프로젝트 UI 개선**
  - "진행 중" 프로젝트 체크박스
  - shields.io 스타일 기술 배지
  - 설정을 사이드바 하단으로 이동
  - 날짜 표시 문제 수정
- **Electron OAuth 개선**
  - `autopolio://oauth-callback` Custom Protocol 핸들러
  - 다중 포트 OAuth 콜백 지원 (3035, 3000, 5174, 5199 등)
  - Windows .cmd 실행 시 따옴표 처리 수정
- **백엔드 안정성 강화**
  - 백엔드 크래시 시 자동 재시작 (최대 3회)
  - `--reload-dir api` 옵션으로 WatchFiles 부하 감소
  - API 클라이언트에서 연결 오류 감지 및 표시
  - appStore에 backendError 상태 추가
- **CLI 테스트 수정**
  - Windows shell 실행 문제 해결
  - OAuth 다중 포트 감지

### v1.4 (2026-01-22)
- **Electron 데스크톱 앱 지원**
  - Windows exe, macOS dmg, Linux AppImage 빌드
  - `electron-builder`로 패키징
  - `electron-serve`로 정적 파일 서빙 (app:// 프로토콜)
  - Vite `base: './'` 설정으로 상대 경로 지원
- **Electron 프리로드 스크립트**
  - CommonJS 형식 필수 (ES Module 미지원)
  - `contextBridge.exposeInMainWorld`로 안전한 IPC 통신
  - `window.electron` API 노출 (isElectron, getBackendUrl 등)
- **Feature Flags 시스템**
  - `useFeatureFlags` 훅으로 데스크톱/웹 기능 분기
  - CLI 상태, API 키 설정은 데스크톱에서만 표시
  - 웹에서는 데스크톱 다운로드 안내 표시
- **CLI 감지 로직 강화**
  - PowerShell `Get-Command` 폴백 추가 (Windows)
  - `npm root -g`로 npm 전역 패키지 경로 탐색
  - Gemini CLI 감지 지원 추가
- **새로운 파일/폴더**
  - `frontend/electron/`: Electron 메인 프로세스
  - `frontend/electron-builder.json`: 빌드 설정
  - `frontend/release/`: 빌드 출력물
- **빌드 명령어**
  - `npm run electron:dev`: 개발 모드
  - `npm run electron:build:win`: Windows 빌드
  - `npm run electron:build:mac`: macOS 빌드
  - `npm run electron:build:linux`: Linux 빌드

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
**문서 버전**: 1.19
**최종 업데이트**: 2026-02-23 KST
