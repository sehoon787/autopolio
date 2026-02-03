# Autopolio Test Suite

Comprehensive E2E test infrastructure for the Autopolio portfolio/resume automation platform.

## Directory Structure

```
tests/
├── README.md                    # This file
├── api/                         # Backend API tests (pytest)
│   ├── conftest.py              # Pytest fixtures
│   ├── pytest.ini               # Pytest configuration
│   ├── requirements.txt         # Test dependencies
│   ├── modules/                 # Reusable API modules
│   │   ├── base.py              # Base API module class
│   │   ├── users.py             # Users API
│   │   ├── companies.py         # Companies API
│   │   ├── projects.py          # Projects API
│   │   ├── credentials.py       # Credentials API
│   │   ├── github.py            # GitHub API
│   │   ├── templates.py         # Templates API
│   │   ├── platforms.py         # Platforms API
│   │   └── documents.py         # Documents API
│   ├── test_users.py            # User CRUD tests
│   ├── test_companies.py        # Company CRUD tests
│   ├── test_projects.py         # Project CRUD tests
│   ├── test_credentials.py      # Credentials tests
│   ├── test_github.py           # GitHub integration tests
│   ├── test_platforms.py        # Platform template tests
│   ├── test_documents.py        # Document management tests
│   └── test_integration.py      # Integration tests
│
├── e2e/                         # Frontend E2E tests (Playwright)
│   ├── playwright.config.ts     # Playwright configuration
│   ├── fixtures/                # Test fixtures
│   │   ├── test-data.ts         # Test data constants
│   │   └── api-helpers.ts       # API helper functions
│   ├── knowledge/               # Knowledge management tests
│   │   ├── companies.spec.ts
│   │   ├── projects.spec.ts
│   │   ├── project-detail.spec.ts
│   │   └── credentials.spec.ts
│   ├── github/                  # GitHub integration tests
│   │   ├── repos.spec.ts
│   │   └── analysis.spec.ts
│   ├── platforms/               # Platform template tests
│   │   ├── list.spec.ts
│   │   ├── preview.spec.ts
│   │   └── export.spec.ts
│   ├── documents/               # Document management tests
│   │   ├── templates.spec.ts
│   │   ├── generate.spec.ts
│   │   └── management.spec.ts
│   └── flows/                   # Integration flow tests
│       ├── onboarding.spec.ts
│       └── full-workflow.spec.ts
│
└── scripts/                     # Test execution scripts
    ├── run-all.sh               # Run all tests (Linux/Mac)
    ├── run-all.bat              # Run all tests (Windows)
    ├── run-api-tests.sh         # API tests only
    ├── run-api-tests.bat
    ├── run-e2e-tests.sh         # E2E tests only
    ├── run-e2e-tests.bat
    ├── setup-test-db.sh         # Initialize test database
    └── generate-report.sh       # Generate test reports
```

## Prerequisites

### For API Tests
- Python 3.10+
- pip

### For E2E Tests
- Node.js 18+
- npm

### For Both
- Docker & Docker Compose
- Running Autopolio backend and frontend

## Quick Start

### Run All Tests

```bash
# Linux/Mac
cd tests
chmod +x scripts/*.sh
./scripts/run-all.sh

# Windows
cd tests
scripts\run-all.bat
```

### Run API Tests Only

```bash
# Linux/Mac
./scripts/run-api-tests.sh

# Windows
scripts\run-api-tests.bat

# With options
./scripts/run-api-tests.sh -v --tb=long
./scripts/run-api-tests.sh -k "test_create"
./scripts/run-api-tests.sh -m "not slow"
```

### Run E2E Tests Only

```bash
# Linux/Mac
./scripts/run-e2e-tests.sh

# Windows
scripts\run-e2e-tests.bat

# With options
./scripts/run-e2e-tests.sh --headed
./scripts/run-e2e-tests.sh knowledge/
./scripts/run-e2e-tests.sh --grep "create"
```

## API Tests (pytest)

### Configuration

The API tests use pytest with the following configuration:

- **Base URL**: `http://localhost:8000/api` (configurable via `API_BASE_URL` env var)
- **Timeout**: 30 seconds per request

### Fixtures

```python
# Available fixtures in conftest.py
api_client      # httpx.Client for making API requests
test_user       # Creates and cleans up a test user
test_company    # Creates test company (requires test_user)
test_project    # Creates test project (requires test_user, test_company)
test_template   # Creates test template (requires test_user)
```

### Running Specific Tests

```bash
# Run all tests in a file
pytest test_users.py

# Run specific test class
pytest test_companies.py::TestCompanyCRUD

# Run specific test
pytest test_projects.py::TestProjectCRUD::test_create_project

# Run tests matching pattern
pytest -k "create"

# Skip slow tests
pytest -m "not slow"

# Skip tests requiring GitHub
pytest -m "not requires_github"
```

### Markers

- `@pytest.mark.slow` - Long-running tests
- `@pytest.mark.integration` - Integration tests
- `@pytest.mark.requires_github` - Tests requiring GitHub connection

## E2E Tests (Playwright)

### Configuration

The E2E tests use Playwright with:

- **Base URL**: `http://localhost:5173` (configurable via `FRONTEND_URL` env var)
- **Browser**: Chromium (default)
- **Timeout**: 60 seconds per test

### Running Specific Tests

```bash
# Run all tests
npx playwright test

# Run specific file
npx playwright test knowledge/companies.spec.ts

# Run specific test
npx playwright test -g "should create a new company"

# Run with UI mode
npx playwright test --ui

# Run headed (visible browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug
```

### Viewing Reports

```bash
# After running tests
npx playwright show-report
```

### Screenshots and Videos

- Screenshots are captured on failure
- Videos are captured on first retry
- Traces are captured on first retry

Artifacts are stored in `tests/e2e/test-results/`.

## Test Coverage

### API Tests (~50 test cases)

| Module | Tests |
|--------|-------|
| Users | 8 |
| Companies | 10 |
| Projects | 12 |
| Credentials | 12 |
| GitHub | 8 |
| Platforms | 8 |
| Documents | 8 |
| Integration | 6 |

### E2E Tests (~40 test cases)

| Module | Tests |
|--------|-------|
| Knowledge/Companies | 6 |
| Knowledge/Projects | 8 |
| Knowledge/ProjectDetail | 6 |
| Knowledge/Credentials | 8 |
| GitHub/Repos | 4 |
| GitHub/Analysis | 6 |
| Platforms/List | 6 |
| Platforms/Preview | 6 |
| Platforms/Export | 8 |
| Documents/Templates | 6 |
| Documents/Generate | 6 |
| Documents/Management | 6 |
| Flows/Onboarding | 4 |
| Flows/FullWorkflow | 6 |

## Test Matrix

### Knowledge Management

| ID | Test Case | API | E2E |
|----|-----------|-----|-----|
| KM-01 | Company Create | ✓ | ✓ |
| KM-02 | Company Update | ✓ | ✓ |
| KM-03 | Company Delete | ✓ | ✓ |
| KM-04 | Company Timeline | ✓ | ✓ |
| KM-05 | Project Create | ✓ | ✓ |
| KM-06 | Project Update | ✓ | ✓ |
| KM-07 | Project Delete | ✓ | ✓ |
| KM-08 | Project Achievements | ✓ | ✓ |
| KM-09 | Certification CRUD | ✓ | ✓ |
| KM-10 | Education CRUD | ✓ | ✓ |
| KM-11 | Awards CRUD | ✓ | ✓ |

### Platform Templates

| ID | Test Case | API | E2E |
|----|-----------|-----|-----|
| PT-01 | Template List | ✓ | ✓ |
| PT-02 | Sample Preview | ✓ | ✓ |
| PT-03 | Real Data Preview | ✓ | ✓ |
| PT-04 | HTML Export | ✓ | ✓ |
| PT-05 | Markdown Export | ✓ | ✓ |
| PT-06 | Word Export | ✓ | ✓ |

### Document Management

| ID | Test Case | API | E2E |
|----|-----------|-----|-----|
| DM-01 | Template List | ✓ | ✓ |
| DM-02 | Template Clone | ✓ | ✓ |
| DM-03 | Template Edit | ✓ | ✓ |
| DM-04 | Document Generate | ✓ | ✓ |
| DM-05 | Document Download | ✓ | ✓ |
| DM-06 | Document Delete | ✓ | ✓ |

## Environment Variables

```bash
# API Tests
API_BASE_URL=http://localhost:8000/api

# E2E Tests
FRONTEND_URL=http://localhost:5173

# CI/CD
CI=true  # Enables CI-specific settings
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Run API Tests
        run: |
          cd tests/api
          pip install -r requirements.txt
          pytest -v

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install Playwright
        run: |
          cd tests/e2e
          npm install
          npx playwright install --with-deps
      - name: Run E2E Tests
        run: |
          cd tests/e2e
          npx playwright test
```

## Writing New Tests

### API Test Template

```python
# tests/api/test_example.py
import pytest
from modules.example import ExampleAPI

class TestExampleCRUD:
    def test_create_example(self, api_client, test_user):
        """Test creating a new example."""
        api = ExampleAPI(api_client)

        response = api.create(
            user_id=test_user["id"],
            name="Test Example"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Example"
```

### E2E Test Template

```typescript
// tests/e2e/example/example.spec.ts
import { test, expect } from '@playwright/test'
import { createTestUser, cleanupTestData } from '../fixtures/api-helpers'

test.describe('Example Feature', () => {
  let testContext: TestDataContext

  test.beforeAll(async ({ request }) => {
    const user = await createTestUser(request)
    testContext = { user }
  })

  test.afterAll(async ({ request }) => {
    await cleanupTestData(request, testContext)
  })

  test('should display example page', async ({ page }) => {
    await page.goto('/example')
    await expect(page.locator('h1')).toBeVisible()
  })
})
```

## Troubleshooting

### API Tests

1. **Connection refused**: Ensure backend is running on port 8000
2. **Authentication errors**: Check if user creation/deletion works
3. **Timeout errors**: Increase timeout in `conftest.py`

### E2E Tests

1. **Browser not installed**: Run `npx playwright install`
2. **Timeout errors**: Increase timeout in `playwright.config.ts`
3. **Element not found**: Use `data-testid` attributes for reliable selectors

### Docker Issues

1. **Container not starting**: Check `docker-compose logs`
2. **Database errors**: Run `./scripts/setup-test-db.sh`
3. **Port conflicts**: Ensure ports 5173 and 8000 are available

## Contributing

1. Follow the test naming convention: `test_<action>_<target>`
2. Use fixtures for test data setup/cleanup
3. Add appropriate markers for slow/integration tests
4. Update this README when adding new test categories
