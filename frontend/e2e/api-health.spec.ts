import { test, expect } from '@playwright/test'

test.describe('API Health Checks', () => {
  const API_URL = 'http://localhost:8000'

  test('should respond to health check', async ({ request }) => {
    // Try common health endpoints
    const endpoints = ['/api/health', '/health', '/api/', '/']

    let success = false
    for (const endpoint of endpoints) {
      try {
        const response = await request.get(`${API_URL}${endpoint}`)
        if (response.ok()) {
          success = true
          break
        }
      } catch {
        // Try next endpoint
      }
    }

    // At least the API should respond to something
    const docsResponse = await request.get(`${API_URL}/docs`)
    expect(docsResponse.ok() || success).toBeTruthy()
  })

  test('should have swagger docs available', async ({ request }) => {
    const response = await request.get(`${API_URL}/docs`)
    expect(response.ok()).toBeTruthy()
  })

  test('should have redoc available', async ({ request }) => {
    const response = await request.get(`${API_URL}/redoc`)
    expect(response.ok()).toBeTruthy()
  })

  test('should respond to users endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/users`)
    // Either success or empty list is fine
    expect(response.status()).toBeLessThan(500)
  })

  test('should respond to companies endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/knowledge/companies`)
    expect(response.status()).toBeLessThan(500)
  })

  test('should respond to projects endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/knowledge/projects`)
    expect(response.status()).toBeLessThan(500)
  })

  test('should respond to platforms endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/platforms`)
    expect(response.status()).toBeLessThan(500)
  })

  test('should respond to templates endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/templates`)
    expect(response.status()).toBeLessThan(500)
  })

  test('should respond to llm config endpoint', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/llm/config`)
    expect(response.status()).toBeLessThan(500)
  })
})
