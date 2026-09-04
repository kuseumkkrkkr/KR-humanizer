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
      await page.route('**/api/rewrite', (route) => {
        const request = route.request().postDataJSON();
        if (request.editMode !== 'strict' || request.honorificLevel !== 75) throw new Error('Style settings were not included in the rewrite request');
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fixture) });
      });
    }
    await page.goto(process.env.KR_HUMANIZER_GUI_URL || 'http://127.0.0.1:4317', { waitUntil: 'networkidle' });
    await page.locator('#source').fill(source);
    await page.locator('#edit-mode').selectOption('strict');
    await page.locator('#honorific').fill('75');
    if ((await page.locator('#honorific-value').textContent()) !== '부드러운 경어 · 해요체') throw new Error('Honorific slider label did not update');
    if ((await page.locator('#honorific').getAttribute('aria-valuetext')) !== '부드러운 경어 · 해요체 75') throw new Error('Honorific slider accessibility value is missing');
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
      await mobile.route('**/api/rewrite', (route) => route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(fixture) }));
      await mobile.goto(process.env.KR_HUMANIZER_GUI_URL || 'http://127.0.0.1:4317', { waitUntil: 'networkidle' });
      await mobile.locator('#source').fill(source);
      await mobile.locator('#rewrite').click();
      await mobile.locator('#review').waitFor({ state: 'visible' });
      await mobile.locator('#select-visible').click();
      await mobile.locator('#accept').click();
      await mobile.locator('#output-section').waitFor({ state: 'visible' });
      const width = await mobile.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      if (width.document > width.viewport || width.body > width.viewport) throw new Error(`Mobile horizontal overflow: ${JSON.stringify(width)}`);
      for (const selector of ['#select-visible', '#clear-selection', '#copy', '.change-select', '.decision-button']) {
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
