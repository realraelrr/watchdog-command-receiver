export function commandKey(command) {
  if (!command || command.type !== 'execute') {
    return '';
  }
  return `${command.target}.${command.action}.${command.subject}`;
}

export function listCommands(config) {
  const targets = config?.targets ?? {};
  const entries = [];

  for (const targetName of Object.keys(targets).sort()) {
    const target = targets[targetName] ?? {};
    const commands = target.commands ?? {};
    for (const action of Object.keys(commands).sort()) {
      const subjects = commands[action] ?? {};
      for (const subject of Object.keys(subjects).sort()) {
        entries.push({
          key: `${targetName}.${action}.${subject}`,
          target: targetName,
          label: target.label ?? targetName,
          action,
          subject,
        });
      }
    }
  }

  return entries;
}

export function resolveCommand(config, parsed) {
  if (!parsed || parsed.type !== 'execute') {
    return null;
  }

  const target = config?.targets?.[parsed.target];
  const command = target?.commands?.[parsed.action]?.[parsed.subject];
  if (!target || !command || !Array.isArray(command.argv) || command.argv.length === 0) {
    return null;
  }

  return {
    key: commandKey(parsed),
    target: parsed.target,
    label: target.label ?? parsed.target,
    action: parsed.action,
    subject: parsed.subject,
    argv: command.argv,
    timeoutMs: command.timeoutMs ?? 30000,
  };
}
