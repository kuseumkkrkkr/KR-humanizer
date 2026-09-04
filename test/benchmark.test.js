import test from 'node:test';
import assert from 'node:assert/strict';
import { groupedCrossValidation } from '../src/benchmark/classifier.js';
import { preservationAudit, textMetrics } from '../src/benchmark/metrics.js';
import { summarizeRun } from '../src/benchmark/report.js';
import { validateBaseline, validateRewrite } from '../src/benchmark/run.js';

test('style metrics are finite and explainable', () => {
  const metrics = textMetrics('첫 문장입니다.\n\n그러나 이 문장은 조금 더 길게 설명합니다.');
  assert.equal(metrics.paragraphs, 2);
  for (const value of Object.values(metrics)) assert.ok(Number.isFinite(value));
});

test('rewrite gate rejects destructive shortening and numeric changes', () => {
  const baseline = '한국 경제는 여러 주체의 선택으로 움직인다. '.repeat(20);
  assert.deepEqual(validateRewrite(baseline, '짧은 요약입니다.').reasons, ['length-ratio']);
  assert.deepEqual(validateRewrite(`${baseline} 성장률은 2.1%다.`, `${baseline} 성장률은 3.1%다.`).reasons, ['numeric-mismatch']);
});

test('grouped CV never moves a pair across folds', () => {
  const metric = (length) => ({ avgSentenceLength: length, sentenceLengthStd: 1, lexicalDiversity: 0.8, findingsPerThousand: 1, connectorsPerThousand: 1, abstractPhrasesPerThousand: 1, longSentenceRatio: 0, readabilityProxy: 80 });
  const pairs = [0, 1, 2].map((fold) => ({ id: `p${fold}`, fold, metrics: { baseline: metric(50), humanized: metric(30) } }));
  const result = groupedCrossValidation(pairs, 3);
  result.folds.forEach((item) => assert.ok(item.predictions.every((prediction) => prediction.pairId === `p${item.fold}`)));
});

test('summary unmasks judge winners and meaning changes', () => {
  const run = {
    pairs: [{ id: 'p1', blind: { A: 'humanized', B: 'baseline' }, metrics: { baseline: { readabilityProxy: 70 }, humanized: { readabilityProxy: 82 } }, judge: { winner: 'A', meaningChangedA: false, meaningChangedB: false } }],
    classifier: { meanAccuracy: 0.5 }
  };
  assert.deepEqual(summarizeRun(run), { pairCount: 1, readabilityProxyDelta: 12, judgeWins: { baseline: 0, humanized: 1, tie: 0 }, meaningChanged: 0, numericMismatch: 0, classifierMeanAccuracy: 0.5 });
});

test('numeric preservation audit detects changed figures', () => {
  assert.equal(preservationAudit('성장률은 2.1%다.', '성장률은 2.1%입니다.').numericTokensPreserved, true);
  assert.deepEqual(preservationAudit('예산은 10억이다.', '예산은 12억이다.').missingNumbers, ['10']);
});

test('baseline gate rejects assistant meta responses and duplicates', () => {
  assert.deepEqual(validateBaseline('어떤 글을 원하시나요? 알려 주세요.'), { valid: false, reasons: ['too-short', 'meta-response'] });
  const valid = '한국 사회는 다양한 이해관계를 조정한다. '.repeat(20);
  assert.equal(validateBaseline(valid).valid, true);
  assert.deepEqual(validateBaseline(valid, [valid]).reasons, ['duplicate']);
  assert.deepEqual(validateBaseline(`${valid} https://example.com`), { valid: false, reasons: ['tool-artifact'] });
});
