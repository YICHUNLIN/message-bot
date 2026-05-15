'use strict';

const fs = require('fs');
const path = require('path');
const { createController } = require('onion-strategy');

/**
 * FeatureRegistry
 *
 * 管理外掛的載入、生命週期、路由註冊。
 *
 * 每個外掛是一個 JS 模組,export 以下結構:
 *
 *   module.exports = {
 *     name: 'weather',                 // 唯一 ID(英文小寫)
 *     version: '1.0.0',
 *     description: '金門天氣查詢',
 *     entry: '天氣',                   // 對應 >天氣
 *     defaultEnabled: true,            // 套件層級的預設(只是參考,實際由 featureStore 決定)
 *     defaultConfig: { ... },
 *
 *     async setup(context) { ... },    // 啟動,回傳 instance
 *     routes(router, instance, ctx),   // 註冊路由,使用 setup 回傳的 instance
 *     async teardown(instance),        // 可選,結束清理
 *   };
 */
class FeatureRegistry {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.globalConfig = options.globalConfig || {};
    this.features = new Map();   // name → { feature, instance }
    this.entries = new Map();    // entry → name
    this.setupDone = false;
  }

  /**
   * 從資料夾載入所有外掛
   * 忽略 _ 或 . 開頭的資料夾
   */
  loadFromDir(featuresDir) {
    if (!fs.existsSync(featuresDir)) {
      this.logger.warn(`[feature] ${featuresDir} 不存在,跳過載入`);
      return;
    }

    const dirs = fs.readdirSync(featuresDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .filter((e) => !e.name.startsWith('_') && !e.name.startsWith('.'));

    for (const dir of dirs) {
      try {
        const mod = require(path.join(featuresDir, dir.name));
        this.register(mod);
      } catch (err) {
        this.logger.error(`[feature] 載入 ${dir.name} 失敗:`, err.message);
      }
    }
  }

  /**
   * 手動註冊一個外掛(避免依賴資料夾結構)
   */
  register(feature) {
    if (!feature || typeof feature !== 'object') {
      throw new Error('feature 必須是物件');
    }
    if (!feature.name) throw new Error('feature 缺少 name');
    if (!feature.entry) throw new Error(`feature ${feature.name} 缺少 entry`);
    if (typeof feature.routes !== 'function') {
      throw new Error(`feature ${feature.name} 缺少 routes() 函式`);
    }
    if (this.features.has(feature.name)) {
      throw new Error(`feature "${feature.name}" 已註冊`);
    }
    if (this.entries.has(feature.entry)) {
      const existing = this.entries.get(feature.entry);
      throw new Error(`entry "${feature.entry}" 已被 "${existing}" 佔用`);
    }

    this.features.set(feature.name, { feature, instance: null });
    this.entries.set(feature.entry, feature.name);
    this.logger.info(`[feature] 註冊 ${feature.name} v${feature.version || '?'} (entry: >${feature.entry})`);
  }

  /**
   * 對所有外掛跑 setup()
   * 失敗的外掛會被移除(不影響其他外掛)
   */
  async setupAll() {
    if (this.setupDone) {
      this.logger.warn('[feature] setupAll 重複呼叫');
      return;
    }
    this.setupDone = true;

    for (const [name, entry] of this.features) {
      const { feature } = entry;
      const context = this._buildContext(feature);

      if (!feature.setup) {
        entry.instance = {};
        continue;
      }

      try {
        entry.instance = (await feature.setup(context)) || {};
        this.logger.info(`[feature] setup ${name} OK`);
      } catch (err) {
        this.logger.error(`[feature] setup ${name} 失敗,移除此外掛:`, err.message);
        this.features.delete(name);
        this.entries.delete(feature.entry);
      }
    }
  }

  /**
   * 把所有外掛的 routes 註冊到指定 router
   * @param {object} router  createController() 的實例
   */
  attachRoutes(router) {
    for (const [name, entry] of this.features) {
      const { feature, instance } = entry;
      const context = this._buildContext(feature);
      try {
        feature.routes(router, instance, context);
      } catch (err) {
        this.logger.error(`[feature] ${name} routes 註冊失敗:`, err.message);
      }
    }
  }

  /**
   * 對所有外掛跑 teardown()(stop bot 時用)
   */
  async teardownAll() {
    for (const [name, entry] of this.features) {
      const { feature, instance } = entry;
      if (feature.teardown) {
        try { await feature.teardown(instance); }
        catch (err) { this.logger.error(`[feature] teardown ${name} 失敗:`, err); }
      }
    }
  }

  // 查詢 helpers

  getByName(name) {
    return this.features.get(name)?.feature || null;
  }

  getByEntry(entry) {
    const name = this.entries.get(entry);
    return name ? this.features.get(name).feature : null;
  }

  listFeatures() {
    return Array.from(this.features.values()).map(({ feature }) => feature);
  }

  hasFeature(name) {
    return this.features.has(name);
  }

  _buildContext(feature) {
    return {
      logger: this.logger,
      config: {
        ...(feature.defaultConfig || {}),
        ...(this.globalConfig[feature.name] || {}),
      },
      registry: this,
    };
  }
}

/**
 * 建立一個給「> 外掛入口」用的 sub-router,
 * 內建「外掛是否啟用」的檢查邏輯
 *
 * 使用方式:
 *   const handler = createFeatureRouter({
 *     registry,
 *     isEnabled: (groupId, featureName) => featureStore.isEnabled(...)
 *   });
 *   // handler 是個 (ctx) => Promise<void>
 *
 * @param {Object} options
 * @param {FeatureRegistry} options.registry
 * @param {Function} [options.isEnabled]  (groupId, featureName, defaultEnabled) => boolean
 *                                         不傳的話一律視為啟用
 * @param {Function} [options.onDisabled] (ctx, feature) => Promise<void>
 *                                         外掛被停用時的處理(預設靜默)
 */
function createFeatureRouter(options = {}) {
  const { registry } = options;
  if (!registry) throw new Error('createFeatureRouter 需要 registry');

  const isEnabled = options.isEnabled || (() => true);
  const onDisabled = options.onDisabled || (async () => {
    // 預設:完全靜默
  });

  const router = createController();

  // 啟用檢查 middleware
  router.use(async (ctx, next) => {
    if (!ctx.command) return next();

    const feature = registry.getByEntry(ctx.command);
    if (!feature) {
      // 不認得的 entry,直接靜默
      return;
    }

    ctx.feature = feature;

    // 群組層級啟用檢查(個人聊天不檢查)
    if (ctx.groupId && ctx.effectiveRole !== 'root') {
      const enabled = await isEnabled(ctx.groupId, feature.name, !!feature.defaultEnabled);
      if (!enabled) {
        return onDisabled(ctx, feature);
      }
    }

    await next();
  });

  // 把所有外掛的 routes 接上來
  registry.attachRoutes(router);

  return (ctx) => router.handle(ctx);
}

module.exports = {
  FeatureRegistry,
  createFeatureRouter,
};
