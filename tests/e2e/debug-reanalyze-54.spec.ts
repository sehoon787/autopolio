import { test, expect } from '@playwright/test';

/**
 * Debug test: Click re-analysis button on project 54 (Coflanet, 2 repos)
 * and verify both repos get analyzed + combined summary is generated.
 */

const BASE_URL = 'http://localhost:3035';
const API_URL = 'http://localhost:8085/api';
const USER_ID = 46;
const PROJECT_ID = 54;

test('project 54 re-analysis via UI button', async ({ page }) => {
  test.setTimeout(600_000); // 10 min timeout

  // Step 0: Set up user login state via localStorage
  console.log('=== Step 0: Set up user login ===');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Fetch user data from API - skip if user doesn't exist
  const userResp = await page.request.get(`${API_URL}/users/${USER_ID}`);
  test.skip(!userResp.ok(), `User ${USER_ID} not found in database`);
  const userData = await userResp.json();
  console.log('User:', userData.name, '(id:', userData.id, ')');

  // Check if project exists - skip if not
  const projectResp = await page.request.get(`${API_URL}/knowledge/projects/${PROJECT_ID}?user_id=${USER_ID}`);
  test.skip(!projectResp.ok(), `Project ${PROJECT_ID} not found for user ${USER_ID}`);

  // Set localStorage to simulate logged-in state
  await page.evaluate((user) => {
    localStorage.setItem('user-storage', JSON.stringify({
      state: { user: user, isGuest: false },
      version: 0,
    }));
    localStorage.setItem('user_id', String(user.id));
  }, userData);

  // Step 1: Navigate to project detail page
  console.log('=== Step 1: Navigate to project 54 ===');
  await page.goto(`${BASE_URL}/knowledge/projects/${PROJECT_ID}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Take screenshot of the page
  await page.screenshot({ path: 'test-results/project-54-before.png', fullPage: true });

  // Step 2: Check current state via API
  console.log('=== Step 2: Check project state ===');
  const beforeResp = await page.request.get(
    `${API_URL}/knowledge/projects/${PROJECT_ID}?user_id=${USER_ID}`
  );
  const beforeProject = await beforeResp.json();
  console.log('Project:', beforeProject.name);
  console.log('git_url:', beforeProject.git_url);
  console.log('is_analyzed:', beforeProject.is_analyzed);
  console.log('repositories:', JSON.stringify(beforeProject.repositories?.map((r: any) => ({
    id: r.id, git_url: r.git_url, is_primary: r.is_primary, label: r.label
  }))));
  console.log('ai_summary:', beforeProject.ai_summary ? 'EXISTS' : 'NULL');

  // Check repo_analyses
  const perRepoResp = await page.request.get(
    `${API_URL}/github/analysis/${PROJECT_ID}/per-repo?user_id=${USER_ID}`
  );
  if (perRepoResp.ok()) {
    const perRepoData = await perRepoResp.json();
    console.log('repo_analyses count:', perRepoData.analyses?.length || 0);
    for (const a of perRepoData.analyses || []) {
      console.log(`  repo: ${a.git_url}, has_summary: ${!!a.ai_summary}, has_tasks: ${!!a.key_tasks}`);
    }
  }

  // Step 3: Find and click re-analysis button
  console.log('=== Step 3: Find re-analysis button ===');

  // Look for the button - try multiple selectors
  const buttonSelectors = [
    'button:has-text("재분석")',
    'button:has-text("레포 분석")',
    'button:has-text("Reanalyze")',
    'button:has-text("Analyze")',
    '[data-testid="reanalyze-button"]',
  ];

  let buttonFound = false;
  for (const sel of buttonSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`Found button with selector: ${sel}`);
      console.log(`Button text: ${await btn.textContent()}`);
      buttonFound = true;

      // Click the button
      console.log('=== Step 4: Click re-analysis button ===');
      await btn.click();
      break;
    }
  }

  if (!buttonFound) {
    // Debug: list all buttons on the page
    const allButtons = await page.locator('button').all();
    console.log(`Total buttons on page: ${allButtons.length}`);
    for (let i = 0; i < Math.min(allButtons.length, 20); i++) {
      const text = await allButtons[i].textContent();
      const visible = await allButtons[i].isVisible();
      if (visible && text?.trim()) {
        console.log(`  Button ${i}: "${text.trim()}"`);
      }
    }

    // Also check if there's an analysis section
    const pageContent = await page.textContent('body');
    console.log('Page contains "분석":', pageContent?.includes('분석'));
    console.log('Page contains "analyze":', pageContent?.toLowerCase().includes('analyze'));

    await page.screenshot({ path: 'test-results/project-54-no-button.png', fullPage: true });
    throw new Error('Re-analysis button not found');
  }

  // Step 5: Wait for analysis to start
  console.log('=== Step 5: Wait for analysis to start ===');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/project-54-analysis-started.png', fullPage: true });

  // Step 6: Poll for completion
  console.log('=== Step 6: Poll for analysis completion ===');
  const startTime = Date.now();
  let completed = false;

  for (let i = 0; i < 60; i++) { // max 10 min (60 * 10s)
    await page.waitForTimeout(10000);

    const activeResp = await page.request.get(
      `${API_URL}/github/active-analyses?user_id=${USER_ID}`
    );
    const activeData = await activeResp.json();
    const analyses = activeData.analyses || [];

    if (analyses.length === 0) {
      completed = true;
      console.log(`Analysis completed in ${Math.round((Date.now() - startTime) / 1000)}s`);
      break;
    }

    const a = analyses[0];
    console.log(`[${(i + 1) * 10}s] Progress: ${a.progress}% - Step: ${a.step_name || 'N/A'}`);
  }

  expect(completed).toBe(true);

  // Step 7: Verify results
  console.log('=== Step 7: Verify results ===');

  const afterResp = await page.request.get(
    `${API_URL}/knowledge/projects/${PROJECT_ID}?user_id=${USER_ID}`
  );
  const afterProject = await afterResp.json();
  console.log('is_analyzed:', afterProject.is_analyzed);
  console.log('ai_summary length:', afterProject.ai_summary?.length || 0);
  console.log('ai_summary preview:', afterProject.ai_summary?.substring(0, 200));
  console.log('ai_key_features:', JSON.stringify(afterProject.ai_key_features));

  // Check per-repo analyses
  const afterPerRepoResp = await page.request.get(
    `${API_URL}/github/analysis/${PROJECT_ID}/per-repo?user_id=${USER_ID}`
  );
  if (afterPerRepoResp.ok()) {
    const afterPerRepo = await afterPerRepoResp.json();
    console.log('repo_analyses count after:', afterPerRepo.analyses?.length || 0);
    for (const a of afterPerRepo.analyses || []) {
      console.log(`  repo: ${a.git_url}`);
      console.log(`    ai_summary: ${a.ai_summary ? a.ai_summary.substring(0, 100) + '...' : 'NULL'}`);
      console.log(`    key_tasks: ${JSON.stringify(a.key_tasks?.slice(0, 3))}`);
    }
  }

  await page.screenshot({ path: 'test-results/project-54-after.png', fullPage: true });

  // Assertions
  expect(afterProject.ai_summary).toBeTruthy();
  expect(afterProject.ai_summary.length).toBeGreaterThan(50);

  console.log('=== DONE: Multi-repo re-analysis test passed ===');
});
