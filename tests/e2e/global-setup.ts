/**
 * Playwright global setup — runs once before all tests.
 * Verifies that the backend API and frontend are reachable.
 */

async function globalSetup() {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3035'
  const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8085/api'

  console.log('\n=== E2E Global Setup: Health Checks ===')

  // 1. Direct API health check
  try {
    const apiResp = await fetch(`${apiBaseUrl.replace('/api', '')}/health`)
    console.log(`[Health] Direct API: ${apiResp.ok ? 'OK' : 'FAIL'} (${apiResp.status})`)
  } catch (e) {
    console.error(`[Health] Direct API: UNREACHABLE — ${e}`)
  }

  // 2. API through nginx proxy
  try {
    const proxyResp = await fetch(`${frontendUrl}/api/llm/providers`)
    console.log(`[Health] Nginx proxy (/api/llm/providers): ${proxyResp.ok ? 'OK' : 'FAIL'} (${proxyResp.status})`)
  } catch (e) {
    console.error(`[Health] Nginx proxy: UNREACHABLE — ${e}`)
  }

  // 3. Frontend HTML check
  try {
    const feResp = await fetch(frontendUrl)
    const html = await feResp.text()
    const hasRoot = html.includes('id="root"')
    const hasScript = html.includes('<script')
    console.log(`[Health] Frontend HTML: ${feResp.ok ? 'OK' : 'FAIL'} (has #root: ${hasRoot}, has <script>: ${hasScript})`)
    if (!hasScript) {
      console.error('[Health] WARNING: Frontend HTML has no <script> tags — JS bundle may be missing!')
      console.error('[Health] First 500 chars:', html.substring(0, 500))
    }
  } catch (e) {
    console.error(`[Health] Frontend: UNREACHABLE — ${e}`)
  }

  console.log('=== Health Checks Complete ===\n')
}

export default globalSetup
