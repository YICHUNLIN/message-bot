# @yichunlin/message-bot

> 基於 [onion-strategy](https://github.com/YICHUNLIN/onion-strategy) 的訊息處理引擎,平台無關 — 可接 LINE、Discord、CLI、IoT、Webhook。

把「指令解析、prefix 路由、特殊訊息處理」這套通用邏輯抽出來,你只要寫平台特定的 adapter 跟業務邏輯。

## 安裝

```bash
npm install github:YICHUNLIN/message-bot
```

需要 Node.js 14 以上。

## 快速開始

```js
const { createMessageBot } = require('@yichunlin/message-bot');

const bot = createMessageBot({
  subRoutesDir: __dirname,  // 動態載入這個資料夾下的 sub-routes
});

const ctx = await bot.handle({
  text: '>weather Taipei',
  userId: 'U123',
});

console.log(ctx.reply);
```

## 核心概念

```
ctx 進來
   ↓
[hooks] 使用者注入的 middleware(metadata、logger 等)
   ↓
[user middleware] bot.use() 加的
   ↓
[specialRoute] 特殊訊息(<REG>、[DATA] 等)
   ↓
[prefixParser] 解析 /、!、>
   ↓
[dispatch] 依 prefix 分派到對應 sub-route
```

## API

### `createMessageBot(options)`

建立 bot 實例。

**Options**

| 參數 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `name` | string | `'message-bot'` | 標記用 |
| `subRoutesDir` | string | - | 動態載入 sub-routes 的資料夾 |
| `subRoutes` | object | - | 手動傳入 sub-routes,會覆蓋 dir 結果 |
| `prefixes` | string[] | `['/', '!', '>']` | 自訂 prefix |
| `specialRoute` | function | - | 特殊訊息路由 `(ctx) => Promise<void>` |
| `hooks` | function[] | `[]` | 使用者注入的 middleware,依序執行 |
| `onError` | function | console.error | 錯誤處理 |
| `ignoreFiles` | string[] | - | loadSubRoutes 要忽略的檔名 |

**回傳**

```js
{
  use(mw),           // 加 middleware(在 hooks 後、specialRoute 前)
  useFirst(mw),      // 加最外層 middleware
  handle(ctx),       // 處理一則訊息
  getSubRoutes(),    // 取得已註冊的 sub-routes
  getName(),         // 取得 bot 名稱
}
```

### Sub-route 格式

每個 sub-route 檔 export 這個物件:

```js
// admin.js
const { createController, matchers } = require('@yichunlin/message-bot');

const route = createController();

route.when(matchers.regex(/^kick$/, 'command'), async (ctx) => {
  ctx.reply = 'kicked';
});

module.exports = {
  prefix: '!',
  requires: 'admin',          // 可選,供權限系統使用
  route: (ctx) => route.handle(ctx),
};
```

### Special Route

特殊訊息(不走 prefix 解析),例如機器訊息 `<REG>token`、`[DATA]xxx`:

```js
// special.js
const { createController, matchers } = require('@yichunlin/message-bot');

module.exports = function (context) {
  const router = createController();
  const { objectServer } = context;

  router.when(matchers.regex(/^<REG>(.+)$/), async (ctx) => {
    const token = ctx.match[1];
    const result = await objectServer.regist(token, ctx.userId);
    ctx.reply = String(result);
  });

  return (ctx) => router.handle(ctx);
};
```

### Hooks(注入式 middleware)

要做平台特定的 middleware(例如儲存訊息、推送 logger),用 `hooks`:

```js
const saveMetadata = (context) => async (ctx, next) => {
  await context.db.save({
    messageId: ctx.messageId,
    text: ctx.text,
    userId: ctx.userId,
  });
  await next();
};

const pushLogger = (context) => async (ctx, next) => {
  await context.logger.send(ctx.text);
  await next();
};

const bot = createMessageBot({
  subRoutesDir: __dirname,
  hooks: [
    saveMetadata(context),
    pushLogger(context),
  ],
});
```

## 完整範例:LINE 整合

```js
// line/personal.text.extension/index.js
const { createMessageBot } = require('@yichunlin/message-bot');

let bot = null;

module.exports = function (context) {
  if (bot) return bot;

  bot = createMessageBot({
    name: 'line-personal',
    subRoutesDir: __dirname,
    specialRoute: require('./special')(context),
    hooks: [
      // personal 不需要 metadata / logger
    ],
    onError: (err, ctx) => {
      console.error('[bot error]', err);
      ctx.reply = '系統錯誤,請稍後再試';
    },
  });

  return bot;
};
```

```js
// line/group.text.extension/index.js
const { createMessageBot } = require('@yichunlin/message-bot');

let bot = null;

module.exports = function (context) {
  if (bot) return bot;

  const { Line, Message } = context.models;

  // hooks: 平台特定的 middleware
  const saveMetadata = async (ctx, next) => {
    try {
      const path = Message.createRoomFolder(ctx.groupId);
      await Line.saveStorageMetadata(path, ctx.messageId, {
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
      const group = await context.lineClient.getGroupSummary(ctx.groupId);
      const profile = await Line.getMemberProfile(ctx.groupId, ctx.userId, 'group');
      await axios.post(LOGGER_URL, {
        title: group.groupName,
        message: [ctx.text],
        footer: profile.displayName,
      }, { timeout: 3000 });
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
    hooks: [
      injectServices(context),     // ctx.services
      saveMetadata,
      pushLogger,
    ],
    onError: (err, ctx) => {
      console.error('[bot error]', err);
      ctx.reply = '系統錯誤,請稍後再試';
    },
  });

  return bot;
};

function injectServices(context) {
  return async (ctx, next) => {
    ctx.services = context.services;
    await next();
  };
}
```

## 為什麼用 hooks 而不是直接寫死

「儲存訊息 metadata」「推送 logger」是**平台 / 應用程式特定的需求**,把它們留給使用者注入,而不是寫死在套件裡。

這樣 message-bot 可以被任何平台使用 — Discord 不需要 LINE 的 metadata 儲存格式;CLI 工具完全不需要 logger。

## License

MIT
