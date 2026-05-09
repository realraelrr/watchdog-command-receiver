import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, validateConfig } from '../src/config.js';
import { createPolicy } from '../src/policy.js';
import { createReceiver } from '../src/receiver.js';

function testConfig() {
  return {
    policy: {
      allowedSenderIds: ['ou_admin'],
      allowedChatIds: ['oc_ops'],
      cooldownMs: 1000,
    },
    targets: {
      hermes: {
        label: 'Hermes Gateway',
        commands: {
          restart: {
            gateway: { argv: ['/bin/echo', 'hermes-gateway'], timeoutMs: 1000 },
            cloudflared: { argv: ['/bin/echo', 'hermes-cloudflared'], timeoutMs: 1000 },
            all: { argv: ['/bin/echo', 'hermes-all'], timeoutMs: 1000 },
          },
        },
      },
      openclaw: {
        label: 'OpenClaw Gateway',
        commands: {
          restart: {
            gateway: { argv: ['/bin/echo', 'openclaw-gateway'], timeoutMs: 1000 },
          },
        },
      },
    },
  };
}

function harness(config = testConfig(), policy = createPolicy(config, { now: () => 1000, tokenFactory: () => 'abc123' })) {
  const replies = [];
  const auditEntries = [];
  const executed = [];
  const receiver = createReceiver({
    config,
    policy,
    executor: async (command) => {
      executed.push(command.key);
      return { ok: true, exitCode: 0, reason: 'ok', stdout: `${command.key}\n`, stderr: '', timedOut: false };
    },
    audit: { record: async (entry) => auditEntries.push(entry) },
    reply: async (_context, text) => replies.push(text),
  });

  return { receiver, replies, auditEntries, executed };
}

const context = { senderId: 'ou_admin', chatId: 'oc_ops' };

test('config loader reads and validates config files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-config-'));
  const configPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(testConfig()));

  const loaded = loadConfig(configPath);
  assert.doesNotThrow(() => validateConfig(loaded));
  assert.equal(loaded.targets.hermes.label, 'Hermes Gateway');
  assert.throws(() => validateConfig({ policy: testConfig().policy, targets: {} }), /targets/);
  assert.throws(() => validateConfig({ policy: { allowedSenderIds: [], allowedChatIds: [] }, targets: testConfig().targets }), /allowedSenderIds/);
  assert.throws(() => validateConfig({ policy: testConfig().policy, targets: { 'bad.target': testConfig().targets.hermes } }), /identifier/);
  assert.throws(() => validateConfig({
    policy: testConfig().policy,
    targets: {
      demo: { commands: { restart: { gateway: { argv: ['/bin/echo', 1] } } } },
    },
  }), /argv/);
});

test('receiver denies unauthorized messages before parsing commands', async () => {
  const { receiver, replies, auditEntries, executed } = harness();

  await receiver.handleMessage({ senderId: 'ou_other', chatId: 'oc_ops', text: '/wd restart openclaw gateway' });

  assert.equal(executed.length, 0);
  assert.match(replies[0], /not allowed/);
  assert.equal(auditEntries[0].decision, 'denied');
  assert.equal(auditEntries[0].reason, 'sender_not_allowed');
});

test('receiver preserves chat type for direct-message authorization', async () => {
  const config = testConfig();
  config.policy.allowDirectMessages = true;
  const { receiver, replies, auditEntries } = harness(config);

  await receiver.handleMessage({
    senderId: 'ou_admin',
    chatId: 'oc_direct',
    chatType: 'p2p',
    text: '/wd help',
  });

  assert.match(replies[0], /\/wd restart hermes gateway/);
  assert.equal(auditEntries[0].decision, 'help');
});

test('receiver replies with help as the full command menu', async () => {
  const { receiver, replies } = harness();

  await receiver.handleMessage({ ...context, text: '/wd help' });

  assert.match(replies[0], /Watchdog 使用说明/);
  assert.match(replies[0], /可用操作/);
  assert.match(replies[0], /Hermes Gateway/);
  assert.match(replies[0], /1\. 重启 Hermes 服务 \+ Hermes 的 Tunnel/);
  assert.match(replies[0], /2\. 重启 Hermes 服务/);
  assert.match(replies[0], /3\. 重启 Hermes 的 Tunnel/);
  assert.match(replies[0], /\/wd restart hermes all/);
  assert.match(replies[0], /\/wd restart hermes cloudflared/);
  assert.doesNotMatch(replies[0], /\/wd list/);
  assert.doesNotMatch(replies[0], /确认/);
  assert.match(replies[0], /OpenClaw Gateway/);
  assert.match(replies[0], /重启 OpenClaw 服务/);
  assert.match(replies[0], /\/wd restart openclaw gateway/);
});

test('receiver rejects removed list and confirmation commands without fallback menus', async () => {
  const { receiver, replies, auditEntries } = harness();

  await receiver.handleMessage({ ...context, text: '/wd list' });
  await receiver.handleMessage({ ...context, text: 'confirm abc123' });

  assert.match(replies[0], /无法识别这个命令/);
  assert.match(replies[0], /\/wd help/);
  assert.doesNotMatch(replies[0], /Watchdog 可用操作/);
  assert.match(replies[1], /无法识别这个命令/);
  assert.equal(auditEntries[0].decision, 'unknown');
  assert.equal(auditEntries[1].decision, 'unknown');
});

test('receiver executes direct commands and records audit', async () => {
  const { receiver, replies, auditEntries, executed } = harness();

  await receiver.handleMessage({ ...context, text: '/wd restart openclaw gateway' });

  assert.deepEqual(executed, ['openclaw.restart.gateway']);
  assert.match(replies[0], /succeeded/);
  assert.equal(auditEntries.at(-1).decision, 'executed');
  assert.equal(auditEntries.at(-1).commandKey, 'openclaw.restart.gateway');
});

test('receiver blocks concurrent duplicate executions with cooldown reservation', async () => {
  let release;
  const config = testConfig();
  const policy = createPolicy(config, { now: () => 1000, tokenFactory: () => 'abc123' });
  const replies = [];
  const executed = [];
  const receiver = createReceiver({
    config,
    policy,
    executor: async (command) => {
      executed.push(command.key);
      await new Promise((resolve) => { release = resolve; });
      return { ok: true, exitCode: 0, reason: 'ok', stdout: '', stderr: '', timedOut: false };
    },
    audit: { record: async () => {} },
    reply: async (_context, text) => replies.push(text),
  });

  const first = receiver.handleMessage({ ...context, text: '/wd restart openclaw gateway' });
  const second = receiver.handleMessage({ ...context, text: '/wd restart openclaw gateway' });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([first, second]);

  assert.deepEqual(executed, ['openclaw.restart.gateway']);
  assert.equal(replies.some((reply) => /cooldown_active/.test(reply)), true);
});

test('receiver executes Hermes all without confirmation', async () => {
  const { receiver, replies, executed } = harness();

  await receiver.handleMessage({ ...context, text: '/wd restart hermes all' });

  assert.deepEqual(executed, ['hermes.restart.all']);
  assert.match(replies[0], /succeeded/);
});

test('receiver reports unknown configured targets', async () => {
  const { receiver, replies, executed } = harness();

  await receiver.handleMessage({ ...context, text: '/wd restart hermes worker' });

  assert.equal(executed.length, 0);
  assert.match(replies[0], /Unknown target command/);
});
