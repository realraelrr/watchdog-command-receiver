import { randomBytes } from 'node:crypto';

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function defaultTokenFactory() {
  return randomBytes(3).toString('hex');
}

function pendingKey(context, token) {
  return `${context.senderId}\n${context.chatId}\n${token}`;
}

function pendingCommandKey(context, key) {
  return `${context.senderId}\n${context.chatId}\n${key}`;
}

export function createPolicy(config, options = {}) {
  const policyConfig = config?.policy ?? {};
  const allowedSenderIds = new Set(asList(policyConfig.allowedSenderIds));
  const allowedChatIds = new Set(asList(policyConfig.allowedChatIds));
  const allowDirectMessages = Boolean(policyConfig.allowDirectMessages);
  const requireConfirmation = new Set(asList(policyConfig.requireConfirmation));
  const cooldownMs = Number(policyConfig.cooldownMs ?? 60000);
  const confirmationTtlMs = Number(policyConfig.confirmationTtlMs ?? 30000);
  const now = options.now ?? Date.now;
  const tokenFactory = options.tokenFactory ?? defaultTokenFactory;
  const cooldowns = new Map();
  const pendingConfirmations = new Map();
  const pendingByCommand = new Map();

  function authorize(context) {
    if (allowedSenderIds.size === 0 || allowedChatIds.size === 0) {
      return { ok: false, reason: 'policy_not_configured' };
    }
    if (allowedSenderIds.size > 0 && !allowedSenderIds.has(context.senderId)) {
      return { ok: false, reason: 'sender_not_allowed' };
    }
    if (allowDirectMessages && context.chatType === 'p2p') {
      return { ok: true };
    }
    if (allowedChatIds.size > 0 && !allowedChatIds.has(context.chatId)) {
      return { ok: false, reason: 'chat_not_allowed' };
    }
    return { ok: true };
  }

  function createConfirmation(context, key) {
    const commandPendingKey = pendingCommandKey(context, key);
    const existingToken = pendingByCommand.get(commandPendingKey);
    if (existingToken) {
      const existing = pendingConfirmations.get(pendingKey(context, existingToken));
      if (existing && now() <= existing.expiresAt) {
        return { ok: false, reason: 'confirmation_required', token: existingToken, expiresAt: existing.expiresAt };
      }
    }

    const token = tokenFactory();
    const expiresAt = now() + confirmationTtlMs;
    pendingConfirmations.set(pendingKey(context, token), { commandKey: key, expiresAt, commandPendingKey });
    pendingByCommand.set(commandPendingKey, token);
    return { ok: false, reason: 'confirmation_required', token, expiresAt };
  }

  function beforeExecute(context, key, options = {}) {
    const nextAllowedAt = cooldowns.get(key) ?? 0;
    const current = now();
    if (current < nextAllowedAt) {
      return { ok: false, reason: 'cooldown_active', retryAfterMs: nextAllowedAt - current };
    }
    if (requireConfirmation.has(key) && !options.skipConfirmation) {
      return createConfirmation(context, key);
    }
    cooldowns.set(key, current + cooldownMs);
    return { ok: true };
  }

  function confirm(context, token) {
    const key = pendingKey(context, token);
    const pending = pendingConfirmations.get(key);
    if (!pending) {
      return { ok: false, reason: 'confirmation_not_found' };
    }
    pendingConfirmations.delete(key);
    pendingByCommand.delete(pending.commandPendingKey);
    if (now() > pending.expiresAt) {
      return { ok: false, reason: 'confirmation_expired' };
    }
    return { ok: true, commandKey: pending.commandKey };
  }

  function recordExecution(key) {
    cooldowns.set(key, Math.max(cooldowns.get(key) ?? 0, now() + cooldownMs));
  }

  return {
    authorize,
    beforeExecute,
    createConfirmation,
    confirm,
    recordExecution,
  };
}
