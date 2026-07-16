/* ============================================================================
 * AI 扩张分析 · 应用逻辑  (app.js)
 * 统计、筛选、卡片渲染、详情抽屉
 * ============================================================================ */
(function () {
  const D = AIDATA;
  let activeCategory = 'all';
  let activeSpeed = 'all';

  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => Array.from((p || document).querySelectorAll(s));

  /* ---------- 类别配色 ----------------------------------------------------- */
  const CAT_COLOR = {
    '技术': '#5b8def', '创意': '#9b7bf0', '通用': '#39c0a0', '服务': '#f5b54a',
    '生命科学': '#39c0a0', '专业服务': '#f0723c', '实体经济': '#5b8def', '公共服务': '#e0556b'
  };

  /* ---------- 初始化 ------------------------------------------------------- */
  function init() {
    renderKPI();
    renderFilters();
    renderAll();
    renderDecisionPicker();
    bindGlobal();
    // 动态数据加载完成后的重渲染（见 dynamic.js）
    document.addEventListener('aidata:updated', () => {
      renderKPI();
      renderAll();
      renderDynamicBanner();
      renderAlerts();
      renderReplaySlider();
    });
  }

  /* ---------- 动态状态横幅 ------------------------------------------------- */
  function renderDynamicBanner() {
    const bar = $('#dyn-banner');
    if (!bar) return;
    const dyn = D.DYNAMIC;
    if (!dyn) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    const isLive = dyn.mode === 'live';
    bar.className = 'dyn-banner ' + (isLive ? 'live' : 'synth');
    bar.innerHTML = `
      <span class="dyn-dot"></span>
      <b>动态评估数据</b> · ${dyn.label}
      · <span class="dyn-mode">${isLive ? '实时采集' : '合成/降级'}</span>
      · 领域 ${dyn.stats ? dyn.stats.avgPenetration : '-'}% 平均介入${dyn.alerts && dyn.alerts.length ? ` · <b style="color:#ff8a9a">${dyn.alerts.length} 条告警</b>` : ''}
      <span class="dyn-tip">由 engine/ 管线产出 · node engine/run.js 更新</span>`;
  }

  /* ---------- 告警面板 ----------------------------------------------------- */
  function renderAlerts() {
    const wrap = $('#alerts-panel');
    if (!wrap) return;
    const dyn = D.DYNAMIC;
    const alerts = (dyn && dyn.alerts) || [];
    const head = $('#alerts-head');
    if (!alerts.length) {
      wrap.style.display = 'none';
      if (head) head.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    if (head) head.style.display = '';
    const sevColor = { high: '#e0556b', medium: '#f5b54a', low: '#39c0a0' };
    const sevLabel = { high: '高', medium: '中', low: '低' };
    const typeIcon = { surge: '📈', drop: '📉', explosive: '🚀', emerging: '🆕' };
    wrap.innerHTML = alerts.map(a => `
      <div class="alert-item sev-${a.severity}">
        <span class="alert-ico">${typeIcon[a.type] || '⚠️'}</span>
        <span class="alert-sev" style="background:${sevColor[a.severity]}">${sevLabel[a.severity]}</span>
        <span class="alert-msg">${a.message}</span>
      </div>`).join('');
  }

  /* ---------- 历史回放滑块 ------------------------------------------------- */
  function renderReplaySlider() {
    const box = $('#replay-box');
    if (!box) return;
    const replay = D.REPLAY;
    if (!replay || !replay.timeline || replay.timeline.length < 2) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';
    const tl = replay.timeline;
    const slider = $('#replay-slider');
    const label = $('#replay-label');
    slider.max = tl.length - 1;
    slider.value = tl.length - 1;
    snapshotOriginals();          // 先保存当前（最新）值，供回到"当前"时恢复
    label.textContent = '当前（' + tl[tl.length - 1].label + '）';
    // 拖动时节流：避免每个像素都重绘所有 canvas（radar/forecast/bubble）
    let rt = null;
    slider.oninput = () => {
      const idx = +slider.value;
      label.textContent = (idx === tl.length - 1 ? '当前' : '回放') + '（' + tl[idx].label + '）';
      clearTimeout(rt);
      rt = setTimeout(() => applyReplay(replay, idx), 60);
    };
    // 回到当前：滑块拨到末尾并恢复最新值
    const reset = $('#replay-reset');
    if (reset) reset.onclick = () => {
      slider.value = tl.length - 1;
      label.textContent = '当前（' + tl[tl.length - 1].label + '）';
      applyReplay(replay, tl.length - 1);
    };
  }

  // 保存各领域的"最新"显示字段，回放到非末尾时点后可恢复
  let _origins = null;
  function snapshotOriginals() {
    _origins = {};
    D.DOMAINS.forEach(d => {
      _origins[d.id] = { penetration: d.penetration, adoption: d.adoption, speed: d.speed, score: d.score };
    });
  }
  // 用回放数据点覆写显示字段（气泡/卡片/热力图据此重绘）
  function applyReplay(replay, idx) {
    const map = {};
    replay.series.forEach(s => { map[s.id] = s.points[idx]; });
    D.DOMAINS.forEach(d => {
      const p = map[d.id];
      const o = _origins && _origins[d.id];
      if (p) {
        d.penetration = p.depth != null ? p.depth : (o ? o.penetration : d.penetration);
        d.adoption = p.adoption != null ? p.adoption : (o ? o.adoption : d.adoption);
        d.speed = p.speed || (o ? o.speed : d.speed);
        d.score = p.score != null ? p.score : (o ? o.score : d.score);
      } else if (o) {
        // 该时点没有此领域数据 → 恢复最新值
        d.penetration = o.penetration; d.adoption = o.adoption; d.speed = o.speed; d.score = o.score;
      }
    });
    renderAll();
  }

  /* ---------- KPI 统计 ----------------------------------------------------- */
  function renderKPI() {
    const ds = D.DOMAINS;
    const avg = k => Math.round(ds.reduce((s, d) => s + d[k], 0) / ds.length);
    const explosive = ds.filter(d => d.speed === 'explosive').length;
    const deepCnt = ds.filter(d => d.penetration >= 60).length;

    // sparkline 优先用动态管线产出的真实历史序列；无动态数据时回退到静态预设
    const hist = D.DYNAMIC && D.DYNAMIC.history ? D.DYNAMIC.history : null;
    const avgHist = hist && hist.avgScore && hist.avgScore.length >= 2 ? hist.avgScore : null;
    const avgScoreNow = Math.round(ds.reduce((s, d) => s + (d.score || avg('penetration')), 0) / ds.length);

    setKPI('k1', ds.length, '个', '已梳理 AI 应用领域', avgHist || extractCurve('breadth'));
    setKPI('k2', avg('penetration'), '%', '平均介入深度', avgHist || extractCurve('autonomy'));
    setKPI('k3', explosive, '个', '处于爆发式扩张', padSpark(avgHist ? avgHist.slice(-8) : null, explosive));
    setKPI('k4', deepCnt, '个', '已深度嵌入（≥60）', avgHist || extractDeep(ds));
  }
  // sparkline 至少需要 2 个点；不足时用当前值补齐
  function padSpark(arr, curr) {
    if (arr && arr.length >= 2) return arr;
    return [Math.max(0, (curr || 1) - 3), Math.max(0, (curr || 1) - 1), curr || 1, curr || 1];
  }
  function setKPI(id, val, unit, desc, spark) {
    $('#' + id + ' .value').innerHTML = val + '<span class="unit">' + unit + '</span>';
    $('#' + id + ' .desc').textContent = desc;
    const c = $('#' + id + ' canvas');
    if (c && spark) VIZ.renderSpark(c, spark, getComputedStyle($('#' + id + ' .value')).color);
  }
  function extractCurve(key) {
    return D.TIMELINE.map(t => t[key]);
  }
  function extractDeep(ds) {
    // 模拟深度嵌入领域逐年增长
    return [1, 2, 3, 5, 7, 9, 11, ds.filter(d => d.penetration >= 60).length];
  }

  /* ---------- 筛选条 ------------------------------------------------------- */
  function renderFilters() {
    const fcat = $('#f-cat'), fsp = $('#f-speed');
    let h = '<span class="chip active cat" data-cat="all">全部领域</span>';
    D.CATEGORIES.forEach(c => {
      const n = D.DOMAINS.filter(d => d.category === c).length;
      h += `<span class="chip cat" data-cat="${c}">${c} <b style="opacity:.6">${n}</b></span>`;
    });
    fcat.innerHTML = h;

    h = '<span class="chip active" data-sp="all">所有速度</span>';
    Object.entries(D.SPEED).forEach(([k, v]) => {
      const n = D.DOMAINS.filter(d => d.speed === k).length;
      h += `<span class="chip" data-sp="${k}">${v.label} <b style="opacity:.6">${n}</b></span>`;
    });
    fsp.innerHTML = h;

    $$('#f-cat .chip').forEach(el => el.addEventListener('click', () => {
      $$('#f-cat .chip').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      activeCategory = el.dataset.cat;
      renderAll();
    }));
    $$('#f-speed .chip').forEach(el => el.addEventListener('click', () => {
      $$('#f-speed .chip').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      activeSpeed = el.dataset.sp;
      renderAll();
    }));
  }

  /* ---------- 主渲染（受筛选影响的部分） ----------------------------------- */
  function filterFn(d) {
    if (activeCategory !== 'all' && d.category !== activeCategory) return false;
    if (activeSpeed !== 'all' && d.speed !== activeSpeed) return false;
    return true;
  }

  function renderAll() {
    const filtered = D.DOMAINS.filter(filterFn);
    // 计数
    $('#domain-count').textContent = filtered.length;
    // 图表
    VIZ.renderBubble($('#bubble'), D.DOMAINS, { onPick: openDrawer, filter: filterFn });
    VIZ.renderLadder($('#ladder'), filtered);
    VIZ.renderHeatmap($('#heatmap-wrap'), filtered, openDrawer);
    VIZ.renderTimeline($('#timeline'), D.TIMELINE);
    // 动态产出的新视角（仅有动态数据时显示）
    renderInsights(filtered);
    // 卡片
    renderDomainCards(filtered);
  }

  /* ---------- 新兴雷达 + 趋势外推 + 加速度榜（动态数据驱动）--------------- */
  function renderInsights(filtered) {
    const dyn = D.DYNAMIC;
    const accel = dyn && dyn.acceleration ? dyn.acceleration : { deltas: [], accelerations: [] };
    const hasAccel = accel.deltas && accel.deltas.length > 0;
    const replay = D.REPLAY;
    const hasReplay = replay && replay.timeline && replay.timeline.length >= 2;

    const insightRow = $('#insight-row');
    const accelPanel = $('#accel-panel');
    if (!hasAccel && !hasReplay) {
      if (insightRow) insightRow.style.display = 'none';
      if (accelPanel) accelPanel.style.display = 'none';
      return;
    }
    if (insightRow) insightRow.style.display = '';
    if (accelPanel) accelPanel.style.display = '';

    // 新兴雷达
    if ($('#radar')) VIZ.renderRadar($('#radar'), filtered, accel, openDrawer);
    // 趋势预测
    if ($('#forecast') && hasReplay) {
      VIZ.renderForecast($('#forecast'), replay, D.DOMAINS);
      renderForecastReadout(replay);
    }
    // 加速度榜
    renderAccelGrid(accel);
  }

  /* ---------- 趋势速读：列出所有领域的趋势分类汇总 ------------------------- */
  function renderForecastReadout(replay) {
    const wrap = $('#forecast-readout');
    if (!wrap || !window.FORECAST) return;
    const all = window.FORECAST.forecastAll(replay, D.DOMAINS, 99); // 全量，不截断
    // 按趋势分组
    const groups = {};
    all.forEach(c => {
      const k = c.trend.label;
      if (!groups[k]) groups[k] = [];
      groups[k].push(c);
    });
    const order = ['加速', '上升', '减速', '平稳', '回落', '下降', '转折', '数据不足'];
    let html = '<div class="fc-readout">';
    order.forEach(label => {
      if (!groups[label] || !groups[label].length) return;
      const color = groups[label][0].trend.labelColor;
      const names = groups[label].map(c => c.icon + ' ' + c.name + ' <span class="fc-slope">(' + (c.trend.nearSlope >= 0 ? '+' : '') + c.trend.nearSlope.toFixed(1) + ')</span>').join(' · ');
      html += `<div class="fc-group"><span class="fc-tag" style="background:${color}">${label}</span> <span class="fc-names">${names}</span></div>`;
    });
    html += '</div>';
    wrap.innerHTML = html;
  }

  let _lastAccelSig = '';
  function renderAccelGrid(accel) {
    const wrap = $('#accel-grid');
    if (!wrap || !accel.deltas || !accel.deltas.length) return;
    // accel 数据未变化时跳过重建（避免每次 renderAll 都重绑 18 个事件）
    const sig = accel.deltas.map(d => d.id + d.scoreDelta.toFixed(1)).join('|');
    if (sig === _lastAccelSig) return;
    _lastAccelSig = sig;
    const sorted = [...accel.deltas].sort((a, b) => b.scoreDelta - a.scoreDelta);
    const maxAbs = Math.max(1, ...sorted.map(d => Math.abs(d.scoreDelta)));
    wrap.innerHTML = sorted.map(d => {
      const pct = Math.abs(d.scoreDelta) / maxAbs * 100;
      const pos = d.scoreDelta >= 0;
      const col = pos ? '#39c0a0' : '#e0556b';
      const dom = D.DOMAINS.find(x => x.id === d.id);
      return `<div class="accel-row" data-id="${d.id}">
        <span class="accel-name">${dom ? dom.icon : ''} ${d.name}</span>
        <div class="accel-track">
          <div class="accel-bar" style="width:${pct}%;background:${col}"></div>
        </div>
        <span class="accel-val" style="color:${col}">${pos ? '+' : ''}${d.scoreDelta.toFixed(1)}</span>
      </div>`;
    }).join('');
    $$('#accel-grid .accel-row').forEach(el => el.addEventListener('click', () => {
      const d = D.DOMAINS.find(x => x.id === el.dataset.id);
      if (d) openDrawer(d);
    }));
  }

  /* ---------- 决策场景分析 ------------------------------------------------- */
  let _activeScenarioId = null;
  const _DEC_STORE = 'ai-expansion-decision-state';

  // 持久化/恢复：保存当前场景 + 推演约束到 localStorage
  function saveDecisionState() {
    try {
      const state = { activeScenarioId: _activeScenarioId, sensConstraints: _sensConstraints };
      localStorage.setItem(_DEC_STORE, JSON.stringify(state));
    } catch (e) { /* localStorage 不可用时静默 */ }
  }
  function loadDecisionState() {
    try {
      const raw = localStorage.getItem(_DEC_STORE);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.activeScenarioId && DECISIONS.SCENARIOS.find(s => s.id === state.activeScenarioId)) {
        _activeScenarioId = state.activeScenarioId;
      }
      if (state.sensConstraints && state.sensConstraints._origin === _activeScenarioId) {
        _sensConstraints = state.sensConstraints;
      }
    } catch (e) { /* 解析失败静默 */ }
  }

  function renderDecisionResult(overrideConstraints) {
    const wrap = $('#dec-result');
    if (!wrap || !window.DECIDE) return;
    const baseScenario = DECISIONS.SCENARIOS.find(s => s.id === _activeScenarioId);
    if (!baseScenario) return;
    const domain = D.DOMAINS.find(d => d.id === baseScenario.domainId);
    if (!domain) return;
    // 敏感性推演时传入修改后的约束（不污染原 scenario）
    const scenario = overrideConstraints
      ? { ...baseScenario, constraints: overrideConstraints }
      : baseScenario;

    const result = DECIDE.analyze(scenario, domain);
    if (!result) return;
    const L = AIDATA.LEVELS;
    const verdictColor = result.roi.net >= 12 ? '#39c0a0' : result.roi.net >= 6 ? '#f5b54a' : result.roi.net >= 0 ? '#f0723c' : '#e0556b';

    let html = '';

    // 场景概述
    const isModified = overrideConstraints && JSON.stringify(overrideConstraints) !== JSON.stringify(baseScenario.constraints);
    html += `<div class="dec-header">
      <div class="dec-persona">${scenario.persona}${isModified ? '<span class="dec-modified">⚡ 推演中</span>' : ''}</div>
      <div class="dec-title">${scenario.title}</div>
      <div class="dec-pain">📌 ${scenario.pain}</div>
      ${scenario.notes ? `<div class="dec-notes">💡 ${scenario.notes}</div>` : ''}
    </div>`;

    // ROI 判定
    html += `<div class="dec-verdict" style="border-color:${verdictColor}">
      <div class="dv-label">ROI 判定</div>
      <div class="dv-verdict" style="color:${verdictColor}">${result.roi.verdict}</div>
      <div class="dv-reason">${result.roi.reasoning}</div>
      <div class="dv-bars">
        <div class="dv-bar"><span>价值</span><div class="dv-track"><i style="width:${result.roi.value/25*100}%;background:#39c0a0"></i></div><b>${result.roi.value}</b></div>
        <div class="dv-bar"><span>成本</span><div class="dv-track"><i style="width:${result.roi.cost/11*100}%;background:#e0556b"></i></div><b>${result.roi.cost}</b></div>
      </div>
    </div>`;

    // 建议介入级别
    const lv = L[result.suggestedLevel] || L[0];
    html += `<div class="dec-suggest">
      <div class="ds-label">建议介入级别</div>
      <div class="ds-level">
        <span class="ds-badge" style="background:${lv.color}">L${result.suggestedLevel}</span>
        <span class="ds-name">${result.suggestedLevelName}</span>
        ${result.blockedAt ? `<span class="ds-blocked">⚠ 被约束压低（领域可达 L${scenario.provenLevel}）</span>` : ''}
      </div>
      <div class="ds-recom">${result.recommendation}</div>
      ${result.ceilingReasons.length ? `<div class="ds-reasons">${result.ceilingReasons.map(r => `<div class="ds-reason">▸ ${r}</div>`).join('')}</div>` : ''}
    </div>`;

    // 介入路径
    html += `<div class="dec-section"><h3>📍 分步实施路径</h3><div class="dec-pathway">`;
    result.pathway.forEach(step => {
      const sl = L[step.level] || L[0];
      const stColor = step.status === '已验证' ? '#39c0a0' : step.status === '当前前沿' ? '#f5b54a' : '#647196';
      html += `<div class="dp-step">
        <div class="dp-left">
          <span class="dp-badge" style="background:${sl.color}">L${step.level}</span>
          <span class="dp-stname">${step.levelName}</span>
          <span class="dp-status" style="color:${stColor}">${step.status}</span>
        </div>
        <div class="dp-right">
          <div class="dp-action">${step.action}</div>
          ${step.examples.length ? `<div class="dp-examples">参考：${step.examples.join('、')}</div>` : ''}
          <div class="dp-prereq">前置：${step.prerequisite}</div>
        </div>
      </div>`;
    });
    html += `</div></div>`;

    // 风险卡点
    if (result.blockers.length) {
      html += `<div class="dec-section"><h3>⚠ 风险卡点</h3><div class="dec-blockers">`;
      result.blockers.forEach(b => {
        const bColor = b.level === '高' ? '#e0556b' : b.level === '中' ? '#f5b54a' : '#39c0a0';
        html += `<div class="db-item" style="border-left-color:${bColor}">
          <span class="db-tag" style="background:${bColor}">${b.tag}</span>
          <span class="db-level">${b.level}</span>
          <span class="db-detail">${b.detail}</span>
        </div>`;
      });
      html += `</div></div>`;
    }

    // 约束雷达
    html += `<div class="dec-section"><h3>📊 场景约束</h3><div class="dec-constraints">`;
    const cnLabels = { budget: '预算', riskTolerance: '风险容忍', compliance: '合规', dataReadiness: '数据就绪', urgency: '紧迫性' };
    Object.entries(scenario.constraints).forEach(([k, v]) => {
      html += `<div class="dc-item">
        <span class="dc-label">${cnLabels[k]}</span>
        <div class="dc-dots">${[1,2,3,4,5].map(i => `<i class="${i <= v ? 'on' : ''}"></i>`).join('')}</div>
        <span class="dc-val">${v}/5</span>
      </div>`;
    });
    html += `</div></div>`;

    wrap.innerHTML = html;
  }

  /* ---------- 敏感性推演（滑块拖动实时重算）-------------------------------- */
  let _sensConstraints = null;  // 当前推演用的约束（null=用场景默认值）
  let _sensPrevLevel = null;    // 上次的建议级别（检测变化）
  function renderSensitivity() {
    const wrap = $('#dec-sensitivity');
    if (!wrap || !window.DECIDE) return;
    wrap.style.display = ''; // 恢复显示（对比模式可能设为 none）
    const scenario = DECISIONS.SCENARIOS.find(s => s.id === _activeScenarioId);
    if (!scenario) return;
    // 初始化或切换场景时重置为默认约束
    if (!_sensConstraints || _sensConstraints._origin !== scenario.id) {
      _sensConstraints = { ...scenario.constraints, _origin: scenario.id };
      _sensPrevLevel = null;
    }
    const c = _sensConstraints;
    const cnLabels = { budget: '预算', riskTolerance: '风险容忍', compliance: '合规', dataReadiness: '数据就绪', urgency: '紧迫性' };

    let html = '<div class="sens-header"><b>🎛️ 敏感性推演</b><span class="sens-hint">拖动滑块看建议怎么变</span>';
    html += '<button class="chip sens-reset" id="sens-reset">↺ 重置默认</button>';
    html += '<button class="chip sens-export" id="sens-export">📥 导出决策报告</button></div>';
    html += '<div class="sens-sliders">';
    ['budget', 'riskTolerance', 'compliance', 'dataReadiness', 'urgency'].forEach(k => {
      const v = c[k];
      html += `<div class="sens-row">
        <span class="sens-label">${cnLabels[k]}</span>
        <input type="range" class="sens-slider" data-key="${k}" min="1" max="5" value="${v}">
        <span class="sens-val">${v}/5</span>
      </div>`;
    });
    html += '</div>';
    html += '<div class="sens-delta" id="sens-delta"></div>';
    wrap.innerHTML = html;

    // 绑定滑块
    let st = null;
    $$('.sens-slider', wrap).forEach(sl => {
      sl.addEventListener('input', () => {
        const key = sl.dataset.key;
        const val = +sl.value;
        _sensConstraints[key] = val;
        sl.parentElement.querySelector('.sens-val').textContent = val + '/5';
        // 节流重算
        clearTimeout(st);
        st = setTimeout(() => {
          const { ...override } = _sensConstraints;
          delete override._origin;
          const domain = D.DOMAINS.find(d => d.id === scenario.domainId);
          const result = DECIDE.analyze({ ...scenario, constraints: override }, domain);
          // 检测建议级别变化
          const deltaEl = $('#sens-delta');
          if (deltaEl && result) {
            if (_sensPrevLevel !== null && _sensPrevLevel !== result.suggestedLevel) {
              const dir = result.suggestedLevel > _sensPrevLevel ? '↑' : '↓';
              const lvName = result.suggestedLevelName;
              deltaEl.innerHTML = `<span class="sens-changed">⚠ 建议级别变化：L${_sensPrevLevel} ${dir} L${result.suggestedLevel}（${lvName}）</span>`;
            } else {
              deltaEl.innerHTML = '';
            }
            _sensPrevLevel = result.suggestedLevel;
          }
          renderDecisionResult(override);
          saveDecisionState();
        }, 60);
      });
    });
    // 重置按钮
    const reset = $('#sens-reset');
    if (reset) reset.addEventListener('click', () => {
      _sensConstraints = { ...scenario.constraints, _origin: scenario.id };
      _sensPrevLevel = null;
      renderSensitivity();
      renderDecisionResult();
    });
    // 导出决策报告按钮
    const exportBtn = $('#sens-export');
    if (exportBtn) exportBtn.addEventListener('click', () => exportDecisionReport(scenario, domain));
  }

  /* ---------- 导出决策报告（Markdown 下载）--------------------------------- */
  function exportDecisionReport(scenario, domain) {
    const { ...override } = _sensConstraints || {};
    delete override._origin;
    const isModified = JSON.stringify(override) !== JSON.stringify(scenario.constraints);
    const effectiveScenario = isModified ? { ...scenario, constraints: override } : scenario;
    const r = DECIDE.analyze(effectiveScenario, domain);
    if (!r) return;

    const L = AIDATA.LEVELS;
    const cnLabels = { budget: '预算承受力', riskTolerance: '风险容忍度', compliance: '合规要求', dataReadiness: '数据就绪度', urgency: '紧迫性' };
    const lines = [];
    lines.push('# 决策分析报告：' + scenario.title);
    lines.push('');
    lines.push('- 生成时间：' + new Date().toLocaleString('zh-CN', { hour12: false }));
    lines.push('- 决策者：' + scenario.persona);
    lines.push('- 关联领域：' + domain.name + '（介入深度 ' + domain.penetration + ' · 成熟度 ' + domain.maturity + '/5 · 风险 ' + domain.risk + '）');
    lines.push('- 数据置信度：' + (typeof domain.confidence === 'number' ? domain.confidence + '%' : '静态估算'));
    if (isModified) lines.push('- ⚠ 本报告基于用户推演的约束参数（非场景默认值）');
    lines.push('');
    lines.push('## 业务痛点');
    lines.push('');
    lines.push(scenario.pain);
    if (scenario.notes) { lines.push(''); lines.push('> ' + scenario.notes); }
    lines.push('');

    lines.push('## ROI 判定');
    lines.push('');
    lines.push('| 维度 | 值 |');
    lines.push('|---|---|');
    lines.push('| 判定 | **' + r.roi.verdict + '** |');
    lines.push('| 价值分 | ' + r.roi.value + '（紧迫性 ' + scenario.constraints.urgency + ' × 成熟度 ' + domain.maturity + '）|');
    lines.push('| 成本分 | ' + r.roi.cost + '（预算压力 ' + (6 - scenario.constraints.budget) + ' + 合规 ' + scenario.constraints.compliance + '）|');
    lines.push('| 净价值 | ' + r.roi.net + ' |');
    lines.push('| 理由 | ' + r.roi.reasoning + ' |');
    lines.push('');

    lines.push('## 建议介入级别');
    lines.push('');
    lines.push('**L' + r.suggestedLevel + ' — ' + r.suggestedLevelName + '**');
    if (r.blockedAt) lines.push('');
    if (r.blockedAt) lines.push('⚠ 受场景约束压低：领域已验证可达 L' + scenario.provenLevel + '，但当前约束下建议不超过 L' + r.suggestedLevel + '。');
    lines.push('');
    lines.push(r.recommendation);
    if (r.ceilingReasons.length) {
      lines.push('');
      lines.push('约束限制理由：');
      r.ceilingReasons.forEach(reason => lines.push('- ' + reason));
    }
    lines.push('');

    lines.push('## 分步实施路径');
    lines.push('');
    lines.push('| 级别 | 阶段 | 状态 | 行动 | 前置条件 |');
    lines.push('|---|---|---|---|---|');
    r.pathway.forEach(step => {
      lines.push('| L' + step.level + ' | ' + step.levelName + ' | ' + step.status + ' | ' + step.action + ' | ' + step.prerequisite + ' |');
    });
    if (r.pathway.length && r.pathway[0].examples.length) {
      lines.push('');
      lines.push('已验证参考案例：');
      r.pathway.forEach(step => {
        if (step.examples.length) lines.push('- L' + step.level + '：' + step.examples.join('、'));
      });
    }
    lines.push('');

    lines.push('## 风险卡点');
    lines.push('');
    if (r.blockers.length) {
      lines.push('| 类型 | 级别 | 说明 |');
      lines.push('|---|---|---|');
      r.blockers.forEach(b => lines.push('| ' + b.tag + ' | ' + b.level + ' | ' + b.detail + ' |'));
    } else {
      lines.push('当前无显著风险卡点。');
    }
    lines.push('');

    lines.push('## 场景约束' + (isModified ? '（已推演修改）' : ''));
    lines.push('');
    lines.push('| 约束 | 值 |' + (isModified ? ' 默认值 |' : ''));
    lines.push('|---|---|' + (isModified ? '---|' : ''));
    Object.entries(effectiveScenario.constraints).forEach(([k, v]) => {
      const def = scenario.constraints[k];
      const changed = isModified && v !== def;
      lines.push('| ' + (cnLabels[k] || k) + ' | ' + v + '/5' + (changed ? ' ⚡' : '') + ' |' + (isModified ? ' ' + def + '/5 |' : ''));
    });
    lines.push('');
    lines.push('> 本报告由 AI 扩张分析决策引擎自动生成，基于领域数据和场景约束的可解释推演。用于研究参考，不构成投资或决策建议。');

    // 下载
    const md = lines.join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'decision-' + scenario.id + (isModified ? '-custom' : '') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ---------- 场景对比模式 ------------------------------------------------- */
  let _compareMode = false;
  let _compareIds = [];
  function renderDecisionPicker() {
    const wrap = $('#dec-picker');
    if (!wrap || !window.DECISIONS) return;
    const scenarios = DECISIONS.SCENARIOS;
    if (!_activeScenarioId) {
      loadDecisionState(); // 尝试从 localStorage 恢复上次推演状态
      if (!_activeScenarioId) _activeScenarioId = scenarios[0].id;
    }

    // 对比模式开关
    let html = '<div class="dec-mode-bar">';
    html += `<span class="chip dec-mode-toggle ${_compareMode ? 'active' : ''}" id="dec-mode-toggle">${_compareMode ? '🔁 对比模式（点击退出）' : '🔁 对比模式'}</span>`;
    if (_compareMode && _compareIds.length >= 2) {
      html += `<span class="dec-mode-hint">已选 ${_compareIds.length} 个（选 2-4 个对比）</span>`;
    } else if (_compareMode) {
      html += `<span class="dec-mode-hint">选择 2-4 个场景进行对比</span>`;
    }
    html += '</div>';

    // 场景选择器
    html += '<div class="dec-chips">';
    scenarios.forEach(s => {
      const dom = D.DOMAINS.find(d => d.id === s.domainId);
      if (_compareMode) {
        const selected = _compareIds.includes(s.id);
        html += `<span class="chip dec-chip ${selected ? 'active' : ''}" data-sid="${s.id}">${dom ? dom.icon : ''} ${s.title}</span>`;
      } else {
        html += `<span class="chip dec-chip ${s.id === _activeScenarioId ? 'active' : ''}" data-sid="${s.id}">${dom ? dom.icon : ''} ${s.title}</span>`;
      }
    });
    html += '</div>';
    wrap.innerHTML = html;

    $$('.dec-chip', wrap).forEach(el => el.addEventListener('click', () => {
      if (_compareMode) {
        const sid = el.dataset.sid;
        if (_compareIds.includes(sid)) {
          _compareIds = _compareIds.filter(x => x !== sid);
        } else {
          _compareIds = [..._compareIds, sid].slice(-4); // 最多 4 个
        }
        renderDecisionPicker();
        renderComparison();
      } else {
        _activeScenarioId = el.dataset.sid;
        _sensConstraints = null; // 切换场景时重置推演
        saveDecisionState();
        renderDecisionPicker();
        renderDecisionResult();
        renderSensitivity();
      }
    }));
    // 模式切换
    const toggle = $('#dec-mode-toggle');
    if (toggle) toggle.addEventListener('click', () => {
      _compareMode = !_compareMode;
      if (_compareMode) {
        _compareIds = [_activeScenarioId]; // 默认选中当前场景
      }
      renderDecisionPicker();
      if (_compareMode) renderComparison();
      else { renderDecisionResult(); renderSensitivity(); }
    });

    // 初始渲染
    if (_compareMode) renderComparison();
    else { renderDecisionResult(); renderSensitivity(); }
  }

  function renderComparison() {
    const result = $('#dec-result');
    const sens = $('#dec-sensitivity');
    if (!result) return;
    if (sens) sens.style.display = 'none'; // 对比模式隐藏敏感性面板

    if (_compareIds.length < 2) {
      result.innerHTML = '<div class="cmp-empty">选择至少 2 个场景进行对比</div>';
      return;
    }
    const scenarios = _compareIds.map(id => DECISIONS.SCENARIOS.find(s => s.id === id)).filter(Boolean);
    const analyses = scenarios.map(s => {
      const domain = D.DOMAINS.find(d => d.id === s.domainId);
      return { scenario: s, domain, result: DECIDE.analyze(s, domain) };
    }).filter(a => a.result);

    const rows = [
      { label: '领域', get: a => a.domain.name },
      { label: 'ROI 判定', get: a => a.result.roi.verdict, color: a => a.result.roi.net >= 12 ? '#39c0a0' : a.result.roi.net >= 6 ? '#f5b54a' : a.result.roi.net >= 0 ? '#f0723c' : '#e0556b' },
      { label: '建议级别', get: a => 'L' + a.result.suggestedLevel + ' ' + a.result.suggestedLevelName, color: a => AIDATA.LEVELS[a.result.suggestedLevel].color },
      { label: '价值分', get: a => a.result.roi.value },
      { label: '成本分', get: a => a.result.roi.cost },
      { label: '净价值', get: a => a.result.roi.net, color: a => a.result.roi.net >= 6 ? '#39c0a0' : a.result.roi.net >= 0 ? '#f5b54a' : '#e0556b' },
      { label: '风险卡点', get: a => a.result.blockers.length + '个' },
      { label: '被约束压低', get: a => a.result.blockedAt ? '是' : '否', color: a => a.result.blockedAt ? '#f5b54a' : '#39c0a0' },
      { label: '合规', get: a => a.scenario.constraints.compliance + '/5' },
      { label: '风险容忍', get: a => a.scenario.constraints.riskTolerance + '/5' },
    ];

    let html = '<div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th>维度</th>';
    analyses.forEach(a => { html += `<th>${a.domain.icon} ${a.scenario.title.length > 12 ? a.scenario.title.slice(0, 12) + '…' : a.scenario.title}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += `<tr><td class="cmp-row-label">${row.label}</td>`;
      // 检测该行是否有差异
      const vals = analyses.map(row.get);
      const hasDiff = vals.some(v => v !== vals[0]);
      analyses.forEach(a => {
        const v = row.get(a);
        const color = row.color ? row.color(a) : '';
        const diffClass = hasDiff ? ' cmp-diff' : '';
        html += `<td class="cmp-cell${diffClass}"${color ? ` style="color:${color}"` : ''}>${v}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // 差异总结
    const levels = analyses.map(a => a.result.suggestedLevel);
    const maxLevel = Math.max(...levels), minLevel = Math.min(...levels);
    if (maxLevel !== minLevel) {
      const low = analyses.find(a => a.result.suggestedLevel === minLevel);
      const high = analyses.find(a => a.result.suggestedLevel === maxLevel);
      html += `<div class="cmp-summary">📊 最大差异：建议级别从 <b style="color:${AIDATA.LEVELS[minLevel].color}">L${minLevel}</b>（${low.scenario.title}）到 <b style="color:${AIDATA.LEVELS[maxLevel].color}">L${maxLevel}</b>（${high.scenario.title}），差距 ${maxLevel - minLevel} 级——主要由合规/风险容忍/数据就绪差异驱动。</div>`;
    } else {
      html += `<div class="cmp-summary">📊 所有选中场景建议级别相同（L${minLevel}），但 ROI 和风险卡点有差异，见上表。</div>`;
    }
    result.innerHTML = html;
  }

  /* ---------- 领域卡片 ----------------------------------------------------- */
  function renderDomainCards(domains) {
    const wrap = $('#domain-grid');
    if (!domains.length) {
      wrap.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--txt-mute)">当前筛选下无匹配领域</div>';
      return;
    }
    wrap.innerHTML = domains.map(d => {
      const lv = VIZ.levelOf(d.penetration);
      const col = CAT_COLOR[d.category] || '#5b8def';
      const confTag = (typeof d.confidence === 'number')
        ? `<span class="conf-dot conf-${d.confidence >= 75 ? 'high' : d.confidence >= 50 ? 'mid' : 'low'}" title="数据置信度 ${d.confidence}%">置信 ${d.confidence}</span>`
        : '';
      return `
      <div class="dcard" data-id="${d.id}" style="--cat-color:${col}">
        <div class="speed speed-${d.speed}">${D.SPEED[d.speed].label}</div>
        <div class="row1"><span class="ico">${d.icon}</span>${confTag}</div>
        <h3>${d.name}</h3>
        <div class="sum">${d.summary}</div>
        <div class="metrics">
          <div class="m"><div class="ml">介入</div><div class="mv" style="color:${lv.color}">${d.penetration}</div>
            <div class="track"><i style="width:${d.penetration}%;background:${lv.color}"></i></div></div>
          <div class="m"><div class="ml">采用</div><div class="mv" style="color:#39c0a0">${d.adoption}</div>
            <div class="track"><i style="width:${d.adoption}%;background:#39c0a0"></i></div></div>
          <div class="m"><div class="ml">成熟</div><div class="mv" style="color:#f5b54a">${d.maturity}/5</div>
            <div class="track"><i style="width:${d.maturity / 5 * 100}%;background:#f5b54a"></i></div></div>
        </div>
      </div>`;
    }).join('');
    $$('.dcard', wrap).forEach(el => el.addEventListener('click', () => {
      const d = D.DOMAINS.find(x => x.id === el.dataset.id);
      if (d) openDrawer(d);
    }));
  }

  /* ---------- 详情抽屉 ----------------------------------------------------- */
  function openDrawer(d) {
    const ov = $('#drawer-overlay'), dr = $('#drawer');
    const lv = VIZ.levelOf(d.penetration);
    const col = CAT_COLOR[d.category] || '#5b8def';
    const sp = D.SPEED[d.speed];

    $('#d-ico').textContent = d.icon;
    $('#d-name').textContent = d.name;
    const confInfo = typeof d.confidence === 'number'
      ? ` · <span style="color:${d.confidence >= 75 ? '#5fe0bd' : d.confidence >= 50 ? '#f5cb7a' : '#ff8a9a'}">置信度 ${d.confidence}%</span>`
      : '';
    $('#d-cat').innerHTML = `<span style="color:${col}">●</span> ${d.category} · 扩张 ${sp.label} · 风险 ${d.risk}${confInfo}`;
    $('#d-summary').textContent = d.summary;

    $('#d-m1 .mv').innerHTML = `<span style="color:${lv.color}">${d.penetration}</span>`;
    $('#d-m2 .mv').innerHTML = `<span style="color:#39c0a0">${d.adoption}</span>`;
    $('#d-m3 .mv').innerHTML = `<span style="color:#f5b54a">${d.maturity}/5</span>`;
    $('#d-m4 .mv').innerHTML = `<span style="color:#f0723c">${d.market}</span>`;
    $('#d-m1 .ml').textContent = '介入深度';
    $('#d-m2 .ml').textContent = '采用率';
    $('#d-m3 .ml').textContent = '成熟度';
    $('#d-m4 .ml').textContent = '市场权重';

    // 已应用场景
    $('#d-deployed').innerHTML = d.deployed.map(dep => {
      const lvObj = D.LEVELS[dep.level];
      return `<div class="dep-item" style="--lv-color:${lvObj.color}">
        <div class="where">${dep.where}</div>
        <div class="depth">${dep.depth}</div>
        <span class="lvl">L${dep.level} · ${lvObj.name}</span>
      </div>`;
    }).join('');

    // 未来预测
    $('#d-future').innerHTML = d.future.map(f =>
      `<div class="fut-item"><span class="arrow">→</span><span>${f}</span></div>`
    ).join('');

    // 决策场景（该领域关联的）
    const decWrap = $('#d-decisions');
    if (decWrap && window.DECIDE) {
      const scenarios = DECIDE.scenariosForDomain(d.id);
      if (scenarios.length) {
        decWrap.innerHTML = scenarios.map(s => {
          const r = DECIDE.analyze(s, d);
          if (!r) return '';
          const vColor = r.roi.net >= 12 ? '#39c0a0' : r.roi.net >= 6 ? '#f5b54a' : r.roi.net >= 0 ? '#f0723c' : '#e0556b';
          const lv = AIDATA.LEVELS[r.suggestedLevel];
          return `<div class="dep-item" style="--lv-color:${vColor};border-left-color:${vColor}">
            <div class="where">${s.title}</div>
            <div class="depth">${s.persona} · ${r.roi.verdict}</div>
            <span class="lvl" style="background:${lv.color}33;color:${lv.color}">建议 L${r.suggestedLevel} · ${r.suggestedLevelName}</span>
          </div>`;
        }).join('');
      } else {
        decWrap.innerHTML = '<div style="color:var(--txt-mute);font-size:12px;padding:8px 0">该领域暂无关联决策场景</div>';
      }
    }

    // 扩张曲线
    const myCurve = D.DOMAIN_CURVES.find(c => c.id === d.id);
    const cv = $('#d-curves');
    if (myCurve) {
      cv.parentElement.style.display = '';
      VIZ.renderDomainCurves(cv, [myCurve, ...D.DOMAIN_CURVES.filter(c => c.id !== d.id).slice(0, 2)], D.DOMAINS);
    } else {
      cv.parentElement.style.display = 'none';
    }

    ov.classList.add('show'); dr.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    $('#drawer-overlay').classList.remove('show');
    $('#drawer').classList.remove('show');
    document.body.style.overflow = '';
  }

  /* ---------- 全局事件 ----------------------------------------------------- */
  function bindGlobal() {
    $('#drawer-overlay').addEventListener('click', closeDrawer);
    $('#drawer-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    // 窗口缩放重绘 canvas（防抖）
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(renderAll, 200);
    });

    // 时间轴说明联动
    const note = $('#year-note');
    const latest = D.TIMELINE[D.TIMELINE.length - 1];
    note.innerHTML = `<b style="color:#f5b54a">2027 预测：</b>${latest.note}。三条曲线中，<span style="color:#f0723c">自治代理</span>增速最快——这是未来 1-2 年最值得关注的扩张方向。`;
  }

  /* ---------- 启动 --------------------------------------------------------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
