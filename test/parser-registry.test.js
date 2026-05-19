import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/parser.js';
import { commandKey, listCommands, resolveCommand } from '../src/registry.js';

const config = {
  targets: {
    hermes: {
      label: 'Hermes Gateway',
      commands: {
        restart: {
          gateway: { argv: ['/bin/echo', 'hermes-gateway'], timeoutMs: 1000 },
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
      },
    },
  },
};

test('parser accepts watchdog aliases and configured action-shaped commands', () => {
  assert.deepEqual(parseCommand('/watchdog restart hermes gateway'), {
    type: 'execute',
    action: 'restart',
    target: 'hermes',
    subject: 'gateway',
    raw: '/watchdog restart hermes gateway',
  });
  assert.deepEqual(parseCommand('/wd restart openclaw gateway'), {
    type: 'execute',
    action: 'restart',
    target: 'openclaw',
    subject: 'gateway',
    raw: '/wd restart openclaw gateway',
  });
  assert.deepEqual(parseCommand('/wd status hermes auto'), {
    type: 'execute',
    action: 'status',
    target: 'hermes',
    subject: 'auto',
    raw: '/wd status hermes auto',
  });
  assert.deepEqual(parseCommand('/wd disable openclaw auto'), {
    type: 'execute',
    action: 'disable',
    target: 'openclaw',
    subject: 'auto',
    raw: '/wd disable openclaw auto',
  });
});

test('parser accepts help commands', () => {
  assert.deepEqual(parseCommand('/watchdog help'), { type: 'help', raw: '/watchdog help' });
  assert.deepEqual(parseCommand('/wd help zh'), { type: 'help', language: 'zh-CN', raw: '/wd help zh' });
  assert.deepEqual(parseCommand('/wd help en'), { type: 'help', language: 'en', raw: '/wd help en' });
});

test('parser rejects unknown text and shell-like extra arguments', () => {
  assert.equal(parseCommand('restart hermes gateway').type, 'unknown');
  assert.equal(parseCommand('confirm 123456').type, 'unknown');
  assert.equal(parseCommand('/wd list').type, 'unknown');
  assert.equal(parseCommand('/wd help fr').type, 'unknown');
  assert.equal(parseCommand('/wd restart hermes gateway && rm -rf /').type, 'unknown');
  assert.equal(parseCommand('/wd restart hermes').type, 'unknown');
});

test('registry lists and resolves only configured commands', () => {
  assert.deepEqual(listCommands(config), [
    {
      key: 'hermes.disable.auto',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'disable',
      subject: 'auto',
    },
    {
      key: 'hermes.enable.auto',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'enable',
      subject: 'auto',
    },
    {
      key: 'hermes.restart.all',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'restart',
      subject: 'all',
    },
    {
      key: 'hermes.restart.gateway',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'restart',
      subject: 'gateway',
    },
    {
      key: 'hermes.start.agent',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'start',
      subject: 'agent',
    },
    {
      key: 'hermes.status.auto',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'status',
      subject: 'auto',
    },
    {
      key: 'hermes.stop.agent',
      target: 'hermes',
      label: 'Hermes Gateway',
      action: 'stop',
      subject: 'agent',
    },
    {
      key: 'openclaw.disable.auto',
      target: 'openclaw',
      label: 'OpenClaw Gateway',
      action: 'disable',
      subject: 'auto',
    },
    {
      key: 'openclaw.restart.gateway',
      target: 'openclaw',
      label: 'OpenClaw Gateway',
      action: 'restart',
      subject: 'gateway',
    },
  ]);

  const parsed = parseCommand('/wd restart hermes gateway');
  const resolved = resolveCommand(config, parsed);
  assert.equal(commandKey(parsed), 'hermes.restart.gateway');
  assert.deepEqual(resolved, {
    key: 'hermes.restart.gateway',
    target: 'hermes',
    label: 'Hermes Gateway',
    action: 'restart',
    subject: 'gateway',
    argv: ['/bin/echo', 'hermes-gateway'],
    timeoutMs: 1000,
  });

  assert.equal(resolveCommand(config, parseCommand('/wd restart hermes cloudflared')), null);
});
