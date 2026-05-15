# Phase 1 部署包

這個 zip 包含兩個獨立的部分:

```
.
├── README.md            ← 本檔
├── message-bot/         ← 新獨立套件(要推到 GitHub)
└── line/                ← 改寫後的 LINE 整合層(覆蓋你的主專案)
```

---

## 部署步驟

### Step 1:把 `message-bot/` 推到 GitHub

```bash
# 進入 message-bot 資料夾
cd message-bot

# 初始化 git 並推到 GitHub
git init
git add .
git commit -m "Initial commit: message-bot v0.1.0"
git branch -M main
git remote add origin git@github.com:YICHUNLIN/message-bot.git
git push -u origin main

# 打 tag(方便鎖版本)
git tag v0.1.0
git push --tags
```

**Repo 設成 Public**,才能讓 `npm install` 抓得到。

### Step 2:在你的主專案安裝 message-bot

回到你的主專案根目錄(包含 line/ 的那個):

```bash
# 安裝套件(從 GitHub)
npm install github:YICHUNLIN/message-bot

# 或鎖版本
npm install github:YICHUNLIN/message-bot#v0.1.0
```

安裝後 `package.json` 會出現:

```json
{
  "dependencies": {
    "@yichunlin/message-bot": "github:YICHUNLIN/message-bot"
  }
}
```

### Step 3:覆蓋 line/ 資料夾

把這個 zip 裡的 `line/` 整個**覆蓋**你主專案的 `line/` 資料夾。

**新檔案**:
- `line/personal.text.extension/special.js`(新增,處理 <REG>)
- `line/group.text.extension/special.js`(新增,空殼)

**修改檔案**:
- `line/index.js`(typo 修正、Promise.allSettled)
- `line/handlers/text.js`(typo + lineClient 統一)
- `line/personal.text.extension/index.js`(改用 message-bot)
- `line/personal.text.extension/admin.js`(清理 imports)
- `line/personal.text.extension/employee.js`(清理 imports)
- `line/personal.text.extension/system.js`(加 whoami)
- `line/group.text.extension/index.js`(改用 message-bot)
- `line/group.text.extension/admin.js`(清理 imports)
- `line/group.text.extension/system.js`(加 whoami)
- `line/group.text.extension/normal.js`(保留原本天氣)

### Step 4:啟動 + 測試

```bash
node app.js  # 或你原本的啟動指令
```

私訊 bot 測試這幾個指令:

| 指令 | 預期回應 |
|------|---------|
| `/whoami` | 你的 LINE userId(**記下來,Phase 2 設定 ROOT_USERS 用**) |
| `>你好` | `安安!這是 emp route` |
| `!你好` | `安安!這是 admin route` |
| `/你好` | `安安!這是 sys route` |
| `<REG>test` | 走 REG 註冊流程 |

群組裡測試:

| 指令 | 預期回應 |
|------|---------|
| `>files` | 群組檔案連結 |
| `>派工單` | 派工單 URL |
| `>天氣 金城鎮` | 天氣資料 |
| `/whoami` | userId + groupId |

---

## 檔案結構說明

### `message-bot/`(新套件)

```
message-bot/
├── package.json                  ← npm 設定,依賴 onion-strategy
├── README.md                     ← API 文件
├── LICENSE
├── .gitignore
├── src/
│   ├── index.js                  ← 套件入口
│   ├── controller.js             ← createMessageBot 主邏輯
│   ├── prefix-parser.js          ← 解析 /、!、> 指令
│   └── route-loader.js           ← 動態載入 sub-routes
└── examples/
    ├── line-personal.js          ← personal 整合範例
    └── line-group.js             ← group 整合範例
```

### `line/`(整合層)

```
line/
├── index.js                      ← LINE webhook 主程式
├── handlers/
│   └── text.js                   ← 文字訊息分流(personal vs group)
├── personal.text.extension/      ← 個人聊天的 bot
│   ├── index.js                  ← 組裝 bot(17 行,使用 message-bot)
│   ├── special.js                ← <REG> 等特殊訊息
│   ├── admin.js                  ← ! 指令路由
│   ├── system.js                 ← / 指令路由
│   └── employee.js               ← > 指令路由
└── group.text.extension/         ← 群組聊天的 bot
    ├── index.js                  ← 組裝 bot(注入 metadata + logger hooks)
    ├── special.js                ← 特殊訊息(目前空殼)
    ├── admin.js                  ← ! 指令路由
    ├── system.js                 ← / 指令路由
    └── normal.js                 ← > 指令路由(保留原本天氣等指令)
```

---

## 主要變更摘要

### 🐛 Bug 修正
- 單例污染(每次呼叫重複註冊 middleware)
- `<REG>` 處理位置(原本被 prefix 路由攔截到不下去)
- typo:`persionalBot` → `personalBot`、`loadMessageStragegy` → `loadMessageStrategy`
- `Promise.all` 改 `Promise.allSettled`(單一 event 失敗不影響其他)

### 🏗️ 架構改進
- 抽出 `message-bot` 獨立套件,核心引擎與 LINE 解耦
- `special.js` 獨立處理特殊訊息(不再混在主 pipeline)
- Hooks 模式注入平台特定邏輯(metadata、logger)
- 預留 `requires` 欄位(Phase 2 權限系統用)

### 🔮 為下階段鋪路
- Phase 2:權限系統(在 message-bot 加 helper、設定 ROOT_USERS)
- Phase 3:外掛系統(在 message-bot 加 plugin loader)
- Phase 4:群組管理(加 groupStore、handleJoin/Leave)

---

## 遇到問題?

跑起來有問題的話,把 server log 貼出來,常見問題:

- **Cannot find module '@yichunlin/message-bot'** → npm install 沒做或失敗
- **某個 sub-route 沒生效** → 檢查 `module.exports` 有沒有正確 `{ prefix, route }`
- **`<REG>` 沒回應** → 檢查 special.js 的 objectServer 是不是從 context 拿到
- **記憶體一直漲** → 應該不會了,但確認所有 `let __static_bot = null` 都有對應的 `if (bot) return bot`

---

*Phase 1 by message-bot v0.1.0*
