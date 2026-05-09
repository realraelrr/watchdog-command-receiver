import fs from 'node:fs';

export function loadConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('config must be an object');
  }
  if (!config.targets || typeof config.targets !== 'object' || Object.keys(config.targets).length === 0) {
    throw new Error('config targets must contain at least one target');
  }
  for (const [targetName, target] of Object.entries(config.targets)) {
    if (!target.commands || typeof target.commands !== 'object') {
      throw new Error(`target ${targetName} must define commands`);
    }
    for (const [action, subjects] of Object.entries(target.commands)) {
      for (const [subject, command] of Object.entries(subjects ?? {})) {
        if (!Array.isArray(command.argv) || command.argv.length === 0) {
          throw new Error(`target ${targetName}.${action}.${subject} must define argv`);
        }
      }
    }
  }
}
