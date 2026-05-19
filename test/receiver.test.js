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
          disable: {
            auto: { argv: ['/bin/echo', 'hermes-disable'], timeoutMs: 1000 },
          },
          enable: {
            auto: { argv: ['/bin/echo', 'hermes-enable'], timeoutMs: 1000 },
          },
          start: {
            agent: { argv: ['/bin/echo', 'hermes-start'], timeoutMs: 1000 },
          },
          stop: {
            agent: { argv: ['/bin/echo', 'hermes-stop'], timeoutMs: 1000 },
          },
          status: {
            auto: { argv: ['/bin/echo', 'hermes-status'], timeoutMs: 1000 },
          },
        },
      },
      openclaw: {
        label: 'OpenClaw Gateway',
        commands: {
          restart: {
            gateway: { argv: ['/bin/echo', 'openclaw-gateway'], timeoutMs: 1000 },
          },
          disable: {
            auto: { argv: ['/bin/echo', 'openclaw-disable'], timeoutMs: 1000 },
          },
          enable: {
            auto: { argv: ['/bin/echo', 'openclaw-enable'], timeoutMs: 1000 },
          },
          start: {
            agent: { argv: ['/bin/echo', 'openclaw-start'], timeoutMs: 1000 },
          },
          stop: {
            agent: { argv: ['/bin/echo', 'openclaw-stop'], timeoutMs: 1000 },
          },
          status: {
            auto: { argv: ['/bin/echo', 'openclaw-status'], timeoutMs: 1000 },
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
  assert.doesNotThrow(() => validateConfig({ ...testConfig(), language: 'zh-CN' }));
  assert.throws(() => validateConfig({ ...testConfig(), language: 'fr' }), /language/);
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

test('receiver replies with English help by default', async () => {
  const { receiver, replies } = harness();

  await receiver.handleMessage({ ...context, text: '/wd help' });

  assert.match(replies[0], /Watchdog Help/);
  assert.match(replies[0], /Run a configured action:/);
  assert.match(replies[0], /Available Actions/);
  assert.match(replies[0], /Hermes Gateway/);
  assert.match(replies[0], /Restart Hermes service \+ Hermes tunnel/);
  assert.match(replies[0], /Disable Hermes automatic repair/);
  assert.match(replies[0], /Stop Hermes watchdog LaunchAgent/);
  assert.match(replies[0], /Show Hermes watchdog status/);
  assert.match(replies[0], /\/wd restart hermes all/);
  assert.match(replies[0], /\/wd restart hermes cloudflared/);
  assert.match(replies[0], /\/wd disable hermes auto/);
  assert.match(replies[0], /\/wd stop hermes agent/);
  assert.doesNotMatch(replies[0], /\/wd list/);
  assert.doesNotMatch(replies[0], /confirm/);
  assert.match(replies[0], /OpenClaw Gateway/);
  assert.match(replies[0], /Restart OpenClaw service/);
  assert.match(replies[0], /Enable OpenClaw automatic repair/);
  assert.match(replies[0], /\/wd restart openclaw gateway/);
  assert.match(replies[0], /\/wd enable openclaw auto/);
});

test('receiver supports Chinese help from config and command override', async () => {
  const zhConfig = { ...testConfig(), language: 'zh-CN' };
  const { receiver, replies } = harness(zhConfig);

  await receiver.handleMessage({ ...context, text: '/wd help' });
  await receiver.handleMessage({ ...context, text: '/wd help en' });
  await receiver.handleMessage({ ...context, text: '/wd help zh' });

  assert.match(replies[0], /Watchdog 使用说明/);
  assert.match(replies[0], /重启 Hermes 服务 \+ Hermes 的 Tunnel/);
  assert.match(replies[0], /关闭 Hermes 自动修复/);
  assert.match(replies[1], /Watchdog Help/);
  assert.match(replies[2], /Watchdog 使用说明/);
});

test('receiver rejects removed list and confirmation commands without fallback menus', async () => {
  const { receiver, replies, auditEntries } = harness();

  await receiver.handleMessage({ ...context, text: '/wd list' });
  await receiver.handleMessage({ ...context, text: 'confirm abc123' });

  assert.match(replies[0], /I do not recognize that command/);
  assert.match(replies[0], /\/wd help/);
  assert.doesNotMatch(replies[0], /Available Actions/);
  assert.match(replies[1], /I do not recognize that command/);
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

test('receiver executes configured manual control commands', async () => {
  const { receiver, replies, executed } = harness();

  await receiver.handleMessage({ ...context, text: '/wd disable hermes auto' });
  await receiver.handleMessage({ ...context, text: '/wd start openclaw agent' });

  assert.deepEqual(executed, ['hermes.disable.auto', 'openclaw.start.agent']);
  assert.match(replies[0], /Command hermes\.disable\.auto succeeded/);
  assert.match(replies[1], /Command openclaw\.start\.agent succeeded/);
});

test('receiver includes status command output in replies', async () => {
  const config = testConfig();
  const replies = [];
  const receiver = createReceiver({
    config,
    policy: createPolicy(config, { now: () => 1000, tokenFactory: () => 'abc123' }),
    executor: async () => ({
      ok: true,
      exitCode: 0,
      reason: 'ok',
      stdout: 'auto_repair=disabled\nlaunchagent=loaded\nlaunchagent_pid=-\n',
      stderr: '',
      timedOut: false,
    }),
    audit: { record: async () => {} },
    reply: async (_context, text) => replies.push(text),
  });

  await receiver.handleMessage({ ...context, text: '/wd status hermes auto' });

  assert.match(replies[0], /Command hermes\.status\.auto succeeded/);
  assert.match(replies[0], /auto_repair=disabled/);
  assert.match(replies[0], /launchagent=loaded/);
  assert.match(replies[0], /launchagent_pid=-/);
});

test('receiver includes command output in failure replies', async () => {
  const config = testConfig();
  const replies = [];
  const receiver = createReceiver({
    config,
    policy: createPolicy(config, { now: () => 1000, tokenFactory: () => 'abc123' }),
    executor: async () => ({
      ok: false,
      exitCode: 1,
      reason: 'nonzero_exit',
      stdout: 'watchdog_launchagent=start_failed\nreason=plist_missing\n',
      stderr: '',
      timedOut: false,
    }),
    audit: { record: async () => {} },
    reply: async (_context, text) => replies.push(text),
  });

  await receiver.handleMessage({ ...context, text: '/wd start hermes agent' });

  assert.match(replies[0], /Command hermes\.start\.agent failed: nonzero_exit/);
  assert.match(replies[0], /watchdog_launchagent=start_failed/);
  assert.match(replies[0], /reason=plist_missing/);
});

test('receiver reports unknown configured targets', async () => {
  const { receiver, replies, executed } = harness();

  await receiver.handleMessage({ ...context, text: '/wd restart hermes worker' });

  assert.equal(executed.length, 0);
  assert.match(replies[0], /Unknown target command/);
});
