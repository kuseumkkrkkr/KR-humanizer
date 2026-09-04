import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHonorificProfile } from '../core/style.js';

export const DEFAULT_VAULT_PATH = fileURLToPath(new URL('../../obsidian-vault/', import.meta.url));
const MAX_NOTE_BYTES = 128 * 1024;
const MAX_VAULT_BYTES = 8 * 1024 * 1024;
const MAX_VAULT_FILES = 1_000;
const MAX_DIRECTORY_DEPTH = 8;
const MAX_CONTEXT_CHARS = 6_000;

function parseValue(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('[') && value.endsWith(']')) return value.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  return value.replace(/^['"]|['"]$/g, '');
}

export function parseKnowledgeNote(content, path = '') {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!match) return null;
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/);
    if (field) metadata[field[1]] = parseValue(field[2]);
  }
  const required = ['id', 'title', 'kind', 'authority', 'source_url', 'source_section', 'tags', 'retrieval_terms'];
  if (metadata.retrieval === false || required.some((field) => !metadata[field])) return null;
  if (!Array.isArray(metadata.tags) || !metadata.tags.length || !Array.isArray(metadata.retrieval_terms) || !metadata.retrieval_terms.length) return null;
  const guidance = match[2].match(/## 프롬프트 지침\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/)?.[1]?.trim();
  if (!guidance) return null;
  const appliesWhen = match[2].match(/## 적용 조건\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/)?.[1]?.trim() ?? '';
  const boundary = match[2].match(/## (?:예외와 )?경계\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/)?.[1]?.trim() ?? '';
  return { metadata, guidance, appliesWhen, boundary, path };
}

async function markdownFiles(root) {
  const files = [];
  async function visit(directory, depth = 0) {
    if (depth > MAX_DIRECTORY_DEPTH) throw new Error(`Obsidian 저장소의 폴더 깊이는 ${MAX_DIRECTORY_DEPTH}단계까지 지원합니다.`);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(path);
        if (files.length > MAX_VAULT_FILES) throw new Error(`Obsidian 저장소는 Markdown 파일 ${MAX_VAULT_FILES}개까지 지원합니다.`);
      }
    }
  }
  await visit(root);
  return files.sort((a, b) => a.localeCompare(b, 'ko'));
}

function compact(value) { return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ''); }
function tokens(value) { return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko').match(/[가-힣]{2,}|[a-z0-9][a-z0-9_-]*/g) ?? []; }
function array(value) { return Array.isArray(value) ? value : value ? [value] : []; }

function modeTerms(editMode) {
  return {
    fluent: '맞춤법 띄어쓰기 호응 최소 수정',
    balanced: '호응 결속 명료성 문장 부호',
    strict: '맞춤법 띄어쓰기 문장 부호 호응 높임 일관성 번역투',
    concise: '중복 명사화 장문 군더더기 간결'
  }[editMode] ?? '';
}

function scoreNote(note, query) {
  const title = `${note.metadata.title ?? ''} ${note.metadata.source_section ?? ''}`;
  const tagText = array(note.metadata.tags).join(' ');
  const terms = array(note.metadata.retrieval_terms);
  const triggers = array(note.metadata.trigger_terms);
  const queryTokens = [...new Set(tokens(query))];
  let score = note.metadata.always ? 3 : 0;
  for (const token of queryTokens) {
    if (tokens(title).includes(token)) score += 5;
    if (tokens(tagText).includes(token)) score += 4;
    if (tokens(terms.join(' ')).includes(token)) score += 7;
    if (tokens(note.guidance).includes(token)) score += 1;
  }
  const compactQuery = compact(query);
  for (const term of terms) if (compact(term).length > 1 && compactQuery.includes(compact(term))) score += 12;
  const matchedTerms = triggers.filter((term) => compact(term).length > 1 && compactQuery.includes(compact(term)));
  score += matchedTerms.length * 24;
  if (score > 0 && note.metadata.authority === '국립국어원') score += 2;
  return { score, matchedTerms };
}

export async function loadVault(vaultPath = DEFAULT_VAULT_PATH) {
  const root = resolve(vaultPath);
  const notes = [];
  const ids = new Set();
  let totalBytes = 0;
  for (const path of await markdownFiles(root)) {
    const size = (await stat(path)).size;
    if (size > MAX_NOTE_BYTES) continue;
    totalBytes += size;
    if (totalBytes > MAX_VAULT_BYTES) throw new Error('Obsidian 저장소의 Markdown 합계는 8 MiB까지 지원합니다.');
    const content = await readFile(path, 'utf8');
    const note = parseKnowledgeNote(content, relative(root, path).replaceAll('\\', '/'));
    if (note) {
      if (ids.has(note.metadata.id)) throw new Error(`중복된 지식 카드 id: ${note.metadata.id}`);
      ids.add(note.metadata.id);
      notes.push(note);
    }
  }
  return notes;
}

export async function searchVault({ text, editMode = 'balanced', honorificLevel = 50, vaultPath = DEFAULT_VAULT_PATH, limit = 8 } = {}) {
  const boundedLimit = Math.max(1, Math.min(12, Number(limit) || 8));
  const honorific = getHonorificProfile(honorificLevel);
  const query = String(text ?? '').slice(0, 20_000);
  const scored = (await loadVault(vaultPath)).map((note) => {
    const textMatch = scoreNote(note, query);
    const modeMatch = scoreNote(note, modeTerms(editMode));
    const modeScore = textMatch.score > 0 ? Math.min(3, modeMatch.score) : 0;
    const honorificScore = honorific.key !== 'preserve' && note.metadata.id === 'nikl-relative-honorific-endings' ? 10 : 0;
    return { ...note, score: textMatch.score + modeScore + honorificScore, matchedTerms: textMatch.matchedTerms };
  });
  return scored.filter((note) => note.score > 0).sort((a, b) => b.score - a.score || a.metadata.id.localeCompare(b.metadata.id)).slice(0, boundedLimit).map((note) => ({
    id: note.metadata.id,
    title: note.metadata.title,
    kind: note.metadata.kind,
    authority: note.metadata.authority,
    sourceUrl: note.metadata.source_url,
    sourceSection: note.metadata.source_section,
    path: note.path,
    guidance: note.guidance,
    appliesWhen: note.appliesWhen,
    boundary: note.boundary,
    matchedTerms: note.matchedTerms,
    score: note.score
  }));
}

export function buildKnowledgeContext(matches = []) {
  let context = '';
  for (const match of matches) {
    const conditions = match.appliesWhen ? `\n적용 조건: ${match.appliesWhen}` : '';
    const boundary = match.boundary ? `\n경계: ${match.boundary}` : '';
    const block = `<knowledge-card id="${match.id}">\n제목: ${match.title}\n근거: ${match.sourceSection ?? match.authority} · ${match.sourceUrl}\n지침: ${match.guidance}${conditions}${boundary}\n</knowledge-card>\n`;
    if (context.length + block.length > MAX_CONTEXT_CHARS) break;
    context += `${block}\n`;
  }
  return context.trim() || '- 관련 지식 카드 없음';
}
