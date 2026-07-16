/* ============================================================================
 * 管线编排  (run.js)
 * 流程：加载静态基线 → 并发采集多源 → 评分 → 锚点校准 → 综合分
 *       → 写快照 → 算加速度 → 告警 → 输出仪表盘 JSON
 * 用法：  node engine/run.js            # 正式跑（真实采集）
 *         node engine/run.js --synth    # 强制全合成（无网演示/测试）
 * ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { KEYWORDS } = require('./config');
const scorer = require('./scorer');
const snapshot = require('./snapshot');
const { detect } = require('./alerts');

// 静态基线（领域元信息）——直接读浏览器版 data.js
const BASE = require('./_loadBase'); // 见下方 _loadBase.js

const SOURCES = {
  arxiv: require('./sources/arxiv'),
  hn: require('./sources/hn'),
  github: require('./sources/github'),
  news: require('./sources/news')
};

const FORCE_SYNTH = process.argv.includes('--synth');
const { makeLimiter, clearCache } = require('./sources/_http');
const { clearFeedCache } = require('./sources/news');

// 每源一个并发闸门：控制同时打到同一 API 的请求数（GitHub 尤其敏感）
const LIMITERS = {
  arxiv: makeLimiter(3),
  hn: makeLimiter(4),
  github: makeLimiter(2),   // 无 key 配额最低，最保守
  news: makeLimiter(4)
};

/* 采集单领域单源，套上该源的并发闸门；任务结束（成功/失败）释放槽位 */
function collectSource(name, domainId, kw) {
  const src = SOURCES[name];
  const intensity = kw.intensity || 1;
  if (FORCE_SYNTH) return Promise.resolve(src.synthetic(domainId, intensity));
  return new Promise(resolve => {
    LIMITERS[name](release => {
      src.fetchDomain(domainId, kw)
        .then(r => resolve((r && r.ok) ? r : src.synthetic(domainId, intensity)))
        .catch(() => resolve(src.synthetic(domainId, intensity)))
        .then(release);   // 无论结果，都释放槽位并唤醒队列下一个
    });
  });
}

/* 全量并发采集：所有领域 × 所有源 同时起飞，由 LIMITERS 控速 */
async function collectAll() {
  const tasks = []; // {domainId, name, kw, idx}
  BASE.forEach(d => {
    const kw = KEYWORDS[d.id];
    if (!kw) return;
    Object.keys(SOURCES).forEach(name => tasks.push({ domainId: d.id, name, kw }));
  });
  const results = await Promise.all(tasks.map(t => collectSource(t.name, t.domainId, t.kw)));
  // 归并成 { domainId: { source: result } }
  const byDomain = {};
  let i = 0;
  BASE.forEach(d => {
    const kw = KEYWORDS[d.id];
    if (!kw) return;
    byDomain[d.id] = {};
    Object.keys(SOURCES).forEach(name => { byDomain[d.id][name] = results[i++]; });
  });
  return byDomain;
}

async function run() {
  const t0 = Date.now();
  const ts = new Date().toISOString();
  console.log(`\n━━━ AI 扩张评估管线启动 ${ts} ${FORCE_SYNTH ? '[合成模式]' : '[真实采集·并发]'} ━━━\n`);

  // 1. 全量并发采集（合成模式瞬时完成；live 模式由并发闸门控速）
  const t1 = Date.now();
  const allSignals = await collectAll();
  console.log(`采集完成（${((Date.now() - t1) / 1000).toFixed(1)}s）\n`);

  // 2. 评分（CPU 密集，同步顺序即可）
  const scored = [];
  for (const d of BASE) {
    const signals = allSignals[d.id];
    if (!signals) continue;
    const intensity = (KEYWORDS[d.id] || {}).intensity || 1;

    const dims = scorer.scoreDomain(d.id, signals, intensity);
    const cal = scorer.anchorCalibrate(d.id, dims);
    const score = scorer.composite(cal);

    scored.push({
      ...d,
      adoption: Math.round(cal.adoption),
      penetration: Math.round(cal.depth),  // 介入深度沿用 penetration 字段（仪表盘已用）
      depth: Math.round(cal.depth),
      maturity: Math.max(1, Math.min(5, Math.round(cal.maturity / 20))), // 0-100 → 整数 1-5
      speedScore: Math.round(cal.speed),
      speed: scorer.speedTier(cal.speed),
      riskScore: Math.round(cal.risk),
      score: Math.round(score * 10) / 10,
      confidence: scorer.confidence(signals),  // 置信度：真实源占比加权
      _signals: summarizeSources(signals)
    });
    const syn = Object.values(signals).filter(s => s.synthetic).length;
    console.log(`▶ ${d.id.padEnd(10)} score=${scored[scored.length - 1].score} depth=${scored[scored.length - 1].depth} adopt=${scored[scored.length - 1].adoption} ${syn ? `(${syn}源合成)` : '(全真实)'}`);
  }
  clearCache();          // 清 HTTP 缓存
  clearFeedCache();      // 清 news feed 模块级缓存

  // 3. 加速度 + 告警（先算，再一次性组装完整快照，避免写半成品）
  //    detect/computeAcceleration 期望 {domains:[...]} 结构
  const prev = snapshot.readPrev();
  const prevPrev = snapshot.readPrevPrev();
  const scoredWrap = { domains: scored };
  const accel = snapshot.computeAcceleration(scoredWrap, prev, prevPrev);
  const alerts = detect(scoredWrap, accel);

  // 3. 组装完整快照对象（含 accel/alerts）
  const snap = {
    ts: ts,
    label: new Date(ts).toLocaleString('zh-CN', { hour12: false }),
    mode: FORCE_SYNTH ? 'synthetic' : 'live',
    domainCount: scored.length,
    domains: scored,
    stats: computeStats(scored),
    acceleration: accel,
    alerts: alerts
  };

  // 4. 一次写盘（快照 + 仪表盘消费的 latest.json/replay.json）
  const snapFile = snapshot.save(snap);
  console.log(`\n📦 快照已保存：${path.relative(process.cwd(), snapFile)}`);
  writeOutput(snap);

  // 6. 控制台摘要
  console.log(`\n━━━ 完成（${((Date.now() - t0) / 1000).toFixed(1)}s）━━━`);
  console.log(`领域 ${snap.domainCount} · 告警 ${alerts.length} 条`);
  if (alerts.length) {
    console.log('\n🚨 告警：');
    alerts.slice(0, 8).forEach(a => console.log(`  [${a.severity.toUpperCase()}] ${a.message}`));
  }
  console.log(`\n→ 仪表盘数据：engine/output/latest.json`);
  console.log(`→ 历史回放：  engine/output/replay.json (${snapshot.list().length} 个快照)\n`);
}

function summarizeSources(signals) {
  const out = {};
  for (const [k, v] of Object.entries(signals)) {
    out[k] = { synthetic: !!v.synthetic, raw: v.raw };
  }
  return out;
}

function computeStats(domains) {
  const avg = k => Math.round(domains.reduce((s, d) => s + d[k], 0) / domains.length);
  return {
    avgPenetration: avg('depth'),
    avgAdoption: avg('adoption'),
    explosive: domains.filter(d => d.speed === 'explosive').length,
    deepEmbedded: domains.filter(d => d.depth >= 60).length,
    topScore: [...domains].sort((a, b) => b.score - a.score).slice(0, 5).map(d => ({ id: d.id, name: d.name, score: d.score }))
  };
}

function writeOutput(snap) {
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // 注入真实历史序列供 KPI sparkline 使用（替代旧的静态预设曲线）
  snap.history = { avgScore: snapshot.avgScoreHistory() };
  // 输出给前端前剥离引擎内部字段 _signals（保留在快照里供调试）
  const out = Object.assign({}, snap, {
    domains: snap.domains.map(d => {
      const c = Object.assign({}, d);
      delete c._signals;
      return c;
    })
  });
  fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(out, null, 2), 'utf8');
  const replay = snapshot.replaySeries();
  fs.writeFileSync(path.join(outDir, 'replay.json'), JSON.stringify(replay, null, 2), 'utf8');
}

run().catch(e => { console.error('管线失败：', e); process.exit(1); });
