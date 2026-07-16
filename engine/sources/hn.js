/* ============================================================================
 * 源 2：Hacker News  (社区热度/采用信号)
 * 真实 API: HN Algolia Search  https://hn.algolia.com/api/v1/search
 *   无需 key。按 query 检索近 N 月 story，累加 points + comment 数。
 * 反映"采用率/舆论热度"
 * ============================================================================ */
'use strict';
const { getJSON } = require('./_http');
const { WINDOWS } = require('../config');

const ENDPOINT = 'https://hn.algolia.com/api/v1/search';

async function fetchDomain(domainId, kw) {
  // 取第一个英文主词 + 通配，限制近期
  const sinceSec = Math.floor(Date.now() / 1000) - WINDOWS.hnMonths * 30 * 86400;
  const q = encodeURIComponent(kw.en[0]);
  const url = `${ENDPOINT}?query=${q}&tags=story&numericFilters=created_at_i>${sinceSec}&hitsPerPage=50`;
  const data = await getJSON(url, { timeout: 12000 });
  if (!data || !Array.isArray(data.hits)) return { ok: false, source: 'hn' };

  let points = 0, comments = 0;
  const dates = [];
  data.hits.forEach(h => {
    points += h.points || 0;
    comments += h.num_comments || 0;
    if (h.created_at_i) dates.push(h.created_at_i * 1000);
  });
  return {
    ok: true, source: 'hn',
    raw: { hits: data.hits.length, points, comments, dates }
  };
}

function synthetic(domainId, intensity = 1) {
  let h = 0; for (const c of domainId) h = (h * 37 + c.charCodeAt(0)) % 1000;
  const points = Math.round((300 + (h % 1800)) * intensity);
  const now = Date.now();
  return {
    ok: true, source: 'hn', synthetic: true,
    raw: {
      hits: 8 + (h % 20),
      points,
      comments: Math.round(points * 0.6),
      dates: Array.from({ length: 10 }, () => now - Math.floor(Math.random() * 90) * 86400000)
    }
  };
}

module.exports = { fetchDomain, synthetic };
