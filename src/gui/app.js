const token = document.querySelector('meta[name="kr-humanizer-token"]').content;
const source = document.querySelector('#source');
const status = document.querySelector('#status');
let proposal = null;
let reviewFilter = 'all';
let reviewView = 'unified';
let appliedIds = new Set();
let contextGraph = { nodes: [], edges: [] };
let completion = '';
let completionTimer = null;
let completionRequest = 0;
let composing = false;

const honorificLabels = {
  0: '평어 · 해체',
  25: '서술형 평어 · 해라체',
  50: '중립 · 원문 유지',
  75: '부드러운 경어 · 해요체',
  100: '격식 경어 · 하십시오체'
};

const $ = (selector) => document.querySelector(selector);
const show = (selector) => $(selector).classList.remove('hidden');
const explanationLevel = () => document.querySelector('input[name="explanation"]:checked').value;
const activeNodes = () => contextGraph.nodes.filter((node) => node.included !== false);
const sequentialEdges = (nodes) => nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, relation: '다음 내용' }));
function settingsPayload() {
  return { engine: $('#engine').value, tone: $('#tone').value, editMode: $('#edit-mode').value, honorificLevel: Number($('#honorific').value), explanationLevel: explanationLevel(), model: $('#autocomplete-model').value };
}
function updateHonorific() {
  const level = Number($('#honorific').value);
  $('#honorific-value').textContent = honorificLabels[level];
  $('#honorific').setAttribute('aria-valuetext', `${honorificLabels[level]} ${level}`);
  updateSettingsSummary();
}
function updateSettingsSummary() {
  const mode = $('#edit-mode')?.selectedOptions[0]?.textContent ?? '중간 · 논리와 반복';
  const modeHelp = {
    weak: '문장 수와 순서를 유지하고 어투·종결 표현만 바꿉니다.',
    medium: '맥락 그래프와 AI식 상투 표현·재설명·반복까지 점검합니다.',
    strict: '중간 점검에 국립국어원 규범과 문법·호응 추론을 더합니다.'
  }[$('#edit-mode')?.value];
  const speech = honorificLabels[Number($('#honorific')?.value ?? 50)].replace(/^중립 · /, '');
  const explanation = document.querySelector('input[name="explanation"]:checked')?.nextElementSibling?.textContent ?? '중간';
  if ($('#settings-summary')) $('#settings-summary').textContent = `${mode} · ${speech} · 설명 ${explanation}`;
  if ($('#edit-mode-help')) $('#edit-mode-help').textContent = modeHelp;
}
function notify(message, error = false) {
  status.textContent = message;
  status.style.background = error ? '#8f3027' : '#18201c';
  status.classList.add('show');
  setTimeout(() => status.classList.remove('show'), 3200);
}

async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kr-humanizer-token': token }, body: JSON.stringify(body) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `HTTP ${response.status}`);
  return value;
}

function buttonBusy(button, busy) {
  button.disabled = busy;
  button.dataset.label ??= button.textContent;
  button.textContent = busy ? '처리 중…' : button.dataset.label;
}

function dismissCompletion() {
  completion = '';
  $('#completion-text').textContent = '';
  $('#completion-panel').classList.add('hidden');
  $('#completion-panel').classList.remove('empty');
  $('#accept-completion').disabled = true;
}

function acceptCompletion() {
  if (!completion) return;
  const separator = /\s$/.test(source.value) ? '' : ' ';
  source.value += `${separator}${completion}`;
  source.setSelectionRange(source.value.length, source.value.length);
  dismissCompletion();
  source.dispatchEvent(new Event('input'));
  source.focus();
}

async function requestCompletion(sequence) {
  if (!$('#autocomplete-enabled').checked || source.selectionStart !== source.value.length || source.selectionEnd !== source.value.length || source.value.trim().length < 20) return;
  $('#autocomplete-capability').textContent = '다음 문장 생성 중…';
  try {
    const result = await api('/api/autocomplete', { text: source.value, contextGraph, ...settingsPayload() });
    if (sequence !== completionRequest || !$('#autocomplete-enabled').checked) return;
    completion = result.completion;
    const hasCompletion = Boolean(completion);
    $('#completion-text').textContent = completion || '안전하게 이어 쓸 문장을 찾지 못했습니다. 문장을 조금 더 이어 쓰거나 맥락 그래프를 추가하면 다시 제안합니다.';
    $('#completion-panel').classList.remove('hidden');
    $('#completion-panel').classList.toggle('empty', !hasCompletion);
    $('#accept-completion').disabled = !hasCompletion;
    const modelLabel = $('#autocomplete-model').selectedOptions[0]?.textContent ?? $('#autocomplete-model').value;
    $('#autocomplete-capability').textContent = hasCompletion ? `${modelLabel} · Codex EXEC 준비됨` : '추가 제안 없음 · 계속 입력하면 재시도';
  } catch (error) {
    if (sequence !== completionRequest) return;
    if (error.message.includes('처리 중')) {
      $('#autocomplete-capability').textContent = '이전 제안 처리 중';
      completionTimer = setTimeout(() => requestCompletion(sequence), 800);
    } else $('#autocomplete-capability').textContent = '자동완성 실패';
  }
}

function scheduleCompletion() {
  clearTimeout(completionTimer);
  completionRequest += 1;
  dismissCompletion();
  if (!composing && $('#autocomplete-enabled').checked && source.value.trim().length >= 20 && source.selectionStart === source.value.length) {
    const sequence = completionRequest;
    completionTimer = setTimeout(() => requestCompletion(sequence), 1200);
  }
}

function renderAnalysis(result) {
  show('#diagnosis');
  const names = { characters: '글자', paragraphs: '문단', sentences: '문장', averageSentenceLength: '평균 문장 길이' };
  $('#stats').replaceChildren(...Object.entries(result.stats).map(([key, value]) => {
    const item = document.createElement('div'); item.className = 'stat';
    const strong = document.createElement('strong'); strong.textContent = value;
    const label = document.createElement('span'); label.textContent = names[key];
    item.append(strong, label); return item;
  }));
  const elements = result.findings.length ? result.findings.map((finding) => {
    const item = document.createElement('div'); item.className = 'finding';
    const kind = document.createElement('span'); kind.className = 'kind'; kind.textContent = finding.kind;
    const text = document.createElement('p');
    if (finding.found || finding.codePoint) { const code = document.createElement('code'); code.textContent = finding.found || finding.codePoint; text.append(code, ' '); }
    text.append(finding.message);
    const confidence = document.createElement('span'); confidence.className = 'confidence'; confidence.textContent = finding.confidence ? `${Math.round(finding.confidence * 100)}%` : '';
    item.append(kind, text, confidence); return item;
  }) : [Object.assign(document.createElement('p'), { textContent: '현재 규칙에서 발견한 항목이 없습니다.' })];
  $('#findings').replaceChildren(...elements);
  if (!contextGraph.nodes.length) renderGraph(result.flow);
}

function renderGraphPreview() {
  const nodes = activeNodes();
  const elements = [];
  nodes.forEach((node, index) => {
    if (index) { const arrow = document.createElement('div'); arrow.className = 'flow-arrow'; arrow.textContent = '→'; elements.push(arrow); }
    const box = document.createElement('div'); box.className = 'flow-node';
    const role = document.createElement('strong'); role.textContent = node.role;
    const label = document.createElement('span'); label.textContent = node.label;
    box.append(role, label); elements.push(box);
  });
  $('#flow').replaceChildren(...(elements.length ? elements : [Object.assign(document.createElement('p'), { textContent: '활성 노드가 없습니다.' })]));
}

function updateGraphControls() {
  const active = activeNodes().length;
  $('#graph-state').textContent = `활성 노드 ${active}/${contextGraph.nodes.length}`;
  $('#draft').disabled = !$('#brief').value.trim() || active === 0;
  renderGraphPreview();
}

function renderGraph(flow) {
  const nodes = (flow?.nodes ?? []).slice(0, 32).map((node, index) => ({
    id: String(node.id || `n${index + 1}`),
    label: String(node.label ?? '').slice(0, 240),
    role: String(node.role || '전개').slice(0, 32),
    included: node.included !== false
  })).filter((node) => node.label);
  if (!nodes.length) return;
  contextGraph = { nodes, edges: sequentialEdges(nodes) };
  show('#flow-section');
  const rows = nodes.map((node, index) => {
    const row = document.createElement('div'); row.className = 'graph-node-row'; row.dataset.id = node.id; row.classList.toggle('excluded', !node.included);
    const order = document.createElement('span'); order.className = 'node-order'; order.textContent = String(index + 1);
    const includeLabel = document.createElement('label'); includeLabel.className = 'node-include';
    const include = document.createElement('input'); include.type = 'checkbox'; include.checked = node.included; include.setAttribute('aria-label', `${index + 1}번 노드 포함`);
    const includeText = document.createElement('span'); includeText.textContent = '포함'; includeLabel.append(include, includeText);
    const role = document.createElement('select'); role.className = 'node-role'; role.setAttribute('aria-label', `${index + 1}번 노드 역할`);
    ['도입', '주장', '근거', '예시', '반론', '전환', '전개', '결론', '마무리'].forEach((value) => role.append(Object.assign(document.createElement('option'), { value, textContent: value })));
    if (![...role.options].some((option) => option.value === node.role)) role.append(Object.assign(document.createElement('option'), { value: node.role, textContent: node.role }));
    role.value = node.role;
    const label = document.createElement('input'); label.className = 'node-label'; label.type = 'text'; label.maxLength = 240; label.value = node.label; label.setAttribute('aria-label', `${index + 1}번 노드 내용`);
    const actions = document.createElement('div'); actions.className = 'node-actions';
    const up = document.createElement('button'); up.type = 'button'; up.className = 'node-move'; up.textContent = '↑'; up.title = '위로'; up.disabled = index === 0;
    const down = document.createElement('button'); down.type = 'button'; down.className = 'node-move'; down.textContent = '↓'; down.title = '아래로'; down.disabled = index === nodes.length - 1;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'node-remove'; remove.textContent = '삭제';
    include.addEventListener('change', () => { node.included = include.checked; row.classList.toggle('excluded', !node.included); updateGraphControls(); });
    role.addEventListener('change', () => { node.role = role.value; renderGraphPreview(); });
    label.addEventListener('input', () => { node.label = label.value; renderGraphPreview(); });
    const move = (offset) => { const [item] = contextGraph.nodes.splice(index, 1); contextGraph.nodes.splice(index + offset, 0, item); renderGraph(contextGraph); };
    up.addEventListener('click', () => move(-1)); down.addEventListener('click', () => move(1));
    remove.addEventListener('click', () => { contextGraph.nodes.splice(index, 1); if (contextGraph.nodes.length) renderGraph(contextGraph); else { contextGraph = { nodes: [], edges: [] }; $('#graph-nodes').replaceChildren(); updateGraphControls(); } });
    actions.append(up, down, remove); row.append(order, includeLabel, role, label, actions); return row;
  });
  $('#graph-nodes').replaceChildren(...rows);
  contextGraph.edges = sequentialEdges(contextGraph.nodes);
  updateGraphControls();
}

function diffLine(unit, side) {
  const before = side === 'before';
  const line = document.createElement('div');
  line.className = `diff-line ${before ? 'removed-line' : 'added-line'}`;
  const sign = document.createElement('span'); sign.className = 'diff-sign'; sign.textContent = before ? '−' : '+';
  const number = document.createElement('span'); number.className = 'diff-line-number';
  number.textContent = String((before ? unit.index : (unit.movedTo ?? unit.index)) + 1);
  const content = document.createElement('div'); content.className = 'diff-line-content';
  const allowed = before ? new Set(['same', 'remove']) : new Set(['same', 'add']);
  unit.diff.filter((part) => allowed.has(part.type)).forEach((part) => {
    const span = document.createElement('span');
    span.className = part.type === 'same' ? 'same' : `word-${part.type}`;
    span.textContent = part.text; content.append(span);
  });
  if (!content.childNodes.length) content.textContent = before ? '(원문 없음)' : '(삭제됨)';
  line.append(sign, number, content);
  return line;
}

function setItemDecision(item, decision, update = true) {
  item.dataset.decision = decision;
  const checkbox = item.querySelector('input[type="checkbox"]');
  checkbox.checked = decision === 'accepted';
  item.querySelector('[data-decision="accept"]').setAttribute('aria-pressed', String(decision === 'accepted'));
  item.querySelector('[data-decision="reject"]').setAttribute('aria-pressed', String(decision === 'rejected'));
  if (update) updateSelection();
}

function renderProposal(value) {
  proposal = value;
  reviewFilter = 'all';
  reviewView = 'unified';
  appliedIds = new Set();
  show('#review');
  $('#summary').textContent = value.summary ?? `${value.units.length}개 변경`;
  const elements = value.units.map((unit) => {
    const item = document.createElement('article'); item.className = 'change'; item.dataset.kind = unit.kind; item.dataset.id = unit.id;
    item.dataset.decision = 'pending';
    const head = document.createElement('div'); head.className = 'change-head';
    const title = document.createElement('div'); title.className = 'hunk-title';
    const label = document.createElement('label'); label.className = 'change-select';
    const check = document.createElement('input'); check.type = 'checkbox'; check.value = unit.id;
    label.append(check, ` 문장 ${unit.index + 1}`);
    const kindLabels = { rewrite: '문장 수정', insert: '문장 추가', delete: '문장 삭제' };
    const tag = document.createElement('span'); tag.className = `tag ${unit.kind}`; tag.textContent = unit.kind === 'order' ? `↕ 어순 ${unit.index + 1} → ${unit.movedTo + 1}` : (kindLabels[unit.kind] ?? unit.kind);
    title.append(label, tag);
    const actions = document.createElement('div'); actions.className = 'hunk-actions';
    const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'decision-button accept-change'; accept.dataset.decision = 'accept'; accept.setAttribute('aria-pressed', 'false'); accept.setAttribute('aria-label', `문장 ${unit.index + 1} 변경 수락`); accept.textContent = '수락';
    const reject = document.createElement('button'); reject.type = 'button'; reject.className = 'decision-button reject-change'; reject.dataset.decision = 'reject'; reject.setAttribute('aria-pressed', 'false'); reject.setAttribute('aria-label', `문장 ${unit.index + 1} 변경 거절`); reject.textContent = '거절';
    actions.append(accept, reject); head.append(title, actions);
    check.addEventListener('change', () => setItemDecision(item, check.checked ? 'accepted' : 'pending'));
    accept.addEventListener('click', () => setItemDecision(item, 'accepted'));
    reject.addEventListener('click', () => setItemDecision(item, 'rejected'));
    const diff = document.createElement('div'); diff.className = 'unified-comparison';
    if (unit.before) diff.append(diffLine(unit, 'before'));
    if (unit.kind === 'order') {
      const move = document.createElement('div'); move.className = 'move-note'; move.textContent = `↕ 문장 ${unit.index + 1}에서 ${unit.movedTo + 1}(으)로 이동`;
      diff.append(move);
    }
    if (unit.after) diff.append(diffLine(unit, 'after'));
    const split = document.createElement('div'); split.className = 'split-comparison';
    const before = document.createElement('section'); const beforeLabel = document.createElement('strong'); beforeLabel.textContent = '원문';
    const beforeText = document.createElement('p'); beforeText.textContent = unit.before || '(없음)'; before.append(beforeLabel, beforeText);
    const after = document.createElement('section'); const afterLabel = document.createElement('strong'); afterLabel.textContent = '제안';
    const afterText = document.createElement('p'); afterText.textContent = unit.after || '(삭제)'; after.append(afterLabel, afterText);
    split.append(before, after);
    item.append(head, diff, split); return item;
  });
  $('#changes').replaceChildren(...(elements.length ? elements : [Object.assign(document.createElement('p'), { textContent: '바뀐 문장이 없습니다.' })]));
  updateReviewControls();
  if (!contextGraph.nodes.length) renderGraph(value.flow);
  updateSelection();
}

function selectedIds() { return [...document.querySelectorAll('#changes input:checked')].map((item) => item.value); }
function matchesFilter(kind) {
  if (reviewFilter === 'all') return true;
  if (reviewFilter === 'structural') return kind === 'insert' || kind === 'delete';
  return kind === reviewFilter;
}
function updateReviewControls() {
  if (!proposal) return;
  const counts = proposal.units.reduce((value, unit) => {
    value.all += 1;
    value[unit.kind] = (value[unit.kind] || 0) + 1;
    if (unit.kind === 'insert' || unit.kind === 'delete') value.structural += 1;
    return value;
  }, { all: 0, rewrite: 0, order: 0, structural: 0 });
  document.querySelectorAll('.filter-button').forEach((button) => {
    const active = button.dataset.filter === reviewFilter;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    button.querySelector('span').textContent = counts[button.dataset.filter] || 0;
  });
  document.querySelectorAll('.view-button').forEach((button) => {
    const active = button.dataset.view === reviewView;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#changes').dataset.view = reviewView;
  document.querySelectorAll('#changes .change').forEach((item) => item.classList.toggle('filtered-out', !matchesFilter(item.dataset.kind)));
}
function updateSelection() {
  const count = selectedIds().length;
  const total = proposal?.units.length ?? 0;
  const rejected = document.querySelectorAll('#changes .change[data-decision="rejected"]').length;
  const pending = Math.max(0, total - count - rejected);
  $('#selection-count').textContent = `수락 ${count}/${total}`;
  $('#accept').disabled = count === 0;
  $('#accept').textContent = count ? `수락한 ${count}개 변경 적용` : '수락할 변경이 없습니다';
  if (proposal) {
    const applied = appliedIds.size ? `확정 결과에 ${appliedIds.size}개 반영됨 · ` : '';
    $('#review-state').textContent = `${applied}수락 ${count} · 거절 ${rejected} · 미결정 ${pending}`;
  }
}

document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => {
  reviewFilter = button.dataset.filter; updateReviewControls();
}));
document.querySelectorAll('.view-button').forEach((button) => button.addEventListener('click', () => {
  reviewView = button.dataset.view; updateReviewControls();
}));
$('#select-visible').addEventListener('click', () => {
  document.querySelectorAll('#changes .change:not(.filtered-out)').forEach((item) => setItemDecision(item, 'accepted', false));
  updateSelection();
});
$('#clear-selection').addEventListener('click', () => {
  document.querySelectorAll('#changes .change').forEach((item) => setItemDecision(item, 'pending', false));
  updateSelection();
});

$('#honorific').addEventListener('input', updateHonorific);
updateHonorific();

function updateBriefState() {
  const length = $('#brief').value.length;
  const available = length > 0;
  $('#brief-count').textContent = `${length.toLocaleString()}/4,000자`;
  $('#plan-mode').disabled = !available;
  if (!available) $('#plan-mode').checked = false;
  $('#plan').disabled = !available || !$('#plan-mode').checked;
  $('#plan-help').textContent = !available ? '프롬프트를 입력하면 노드를 먼저 설계할 수 있습니다.' : $('#plan-mode').checked ? '초안보다 맥락 노드를 먼저 만듭니다.' : 'Plan 모드를 켜면 노드를 먼저 만들 수 있습니다.';
  updateGraphControls();
}

$('#brief').addEventListener('input', updateBriefState);
$('#plan-mode').addEventListener('change', updateBriefState);
document.querySelectorAll('input[name="explanation"]').forEach((item) => item.addEventListener('change', () => { updateGraphControls(); updateSettingsSummary(); }));
$('#edit-mode').addEventListener('change', updateSettingsSummary);
updateBriefState();

source.addEventListener('input', () => { $('#char-count').textContent = `${source.value.length.toLocaleString()}자`; scheduleCompletion(); });
source.addEventListener('compositionstart', () => { composing = true; clearTimeout(completionTimer); });
source.addEventListener('compositionend', () => { composing = false; scheduleCompletion(); });
source.addEventListener('click', () => { if (source.selectionStart !== source.value.length) dismissCompletion(); });
source.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && completion && !composing) { event.preventDefault(); acceptCompletion(); }
  if (event.key === 'Escape' && completion) { event.preventDefault(); dismissCompletion(); }
});
$('#accept-completion').addEventListener('click', acceptCompletion);
$('#dismiss-completion').addEventListener('click', dismissCompletion);
$('#autocomplete-enabled').addEventListener('change', () => {
  dismissCompletion();
  $('#autocomplete-capability').textContent = $('#autocomplete-enabled').checked ? '입력 끝에서 잠시 멈추면 제안합니다.' : '자동완성 꺼짐';
  if ($('#autocomplete-enabled').checked) scheduleCompletion();
});
$('#autocomplete-model').addEventListener('change', () => {
  dismissCompletion();
  if ($('#autocomplete-enabled').checked) scheduleCompletion();
});

api('/api/capabilities', {}).then(({ codex }) => {
  $('#autocomplete-enabled').disabled = !codex.available;
  $('#autocomplete-capability').textContent = codex.available ? `${codex.version} · 사용 가능` : 'Codex EXEC를 찾지 못했습니다.';
}).catch(() => { $('#autocomplete-capability').textContent = 'Codex EXEC 확인 실패'; });
$('#plan').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    buttonBusy(button, true);
    const result = await api('/api/plan', { brief: $('#brief').value, ...settingsPayload() });
    renderGraph(result);
    notify(`${result.nodes.length}개 계획 노드를 만들었습니다.`);
  } catch (error) { notify(error.message, true); } finally { buttonBusy(button, false); updateBriefState(); }
});
$('#add-node').addEventListener('click', () => {
  const next = contextGraph.nodes.length + 1;
  contextGraph.nodes.push({ id: `manual-${Date.now()}-${next}`, role: '전개', label: '새 설명 노드', included: true });
  renderGraph(contextGraph);
});
$('#draft').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    buttonBusy(button, true);
    const result = await api('/api/draft', { brief: $('#brief').value, contextGraph, ...settingsPayload() });
    source.value = result.rewrittenText;
    source.dispatchEvent(new Event('input'));
    if (result.flow?.nodes?.length) renderGraph(result.flow);
    notify('활성 노드로 초안을 작성했습니다.');
  } catch (error) { notify(error.message, true); } finally { buttonBusy(button, false); updateGraphControls(); }
});
$('#analyze').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try { buttonBusy(button, true); renderAnalysis(await api('/api/analyze', { text: source.value })); notify('점검을 마쳤습니다.'); }
  catch (error) { notify(error.message, true); } finally { buttonBusy(button, false); }
});
$('#sanitize').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try { buttonBusy(button, true); const result = await api('/api/sanitize', { text: source.value }); source.value = result.text; source.dispatchEvent(new Event('input')); notify(`${result.removed.length}개 비가시 문자를 정리했습니다.`); }
  catch (error) { notify(error.message, true); } finally { buttonBusy(button, false); }
});
$('#rewrite').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    if ($('#plan-mode').checked && !activeNodes().length) throw new Error('Plan 모드에서 계획 노드를 먼저 만드세요.');
    buttonBusy(button, true);
    renderProposal(await api('/api/rewrite', { text: source.value, brief: $('#brief').value, contextGraph, ...settingsPayload() }));
    notify('윤문 제안을 만들었습니다.');
  }
  catch (error) { notify(error.message, true); } finally { buttonBusy(button, false); }
});
$('#accept').addEventListener('click', async () => {
  if (!proposal) return;
  const acceptedIds = selectedIds();
  if (!acceptedIds.length) return;
  try {
    const result = await api('/api/accept', { proposal, acceptedIds }); $('#output').value = result.text; show('#output-section');
    appliedIds = new Set(acceptedIds);
    document.querySelectorAll('#changes .change').forEach((item) => item.classList.toggle('applied', appliedIds.has(item.dataset.id)));
    $('#review-state').textContent = `${acceptedIds.length}개 변경을 반영했습니다. 아래 확정 결과를 확인하세요.`;
    notify(`선택한 ${acceptedIds.length}개 변경을 반영했습니다.`);
  }
  catch (error) { notify(error.message, true); }
});
$('#copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('#output').value); notify('결과를 복사했습니다.'); });
$('#remember').addEventListener('click', async () => {
  try { await api('/api/remember', { text: `선택한 윤문 변경: ${selectedIds().join(', ')}`, acceptedIds: selectedIds() }); notify('로컬 메모리에 저장했습니다.'); }
  catch (error) { notify(error.message, true); }
});
