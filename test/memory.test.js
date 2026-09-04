import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalMemoryStore } from '../src/memory/local.js';
import { Mem0Store } from '../src/memory/mem0.js';

test('local decisions are stored and retrieved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kr-humanizer-test-'));
  const store = new LocalMemoryStore(join(directory, 'memory.json'));
  await store.add('짧은 문장을 선호합니다.');
  const result = await store.search('짧은 문장');
  assert.equal(result[0].text, '짧은 문장을 선호합니다.');
});

test('mem0 adapter rejects remote hosts', () => {
  assert.throws(() => new Mem0Store({ baseUrl: 'https://api.mem0.ai' }), /localhost/);
});
