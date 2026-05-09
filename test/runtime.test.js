import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractFeishuMessage, createFeishuTransport } from '../src/transports/feishu.js';
import { main } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('Feishu adapter extracts text message events', () => {
  assert.deepEqual(
    extractFeishuMessage({
      sender: { sender_id: { open_id: 'ou_admin', user_id: 'user_1' } },
      message: {
        chat_id: 'oc_ops',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '/wd help' }),
      },
    }),
    {
      senderId: 'ou_admin',
      chatId: 'oc_ops',
      chatType: 'p2p',
      text: '/wd help',
    },
  );
});

test('Feishu adapter strips leading bot mentions before command parsing', () => {
  assert.deepEqual(
    extractFeishuMessage({
      sender: { sender_id: { open_id: 'ou_admin' } },
      message: {
        chat_id: 'oc_ops',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '@Watchdog /wd help' }),
      },
    }),
    {
      senderId: 'ou_admin',
      chatId: 'oc_ops',
      chatType: 'group',
      text: '/wd help',
    },
  );

  assert.deepEqual(
    extractFeishuMessage({
      sender: { sender_id: { open_id: 'ou_admin' } },
      message: {
        chat_id: 'oc_ops',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '<at user_id="ou_bot">Watchdog</at> /wd help' }),
      },
    })?.text,
    '/wd help',
  );
});

test('Feishu adapter ignores non-text or malformed events', () => {
  assert.equal(extractFeishuMessage({ message: { message_type: 'image' } }), null);
  assert.equal(extractFeishuMessage({ message: { message_type: 'text', content: '{bad' } }), null);
});

test('Feishu transport wires SDK event handler and reply API', async () => {
  const createdMessages = [];
  let registeredHandler;
  let startedWith;
  class FakeClient {
    im = {
      v1: {
        message: {
          create: async (payload) => createdMessages.push(payload),
        },
      },
    };
  }
  class FakeDispatcher {
    register(map) {
      registeredHandler = map['im.message.receive_v1'];
      return this;
    }
  }
  class FakeWSClient {
    start(options) {
      startedWith = options;
    }
  }
  const messages = [];
  const transport = createFeishuTransport({
    Lark: {
      Client: FakeClient,
      EventDispatcher: FakeDispatcher,
      WSClient: FakeWSClient,
      LoggerLevel: { info: 'info' },
    },
    config: { feishu: { appId: 'cli_xxx', appSecret: 'secret' } },
    onMessage: async (message) => messages.push(message),
    logger: { debug() {}, info() {} },
  });

  transport.start();
  await registeredHandler({
    sender: { sender_id: { open_id: 'ou_admin' } },
    message: { chat_id: 'oc_ops', chat_type: 'group', message_type: 'text', content: JSON.stringify({ text: '/wd help' }) },
  });
  await transport.reply({ chatId: 'oc_ops' }, 'hello');

  assert.ok(startedWith.eventDispatcher);
  assert.deepEqual(messages, [{ senderId: 'ou_admin', chatId: 'oc_ops', chatType: 'group', text: '/wd help' }]);
  assert.equal(createdMessages[0].data.receive_id, 'oc_ops');
  assert.equal(createdMessages[0].data.content, JSON.stringify({ text: 'hello' }));
});

test('runtime simulate mode invokes receiver and writes output', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receiver-runtime-'));
  const commandPath = path.join(tempDir, 'command.js');
  const configPath = path.join(tempDir, 'config.json');
  fs.writeFileSync(commandPath, 'console.log("simulated command")\n');
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      policy: { allowedSenderIds: ['ou_admin'], allowedChatIds: ['oc_ops'], cooldownMs: 1000 },
      audit: { file: path.join(tempDir, 'audit.jsonl') },
      targets: {
        demo: {
          label: 'Demo',
          commands: {
            restart: {
              gateway: { argv: [process.execPath, commandPath], timeoutMs: 1000 },
            },
          },
        },
      },
    }),
  );

  const writes = [];
  const exitCode = await main([
    'simulate',
    '--config',
    configPath,
    '--sender',
    'ou_admin',
    '--chat',
    'oc_ops',
    '/wd restart demo gateway',
  ], {}, { write: (text) => writes.push(text) });

  assert.equal(exitCode, 0);
  assert.match(writes.join(''), /succeeded/);
  assert.doesNotMatch(writes.join(''), /simulated command/);
});

test('runtime CLI starts even when project path contains spaces', () => {
  const output = execFileSync(process.execPath, [
    'src/index.js',
    'simulate',
    '--config',
    'config.example.json',
    '--sender',
    'ou_admin',
    '--chat',
    'oc_ops',
    '/wd help',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.match(output, /\/wd restart hermes gateway/);
  assert.match(output, /\/wd restart openclaw gateway/);
});

test('runtime reports unknown mode before loading config', async () => {
  const writes = [];
  const exitCode = await main(['bogus'], { HOME: '/no/such/home' }, { write: (text) => writes.push(text) });

  assert.equal(exitCode, 64);
  assert.match(writes.join(''), /Unknown mode: bogus/);
});
