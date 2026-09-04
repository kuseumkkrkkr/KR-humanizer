const { readFile, mkdir } = require('node:fs/promises');
const { join, resolve } = require('node:path');

async function main() {
  const runtimeModules = process.env.KR_HUMANIZER_RUNTIME_MODULES;
  if (!runtimeModules) throw new Error('KR_HUMANIZER_RUNTIME_MODULES is required');
  const { chromium } = require(join(runtimeModules, 'playwright'));
  const run = JSON.parse(await readFile(resolve('experiments/latest-run.json'), 'utf8'));
  const captureFixture = process.env.KR_HUMANIZER_CAPTURE_FIXTURE === '1';
  const source = captureFixture
    ? '첫 원인을 설명합니다. 다음 해결책을 제안합니다. 이 기능은 사용자들이 글을 읽는 것에 있어서 보다 더 편하게 느낄 수 있도록 도와줍니다.'
    : run.pairs[0].baseline;
  const outputDir = resolve('artifacts/screenshots');
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.KR_HUMANIZER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    let fixture = null;
    if (captureFixture) {
      const { buildProposal } = await import('../src/core/diff.js');
      const target = '다음 해결책을 제안합니다. 첫 원인을 설명합니다. 이 기능은 사용자가 글을 더 편하게 읽도록 돕습니다. 마지막으로 사용자가 변경을 확인합니다.';
      fixture = { ...buildProposal(source, target), summary: '어순 이동·문장 수정·추가 제안', flow: { nodes: [{ id: 'p1', role: '도입', label: '원인을 설명합니다.' }, { id: 'p2', role: '전개', label: '해결책과 확인 절차를 제안합니다.' }], edges: [{ from: 'p1', to: 'p2', relation: '다음 문단' }] } };
      const planFixture = {
        summary: '핵심 기능 중심의 설명 계획',
        nodes: [
          { id: 'n1', role: '도입', label: '글을 읽을 때 생기는 부담을 문제로 제시합니다.' },
          { id: 'n2', role: '주장', label: '맥락 그래프로 필요한 설명만 남기는 방법을 소개합니다.' },
          { id: 'n3', role: '예시', label: '이미 전달된 기능을 여러 표현으로 길게 반복 설명합니다.' }
        ],
        edges: [{ from: 'n1', to: 'n2', relation: '해결' }, { from: 'n2', to: 'n3', relation: '부연' }]
      };
      await page.route('**/api/plan', (route) => {
        const request = route.request().postDataJSON();
        if (!request.brief || request.explanationLevel !== 'maximal') throw new Error('Plan request is missing brief or explanation level');
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(planFixture) });
      });
      await page.route('**/api/capabilities', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ codex: { available: true, version: 'codex-cli test', model: 'gpt-5.3-codex-spark' } }) }));
      await page.route('**/api/autocomplete', (route) => {
        const request = route.request().postDataJSON();
        if (request.text.length < 20 || request.engine !== 'codex') throw new Error('Autocomplete request is missing editor context');
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ completion: '이어서 사용자가 확인할 선택지를 분명하게 보여줍니다.' }) });
      });
      await page.route('**/api/draft', (route) => {
        const request = route.request().postDataJSON();
        if (request.contextGraph.nodes.filter((node) => node.included !== false).length !== 2) throw new Error('Excluded context node reached draft generation');
        const body = { rewrittenText: source, summary: '활성 노드 기반 초안', flow: { nodes: planFixture.nodes.slice(0, 2), edges: [planFixture.edges[0]] }, edges: [planFixture.edges[0]], knowledge: [] };
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(body) });
      });
      await page.route('**/api/rewrite', (route) => {
        const request = route.request().postDataJSON();
        if (request.editMode !== 'strict' || request.honorificLevel !== 75 || request.explanationLevel !== 'maximal') throw new Error('Style settings were not included in the rewrite request');
        if (request.contextGraph.nodes.length !== 2) throw new Error(`Edited context graph was not included in the rewrite request: ${request.contextGraph.nodes.length}`);
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fixture) });
      });
    }
    await page.goto(process.env.KR_HUMANIZER_GUI_URL || 'http://127.0.0.1:4317', { waitUntil: 'networkidle' });
    if (await page.locator('.brief-panel').getAttribute('open') !== null || await page.locator('.writing-settings').getAttribute('open') !== null) throw new Error('Optional writing controls must start collapsed');
    await page.locator('#source').fill(source);
    if (fixture) {
      if (!(await page.locator('#autocomplete-enabled').isEnabled())) throw new Error('Codex autocomplete did not become available');
      await page.locator('.autocomplete-toggle').click();
      await page.locator('#completion-panel').waitFor({ state: 'visible', timeout: 5_000 });
      if (!((await page.locator('#completion-text').textContent()) || '').includes('선택지를')) throw new Error('Autocomplete sentence was not previewed');
      await page.locator('.editor-panel').screenshot({ path: join(outputDir, '00-tab-autocomplete.png') });
      const beforeDismiss = await page.locator('#source').inputValue();
      await page.locator('#source').press('Escape');
      if (await page.locator('#completion-panel').isVisible() || await page.locator('#source').inputValue() !== beforeDismiss) throw new Error('Escape did not dismiss the completion without changing text');
      await page.locator('#source').evaluate((element) => element.dispatchEvent(new Event('input', { bubbles: true })));
      await page.locator('#completion-panel').waitFor({ state: 'visible', timeout: 5_000 });
      await page.locator('#source').press('Tab');
      if (!((await page.locator('#source').inputValue()).endsWith('이어서 사용자가 확인할 선택지를 분명하게 보여줍니다.'))) throw new Error('Tab did not accept the completion');
      await page.locator('.autocomplete-toggle').click();
      await page.locator('#source').fill(source);
      await page.locator('.brief-panel > summary').click();
      await page.locator('#brief').fill('맥락 그래프로 과잉 설명을 줄이는 한국어 윤문 도구를 소개해 줘.');
      if (!(await page.locator('#plan-mode').isEnabled()) || await page.locator('#plan').isEnabled()) throw new Error('Plan mode availability does not follow the brief');
      await page.locator('#plan-mode').check();
      await page.locator('.writing-settings > summary').click();
      await page.locator('input[name="explanation"][value="maximal"] + span').click();
      await page.locator('#plan').click();
      await page.locator('#graph-nodes .graph-node-row').nth(2).waitFor({ state: 'visible' });
      if ((await page.locator('#graph-nodes .graph-node-row').count()) !== 3) throw new Error('Plan nodes were not rendered');
      await page.locator('#flow-section').screenshot({ path: join(outputDir, '00-context-plan.png') });
      await page.locator('#graph-nodes .graph-node-row').nth(2).locator('.node-include input').uncheck();
      if ((await page.locator('#graph-state').textContent()) !== '활성 노드 2/3') throw new Error('Excluded node was not reflected in graph status');
      await page.locator('#flow-section').screenshot({ path: join(outputDir, '00-context-edited.png') });
      await Promise.all([page.waitForResponse((response) => response.url().endsWith('/api/draft')), page.locator('#draft').click()]);
      await page.waitForFunction(() => document.querySelectorAll('#graph-nodes .graph-node-row').length === 2);
      if ((await page.locator('#source').inputValue()) !== source) throw new Error('Graph draft did not populate the editor');
    }
    await page.locator('#edit-mode').selectOption('strict');
    await page.locator('#honorific').fill('75');
    if ((await page.locator('#honorific-value').textContent()) !== '부드러운 경어 · 해요체') throw new Error('Honorific slider label did not update');
    if ((await page.locator('#honorific').getAttribute('aria-valuetext')) !== '부드러운 경어 · 해요체 75') throw new Error('Honorific slider accessibility value is missing');
    if ((await page.locator('#settings-summary').textContent()) !== '엄격 · 규범과 문법 · 부드러운 경어 · 해요체 · 설명 최대') throw new Error('Collapsed settings summary did not reflect controls');
    if (!((await page.locator('#edit-mode-help').textContent()) || '').includes('국립국어원 규범과 문법·호응 추론')) throw new Error('Editing mode boundary help did not update');
    await page.locator('.editor-panel').screenshot({ path: join(outputDir, '00-style-settings.png') });
    await page.locator('#analyze').click();
    await page.locator('#diagnosis').waitFor({ state: 'visible' });
    await page.locator('#diagnosis').screenshot({ path: join(outputDir, '01-analysis.png') });

    await page.locator('#rewrite').click();
    await page.locator('#review').waitFor({ state: 'visible', timeout: 180_000 });
    if (await page.locator('#changes').getAttribute('data-view') !== 'unified') throw new Error('Unified Diff is not the default comparison mode');
    if (await page.locator('#changes .change').first().locator('.diff-line').count() < 2) throw new Error('Unified Diff lines are missing');
    const firstChange = page.locator('#changes .change').first();
    await firstChange.locator('[data-decision="reject"]').click();
    if (await firstChange.getAttribute('data-decision') !== 'rejected' || await firstChange.locator('input').isChecked()) throw new Error('Per-hunk rejection did not update state');
    if (!((await page.locator('#review-state').textContent()) || '').includes('거절 1')) throw new Error('Rejected count is missing');
    await firstChange.locator('[data-decision="accept"]').click();
    if (await firstChange.getAttribute('data-decision') !== 'accepted' || !(await firstChange.locator('input').isChecked())) throw new Error('Per-hunk acceptance did not update state');
    await page.locator('[data-filter="order"]').click();
    const expectedOrderCount = Number(await page.locator('[data-filter="order"] span').textContent());
    if (expectedOrderCount < 1) throw new Error('Fixture did not produce an order change');
    const visibleOrderCount = await page.locator('#changes .change:not(.filtered-out)').count();
    if (visibleOrderCount !== expectedOrderCount) throw new Error('Order filter count does not match visible cards');
    await page.locator('[data-filter="all"]').click();
    await page.locator('#select-visible').click();
    const totalChanges = await page.locator('#changes .change').count();
    if (await page.locator('#changes input:checked').count() !== totalChanges) throw new Error('Bulk selection did not select every visible card');
    if (await page.locator('#accept').isDisabled()) throw new Error('Bulk selection did not enable acceptance');
    await page.locator('#clear-selection').click();
    if (await page.locator('#changes input:checked').count() !== 0 || !(await page.locator('#accept').isDisabled())) throw new Error('Clear selection did not reset selection state');
    await page.locator('#select-visible').click();
    await page.waitForTimeout(3400);
    await page.locator('#review').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    const reviewBox = await page.locator('#review').boundingBox();
    if (!reviewBox) throw new Error('Review panel position is unavailable');
    await page.screenshot({
      path: join(outputDir, '02-review.png'),
      clip: { x: reviewBox.x, y: Math.max(0, reviewBox.y), width: reviewBox.width, height: 700 }
    });
    await page.locator('[data-view="split"]').click();
    if (await page.locator('#changes').getAttribute('data-view') !== 'split') throw new Error('Split comparison mode did not activate');
    await page.locator('#review').screenshot({ path: join(outputDir, '02-review-split.png') });
    await page.locator('#flow-section').screenshot({ path: join(outputDir, '03-flow.png') });

    await page.locator('#accept').click();
    await page.locator('#output-section').waitFor({ state: 'visible' });
    if (await page.locator('#changes .change.applied').count() !== totalChanges) throw new Error('Accepted cards did not retain applied state');
    await page.locator('#output-section').screenshot({ path: join(outputDir, '04-accepted.png') });
    await page.locator('#clear-selection').click();
    if (await page.locator('#changes .change.applied').count() !== totalChanges) throw new Error('Applied state disappeared after clearing the next selection');
    if (!((await page.locator('#review-state').textContent()) || '').includes('반영됨')) throw new Error('Applied status message is missing');
    await page.waitForTimeout(3400);
    await page.locator('#review').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: join(outputDir, '05-applied-review.png') });

    if (fixture) {
      const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
      await mobile.route('**/api/capabilities', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ codex: { available: true, version: 'codex-cli test', model: 'gpt-5.3-codex-spark' } }) }));
      await mobile.route('**/api/autocomplete', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ completion: '이어서 모바일에서도 적용 버튼으로 문장을 넣을 수 있습니다.' }) }));
      await mobile.route('**/api/rewrite', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fixture) }));
      await mobile.goto(process.env.KR_HUMANIZER_GUI_URL || 'http://127.0.0.1:4317', { waitUntil: 'networkidle' });
      await mobile.locator('#source').fill(source);
      await mobile.locator('.autocomplete-toggle').click();
      await mobile.locator('#completion-panel').waitFor({ state: 'visible', timeout: 5_000 });
      await mobile.locator('.editor-panel').screenshot({ path: join(outputDir, '00-tab-autocomplete-mobile.png') });
      await mobile.locator('#accept-completion').click();
      if (!((await mobile.locator('#source').inputValue()).endsWith('이어서 모바일에서도 적용 버튼으로 문장을 넣을 수 있습니다.'))) throw new Error('Mobile Apply did not accept the completion');
      await mobile.locator('.autocomplete-toggle').click();
      await mobile.locator('#source').fill(source);
      await mobile.locator('#rewrite').click();
      await mobile.locator('#review').waitFor({ state: 'visible' });
      await mobile.locator('#select-visible').click();
      await mobile.locator('#accept').click();
      await mobile.locator('#output-section').waitFor({ state: 'visible' });
      const width = await mobile.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      if (width.document > width.viewport || width.body > width.viewport) throw new Error(`Mobile horizontal overflow: ${JSON.stringify(width)}`);
      for (const selector of ['#select-visible', '#clear-selection', '#copy', '.change-select', '.decision-button', '.segmented span', '.node-include', '.node-role', '.node-label', '.node-actions button', '#add-node']) {
        const heights = await mobile.locator(selector).evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
        if (heights.some((height) => height < 44)) throw new Error(`Mobile target below 44px: ${selector} ${heights.join(',')}`);
      }
      await mobile.locator('#review').evaluate((element) => element.scrollIntoView({ block: 'start' }));
      await mobile.screenshot({ path: join(outputDir, '02-review-mobile.png'), fullPage: false });
      await mobile.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
