# TODO: CI/CD Setup & Pending Items

## Pending Verification (Actions 분 수 복구 후)

- [ ] Security 워크플로우 검증 — CodeQL 제거 후 Bandit 단독 실행 확인
- [ ] Gemini Code Assist App 검증 — PR에서 `gemini-code-assist[bot]` 인라인 리뷰 확인
- [ ] macOS 빌드 테스트 — Mac 환경에서 `npm run package:mac` 로컬 빌드 확인

## Completed

- [x] GitHub Actions 워크플로우 전체 설정 및 테스트 (CI, Lint, Security, Release, Beta, PR Labeler 등)
- [x] Branch Ruleset 설정 (required checks: CI Complete, Lint Complete, Security Complete)
- [x] CodeQL 제거 (private repo, GHAS 미지원)
- [x] ai-review.yml → Gemini Code Assist App 전환
- [x] `GEMINI_API_KEY` GitHub 시크릿 삭제
- [x] Dependabot PR 7개 머지
- [x] v1.20.0 태그 및 릴리즈 생성 (Windows exe)
- [x] 불필요한 브랜치 정리 완료

## Code Signing (Optional — 비용 발생)

코드 서명 없이도 배포 가능 (사용자가 경고 1회 우회 필요).
비용을 들이지 않을 경우 아래 섹션은 건너뛰어도 됩니다.

---

## Apple Developer (macOS Code Signing & Notarization)

Required secrets: `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`

### Step 1: Apple Developer Account
1. Go to [developer.apple.com](https://developer.apple.com) and enroll ($99/year)
2. Note your **Team ID** from Membership page -> `APPLE_TEAM_ID`

### Step 2: App-Specific Password
1. Go to [appleid.apple.com](https://appleid.apple.com)
2. Sign In -> Security -> App-Specific Passwords -> Generate
3. Name it "GitHub Actions" -> Copy the password -> `APPLE_APP_SPECIFIC_PASSWORD`
4. Your Apple ID email -> `APPLE_ID`

### Step 3: Developer ID Certificate
1. Open Keychain Access on macOS
2. Keychain Access -> Certificate Assistant -> Request a Certificate from a Certificate Authority
3. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
4. Create a "Developer ID Application" certificate using the CSR
5. Download and double-click to install in Keychain

### Step 4: Export as .p12
1. In Keychain Access, find the "Developer ID Application" certificate
2. Right-click -> Export -> Save as .p12
3. Set a password -> `APPLE_CERTIFICATE_PASSWORD`
4. Base64 encode: `base64 -i certificate.p12 | pbcopy` -> `APPLE_CERTIFICATE`

### Step 5: Add to GitHub
```
Settings -> Secrets and variables -> Actions -> New repository secret
- APPLE_ID: your@email.com
- APPLE_APP_SPECIFIC_PASSWORD: xxxx-xxxx-xxxx-xxxx
- APPLE_TEAM_ID: XXXXXXXXXX
- APPLE_CERTIFICATE: <base64 string>
- APPLE_CERTIFICATE_PASSWORD: <your password>
```

---

## Azure Trusted Signing (Windows Code Signing)

Required secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, `AZURE_SIGNING_ENDPOINT`

### Step 1: Azure Account
1. Go to [portal.azure.com](https://portal.azure.com) and create a free account
2. Note your **Subscription ID** -> `AZURE_SUBSCRIPTION_ID`

### Step 2: Azure AD App Registration (for OIDC)
1. Azure Portal -> Azure Active Directory -> App registrations -> New registration
2. Name: "Autopolio GitHub Actions"
3. Supported account types: Single tenant
4. Note **Application (client) ID** -> `AZURE_CLIENT_ID`
5. Note **Directory (tenant) ID** -> `AZURE_TENANT_ID`

### Step 3: Federated Credential (OIDC)
1. In the app registration -> Certificates & secrets -> Federated credentials -> Add credential
2. Federated credential scenario: GitHub Actions
3. Organization: `sehoon787`
4. Repository: `Autopolio`
5. Entity type: Branch -> `main` (or Environment/Tag as needed)
6. Name: "github-actions-main"

### Step 4: Trusted Signing Account
1. Azure Portal -> Search "Trusted Signing" -> Create
2. Resource group: "autopolio-signing"
3. Account name -> `AZURE_SIGNING_ACCOUNT`
4. Region -> Note the endpoint URL -> `AZURE_SIGNING_ENDPOINT` (e.g., `https://eus.codesigning.azure.net`)

### Step 5: Certificate Profile
1. In the Trusted Signing account -> Certificate profiles -> Create
2. Profile name -> `AZURE_SIGNING_PROFILE`
3. Follow identity validation steps (requires business verification)

### Step 6: RBAC Assignment
1. In the Trusted Signing account -> Access control (IAM)
2. Add role assignment: "Trusted Signing Certificate Profile Signer"
3. Assign to the app registration created in Step 2

### Step 7: Add to GitHub
```
Settings -> Secrets and variables -> Actions -> New repository secret
- AZURE_CLIENT_ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- AZURE_TENANT_ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- AZURE_SUBSCRIPTION_ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- AZURE_SIGNING_ACCOUNT: autopolio-signing-account
- AZURE_SIGNING_PROFILE: autopolio-cert-profile
- AZURE_SIGNING_ENDPOINT: https://eus.codesigning.azure.net
```

---

## Verification

### Test Azure Auth
Run the `Test Azure Auth` workflow manually from GitHub Actions tab.

### Test Apple Notarization
Push a tag like `v1.20.0` and check the release workflow logs for notarization steps.

---

## Current Secrets Status

| Secret | Status | 용도 |
|--------|--------|------|
| `GITHUB_TOKEN` | **자동** | 빌트인 |
| `ENCRYPTION_KEY` | **설정됨** | CI 테스트용 Fernet 키 |
| `VIRUSTOTAL_API_KEY` | 미설정 | 바이너리 악성코드 스캔 (선택) |
| `APPLE_*` (5개) | 미설정 | macOS 코드 서명/공증 (선택, $99/년) |
| `AZURE_*` (6개) | 미설정 | Windows 코드 서명 (선택, $9.99/월) |

## GitHub Apps

| App | Status | 용도 |
|-----|--------|------|
| Gemini Code Assist | **설치됨** | AI 코드 리뷰 |
| Dependabot | **활성화** | 의존성 자동 업데이트 |
