/* ============================================================================
 * 趋势预测引擎  (forecast.js)
 * 零依赖纯数学：鲁棒线性回归 + 异常点检测 + 置信区间 + 趋势分类
 *
 * 为什么不用 ARIMA / 机器学习模型：
 *   实际快照数据点少（通常 <15）、间隔不均匀、含结构性噪声（live↔synthetic 切换）。
 *   复杂模型会过拟合。鲁棒回归 + 置信区间在数据稀疏时反而更诚实。
 * ============================================================================ */
window.FORECAST = (function () {

  /* ---- 基础统计工具 ------------------------------------------------------- */
  function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // 中位绝对偏差 MAD（比标准差更抗异常值）
  function mad(arr) {
    if (arr.length < 2) return 0;
    const m = median(arr);
    const devs = arr.map(v => Math.abs(v - m));
    return median(devs);
  }

  function std(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
  }

  /* ---- 最小二乘线性回归 --------------------------------------------------- *
   * 输入 xs/ys（等长数组），返回 { slope, intercept, residuals[] }
   * 正规方程：slope = Σ((x-x̄)(y-ȳ)) / Σ((x-x̄)²)
   */
  function ols(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: ys[0] || 0, residuals: [] };
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    const slope = den > 1e-9 ? num / den : 0;
    const intercept = my - slope * mx;
    const residuals = ys.map((y, i) => y - (slope * xs[i] + intercept));
    return { slope, intercept, residuals };
  }

  /* ---- 异常点检测 + 平滑 -------------------------------------------------- *
   * 用"相邻点差分的中位数"做初始鲁棒斜率估计（不被单个异常点污染），
   * 再用残差 MAD 识别异常点，用邻居中位数替代后重新 OLS 回归。
   * 处理 live→synthetic 跳水等结构性断点。
   */
  function robustFit(xs, ys) {
    if (xs.length < 3) return Object.assign(ols(xs, ys), { smoothed: ys.slice(), outliers: [] });

    // 第一步：用相邻差分的中位数估计鲁棒斜率（单次 OLS 会被异常点带偏）
    const diffs = [];
    for (let i = 1; i < ys.length; i++) diffs.push(ys[i] - ys[i - 1]);
    const robustSlope = median(diffs);
    const robustIntercept = median(ys) - robustSlope * mean(xs);

    // 第二步：用鲁棒斜率算残差，识别异常点
    const robustResiduals = ys.map((y, i) => y - (robustSlope * xs[i] + robustIntercept));
    const threshold = Math.max(1.5 * mad(robustResiduals), 2);
    const outliers = [];
    const smoothed = ys.slice();
    for (let i = 0; i < ys.length; i++) {
      if (Math.abs(robustResiduals[i]) > threshold) {
        outliers.push(i);
        const neighbors = [];
        if (i > 0) neighbors.push(ys[i - 1]);
        if (i < ys.length - 1) neighbors.push(ys[i + 1]);
        smoothed[i] = neighbors.length ? median(neighbors) : ys[i];
      }
    }
    // 第三步：用平滑后的数据做正式 OLS 回归
    const fit2 = ols(xs, smoothed);
    return Object.assign(fit2, { smoothed, outliers });
  }

  /* ---- 主入口：fitRobust -------------------------------------------------- *
   * 输入：points = [{ t, score }]（t 可以是时间戳或序号）
   * 输出：完整预测结果
   */
  function fitRobust(points, horizon) {
    horizon = horizon || 3; // 默认预测 3 步
    if (!points || points.length < 2) {
      return { slope: 0, intercept: points && points[0] ? points[0].score : 0,
        predictions: [], confidenceBand: [], residualStd: 0, quality: 'insufficient',
        outliers: [], smoothedValues: [] };
    }
    // 用序号作为 x（时间戳间隔不均匀时，序号比原始时间戳更稳定）
    const xs = points.map((_, i) => i);
    const ys = points.map(p => p.score);

    const { slope, intercept, smoothed, outliers } = robustFit(xs, ys);

    // 用平滑后数据重算残差，作为置信区间的基础
    const refit = ols(xs, smoothed);
    const residualStd = Math.max(std(refit.residuals), 0.5); // 下限 0.5，避免假精确

    // 预测：线性外推，clamp 到 0-100
    const lastX = xs[xs.length - 1];
    const predictions = [];
    const confidenceBand = [];
    for (let h = 1; h <= horizon; h++) {
      const x = lastX + h;
      const pred = Math.max(0, Math.min(100, slope * x + intercept));
      // 置信区间随步长扩大（√h 衰减），用 80% 带（z≈1.28）
      const band = 1.28 * residualStd * Math.sqrt(h);
      predictions.push(pred);
      confidenceBand.push({ lower: Math.max(0, pred - band), upper: Math.min(100, pred + band) });
    }

    // 可信度等级
    let quality;
    if (points.length < 4) quality = 'low';
    else if (residualStd < 3) quality = 'high';
    else if (residualStd < 8) quality = 'medium';
    else quality = 'low';

    return {
      slope, intercept, predictions, confidenceBand,
      residualStd, quality, outliers,
      smoothedValues: smoothed,
      lastValue: ys[ys.length - 1],
      pointCount: points.length
    };
  }

  /* ---- 趋势分类 ----------------------------------------------------------- *
   * 从纯数值到人类可读的判断
   */
  function classifyTrend(points) {
    if (!points || points.length < 3) {
      return { label: '数据不足', labelColor: '#647196', nearSlope: 0, fullSlope: 0 };
    }
    const xs = points.map((_, i) => i);
    const ys = points.map(p => p.score);
    const { slope: fullSlope } = robustFit(xs, ys);

    // 近期斜率：最后 min(3, n-1) 个点的回归
    const nearCount = Math.min(3, points.length - 1);
    const nearStart = points.length - nearCount - 1;
    const nearXs = [], nearYs = [];
    for (let i = Math.max(0, nearStart); i < points.length; i++) {
      nearXs.push(i); nearYs.push(ys[i]);
    }
    const { slope: nearSlope } = ols(nearXs, nearYs);

    // 前半段 vs 后半段方向（检测转折）
    const half = Math.floor(points.length / 2);
    const firstHalf = ols(xs.slice(0, half + 1), ys.slice(0, half + 1));
    const secondHalf = ols(xs.slice(half), ys.slice(half));
    const directionChange = firstHalf.slope * secondHalf.slope < 0; // 符号相反

    let label, labelColor;
    if (directionChange && Math.abs(secondHalf.slope) > 1) {
      label = '转折'; labelColor = '#f0723c';
    } else if (Math.abs(nearSlope) < 1.5) {
      label = '平稳'; labelColor = '#647196';
    } else if (nearSlope < 0) {
      label = '回落'; labelColor = '#e0556b';
    } else if (nearSlope > fullSlope + 0.5) {
      label = '加速'; labelColor = '#39c0a0';
    } else if (nearSlope < fullSlope - 0.5 && nearSlope > 0) {
      label = '减速'; labelColor = '#f5b54a';
    } else {
      label = nearSlope > 0 ? '上升' : '下降'; labelColor = nearSlope > 0 ? '#39c0a0' : '#e0556b';
    }

    return { label, labelColor, nearSlope, fullSlope, directionChange };
  }

  /* ---- 批量预测：对所有领域算预测，返回按近期变化排序的 top-N ------------- */
  function forecastAll(replay, domains, topN) {
    topN = topN || 4;
    if (!replay || !replay.series) return [];
    const results = replay.series.map(s => {
      const domain = domains.find(d => d.id === s.id);
      const fit = fitRobust(s.points, 3);
      const trend = classifyTrend(s.points);
      return {
        id: s.id,
        name: domain ? domain.name : s.id,
        icon: domain ? domain.icon : '',
        points: s.points,
        fit, trend
      };
    });
    // 按近期斜率绝对值排序（变化最大的排前面）
    results.sort((a, b) => Math.abs(b.trend.nearSlope) - Math.abs(a.trend.nearSlope));
    return results.slice(0, topN);
  }

  return { fitRobust, classifyTrend, forecastAll, ols, robustFit, mean, median, mad, std };
})();
