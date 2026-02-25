# TODO: GitHub Secrets Setup Guide

This document describes how to set up the optional secrets used by CI/CD workflows.
All secrets listed here are **optional** — workflows skip signing/notarization steps when they're missing.

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

## Already Configured Secrets

| Secret | Status |
|--------|--------|
| `GITHUB_TOKEN` | Built-in (automatic) |
| `ENCRYPTION_KEY` | Optional (auto-generated if missing) |
| `VIRUSTOTAL_API_KEY` | Optional (for binary scanning) |
