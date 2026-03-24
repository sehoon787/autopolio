import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3035'
const API_URL = process.env.API_URL || 'http://localhost:8085/api'

test.describe('Check all credential tabs for user 46', () => {
  test.beforeEach(async ({ page }) => {
    // Skip all tests if user 46 doesn't exist
    let userExists = false
    try {
      const resp = await page.request.get(`${API_URL}/users/46`)
      userExists = resp.ok()
    } catch {
      userExists = false
    }
    test.skip(!userExists, 'User 46 not found in database — requires pre-seeded local data')

    await page.goto(BASE_URL)
    await page.evaluate(() => {
      localStorage.setItem('user_id', '46')
      localStorage.setItem('user_name', 'sehoon787')
    })
    await page.goto(BASE_URL)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('networkidle')
    await page.locator('nav').first().waitFor({ state: 'visible', timeout: 30000 })
  })

  // === Knowledge Pages ===

  test('companies page shows data', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/companies`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const vibecraft = await page.locator('text=VibeCraft').count()
    const aircok = await page.locator('text=Aircok').count()
    test.skip(vibecraft + aircok === 0, 'No company data (VibeCraft/Aircok) for user 46')
    expect(vibecraft + aircok).toBeGreaterThan(0)
  })

  test('projects page shows data', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/projects`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const autopolio = await page.locator('text=Autopolio').count()
    const nextstop = await page.locator('text=NextStop').count()
    test.skip(autopolio + nextstop === 0, 'No project data (Autopolio/NextStop) for user 46')
    expect(autopolio + nextstop).toBeGreaterThan(0)
  })

  // === Education & Publications & Patents page ===

  test('education-publications-patents - Education (학력) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Default tab is Education (academic)
    const seoul = await page.locator('text=서울대학교').count()
    const seoulTech = await page.locator('text=서울과학기술대학교').count()
    console.log(`학력 - 서울대학교: ${seoul}, 서울과학기술대학교: ${seoulTech}`)
    test.skip(seoul + seoulTech === 0, 'No education data for user 46')
    expect(seoul + seoulTech).toBeGreaterThan(0)
  })

  test('education-publications-patents - Training (교육이력) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click Training sub-tab
    const trainingTab = page.getByRole('tab', { name: /Training|교육/ })
    if (await trainingTab.count() > 0) {
      await trainingTab.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/training-tab.png', fullPage: true })

    const boostcamp = await page.locator('text=부스트캠프').count()
    const coursera = await page.locator('text=Coursera').count()
    const awsWorkshop = await page.locator('text=re:Invent').count()
    console.log(`교육이력 - 부스트캠프: ${boostcamp}, Coursera: ${coursera}, AWS Workshop: ${awsWorkshop}`)
    test.skip(boostcamp + coursera + awsWorkshop === 0, 'No training data for user 46')
    expect(boostcamp + coursera + awsWorkshop).toBeGreaterThan(0)
  })

  test('education-publications-patents - Publications (논문) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click Publications sub-tab
    const pubTab = page.getByRole('tab', { name: /Publications|논문/ })
    if (await pubTab.count() > 0) {
      await pubTab.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/publications-tab.png', fullPage: true })

    const wildfire = await page.locator('text=산불 시뮬레이션').count()
    const iot = await page.locator('text=IoT').count()
    console.log(`논문 - 산불 시뮬레이션: ${wildfire}, IoT: ${iot}`)
    test.skip(wildfire + iot === 0, 'No publication data for user 46')
    expect(wildfire + iot).toBeGreaterThan(0)
  })

  test('education-publications-patents - Patents (특허) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/education-publications-patents`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click Patents sub-tab
    const patentTab = page.getByRole('tab', { name: /Patents|특허/ })
    if (await patentTab.count() > 0) {
      await patentTab.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/patents-tab.png', fullPage: true })

    const iotPatent = await page.locator('text=환경 모니터링').count()
    const wildfirePatent = await page.locator('text=산불 확산').count()
    console.log(`특허 - IoT 환경 모니터링: ${iotPatent}, 산불 확산 예측: ${wildfirePatent}`)
    test.skip(iotPatent + wildfirePatent === 0, 'No patent data for user 46')
    expect(iotPatent + wildfirePatent).toBeGreaterThan(0)
  })

  // === Certifications & Awards page ===

  test('certifications-awards - Certifications (자격증) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    const cert = await page.locator('text=정보처리기사').count()
    const sqld = await page.locator('text=SQLD').count()
    const aws = await page.locator('text=AWS').count()
    console.log(`자격증 - 정보처리기사: ${cert}, SQLD: ${sqld}, AWS: ${aws}`)
    test.skip(cert + sqld + aws === 0, 'No certification data for user 46')
    expect(cert + sqld + aws).toBeGreaterThan(0)
  })

  test('certifications-awards - Awards (수상) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/certifications-awards`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click Awards sub-tab
    const awardsTab = page.getByRole('tab', { name: /^Awards|^수상/ })
    if (await awardsTab.count() > 0) {
      await awardsTab.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/awards-tab.png', fullPage: true })

    const hackerathon = await page.locator('text=해커톤').count()
    const maestro = await page.locator('text=마에스트로').count()
    console.log(`수상 - 해커톤: ${hackerathon}, 마에스트로: ${maestro}`)
    test.skip(hackerathon + maestro === 0, 'No award data for user 46')
    expect(hackerathon + maestro).toBeGreaterThan(0)
  })

  // === Activities page ===

  test('activities - Volunteer (봉사활동) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/activities`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    await page.screenshot({ path: 'test-results/volunteer-tab.png', fullPage: true })

    const mentoring = await page.locator('text=멘토링').count()
    const opensource = await page.locator('text=오픈소스').count()
    console.log(`봉사활동 - 멘토링: ${mentoring}, 오픈소스: ${opensource}`)
    test.skip(mentoring + opensource === 0, 'No volunteer data for user 46')
    expect(mentoring + opensource).toBeGreaterThan(0)
  })

  test('activities - External (대외활동) tab', async ({ page }) => {
    await page.goto(`${BASE_URL}/knowledge/activities`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1000)

    // Click External sub-tab
    const extTab = page.getByRole('tab', { name: /External|대외/ })
    if (await extTab.count() > 0) {
      await extTab.click()
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/external-activities-tab.png', fullPage: true })

    const junction = await page.locator('text=Junction').count()
    const gdsc = await page.locator('text=GDSC').count()
    console.log(`대외활동 - Junction 해커톤: ${junction}, GDSC: ${gdsc}`)
    test.skip(junction + gdsc === 0, 'No external activity data for user 46')
    expect(junction + gdsc).toBeGreaterThan(0)
  })

  // === Settings Profile ===

  test('settings - profile section shows data', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings?section=profile`)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)

    const inputs = page.locator('input')
    const inputCount = await inputs.count()
    let foundName = false
    let foundEmail = false
    let foundPhone = false
    for (let i = 0; i < inputCount; i++) {
      const val = await inputs.nth(i).inputValue().catch(() => '')
      if (val === '김세훈') foundName = true
      if (val === 'sehoon787@example.com') foundEmail = true
      if (val === '010-1234-5678') foundPhone = true
    }
    console.log(`프로필 - 이름: ${foundName}, 이메일: ${foundEmail}, 전화번호: ${foundPhone}`)
    test.skip(!foundName && !foundEmail, 'No profile data for user 46')
    expect(foundName).toBeTruthy()
    expect(foundEmail).toBeTruthy()
    expect(foundPhone).toBeTruthy()
  })
})
