import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy } from '../src/policy.js';

const baseConfig = {
  policy: {
    allowedSenderIds: ['ou_admin'],
    allowedChatIds: ['oc_ops'],
    cooldownMs: 1000,
    confirmationTtlMs: 5000,
    requireConfirmation: ['hermes.restart.all'],
  },
};

const context = { senderId: 'ou_admin', chatId: 'oc_ops' };

test('policy denies unauthorized senders and chats', () => {
  const policy = createPolicy(baseConfig, { now: () => 1000, tokenFactory: () => '111111' });

  assert.deepEqual(policy.authorize(context), { ok: true });
  assert.deepEqual(policy.authorize({ senderId: 'ou_other', chatId: 'oc_ops' }), {
    ok: false,
    reason: 'sender_not_allowed',
  });
  assert.deepEqual(policy.authorize({ senderId: 'ou_admin', chatId: 'oc_other' }), {
    ok: false,
    reason: 'chat_not_allowed',
  });
});

test('policy fails closed when allowlists are empty', () => {
  const policy = createPolicy({ policy: { allowedSenderIds: [], allowedChatIds: [] } }, { now: () => 1000 });

  assert.deepEqual(policy.authorize({ senderId: 'anyone', chatId: 'anywhere' }), {
    ok: false,
    reason: 'policy_not_configured',
  });
});

test('policy reserves cooldown before execution to block concurrent duplicates', () => {
  let now = 1000;
  const policy = createPolicy(baseConfig, { now: () => now });

  assert.deepEqual(policy.beforeExecute(context, 'openclaw.restart.gateway'), { ok: true });
  assert.deepEqual(policy.beforeExecute(context, 'openclaw.restart.gateway'), {
    ok: false,
    reason: 'cooldown_active',
    retryAfterMs: 1000,
  });

  now = 2100;
  assert.deepEqual(policy.beforeExecute(context, 'openclaw.restart.gateway'), { ok: true });
});

test('policy creates one scoped confirmation per command and consumes it once', () => {
  let now = 1000;
  const policy = createPolicy(baseConfig, { now: () => now, tokenFactory: () => 'abc123' });

  assert.deepEqual(policy.beforeExecute(context, 'hermes.restart.all'), {
    ok: false,
    reason: 'confirmation_required',
    token: 'abc123',
    expiresAt: 6000,
  });
  assert.deepEqual(policy.beforeExecute(context, 'hermes.restart.all'), {
    ok: false,
    reason: 'confirmation_required',
    token: 'abc123',
    expiresAt: 6000,
  });
  assert.deepEqual(policy.confirm({ senderId: 'ou_other', chatId: 'oc_ops' }, 'abc123'), {
    ok: false,
    reason: 'confirmation_not_found',
  });
  assert.deepEqual(policy.confirm(context, 'abc123'), {
    ok: true,
    commandKey: 'hermes.restart.all',
  });
  assert.deepEqual(policy.beforeExecute(context, 'hermes.restart.all', { skipConfirmation: true }), { ok: true });
  assert.deepEqual(policy.beforeExecute(context, 'hermes.restart.all', { skipConfirmation: true }), {
    ok: false,
    reason: 'cooldown_active',
    retryAfterMs: 1000,
  });
  assert.deepEqual(policy.confirm(context, 'abc123'), {
    ok: false,
    reason: 'confirmation_not_found',
  });
});

test('policy expires confirmation tokens', () => {
  let now = 1000;
  const policy = createPolicy(baseConfig, { now: () => now, tokenFactory: () => 'abc123' });

  policy.beforeExecute(context, 'hermes.restart.all');
  now = 7000;
  assert.deepEqual(policy.confirm(context, 'abc123'), {
    ok: false,
    reason: 'confirmation_expired',
  });
});
