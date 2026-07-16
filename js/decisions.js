/* ============================================================================
 * 决策场景库  (decisions.js)
 * 真实业务决策场景：把"领域级 0-100 分"转化为"我这个具体业务该怎么办"。
 * 每个场景 = 一个决策者面对的真实问题，绑定到具体领域 + 决策约束。
 * 决策引擎据此推演：建议介入级别 / 实施路径 / 风险卡点 / ROI 判断依据。
 * ============================================================================ */
window.DECISIONS = (function () {

  /* ---- 决策约束维度 ------------------------------------------------------- *
   * budget:        预算承受力 1-5（1=极有限，5=充足）
   * riskTolerance: 风险容忍度 1-5（1=零容忍如医疗，5=高如内部工具）
   * compliance:    合规要求 1-5（1=宽松，5=强监管如金融/医疗）
   * dataReadiness: 数据就绪度 1-5（1=无积累，5=已结构化可直接用）
   * urgency:       紧迫性 1-5（1=观望，5=竞争对手已上车）
   */
  const SCENARIOS = [
    {
      id: 'hospital-imaging',
      domainId: 'health',
      title: '三甲医院要不要上 AI 医学影像筛查',
      persona: '医院信息科主任',
      pain: '影像科医生读片压力大，排队久，漏诊风险随疲劳上升',
      constraints: { budget: 3, riskTolerance: 1, compliance: 5, dataReadiness: 4, urgency: 3 },
      provenLevel: 2,  // 当前已有验证的最高介入级别（影像筛查辅助，医师复核）
      notes: '影像 AI 已有 NMPA 三类证产品（如肺结节、眼底），但最终诊断必须医师签发。'
    },
    {
      id: 'bank-risk',
      domainId: 'finance',
      title: '银行信贷风控引入 AI 到什么程度',
      persona: '银行风控总监',
      pain: '传统规则引擎覆盖不全，欺诈手法迭代快，人工审核成本高',
      constraints: { budget: 4, riskTolerance: 2, compliance: 5, dataReadiness: 5, urgency: 4 },
      provenLevel: 3,
      notes: '实时交易评分、反欺诈已大规模部署；但信贷拒贷决策需可解释，纯黑盒模型监管不批。'
    },
    {
      id: 'factory-qc',
      domainId: 'mfg',
      title: '工厂产线质检用 AI 替代人工',
      persona: '制造企业 CTO',
      pain: '人工质检一致性差、夜班漏检率高、人力成本逐年升',
      constraints: { budget: 3, riskTolerance: 3, compliance: 2, dataReadiness: 3, urgency: 3 },
      provenLevel: 3,
      notes: '机器视觉质检在 3C/汽车已成熟落地；难点是长尾缺陷样本少、换线成本高。'
    },
    {
      id: 'cs-outsourcing',
      domainId: 'cs',
      title: '客服中心要不要用 AI 替代外包坐席',
      persona: '客服运营负责人',
      pain: '外包坐席培训成本高、流动率大、服务质量难统一',
      constraints: { budget: 3, riskTolerance: 4, compliance: 2, dataReadiness: 4, urgency: 4 },
      provenLevel: 3,
      notes: '文本客服 AI 已能处理 60-80% 常见问题；语音外呼/呼入在预约、回访场景已商用。'
    },
    {
      id: 'edu-tutor',
      domainId: 'edu',
      title: '学校引入 AI 个性化辅导系统',
      persona: '中学校长',
      pain: '大班教学无法照顾个体差异，薄弱学生掉队，教师精力有限',
      constraints: { budget: 2, riskTolerance: 3, compliance: 3, dataReadiness: 2, urgency: 2 },
      provenLevel: 2,
      notes: 'Khanmigo 等已验证一对一辅导可行；但 K12 场景对答案正确性、学习习惯养成有特殊要求。'
    },
    {
      id: 'legal-contract',
      domainId: 'legal',
      title: '企业法务用 AI 审查合同',
      persona: '企业法务总监',
      pain: '合同量大、重复审查耗时、关键风险条款可能遗漏',
      constraints: { budget: 3, riskTolerance: 2, compliance: 4, dataReadiness: 3, urgency: 3 },
      provenLevel: 2,
      notes: 'Harvey 类工具已能做条款识别和风险标注；但最终法律意见必须律师出具。'
    },
    {
      id: 'ecom-rec',
      domainId: 'ecom',
      title: '电商平台升级 AI 推荐与内容生成',
      persona: '电商技术负责人',
      pain: '推荐转化率遇瓶颈，商品图拍摄成本高，直播人力不足',
      constraints: { budget: 4, riskTolerance: 4, compliance: 2, dataReadiness: 5, urgency: 4 },
      provenLevel: 4,
      notes: '推荐算法已是 L4 自主运行；AI 模特/商品图/直播数字人已商用，关键是转化率 ROI。'
    },
    {
      id: 'coding-team',
      domainId: 'code',
      title: '研发团队全面采用 AI 编程工具',
      persona: '研发负责人',
      pain: '研发效率瓶颈、代码审查积压、重复性编码占用高级工程师',
      constraints: { budget: 3, riskTolerance: 4, compliance: 2, dataReadiness: 4, urgency: 5 },
      provenLevel: 3,
      notes: 'Copilot/Cursor 已是标配；Devin 类自主代理可承接独立工单，但需 code review 把关。'
    },
    {
      id: 'robotaxi-fleet',
      domainId: 'av',
      title: '出行平台扩张 Robotaxi 运营区域',
      persona: '自动驾驶公司运营 VP',
      pain: '单车运营成本需随规模下降，但长尾场景和监管审批限制扩张速度',
      constraints: { budget: 5, riskTolerance: 2, compliance: 5, dataReadiness: 5, urgency: 4 },
      provenLevel: 4,
      notes: '封闭场景（港口/矿区）已 L4 全无人；城市 Robotaxi 在限定区域运营，事故责任是核心卡点。'
    },
    {
      id: 'startup-agent',
      domainId: 'assistant',
      title: '创业公司构建垂直 AI Agent 产品',
      persona: 'AI 创业公司 CTO',
      pain: '大模型能力快速迭代，需判断 Agent 自主到什么程度才能产品化',
      constraints: { budget: 2, riskTolerance: 5, compliance: 2, dataReadiness: 3, urgency: 5 },
      provenLevel: 3,
      notes: 'Computer Use/浏览器代理已可端到端操作；但误操作成本高（订错票/转错账），需人工确认层。'
    },
    {
      id: 'pharma-discovery',
      domainId: 'science',
      title: '药企用 AI 加速候选药物发现',
      persona: '药企研发负责人',
      pain: '新药研发周期 10+ 年、成本 10+ 亿美元，失败率高',
      constraints: { budget: 5, riskTolerance: 3, compliance: 5, dataReadiness: 4, urgency: 3 },
      provenLevel: 2,
      notes: 'AlphaFold/生成式分子设计已能缩短靶点发现；但临床验证不可跳过，AI 价值在"少走弯路"。'
    },
    {
      id: 'hr-screening',
      domainId: 'hr',
      title: '企业用 AI 做简历初筛与面试评估',
      persona: 'HR 负责人',
      pain: '海量简历筛选耗时，初面重复性高，人岗匹配准确度依赖经验',
      constraints: { budget: 2, riskTolerance: 3, compliance: 4, dataReadiness: 3, urgency: 2 },
      provenLevel: 3,
      notes: '简历解析匹配已自动化；AI 视频面试评估可用，但算法偏见和就业公平是合规红线。'
    }
  ];

  /* ---- 决策建议的介入级别理由映射 ----------------------------------------- *
   * 给定场景约束，建议不要超过某个级别的原因。
   * 决策引擎会综合领域 provenLevel 和场景约束，给出"建议级别"和"为什么不能再高"。
   */
  const LEVEL_GATE_REASONS = {
    0: '建议仅作为效率工具：当前领域 AI 成熟度不足以承担业务流程。',
    1: '建议部分自动化：AI 接管标准化子流程，关键节点必须人工把关。',
    2: '建议深度协作：AI 提供主要方案，由专业人员审阅修改后生效。',
    3: '建议高度自治：AI 自主完成端到端任务，人做例外审核与策略设定。',
    4: '建议自主代理：AI 持续自主运行，人仅做目标设定与监督。'
  };

  return { SCENARIOS, LEVEL_GATE_REASONS };
})();
