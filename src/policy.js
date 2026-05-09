function asList(value) {
  return Array.isArray(value) ? value : [];
}

export function createPolicy(config, options = {}) {
  const policyConfig = config?.policy ?? {};
  const allowedSenderIds = new Set(asList(policyConfig.allowedSenderIds));
  const allowedChatIds = new Set(asList(policyConfig.allowedChatIds));
  const allowDirectMessages = Boolean(policyConfig.allowDirectMessages);
  const cooldownMs = Number(policyConfig.cooldownMs ?? 60000);
  const now = options.now ?? Date.now;
  const cooldowns = new Map();

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

  function beforeExecute(_context, key) {
    const nextAllowedAt = cooldowns.get(key) ?? 0;
    const current = now();
    if (current < nextAllowedAt) {
      return { ok: false, reason: 'cooldown_active', retryAfterMs: nextAllowedAt - current };
    }
    cooldowns.set(key, current + cooldownMs);
    return { ok: true };
  }

  function recordExecution(key) {
    cooldowns.set(key, Math.max(cooldowns.get(key) ?? 0, now() + cooldownMs));
  }

  return {
    authorize,
    beforeExecute,
    recordExecution,
  };
}
