import fs from 'node:fs';

export function loadConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('config must be an object');
  }
  const senderIds = config.policy?.allowedSenderIds;
  const chatIds = config.policy?.allowedChatIds;
  if (!Array.isArray(senderIds) || senderIds.length === 0) {
    throw new Error('policy.allowedSenderIds must contain at least one sender id');
  }
  if (!Array.isArray(chatIds) || chatIds.length === 0) {
    throw new Error('policy.allowedChatIds must contain at least one chat id');
  }

  if (!config.targets || typeof config.targets !== 'object' || Object.keys(config.targets).length === 0) {
    throw new Error('config targets must contain at least one target');
  }
  for (const [targetName, target] of Object.entries(config.targets)) {
    validateIdentifier(targetName);
    if (!target.commands || typeof target.commands !== 'object') {
      throw new Error(`target ${targetName} must define commands`);
    }
    for (const [action, subjects] of Object.entries(target.commands)) {
      validateIdentifier(action);
      for (const [subject, command] of Object.entries(subjects ?? {})) {
        validateIdentifier(subject);
        if (!Array.isArray(command.argv) || command.argv.length === 0 || !command.argv.every((part) => typeof part === 'string')) {
          throw new Error(`target ${targetName}.${action}.${subject} must define argv`);
        }
      }
    }
  }
}

function validateIdentifier(value) {
  if (!/^[a-z0-9_-]+$/.test(value)) {
    throw new Error(`invalid identifier: ${value}`);
  }
}
