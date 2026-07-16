#!/usr/bin/env node
/* 把 engine/output/latest.json 导出为自包含 HTML 趋势门户页。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const latestPath = path.join(ROOT, 'engine/output/latest.json');
const replayPath = path.join(ROOT, 'engine/output/replay.json');
const outDir = path.join(ROOT, 'reports');
// 复用引擎告警逻辑，确保 HTML 报告与仪表盘/MD 报告口径一致
const { detect } = require(path.join(ROOT, 'engine/alerts'));
const { ANCHORS } = require(path.join(ROOT, 'engine/config'));

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortByScore(domains) {
  return [...domains].sort((a, b) => (b.score || 0) - (a.score || 0));
}

function levelLabel(value) {
  if (value >= 75) return 'high';
  if (value >= 45) return 'medium';
  return 'early';
}

function confidenceText(value) {
  if (typeof value !== 'number') return 'unknown';
  if (value >= 75) return `high ${value}`;
  if (value >= 50) return `medium ${value}`;
  return `low ${value}`;
}

function renderDomainRow(domain, index) {
  const depth = domain.depth || domain.penetration || 0;
  const level = levelLabel(domain.score || 0);
  return `<tr>
    <td>${index + 1}</td>
    <td><strong>${escapeHtml(domain.name)}</strong><span>${escapeHtml(domain.category || '')}</span></td>
    <td><b>${domain.score ?? '-'}</b><em class="${level}">${level}</em></td>
    <td>${depth}</td>
    <td>${domain.adoption ?? '-'}</td>
    <td>${domain.maturity ?? '-'}/5</td>
    <td>${escapeHtml(domain.speed || '-')}</td>
    <td>${escapeHtml(confidenceText(domain.confidence))}</td>
  </tr>`;
}

function renderCards(domains) {
  return domains
    .slice(0, 6)
    .map((domain) => {
      const depth = domain.depth || domain.penetration || 0;
      return `<article class="card">
        <div class="card-title">
          <span>${escapeHtml(domain.icon || '')}</span>
          <h3>${escapeHtml(domain.name)}</h3>
        </div>
        <p>${escapeHtml(domain.summary || '')}</p>
        <dl>
          <div><dt>Score</dt><dd>${domain.score ?? '-'}</dd></div>
          <div><dt>Depth</dt><dd>${depth}</dd></div>
          <div><dt>Adoption</dt><dd>${domain.adoption ?? '-'}</dd></div>
          <div><dt>Confidence</dt><dd>${escapeHtml(confidenceText(domain.confidence))}</dd></div>
        </dl>
      </article>`;
    })
    .join('\n');
}

function renderAlerts(alerts) {
  if (!alerts.length) return '<li>No anomaly alerts in the latest snapshot.</li>';
  return alerts
    .map((alert) => `<li><strong>${escapeHtml(alert.severity || 'info')}</strong> ${escapeHtml(alert.message || alert.type || '')}</li>`)
    .join('\n');
}

function renderHtml(latest, replay) {
  const domains = latest.domains || [];
  const top = sortByScore(domains);
  // 新兴机会：复用 alerts.js 判定（baseline<=45 早期领域 + 信号上升）
  // 而非自写 adoption<35——后者会把内容创作/客服等成熟领域误判为新兴
  const accel = latest.acceleration || { deltas: [], accelerations: [] };
  const emergingAlerts = detect({ domains }, accel).filter(a => a.type === 'emerging');
  const emerging = emergingAlerts.length
    ? emergingAlerts.map(a => domains.find(d => d.id === a.domainId)).filter(Boolean)
    : domains
        .filter(d => (ANCHORS[d.id] || { baseline: 50 }).baseline <= 45)
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);
  const alerts = latest.alerts && latest.alerts.length ? latest.alerts : detect({ domains }, accel);
  const timeline = replay && Array.isArray(replay.timeline) ? replay.timeline.length : 0;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI 扩张趋势雷达报告</title>
  <style>
    :root { color-scheme: light; --ink: #172033; --muted: #5d6b82; --line: #d8dee9; --panel: #ffffff; --bg: #f4f6f8; --accent: #0f766e; --blue: #2563eb; --amber: #b45309; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, "Segoe UI", Arial, sans-serif; color: var(--ink); background: var(--bg); line-height: 1.5; }
    header { padding: 40px 32px 24px; background: #101827; color: #fff; }
    header h1 { margin: 0 0 10px; font-size: 34px; letter-spacing: 0; }
    header p { margin: 0; max-width: 880px; color: #c8d2e4; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px 20px 48px; }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: -42px 0 20px; }
    .metric, .card, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .metric { padding: 16px; min-height: 92px; box-shadow: 0 8px 24px rgba(15, 23, 42, .08); }
    .metric span, td span, dt { display: block; color: var(--muted); font-size: 12px; }
    .metric strong { display: block; margin-top: 8px; font-size: 26px; }
    section { padding: 20px; margin-top: 16px; }
    h2 { margin: 0 0 14px; font-size: 20px; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .card { padding: 16px; }
    .card-title { display: flex; gap: 10px; align-items: center; }
    .card h3 { margin: 0; font-size: 17px; }
    .card p { min-height: 72px; color: var(--muted); }
    dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 0; }
    dd { margin: 0; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    em { display: inline-block; margin-left: 8px; padding: 2px 6px; border-radius: 999px; font-style: normal; font-size: 11px; background: #edf2f7; color: var(--muted); }
    em.high { background: #dcfce7; color: #166534; }
    em.medium { background: #dbeafe; color: #1d4ed8; }
    em.early { background: #fef3c7; color: var(--amber); }
    ul { margin: 0; padding-left: 20px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .note { color: var(--muted); font-size: 13px; margin-top: 14px; }
    @media (max-width: 860px) { .metrics, .cards, .two-col { grid-template-columns: 1fr; } header { padding: 28px 20px 56px; } .metrics { margin-top: -38px; } }
  </style>
</head>
<body>
  <header>
    <h1>AI 扩张趋势雷达报告</h1>
    <p>基于最新动态快照生成的静态研究门户页，面向趋势复盘、专题发布和管理层浏览。</p>
  </header>
  <main>
    <div class="metrics">
      <div class="metric"><span>Snapshot</span><strong>${escapeHtml(latest.label || latest.ts || 'unknown')}</strong></div>
      <div class="metric"><span>Domains</span><strong>${domains.length}</strong></div>
      <div class="metric"><span>Alerts</span><strong>${alerts.length}</strong></div>
      <div class="metric"><span>Replay Points</span><strong>${timeline}</strong></div>
    </div>

    <section>
      <h2>Top Opportunity Domains</h2>
      <div class="cards">${renderCards(top)}</div>
    </section>

    <section>
      <h2>Scoreboard</h2>
      <table>
        <thead><tr><th>#</th><th>Domain</th><th>Score</th><th>Depth</th><th>Adoption</th><th>Maturity</th><th>Speed</th><th>Confidence</th></tr></thead>
        <tbody>${top.map(renderDomainRow).join('\n')}</tbody>
      </table>
    </section>

    <div class="two-col">
      <section>
        <h2>Emerging Watchlist</h2>
        <ul>${emerging.length ? emerging.map((domain) => {
          const ea = emergingAlerts.find(a => a.domainId === domain.id);
          const reason = ea ? ea.message.replace(/^🆕 新兴信号：/, '') : `基准 ${(ANCHORS[domain.id] || {baseline:50}).baseline}，仍处早期`;
          return `<li><strong>${escapeHtml(domain.name)}</strong>: ${escapeHtml(reason)}</li>`;
        }).join('\n') : '<li>当前无符合条件的新兴领域</li>'}</ul>
      </section>
      <section>
        <h2>Anomaly Alerts</h2>
        <ul>${renderAlerts(alerts)}</ul>
      </section>
    </div>

    <section>
      <h2>Publishing Notes</h2>
      <p>端侧 AI 专题已链接到 <code>tiny-edge-models</code>，可作为本趋势门户的第一个垂直知识库栏目。后续应把每周快照、专题报告和模型选择决策树统一到同一发布目录。</p>
      <p class="note">This report is generated from <code>engine/output/latest.json</code> and <code>engine/output/replay.json</code>. It is for trend sensing, not financial or legal advice.</p>
    </section>
  </main>
</body>
</html>`;
}

if (!fs.existsSync(latestPath)) {
  console.error(`缺少 ${latestPath}，请先运行 node engine/run.js --synth`);
  process.exit(1);
}

const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
const replay = fs.existsSync(replayPath) ? JSON.parse(fs.readFileSync(replayPath, 'utf8')) : null;
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const out = path.join(outDir, `trend-portal-${stamp}.html`);
const latestOut = path.join(outDir, 'trend-portal-latest.html');
const html = renderHtml(latest, replay);
fs.writeFileSync(out, html, 'utf8');
fs.writeFileSync(latestOut, html, 'utf8');
console.log(out);
console.log(latestOut);
