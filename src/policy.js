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

export function createPolicy(config, options = {}) {
  const policyConfig = config?.policy ?? {};
  const allowedSenderIds = new Set(asList(policyConfig.allowedSenderIds));
  const allowedChatIds = new Set(asList(policyConfig.allowedChatIds));
  const requireConfirmation = new Set(asList(policyConfig.requireConfirmation));
  const cooldownMs = Number(policyConfig.cooldownMs ?? 60000);
  const confirmationTtlMs = Number(policyConfig.confirmationTtlMs ?? 30000);
  const now = options.now ?? Date.now;
  const tokenFactory = options.tokenFactory ?? defaultTokenFactory;
  const cooldowns = new Map();
  const pendingConfirmations = new Map();

  function authorize(context) {
    if (allowedSenderIds.size > 0 && !allowedSenderIds.has(context.senderId)) {
      return { ok: false, reason: 'sender_not_allowed' };
    }
    if (allowedChatIds.size > 0 && !allowedChatIds.has(context.chatId)) {
      return { ok: false, reason: 'chat_not_allowed' };
    }
    return { ok: true };
  }

  function createConfirmation(context, key) {
    const token = tokenFactory();
    const expiresAt = now() + confirmationTtlMs;
    pendingConfirmations.set(pendingKey(context, token), { commandKey: key, expiresAt });
    return { ok: false, reason: 'confirmation_required', token, expiresAt };
  }

  function beforeExecute(context, key) {
    const nextAllowedAt = cooldowns.get(key) ?? 0;
    const current = now();
    if (current < nextAllowedAt) {
      return { ok: false, reason: 'cooldown_active', retryAfterMs: nextAllowedAt - current };
    }
    if (requireConfirmation.has(key)) {
      return createConfirmation(context, key);
    }
    return { ok: true };
  }

  function confirm(context, token) {
    const key = pendingKey(context, token);
    const pending = pendingConfirmations.get(key);
    if (!pending) {
      return { ok: false, reason: 'confirmation_not_found' };
    }
    pendingConfirmations.delete(key);
    if (now() > pending.expiresAt) {
      return { ok: false, reason: 'confirmation_expired' };
    }
    return { ok: true, commandKey: pending.commandKey };
  }

  function recordExecution(key) {
    cooldowns.set(key, now() + cooldownMs);
  }

  return {
    authorize,
    beforeExecute,
    createConfirmation,
    confirm,
    recordExecution,
  };
}
