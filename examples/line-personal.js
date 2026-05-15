'use strict';

/**
 * 範例:接 LINE 個人聊天
 *
 * 假設你的 line/personal.text.extension/ 資料夾長這樣:
 *   ├── index.js  (這個檔案的內容)
 *   ├── special.js
 *   ├── admin.js
 *   ├── system.js
 *   └── employee.js
 */

const { createMessageBot } = require('@yichunlin/message-bot');

let bot = null;

module.exports = function (context) {
  if (bot) return bot;

  bot = createMessageBot({
    name: 'line-personal',
    subRoutesDir: __dirname,
    specialRoute: require('./special')(context),
    hooks: [
      // 注入 services
      async (ctx, next) => {
        ctx.services = context.services;
        await next();
      },
    ],
    onError: (err, ctx) => {
      console.error('[bot error]', err);
      ctx.reply = '系統錯誤,請稍後再試';
    },
  });

  return bot;
};
