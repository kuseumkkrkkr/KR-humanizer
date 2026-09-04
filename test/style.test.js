import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRewritePrompt } from '../src/core/prompt.js';
import { getEditModeInstruction, getHonorificProfile, normalizeHonorificLevel } from '../src/core/style.js';

test('honorific intensity maps to explicit Korean speech levels', () => {
  assert.equal(getHonorificProfile(0).key, 'hae');
  assert.equal(getHonorificProfile(25).key, 'haera');
  assert.equal(getHonorificProfile(50).key, 'preserve');
  assert.equal(getHonorificProfile(75).key, 'haeyo');
  assert.equal(getHonorificProfile(100).key, 'hasipsio');
  assert.throws(() => normalizeHonorificLevel(101), /0~100/);
});

test('rewrite prompt carries mode, honorific level, and relationship boundary', () => {
  const prompt = buildRewritePrompt({ text: '문장을 검토한다.', editMode: 'strict', honorificLevel: 100 });
  assert.match(prompt, /윤문 방식: strict/);
  assert.match(prompt, /100\/100 — 격식 경어 · 하십시오체/);
  assert.match(prompt, /주체·객체 높임이나 직함은 원문의 관계를 보존/);
  assert.match(getEditModeInstruction('fluent'), /최소 수정/);
  assert.throws(() => getEditModeInstruction('creative'), /지원하지 않는 윤문 방식/);
});
