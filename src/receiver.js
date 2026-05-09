import { parseCommand } from './parser.js';
import { commandKey, listCommands, resolveCommand } from './registry.js';

export function formatHelp(config) {
  return [
    'Watchdog 使用说明',
    '',
    '你可以让我重启本机上的 Hermes 或 OpenClaw 网关。',
    '',
    '执行重启：',
    '/wd restart <服务> <对象>',
    '',
    ...formatCommandMenuLines(config),
  ].join('\n');
}

export function formatCommandMenu(config) {
  return formatCommandMenuLines(config).join('\n');
}

function formatCommandMenuLines(config) {
  const commands = listCommands(config);
  if (commands.length === 0) {
    return ['当前没有配置可用操作。'];
  }

  const grouped = new Map();
  for (const entry of commands) {
    if (!grouped.has(entry.label)) {
      grouped.set(entry.label, []);
    }
    grouped.get(entry.label).push(entry);
  }

  const lines = ['Watchdog 可用操作', ''];
  for (const [label, entries] of grouped) {
    lines.push(label);
    entries.sort(compareCommandEntries).forEach((entry, index) => {
      lines.push(`${index + 1}. ${formatCommandTitle(entry)}`);
      lines.push(`   /wd ${entry.action} ${entry.target} ${entry.subject}`);
    });
    lines.push('');
  }
  lines.push('其他命令');
  lines.push('/wd help 查看帮助');
  return trimTrailingBlank(lines);
}

function formatCommandTitle(entry) {
  if (entry.action === 'restart' && entry.target === 'hermes' && entry.subject === 'gateway') {
    return '重启 Hermes 服务';
  }
  if (entry.action === 'restart' && entry.target === 'hermes' && entry.subject === 'cloudflared') {
    return '重启 Hermes 的 Tunnel';
  }
  if (entry.action === 'restart' && entry.target === 'hermes' && entry.subject === 'all') {
    return '重启 Hermes 服务 + Hermes 的 Tunnel';
  }
  if (entry.action === 'restart' && entry.target === 'openclaw' && entry.subject === 'gateway') {
    return '重启 OpenClaw 服务';
  }
  return `${entry.action} ${entry.target} ${entry.subject}`;
}

function compareCommandEntries(a, b) {
  const subjectOrder = new Map([
    ['all', 0],
    ['gateway', 1],
    ['cloudflared', 2],
  ]);
  const actionCompare = a.action.localeCompare(b.action);
  if (actionCompare !== 0) {
    return actionCompare;
  }
  return (subjectOrder.get(a.subject) ?? 99) - (subjectOrder.get(b.subject) ?? 99)
    || a.subject.localeCompare(b.subject);
}

function trimTrailingBlank(lines) {
  const trimmed = [...lines];
  while (trimmed.at(-1) === '') {
    trimmed.pop();
  }
  return trimmed;
}

function formatExecutionReply(command, result) {
  if (result.ok) {
    return `Command ${command.key} succeeded.`;
  }
  return `Command ${command.key} failed: ${result.reason}.`;
}

export function createReceiver({ config, policy, executor, audit, reply }) {
  async function record(entry) {
    await audit?.record?.(entry);
  }

  async function runResolvedCommand(context, rawText, parsed, command) {
    {
      const gate = policy.beforeExecute(context, command.key);
      if (!gate.ok) {
        await record({ decision: 'denied', commandKey: command.key, senderId: context.senderId, chatId: context.chatId, rawText, reason: gate.reason });
        await reply(context, `Command ${command.key} denied: ${gate.reason}.`);
        return;
      }
    }

    let result;
    try {
      result = await executor(command);
    } catch (error) {
      result = { ok: false, exitCode: null, reason: 'executor_error', stdout: '', stderr: error.message, timedOut: false };
    }
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
      stdoutTruncated: Boolean(result.stdoutTruncated),
      stderrTruncated: Boolean(result.stderrTruncated),
    });
    await reply(context, formatExecutionReply(command, result));
  }

  async function handleMessage(message) {
    const context = { senderId: message.senderId, chatId: message.chatId, chatType: message.chatType };
    const rawText = String(message.text ?? '');
    const auth = policy.authorize(context);
    if (!auth.ok) {
      await record({ decision: 'denied', senderId: context.senderId, chatId: context.chatId, rawText, reason: auth.reason });
      await reply(context, `Command not allowed: ${auth.reason}.`);
      return;
    }

    const parsed = parseCommand(rawText);
    if (parsed.type === 'help') {
      await record({ decision: 'help', senderId: context.senderId, chatId: context.chatId, rawText });
      await reply(context, formatHelp(config));
      return;
    }
    if (parsed.type === 'unknown') {
      await record({ decision: 'unknown', senderId: context.senderId, chatId: context.chatId, rawText });
      await reply(context, '无法识别这个命令。请发送 /wd help 查看可用操作。');
      return;
    }

    const command = resolveCommand(config, parsed);
    if (!command) {
      await record({ decision: 'missing_command', senderId: context.senderId, chatId: context.chatId, rawText, commandKey: commandKey(parsed) });
      await reply(context, `Unknown target command: ${commandKey(parsed)}.\n${formatCommandMenu(config)}`);
      return;
    }
    await runResolvedCommand(context, rawText, parsed, command);
  }

  return { handleMessage };
}
