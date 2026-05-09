#!/usr/bin/env node
import * as Lark from '@larksuiteoapi/node-sdk';
import { fileURLToPath } from 'node:url';
import { createAuditLogger } from './audit.js';
import { loadConfig, validateConfig } from './config.js';
import { executeCommand } from './executor.js';
import { createPolicy } from './policy.js';
import { createReceiver } from './receiver.js';
import { createFeishuTransport } from './transports/feishu.js';

function optionValue(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return argv[index + 1] ?? fallback;
}

function messageArg(argv) {
  return argv[argv.length - 1] ?? '';
}

function defaultConfigPath(env) {
  return env.WATCHDOG_COMMAND_CONFIG || `${env.HOME}/.watchdog-command-receiver/config/config.json`;
}

function buildReceiver(config, reply, auditPath, env = process.env) {
  const policy = createPolicy(config);
  const audit = createAuditLogger(auditPath ?? config.audit?.file ?? `${env.HOME}/.watchdog-command-receiver/audit/audit.jsonl`);
  return createReceiver({
    config,
    policy,
    executor: executeCommand,
    audit,
    reply,
  });
}

export async function main(argv = process.argv.slice(2), env = process.env, io = process.stdout) {
  const mode = argv[0] ?? 'serve';
  if (mode !== 'serve' && mode !== 'simulate') {
    io.write(`Unknown mode: ${mode}\n`);
    return 64;
  }

  const configPath = optionValue(argv, '--config', defaultConfigPath(env));
  const config = loadConfig(configPath);
  validateConfig(config);

  if (mode === 'simulate') {
    const senderId = optionValue(argv, '--sender', 'local');
    const chatId = optionValue(argv, '--chat', 'local');
    const receiver = buildReceiver(config, async (_context, text) => {
      io.write(`${text}\n`);
    }, config.audit?.file, env);
    await receiver.handleMessage({ senderId, chatId, text: messageArg(argv) });
    return 0;
  }

  const transport = createFeishuTransport({
    Lark,
    config,
    onMessage: async (message) => receiver.handleMessage(message),
  });
  const receiver = buildReceiver(config, (context, text) => transport.reply(context, text), config.audit?.file, env);
  transport.start();
  return 0;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => {
    if (code !== 0) {
      process.exitCode = code;
    }
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
