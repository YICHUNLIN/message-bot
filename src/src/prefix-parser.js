'use strict';

/**
 * 解析訊息的 prefix,把 ctx 標記成指令物件
 *
 * 預設支援的 prefix:/、!、>
 * 可透過 createPrefixParser({ prefixes }) 自訂
 *
 * 解析後 ctx 增加:
 *   ctx.isCommand    boolean
 *   ctx.prefix       string
 *   ctx.command      第一個 token,小寫
 *   ctx.args         其餘 tokens (array)
 *   ctx.commandLine  去掉 prefix 後的完整字串
 */

const DEFAULT_PREFIXES = ['/', '!', '>'];

function createPrefixParser(options = {}) {
  const prefixes = options.prefixes || DEFAULT_PREFIXES;

  // 長 prefix 優先(避免 '>>' 被 '>' 搶走)
  const sorted = [...prefixes].sort((a, b) => b.length - a.length);

  return (ctx, next) => {
    const text = (ctx.text || '').trim();
    const prefix = sorted.find((p) => text.startsWith(p));

    if (!prefix) {
      ctx.isCommand = false;
      return next();
    }

    const body = text.slice(prefix.length).trim();
    if (!body) {
      ctx.isCommand = false;
      return next();
    }

    const [cmd, ...args] = body.split(/\s+/);
    ctx.isCommand = true;
    ctx.prefix = prefix;
    ctx.command = cmd.toLowerCase();
    ctx.args = args;
    ctx.commandLine = body;

    return next();
  };
}

// 預設 parser(用預設 prefix)
const defaultPrefixParser = createPrefixParser();

module.exports = {
  createPrefixParser,
  defaultPrefixParser,
  DEFAULT_PREFIXES,
};
