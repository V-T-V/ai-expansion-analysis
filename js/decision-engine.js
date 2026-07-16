/* ============================================================================
 * 决策推理引擎  (decision-engine.js)
 * 输入：决策场景 + 领域实时数据（penetration/maturity/risk/deployed）
 * 输出：建议介入级别 + 理由 / 分步实施路径 / 风险卡点 / ROI 判断依据
 *
 * 推理逻辑（可解释，非黑盒）：
 *   建议级别 = min(领域 provenLevel, 场景约束允许的上限)
 *   场景约束上限 = 由 riskTolerance/compliance/dataReadiness 三项压低
 *   实施路径 = 从 L0 到建议级别的逐级递进，每级标注前置条件
 *   风险卡点 = 约束短板 × 领域 risk 的交叉分析
 *   ROI 判断 = 领域成熟度 × 场景紧迫性 vs 预算/合规成本
 * ============================================================================ */
window.DECIDE = (function () {

  /* ---- 约束 → 允许的最高介入级别 ------------------------------------------ *
   * 风险容忍度低 / 合规要求高 / 数据未就绪，都会压低允许级别。
   * 这是"为什么不能再高"的可解释依据。
   */
  function constraintCeiling(c) {
    let ceiling = 4; // 默认允许到最高
    const reasons = [];

    if (c.riskTolerance <= 1) { ceiling = Math.min(ceiling, 2); reasons.push('风险零容忍，AI 只能辅助不能决策（≤L2）'); }
    else if (c.riskTolerance <= 2) { ceiling = Math.min(ceiling, 3); reasons.push('风险容忍度低，关键决策需人工兜底（≤L3）'); }

    if (c.compliance >= 5) { ceiling = Math.min(ceiling, 2); reasons.push('强监管行业，自主决策不可接受（≤L2）'); }
    else if (c.compliance >= 4) { ceiling = Math.min(ceiling, 3); reasons.push('有合规要求，需保留人工审核环节（≤L3）'); }

    if (c.dataReadiness <= 1) { ceiling = Math.min(ceiling, 1); reasons.push('数据未积累，AI 无法有效学习（≤L1）'); }
    else if (c.dataReadiness <= 2) { ceiling = Math.min(ceiling, 2); reasons.push('数据半结构化，仅支撑协作级应用（≤L2）'); }

    return { ceiling, reasons };
  }

  /* ---- 实施路径：从 L0 到建议级别的分步计划 ------------------------------- */
  function buildPathway(suggestedLevel, domain, scenario) {
    const steps = [];
    const deployed = domain.deployed || [];
    for (let lv = 0; lv <= suggestedLevel; lv++) {
      // 找该级别对应的已部署案例作为参考
      const examples = deployed.filter(d => d.level === lv);
      const prereq = stepPrerequisite(lv, scenario);
      steps.push({
        level: lv,
        levelName: levelName(lv),
        action: stepAction(lv, domain, examples),
        examples: examples.map(e => e.where),
        prerequisite: prereq,
        status: lv < (scenario.provenLevel || 0) ? '已验证' : (lv === (scenario.provenLevel || 0) ? '当前前沿' : '待探索')
      });
    }
    return steps;
  }
  function stepAction(lv, domain, examples) {
    if (examples.length) return examples[0].depth;
    const fallback = [
      '引入 AI 工具提升单点效率（如检索、补全、初筛）',
      '选择标准化子流程做自动化试点',
      '人机协作：AI 出方案、人审阅修改',
      'AI 端到端处理，人工仅做例外审核',
      'AI 持续自主运行，人设定目标与监督'
    ];
    return fallback[lv] || fallback[0];
  }
  function stepPrerequisite(lv, scenario) {
    const c = scenario.constraints;
    if (lv === 0) return '选定试点场景，准备基础数据接入';
    if (lv === 1) return c.dataReadiness <= 2 ? '需先完成数据结构化与标注' : '数据就绪，可直接试点';
    if (lv === 2) return c.compliance >= 4 ? '需建立人工审核 SOP 与责任归属机制' : '建立人机协作流程与质量基线';
    if (lv === 3) return c.riskTolerance <= 2 ? '需有兜底机制与回滚预案' : '建立例外审核机制与监控看板';
    return '需建立目标设定、监督与审计闭环';
  }
  function levelName(lv) {
    const L = window.AIDATA.LEVELS;
    return (L[lv] || { name: '未知' }).name;
  }

  /* ---- 风险卡点：约束短板 × 领域风险交叉 ---------------------------------- */
  function riskBlockers(scenario, domain) {
    const c = scenario.constraints;
    const blockers = [];
    if (c.compliance >= 4) blockers.push({ tag: '合规', level: '高',
      detail: '监管要求保留人工决策环节，AI 输出需可解释、可审计。' + (domain.risk === '高' ? '该领域本身属高风险，合规成本翻倍。' : '') });
    if (c.riskTolerance <= 2) blockers.push({ tag: '安全', level: c.riskTolerance <= 1 ? '高' : '中',
      detail: '误判代价大，需设计兜底机制（人工复核/回滚/熔断）。' });
    if (c.dataReadiness <= 2) blockers.push({ tag: '数据', level: '高',
      detail: '数据积累不足是首要瓶颈，需先投入数据治理与标注，否则模型效果无法保证。' });
    if (domain.maturity <= 2) blockers.push({ tag: '成熟度', level: '中',
      detail: '该领域 AI 工程化尚不成熟，产品稳定性与供应商选择需谨慎评估。' });
    if (c.budget <= 2 && domain.maturity <= 3) blockers.push({ tag: '预算', level: '中',
      detail: '预算有限且领域尚需定制开发，建议优先用开源/低成本方案试点。' });
    return blockers;
  }

  /* ---- ROI 判断：值不值得现在做 ------------------------------------------- */
  function roiJudgment(scenario, domain) {
    const c = scenario.constraints;
    // 价值分 = 紧迫性 × 领域成熟度（成熟且紧迫 = 高价值）
    const value = c.urgency * domain.maturity;
    // 成本分 = 预算压力 + 合规成本
    const cost = (6 - c.budget) + c.compliance;
    // 净价值 = 价值 - 成本
    const net = value - cost;

    let verdict, reasoning;
    if (net >= 12) {
      verdict = '强烈建议推进';
      reasoning = '领域成熟度高且业务紧迫，推迟的机会成本大于实施成本。';
    } else if (net >= 6) {
      verdict = '建议试点';
      reasoning = '有明确价值但存在约束，建议小范围试点验证后再扩展。';
    } else if (net >= 0) {
      verdict = '观望为主';
      reasoning = '价值与成本接近平衡，建议跟踪领域成熟度变化，待条件改善再切入。';
    } else {
      verdict = '暂不建议';
      reasoning = '当前成本高于价值，或领域尚未成熟到可落地，建议持续观察。';
    }
    return { verdict, reasoning, value, cost, net };
  }

  /* ---- 主入口：分析一个决策场景 ------------------------------------------- */
  function analyze(scenario, domain) {
    if (!scenario || !domain) return null;

    const { ceiling, reasons } = constraintCeiling(scenario.constraints);
    // 建议级别 = min(领域已验证级别, 约束允许上限)
    const suggestedLevel = Math.min(scenario.provenLevel, ceiling);
    const blockedAt = suggestedLevel < scenario.provenLevel;

    const pathway = buildPathway(suggestedLevel, domain, scenario);
    const blockers = riskBlockers(scenario, domain);
    const roi = roiJudgment(scenario, domain);

    // 综合建议文本
    const recommendation = buildRecommendation(scenario, domain, suggestedLevel, ceiling, blockedAt, roi);

    return {
      scenario, domain,
      suggestedLevel,
      suggestedLevelName: levelName(suggestedLevel),
      ceiling,
      ceilingReasons: reasons,
      blockedAt,  // 是否因约束被压低于领域已验证级别
      pathway,
      blockers,
      roi,
      recommendation
    };
  }

  function buildRecommendation(scenario, domain, level, ceiling, blocked, roi) {
    const parts = [];
    parts.push(roi.verdict + '。');
    parts.push('建议介入到 L' + level + '（' + levelName(level) + '）——');
    if (blocked) {
      parts.push('虽该领域已验证可达 L' + scenario.provenLevel + '，但受场景约束（' +
        (domain.risk === '高' ? '高风险+合规' : '合规/数据/风险') + '）压低至 L' + level + '。');
    } else {
      parts.push('与领域当前验证水平一致。');
    }
    parts.push(roi.reasoning);
    return parts.join('');
  }

  /* ---- 辅助：找领域关联的场景 --------------------------------------------- */
  function scenariosForDomain(domainId) {
    return (DECISIONS.SCENARIOS || []).filter(s => s.domainId === domainId);
  }

  return { analyze, scenariosForDomain, constraintCeiling, roiJudgment };
})();
