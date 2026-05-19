import { parseCommand } from './parser.js';
import { commandKey, listCommands, resolveCommand } from './registry.js';

const supportedLanguages = new Set(['en', 'zh-CN']);

const text = {
  en: {
    helpTitle: 'Watchdog Help',
    helpIntro: 'You can ask me to run configured local watchdog actions.',
    restartHeading: 'Run a configured action:',
    restartSyntax: '/wd <action> <service> <subject>',
    menuTitle: 'Available Actions',
    noCommands: 'No actions are configured.',
    otherCommands: 'Other Commands',
    helpCommand: '/wd help Show help',
    helpZhCommand: '/wd help zh Chinese help',
    helpEnCommand: '/wd help en English help',
    unknown: 'I do not recognize that command. Send /wd help to see available actions.',
    notAllowed: (reason) => `Command not allowed: ${reason}.`,
    denied: (key, reason) => `Command ${key} denied: ${reason}.`,
    succeeded: (key) => `Command ${key} succeeded.`,
    failed: (key, reason) => `Command ${key} failed: ${reason}.`,
    missingCommand: (key) => `Unknown target command: ${key}.`,
  },
  'zh-CN': {
    helpTitle: 'Watchdog 使用说明',
    helpIntro: '你可以让我执行本机上已配置的 watchdog 操作。',
    restartHeading: '执行已配置操作：',
    restartSyntax: '/wd <动作> <服务> <对象>',
    menuTitle: 'Watchdog 可用操作',
    noCommands: '当前没有配置可用操作。',
    otherCommands: '其他命令',
    helpCommand: '/wd help 查看帮助',
    helpZhCommand: '/wd help zh 中文帮助',
    helpEnCommand: '/wd help en English help',
    unknown: '无法识别这个命令。请发送 /wd help 查看可用操作。',
    notAllowed: (reason) => `命令不允许执行：${reason}。`,
    denied: (key, reason) => `命令 ${key} 被拒绝：${reason}。`,
    succeeded: (key) => `命令 ${key} 执行成功。`,
    failed: (key, reason) => `命令 ${key} 执行失败：${reason}。`,
    missingCommand: (key) => `未知目标命令：${key}。`,
  },
};

function normalizeLanguage(language) {
  return supportedLanguages.has(language) ? language : 'en';
}

function configuredLanguage(config) {
  return normalizeLanguage(config?.language);
}

function commandLanguage(config, parsed) {
  return parsed?.language ?? configuredLanguage(config);
}

export function formatHelp(config, language = configuredLanguage(config)) {
  const copy = text[normalizeLanguage(language)];
  return [
    copy.helpTitle,
    '',
    copy.helpIntro,
    '',
    copy.restartHeading,
    copy.restartSyntax,
    '',
    ...formatCommandMenuLines(config, language),
  ].join('\n');
}

export function formatCommandMenu(config, language = configuredLanguage(config)) {
  return formatCommandMenuLines(config, language).join('\n');
}

function formatCommandMenuLines(config, language) {
  const copy = text[normalizeLanguage(language)];
  const commands = listCommands(config);
  if (commands.length === 0) {
    return [copy.noCommands];
  }

  const grouped = new Map();
  for (const entry of commands) {
    if (!grouped.has(entry.label)) {
      grouped.set(entry.label, []);
    }
    grouped.get(entry.label).push(entry);
  }

  const lines = [copy.menuTitle, ''];
  for (const [label, entries] of grouped) {
    lines.push(label);
    entries.sort(compareCommandEntries).forEach((entry, index) => {
      lines.push(`${index + 1}. ${formatCommandTitle(entry, language)}`);
      lines.push(`   /wd ${entry.action} ${entry.target} ${entry.subject}`);
    });
    lines.push('');
  }
  lines.push(copy.otherCommands);
  lines.push(copy.helpCommand);
  lines.push(copy.helpZhCommand);
  lines.push(copy.helpEnCommand);
  return trimTrailingBlank(lines);
}

function formatCommandTitle(entry, language) {
  const titles = {
    en: {
      'hermes.restart.gateway': 'Restart Hermes service',
      'hermes.restart.cloudflared': 'Restart Hermes tunnel',
      'hermes.restart.all': 'Restart Hermes service + Hermes tunnel',
      'hermes.disable.auto': 'Disable Hermes automatic repair',
      'hermes.enable.auto': 'Enable Hermes automatic repair',
      'hermes.start.agent': 'Start Hermes watchdog LaunchAgent',
      'hermes.stop.agent': 'Stop Hermes watchdog LaunchAgent',
      'hermes.status.auto': 'Show Hermes watchdog status',
      'openclaw.restart.gateway': 'Restart OpenClaw service',
      'openclaw.disable.auto': 'Disable OpenClaw automatic repair',
      'openclaw.enable.auto': 'Enable OpenClaw automatic repair',
      'openclaw.start.agent': 'Start OpenClaw watchdog LaunchAgent',
      'openclaw.stop.agent': 'Stop OpenClaw watchdog LaunchAgent',
      'openclaw.status.auto': 'Show OpenClaw watchdog status',
    },
    'zh-CN': {
      'hermes.restart.gateway': '重启 Hermes 服务',
      'hermes.restart.cloudflared': '重启 Hermes 的 Tunnel',
      'hermes.restart.all': '重启 Hermes 服务 + Hermes 的 Tunnel',
      'hermes.disable.auto': '关闭 Hermes 自动修复',
      'hermes.enable.auto': '开启 Hermes 自动修复',
      'hermes.start.agent': '启动 Hermes watchdog LaunchAgent',
      'hermes.stop.agent': '停止 Hermes watchdog LaunchAgent',
      'hermes.status.auto': '查看 Hermes watchdog 状态',
      'openclaw.restart.gateway': '重启 OpenClaw 服务',
      'openclaw.disable.auto': '关闭 OpenClaw 自动修复',
      'openclaw.enable.auto': '开启 OpenClaw 自动修复',
      'openclaw.start.agent': '启动 OpenClaw watchdog LaunchAgent',
      'openclaw.stop.agent': '停止 OpenClaw watchdog LaunchAgent',
      'openclaw.status.auto': '查看 OpenClaw watchdog 状态',
    },
  };
  const languageTitles = titles[normalizeLanguage(language)];
  if (languageTitles[entry.key]) {
    return languageTitles[entry.key];
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

function formatExecutionReply(command, result, language) {
  const copy = text[normalizeLanguage(language)];
  const output = formatExecutionOutput(result);
  if (result.ok) {
    if (command.action === 'status' && output) {
      return `${copy.succeeded(command.key)}\n${output}`;
    }
    return copy.succeeded(command.key);
  }
  if (output) {
    return `${copy.failed(command.key, result.reason)}\n${output}`;
  }
  return copy.failed(command.key, result.reason);
}

function formatExecutionOutput(result) {
  const lines = [];
  const stdout = trimOutput(result.stdout);
  const stderr = trimOutput(result.stderr);
  if (stdout) {
    lines.push(stdout);
  }
  if (stderr) {
    lines.push(`stderr:\n${stderr}`);
  }
  return truncateOutput(lines.join('\n'), 1200);
}

function trimOutput(value) {
  return String(value ?? '').trim();
}

function truncateOutput(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function createReceiver({ config, policy, executor, audit, reply }) {
  async function record(entry) {
    await audit?.record?.(entry);
  }

  async function runResolvedCommand(context, rawText, parsed, command) {
    const language = commandLanguage(config, parsed);
    const copy = text[language];
    {
      const gate = policy.beforeExecute(context, command.key);
      if (!gate.ok) {
        await record({ decision: 'denied', commandKey: command.key, senderId: context.senderId, chatId: context.chatId, rawText, reason: gate.reason });
        await reply(context, copy.denied(command.key, gate.reason));
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
    await reply(context, formatExecutionReply(command, result, language));
  }

  async function handleMessage(message) {
    const context = { senderId: message.senderId, chatId: message.chatId, chatType: message.chatType };
    const rawText = String(message.text ?? '');
    const defaultLanguage = configuredLanguage(config);
    const defaultCopy = text[defaultLanguage];
    const auth = policy.authorize(context);
    if (!auth.ok) {
      await record({ decision: 'denied', senderId: context.senderId, chatId: context.chatId, rawText, reason: auth.reason });
      await reply(context, defaultCopy.notAllowed(auth.reason));
      return;
    }

    const parsed = parseCommand(rawText);
    const language = commandLanguage(config, parsed);
    const copy = text[language];
    if (parsed.type === 'help') {
      await record({ decision: 'help', senderId: context.senderId, chatId: context.chatId, rawText });
      await reply(context, formatHelp(config, language));
      return;
    }
    if (parsed.type === 'unknown') {
      await record({ decision: 'unknown', senderId: context.senderId, chatId: context.chatId, rawText });
      await reply(context, copy.unknown);
      return;
    }

    const command = resolveCommand(config, parsed);
    if (!command) {
      await record({ decision: 'missing_command', senderId: context.senderId, chatId: context.chatId, rawText, commandKey: commandKey(parsed) });
      await reply(context, `${copy.missingCommand(commandKey(parsed))}\n${formatCommandMenu(config, language)}`);
      return;
    }
    await runResolvedCommand(context, rawText, parsed, command);
  }

  return { handleMessage };
}
