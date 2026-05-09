const commandPrefixPattern = /^\/(?:watchdog|wd)$/;
const tokenPattern = /^[A-Za-z0-9_-]+$/;

export function parseCommand(text) {
  const raw = String(text ?? '').trim();
  if (raw.length === 0) {
    return { type: 'unknown', raw };
  }

  const confirmParts = raw.split(/\s+/);
  if (confirmParts.length === 2 && confirmParts[0].toLowerCase() === 'confirm' && tokenPattern.test(confirmParts[1])) {
    return { type: 'confirm', token: confirmParts[1], raw };
  }

  const parts = raw.split(/\s+/);
  if (!commandPrefixPattern.test(parts[0] ?? '')) {
    return { type: 'unknown', raw };
  }

  const action = (parts[1] ?? '').toLowerCase();
  if (parts.length === 2 && action === 'help') {
    return { type: 'help', raw };
  }
  if (parts.length === 2 && action === 'list') {
    return { type: 'list', raw };
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
