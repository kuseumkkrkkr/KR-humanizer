import { splitSentences } from './analyze.js';

function tokens(text) {
  return text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]|\s+/gu) ?? [];
}

function lcsDiff(before, after) {
  const left = tokens(before);
  const right = tokens(after);
  if (left.length * right.length > 250_000) return [{ type: 'remove', text: before }, { type: 'add', text: after }];
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const output = [];
  const push = (type, text) => {
    const previous = output.at(-1);
    if (previous?.type === type) previous.text += text;
    else output.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) { push('same', left[i]); i += 1; j += 1; }
    else if (j < right.length && (i === left.length || table[i][j + 1] > table[i + 1][j])) { push('add', right[j]); j += 1; }
    else { push('remove', left[i]); i += 1; }
  }
  return output;
}

function similarity(a, b) {
  const left = new Set(tokens(a).filter((item) => /[\p{L}\p{N}]/u.test(item)));
  const right = new Set(tokens(b).filter((item) => /[\p{L}\p{N}]/u.test(item)));
  if (!left.size && !right.size) return 1;
  const intersection = [...left].filter((item) => right.has(item)).length;
  return intersection / new Set([...left, ...right]).size;
}

export function buildProposal(original, rewritten) {
  const before = splitSentences(original);
  const after = splitSentences(rewritten);
  let cursor = 0;
  const spans = before.map((sentence) => {
    const start = original.indexOf(sentence, cursor);
    const span = { start: start < 0 ? cursor : start, end: start < 0 ? cursor : start + sentence.length };
    cursor = span.end;
    return span;
  });
  const size = Math.max(before.length, after.length);
  const units = [];
  for (let index = 0; index < size; index += 1) {
    const from = before[index] ?? '';
    const to = after[index] ?? '';
    if (from === to) continue;
    let bestIndex = -1;
    let bestScore = 0;
    after.forEach((candidate, candidateIndex) => {
      const score = similarity(from, candidate);
      if (score > bestScore) { bestScore = score; bestIndex = candidateIndex; }
    });
    units.push({
      id: `s${index + 1}`,
      index,
      start: spans[index]?.start ?? original.length,
      end: spans[index]?.end ?? original.length,
      before: from,
      after: to,
      kind: bestScore >= 0.6 && bestIndex !== index ? 'order' : from && to ? 'rewrite' : from ? 'delete' : 'insert',
      movedTo: bestScore >= 0.6 && bestIndex !== index ? bestIndex : null,
      diff: lcsDiff(from, to)
    });
  }
  return { original, rewritten, originalSentences: before, rewrittenSentences: after, units };
}

export function applyProposal(proposal, acceptedIds) {
  const accepted = new Set(acceptedIds);
  const selected = proposal.units
    .filter((unit) => accepted.has(unit.id))
    .sort((a, b) => b.start - a.start);
  let output = proposal.original;
  for (const unit of selected) {
    if (!Number.isInteger(unit.start) || !Number.isInteger(unit.end)) continue;
    output = `${output.slice(0, unit.start)}${unit.after}${output.slice(unit.end)}`;
  }
  return output;
}
