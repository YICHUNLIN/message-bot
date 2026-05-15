'use strict';

const fs = require('fs');
const path = require('path');

/**
 * 從指定資料夾動態載入 sub-routes
 *
 * 規則:
 *   - 排除隱藏檔(. 開頭)
 *   - 排除 _ 開頭(內部用)
 *   - 排除指定的 ignore 檔(預設 index.js、special.js)
 *   - 只載入 .js
 *
 * 每個 sub-route 檔應該 export:
 *   {
 *     prefix: '/' | '!' | '>',
 *     requires: 'root' | 'admin' | 'user' | 'guest',  // 可選
 *     route: (ctx) => Promise<void>,
 *   }
 *
 * 回傳:{ [prefix]: subRouteObject }
 */
function loadSubRoutes(dir, options = {}) {
  const ignore = new Set([
    'index.js',
    'special.js',
    ...(options.ignore || []),
  ]);

  const routes = {};

  const files = fs.readdirSync(dir).filter((file) => {
    if (file.indexOf('.') === 0) return false;
    if (file.startsWith('_')) return false;
    if (ignore.has(file)) return false;
    if (file.slice(-3) !== '.js') return false;
    return true;
  });

  for (const file of files) {
    const mod = require(path.join(dir, file));

    if (!mod || typeof mod !== 'object') {
      console.warn(`[message-bot] ${file} 沒有正確 export 物件,略過`);
      continue;
    }
    if (!mod.prefix || typeof mod.route !== 'function') {
      console.warn(`[message-bot] ${file} 缺少 prefix 或 route,略過`);
      continue;
    }
    if (routes[mod.prefix]) {
      console.warn(
        `[message-bot] prefix "${mod.prefix}" 重複註冊(${file}),覆蓋前一個`
      );
    }

    routes[mod.prefix] = mod;
  }

  return routes;
}

module.exports = { loadSubRoutes };
