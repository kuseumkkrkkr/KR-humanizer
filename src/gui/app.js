const token = document.querySelector('meta[name="kr-humanizer-token"]').content;
const source = document.querySelector('#source');
const status = document.querySelector('#status');
let proposal = null;

const $ = (selector) => document.querySelector(selector);
const show = (selector) => $(selector).classList.remove('hidden');
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
  renderFlow(result.flow);
}

function renderFlow(flow) {
  if (!flow?.nodes?.length) return;
  show('#flow-section');
  const elements = [];
  flow.nodes.forEach((node, index) => {
    if (index) { const arrow = document.createElement('div'); arrow.className = 'flow-arrow'; arrow.textContent = '→'; elements.push(arrow); }
    const box = document.createElement('div'); box.className = 'flow-node';
    const role = document.createElement('strong'); role.textContent = node.role;
    const label = document.createElement('span'); label.textContent = node.label;
    box.append(role, label); elements.push(box);
  });
  $('#flow').replaceChildren(...elements);
}

function renderProposal(value) {
  proposal = value;
  show('#review');
  $('#summary').textContent = value.summary ?? `${value.units.length}개 변경`;
  const elements = value.units.map((unit) => {
    const item = document.createElement('article'); item.className = 'change';
    const head = document.createElement('div'); head.className = 'change-head';
    const label = document.createElement('label');
    const check = document.createElement('input'); check.type = 'checkbox'; check.value = unit.id; check.addEventListener('change', updateSelection);
    label.append(check, ` 문장 ${unit.index + 1}`);
    const tag = document.createElement('span'); tag.className = `tag ${unit.kind}`; tag.textContent = unit.kind === 'order' ? `어순 변경 → ${unit.movedTo + 1}` : unit.kind;
    head.append(label, tag);
    const diff = document.createElement('div'); diff.className = 'diff';
    unit.diff.forEach((part) => { const span = document.createElement('span'); span.className = part.type; span.textContent = part.text; diff.append(span); });
    item.append(head, diff); return item;
  });
  $('#changes').replaceChildren(...(elements.length ? elements : [Object.assign(document.createElement('p'), { textContent: '바뀐 문장이 없습니다.' })]));
  renderFlow(value.flow);
  updateSelection();
}

function selectedIds() { return [...document.querySelectorAll('#changes input:checked')].map((item) => item.value); }
function updateSelection() { $('#selection-count').textContent = `${selectedIds().length}개 선택`; }

source.addEventListener('input', () => { $('#char-count').textContent = `${source.value.length.toLocaleString()}자`; });
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
  try { buttonBusy(button, true); renderProposal(await api('/api/rewrite', { text: source.value, engine: $('#engine').value, tone: $('#tone').value })); notify('윤문 제안을 만들었습니다.'); }
  catch (error) { notify(error.message, true); } finally { buttonBusy(button, false); }
});
$('#accept').addEventListener('click', async () => {
  if (!proposal) return;
  try { const result = await api('/api/accept', { proposal, acceptedIds: selectedIds() }); $('#output').value = result.text; show('#output-section'); notify('선택한 변경을 반영했습니다.'); }
  catch (error) { notify(error.message, true); }
});
$('#copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('#output').value); notify('결과를 복사했습니다.'); });
$('#remember').addEventListener('click', async () => {
  try { await api('/api/remember', { text: `선택한 윤문 변경: ${selectedIds().join(', ')}`, acceptedIds: selectedIds() }); notify('로컬 메모리에 저장했습니다.'); }
  catch (error) { notify(error.message, true); }
});
