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
    await page.goto(process.env.KR_HUMANIZER_GUI_URL || 'http://127.0.0.1:4317', { waitUntil: 'networkidle' });
    await page.locator('#source').fill(source);
    await page.locator('#analyze').click();
    await page.locator('#diagnosis').waitFor({ state: 'visible' });
    await page.locator('#diagnosis').screenshot({ path: join(outputDir, '01-analysis.png') });

    await page.locator('#rewrite').click();
    await page.locator('#review').waitFor({ state: 'visible', timeout: 180_000 });
    await page.locator('#review').screenshot({ path: join(outputDir, '02-review.png') });
    await page.locator('#flow-section').screenshot({ path: join(outputDir, '03-flow.png') });

    const firstChange = page.locator('#changes input[type="checkbox"]').first();
    await firstChange.check();
    await page.locator('#accept').click();
    await page.locator('#output-section').waitFor({ state: 'visible' });
    await page.locator('#output-section').screenshot({ path: join(outputDir, '04-accepted.png') });
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
