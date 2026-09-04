import test from 'node:test';
import assert from 'node:assert/strict';
import { applyProposal, buildProposal } from '../src/core/diff.js';

test('proposal exposes word-level changes and selective acceptance', () => {
  const proposal = buildProposal('저는 오늘 학교에 갔습니다. 날씨가 좋았습니다.', '오늘 저는 학교에 갔습니다. 날씨도 맑았습니다.');
  assert.equal(proposal.units.length, 2);
  assert.ok(proposal.units[0].diff.some((part) => part.type === 'add'));
  assert.equal(applyProposal(proposal, ['s1']), '오늘 저는 학교에 갔습니다. 날씨가 좋았습니다.');
});

test('order change is marked when a similar sentence moves', () => {
  const proposal = buildProposal('첫 원인을 설명합니다. 다음 해결책을 제안합니다.', '다음 해결책을 제안합니다. 첫 원인을 설명합니다.');
  assert.ok(proposal.units.some((unit) => unit.kind === 'order'));
});

test('selective acceptance preserves paragraph boundaries', () => {
  const proposal = buildProposal('첫 문장입니다.\n\n둘째 문장입니다.', '첫 문장이에요.\n\n둘째 문장이에요.');
  assert.equal(applyProposal(proposal, ['s1']), '첫 문장이에요.\n\n둘째 문장입니다.');
});
