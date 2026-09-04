import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/kr-humanizer.js', import.meta.url));

function invoke(args, input = '') {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test('CLI analyzes piped Korean text', async () => {
  const result = await invoke(['analyze', '-'], '이렇게 하면 되요.');
  assert.equal(result.code, 0);
  assert.ok(JSON.parse(result.stdout).findings.some((finding) => finding.id === 'typo-doeda'));
});

test('CLI sanitizes piped text', async () => {
  const result = await invoke(['sanitize', '-'], '가\u200b나');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '가나\n');
});

test('CLI rejects an invalid honorific level before launching an engine', async () => {
  const result = await invoke(['rewrite', '-', '--honorific', '101'], '문장을 검토한다.');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /높임 정도는 0~100/);
});

test('CLI rejects an unsupported editing mode before launching an engine', async () => {
  const result = await invoke(['rewrite', '-', '--mode', 'creative'], '문장을 검토한다.');
  assert.equal(result.code, 1);
  assert.match(result.stderr, /지원하지 않는 윤문 방식/);
});
