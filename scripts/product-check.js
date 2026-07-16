#!/usr/bin/env node
/* 产品化门禁：验证趋势雷达门户的静态页面、动态引擎、输出快照与报告链路。 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const shouldWrite = process.argv.includes('--write');

const gates = [
  {
    id: 'static-dashboard',
    label: 'Static dashboard shell',
    required: [
      'index.html',
      'css/style.css',
      'js/data.js',
      'js/viz.js',
      'js/app.js',
      'js/dynamic.js',
    ],
    sourceChecks: [
      { file: 'index.html', contains: 'dyn-banner' },
      { file: 'index.html', contains: 'alerts-panel' },
      { file: 'index.html', contains: 'replay-slider' },
      { file: 'js/app.js', contains: 'renderDynamicBanner' },
      { file: 'js/app.js', contains: 'renderAlerts' },
    ],
  },
  {
    id: 'data-model',
    label: '18-domain trend data model',
    required: ['js/data.js', 'engine/config.js', 'engine/_loadBase.js'],
    dataChecks: [
      { type: 'staticDomains', min: 18 },
      { type: 'timeline', min: 8 },
      { type: 'levels', min: 5 },
    ],
  },
  {
    id: 'signal-engine',
    label: 'Signal-driven evaluation engine',
    required: [
      'engine/run.js',
      'engine/scorer.js',
      'engine/snapshot.js',
      'engine/alerts.js',
      'engine/sources/arxiv.js',
      'engine/sources/hn.js',
      'engine/sources/github.js',
      'engine/sources/news.js',
      'engine/sources/_http.js',
      'scripts/verify.js',
    ],
    sourceChecks: [
      { file: 'engine/run.js', contains: '--synth' },
      { file: 'engine/run.js', contains: 'writeOutput' },
      { file: 'engine/alerts.js', contains: 'emerging' },
      { file: 'engine/snapshot.js', contains: 'replaySeries' },
    ],
  },
  {
    id: 'runtime-output',
    label: 'Latest output and replay data',
    required: ['engine/output/latest.json', 'engine/output/replay.json'],
    jsonChecks: [
      { file: 'engine/output/latest.json', path: 'domains.length', min: 18 },
      { file: 'engine/output/latest.json', path: 'stats.topScore.length', min: 3 },
      { file: 'engine/output/replay.json', path: 'timeline.length', min: 1 },
      { file: 'engine/output/replay.json', path: 'series.length', min: 18 },
    ],
  },
  {
    id: 'report-export',
    label: 'Reusable trend report export',
    required: ['scripts/export-report.js', 'scripts/export-html-report.js'],
    sourceChecks: [
      { file: 'scripts/export-html-report.js', contains: 'AI 扩张趋势雷达报告' },
      { file: 'scripts/export-html-report.js', contains: 'tiny-edge-models' },
      { file: 'scripts/export-html-report.js', contains: 'trend-portal-' },
    ],
  },
  {
    id: 'html-report-output',
    label: 'Generated HTML trend portal',
    required: ['reports/trend-portal-latest.html'],
    sourceChecks: [
      { file: 'reports/trend-portal-latest.html', contains: '<title>AI 扩张趋势雷达报告</title>' },
      { file: 'reports/trend-portal-latest.html', contains: 'Top Opportunity Domains' },
      { file: 'reports/trend-portal-latest.html', contains: 'tiny-edge-models' },
    ],
  },
  {
    id: 'edge-ai-topic',
    label: 'Edge AI topic linked to tiny-edge-models',
    required: ['topics/edge-ai.md', '../tiny-edge-models/README.md', '../tiny-edge-models/train/README.md'],
    sourceChecks: [
      { file: 'topics/edge-ai.md', contains: 'tiny-edge-models' },
      { file: 'topics/edge-ai.md', contains: '端侧 AI' },
      { file: 'topics/edge-ai.md', contains: 'edge-trainer' },
    ],
  },
  {
    id: 'product-docs',
    label: 'Product direction and operator docs',
    required: ['README.md', 'PRODUCT.md'],
    sourceChecks: [
      { file: 'README.md', contains: 'node scripts/verify.js' },
      { file: 'PRODUCT.md', contains: '趋势报告' },
    ],
  },
];

function filePath(file) {
  return path.join(ROOT, file);
}

function exists(file) {
  return fs.existsSync(filePath(file));
}

function read(file) {
  return fs.readFileSync(filePath(file), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => {
    if (acc == null) return undefined;
    if (key === 'length') return acc.length;
    return acc[key];
  }, obj);
}

function loadStaticData() {
  global.window = {};
  delete require.cache[require.resolve(filePath('js/data.js'))];
  require(filePath('js/data.js'));
  return global.window.AIDATA;
}

let staticData = null;
function runDataCheck(check) {
  staticData = staticData || loadStaticData();
  if (check.type === 'staticDomains') return { ...check, count: staticData.DOMAINS.length, ok: staticData.DOMAINS.length >= check.min };
  if (check.type === 'timeline') return { ...check, count: staticData.TIMELINE.length, ok: staticData.TIMELINE.length >= check.min };
  if (check.type === 'levels') return { ...check, count: staticData.LEVELS.length, ok: staticData.LEVELS.length >= check.min };
  return { ...check, count: 0, ok: false };
}

const checkedAt = new Date().toISOString();
const results = gates.map((gate) => {
  const missing = gate.required.filter((file) => !exists(file));
  const sourceChecks = (gate.sourceChecks || []).map((check) => {
    let ok = false;
    try { ok = read(check.file).includes(check.contains); } catch {}
    return { ...check, ok };
  });
  const dataChecks = (gate.dataChecks || []).map((check) => {
    try { return runDataCheck(check); } catch { return { ...check, count: 0, ok: false }; }
  });
  const jsonChecks = (gate.jsonChecks || []).map((check) => {
    let value;
    let ok = false;
    try {
      value = getPath(readJson(check.file), check.path);
      ok = typeof value === 'number' && value >= check.min;
    } catch {}
    return { ...check, value, ok };
  });
  const failed =
    missing.length ||
    sourceChecks.some((c) => !c.ok) ||
    dataChecks.some((c) => !c.ok) ||
    jsonChecks.some((c) => !c.ok);
  return {
    id: gate.id,
    label: gate.label,
    status: failed ? 'fail' : 'pass',
    missing,
    sourceChecks,
    dataChecks,
    jsonChecks,
  };
});

const summary = {
  checkedAt,
  project: 'ai-expansion-analysis',
  product: 'AI trend radar and report portal',
  gates: results.length,
  passed: results.filter((r) => r.status === 'pass').length,
  failed: results.filter((r) => r.status === 'fail').length,
  results,
};

for (const result of results) {
  console.log(`${result.status === 'pass' ? 'PASS' : 'FAIL'} ${result.id} - ${result.label}`);
  for (const file of result.missing) console.log(`  missing: ${file}`);
  for (const check of result.sourceChecks) console.log(`  source ${check.ok ? 'ok' : 'missing'}: ${check.file} contains "${check.contains}"`);
  for (const check of result.dataChecks) console.log(`  data ${check.ok ? 'ok' : 'low'}: ${check.type} count=${check.count} min=${check.min}`);
  for (const check of result.jsonChecks) console.log(`  json ${check.ok ? 'ok' : 'low'}: ${check.file} ${check.path}=${check.value} min=${check.min}`);
}

console.log(`\nProduct gates: ${summary.passed}/${summary.gates} passed`);

if (shouldWrite) {
  const out = filePath('engine/output/product-status.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${out}`);
}

if (summary.failed) process.exit(1);
