# Autopolio 분석 파이프라인 문서

**버전**: 1.10
**최종 업데이트**: 2026-01-30

---

## 개요

Autopolio는 GitHub 레포지토리를 분석하여 포트폴리오/이력서 문서를 자동 생성합니다. 이 문서는 분석 파이프라인의 구조, 동작 방식, 성능 최적화 내용을 설명합니다.

---

## 분석 플로우

### 단일 레포지토리 분석 (`POST /api/github/analyze`)

```
사용자 요청
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 사용자 검증                                         │
│   - 사용자 존재 확인                                         │
│   - GitHub 토큰 복호화 및 유효성 검증                         │
│   소요시간: ~1초                                             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: GitHub 저장소 분석                                  │
│   ├─ get_repo_info()           → API 1회                    │
│   ├─ get_repo_languages()      → API 1회 (캐싱됨)           │
│   ├─ get_commit_stats()        → API 5회 (페이지네이션)      │
│   ├─ detect_technologies()     → API 40~50회 (병렬)         │
│   └─ get_repo_stats()          → API 50회 (병렬)            │
│   소요시간: 15~30초 (최적화 후)                              │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 분석 결과 저장                                      │
│   - RepoAnalysis 저장                                        │
│   - ProjectTechnology 다중 INSERT                            │
│   - Achievement 자동 감지                                    │
│   소요시간: 3~5초                                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: LLM 콘텐츠 생성 (병렬 처리)                         │
│   ├─ generate_key_tasks()                 → LLM 1회         │
│   ├─ generate_implementation_details()    → LLM 1회 ─┐      │
│   ├─ generate_development_timeline()      → LLM 1회 ─┼ 병렬 │
│   └─ generate_detailed_achievements()     → LLM 1회 ─┘      │
│   소요시간: 10~20초 (API) / 30~60초 (CLI)                   │
└─────────────────────────────────────────────────────────────┘
    ↓
응답 반환
```

---

## 확장 분석 API (v1.10)

### 컨트리뷰터 분석 (`GET /api/github/contributor-analysis/{project_id}`)

```
사용자 요청 (username 파라미터 선택)
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 캐시 확인                                          │
│   - DB에서 기존 분석 결과 조회                               │
│   - 캐시 존재 시 즉시 반환 (refresh=false)                   │
│   소요시간: ~100ms                                          │
└─────────────────────────────────────────────────────────────┘
    ↓ (캐시 없거나 refresh=true)
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: 커밋 내역 조회                                      │
│   - 사용자별 커밋 목록 (최대 100개)                          │
│   - GitHub API: per_page=100, max_pages=1                   │
│   소요시간: 3~5초                                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 커밋 상세 분석 (병렬 처리)                          │
│   ├─ 50개 커밋 상세 조회 (MAX_CONCURRENT_COMMIT_DETAILS=10) │
│   ├─ Conventional Commit 파싱                               │
│   │   - type: feat, fix, refactor, docs, test...           │
│   │   - scope: (auth), (api), (ui)...                       │
│   │   - breaking change 감지                                │
│   ├─ 파일 경로에서 작업 영역 감지                            │
│   │   - frontend, backend, tests, devops, docs, database   │
│   └─ 파일 확장자 집계                                        │
│   소요시간: 5~10초                                           │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: 결과 저장 및 반환                                   │
│   - ContributorAnalysis 모델에 저장                         │
│   소요시간: ~500ms                                           │
└─────────────────────────────────────────────────────────────┘
    ↓
응답 반환
```

### 코드 품질 분석 (`GET /api/github/code-quality/{project_id}`)

```
사용자 요청
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 레포지토리 파일 트리 조회                                    │
│   - Git Trees API (recursive=1)                             │
│   - 전체 파일 목록 1회 호출                                  │
│   소요시간: 2~5초                                            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 파일 분류 및 메트릭 계산                                     │
│   ├─ 코드 파일: .py, .js, .ts, .go, .java 등               │
│   ├─ 테스트 파일: tests/, *.test.*, *.spec.* 등            │
│   ├─ 문서 파일: *.md, docs/, README 등                     │
│   └─ 설정 파일: *.json, *.yaml, config/ 등                 │
│   소요시간: ~100ms                                          │
└─────────────────────────────────────────────────────────────┘
    ↓
응답 반환 (CodeQualityMetrics)
```

### 작업 영역 감지 패턴

| 영역 | 감지 패턴 |
|------|----------|
| frontend | `src/components`, `src/pages`, `*.tsx`, `*.jsx`, `*.vue` |
| backend | `api/`, `server/`, `*.py`, `controllers/`, `routes/` |
| tests | `tests/`, `*.test.*`, `*.spec.*`, `__tests__/` |
| devops | `Dockerfile`, `.github/`, `kubernetes/`, `terraform/` |
| docs | `docs/`, `*.md`, `README`, `CHANGELOG` |
| database | `migrations/`, `models/`, `*.sql`, `prisma/` |
| config | `config/`, `*.yaml`, `*.json`, `.env` |

### Conventional Commit 파싱

```
입력: "feat(auth): add login API"
      ↓
┌─────────────────────────────────────────────────────────────┐
│ 정규식 매칭                                                  │
│   Pattern: ^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$             │
│   ├─ group(1): type = "feat"                               │
│   ├─ group(2): scope = "auth"                              │
│   ├─ group(3): breaking = null                             │
│   └─ group(4): description = "add login API"               │
└─────────────────────────────────────────────────────────────┘
      ↓
출력: {
  "type": "feat",
  "type_label": "New Feature",
  "scope": "auth",
  "description": "add login API",
  "is_breaking": false
}
```

---

## 7단계 파이프라인 (`POST /api/pipeline/run`)

### Step 1: GitHub Analysis
**파일**: `api/services/pipeline_service.py` - `_step_github_analysis()`

- 프로젝트별 GitHub 레포지토리 분석
- **병렬 처리**: 최대 3개 프로젝트 동시 분석 (`MAX_CONCURRENT_GITHUB_ANALYSIS`)
- 이미 분석된 프로젝트는 스킵 (regenerate_summaries 옵션으로 재분석 가능)

### Step 2: Code Extraction
**파일**: `api/services/pipeline_service.py` - `_step_code_extraction()`

- 기존 분석 결과에서 코드 패턴 추출
- 커밋 카테고리 분포 분석

### Step 3: Tech Detection
**파일**: `api/services/pipeline_service.py` - `_step_tech_detection()`

- 감지된 기술 스택 통합 및 빈도 정렬
- 상위 10개 기술을 primary_stack으로 선정

### Step 4: Achievement Detection
**파일**: `api/services/pipeline_service.py` - `_step_achievement_detection()`

- 커밋 메시지 및 프로젝트 데이터에서 성과 패턴 감지
- LLM 미사용 (빠른 패턴 매칭 방식)

### Step 5: LLM Summarization
**파일**: `api/services/pipeline_service.py` - `_step_llm_summarization()`

- 프로젝트별 AI 요약 생성
- **병렬 처리**: 최대 2개 프로젝트 동시 요약 (`MAX_CONCURRENT_LLM_SUMMARY`)
- API 모드 (OpenAI/Anthropic/Gemini) 또는 CLI 모드 (Claude Code/Gemini CLI) 지원

### Step 6: Template Mapping
**파일**: `api/services/pipeline_service.py` - `_step_template_mapping()`

- 사용자/회사/프로젝트 데이터를 템플릿 필드에 매핑
- Mustache 문법 지원

### Step 7: Document Generation
**파일**: `api/services/pipeline_service.py` - `_step_document_generation()`

- DOCX, PDF, Markdown 포맷으로 문서 생성
- 생성된 문서 DB에 저장

---

## 성능 최적화 (v1.9)

### 1. 기술 스택 감지 병렬화

**이전 (순차 처리)**:
```python
for filename in parsed_files:
    content = await self._request(...)  # 40+ 순차 호출
```

**최적화 후 (병렬 처리)**:
```python
semaphore = asyncio.Semaphore(MAX_CONCURRENT_FILE_CHECKS)  # 15
tasks = [self._check_file_for_parsing(...) for filename in parsed_files]
results = await asyncio.gather(*tasks)
```

**효과**: 30초 → 3~5초 (85% 단축)

### 2. 커밋 상세 조회 병렬화

**이전 (순차 처리)**:
```python
for commit in commits_to_analyze:
    details = await self.get_commit_details(...)  # 50 순차 호출
```

**최적화 후 (병렬 처리)**:
```python
semaphore = asyncio.Semaphore(MAX_CONCURRENT_COMMIT_DETAILS)  # 10
tasks = [self._get_commit_details_safe(...) for commit in commits]
results = await asyncio.gather(*tasks)
```

**효과**: 40초 → 5~8초 (85% 단축)

### 3. LLM 호출 병렬화

**이전 (순차 처리)**:
```python
impl = await self._generate_implementation_details(...)  # 10초
timeline = await self._generate_development_timeline(...)  # 10초
achievements = await self._generate_detailed_achievements(...)  # 10초
# 총 30초
```

**최적화 후 (병렬 처리)**:
```python
tasks = [
    self._generate_implementation_details(...),
    self._generate_development_timeline(...),
    self._generate_detailed_achievements(...),
]
results = await asyncio.gather(*tasks)
# 총 10~15초
```

**효과**: 30초 → 10~15초 (50~60% 단축)

### 4. API 중복 호출 제거

**이전**: `get_repo_languages()`가 분석 중 2~3회 중복 호출

**최적화 후**: 세션 내 캐싱
```python
def __init__(self, ...):
    self._languages_cache: Dict[str, Dict[str, float]] = {}

async def get_repo_languages(self, git_url: str):
    cache_key = git_url.lower()
    if cache_key in self._languages_cache:
        return self._languages_cache[cache_key]
    # ... API 호출 ...
    self._languages_cache[cache_key] = result
    return result
```

**효과**: API 호출 30% 감소

### 5. 프로젝트 병렬 분석

**파이프라인에서 다중 프로젝트 분석 시**:
```python
semaphore = asyncio.Semaphore(MAX_CONCURRENT_GITHUB_ANALYSIS)  # 3
tasks = [
    self._analyze_single_project(semaphore, github_service, project, username)
    for project in projects
]
results = await asyncio.gather(*tasks)
```

**효과**: 5개 프로젝트 10~15분 → 3~5분 (60~70% 단축)

---

## 동시성 제한 상수

| 상수 | 값 | 설명 |
|------|-----|------|
| `MAX_CONCURRENT_FILE_CHECKS` | 15 | GitHub 파일 존재 확인 동시 요청 |
| `MAX_CONCURRENT_COMMIT_DETAILS` | 10 | 커밋 상세 정보 동시 조회 |
| `MAX_CONCURRENT_LLM_CALLS` | 3 | LLM API 동시 호출 |
| `MAX_CONCURRENT_GITHUB_ANALYSIS` | 3 | 프로젝트 동시 분석 |
| `MAX_CONCURRENT_LLM_SUMMARY` | 2 | 프로젝트 요약 동시 생성 |
| `MAX_DETAILED_COMMITS` | 50 | 컨트리뷰터 분석 시 상세 조회할 최대 커밋 수 (v1.10) |

---

## 예상 분석 시간

### 단일 레포지토리

| 단계 | v1.8 | v1.9 | 개선율 |
|------|------|------|-------|
| 사용자 검증 | 1초 | 1초 | - |
| GitHub 분석 | 60~120초 | 15~30초 | 75% |
| 결과 저장 | 3~5초 | 3~5초 | - |
| LLM 생성 (API) | 30~40초 | 10~20초 | 50~60% |
| **총합** | **2~3분** | **40~60초** | **60~70%** |

### 5개 프로젝트 파이프라인

| 단계 | v1.8 | v1.9 | 개선율 |
|------|------|------|-------|
| Step 1 (GitHub) | 5~10분 | 2~3분 | 60% |
| Step 5 (LLM) | 2~5분 | 1~2분 | 60% |
| **총합** | **10~15분** | **3~5분** | **60~70%** |

---

## 에러 처리

### 부분 실패 처리

병렬 처리 시 일부 작업이 실패해도 나머지 결과는 유지됩니다:

```python
results = await asyncio.gather(*tasks, return_exceptions=True)

for result in results:
    if isinstance(result, Exception):
        logger.warning("Task failed: %s", result)
        continue
    # 성공한 결과 처리
```

### GitHub API Rate Limit

- 시간당 5,000 요청 제한
- Semaphore로 동시 요청 수 제한하여 Rate Limit 방지
- Rate Limit 발생 시 `GitHubRateLimitError` 발생

### LLM 타임아웃

- API 모드: 기본 타임아웃 (300초)
- CLI 모드: 180초 타임아웃 (`CLI_TIMEOUT_SECONDS`)

---

## 관련 파일

| 파일 | 설명 |
|------|------|
| `api/services/github_service.py` | GitHub API 상호작용 및 분석 (확장 분석 포함) |
| `api/services/pipeline_service.py` | 8단계 파이프라인 오케스트레이션 |
| `api/services/llm_service.py` | LLM API 호출 |
| `api/services/cli_llm_service.py` | CLI LLM 호출 (Claude Code, Gemini CLI) |
| `api/models/contributor_analysis.py` | 컨트리뷰터 분석 모델 (v1.10) |
| `api/routers/github.py` | GitHub 분석 API 엔드포인트 (확장 분석 포함) |
| `api/routers/pipeline.py` | 파이프라인 API 엔드포인트 |

---

## 문서 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|---------|
| 1.10 | 2026-01-30 | 확장 분석 API 섹션 추가 (컨트리뷰터 분석, 코드 품질, Conventional Commit) |
| 1.9 | 2026-01-30 | 초기 문서 작성, 성능 최적화 내용 포함 |
