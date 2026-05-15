'use strict';

const { createController } = require('onion-strategy');
const { createPrefixParser, DEFAULT_PREFIXES } = require('./prefix-parser');
const { loadSubRoutes } = require('./route-loader');

/**
 * 建立一個 MessageBot 實例
 *
 * @param {Object} options
 * @param {string} [options.name]            標記用,預設 'message-bot'
 * @param {string} [options.subRoutesDir]    動態載入 sub-routes 的資料夾
 * @param {Object} [options.subRoutes]       手動傳入 sub-routes(覆蓋 dir 的結果)
 * @param {string[]} [options.prefixes]      自訂 prefix(預設 ['/', '!', '>'])
 * @param {Function} [options.specialRoute]  特殊訊息路由 (ctx) => Promise<void>
 * @param {Function[]} [options.hooks]       使用者注入的 middleware,順序執行
 * @param {Function} [options.onError]       錯誤處理 (err, ctx) => void
 * @param {string[]} [options.ignoreFiles]   loadSubRoutes 要忽略的檔名
 *
 * @returns Bot 物件
 *   bot.use(mw)           加 middleware(在 hooks 之後、特殊路由之前)
 *   bot.useFirst(mw)      加最外層 middleware
 *   bot.handle(ctx)       處理一則訊息
 *   bot.getSubRoutes()    取得已註冊的 sub-routes
 *   bot.getName()         取得 bot 名稱
 */
function createMessageBot(options = {}) {
  const name = options.name || 'message-bot';
  const onError = options.onError || ((err) => console.error(`[${name}]`, err));

  // 載入 sub-routes
  let subRoutes = {};
  if (options.subRoutesDir) {
    subRoutes = loadSubRoutes(options.subRoutesDir, {
      ignore: options.ignoreFiles,
    });
  }
  if (options.subRoutes) {
    Object.assign(subRoutes, options.subRoutes);
  }

  // 建立底層 controller
  const controller = createController({ onError });

  // 待註冊的「first」middleware(在所有東西之前)
  const firstMiddlewares = [];

  // 待註冊的一般 middleware(在 hooks 之後、特殊路由之前)
  const userMiddlewares = [];

  // 我們稍後再 build pipeline,所以用一個 flag 標記是否已 build
  let built = false;

  function build() {
    if (built) return;
    built = true;

    // 1. firstMiddlewares(最外層)
    for (const mw of firstMiddlewares) {
      controller.use(mw);
    }

    // 2. hooks(使用者注入,順序就是傳入順序)
    for (const hook of options.hooks || []) {
      controller.use(hook);
    }

    // 3. userMiddlewares(bot.use 加的)
    for (const mw of userMiddlewares) {
      controller.use(mw);
    }

    // 4. specialRoute(特殊訊息優先)
    if (typeof options.specialRoute === 'function') {
      controller.use(async (ctx, next) => {
        await options.specialRoute(ctx);
        if (ctx.reply) return;     // 特殊路由有處理就停
        await next();
      });
    }

    // 5. prefixParser
    const parser = createPrefixParser({ prefixes: options.prefixes });
    controller.use(parser);

    // 6. dispatch to sub-route
    controller.use(async (ctx, next) => {
      if (!ctx.isCommand) return next();
      const sub = subRoutes[ctx.prefix];
      if (!sub) return next();
      await sub.route(ctx);
    });
  }

  return {
    use(mw) {
      if (built) {
        throw new Error(`[${name}] 不能在 handle 後再 use middleware`);
      }
      userMiddlewares.push(mw);
      return this;
    },

    useFirst(mw) {
      if (built) {
        throw new Error(`[${name}] 不能在 handle 後再 useFirst middleware`);
      }
      firstMiddlewares.push(mw);
      return this;
    },

    handle(ctx) {
      build();
      return controller.handle(ctx);
    },

    getSubRoutes() {
      return subRoutes;
    },

    getName() {
      return name;
    },
  };
}

module.exports = {
  createMessageBot,
  DEFAULT_PREFIXES,
};
