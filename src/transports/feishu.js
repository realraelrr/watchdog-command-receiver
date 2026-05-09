export function extractFeishuMessage(data) {
  const message = data?.message;
  if (message?.message_type !== 'text') {
    return null;
  }

  let content;
  try {
    content = JSON.parse(message.content ?? '{}');
  } catch {
    return null;
  }

  const text = typeof content.text === 'string' ? normalizeFeishuCommandText(content.text) : '';
  const senderId = data?.sender?.sender_id?.open_id ?? data?.sender?.sender_id?.user_id ?? '';
  const chatId = message.chat_id ?? '';
  const chatType = message.chat_type ?? '';
  const messageId = message.message_id ?? data?.event_id ?? '';
  if (!text || !senderId || !chatId) {
    return null;
  }

  return { senderId, chatId, chatType, messageId, text };
}

export function normalizeFeishuCommandText(text) {
  let normalized = String(text ?? '').trim();
  for (let i = 0; i < 5; i += 1) {
    const next = normalized
      .replace(/^<at\b[^>]*>.*?<\/at>\s*/iu, '')
      .replace(/^@\S+\s+/u, '')
      .trim();
    if (next === normalized) {
      return normalized;
    }
    normalized = next;
  }
  return normalized;
}

export function createFeishuTransport({ Lark, config, onMessage, logger = console }) {
  const seenMessages = new RecentIdCache(config.feishu?.dedupeTtlMs ?? 10 * 60 * 1000);
  const baseConfig = {
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
  };
  const client = new Lark.Client(baseConfig);
  const wsClient = new Lark.WSClient({
    ...baseConfig,
    loggerLevel: Lark.LoggerLevel?.info,
  });
  const eventDispatcher = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      const message = extractFeishuMessage(data);
      if (!message) {
        logger.debug?.('ignored non-command Feishu event');
        return;
      }
      if (!/^\/(?:watchdog|wd)\b/.test(message.text)) {
        logger.debug?.('ignored non-command Feishu text');
        return;
      }
      if (message.messageId && seenMessages.has(message.messageId)) {
        logger.info?.('ignored duplicate Feishu message', { messageId: message.messageId });
        return;
      }
      seenMessages.add(message.messageId);
      logger.info?.('received Feishu command', {
        messageId: message.messageId,
        senderId: message.senderId,
        chatId: message.chatId,
        chatType: message.chatType,
      });
      await onMessage(message);
    },
    'im.chat.member.bot.added_v1': (data) => {
      logger.info?.('Feishu bot added to chat', { chatId: data?.chat_id });
    },
  });

  return {
    start() {
      wsClient.start({ eventDispatcher });
    },
    async reply(context, text) {
      await client.im.v1.message.create({
        params: {
          receive_id_type: 'chat_id',
        },
        data: {
          receive_id: context.chatId,
          content: JSON.stringify({ text }),
          msg_type: 'text',
        },
      });
    },
  };
}

class RecentIdCache {
  constructor(ttlMs) {
    this.ttlMs = Number(ttlMs);
    this.ids = new Map();
  }

  has(id) {
    this.prune();
    return this.ids.has(id);
  }

  add(id) {
    if (!id) {
      return;
    }
    this.prune();
    this.ids.set(id, Date.now() + this.ttlMs);
  }

  prune() {
    const now = Date.now();
    for (const [id, expiresAt] of this.ids) {
      if (expiresAt <= now) {
        this.ids.delete(id);
      }
    }
  }
}
