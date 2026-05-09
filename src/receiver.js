import { parseCommand } from './parser.js';
import { commandKey, listCommands, resolveCommand } from './registry.js';
import { summarizeText } from './executor.js';

export function formatHelp() {
  return [
    'Commands:',
    '/wd help',
    '/wd list',
    '/wd restart <target> <subject>',
    'confirm <token>',
  ].join('\n');
}

export function formatCommandList(config) {
  const commands = listCommands(config);
  if (commands.length === 0) {
    return 'No configured commands.';
  }
  return commands.map((entry) => `${entry.target} ${entry.action} ${entry.subject} - ${entry.label}`).join('\n');
}

function formatExecutionReply(command, result) {
  const summary = summarizeText(result.stdout || result.stderr || result.reason || '', 300);
  if (result.ok) {
    return `Command ${command.key} succeeded.${summary ? `\n${summary}` : ''}`;
  }
  return `Command ${command.key} failed: ${result.reason}.${summary ? `\n${summary}` : ''}`;
}

export function createReceiver({ config, policy, executor, audit, reply }) {
  async function record(entry) {
    await audit?.record?.(entry);
  }

  async function runResolvedCommand(context, rawText, parsed, command, options = {}) {
    if (!options.skipGate) {
      const gate = policy.beforeExecute(context, command.key);
      if (!gate.ok && gate.reason === 'confirmation_required') {
        await record({ decision: 'confirmation_required', commandKey: command.key, senderId: context.senderId, chatId: context.chatId, rawText, token: gate.token });
        await reply(context, `Confirmation required for ${command.key}. Reply: confirm ${gate.token}`);
        return;
      }
      if (!gate.ok) {
        await record({ decision: 'denied', commandKey: command.key, senderId: context.senderId, chatId: context.chatId, rawText, reason: gate.reason });
        await reply(context, `Command ${command.key} denied: ${gate.reason}.`);
        return;
      }
    }

    const result = await executor(command);
    policy.recordExecution(command.key);
    await record({
      decision: 'executed',
      commandKey: command.key,
      senderId: context.senderId,
      chatId: context.chatId,
      rawText,
      parsed,
      ok: result.ok,
      exitCode: result.exitCode,
      reason: result.reason,
      stdout: summarizeText(result.stdout, 400),
      stderr: summarizeText(result.stderr, 400),
    });
    await reply(context, formatExecutionReply(command, result));
  }

  async function handleMessage(message) {
    const context = { senderId: message.senderId, chatId: message.chatId };
    const rawText = String(message.text ?? '');
    const auth = policy.authorize(context);
    if (!auth.ok) {
      await record({ decision: 'denied', senderId: context.senderId, chatId: context.chatId, rawText, reason: auth.reason });
      await reply(context, `Command not allowed: ${auth.reason}.`);
      return;
    }

    const parsed = parseCommand(rawText);
    if (parsed.type === 'help' || parsed.type === 'unknown') {
      await record({ decision: parsed.type, senderId: context.senderId, chatId: context.chatId, rawText });
      await reply(context, formatHelp());
      return;
    }
    if (parsed.type === 'list') {
      await record({ decision: 'listed', senderId: context.senderId, chatId: context.chatId, rawText });
      await reply(context, formatCommandList(config));
      return;
    }
    if (parsed.type === 'confirm') {
      const confirmed = policy.confirm(context, parsed.token);
      if (!confirmed.ok) {
        await record({ decision: 'confirmation_failed', senderId: context.senderId, chatId: context.chatId, rawText, reason: confirmed.reason });
        await reply(context, `Confirmation failed: ${confirmed.reason}.`);
        return;
      }
      const [target, action, subject] = confirmed.commandKey.split('.');
      const command = resolveCommand(config, { type: 'execute', target, action, subject });
      if (!command) {
        await record({ decision: 'missing_command', senderId: context.senderId, chatId: context.chatId, rawText, commandKey: confirmed.commandKey });
        await reply(context, `Unknown target command: ${confirmed.commandKey}.`);
        return;
      }
      await runResolvedCommand(context, rawText, { type: 'confirm', commandKey: confirmed.commandKey }, command, { skipGate: true });
      return;
    }

    const command = resolveCommand(config, parsed);
    if (!command) {
      await record({ decision: 'missing_command', senderId: context.senderId, chatId: context.chatId, rawText, commandKey: commandKey(parsed) });
      await reply(context, `Unknown target command: ${commandKey(parsed)}.\n${formatCommandList(config)}`);
      return;
    }
    await runResolvedCommand(context, rawText, parsed, command);
  }

  return { handleMessage };
}
