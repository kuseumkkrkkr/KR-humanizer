import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const proposal = JSON.parse(await readFile(new URL('../experiments/norm-regression/2026-09-05-codex-proposal.json', import.meta.url), 'utf8'));

test('Codex EXEC norm regression fixes sourced issues without the observed translationese regression', () => {
  assert.match(proposal.rewritten, /며칠 뒤에/);
  assert.match(proposal.rewritten, /금세/);
  assert.match(proposal.rewritten, /예상됐/);
  assert.match(proposal.rewritten, /안 된다고/);
  assert.match(proposal.rewritten, /왠지/);
  assert.match(proposal.rewritten, /어떻게 신청/);
  assert.doesNotMatch(proposal.rewritten, /몇일|금새|됬|됌|웬지|어떡해 신청|목적은[^.]*데 있어/);
  assert.ok(proposal.rewrittenSentences.length > proposal.originalSentences.length);
  assert.deepEqual(
    ['nikl-lexicon-geumse', 'nikl-sentence-information-splitting', 'nikl-translationese-e-itta'].map((id) => proposal.knowledge.some((card) => card.id === id)),
    [true, true, true]
  );
});
