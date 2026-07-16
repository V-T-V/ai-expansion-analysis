#!/usr/bin/env node
/* 把 engine/output/latest.json 导出为可复用的 Markdown 趋势报告。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const latestPath = path.join(ROOT, 'engine/output/latest.json');
const outDir = path.join(ROOT, 'reports');
// 复用引擎的告警/新兴判定逻辑，确保报告与仪表盘口径一致（而非另写一套）
const { detect } = require(path.join(ROOT, 'engine/alerts'));
const { ANCHORS } = require(path.join(ROOT, 'engine/config'));

function pct(value) {
  return typeof value === 'number' ? `${value}` : '-';
}

function sortByScore(domains) {
  return [...domains].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function confidenceLabel(value) {
  if (typeof value !== 'number') return '未知';
  if (value >= 75) return `高 (${value})`;
  if (value >= 50) return `中 (${value})`;
  return `低 (${value})`;
}

function renderReport(latest) {
  const domains = latest.domains || [];
  const top = sortByScore(domains).slice(0, 8);
  // 新兴机会：复用 alerts.js 的判定（baseline<=45 的早期领域 + 评分在涨），
  // 而非自写 adoption<35——后者会把内容创作/客服等高 baseline 成熟领域误判为新兴
  const accel = latest.acceleration || { deltas: [], accelerations: [] };
  const allAlerts = detect({ domains }, accel);
  const emergingAlerts = allAlerts.filter(a => a.type === 'emerging');
  // 兜底：若无 acceleration 数据（首轮快照），用 baseline + score 排序展示候选
  const emerging = emergingAlerts.length
    ? emergingAlerts.map(a => domains.find(d => d.id === a.domainId)).filter(Boolean)
    : domains
        .filter(d => (ANCHORS[d.id] || { baseline: 50 }).baseline <= 45)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);
  const alerts = latest.alerts && latest.alerts.length ? latest.alerts : allAlerts;

  const lines = [];
  lines.push('# AI 扩张趋势雷达报告');
  lines.push('');
  lines.push(`- 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  lines.push(`- 数据快照：${latest.label || latest.ts || 'unknown'}`);
  lines.push(`- 数据模式：${latest.mode === 'live' ? '实时采集' : '合成/降级'}`);
  lines.push(`- 领域数量：${domains.length}`);
  if (latest.stats) {
    lines.push(`- 平均介入深度：${pct(latest.stats.avgPenetration)}`);
    lines.push(`- 平均采用率：${pct(latest.stats.avgAdoption)}`);
    lines.push(`- 告警数量：${alerts.length}`);
  }
  lines.push('');

  lines.push('## 评分前沿');
  lines.push('');
  lines.push('| 排名 | 领域 | 评分 | 介入深度 | 采用率 | 成熟度 | 速度 | 置信度 |');
  lines.push('|---:|---|---:|---:|---:|---:|---|---|');
  top.forEach((d, idx) => {
    lines.push(`| ${idx + 1} | ${d.name} | ${pct(d.score)} | ${pct(d.depth || d.penetration)} | ${pct(d.adoption)} | ${pct(d.maturity)}/5 | ${d.speed || '-'} | ${confidenceLabel(d.confidence)} |`);
  });
  lines.push('');

  lines.push('## 新兴机会');
  lines.push('');
  lines.push('| 领域 | 当前采用率 | 介入深度 | 速度分 | 关注理由 |');
  lines.push('|---|---:|---:|---:|---|');
  if (!emerging.length) {
    lines.push('| _无_ | - | - | - | 当前无符合"低 baseline + 信号上升"的新兴领域 |');
  } else {
    emerging.forEach((d) => {
      const baseline = (ANCHORS[d.id] || { baseline: 50 }).baseline;
      const ea = emergingAlerts.find(a => a.domainId === d.id);
      const reason = ea ? ea.message.replace(/^🆕 新兴信号：/, '') : `基准 ${baseline}，仍处早期，信号靠前`;
      lines.push(`| ${d.name} | ${pct(d.adoption)} | ${pct(d.depth || d.penetration)} | ${pct(d.speedScore)} | ${reason} |`);
    });
  }
  lines.push('');

  lines.push('## 异动告警');
  lines.push('');
  if (!alerts.length) {
    lines.push('当前快照未触发异动告警。');
  } else {
    alerts.forEach((a) => lines.push(`- [${a.severity}] ${a.message}`));
  }
  lines.push('');

  lines.push('## 专题建议');
  lines.push('');
  lines.push('- 将端侧模型与具身智能作为独立专题跟踪，分别观察部署成本、设备侧能力和应用闭环。');
  lines.push('- 对低置信度领域优先补充来源，避免把合成降级数据误读为确定趋势。');
  lines.push('- 每 6 小时运行一次 `node engine/run.js`，每周导出一次本报告用于复盘。');
  lines.push('');
  lines.push('> 免责声明：本报告基于公开信号和相对评分生成，用于趋势感知，不构成投资或决策建议。');
  lines.push('');

  return lines.join('\n');
}

if (!fs.existsSync(latestPath)) {
  console.error(`缺少 ${latestPath}，请先运行 node engine/run.js --synth`);
  process.exit(1);
}

const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const out = path.join(outDir, `trend-report-${stamp}.md`);
fs.writeFileSync(out, renderReport(latest), 'utf8');
console.log(out);
