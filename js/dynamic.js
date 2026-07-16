/* ============================================================================
 * 动态数据加载器  (dynamic.js)
 * 优先加载 engine/ 产出的 latest.json / replay.json（动态评估结果）；
 * 若获取失败（file:// 打开、或尚无快照），回退到静态 data.js。
 * 加载完成后用合并数据覆盖 window.AIDATA，并通知 app 重渲染。
 *
 * 工作方式：
 *   1. 页面先用静态 data.js 渲染（保证永远可见）
 *   2. 本脚本异步尝试拉取动态数据
 *   3. 拉到就合并并触发 'aidata:updated' 事件，app 监听后重渲染
 * ============================================================================ */
(function () {
  const ENDPOINTS = {
    latest: 'engine/output/latest.json',
    replay: 'engine/output/replay.json'
  };
  const CACHE_BUST = '?t=' + Date.now();

  async function tryFetch(url) {
    try {
      const res = await fetch(url + CACHE_BUST, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null; // file:// 或 CORS → 安静回退
    }
  }

  /* 把 latest.json 合并进 AIDATA.DOMAINS（保留静态元的 deployed/future 等）*/
  function merge(latest) {
    const D = window.AIDATA;
    const staticMap = {};
    D.DOMAINS.forEach(d => { staticMap[d.id] = d; });

    const merged = latest.domains.map(dyn => {
      const st = staticMap[dyn.id] || {};
      // 剥离引擎内部字段 _signals，不暴露给前端
      const clean = Object.assign({}, dyn);
      delete clean._signals;
      return Object.assign({}, st, clean, {
        // 动态字段覆盖静态估算值
        penetration: dyn.depth != null ? dyn.depth : (st.penetration || 0),
        adoption: dyn.adoption != null ? dyn.adoption : (st.adoption || 0),
        maturity: typeof dyn.maturity === 'number' && dyn.maturity <= 5 ? dyn.maturity : (st.maturity || 3),
        speed: dyn.speed || st.speed || 'steady'
      });
    });

    D.DOMAINS = merged;
    D.DYNAMIC = {
      ts: latest.ts,
      label: latest.label,
      mode: latest.mode,
      stats: latest.stats,
      alerts: latest.alerts || [],
      acceleration: latest.acceleration || { deltas: [] },
      history: latest.history || null   // 真实历史序列（供 KPI sparkline）
    };
  }

  async function load() {
    // 短暂延迟，让静态渲染先绘制；若 300ms 内拉到动态数据才显示遮罩
    let loaderTimer = setTimeout(showLoader, 300);
    const [latest, replay] = await Promise.all([
      tryFetch(ENDPOINTS.latest),
      tryFetch(ENDPOINTS.replay)
    ]);
    clearTimeout(loaderTimer);

    if (!latest) {
      console.info('[dynamic] 未加载到动态数据，使用静态估算（运行 node engine/run.js 生成）');
      window.AIDATA.DYNAMIC = null;
      hideLoader();
      return;
    }

    merge(latest);
    if (replay && replay.timeline && replay.timeline.length) {
      window.AIDATA.REPLAY = replay;
    }
    console.info('[dynamic] 已加载动态评估数据：', latest.label, '(' + latest.mode + ')');

    // 通知 app 用新数据重渲染
    document.dispatchEvent(new CustomEvent('aidata:updated', {
      detail: { ts: latest.ts, mode: latest.mode }
    }));
    hideLoader();
  }

  /* ---------- 加载遮罩：动态数据拉取期间显示，避免"先静态后跳变"的突兀感 --- */
  function showLoader() {
    let el = document.getElementById('dyn-loader');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dyn-loader';
      el.className = 'dyn-loader';
      el.innerHTML = '<span class="dl-spin"></span><span>正在加载动态评估数据…</span>';
      document.body.appendChild(el);
    }
    el.classList.add('show');
  }
  function hideLoader() {
    const el = document.getElementById('dyn-loader');
    if (el) el.classList.remove('show');
  }

  // 页面静态渲染完成后异步加载动态数据
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
