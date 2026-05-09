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

  const text = typeof content.text === 'string' ? content.text.trim() : '';
  const senderId = data?.sender?.sender_id?.open_id ?? data?.sender?.sender_id?.user_id ?? '';
  const chatId = message.chat_id ?? '';
  const chatType = message.chat_type ?? '';
  if (!text || !senderId || !chatId) {
    return null;
  }

  return { senderId, chatId, chatType, text };
}

export function createFeishuTransport({ Lark, config, onMessage, logger = console }) {
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
      if (!/^(\/(?:watchdog|wd)\b|confirm\s+)/.test(message.text)) {
        logger.debug?.('ignored non-command Feishu text');
        return;
      }
      logger.info?.('received Feishu command', {
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
