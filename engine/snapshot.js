/* ============================================================================
 * 快照存储  (snapshot.js)
 * 每轮评估产出一份带时间戳的快照 JSON，落盘到 snapshots/
 * 支持：列表、读取、加速度(二阶变化)计算、历史回放数据组装
 * ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const SNAP_DIR = path.join(__dirname, 'snapshots');

function ensureDir() {
  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
}

/* 文件名：snapshot-YYYYMMDD-HHmmss.json
 * 精确到秒，避免短时间多次运行互相覆盖；同名再加序号兜底 */
function stampName(d) {
  d = d || new Date();
  const p = n => String(n).padStart(2, '0');
  let base = `snapshot-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  let name = base + '.json';
  let i = 2;
  while (fs.existsSync(path.join(SNAP_DIR, name))) {
    name = `${base}-${i}.json`; i++;
  }
  return name;
}

function save(snapshot) {
  ensureDir();
  const file = path.join(SNAP_DIR, stampName());
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), 'utf8');
  return file;
}

function list() {
  ensureDir();
  return fs.readdirSync(SNAP_DIR)
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
    .sort();
}

function readLatest() {
  const files = list();
  if (!files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, files[files.length - 1]), 'utf8'));
}

function readPrev() {
  const files = list();
  if (files.length < 2) return null;
  return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, files[files.length - 2]), 'utf8'));
}

function readPrevPrev() {
  const files = list();
  if (files.length < 3) return null;
  return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, files[files.length - 3]), 'utf8'));
}

function readByIndex(idx) {
  const files = list();
  if (idx < 0 || idx >= files.length) return null;
  return JSON.parse(fs.readFileSync(path.join(SNAP_DIR, files[idx]), 'utf8'));
}

/* 加速度：对比上一轮算一阶 delta；若还有上上轮，再算二阶加速度（delta 的变化）*/
function computeAcceleration(curr, prev, prevPrev) {
  if (!prev || !prev.domains) return { deltas: [], accelerations: [] };
  const prevMap = {};
  prev.domains.forEach(d => { prevMap[d.id] = d; });
  const prevPrevMap = {};
  if (prevPrev && prevPrev.domains) prevPrev.domains.forEach(d => { prevPrevMap[d.id] = d; });

  const deltas = curr.domains.map(d => {
    const p = prevMap[d.id];
    const scoreDelta = p ? d.score - p.score : 0;
    const speedDelta = p ? d.speedScore - (p.speedScore != null ? p.speedScore : p.speed) : 0;
    return {
      id: d.id,
      name: d.name,
      scoreDelta: scoreDelta,
      speedDelta: speedDelta,
      prevScore: p ? p.score : null,
      currScore: d.score
    };
  });

  // 二阶加速度：本轮 scoreDelta − 上轮 scoreDelta（speedDelta 用 score 的二阶差分近似）
  // 只有存在上上轮时才能算；否则 acceleration 留空。
  const accelerations = deltas.map(d => {
    if (!prevPrevMap[d.id]) return { id: d.id, name: d.name, accel: null };
    const pp = prevPrevMap[d.id];
    const prevScoreDelta = prevMap[d.id] ? prevMap[d.id].score - (pp.score != null ? pp.score : 0) : 0;
    return {
      id: d.id,
      name: d.name,
      accel: d.scoreDelta - prevScoreDelta  // 二阶：delta 的变化
    };
  }).filter(a => a.accel !== null);

  return { deltas: deltas, accelerations: accelerations };
}

/* 组装历史回放数据：从所有快照抽取每个领域的各维度序列，供时间轴回放 */
function replaySeries() {
  const files = list();
  const series = {}; // domainId -> [{t, score, depth, adoption, speed, speedScore}]
  const timeline = [];
  files.forEach(f => {
    const snap = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8'));
    timeline.push({ ts: snap.ts, label: snap.label });
    snap.domains.forEach(d => {
      if (!series[d.id]) series[d.id] = { id: d.id, name: d.name, points: [] };
      series[d.id].points.push({
        t: snap.ts,
        score: d.score,
        depth: d.depth != null ? d.depth : d.penetration,
        adoption: d.adoption,
        speed: d.speed,
        speedScore: d.speedScore != null ? d.speedScore : null
      });
    });
  });
  return { timeline: timeline, series: Object.values(series) };
}

/* 全局平均分历史序列：每轮快照取所有领域 score 均值，供 KPI sparkline 用真实数据 */
function avgScoreHistory() {
  const files = list();
  const out = [];
  files.forEach(f => {
    let snap;
    try { snap = JSON.parse(fs.readFileSync(path.join(SNAP_DIR, f), 'utf8')); }
    catch (e) { return; }
    if (snap.domains && snap.domains.length) {
      const avg = snap.domains.reduce((s, d) => s + (d.score || 0), 0) / snap.domains.length;
      out.push(Math.round(avg * 10) / 10);
    }
  });
  return out;
}

module.exports = {
  save, list, readLatest, readPrev, readPrevPrev, readByIndex,
  computeAcceleration, replaySeries, avgScoreHistory, SNAP_DIR
};
