const commandPrefixPattern = /^\/(?:watchdog|wd)$/;
const tokenPattern = /^[A-Za-z0-9_-]+$/;
const helpLanguageAliases = new Map([
  ['en', 'en'],
  ['english', 'en'],
  ['zh', 'zh-CN'],
  ['zh-cn', 'zh-CN'],
  ['cn', 'zh-CN'],
  ['chinese', 'zh-CN'],
]);

export function parseCommand(text) {
  const raw = String(text ?? '').trim();
  if (raw.length === 0) {
    return { type: 'unknown', raw };
  }

  const parts = raw.split(/\s+/);
  if (!commandPrefixPattern.test(parts[0] ?? '')) {
    return { type: 'unknown', raw };
  }

  const action = (parts[1] ?? '').toLowerCase();
  if (parts.length === 2 && action === 'help') {
    return { type: 'help', raw };
  }
  if (parts.length === 3 && action === 'help') {
    const language = helpLanguageAliases.get((parts[2] ?? '').toLowerCase());
    if (language) {
      return { type: 'help', language, raw };
    }
  }
  if (parts.length === 4 && tokenPattern.test(action)) {
    const target = parts[2].toLowerCase();
    const subject = parts[3].toLowerCase();
    if (tokenPattern.test(target) && tokenPattern.test(subject)) {
      return {
        type: 'execute',
        action,
        target,
        subject,
        raw,
      };
    }
  }

  return { type: 'unknown', raw };
}
