/* ============================================================================
 * 告警检测  (alerts.js)
 * 基于阈值识别三类异动：趋势异动 / 爆发激增 / 新兴机会
 *   - 趋势异动：评分单轮变化超过阈值
 *   - 爆发激增：二阶加速度（accel.accelerations）显著为正
 *   - 新兴机会：用"静态成熟度锚点"判断是否真·早期，而非动态 adoption
 *     （动态 adoption 常被锚点校准压低，会把成熟领域误判成新兴）
 * ============================================================================ */
'use strict';
const { ALERTS, ANCHORS } = require('./config');

function detect(curr, accel) {
  const alerts = [];
  if (!accel || !accel.deltas) return alerts;

  const deltas = accel.deltas;
  const deltaMap = {};
  deltas.forEach(d => { deltaMap[d.id] = d; });
  const accMap = {};
  (accel.accelerations || []).forEach(a => { accMap[a.id] = a.accel; });
  const currMap = {};
  curr.domains.forEach(d => { currMap[d.id] = d; });

  // 1. 趋势异动：评分单轮变化超过阈值
  deltas.forEach(d => {
    if (Math.abs(d.scoreDelta) >= ALERTS.scoreDelta) {
      alerts.push({
        type: d.scoreDelta > 0 ? 'surge' : 'drop',
        severity: Math.abs(d.scoreDelta) >= 20 ? 'high' : 'medium',
        domainId: d.id, domain: d.name,
        message: `${d.name} 评分${d.scoreDelta > 0 ? '跃升' : '下滑'} ${Math.abs(d.scoreDelta).toFixed(1)} 分（${d.prevScore == null ? '—' : d.prevScore}→${d.currScore.toFixed(0)}）`,
        value: d.scoreDelta
      });
    }
  });

  // 2. 爆发激增：二阶加速度为正且靠前（加速的加速 = 真正在爆发）
  //    只有存在 accelerations（≥3 个快照）时才触发，避免首轮噪声
  const posAccel = (accel.accelerations || [])
    .filter(a => a.accel != null && a.accel > 0)
    .sort((a, b) => b.accel - a.accel);
  posAccel.slice(0, 3).forEach(a => {
    if (a.accel >= ALERTS.speedSurge * 6) { // 二阶阈值（量级按实测调）
      alerts.push({
        type: 'explosive',
        severity: 'medium',
        domainId: a.id, domain: a.name,
        message: `${a.name} 进入加速通道（二阶加速度 +${a.accel.toFixed(1)}）`,
        value: a.accel
      });
    }
  });

  // 3. 新兴机会：用静态锚点 baseline 判断"是否真·早期领域"
  //    baseline 低 = 该领域整体仍处早期（人共识），而非动态 adoption 被压低。
  //    且要求评分确实在涨（scoreDelta > 阈值），才算"正在冒头"。
  const candidates = deltas
    .map(d => {
      const A = ANCHORS[d.id] || { baseline: 50 };
      return { d, baseline: A.baseline, scoreDelta: d.scoreDelta };
    })
    .filter(x => x.baseline <= 45 && x.scoreDelta > 2) // 真早期 + 确实在涨
    .sort((a, b) => b.scoreDelta - a.scoreDelta)
    .slice(0, 3);
  candidates.forEach(c => {
    alerts.push({
      type: 'emerging',
      severity: 'low',
      domainId: c.d.id, domain: c.d.name,
      message: `🆕 新兴信号：${c.d.name}（基准 ${c.baseline}，仍处早期）评分 +${c.scoreDelta.toFixed(1)}，值得早期关注`,
      value: c.scoreDelta
    });
  });

  return alerts.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
}

module.exports = { detect };
