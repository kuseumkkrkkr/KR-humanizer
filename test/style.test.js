import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutocompletePrompt, buildDraftPrompt, buildPlanPrompt, buildRewritePrompt } from '../src/core/prompt.js';
import { AUTOCOMPLETE_MODEL, assertCompletion, knowledgeForEditMode } from '../src/engines/runner.js';
import { EDIT_MODES, getEditModeInstruction, getHonorificProfile, normalizeEditMode, normalizeHonorificLevel } from '../src/core/style.js';

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
  assert.match(prompt, /마침표로 끝나도 앞 글에서 직접 이어지는 내용/);
  assert.equal(assertCompletion({ completion: '다음에는 적용 방법을 설명합니다. 그 뒤에는 결론입니다.' }).completion, '다음에는 적용 방법을 설명합니다.');
  assert.equal(assertCompletion({ completion: '“이어지는 문장입니다.”' }).completion, '이어지는 문장입니다.');
});

test('rewrite prompt carries strict grammar scope, honorific level, and relationship boundary', () => {
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
  assert.match(prompt, /윤문 방식: strict\(엄격\)/);
  assert.match(prompt, /주어-서술어 호응, 수식 범위, 지시 대상, 중의성/);
  assert.match(prompt, /국립국어원 카드의 적용 조건과 경계/);
  assert.match(prompt, /100\/100 — 격식 경어 · 하십시오체/);
  assert.match(prompt, /주체·객체 높임이나 직함은 원문의 관계를 보존/);
  assert.match(prompt, /Obsidian 윤문 지식 검색 결과/);
  assert.match(prompt, /<knowledge-card id="nikl-test">/);
  assert.match(prompt, /규범 카드를 우선/);
  assert.match(prompt, /설명률: 최저/);
  assert.match(prompt, /\[주장\] 핵심만 남긴다/);
  assert.match(prompt, /<writing-brief>/);
  assert.match(prompt, /편집 대상 콘텐츠/);
  assert.deepEqual(Object.keys(EDIT_MODES), ['weak', 'medium', 'strict']);
  assert.match(getEditModeInstruction('weak'), /어투와 종결 표현만/);
  assert.match(getEditModeInstruction('medium'), /의미 흐름 그래프/);
  assert.match(getEditModeInstruction('strict'), /국립국어원 어문 규범/);
  assert.equal(normalizeEditMode('fluent'), 'weak');
  assert.equal(normalizeEditMode('balanced'), 'medium');
  assert.throws(() => normalizeEditMode('concise'), /지원하지 않는 윤문 방식/);
  assert.throws(() => getEditModeInstruction('creative'), /지원하지 않는 윤문 방식/);
});

test('weak and medium prompts enforce distinct editing boundaries', () => {
  const weak = buildRewritePrompt({ text: '다시 말해 같은 설명입니다.', editMode: 'weak' });
  const medium = buildRewritePrompt({ text: '다시 말해 같은 설명입니다.', editMode: 'medium' });
  assert.match(weak, /문장 수, 문장 순서, 문단 수를 원문과 정확히 같게/);
  assert.match(weak, /오탈자, 띄어쓰기, 문법, 호응, 논리, 반복.*고치지/);
  assert.match(medium, /flow와 edges로 원문의 의미 흐름/);
  assert.match(medium, /재설명, 반복, 과잉 설명만 제거하거나 합칩니다/);
  assert.match(medium, /별도 문법 판단으로 고치지/);
});

test('knowledge injection follows the three mode boundaries', () => {
  const cards = [
    { id: 'norm', kind: 'norm' },
    { id: 'grammar', kind: 'grammar' },
    { id: 'logic', kind: 'writing-guidance' },
    { id: 'community', kind: 'skill-observation' },
    { id: 'nikl-writing-ending-genre-consistency', kind: 'writing-guidance' }
  ];
  assert.deepEqual(knowledgeForEditMode(cards, 'weak').map((item) => item.id), ['nikl-writing-ending-genre-consistency']);
  assert.deepEqual(knowledgeForEditMode(cards, 'medium').map((item) => item.id), ['logic', 'community', 'nikl-writing-ending-genre-consistency']);
  assert.equal(knowledgeForEditMode(cards, 'strict').length, cards.length);
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
