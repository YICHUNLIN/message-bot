'use strict';

/**
 * 範例:接 LINE 群組聊天
 *
 * 比 personal 多兩個 hook:
 *   - saveMetadata:儲存訊息到本地
 *   - pushLogger:推送到外部 logger
 */

const { createMessageBot } = require('@yichunlin/message-bot');
const axios = require('axios');

const LOGGER_URL = 'https://logger.kmn.tw:7318/api/upload-line-logs';

let bot = null;

module.exports = function (context) {
  if (bot) return bot;

  const { Line, Message } = context.models;
  const lineClient = context.lineClient;

  const injectServices = async (ctx, next) => {
    ctx.services = context.services;
    await next();
  };

  const saveMetadata = async (ctx, next) => {
    try {
      const folderPath = Message.createRoomFolder(ctx.groupId);
      await Line.saveStorageMetadata(folderPath, ctx.messageId, {
        text: ctx.text,
        createdBy: ctx.userId,
        createdAt: new Date(),
      });
    } catch (err) {
      console.error('[save metadata]', err);
    }
    await next();
  };

  const pushLogger = async (ctx, next) => {
    try {
      const group = await lineClient.getGroupSummary(ctx.groupId);
      const profile = await Line.getMemberProfile(ctx.groupId, ctx.userId, 'group');
      await axios.post(
        LOGGER_URL,
        {
          title: group.groupName,
          message: [ctx.text],
          footer: profile.displayName,
        },
        { timeout: 3000 }
      );
    } catch (err) {
      console.error('[logger]', err);
    } finally {
      await next();
    }
  };

  bot = createMessageBot({
    name: 'line-group',
    subRoutesDir: __dirname,
    specialRoute: require('./special')(context),
    hooks: [injectServices, saveMetadata, pushLogger],
    onError: (err, ctx) => {
      console.error('[bot error]', err);
      ctx.reply = '系統錯誤,請稍後再試';
    },
  });

  return bot;
};
