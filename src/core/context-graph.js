const MAX_NODES = 32;
const MAX_LABEL = 240;

const EXPLANATION_LEVELS = {
  minimal: {
    label: '최저',
    instruction: '핵심 주장과 결론에 꼭 필요한 근거만 남기고, 배경 설명·예시·반복은 생략합니다.'
  },
  balanced: {
    label: '중간',
    instruction: '핵심 주장마다 이해에 필요한 근거나 연결 설명을 한 번만 제공합니다.'
  },
  maximal: {
    label: '최대',
    instruction: '독자가 맥락을 따라갈 수 있도록 개념과 인과관계를 충분히 풀되, 제공되지 않은 사실이나 반복 설명은 추가하지 않습니다.'
  }
};

function clipped(value, length) {
  return String(value ?? '').trim().slice(0, length);
}

export function getExplanationProfile(level = 'balanced') {
  if (!Object.hasOwn(EXPLANATION_LEVELS, level)) throw new Error(`지원하지 않는 설명률: ${level}`);
  return { key: level, ...EXPLANATION_LEVELS[level] };
}

export function normalizeContextGraph(graph = {}) {
  const sourceNodes = Array.isArray(graph?.nodes) ? graph.nodes.slice(0, MAX_NODES) : [];
  const used = new Set();
  const idMap = new Map();
  const nodes = [];
  sourceNodes.forEach((node, index) => {
    const rawId = clipped(node?.id, 64);
    let id = /^[A-Za-z0-9_.-]+$/u.test(rawId) && !used.has(rawId) ? rawId : `n${index + 1}`;
    while (used.has(id)) id = `n${index + 1}-${used.size + 1}`;
    const label = clipped(node?.label, MAX_LABEL);
    if (!label) return;
    used.add(id);
    if (rawId && !idMap.has(rawId)) idMap.set(rawId, id);
    nodes.push({ id, label, role: clipped(node?.role, 32) || '전개', included: node?.included !== false });
  });
  const valid = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(graph?.edges) ? graph.edges : []).slice(0, MAX_NODES * 2).flatMap((edge) => {
    const from = idMap.get(clipped(edge?.from, 64)) ?? clipped(edge?.from, 64);
    const to = idMap.get(clipped(edge?.to, 64)) ?? clipped(edge?.to, 64);
    if (!valid.has(from) || !valid.has(to) || from === to) return [];
    return [{ from, to, relation: clipped(edge?.relation, 48) || '다음 내용' }];
  });
  if (!edges.length) {
    nodes.slice(1).forEach((node, index) => edges.push({ from: nodes[index].id, to: node.id, relation: '다음 내용' }));
  }
  return { nodes, edges };
}

export function activeContextGraph(graph = {}) {
  const normalized = normalizeContextGraph(graph);
  const nodes = normalized.nodes.filter((node) => node.included);
  const activeIds = new Set(nodes.map((node) => node.id));
  let edges = normalized.edges.filter((edge) => activeIds.has(edge.from) && activeIds.has(edge.to));
  if (!edges.length) edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, relation: '다음 내용' }));
  return { nodes, edges };
}

export function graphFromFlow(flow = {}) {
  return normalizeContextGraph({
    nodes: (flow.nodes ?? []).map((node) => ({ ...node, included: true })),
    edges: flow.edges ?? []
  });
}

export function formatContextGraph(graph = {}) {
  const active = activeContextGraph(graph);
  if (!active.nodes.length) return '- 지정된 노드 없음';
  return active.nodes.map((node, index) => `${index + 1}. [${node.role}] ${node.label}`).join('\n');
}
