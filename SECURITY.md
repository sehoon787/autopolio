# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Autopolio, please report it responsibly:

1. **Do NOT open a public GitHub issue.**
2. Email the maintainer at [GitHub Security Advisory](https://github.com/sehoon787/Autopolio/security/advisories/new).
3. Include a clear description, reproduction steps, and potential impact.

We aim to acknowledge reports within 48 hours and provide a fix within 7 days for critical issues.

## Security Measures

- API keys are encrypted at rest using Fernet symmetric encryption
- GitHub OAuth tokens are stored encrypted in the database
- All user input is validated via Pydantic schemas
- SQL injection is prevented by SQLAlchemy ORM (parameterized queries)
- Automated Bandit security scanning runs on every PR
- Dependencies are monitored via Dependabot
