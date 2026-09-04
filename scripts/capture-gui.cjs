const { readFile, mkdir } = require('node:fs/promises');
const { join, resolve } = require('node:path');

async function main() {
  const runtimeModules = process.env.KR_HUMANIZER_RUNTIME_MODULES;
  if (!runtimeModules) throw new Error('KR_HUMANIZER_RUNTIME_MODULES is required');
  const { chromium } = require(join(runtimeModules, 'playwright'));
  const run = JSON.parse(await readFile(resolve('experiments/latest-run.json'), 'utf8'));
  const source = run.pairs[0].baseline;
  const outputDir = resolve('artifacts/screenshots');
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.KR_HUMANIZER_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    if (process.env.KR_HUMANIZER_CAPTURE_FIXTURE === '1') {
      const { buildProposal } = await import('../src/core/diff.js');
      const pair = run.pairs[0];
      const fixture = { ...buildProposal(pair.baseline, pair.humanized), summary: pair.rewriteSummary, flow: pair.flow };
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
    await page.locator('[data-filter="order"]').click();
    const expectedOrderCount = Number(await page.locator('[data-filter="order"] span').textContent());
    const visibleOrderCount = await page.locator('#changes .change:not(.filtered-out)').count();
    if (visibleOrderCount !== expectedOrderCount) throw new Error('Order filter count does not match visible cards');
    await page.locator('[data-filter="all"]').click();
    await page.locator('[data-view="split"]').click();
    if (await page.locator('#changes').getAttribute('data-view') !== 'split') throw new Error('Split comparison mode did not activate');
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
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
