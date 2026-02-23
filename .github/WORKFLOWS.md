# GitHub Actions Workflows

Autopolio의 CI/CD 파이프라인 및 자동화 워크플로우 가이드.

## 워크플로우 요약

| 워크플로우 | 파일 | 트리거 | 수동 실행 | 설명 |
|-----------|------|--------|----------|------|
| CI Tests | `ci.yml` | push/PR (main) | O | pytest API + Playwright E2E |
| Lint & Type Check | `lint.yml` | push/PR (main) | O | ruff + tsc |
| Security Scan | `security.yml` | push/PR/주간 | O | CodeQL + Bandit |
| Release | `release.yml` | `vX.Y.Z` 태그 | O | Windows exe + macOS dmg |
| Beta Release | `beta-release.yml` | `vX.Y.Z-beta.*` 태그 | O | 프리릴리즈 빌드 |
| Prepare Release | `prepare-release.yml` | 수동만 | O | 버전 범프 + CHANGELOG + PR |
| VirusTotal Scan | `virustotal.yml` | release 게시 | X | 바이너리 악성코드 스캔 |
| PR Labeler | `pr-labeler.yml` | PR 오픈/업데이트 | X | 변경 파일 기반 라벨링 |
| Issue Auto Label | `issue-auto-label.yml` | 이슈 생성 | X | 키워드 기반 라벨링 |
| Stale | `stale.yml` | 매일 00:00 UTC | X | 비활성 이슈/PR 관리 |
| Welcome | `welcome.yml` | PR/이슈 생성 | X | 신규 기여자 환영 |

---

## CI Tests (`ci.yml`)

API 테스트와 E2E 브라우저 테스트를 실행합니다.

**트리거**: `api/`, `frontend/src/`, `tests/`, `config/`, Docker 파일, `pyproject.toml`, `frontend/package.json` 변경 시

**Jobs**:
1. **API Tests (pytest)** - Python 3.11 + uv로 `tests/api/` 실행
   - `requires_github`, `slow` 마커가 붙은 테스트 제외
2. **E2E Tests (Playwright)** - Docker 컨테이너에서 Playwright 실행
   - API (8085) + Frontend (3035) 컨테이너 기동 후 테스트
3. **CI Complete** - 두 job 결과 집계

**시크릿**: `ENCRYPTION_KEY` (선택, 미설정 시 자동 생성)

---

## Lint & Type Check (`lint.yml`)

Python 코드 품질과 TypeScript 타입 검사를 수행합니다.

**Jobs**:
1. **Python Lint (ruff)** - `ruff check` + `ruff format --check`
2. **TypeScript Type Check** - `npx tsc --noEmit`

---

## Security Scan (`security.yml`)

코드 보안 취약점을 분석합니다.

**트리거**: push/PR + 매주 월요일 06:00 UTC

**Jobs**:
1. **CodeQL Analysis** - JavaScript/TypeScript + Python 시맨틱 분석
   - `continue-on-error: true` — Code scanning이 repo 설정에서 비활성화되어 있으면 실패하지만 전체 워크플로우를 차단하지 않음
   - 활성화: Settings > Code security and analysis > Code scanning > Set up
2. **Python Security (Bandit)** - medium 이상 심각도 스캔
   - 결과를 bandit-report.json 아티팩트로 업로드 (30일 보관)

---

## Release (`release.yml`)

정식 릴리즈 빌드 및 GitHub Release 생성.

**트리거**: `v1.19.0` 형식 태그 push (프리릴리즈 제외)

**Jobs**:
1. **Build Windows** - Electron exe 빌드 (번들 Python 포함)
2. **Build macOS** - Electron dmg 빌드
3. **Create GitHub Release** - 에셋 업로드 + SHA256 체크섬

**릴리즈 절차**:
```bash
# 1. prepare-release 워크플로우로 PR 생성 (수동)
# 2. PR 머지
# 3. 태그 생성 및 푸시
git tag v1.20.0
git push origin v1.20.0
# 4. release.yml 자동 실행 → GitHub Release 생성
# 5. virustotal.yml 자동 실행 (VIRUSTOTAL_API_KEY 설정 시)
```

---

## Beta Release (`beta-release.yml`)

베타/RC 프리릴리즈 빌드.

**트리거**: `v1.20.0-beta.1` 또는 `v1.20.0-rc.1` 형식 태그

```bash
git tag v1.20.0-beta.1
git push origin v1.20.0-beta.1
```

---

## Prepare Release (`prepare-release.yml`)

버전 범프, CHANGELOG 업데이트, 릴리즈 PR 자동 생성.

**사용법**: Actions 탭 > Prepare Release > Run workflow
- **version**: `patch` / `minor` / `major`
- **custom_version**: 직접 지정 (예: `1.20.0`)

---

## 시크릿 설정

| 시크릿 | 용도 | 필수 |
|--------|------|------|
| `GITHUB_TOKEN` | 빌트인 (자동 제공) | 자동 |
| `ENCRYPTION_KEY` | CI 테스트용 Fernet 키 | 선택 (자동 생성) |
| `VIRUSTOTAL_API_KEY` | 바이너리 스캔 | 선택 |
| `APPLE_CERTIFICATE` | macOS 코드 서명 | 선택 (미사용) |
| `APPLE_CERTIFICATE_PASSWORD` | 인증서 비밀번호 | 선택 (미사용) |
| `APPLE_TEAM_ID` | Apple 팀 ID | 선택 (미사용) |

설정: Settings > Secrets and variables > Actions > New repository secret

---

## 트러블슈팅

### CodeQL "Code scanning is not enabled"
Settings > Code security and analysis > Code scanning에서 활성화 필요. 비활성화 상태에서도 Bandit 스캔은 정상 동작.

### E2E 테스트 타임아웃
Docker 컨테이너 기동에 최대 120초 대기. 느린 환경에서는 `ci.yml`의 wait 루프 `seq 1 60`과 `sleep 2` 값 조정.

### Lint 실패
```bash
# 로컬에서 자동 수정
ruff check --fix api/ tests/
ruff format api/ tests/
```

### 릴리즈 빌드 실패
- `frontend/package-lock.json` 최신 확인 (`npm install`)
- `npm run python:download:win` / `npm run python:download:mac` 로컬 테스트
- `frontend/release/` 디렉토리의 빌드 산출물 확인

---

## PR 자동 라벨 규칙

| 라벨 | 트리거 경로 |
|------|------------|
| `api` | `api/**` |
| `frontend` | `frontend/src/**` |
| `electron` | `frontend/electron/**` |
| `tests` | `tests/**` |
| `ci` | `.github/**` |
| `docs` | `**/*.md`, `docs/**` |
| `config` | `config/**` |
| `docker` | `Dockerfile*`, `docker-compose*` |
| `dependencies` | `pyproject.toml`, `uv.lock`, `package*.json` |

## 이슈 자동 라벨 키워드

| 라벨 | 키워드 |
|------|--------|
| `bug` | bug, crash, error, broken, fail, exception |
| `enhancement` | feature, request, enhancement, suggestion |
| `documentation` | doc, documentation, readme, typo |
| `performance` | performance, slow, speed, memory, optimization |
| `security` | security, vulnerability, cve, xss, injection |
| `electron` | electron, desktop, exe, dmg, installer |
| `docker` | docker, container, compose |
| `api` | api, backend, fastapi, endpoint |
| `frontend` | frontend, ui, react, component, css |
