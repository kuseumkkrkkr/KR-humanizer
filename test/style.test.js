import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutocompletePrompt, buildDraftPrompt, buildPlanPrompt, buildRewritePrompt } from '../src/core/prompt.js';
import { AUTOCOMPLETE_MODEL, assertCompletion } from '../src/engines/runner.js';
import { getEditModeInstruction, getHonorificProfile, normalizeHonorificLevel } from '../src/core/style.js';

test('honorific intensity maps to explicit Korean speech levels', () => {
  assert.equal(getHonorificProfile(0).key, 'hae');
  assert.equal(getHonorificProfile(25).key, 'haera');
  assert.equal(getHonorificProfile(50).key, 'preserve');
  assert.equal(getHonorificProfile(75).key, 'haeyo');
  assert.equal(getHonorificProfile(100).key, 'hasipsio');
  assert.throws(() => normalizeHonorificLevel(101), /0~100/);
});

test('autocomplete is fixed to Spark and returns only the first bounded sentence', () => {
  assert.equal(AUTOCOMPLETE_MODEL, 'gpt-5.3-codex-spark');
  const prompt = buildAutocompletePrompt({ text: '독자가 이해할 핵심을 먼저 적었습니다.', explanationLevel: 'minimal' });
  assert.match(prompt, /문장 하나만/);
  assert.match(prompt, /없는 사실, 수치, 출처, 고유명사를 만들지/);
  assert.match(prompt, /<writing-context>/);
  assert.equal(assertCompletion({ completion: '다음에는 적용 방법을 설명합니다. 그 뒤에는 결론입니다.' }).completion, '다음에는 적용 방법을 설명합니다.');
  assert.equal(assertCompletion({ completion: '“이어지는 문장입니다.”' }).completion, '이어지는 문장입니다.');
});

test('rewrite prompt carries mode, honorific level, and relationship boundary', () => {
  const prompt = buildRewritePrompt({
    text: '문장을 검토한다.',
    editMode: 'strict',
    honorificLevel: 100,
    explanationLevel: 'minimal',
    contextGraph: { nodes: [{ id: 'n1', role: '주장', label: '핵심만 남긴다.' }], edges: [] },
    knowledge: [{
      id: 'nikl-test',
      title: '시험 규범',
      sourceSection: '한글 맞춤법 시험 항목',
      sourceUrl: 'https://www.korean.go.kr/',
      guidance: '실제 해당하는 경우에만 적용한다.'
    }]
  });
  assert.match(prompt, /윤문 방식: strict/);
  assert.match(prompt, /100\/100 — 격식 경어 · 하십시오체/);
  assert.match(prompt, /주체·객체 높임이나 직함은 원문의 관계를 보존/);
  assert.match(prompt, /Obsidian 윤문 지식 검색 결과/);
  assert.match(prompt, /<knowledge-card id="nikl-test">/);
  assert.match(prompt, /규범 카드를 우선/);
  assert.match(prompt, /설명률: 최저/);
  assert.match(prompt, /\[주장\] 핵심만 남긴다/);
  assert.match(prompt, /<writing-brief>/);
  assert.match(prompt, /편집 대상 콘텐츠/);
  assert.match(getEditModeInstruction('fluent'), /최소 수정/);
  assert.throws(() => getEditModeInstruction('creative'), /지원하지 않는 윤문 방식/);
});

test('plan and draft prompts bind explanation depth to active graph nodes', () => {
  const graph = { nodes: [
    { id: 'n1', role: '주장', label: '핵심 주장', included: true },
    { id: 'n2', role: '예시', label: '제외할 과잉 설명', included: false }
  ], edges: [] };
  const plan = buildPlanPrompt({ brief: '정책을 설명해 줘.', explanationLevel: 'maximal' });
  const draft = buildDraftPrompt({ brief: '정책을 설명해 줘.', contextGraph: graph, explanationLevel: 'balanced' });
  assert.match(plan, /글을 쓰지 말고/);
  assert.match(plan, /설명률: 최대/);
  assert.match(draft, /\[주장\] 핵심 주장/);
  assert.doesNotMatch(draft, /제외할 과잉 설명/);
});
