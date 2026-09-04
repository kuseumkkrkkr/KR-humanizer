import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const htmlPath = new URL('../src/gui/index.html', import.meta.url);
const appPath = new URL('../src/gui/app.js', import.meta.url);
const cssPath = new URL('../src/gui/styles.css', import.meta.url);

test('review UX exposes filters, comparison modes, and bulk selection', async () => {
  const [html, app, css] = await Promise.all([
    readFile(htmlPath, 'utf8'),
    readFile(appPath, 'utf8'),
    readFile(cssPath, 'utf8')
  ]);
  for (const id of ['select-visible', 'clear-selection', 'review-state', 'selection-count', 'accept']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /data-filter="all"/);
  assert.match(html, /data-filter="order"/);
  assert.match(html, /data-view="inline"/);
  assert.match(html, /data-view="split"/);
  assert.match(html, /id="accept" class="primary" disabled/);
  assert.match(app, /change:not\(\.filtered-out\)/);
  assert.match(app, /#accept'\)\.disabled = count === 0/);
  assert.match(app, /classList\.toggle\('applied'/);
  assert.match(css, /#changes\[data-view="split"\]/);
  assert.match(css, /min-height:44px/);
});
