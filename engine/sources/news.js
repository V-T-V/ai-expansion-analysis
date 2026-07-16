/* ============================================================================
 * 源 4：新闻舆论 + 风险信号
 * 策略：聚合多个可达的科技媒体 RSS（TechCrunch/VentureBeat/Verge），
 *       抓全量 feed 后用 NEWS_KEYWORDS 在标题+描述里做 per-domain 归属判定。
 *       这解决了"几个媒体 RSS 覆盖不了 18 细分领域"的召回问题——
 *       不靠检索精确召回（Google News/GDELT 在本环境被 TLS 指纹拦截），
 *       而是抓全量后用宽关键词做领域归属，热门领域(code/finance)能拿到 10-30% 相关条。
 * 度量：volume(领域相关条数) + riskHits(风险词命中)
 * ============================================================================ */
'use strict';
const { getText } = require('./_http');
const { NEWS_KEYWORDS } = require('../config');

const RISK_WORDS = ['breach', 'leak', 'ban', 'lawsuit', 'regulation', 'scandal', 'flaw', 'vulnerab', 'failure', 'crackdown', 'investigate', 'fine', 'sue', 'settle',
  '监管', '禁', '违规', '泄露', '事故', '诉讼', '罚款', '争议'];

const FEEDS = [
  'https://techcrunch.com/category/artificial-intelligence/feed/',
  'https://venturebeat.com/category/ai/feed/',
  'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'
];

// 模块级缓存：一次 run 内所有领域共享同一份 feed 全文（避免 18 次重复抓取）
let _feedCache = null;
let _feedCacheTs = 0;
const FEED_CACHE_TTL = 5 * 60 * 1000;

/* 抓取并解析所有 feed，返回 [{title, desc}] */
async function fetchAllFeeds() {
  if (_feedCache && Date.now() - _feedCacheTs < FEED_CACHE_TTL) return _feedCache;
  const allItems = [];
  await Promise.all(FEEDS.map(async (url) => {
    const xml = await getText(url, { timeout: 9000, retries: 0, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!xml || xml.length < 200) return;
    // 兼容 RSS <item> 与 Atom <entry>
    const blocks = xml.split(/<item>|<entry>/).slice(1);
    for (const b of blocks) {
      const tm = b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title[^>]*>([\s\S]*?)<\/title>/);
      const dm = b.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<summary[^>]*>([\s\S]*?)<\/summary>/);
      const title = tm ? (tm[1] || tm[2] || '').trim() : '';
      const desc = dm ? (dm[1] || dm[2] || '').trim() : '';
      if (title) allItems.push({ title, desc });
    }
  }));
  _feedCache = allItems;
  _feedCacheTs = Date.now();
  return allItems;
}

/* 判定一条新闻是否属于某领域 + 是否含风险词 */
function matchDomain(text, words) {
  const t = text.toLowerCase();
  for (const w of words) {
    if (t.indexOf(w) !== -1) return true;
  }
  return false;
}
function countRisk(text) {
  const t = text.toLowerCase();
  for (const w of RISK_WORDS) {
    if (t.indexOf(w) !== -1) return 1; // 一条新闻最多计 1 个风险命中，避免单条灌水
  }
  return 0;
}

async function fetchDomain(domainId, kw) {
  const items = await fetchAllFeeds();
  if (!items.length) return { ok: false, source: 'news' };

  const words = NEWS_KEYWORDS[domainId] || kw.en || [];
  let volume = 0, riskHits = 0;
  for (const it of items) {
    const text = it.title + ' ' + it.desc;
    const isRelevant = matchDomain(text, words);
    if (isRelevant) volume++;
    // 风险只在该领域相关条里统计，让 risk 也有 per-domain 区分度（而非全局恒定）
    if (isRelevant) riskHits += countRisk(text);
  }
  return {
    ok: true, source: 'news',
    raw: {
      volume: volume,                       // 该领域相关条数（有区分度）
      riskHits: riskHits,                    // 该领域相关条里的风险命中（per-domain）
      totalFeedItems: items.length
    }
  };
}

function synthetic(domainId, intensity) {
  intensity = intensity || 1;
  let h = 0; for (const c of domainId) h = (h * 43 + c.charCodeAt(0)) % 1000;
  return {
    ok: true, source: 'news', synthetic: true,
    raw: {
      volume: Math.round((h % 11) * intensity),   // 0-10 相关条数
      riskHits: h % 7,
      totalFeedItems: 37
    }
  };
}

// 供 run.js 在一次 run 结束后清理模块级缓存
function clearFeedCache() { _feedCache = null; _feedCacheTs = 0; }

module.exports = { fetchDomain, synthetic, clearFeedCache };
