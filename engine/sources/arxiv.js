/* ============================================================================
 * 源 1：arXiv  (学术深度信号)
 * 真实 API: http://export.arxiv.org/api/query  (无需 key)
 * 度量：论文数 + 时间分布（时间衰减加权）+ 标题/摘要里的"深度词"命中数
 * 反映"介入深度/科研成熟度"；深度词加权让"自主/agent/临床"类论文权重更高
 * ============================================================================ */
'use strict';
const { getText } = require('./_http');
const { WINDOWS, DEPTH_WORDS } = require('../config');

const ENDPOINT = 'http://export.arxiv.org/api/query';

/* 解析每条 entry 的 published + 标题 + 摘要（极简 XML 解析，避免引依赖） */
function parseEntries(xml) {
  const entries = [];
  const blocks = xml.split(/<entry>/).slice(1);
  for (const b of blocks) {
    const pub = (b.match(/<published>([^<]+)<\/published>/) || [])[1];
    const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const summary = (b.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '';
    if (pub) entries.push({ ts: new Date(pub).getTime(), text: (title + ' ' + summary).toLowerCase() });
  }
  return entries;
}

/* 统计深度词命中数（命中越多说明该批论文越偏"自主/生产级"，而非综述/浅层） */
function countDepth(entries) {
  let hits = 0;
  for (const e of entries) {
    for (const w of DEPTH_WORDS) {
      if (e.text.indexOf(w.toLowerCase()) !== -1) { hits++; break; } // 每篇最多计 1，避免一篇灌水
    }
  }
  return hits;
}

async function fetchDomain(domainId, kw) {
  // 多关键词融合：用 OR 组合所有英文词，单次请求召回更全
  const termGroup = kw.en.map(t => `all:"${t}"`).join(' OR ');
  const q = encodeURIComponent(
    '(cat:cs.AI OR cat:cs.LG OR cat:cs.CL OR all:"artificial intelligence") AND (' + termGroup + ')'
  );
  const start = Math.floor(Date.now() / 1000 - WINDOWS.arxivDays * 86400);
  const url = `${ENDPOINT}?search_query=${q}&start=0&max_results=80&sortBy=submittedDate&sortOrder=descending`;
  const xml = await getText(url, { timeout: 15000 });
  if (!xml) return { ok: false, source: 'arxiv' };

  const entries = parseEntries(xml);
  const inWindow = entries.filter(e => e.ts >= start * 1000);
  // totalResults 元数据不受 max_results 截断，能区分热门(code~2751)/冷门(agri~1)领域
  const totalM = xml.match(/<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/);
  const totalResults = totalM ? parseInt(totalM[1], 10) : entries.length;
  return {
    ok: true, source: 'arxiv',
    raw: {
      totalResults: totalResults,        // 领域总论文基数（不饱和，跨领域可比）
      totalHits: entries.length,
      recentHits: inWindow.length,
      depthHits: countDepth(inWindow),   // 语义加权：深度词命中的论文数
      dates: inWindow.map(e => e.ts)
    }
  };
}

/* 降级：基于领域 intensity 生成确定性合成信号 */
function synthetic(domainId, intensity) {
  intensity = intensity || 1;
  let h = 0; for (const c of domainId) h = (h * 31 + c.charCodeAt(0)) % 1000;
  const base = 8 + (h % 22);
  const v = Math.round(base * intensity);
  const depthV = Math.round(v * (0.25 + (h % 30) / 100)); // 25%-55% 的论文命中深度词
  const now = Date.now();
  return {
    ok: true, source: 'arxiv', synthetic: true,
    raw: {
      totalHits: v * 3,
      recentHits: v,
      depthHits: depthV,
      dates: Array.from({ length: v }, () => now - Math.floor(Math.random() * WINDOWS.arxivDays) * 86400000)
    }
  };
}

module.exports = { fetchDomain, synthetic };
