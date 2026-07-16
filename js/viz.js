/* ============================================================================
 * AI 扩张分析 · 可视化层  (viz.js)
 * 纯原生 Canvas + DOM 渲染，无任何外部依赖
 *   - renderBubble()    介入深度 × 采用率 气泡扩张图
 *   - renderLadder()    AI 介入五级阶梯
 *   - renderHeatmap()   领域 × 维度 渗透热力图
 *   - renderTimeline()  2018→2027 能力/广度/自治 曲线
 *   - renderSpark()     KPI 卡迷你折线
 * ============================================================================ */
window.VIZ = (function () {
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  let tooltipEl;

  /* ---------- 工具：tooltip ------------------------------------------------ */
  function tip() {
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip';
      document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
  }
  function showTip(html, x, y) {
    const t = tip();
    t.innerHTML = html;
    t.classList.add('show');
    const pad = 14;
    let left = x + pad, top = y + pad;
    const r = t.getBoundingClientRect();
    if (left + r.width > window.innerWidth - 8) left = x - r.width - pad;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - pad;
    t.style.left = left + 'px';
    t.style.top = top + 'px';
  }
  function hideTip() { if (tooltipEl) tooltipEl.classList.remove('show'); }

  /* ---------- 颜色：按 penetration 映射到阶梯色 ---------------------------- */
  function levelColor(pen) {
    const L = AIDATA.LEVELS;
    const idx = Math.min(L.length - 1, Math.floor(pen / 100 * L.length));
    return L[idx].color;
  }
  function levelOf(pen) {
    const L = AIDATA.LEVELS;
    return L[Math.min(L.length - 1, Math.floor(pen / 100 * L.length))];
  }
  /* 热力色：0-100 -> 深蓝->青->黄->橙->红 */
  function heatColor(v) {
    v = Math.max(0, Math.min(100, v));
    const stops = [
      [0,   [28, 40, 69]],
      [25,  [57, 192, 160]],
      [50,  [245, 181, 74]],
      [75,  [240, 114, 60]],
      [100, [224, 85, 107]]
    ];
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      if (v >= a && v <= b) {
        const t = (v - a) / (b - a);
        const c = ca.map((ch, k) => Math.round(ch + (cb[k] - ch) * t));
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    }
    return 'rgb(28,40,69)';
  }

  /* ======================================================================
   * 1. 气泡扩张图  (介入深度 × 采用率，气泡大小=市场规模，颜色=阶梯)
   * ==================================================================== */

  /* 气泡图的轴/网格/象限标注（抽出便于动画帧重绘）*/
  function drawAxes(ctx, W, H, pad, pw, ph) {
    ctx.strokeStyle = 'rgba(36,49,84,.6)';
    ctx.lineWidth = 1; ctx.font = '11px ' + mono(); ctx.fillStyle = '#647196';
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + ph * i / 5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((100 - i * 20) + '', pad.l - 8, y);
    }
    for (let i = 0; i <= 5; i++) {
      const x = pad.l + pw * i / 5;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText((i * 20) + '', x, H - pad.b + 8);
    }
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(91,141,239,.35)';
    ctx.beginPath(); ctx.moveTo(pad.l + pw * .5, pad.t); ctx.lineTo(pad.l + pw * .5, H - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ph * .5); ctx.lineTo(W - pad.r, pad.t + ph * .5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#9aa6c4'; ctx.font = '600 12px ' + sans();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('采用率 / 普及度  →', pad.l + pw / 2, H - 6);
    ctx.save(); ctx.translate(16, pad.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('← 介入深度 / 渗透率', 0, 0); ctx.restore();
    ctx.font = '600 11px ' + mono(); ctx.fillStyle = 'rgba(154,166,196,.55)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('◆ 自主化前沿', pad.l + 8, pad.t + 6);
    ctx.textAlign = 'right'; ctx.fillText('高度自治 ◆', W - pad.r - 8, pad.t + 6);
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText('◇ 起步探索', pad.l + 8, H - pad.b - 6);
    ctx.textAlign = 'right'; ctx.fillText('◇ 深度嵌入', W - pad.r - 8, H - pad.b - 6);
  }

  /* 画单个气泡（scale 用于入场动画 0.3→1）*/
  function drawBubble(ctx, p, scale) {
    scale = scale == null ? 1 : scale;
    const r = p.r * scale;
    const c = levelColor(p.d.penetration);
    const g = ctx.createRadialGradient(p.x, p.y, r * .2, p.x, p.y, r * 1.5);
    g.addColorStop(0, hexA(c, .55)); g.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = hexA(c, .82); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexA(c, .95); ctx.lineWidth = 1.5; ctx.stroke();
    if (scale > 0.7) {
      ctx.fillStyle = '#e8edf7'; ctx.font = '600 11px ' + sans();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = (scale - 0.7) / 0.3;
      ctx.fillText(p.d.name, p.x, p.y - r - 9);
      ctx.globalAlpha = 1;
    }
  }

  function renderBubble(canvas, domains, opts) {
    opts = opts || {};
    const onPick = opts.onPick || function () {};
    const filter = opts.filter || function () { return true; };
    const list = domains.filter(filter);

    const ctx = setupCanvas(canvas, 760, 480);
    const W = canvas._w, H = canvas._h;
    const pad = { l: 56, r: 24, t: 24, b: 46 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

    drawAxes(ctx, W, H, pad, pw, ph);

    // 气泡（带简单避让）
    const pts = list.map(d => {
      const x = pad.l + pw * (d.adoption / 100);
      const y = pad.t + ph * (1 - d.penetration / 100);
      const r = 8 + Math.sqrt(d.market) * 1.7;
      return { d, x, y, r };
    });
    resolveOverlap(pts, pad, W, H);

    pts.forEach(p => {
      drawBubble(ctx, p, 1);
    });

    // 入场动画：气泡从 scale 0.3 弹到 1（一次性，~500ms）
    if (!opts._noAnim && !canvas._animated) {
      canvas._animated = true;
      const start = performance.now();
      const DUR = 500;
      const ease = t => 1 - Math.pow(1 - t, 3); // easeOutCubic
      (function frame(now) {
        const t = Math.min(1, (now - start) / DUR);
        const s = 0.3 + 0.7 * ease(t);
        // 重绘：先清回轴底，再按当前 scale 画气泡
        ctx.clearRect(0, 0, W, H);
        drawAxes(ctx, W, H, pad, pw, ph);
        pts.forEach(p => drawBubble(ctx, p, s));
        if (t < 1) requestAnimationFrame(frame);
      })(start);
    }

    // 交互
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      let hit = null;
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        if (Math.hypot(mx - p.x, my - p.y) <= p.r + 2) { hit = p; break; }
      }
      if (hit) {
        canvas.style.cursor = 'pointer';
        const lv = levelOf(hit.d.penetration);
        const sp = AIDATA.SPEED[hit.d.speed];
        showTip(
          `<div class="tt-title">${hit.d.icon} ${hit.d.name}</div>
           <div class="tt-line">介入深度 <b style="color:${lv.color}">${hit.d.penetration}</b> · 采用率 <b>${hit.d.adoption}</b></div>
           <div class="tt-line">阶段：${lv.name} · 扩张：${sp.label}</div>
           <div class="tt-line">成熟度 ${'★'.repeat(hit.d.maturity)}${'☆'.repeat(5 - hit.d.maturity)} · 风险 ${hit.d.risk}</div>
           <div class="tt-line" style="margin-top:4px;color:#647196">点击查看详情 →</div>`,
          e.clientX, e.clientY
        );
      } else { canvas.style.cursor = 'crosshair'; hideTip(); }
    };
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        if (Math.hypot(mx - p.x, my - p.y) <= p.r + 2) { onPick(p.d); return; }
      }
    };
    canvas.onmouseleave = () => { hideTip(); };
  }

  /* 气泡重叠缓解（轻微推开），保证标签可读 */
  function resolveOverlap(pts, pad, W, H) {
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const minDist = a.r + b.r + 6;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const ux = dx / dist, uy = dy / dist;
            a.x -= ux * push * .6; a.y -= uy * push * .6;
            b.x += ux * push * .6; b.y += uy * push * .6;
            moved = true;
          }
        }
      }
      // 边界约束
      pts.forEach(p => {
        p.x = Math.max(pad.l + p.r, Math.min(W - pad.r - p.r, p.x));
        p.y = Math.max(pad.t + p.r + 12, Math.min(H - pad.b - p.r, p.y));
      });
      if (!moved) break;
    }
  }

  /* ======================================================================
   * 2. 介入阶梯
   * ==================================================================== */
  function renderLadder(container, domains) {
    const counts = AIDATA.LEVELS.map(l => ({ level: l, items: [] }));
    domains.forEach(d => {
      const lv = levelOf(d.penetration);
      const bucket = counts.find(c => c.level.id === lv.id);
      if (bucket) bucket.items.push(d);
    });
    container.innerHTML = '';
    counts.forEach(c => {
      const el = document.createElement('div');
      el.className = 'ladder-step';
      el.innerHTML = `
        <div class="bar" style="background:${c.level.color}"></div>
        <div class="lv" style="color:${c.level.color}">L${c.level.id}</div>
        <div class="body">
          <div class="name">${c.level.name}</div>
          <div class="desc">${c.level.desc}</div>
        </div>
        <div class="count">${c.items.length} 领域</div>`;
      el.addEventListener('mouseenter', e => {
        if (c.items.length) {
          showTip(`<div class="tt-title" style="color:${c.level.color}">L${c.level.id} · ${c.level.name}</div>
                   <div class="tt-line">${c.items.map(i => i.icon + ' ' + i.name).join('、')}</div>`,
            e.clientX, e.clientY);
        }
      });
      el.addEventListener('mousemove', e => {
        if (c.items.length) showTip(`<div class="tt-title" style="color:${c.level.color}">L${c.level.id} · ${c.level.name}</div>
                   <div class="tt-line">${c.items.map(i => i.icon + ' ' + i.name).join('、')}</div>`,
            e.clientX, e.clientY);
      });
      el.addEventListener('mouseleave', () => hideTip());
      container.appendChild(el);
    });
  }

  /* ======================================================================
   * 3. 热力图：领域 × [介入深度, 采用率, 成熟度, 扩张速度, 自主倾向]
   * ==================================================================== */
  function renderHeatmap(container, domains) {
    const speedScore = { explosive: 95, fast: 75, steady: 55, slow: 30 };
    const cols = [
      { key: 'penetration', label: '介入深度' },
      { key: 'adoption',    label: '采用率' },
      { key: 'maturity',    label: '成熟度', map: v => v / 5 * 100 },
      { key: 'speed',       label: '扩张速度', map: d => speedScore[d.speed] },
      { key: 'autonomy',    label: '自主倾向', map: d => Math.min(100, d.penetration * 0.7 + (d.maturity - 2) * 12) }
    ];
    const sorted = [...domains].sort((a, b) => b.penetration - a.penetration);

    let html = '<table id="heatmap"><thead><tr><th></th>';
    cols.forEach(c => html += `<th>${c.label}</th>`);
    html += '</tr></thead><tbody>';
    sorted.forEach(d => {
      html += `<tr><td class="dom">${d.icon} ${d.name}</td>`;
      cols.forEach(c => {
        const raw = c.map ? c.map(d) : d[c.key];
        const v = Math.round(raw);
        html += `<td class="cell" style="background:${heatColor(v)}" data-id="${d.id}" data-col="${c.key}" data-val="${v}">${v}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    // 预建查找表，避免每次鼠标事件都遍历 domains/cols
    const domainById = {};
    domains.forEach(d => { domainById[d.id] = d; });
    const colLabelByKey = {};
    cols.forEach(c => { colLabelByKey[c.key] = c.label; });

    container.querySelectorAll('.cell').forEach(cell => {
      const d = domainById[cell.dataset.id];
      const label = colLabelByKey[cell.dataset.col];
      const tipHtml = () => `<div class="tt-title">${d && d.icon ? d.icon : ''} ${d ? d.name : ''}</div>
                 <div class="tt-line">${label}: <b>${cell.dataset.val}</b></div>`;
      cell.addEventListener('mouseenter', e => showTip(tipHtml(), e.clientX, e.clientY));
      cell.addEventListener('mousemove', e => showTip(tipHtml(), e.clientX, e.clientY));
      cell.addEventListener('mouseleave', () => hideTip());
    });
  }
  // 支持 onPick 回调
  function renderHeatmapPick(container, domains, onPick) {
    renderHeatmap(container, domains);
    container.querySelectorAll('.cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const d = domains.find(x => x.id === cell.dataset.id);
        if (d) onPick(d);
      });
    });
  }

  /* ======================================================================
   * 4. 时间轴曲线：能力 / 广度 / 自治 三条线
   * ==================================================================== */
  function renderTimeline(canvas, timeline) {
    const ctx = setupCanvas(canvas, 900, 340);
    const W = canvas._w, H = canvas._h;
    const pad = { l: 44, r: 24, t: 20, b: 40 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const years = timeline.map(t => t.year);
    const yMin = Math.min(...years), yMax = Math.max(...years);
    const xAt = yr => pad.l + pw * (yr - yMin) / (yMax - yMin);
    const yAt = v => pad.t + ph * (1 - v / 100);

    // 网格
    ctx.strokeStyle = 'rgba(36,49,84,.5)'; ctx.lineWidth = 1;
    ctx.font = '11px ' + mono(); ctx.fillStyle = '#647196';
    for (let i = 0; i <= 5; i++) {
      const y = pad.t + ph * i / 5;
      ctx.beginPath(); ctx.setLineDash([2, 4]); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((100 - i * 20) + '', pad.l - 8, y);
    }
    // x 轴年份
    timeline.forEach(t => {
      const x = xAt(t.year);
      ctx.strokeStyle = 'rgba(36,49,84,.4)';
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, H - pad.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = t.year === 2026 ? '#f5b54a' : '#647196';
      ctx.font = (t.year === 2026 ? '700 ' : '') + '11px ' + mono();
      ctx.fillText(t.year + (t.year > 2026 ? '*' : ''), x, H - pad.b + 8);
    });

    // "当下"竖线高亮
    const xNow = xAt(2026);
    ctx.strokeStyle = 'rgba(245,181,74,.5)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(xNow, pad.t); ctx.lineTo(xNow, H - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245,181,74,.9)'; ctx.font = '700 10px ' + mono();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('当下', xNow, pad.t - 4);

    // 三条曲线
    const series = [
      { key: 'capability', label: '模型能力', color: '#5b8def', fill: 'rgba(91,141,239,.12)' },
      { key: 'breadth',    label: '应用广度', color: '#39c0a0', fill: 'rgba(57,192,160,.10)' },
      { key: 'autonomy',   label: '自治代理', color: '#f0723c', fill: 'rgba(240,114,60,.10)' }
    ];
    series.forEach(s => {
      // 填充
      ctx.beginPath();
      timeline.forEach((t, i) => {
        const x = xAt(t.year), y = yAt(t[s.key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.lineTo(xAt(yMax), H - pad.b); ctx.lineTo(xAt(yMin), H - pad.b); ctx.closePath();
      ctx.fillStyle = s.fill; ctx.fill();
      // 线
      ctx.beginPath();
      timeline.forEach((t, i) => {
        const x = xAt(t.year), y = yAt(t[s.key]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.stroke();
      // 点
      timeline.forEach(t => {
        const x = xAt(t.year), y = yAt(t[s.key]);
        ctx.fillStyle = '#0f1626'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
      });
    });

    // 交互：悬停显示该年详情
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      let best = null, bestDx = Infinity;
      timeline.forEach(t => {
        const dx = Math.abs(xAt(t.year) - mx);
        if (dx < bestDx) { bestDx = dx; best = t; }
      });
      if (best && bestDx < pw / years.length) {
        canvas.style.cursor = 'pointer';
        showTip(`<div class="tt-title">${best.year}${best.year > 2026 ? '（预测）' : ''}</div>
                 <div class="tt-line"><span style="color:#5b8def">●</span> 模型能力 <b>${best.capability}</b></div>
                 <div class="tt-line"><span style="color:#39c0a0">●</span> 应用广度 <b>${best.breadth}</b></div>
                 <div class="tt-line"><span style="color:#f0723c">●</span> 自治代理 <b>${best.autonomy}</b></div>
                 <div class="tt-line" style="margin-top:4px">${best.note}</div>`,
          e.clientX, e.clientY);
      } else { canvas.style.cursor = 'default'; hideTip(); }
    };
    canvas.onmouseleave = () => hideTip();
  }

  /* ======================================================================
   * 5. KPI 迷你折线 (sparkline)
   * ==================================================================== */
  function renderSpark(canvas, values, color) {
    const ctx = setupCanvas(canvas, 90, 34);
    const W = canvas._w, H = canvas._h;
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * (W - 4) + 2;
      const y = H - 4 - ((v - min) / range) * (H - 8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    // 填充
    ctx.lineTo(W - 2, H - 2); ctx.lineTo(2, H - 2); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hexA(color, .35)); g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g; ctx.fill();
    // 线
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * (W - 4) + 2;
      const y = H - 4 - ((v - min) / range) * (H - 8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
  }

  /* ======================================================================
   * 6. 领域扩张曲线对比（详情抽屉内用）
   * ==================================================================== */
  function renderDomainCurves(canvas, curves, domains) {
    const ctx = setupCanvas(canvas, 460, 200);
    const W = canvas._w, H = canvas._h;
    const pad = { l: 36, r: 16, t: 14, b: 28 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const years = AIDATA.TIMELINE.map(t => t.year);
    const palette = ['#5b8def', '#39c0a0', '#f5b54a', '#f0723c', '#e0556b', '#9b7bf0'];
    // 网格
    ctx.strokeStyle = 'rgba(36,49,84,.5)'; ctx.fillStyle = '#647196'; ctx.font = '10px ' + mono();
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ph * i / 4;
      ctx.beginPath(); ctx.setLineDash([2, 3]); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.setLineDash([]); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((100 - i * 25) + '', pad.l - 6, y);
    }
    years.forEach((yr, i) => {
      if (i % 2 === 0) {
        const x = pad.l + pw * i / (years.length - 1);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(yr + (yr > 2026 ? '*' : ''), x, H - pad.b + 6);
      }
    });
    curves.forEach((c, idx) => {
      const d = domains.find(x => x.id === c.id);
      const color = palette[idx % palette.length];
      ctx.beginPath();
      c.values.forEach((v, i) => {
        const x = pad.l + pw * i / (c.values.length - 1);
        const y = pad.t + ph * (1 - v / 100);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      // 末点标签
      const last = c.values[c.values.length - 1];
      const lx = pad.l + pw, ly = pad.t + ph * (1 - last / 100);
      ctx.fillStyle = color; ctx.font = '600 10px ' + sans();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(d ? d.name : c.id, lx - 4, ly - 8);
    });
  }

  /* ---------- 画布工具 ----------------------------------------------------- */
  function setupCanvas(canvas, cssW, cssH) {
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || cssW;
    canvas.width = w * DPR; canvas.height = cssH * DPR;
    canvas.style.height = cssH + 'px';
    canvas._w = w; canvas._h = cssH;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    return ctx;
  }
  function mono() { return "'JetBrains Mono','SF Mono',Consolas,monospace"; }
  function sans() { return "-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"; }
  function hexA(hex, a) {
    if (hex.startsWith('rgb')) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  /* ======================================================================
   * 7. 新兴雷达图：采用率 × 增速，四象限标出"明星/新兴/停滞/成熟"
   * ==================================================================== */
  function renderRadar(canvas, domains, accel, onPick) {
    const ctx = setupCanvas(canvas, 460, 360);
    const W = canvas._w, H = canvas._h;
    const pad = { l: 50, r: 20, t: 24, b: 46 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

    const deltaMap = {};
    (accel && accel.deltas ? accel.deltas : []).forEach(d => { deltaMap[d.id] = d.scoreDelta; });
    const hasDelta = Object.keys(deltaMap).length > 0;
    const yMetric = hasDelta ? '增速(评分变化)' : '综合分';

    // 网格
    ctx.strokeStyle = 'rgba(36,49,84,.5)'; ctx.lineWidth = 1;
    ctx.font = '11px ' + mono(); ctx.fillStyle = '#647196';
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ph * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((100 - i * 25) + '', pad.l - 8, y);
    }
    for (let i = 0; i <= 4; i++) {
      const x = pad.l + pw * i / 4;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText((i * 25) + '', x, H - pad.b + 8);
    }
    // 象限分割
    ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(91,141,239,.3)';
    ctx.beginPath(); ctx.moveTo(pad.l + pw * .5, pad.t); ctx.lineTo(pad.l + pw * .5, H - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t + ph * .5); ctx.lineTo(W - pad.r, pad.t + ph * .5); ctx.stroke();
    ctx.setLineDash([]);
    // 象限标签
    ctx.font = '600 10px ' + mono(); ctx.fillStyle = 'rgba(154,166,196,.5)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('★ 明星领域', pad.l + 8, pad.t + 6);
    ctx.textAlign = 'right';
    ctx.fillText('成熟稳定', W - pad.r - 8, pad.t + 6);
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText('🆕 新兴机会', pad.l + 8, H - pad.b - 6);
    ctx.textAlign = 'right';
    ctx.fillText('停滞', W - pad.r - 8, H - pad.b - 6);
    // 轴标签
    ctx.fillStyle = '#9aa6c4'; ctx.font = '600 12px ' + sans();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('采用率 →', pad.l + pw / 2, H - 6);
    ctx.save(); ctx.translate(16, pad.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText('← ' + yMetric, 0, 0); ctx.restore();

    // 点：纵轴用增速(delta)若有，否则回退到 score（保证雷达图任何情况都有意义）
    const pts = [];
    domains.forEach(d => {
      const delta = deltaMap[d.id];
      // 有 delta 时 y=增速(中线50±delta)；无 delta 时 y=综合分，避免全部塌缩到中线
      const yv = hasDelta
        ? Math.max(0, Math.min(100, 50 + (delta || 0) * 2))
        : Math.max(0, Math.min(100, d.score != null ? d.score : d.penetration));
      const x = pad.l + pw * (d.adoption / 100);
      const y = pad.t + ph * (1 - yv / 100);
      pts.push({ d, x, y, delta: delta || 0 });
    });
    pts.forEach(p => {
      // 新兴判定：有 delta 时看增速；无 delta 时回退看 score 上升趋势无法判断，用低采用+高介入
      const isEmerging = hasDelta
        ? (p.d.adoption < 45 && p.delta > 2)
        : (p.d.adoption < 45 && p.d.score >= 50);
      const c = isEmerging ? '#39c0a0' : levelColor(p.d.penetration);
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 10);
      g.addColorStop(0, hexA(c, .9)); g.addColorStop(1, hexA(c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hexA(c, .95); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
      if (isEmerging) {
        ctx.fillStyle = '#5fe0bd'; ctx.font = '600 10px ' + sans();
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(p.d.name, p.x, p.y - 7);
      }
    });
    // 交互
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      const hit = pts.find(p => Math.hypot(mx - p.x, my - p.y) < 12);
      if (hit) {
        canvas.style.cursor = 'pointer';
        showTip(`<div class="tt-title">${hit.d.icon} ${hit.d.name}</div>
                 <div class="tt-line">采用率 <b>${hit.d.adoption}</b> · 评分变化 <b style="color:${hit.delta >= 0 ? '#39c0a0' : '#e0556b'}">${hit.delta >= 0 ? '+' : ''}${hit.delta.toFixed(1)}</b></div>`, e.clientX, e.clientY);
      } else { canvas.style.cursor = 'default'; hideTip(); }
    };
    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (W / rect.width);
      const my = (e.clientY - rect.top) * (H / rect.height);
      const hit = pts.find(p => Math.hypot(mx - p.x, my - p.y) < 12);
      if (hit && onPick) onPick(hit.d);
    };
    canvas.onmouseleave = () => hideTip();
  }

  /* ======================================================================
   * 8. 趋势外推：用历史 score 序列拟合，预测下一阶段
   *    轻量最小二乘线性拟合 + 指数趋势对比，不引依赖
   * ==================================================================== */
  function renderForecast(canvas, replay, domains) {
    const ctx = setupCanvas(canvas, 460, 220);
    const W = canvas._w, H = canvas._h;
    const pad = { l: 36, r: 90, t: 14, b: 28 }; // 右边留宽给标签
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

    // 用 FORECAST 引擎批量预测，取近期变化最大的 top-4
    const candidates = window.FORECAST.forecastAll(replay, domains, 4);
    if (!candidates.length) return;

    // 所有候选者共享同一时间轴（来自 replay.timeline），统一计算 x 坐标
    const n0 = candidates[0].points.length;
    const horizon = candidates[0].fit.predictions.length;
    const totalSteps = n0 + horizon;
    const xAt = i => pad.l + pw * i / (totalSteps - 1);
    const yAt = v => pad.t + ph * (1 - Math.max(0, Math.min(100, v)) / 100);

    // 网格
    ctx.strokeStyle = 'rgba(36,49,84,.5)'; ctx.fillStyle = '#647196'; ctx.font = '10px ' + mono();
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + ph * i / 4;
      ctx.beginPath(); ctx.setLineDash([2, 3]); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
      ctx.setLineDash([]); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText((100 - i * 25) + '', pad.l - 6, y);
    }

    const palette = ['#5b8def', '#39c0a0', '#f5b54a', '#f0723c'];
    candidates.forEach((c, idx) => {
      const color = palette[idx % palette.length];
      const fit = c.fit, trend = c.trend;
      const n = c.points.length;

      // 置信带（半透明填充）
      ctx.beginPath();
      fit.predictions.forEach((p, i) => {
        const x = xAt(n + i), yU = yAt(fit.confidenceBand[i].upper);
        if (i === 0) { // 从历史末点开始
          ctx.moveTo(xAt(n - 1), yAt(fit.lastValue));
          ctx.lineTo(x, yU);
        } else ctx.lineTo(x, yU);
      });
      for (let i = horizon - 1; i >= 0; i--) {
        ctx.lineTo(xAt(n + i), yAt(fit.confidenceBand[i].lower));
      }
      ctx.lineTo(xAt(n - 1), yAt(fit.lastValue));
      ctx.closePath();
      ctx.fillStyle = hexA(color, 0.1); ctx.fill();

      // 历史段（实线，用平滑后的值若有异常点）
      ctx.beginPath();
      const histVals = fit.smoothedValues.length ? fit.smoothedValues : c.points.map(p => p.score);
      histVals.forEach((v, i) => {
        const x = xAt(i), y = yAt(v);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();

      // 预测段（虚线）
      ctx.beginPath(); ctx.setLineDash([4, 4]);
      ctx.moveTo(xAt(n - 1), yAt(fit.lastValue));
      fit.predictions.forEach((p, i) => {
        ctx.lineTo(xAt(n + i), yAt(p));
      });
      ctx.stroke(); ctx.setLineDash([]);

      // 标注异常点（小叉号）
      if (fit.outliers && fit.outliers.length) {
        fit.outliers.forEach(oi => {
          if (oi < n) {
            ctx.strokeStyle = '#e0556b'; ctx.lineWidth = 1;
            const x = xAt(oi), y = yAt(c.points[oi].score);
            ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
          }
        });
      }

      // 末点标签：领域名 + 趋势 + 可信度
      const lastPred = fit.predictions[fit.predictions.length - 1];
      const lx = xAt(n + horizon - 1), ly = yAt(lastPred);
      ctx.fillStyle = color; ctx.font = '600 10px ' + sans();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const qIcon = fit.quality === 'high' ? '●' : fit.quality === 'medium' ? '◐' : '○';
      ctx.fillText(c.name + ' ' + trend.label + qIcon, lx + 4, ly);
      // 预测值
      ctx.fillStyle = '#647196'; ctx.font = '10px ' + mono();
      ctx.fillText('→' + lastPred.toFixed(0), lx + 4, ly + 12);
    });

    // "现在"分界线
    const xNow = xAt(n0 - 1);
    ctx.strokeStyle = 'rgba(245,181,74,.4)'; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(xNow, pad.t); ctx.lineTo(xNow, H - pad.b); ctx.stroke();
    ctx.setLineDash([]);
    // 图例
    ctx.fillStyle = 'rgba(245,181,74,.8)'; ctx.font = '600 9px ' + mono();
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('现在', xNow, pad.t - 2);
  }

  return {
    renderBubble,
    renderLadder,
    renderHeatmap: renderHeatmapPick,
    renderTimeline,
    renderSpark,
    renderDomainCurves,
    renderRadar,
    renderForecast,
    levelColor, levelOf, heatColor,
    hideTip
  };
})();
