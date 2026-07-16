#!/usr/bin/env node
/* ============================================================================
 * CI 校验脚本  (scripts/verify.js)
 * 用法: node scripts/verify.js [--full]
 *   默认: 语法检查 + 数据完整性 + 合成管线端到端
 *   --full: 额外跑真实采集管线（联网，慢）
 * 退出码 0 = 全过, 非 0 = 有失败。适合接入 CI / pre-commit / cron 自检。
 * ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
const FULL = process.argv.includes('--full');

function ok(msg) { passed++; console.log('  ✅ ' + msg); }
function bad(msg) { failed++; console.log('  ❌ ' + msg); }
function section(t) { console.log('\n── ' + t + ' ──'); }

/* ---------- 1. 语法检查所有 JS ---------- */
section('1. 语法检查');
const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'snapshots' && e.name !== 'output') walk(p); }
    else if (e.name.endsWith('.js')) jsFiles.push(p);
  }
})(ROOT);
for (const f of jsFiles) {
  try { execSync('node --check "' + f + '"', { stdio: 'pipe' }); ok(path.relative(ROOT, f)); }
  catch (e) { bad(path.relative(ROOT, f) + ' : ' + (e.stderr ? e.stderr.toString().trim() : e.message)); }
}

/* ---------- 2. 静态数据完整性 ---------- */
section('2. 静态数据完整性 (data.js)');
try {
  global.window = {};
  require(path.join(ROOT, 'js/data.js'));
  const D = global.window.AIDATA;
  if (!D || !D.DOMAINS) throw new Error('AIDATA 未导出');
  let issues = [];
  D.DOMAINS.forEach(d => {
    ['id','name','icon','category','penetration','adoption','maturity','speed','deployed','future']
      .forEach(k => { if (d[k] === undefined) issues.push(d.id + ' 缺字段 ' + k); });
    if (d.penetration < 0 || d.penetration > 100) issues.push(d.id + ' penetration 越界');
    if (d.adoption < 0 || d.adoption > 100) issues.push(d.id + ' adoption 越界');
    if (!D.SPEED[d.speed]) issues.push(d.id + ' 未知 speed');
    if (!D.CATEGORIES.includes(d.category)) issues.push(d.id + ' 未知 category');
  });
  D.DOMAIN_CURVES.forEach(c => {
    if (!D.DOMAINS.find(x => x.id === c.id)) issues.push('孤儿曲线 ' + c.id);
    if (c.values.length !== D.TIMELINE.length) issues.push('曲线 ' + c.id + ' 长度不符');
  });
  if (issues.length) issues.forEach(bad);
  else ok(D.DOMAINS.length + ' 领域 · ' + D.LEVELS.length + ' 阶梯 · ' + D.TIMELINE.length + ' 时间点 全部校验通过');
} catch (e) { bad('data.js 加载失败: ' + e.message); }

/* ---------- 3. 引擎模块可加载 ---------- */
section('3. 引擎模块加载');
['config','scorer','snapshot','alerts','_loadBase'].forEach(m => {
  try { require(path.join(ROOT, 'engine', m)); ok('engine/' + m); }
  catch (e) { bad('engine/' + m + ': ' + e.message); }
});
['arxiv','hn','github','news','_http'].forEach(m => {
  try { require(path.join(ROOT, 'engine/sources', m)); ok('engine/sources/' + m); }
  catch (e) { bad('engine/sources/' + m + ': ' + e.message); }
});

/* ---------- 4. 合成管线端到端 ---------- */
section('4. 合成管线端到端');
try {
  execSync('node "' + path.join(ROOT, 'engine/run.js') + '" --synth', { stdio: 'pipe', cwd: ROOT, timeout: 30000 });
  const latest = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/output/latest.json'), 'utf8'));
  const replay = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/output/replay.json'), 'utf8'));
  if (latest.domains.length !== 18) bad('latest.json 领域数=' + latest.domains.length + ' (期望18)');
  else ok('latest.json: ' + latest.domains.length + ' 领域, mode=' + latest.mode);
  if (!latest.acceleration) bad('缺 acceleration');
  else ok('acceleration 存在');
  if (latest.domains.some(d => d._signals !== undefined)) bad('_signals 未剥离');
  else ok('_signals 已剥离');
  if (latest.domains.some(d => !Number.isInteger(d.maturity) || d.maturity < 1 || d.maturity > 5)) bad('maturity 非整数1-5');
  else ok('maturity 全为整数 1-5');
  if (!replay.timeline || !replay.timeline.length) bad('replay 无时间点');
  else ok('replay: ' + replay.timeline.length + ' 时间点, ' + replay.series.length + ' 领域序列');
  if (!latest.history || !latest.history.avgScore) bad('缺 history.avgScore');
  else ok('history.avgScore 长度=' + latest.history.avgScore.length);
} catch (e) { bad('合成管线失败: ' + (e.stderr ? e.stderr.toString().trim() : e.message)); }

/* ---------- 5. 告警逻辑单测 ---------- */
section('5. 告警逻辑单测');
try {
  const { detect } = require(path.join(ROOT, 'engine/alerts'));
  const alerts = detect(
    { domains: [{ id: 'robot', name: '机器人', adoption: 25, score: 30 }] },
    { deltas: [{ id: 'robot', name: '机器人', scoreDelta: 6, speedDelta: 4, prevScore: 24, currScore: 30 }], accelerations: [] }
  );
  if (alerts.some(a => a.type === 'emerging' && a.domain === '机器人')) ok('新兴告警: 低baseline+涨 正确触发');
  else bad('新兴告警未触发');
  const alerts2 = detect(
    { domains: [{ id: 'code', name: '软件开发', adoption: 40, score: 80 }] },
    { deltas: [{ id: 'code', name: '软件开发', scoreDelta: 8, speedDelta: 5, prevScore: 72, currScore: 80 }], accelerations: [] }
  );
  if (alerts2.some(a => a.type === 'emerging' && a.domain === '软件开发')) bad('成熟领域被误判为新兴');
  else ok('成熟领域不被误判为新兴');
} catch (e) { bad('告警单测异常: ' + e.message); }

/* ---------- 6. 并发限流器单测（防止死锁回归）---------- */
section('6. 并发限流器单测');
const limiterTest = new Promise(resolve => {
  try {
    const { makeLimiter } = require(path.join(ROOT, 'engine/sources/_http'));
    const lim = makeLimiter(2);
    let done = 0;
    for (let i = 0; i < 6; i++) {
      lim(release => setTimeout(() => { done++; release(); }, 5));
    }
    setTimeout(() => resolve(done), 300);
  } catch (e) { resolve(-1); console.log('  ❌ 限流器单测异常: ' + e.message); }
});

// 等限流器单测完成后再继续（它有 300ms 定时器）
limiterTest.then(result => {
  if (result >= 6) { ok('限流器: 6/6 任务全部完成（槽位正确释放）'); }
  else if (result >= 0) { bad('限流器死锁: 仅 ' + result + '/6 完成（槽位未释放）'); }

  /* ---------- 7. (可选) 真实采集管线 ---------- */
  if (FULL) {
    section('7. 真实采集管线 (--full)');
    try {
      execSync('node "' + path.join(ROOT, 'engine/run.js') + '"', { stdio: 'pipe', cwd: ROOT, timeout: 180000 });
      const latest = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine/output/latest.json'), 'utf8'));
      ok('真实管线完成, mode=' + latest.mode);
      ok('产出 ' + latest.domains.length + ' 领域');
    } catch (e) { bad('真实管线失败(可能网络): ' + (e.stderr ? e.stderr.toString().trim().slice(0, 200) : e.message)); }
  }

  /* ---------- 汇总 ---------- */
  console.log('\n' + '═'.repeat(50));
  console.log('  通过 ' + passed + ' · 失败 ' + failed);
  console.log('═'.repeat(50));
  process.exit(failed ? 1 : 0);
});
