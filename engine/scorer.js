/* ============================================================================
 * 评分器  (scorer.js)
 * 把多源原始信号 → 5 个维度分(0-100) → 加权综合分
 * 流程：归一化 → 时间衰减 → 锚点校准 → 加权 → clamp
 * ============================================================================ */
'use strict';
const { WEIGHTS, HALF_LIFE_DAYS, NORM_BASELINE, ANCHORS, SOURCE_CREDIBILITY } = require('./config');

/* 时间衰减：按半衰期折算，近期信号权重高 */
function decayWeighted(dates, now) {
  now = now || Date.now();
  if (!dates || !dates.length) return 0;
  const halfMs = HALF_LIFE_DAYS * 86400000;
  let sum = 0;
  for (let i = 0; i < dates.length; i++) {
    const age = (now - dates[i]) / halfMs;
    sum += Math.pow(0.5, Math.max(0, age));
  }
  return sum;
}

/* 归一化到 0-100（log 压缩避免离群值主导）*/
function norm(value, baseline) {
  if (baseline <= 0) return 0;
  const ratio = value / baseline;
  const score = Math.log1p(ratio) / Math.log1p(2.5) * 100;
  return clamp(score, 0, 100);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* 计算单个领域的 5 维分数 */
function scoreDomain(domainId, signals, intensity) {
  intensity = intensity || 1;
  const a = signals.arxiv && signals.arxiv.raw;
  const h = signals.hn && signals.hn.raw;
  const g = signals.github && signals.github.raw;
  const n = signals.news && signals.news.raw;

  let depth = 0;
  if (a) {
    // 语义加权：纯计数 + 深度词命中加权（深度论文更说明 AI 介入深）
    const eff = decayWeighted(a.dates) * intensity;
    const depthRatio = a.depthHits ? (a.depthHits / Math.max(1, a.recentHits)) : 0;
    const depthEff = decayWeighted(a.dates) * intensity * depthRatio * 1.6;
    // 领域热度：用 totalResults（不饱和）作为额外深度信号——论文基数大说明研究投入深
    // 用 log 压缩到 0-30 分区间叠加，避免热门领域过度主导
    const totalBoost = a.totalResults ? Math.min(30, Math.log1p(a.totalResults / 100) / Math.log1p(30) * 30) : 0;
    depth = norm(eff + depthEff, NORM_BASELINE.arxivHits * 0.6) * 0.7 + totalBoost;
    depth = Math.min(100, depth);
  }

  let adoption = 0;
  if (h || n) {
    const hnPart = h ? norm(decayWeighted(h.dates) * intensity * 8, NORM_BASELINE.hnPoints * 0.5) : 0;
    // news 的单源相关条数召回不足（常为 0）；改用 feed 总活跃度作为舆论面代理
    // totalFeedItems 反映"AI 整体媒体热度"，乘以相关命中率(volume/total)加权领域特异性
    const newsVol = n ? (n.volume + (n.totalFeedItems ? n.totalFeedItems * 0.15 : 0)) : 0;
    const newsPart = n ? norm(newsVol * intensity, NORM_BASELINE.newsVolume) : 0;
    adoption = (h && n) ? hnPart * 0.7 + newsPart * 0.3 : (hnPart || newsPart);
  }

  let maturity = 0;
  if (g) {
    const repoPart = norm(g.totalRepos / 1000, NORM_BASELINE.githubRepos);
    const starPart = norm(g.topStarsK, NORM_BASELINE.githubStars);
    maturity = repoPart * 0.4 + starPart * 0.6;
  }

  let speed = 0;
  const recentStrength =
    (a ? decayWeighted(a.dates) * intensity : 0) +
    (h ? decayWeighted(h.dates) * intensity * 0.02 : 0);
  speed = clamp(norm(recentStrength, 25) * 0.8 + (adoption * 0.2), 0, 100);

  let risk = 0;
  if (n) {
    risk = clamp(norm(n.riskHits, 8), 0, 100);
  }

  return { adoption: adoption, depth: depth, maturity: maturity, speed: speed, risk: risk };
}

/* 锚点校准：信号分与人工基线融合 */
function anchorCalibrate(domainId, dims) {
  const A = ANCHORS[domainId] || { baseline: 50, anchor: 0.4 };
  const out = {};
  const keys = ['adoption', 'depth', 'maturity', 'speed'];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    out[k] = clamp(dims[k] * (1 - A.anchor) + A.baseline * A.anchor, 0, 100);
  }
  out.risk = dims.risk;
  return out;
}

/* 综合分：加权（风险作为负向调节） */
function composite(dims) {
  const w = WEIGHTS;
  const positive =
    dims.adoption * w.adoption +
    dims.depth * w.depth +
    dims.maturity * w.maturity +
    dims.speed * w.speed;
  const riskPenalty = (dims.risk / 100) * 18 * (w.risk / 0.05);
  const total = positive - riskPenalty;
  return clamp(total, 0, 100);
}

/* 速度分 → 速度档 */
function speedTier(speedScore) {
  if (speedScore >= 70) return 'explosive';
  if (speedScore >= 50) return 'fast';
  if (speedScore >= 32) return 'steady';
  return 'slow';
}

/* 置信度：基于真实源数 × 各源证据可信度，0-100
 * 合成源不计入证据；真实且齐全 → 高置信；大量降级 → 低置信
 */
function confidence(signals) {
  if (!signals) return 0;
  let cred = 0, got = 0;
  for (const name of Object.keys(SOURCE_CREDIBILITY)) {
    const s = signals[name];
    if (s && s.ok && !s.synthetic) { cred += SOURCE_CREDIBILITY[name]; got++; }
  }
  // 4 源全真实 ≈ 100；3 源 ≈ 75；以此类推。再按已获取源数归一。
  const maxCred = Object.values(SOURCE_CREDIBILITY).reduce((a, b) => a + b, 0);
  return clamp(Math.round((cred / maxCred) * 100), 0, 100);
}

module.exports = {
  decayWeighted: decayWeighted,
  norm: norm,
  clamp: clamp,
  scoreDomain: scoreDomain,
  anchorCalibrate: anchorCalibrate,
  composite: composite,
  speedTier: speedTier,
  confidence: confidence
};
