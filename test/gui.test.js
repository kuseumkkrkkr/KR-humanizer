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
  assert.match(html, /data-view="unified"/);
  assert.match(html, /data-view="split"/);
  assert.match(html, />통합 Diff</);
  assert.match(html, /id="accept" class="primary" disabled/);
  assert.match(html, /id="edit-mode"/);
  assert.match(html, /id="honorific" type="range" min="0" max="100" step="25" value="50"/);
  assert.match(html, /id="honorific-value"/);
  for (const id of ['brief', 'plan-mode', 'plan', 'graph-nodes', 'add-node', 'draft']) assert.match(html, new RegExp(`id="${id}"`));
  for (const id of ['autocomplete-enabled', 'autocomplete-capability', 'completion-panel', 'completion-text', 'accept-completion', 'dismiss-completion']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /gpt-5\.3-codex-spark/);
  assert.match(html, /name="explanation" value="minimal"/);
  assert.match(html, /name="explanation" value="balanced" checked/);
  assert.match(html, /name="explanation" value="maximal"/);
  assert.match(app, /change:not\(\.filtered-out\)/);
  assert.match(app, /#accept'\)\.disabled = count === 0/);
  assert.match(app, /classList\.toggle\('applied'/);
  assert.match(app, /function diffLine\(unit, side\)/);
  assert.match(app, /dataset\.decision = 'accept'/);
  assert.match(app, /dataset\.decision = 'reject'/);
  assert.match(app, /setItemDecision\(item, 'rejected'\)/);
  assert.match(app, /honorificLevel: Number\(\$\('#honorific'\)\.value\)/);
  assert.match(app, /setAttribute\('aria-valuetext'/);
  assert.match(app, /contextGraph/);
  assert.match(app, /\/api\/plan/);
  assert.match(app, /\/api\/draft/);
  assert.match(app, /explanationLevel: explanationLevel\(\)/);
  assert.match(app, /node\.included = include\.checked/);
  assert.match(app, /event\.key === 'Tab'/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /setTimeout\(\(\) => requestCompletion\(sequence\), 1200\)/);
  assert.match(app, /\/api\/capabilities/);
  assert.match(app, /\/api\/autocomplete/);
  assert.match(css, /#changes\[data-view="split"\]/);
  assert.match(css, /\.diff-line/);
  assert.match(css, /\.word-remove/);
  assert.match(css, /\.word-add/);
  assert.match(css, /\.editor-panel,\.result-panel\{min-width:0/);
  assert.match(css, /\.selection-tools \.text-button,#copy,\.change-select\{min-height:44px/);
  assert.match(css, /\.writing-settings/);
  assert.match(css, /\.graph-node-row/);
  assert.match(css, /\.segmented/);
  assert.match(css, /\.completion-panel/);
  assert.match(css, /min-height:44px/);
});
