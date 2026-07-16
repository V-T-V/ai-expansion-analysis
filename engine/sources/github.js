/* ============================================================================
 * 源 3：GitHub  (生态成熟度信号)
 * 真实 API: https://api.github.com/search/repositories  (无 key 有较低配额，足够)
 * 度量：仓库数 + top 仓库 stars，反映"工程化/生态成熟度"
 * ============================================================================ */
'use strict';
const { getJSON } = require('./_http');

const ENDPOINT = 'https://api.github.com/search/repositories';

async function fetchDomain(domainId, kw) {
  // 检索质量优化：kw.en[0] 常是泛化的 "AI X"，直接拼 ' AI' 会召回全站最热仓库
  // （如 agent 框架）而非领域代表仓库。改用前两个关键词用 OR 组合，且不重复加 AI。
  const terms = kw.en.slice(0, 2).map(t => `"${t}"`);
  const q = encodeURIComponent(terms.join(' OR '));
  const url = `${ENDPOINT}?q=${q}&sort=stars&order=desc&per_page=10`;
  // 若设置了 GITHUB_TOKEN / GH_TOKEN，带上以提高配额（5000/小时 vs 未授权 ~10/分钟）
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const data = await getJSON(url, { timeout: 12000, headers });
  if (!data || typeof data.total_count !== 'number') return { ok: false, source: 'github' };

  const topStars = (data.items || []).reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const topRepo = data.items && data.items[0] ? {
    name: data.items[0].full_name,
    stars: data.items[0].stargazers_count
  } : null;
  // 注意：GitHub Search API 的 total_count 在无鉴权下通常封顶 ~1000，
  // 且热门词会饱和。这里如实记录，归一化时由 scorer 的 log 压缩吸收饱和效应；
  // 不再做额外的硬编码上限，避免掩盖真实分布。
  return {
    ok: true, source: 'github',
    raw: {
      totalRepos: data.total_count,
      topStarsK: Math.round(topStars / 1000 * 10) / 10, // 千 stars（top 10 仓库之和）
      topRepo: topRepo
    }
  };
}

function synthetic(domainId, intensity = 1) {
  let h = 0; for (const c of domainId) h = (h * 41 + c.charCodeAt(0)) % 1000;
  const repos = Math.round((200 + (h % 4000)) * intensity);
  const stars = Math.round((5 + (h % 60)) * intensity * 10) / 10;
  return {
    ok: true, source: 'github', synthetic: true,
    raw: { totalRepos: repos, topStarsK: stars, topRepo: null }
  };
}

module.exports = { fetchDomain, synthetic };
