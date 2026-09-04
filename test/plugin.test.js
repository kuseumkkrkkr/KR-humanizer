import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function json(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
}

test('Codex and Claude plugin manifests share a stable identity', async () => {
  const codex = await json('../plugins/kr-humanizer/.codex-plugin/plugin.json');
  const claude = await json('../plugins/kr-humanizer/.claude-plugin/plugin.json');
  assert.equal(codex.name, 'kr-humanizer');
  assert.equal(claude.name, codex.name);
  assert.equal(claude.version, codex.version);
});

test('both marketplaces resolve the same plugin directory', async () => {
  const codex = await json('../.agents/plugins/marketplace.json');
  const claude = await json('../.claude-plugin/marketplace.json');
  assert.equal(codex.name, 'kr-humanizer');
  assert.equal(codex.plugins[0].source.path, './plugins/kr-humanizer');
  assert.equal(claude.plugins[0].source, './plugins/kr-humanizer');
});
