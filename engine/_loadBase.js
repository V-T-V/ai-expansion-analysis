/* ============================================================================
 * 基线加载器  (_loadBase.js)
 * 复用浏览器版 js/data.js 中的领域元信息（name/icon/category/market/summary/
 * deployed/future/risk），避免重复维护。在 Node 里模拟 window 环境执行 data.js。
 * ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8');
const sandbox = { window: {} };
// data.js 里有 `window.AIDATA = (function(){ ... })()` ——直接在 sandbox 跑
const fn = new Function('window', code);
fn(sandbox.window);

const DOMAINS = sandbox.window.AIDATA.DOMAINS.map(d => ({
  id: d.id, name: d.name, icon: d.icon, category: d.category,
  market: d.market, summary: d.summary,
  deployed: d.deployed, future: d.future, risk: d.risk
}));

module.exports = DOMAINS;
