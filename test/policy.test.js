import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy } from '../src/policy.js';

const baseConfig = {
  policy: {
    allowedSenderIds: ['ou_admin'],
    allowedChatIds: ['oc_ops'],
    cooldownMs: 1000,
  },
};

const context = { senderId: 'ou_admin', chatId: 'oc_ops' };

test('policy denies unauthorized senders and chats', () => {
  const policy = createPolicy(baseConfig, { now: () => 1000 });

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

test('policy allows direct messages from allowed senders when enabled', () => {
  const policy = createPolicy({
    policy: {
      ...baseConfig.policy,
      allowDirectMessages: true,
    },
  }, { now: () => 1000 });

  assert.deepEqual(policy.authorize({ senderId: 'ou_admin', chatId: 'oc_direct', chatType: 'p2p' }), { ok: true });
  assert.deepEqual(policy.authorize({ senderId: 'ou_admin', chatId: 'oc_other', chatType: 'group' }), {
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
