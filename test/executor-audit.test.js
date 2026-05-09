import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executeCommand, summarizeText } from '../src/executor.js';
import { createAuditLogger } from '../src/audit.js';

test('executor runs argv without shell and captures success output', async () => {
  const result = await executeCommand({
    argv: [process.execPath, '-e', 'console.log(process.argv.slice(1).join("|"))', 'hello world', '&&', 'no-shell'],
    timeoutMs: 1000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'hello world|&&|no-shell');
  assert.equal(result.timedOut, false);
});

test('executor reports non-zero exits', async () => {
  const result = await executeCommand({
    argv: [process.execPath, '-e', 'console.error("bad"); process.exit(7)'],
    timeoutMs: 1000,
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.equal(result.stderr.trim(), 'bad');
});

test('executor times out long-running commands', async () => {
  const result = await executeCommand({
    argv: [process.execPath, '-e', 'setTimeout(() => {}, 5000)'],
    timeoutMs: 50,
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.reason, 'timeout');
});

test('executor escalates timeout when child ignores SIGTERM', async () => {
  const result = await executeCommand({
    argv: [process.execPath, '-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)'],
    timeoutMs: 30,
    killGraceMs: 30,
  });

  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  assert.equal(result.reason, 'timeout');
});

test('executor caps captured output before summarization', async () => {
  const result = await executeCommand({
    argv: [process.execPath, '-e', 'console.log("x".repeat(1000))'],
    timeoutMs: 1000,
    maxOutputBytes: 32,
  });

  assert.equal(result.ok, true);
  assert.equal(result.stdout.length <= 33, true);
  assert.equal(result.stdoutTruncated, true);
});

test('summarizeText compacts whitespace and truncates long output', () => {
  assert.equal(summarizeText('  hello\n  world  ', 100), 'hello world');
  assert.equal(summarizeText('abcdef', 4), 'abc…');
});

test('audit logger appends JSONL records', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-audit-'));
  const auditPath = path.join(tempDir, 'audit', 'audit.jsonl');
  const audit = createAuditLogger(auditPath, { now: () => '2026-05-09T00:00:00Z' });

  await audit.record({ decision: 'executed', commandKey: 'openclaw.restart.gateway' });
  await audit.record({ decision: 'denied', reason: 'sender_not_allowed' });

  const lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines, [
    {
      timestamp: '2026-05-09T00:00:00Z',
      decision: 'executed',
      commandKey: 'openclaw.restart.gateway',
    },
    {
      timestamp: '2026-05-09T00:00:00Z',
      decision: 'denied',
      reason: 'sender_not_allowed',
    },
  ]);
  assert.equal((fs.statSync(auditPath).mode & 0o777), 0o600);
});
