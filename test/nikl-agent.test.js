import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildKnowledgeAgentReport, discoverKornormsAttachments, getNiklStatus, syncNiklSources } from '../src/knowledge/nikl-agent.js';

const license = { type: 'KOGL-1', label: '공공누리 제1유형', evidenceUrl: 'https://www.korean.go.kr/license', note: '출처표시' };
const source = { id: 'nikl-test', title: '시험 자료', url: 'https://www.korean.go.kr/test', fileName: 'test.html', maxBytes: 1024, expectedContentType: 'text/html', requiredText: '공식 자료', purpose: '시험', license };
const fixedNow = () => new Date('2026-09-05T00:00:00.000Z');

test('NIKL agent stores provenance metadata but does not approve snapshots for prompts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kr-humanizer-nikl-'));
  try {
    const result = await syncNiklSources({ storePath: root, sources: [source], now: fixedNow, fetchImpl: async () => new Response('공식 자료', { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
    assert.equal(result.mode, 'metadata-only');
    assert.equal(result.records[0].approvedForPrompt, false);
    assert.equal(result.records[0].storage, null);
    const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.records[0].sourceUrl, source.url);
    const status = await getNiklStatus({ storePath: root });
    assert.equal(status.automaticReference, true);
    assert.equal(status.officialCards, 20);
    assert.equal(status.rawSnapshotsArePromptSources, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('raw NIKL snapshots require explicit license acknowledgement', async () => {
  await assert.rejects(() => syncNiklSources({ sources: [source], raw: true, fetchImpl: async () => new Response('공식 자료', { headers: { 'content-type': 'text/html' } }) }), /acknowledge-license/);
});

test('raw NIKL snapshots stay in a local cache after acknowledgement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kr-humanizer-nikl-'));
  try {
    const result = await syncNiklSources({ storePath: root, sources: [source], raw: true, acknowledgeLicense: true, now: fixedNow, fetchImpl: async () => new Response('공식 자료 전문', { headers: { 'content-type': 'text/html' } }) });
    assert.equal(result.records[0].storage, 'raw/test.html');
    assert.equal(await readFile(join(root, 'raw', 'test.html'), 'utf8'), '공식 자료 전문');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('NIKL collection parser creates bounded official attachment records with inherited license', () => {
  const collection = { ...source, collection: { pages: 1, downloadPath: '/kornorms/common/download.do', maxAttachmentBytes: 2048 } };
  const html = `<a href="javascript:fnCmdFileDownload('listForm','refr','abc_0','한국어문규정집.pdf','324');">받기</a>`;
  const [attachment] = discoverKornormsAttachments(html, collection, 1);
  assert.equal(attachment.originalFileName, '한국어문규정집.pdf');
  assert.equal(attachment.license.type, 'KOGL-1');
  assert.match(attachment.url, /^https:\/\/www\.korean\.go\.kr\/kornorms\/common\/download\.do\?/);
  assert.equal(attachment.fileName, '324-abc_0.pdf');
});

test('NIKL agent rejects redirects outside official allowlisted hosts', async () => {
  await assert.rejects(() => syncNiklSources({ sources: [source], fetchImpl: async () => new Response('', { status: 302, headers: { location: 'https://example.com/data' } }) }), /허용되지 않은 이동 주소/);
});

test('NIKL agent retries a transient official-server failure', async () => {
  let attempts = 0;
  const root = await mkdtemp(join(tmpdir(), 'kr-humanizer-nikl-'));
  try {
    const result = await syncNiklSources({
      storePath: root,
      sources: [source],
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('temporary connection reset');
        return new Response('공식 자료', { headers: { 'content-type': 'text/html' } });
      }
    });
    assert.equal(attempts, 2);
    assert.equal(result.records.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('NIKL agent rejects HTTP 200 soft-error pages and mislabeled PDFs', async () => {
  await assert.rejects(() => syncNiklSources({ sources: [source], fetchImpl: async () => new Response('오류 페이지', { headers: { 'content-type': 'text/html' } }) }), /필수 문구/);
  const pdfSource = { ...source, id: 'nikl-pdf', fileName: 'rule.pdf', expectedContentType: 'application/pdf', requiredText: '' };
  await assert.rejects(() => syncNiklSources({ sources: [pdfSource], fetchImpl: async () => new Response('not pdf', { headers: { 'content-type': 'application/pdf' } }) }), /PDF 원문/);
});

test('knowledge agent reports only approved official matches as automatically consulted', () => {
  const report = buildKnowledgeAgentReport([
    { id: 'official', authority: '국립국어원' },
    { id: 'community', authority: 'community-skill' }
  ]);
  assert.deepEqual(report.cardIds, ['official']);
  assert.equal(report.officialMatches, 1);
  assert.equal(report.rawSnapshotsUsed, false);
});
