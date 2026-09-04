import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVault } from './vault.js';

const sourceFile = fileURLToPath(new URL('../../data/nikl-sources.json', import.meta.url));
const COPYRIGHT_URL = 'https://www.korean.go.kr/front/nuri/pageView.do?mkn=3&page_id=P000189';
const ALLOWED_HOSTS = new Set(['korean.go.kr', 'www.korean.go.kr']);
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MAX_REQUEST_ATTEMPTS = 3;

function validateSource(source) {
  if (!/^[a-z0-9-]+$/.test(source.id)) throw new Error(`잘못된 국립국어원 자료 id: ${source.id}`);
  if (!/^[a-z0-9.-]+$/.test(source.fileName) || source.fileName.includes('..')) throw new Error(`잘못된 저장 파일명: ${source.fileName}`);
  const url = new URL(source.url);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) throw new Error(`허용되지 않은 국립국어원 주소: ${source.url}`);
  if (!Number.isInteger(source.maxBytes) || source.maxBytes < 1 || source.maxBytes > MAX_TOTAL_BYTES) throw new Error(`잘못된 자료 크기 제한: ${source.id}`);
  if (source.expectedContentType && typeof source.expectedContentType !== 'string') throw new Error(`잘못된 콘텐츠 형식 조건: ${source.id}`);
  if (source.requiredText && typeof source.requiredText !== 'string') throw new Error(`잘못된 본문 확인 조건: ${source.id}`);
  if (!source.license?.type || !source.license?.evidenceUrl) throw new Error(`저작권 근거가 없는 국립국어원 자료: ${source.id}`);
  const evidenceUrl = new URL(source.license.evidenceUrl);
  if (evidenceUrl.protocol !== 'https:' || !ALLOWED_HOSTS.has(evidenceUrl.hostname)) throw new Error(`허용되지 않은 저작권 근거 주소: ${source.id}`);
  if (source.collection) {
    if (!Number.isInteger(source.collection.pages) || source.collection.pages < 1 || source.collection.pages > 10) throw new Error(`잘못된 자료실 페이지 수: ${source.id}`);
    if (!/^\/[-a-zA-Z0-9/._]+$/.test(source.collection.downloadPath)) throw new Error(`잘못된 자료실 다운로드 경로: ${source.id}`);
    if (!Number.isInteger(source.collection.maxAttachmentBytes) || source.collection.maxAttachmentBytes < 1 || source.collection.maxAttachmentBytes > MAX_TOTAL_BYTES) throw new Error(`잘못된 첨부 크기 제한: ${source.id}`);
  }
  return source;
}

function decodeHtml(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function safeExtension(fileName) {
  const match = fileName.toLowerCase().match(/\.(pdf|hwp|hwpx|doc|docx|xls|xlsx|zip|txt)$/);
  return match?.[0] ?? '.bin';
}

export function discoverKornormsAttachments(html, source, pageNumber = 1) {
  const expression = /fnCmdFileDownload\('listForm','([^']+)','([^']+)','([^']+)','([^']+)'\)/g;
  const attachments = [];
  for (const match of html.matchAll(expression)) {
    const [, uploadPath, storedName, originalNameRaw, dataNo] = match;
    const originalName = decodeHtml(originalNameRaw);
    const url = new URL(source.collection.downloadPath, source.url);
    url.search = new URLSearchParams({
      upload_file_path: uploadPath,
      upload_file_name: storedName,
      upload_file_original_name: originalName,
      data_no: dataNo
    }).toString();
    attachments.push({
      id: `${source.id}-${dataNo}-${storedName.replaceAll('_', '-')}`,
      title: originalName,
      url: url.toString(),
      fileName: `${dataNo}-${storedName}${safeExtension(originalName)}`,
      maxBytes: source.collection.maxAttachmentBytes,
      expectedContentType: 'application/octet-stream',
      requiredText: '',
      purpose: `${source.title} ${pageNumber}쪽 첨부 전문`,
      license: source.license,
      parentSourceId: source.id,
      collectionPage: pageNumber,
      originalFileName: originalName
    });
  }
  return attachments;
}

async function officialFetch(url, { fetchImpl, timeoutMs }) {
  let current = new URL(url);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (current.protocol !== 'https:' || !ALLOWED_HOSTS.has(current.hostname)) throw new Error(`허용되지 않은 이동 주소: ${current}`);
    let response;
    let lastError;
    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetchImpl(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'user-agent': 'KR-humanizer/nikl-reference-agent (+https://github.com/kuseumkkrkkr/KR-humanizer)', accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' }
        });
        if (response.status !== 429 && response.status < 500) break;
        await response.body?.cancel();
        lastError = new Error(`국립국어원 자료 임시 응답 (${response.status}): ${current}`);
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < MAX_REQUEST_ATTEMPTS) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 250));
    }
    if (!response || response.status === 429 || response.status >= 500) throw new Error(`국립국어원 자료 요청을 ${MAX_REQUEST_ATTEMPTS}회 완료하지 못했습니다: ${current}`, { cause: lastError });
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

function validateBody(source, response, body) {
  const contentType = response.headers.get('content-type') ?? 'application/octet-stream';
  if (source.expectedContentType && !contentType.toLowerCase().startsWith(source.expectedContentType.toLowerCase())) throw new Error(`${source.id} 자료 형식이 예상과 다릅니다: ${contentType}`);
  if (source.fileName.endsWith('.pdf') && body.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`${source.id} 응답은 PDF 원문이 아닙니다.`);
  if (source.fileName.endsWith('.hwp')) {
    const ole = body.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    const zip = body.subarray(0, 2).toString('ascii') === 'PK';
    if (!ole && !zip) throw new Error(`${source.id} 응답은 HWP 원문이 아닙니다.`);
  }
  if (source.requiredText && !body.toString('utf8').includes(source.requiredText)) throw new Error(`${source.id} 응답에서 필수 문구를 찾지 못했습니다.`);
  return contentType;
}

async function expandCollections(sources, { fetchImpl, timeoutMs }) {
  const expanded = [];
  for (const source of sources) {
    expanded.push(source);
    if (!source.collection) continue;
    for (let page = 1; page <= source.collection.pages; page += 1) {
      const pageUrl = new URL(source.url);
      pageUrl.searchParams.set('pageIndex', String(page));
      const { response } = await officialFetch(pageUrl, { fetchImpl, timeoutMs });
      const body = await readBounded(response, source.maxBytes);
      validateBody({ ...source, requiredText: '자료실' }, response, body);
      const attachments = discoverKornormsAttachments(body.toString('utf8'), source, page);
      if (!attachments.length) throw new Error(`${source.id} 자료실 ${page}쪽에서 첨부를 찾지 못했습니다.`);
      expanded.push(...attachments);
    }
  }
  const seen = new Set();
  return expanded.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
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
  const expanded = await expandCollections(selected, { fetchImpl, timeoutMs });
  const records = [];
  let totalBytes = 0;
  for (const source of expanded) {
    const { response, finalUrl } = await officialFetch(source.url, { fetchImpl, timeoutMs });
    const body = await readBounded(response, source.maxBytes);
    const contentType = validateBody(source, response, body);
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
      license: source.license,
      parentSourceId: source.parentSourceId ?? null,
      collectionPage: source.collectionPage ?? null,
      originalFileName: source.originalFileName ?? null,
      licenseNote: source.license.note,
      approvedForPrompt: false,
      storage: raw ? `raw/${source.fileName}` : null
    };
    if (raw) await atomicWrite(resolve(root, 'raw', source.fileName), body);
    records.push(record);
  }
  const manifest = { schemaVersion: 2, generatedAt: now().toISOString(), mode: raw ? 'raw-local-cache' : 'metadata-only', totalBytes, copyrightUrl: COPYRIGHT_URL, records };
  await atomicWrite(resolve(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, storePath: root };
}

export async function getNiklStatus({ storePath = resolve('.kr-humanizer', 'nikl'), vaultPath } = {}) {
  const notes = await loadVault(vaultPath);
  const official = notes.filter((note) => note.metadata.authority === '국립국어원');
  let manifest = null;
  try { manifest = JSON.parse(await readFile(resolve(storePath, 'manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const licenseCounts = manifest?.records.reduce((counts, record) => {
    const type = record.license?.type ?? 'unknown';
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {}) ?? {};
  const reviewed = official.map((note) => String(note.metadata.reviewed ?? '')).filter(Boolean).sort().at(-1) ?? null;
  return {
    automaticReference: true,
    promptSource: '승인된 Obsidian 카드만 사용',
    officialCards: official.length,
    totalCards: notes.length,
    latestCardReview: reviewed,
    localSnapshot: manifest ? { generatedAt: manifest.generatedAt, mode: manifest.mode, records: manifest.records.length, attachments: manifest.records.filter((record) => record.parentSourceId).length, totalBytes: manifest.totalBytes, licenseCounts, storePath: resolve(storePath) } : null,
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
