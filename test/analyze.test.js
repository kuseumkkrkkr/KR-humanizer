import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeText, sanitizeText } from '../src/core/analyze.js';

const cases = JSON.parse(await readFile(new URL('../data/eval-cases.json', import.meta.url), 'utf8'));

test('curated evaluation cases remain detectable', () => {
  for (const item of cases) {
    const result = analyzeText(item.input);
    if (item.expectRuleIds) assert.deepEqual(item.expectRuleIds, result.findings.filter((finding) => finding.id).map((finding) => finding.id));
    if (item.expectInvisible) assert.deepEqual(item.expectInvisible, result.findings.filter((finding) => finding.codePoint).map((finding) => finding.codePoint));
    if (item.expectParagraphs) assert.equal(result.stats.paragraphs, item.expectParagraphs);
  }
});

test('sanitize reports and removes selected invisible characters', () => {
  const result = sanitizeText('가\u200b나\uFEFF다');
  assert.equal(result.text, '가나다');
  assert.deepEqual(result.removed.map((item) => item.codePoint), ['U+200B', 'U+FEFF']);
});

test('text size is bounded', () => {
  assert.throws(() => analyzeText('가'.repeat(200_001)), /exceeds/);
});
