import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVault } from './vault.js';

const sourceFile = fileURLToPath(new URL('../../data/nikl-sources.json', import.meta.url));
const COPYRIGHT_URL = 'https://www.korean.go.kr/front/nuri/pageView.do?mkn=3&page_id=P000189';
const ALLOWED_HOSTS = new Set(['korean.go.kr', 'www.korean.go.kr']);
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function validateSource(source) {
  if (!/^[a-z0-9-]+$/.test(source.id)) throw new Error(`잘못된 국립국어원 자료 id: ${source.id}`);
  if (!/^[a-z0-9.-]+$/.test(source.fileName) || source.fileName.includes('..')) throw new Error(`잘못된 저장 파일명: ${source.fileName}`);
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error(`허용되지 않은 국립국어원 주소: ${source.url}`);
  if (!Number.isInteger(source.maxBytes) || source.maxBytes < 1 || source.maxBytes > MAX_TOTAL_BYTES) throw new Error(`잘못된 자료 크기 제한: ${source.id}`);
  if (source.expectedContentType && typeof source.expectedContentType !== 'string') throw new Error(`잘못된 콘텐츠 형식 조건: ${source.id}`);
  if (source.requiredText && typeof source.requiredText !== 'string') throw new Error(`잘못된 본문 확인 조건: ${source.id}`);
  return source;
}

async function officialFetch(url, { fetchImpl, timeoutMs }) {
  let current = new URL(url);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (current.protocol !== 'https:' || !ALLOWED_HOSTS.has(current.hostname)) throw new Error(`허용되지 않은 이동 주소: ${current}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'KR-humanizer/nikl-reference-agent (+https://github.com/kuseumkkrkkr/KR-humanizer)', accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' }
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) throw new Error(`국립국어원 자료 이동을 확인할 수 없습니다: ${current}`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) throw new Error(`국립국어원 자료 요청 실패 (${response.status}): ${current}`);
    return { response, finalUrl: current.toString() };
  }
  throw new Error(`국립국어원 자료 이동 횟수가 ${MAX_REDIRECTS}회를 넘었습니다.`);
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`자료가 허용 크기 ${maxBytes}바이트를 넘습니다.`);
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new Error(`자료가 허용 크기 ${maxBytes}바이트를 넘습니다.`); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, size);
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, value);
  await rename(temporary, path);
}

export async function loadNiklSources(path = sourceFile) {
  const sources = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(sources) || !sources.length) throw new Error('국립국어원 자료 목록이 비어 있습니다.');
  return sources.map(validateSource);
}

export async function syncNiklSources({ storePath = resolve('.kr-humanizer', 'nikl'), raw = false, acknowledgeLicense = false, fetchImpl = fetch, timeoutMs = 30_000, sources, now = () => new Date() } = {}) {
  if (raw && !acknowledgeLicense) throw new Error('전문 저장에는 --acknowledge-license가 필요합니다. 개별 자료의 공공누리 유형을 확인하세요.');
  const root = resolve(storePath);
  const selected = (sources ?? await loadNiklSources()).map(validateSource);
  const records = [];
  let totalBytes = 0;
  for (const source of selected) {
    const { response, finalUrl } = await officialFetch(source.url, { fetchImpl, timeoutMs });
    const body = await readBounded(response, source.maxBytes);
    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
    if (source.expectedContentType && !contentType.toLowerCase().startsWith(source.expectedContentType.toLowerCase())) throw new Error(`${source.id} 자료 형식이 예상과 다릅니다: ${contentType}`);
    if (source.fileName.endsWith('.pdf') && body.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`${source.id} 응답은 PDF 원문이 아닙니다.`);
    if (source.requiredText && !body.toString('utf8').includes(source.requiredText)) throw new Error(`${source.id} 응답에서 필수 문구를 찾지 못했습니다.`);
    totalBytes += body.length;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`한 번에 저장할 수 있는 자료는 ${MAX_TOTAL_BYTES}바이트까지입니다.`);
    const record = {
      id: source.id,
      title: source.title,
      sourceUrl: source.url,
      finalUrl,
      purpose: source.purpose,
      contentType,
      bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'),
      retrievedAt: now().toISOString(),
      copyrightUrl: COPYRIGHT_URL,
      licenseNote: '국립국어원 저작권 정책을 따르며 자료에 별도 표시된 공공누리 유형이 있으면 그 조건이 우선합니다.',
      approvedForPrompt: false,
      storage: raw ? `raw/${source.fileName}` : null
    };
    if (raw) await atomicWrite(resolve(root, 'raw', source.fileName), body);
    records.push(record);
  }
  const manifest = { schemaVersion: 1, generatedAt: now().toISOString(), mode: raw ? 'raw-local-cache' : 'metadata-only', totalBytes, copyrightUrl: COPYRIGHT_URL, records };
  await atomicWrite(resolve(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, storePath: root };
}

export async function getNiklStatus({ storePath = resolve('.kr-humanizer', 'nikl'), vaultPath } = {}) {
  const notes = await loadVault(vaultPath);
  const official = notes.filter((note) => note.metadata.authority === '국립국어원');
  let manifest = null;
  try { manifest = JSON.parse(await readFile(resolve(storePath, 'manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const reviewed = official.map((note) => String(note.metadata.reviewed ?? '')).filter(Boolean).sort().at(-1) ?? null;
  return {
    automaticReference: true,
    promptSource: '승인된 Obsidian 카드만 사용',
    officialCards: official.length,
    totalCards: notes.length,
    latestCardReview: reviewed,
    localSnapshot: manifest ? { generatedAt: manifest.generatedAt, mode: manifest.mode, records: manifest.records.length, totalBytes: manifest.totalBytes, storePath: resolve(storePath) } : null,
    rawSnapshotsArePromptSources: false
  };
}

export function buildKnowledgeAgentReport(matches = []) {
  const official = matches.filter((match) => match.authority === '국립국어원');
  return {
    automaticallyConsulted: true,
    mode: 'approved-local-vault',
    officialMatches: official.length,
    cardIds: official.map((match) => match.id),
    rawSnapshotsUsed: false
  };
}
