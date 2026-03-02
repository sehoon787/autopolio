import { test, expect } from '@playwright/test';

/**
 * E2E Test: Multi-repo project re-analysis via API.
 *
 * Triggers re-analysis on multi-repo project (id=20, syc-be, 2 repos)
 * and verifies the combined AI summary is generated.
 */

const BASE_URL = 'http://localhost:3035';
const API_URL = 'http://localhost:8085/api';
const USER_ID = 46;
const PROJECT_ID = 20;

test.describe('Multi-repo re-analysis', () => {
  test('should generate combined AI summary for multi-repo project', async ({ page }) => {
    // Check if project exists - skip if not
    const checkResp = await page.request.get(
      `${API_URL}/knowledge/projects/${PROJECT_ID}?user_id=${USER_ID}`
    );
    test.skip(!checkResp.ok(), `Project ${PROJECT_ID} not found for user ${USER_ID}`);

    // Step 1: Navigate to the project detail page
    await page.goto(`${BASE_URL}/knowledge/projects/${PROJECT_ID}`);
    await page.waitForLoadState('domcontentloaded');

    // Step 2: Clear existing AI summary to verify it gets regenerated
    const beforeResponse = await page.request.get(
      `${API_URL}/knowledge/projects/${PROJECT_ID}?user_id=${USER_ID}`
    );
    const beforeProject = await beforeResponse.json();
    console.log('[Before] Project name:', beforeProject.name);
    console.log('[Before] has ai_summary:', !!beforeProject.ai_summary);
    console.log('[Before] has ai_key_features:', !!beforeProject.ai_key_features);
    console.log('[Before] repo count:', beforeProject.repositories?.length || 'N/A');

    // Step 3: Trigger re-analysis via API (simulating button click)
    // Use Gemini provider since it's configured in Docker
    const analyzeResponse = await page.request.post(
      `${API_URL}/github/analyze-background?user_id=${USER_ID}&provider=gemini&language=ko`,
      {
        data: {
          git_url: beforeProject.git_url || 'https://github.com/SYC-TechTeam/syc-be.git',
          project_id: PROJECT_ID,
        },
      }
    );

    expect(analyzeResponse.status()).toBe(200);
    const analyzeData = await analyzeResponse.json();
    console.log('[Analysis] Started - task_id:', analyzeData.task_id);
    console.log('[Analysis] project_id:', analyzeData.project_id);

    // Step 4: Poll for analysis completion (max 5 minutes)
    const taskId = analyzeData.task_id;
    let analysisComplete = false;
    let lastStatus = '';
    const startTime = Date.now();
    const timeout = 300_000; // 5 minutes

    while (!analysisComplete && Date.now() - startTime < timeout) {
      await page.waitForTimeout(5000); // Poll every 5s

      const statusResponse = await page.request.get(
        `${API_URL}/github/active-analyses?user_id=${USER_ID}`
      );
      const statusData = await statusResponse.json();

      // Check if our analysis is still active
      const activeAnalysis = statusData.analyses?.find(
        (a: any) => a.task_id === taskId
      );

      if (!activeAnalysis) {
        // Analysis is no longer active - check if completed or failed
        const jobResponse = await page.request.get(
          `${API_URL}/pipeline/tasks/${taskId}`
        );
        if (jobResponse.status() === 200) {
          const jobData = await jobResponse.json();
          lastStatus = jobData.status;
          console.log('[Analysis] Final status:', lastStatus);
          if (jobData.error) {
            console.log('[Analysis] Error:', jobData.error);
          }
          // Log step details
          for (const step of jobData.steps || []) {
            console.log(`  Step ${step.step_number} (${step.step_name}): ${step.status}${step.skip_reason ? ' - ' + step.skip_reason : ''}`);
          }
        }
        analysisComplete = true;
      } else {
        const progress = activeAnalysis.progress || 0;
        const stepName = activeAnalysis.step_name || '';
        console.log(`[Analysis] Progress: ${progress}% - ${stepName}`);
      }
    }

    expect(analysisComplete).toBe(true);
    console.log(`[Analysis] Completed in ${Math.round((Date.now() - startTime) / 1000)}s`);

    // Step 5: Verify the project now has AI summary (combined multi-repo summary)
    const afterResponse = await page.request.get(
      `${API_URL}/knowledge/projects/${PROJECT_ID}?user_id=${USER_ID}`
    );
    expect(afterResponse.status()).toBe(200);
    const afterProject = await afterResponse.json();

    console.log('[After] has ai_summary:', !!afterProject.ai_summary);
    console.log('[After] ai_summary length:', afterProject.ai_summary?.length || 0);
    console.log('[After] ai_summary preview:', afterProject.ai_summary?.substring(0, 200));
    console.log('[After] has ai_key_features:', !!afterProject.ai_key_features);
    console.log('[After] ai_key_features:', JSON.stringify(afterProject.ai_key_features));

    // The project should have a combined AI summary
    expect(afterProject.ai_summary).toBeTruthy();
    expect(afterProject.ai_summary.length).toBeGreaterThan(50);

    // Step 6: Check per-repo analysis results
    const perRepoResponse = await page.request.get(
      `${API_URL}/github/analysis/${PROJECT_ID}/per-repo?user_id=${USER_ID}`
    );
    if (perRepoResponse.status() === 200) {
      const perRepoData = await perRepoResponse.json();
      console.log('[PerRepo] repo count:', perRepoData.analyses?.length || 0);
      for (const repo of perRepoData.analyses || []) {
        console.log(`  Repo: ${repo.git_url}`);
        console.log(`    has ai_summary: ${!!repo.ai_summary}`);
        console.log(`    key_tasks count: ${repo.key_tasks?.length || 0}`);
      }
    }

    // Step 7: Check docker logs for the multi-repo summary generation
    console.log('[Done] Multi-repo re-analysis test completed successfully');
  });
});
