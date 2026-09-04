import test from 'node:test';
import assert from 'node:assert/strict';
import { activeContextGraph, formatContextGraph, getExplanationProfile, normalizeContextGraph } from '../src/core/context-graph.js';

test('context graph keeps bounded editable nodes and removes excluded context', () => {
  const graph = normalizeContextGraph({
    nodes: [
      { id: 'intro', role: '도입', label: '핵심 문제를 제시한다.' },
      { id: 'extra', role: '예시', label: '과도한 배경 설명을 덧붙인다.', included: false },
      { id: 'end', role: '결론', label: '해결 방향을 정리한다.' }
    ],
    edges: [
      { from: 'intro', to: 'extra', relation: '보충' },
      { from: 'extra', to: 'end', relation: '결론' }
    ]
  });
  const active = activeContextGraph(graph);
  assert.deepEqual(active.nodes.map((node) => node.id), ['intro', 'end']);
  assert.equal(active.edges.length, 1);
  assert.doesNotMatch(formatContextGraph(active), /과도한 배경/);
  assert.match(formatContextGraph(active), /해결 방향/);
});

test('explanation level has exactly three validated depths', () => {
  assert.equal(getExplanationProfile('minimal').label, '최저');
  assert.equal(getExplanationProfile('balanced').label, '중간');
  assert.equal(getExplanationProfile('maximal').label, '최대');
  assert.throws(() => getExplanationProfile('verbose'), /지원하지 않는 설명률/);
});
