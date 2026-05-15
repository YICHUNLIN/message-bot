'use strict';

const { createMessageBot, DEFAULT_PREFIXES } = require('./controller');
const { createPrefixParser, defaultPrefixParser } = require('./prefix-parser');
const { loadSubRoutes } = require('./route-loader');
const { FeatureRegistry, createFeatureRouter } = require('./feature-registry');

// 把 onion-strategy 也 re-export,方便使用者直接拿 matchers / createController
const onionStrategy = require('onion-strategy');

module.exports = {
  // 主 API
  createMessageBot,

  // Feature system(v0.2.0 新增)
  FeatureRegistry,
  createFeatureRouter,

  // Helpers(進階用)
  createPrefixParser,
  defaultPrefixParser,
  loadSubRoutes,

  // 常數
  DEFAULT_PREFIXES,

  // 直接 re-export onion-strategy
  matchers: onionStrategy.matchers,
  createController: onionStrategy.createController,
};
