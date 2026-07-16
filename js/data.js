/* ============================================================================
 * AI 扩张分析 · 数据层
 * 数据来源：综合公开报告、行业观察，截至 2026 年中。
 * 评分（penetration/adoption/maturity）为相对估算值，用于横向对比，非绝对指标。
 * ============================================================================ */
window.AIDATA = (function () {

  /* ---- 阶段定义：AI 介入程度的"阶梯" --------------------------------------- */
  // 从浅到深，描述 AI 在一个领域里介入的递进关系
  const LEVELS = [
    { id: 0, name: '工具辅助',  desc: 'AI 作为效率工具，人主导决策。如语法检查、补全。',         color: '#5b8def' },
    { id: 1, name: '部分自动化', desc: 'AI 接管标准化子流程，关键节点仍由人把关。',                color: '#39c0a0' },
    { id: 2, name: '深度协作',   desc: '人机共同产出，AI 提供主要方案、人审阅修改。',              color: '#f5b54a' },
    { id: 3, name: '高度自治',   desc: 'AI 自主完成端到端任务，人做例外审核与策略设定。',          color: '#f0723c' },
    { id: 4, name: '自主代理',   desc: 'AI 持续自主运行、自主决策，人仅做目标设定与监督。',        color: '#e0556b' }
  ];

  /* ---- 扩张速度刻度 --------------------------------------------------------- */
  const SPEED = {
    explosive: { label: '爆发式', desc: '12 个月内渗透率快速翻倍，资本与人才高度集中' },
    fast:      { label: '快速',   desc: '年化渗透率显著提升，已越过早期采用者阶段' },
    steady:    { label: '稳健',   desc: '持续增长但受合规、基础设施或成本约束' },
    slow:      { label: '缓慢',   desc: '受限于安全验证、监管或长周期验证' }
  };

  /* ---- 应用领域 ------------------------------------------------------------ */
  // penetration: 介入深度 0-100（映射到 LEVELS）
  // adoption:    采用率/普及度 0-100（已经被多广泛使用）
  // maturity:    成熟度 1-5（产品/工程化成熟）
  // market:      相对市场规模权重（用于气泡图）
  // speed:       扩张速度 key
  // timeline:    关键里程碑年份 -> 该领域当年渗透估算（用于时间轴动画）
  const DOMAINS = [
    {
      id: 'code', name: '软件开发', icon: '⌨️', category: '技术',
      penetration: 78, adoption: 82, maturity: 4, market: 90, speed: 'explosive', risk: '中',
      summary: 'AI 编程助手从补全走向自主代理，正在改写软件生产方式。',
      deployed: [
        { where: 'GitHub Copilot / Cursor / Cline', depth: 'IDE 内实时代码补全与多文件生成', level: 2 },
        { where: '企业内部 Devin / OpenAI Codex 类代理', depth: '承接独立任务工单，端到端开发', level: 3 },
        { where: '代码审查与 PR 自动化', depth: '自动检测缺陷、生成测试、合并低风险改动', level: 2 },
        { where: '遗留系统迁移与重构', depth: 'COBOL/老旧代码自动翻译、文档化', level: 1 }
      ],
      future: [
        '需求→设计→编码→部署的全流程自主代理成为常态',
        '人类工程师角色向"系统设计 + 评审"上移',
        '软件生产成本下降带来长尾应用爆发'
      ]
    },
    {
      id: 'content', name: '内容创作', icon: '🎨', category: '创意',
      penetration: 72, adoption: 88, maturity: 4, market: 95, speed: 'explosive', risk: '中',
      summary: '文本、图像、视频、音频四条线均已大规模商用，门槛急剧降低。',
      deployed: [
        { where: '文案/营销写作（ChatGPT、Claude、Jasper）', depth: '日常营销内容批量生成', level: 2 },
        { where: '图像生成（Midjourney、Flux、即梦）', depth: '设计、广告、插画商用', level: 3 },
        { where: '视频生成（Sora、可灵、Veo、Runway）', depth: '短片、广告、分镜与特效', level: 2 },
        { where: '音乐/配音（Suno、ElevenLabs）', depth: '完整歌曲、多语种配音', level: 2 }
      ],
      future: [
        '生成视频时长与一致性突破，进入长内容生产',
        '个性化内容"一人一版"成为投放标准',
        '版权与训练数据治理成为核心博弈点'
      ]
    },
    {
      id: 'assistant', name: '个人 AI 助理 / Agent', icon: '🤖', category: '通用',
      penetration: 60, adoption: 65, maturity: 3, market: 98, speed: 'explosive', risk: '中',
      summary: '从"问答机器人"演进为能调用工具、自主完成任务的代理。',
      deployed: [
        { where: '通用对话助手（ChatGPT、Gemini、豆包、元宝）', depth: '日常问答、写作、翻译', level: 2 },
        { where: 'Operator / Computer Use 类浏览器代理', depth: '代为点击、预订、填表', level: 3 },
        { where: '企业工作流 Agent', depth: '处理邮件、日程、报表、跨系统操作', level: 2 }
      ],
      future: [
        '个人专属 Agent 记忆长期化，成为"数字分身"',
        '多 Agent 协作完成复杂事务（订票、报销、采购）',
        '隐私、授权与误操作责任界定成为关键'
      ]
    },
    {
      id: 'search', name: '搜索与信息获取', icon: '🔍', category: '通用',
      penetration: 58, adoption: 70, maturity: 4, market: 85, speed: 'fast', risk: '低',
      summary: 'AI 改造搜索：从"链接列表"走向"直接答案 + 多步推理"。',
      deployed: [
        { where: 'Perplexity / Google AI Overviews / 秘塔', depth: '直接生成答案并附引用', level: 2 },
        { where: '深度研究模式', depth: '多轮检索后产出长报告', level: 2 },
        { where: '电商/本地搜索生成式改版', depth: '商品与商家推荐对话化', level: 2 }
      ],
      future: [
        '搜索流量向"答案"迁移，传统 SEO 模式重塑',
        '垂直领域专业检索（医学、法律、科研）爆发',
        '信息可信度与溯源机制成为竞争核心'
      ]
    },
    {
      id: 'cs', name: '客服与呼叫中心', icon: '🎧', category: '服务',
      penetration: 75, adoption: 80, maturity: 4, market: 78, speed: 'fast', risk: '低',
      summary: 'AI 客服从"话术机器人"升级为可挂电话、可办业务的语音代理。',
      deployed: [
        { where: '在线文本客服', depth: '多轮对话解决常见问题、转人工', level: 3 },
        { where: '语音外呼/呼入（ElevenLabs、AI 电话）', depth: '预约、回访、催收、销售', level: 3 },
        { where: '坐席辅助', depth: '实时建议话术、情绪识别、知识检索', level: 2 }
      ],
      future: [
        '大量标准化坐席岗位被替代，向"AI + 少量高价值人工"演进',
        '多语种实时客服打破跨境服务壁垒',
        '人工转向复杂投诉与关系维护'
      ]
    },
    {
      id: 'health', name: '医疗健康', icon: '⚕️', category: '生命科学',
      penetration: 45, adoption: 50, maturity: 3, market: 92, speed: 'steady', risk: '高',
      summary: '影像、制药、辅助诊疗三线并进，受监管验证约束扩张节奏。',
      deployed: [
        { where: '医学影像 AI（肺结节、眼底、病理）', depth: '筛查辅助，医师复核', level: 2 },
        { where: 'AI 制药（AlphaFold、生成式分子设计）', depth: '靶点发现、蛋白结构、分子生成', level: 2 },
        { where: '诊疗大模型（Med-GPT 类）', depth: '辅助诊断、病历生成、医嘱建议', level: 1 },
        { where: '健康管理与可穿戴', depth: '慢病监测、风险预警', level: 1 }
      ],
      future: [
        'AI 发现的候选药物陆续进入临床',
        '个性化诊疗与"数字医生"分诊普及',
        '责任归属与临床证据要求决定落地速度'
      ]
    },
    {
      id: 'science', name: 'AI for Science', icon: '🔬', category: '生命科学',
      penetration: 55, adoption: 40, maturity: 3, market: 70, speed: 'fast', risk: '中',
      summary: 'AI 成为科研"第五范式"，加速物理、化学、生物、材料发现。',
      deployed: [
        { where: '蛋白质结构与设计（AlphaFold 系列）', depth: '结构预测、从头设计蛋白', level: 3 },
        { where: '材料与催化剂发现', depth: '筛选新材料、预测性质', level: 2 },
        { where: '数学与物理（FunSearch 等）', depth: '辅助提出与验证新猜想', level: 1 },
        { where: '气象与聚变控制', depth: '预测与实时优化', level: 2 }
      ],
      future: [
        'AI 驱动的发现周期以"周"计，传统以"年"计',
        '跨学科通用科研助手出现',
        '可复现性与实验验证仍是关键瓶颈'
      ]
    },
    {
      id: 'finance', name: '金融', icon: '💰', category: '专业服务',
      penetration: 62, adoption: 68, maturity: 4, market: 88, speed: 'fast', risk: '高',
      summary: '风控、投研、交易、客服全线智能化，数据与合规优势叠加。',
      deployed: [
        { where: '风控与反欺诈', depth: '实时交易评分、异常检测', level: 3 },
        { where: '智能投研与报告', depth: '自动撰写研报、财报解读', level: 2 },
        { where: '量化与算法交易', depth: '信号生成、组合优化', level: 3 },
        { where: '智能投顾与保险定价', depth: '个性化配置与核保', level: 2 }
      ],
      future: [
        '信贷与保险定价颗粒度进一步提升',
        'AI Agent 自主执行投资与对冲操作（受监管约束）',
        '模型可解释性与公平性监管趋严'
      ]
    },
    {
      id: 'edu', name: '教育', icon: '📚', category: '公共服务',
      penetration: 50, adoption: 60, maturity: 3, market: 80, speed: 'fast', risk: '中',
      summary: '从工具走向"个性化导师"，正在重塑教、学、评三个环节。',
      deployed: [
        { where: '个性化辅导（可汗 Khanmigo 等）', depth: '一对一分步骤讲解', level: 2 },
        { where: '作业批改与口语评测', depth: '自动评分与反馈', level: 2 },
        { where: '教学内容生成与备课', depth: '教案、习题、课件', level: 2 }
      ],
      future: [
        '"AI 导师 + 教师引导"混合模式普及',
        '学习路径完全个性化',
        '学术诚信与评价方式面临重构'
      ]
    },
    {
      id: 'legal', name: '法律', icon: '⚖️', category: '专业服务',
      penetration: 48, adoption: 45, maturity: 3, market: 60, speed: 'steady', risk: '高',
      summary: '检索、审查、起草环节 AI 渗透快，出庭与判断仍以人为主。',
      deployed: [
        { where: '合同审查与起草', depth: '条款识别、风险标注', level: 2 },
        { where: '法律检索（Harvey 类）', depth: '类案、法规检索与摘要', level: 2 },
        { where: '合规与尽调', depth: '文件自动化审阅', level: 2 }
      ],
      future: [
        '标准法律产品（合同、咨询）价格大幅下降',
        '律师向复杂诉讼与策略上移',
        '执业准入与责任认定规则更新'
      ]
    },
    {
      id: 'mfg', name: '制造与工业', icon: '🏭', category: '实体经济',
      penetration: 40, adoption: 45, maturity: 3, market: 82, speed: 'steady', risk: '中',
      summary: 'AI 进入质检、排产、维护、供应链，工业大模型加速落地。',
      deployed: [
        { where: '机器视觉质检', depth: '缺陷检测，替代部分人工', level: 3 },
        { where: '预测性维护', depth: '设备故障预警', level: 2 },
        { where: '排产与供应链优化', depth: '需求预测、库存与调度', level: 2 }
      ],
      future: [
        '工业大模型统一"设计-生产-质检"流程',
        '柔性制造与小批量定制成本下降',
        '数据孤岛与现场集成仍是落地门槛'
      ]
    },
    {
      id: 'av', name: '自动驾驶', icon: '🚗', category: '实体经济',
      penetration: 38, adoption: 35, maturity: 3, market: 90, speed: 'steady', risk: '高',
      summary: 'L2+ 辅助驾驶大规模量产，Robotaxi 在多城开放运营。',
      deployed: [
        { where: 'L2/L2+ 辅助驾驶（端到端模型）', depth: '城市/高速领航，人监控', level: 2 },
        { where: 'Robotaxi（Waymo、萝卜快跑等）', depth: '限定区域无人运营', level: 3 },
        { where: '港口/矿区无人运输', depth: '封闭场景全无人', level: 4 }
      ],
      future: [
        '端到端大模型提升泛化能力',
        'Robotaxi 区域与规模持续扩张',
        '事故责任与保险体系重新设计'
      ]
    },
    {
      id: 'robot', name: '机器人 / 具身智能', icon: '🦾', category: '实体经济',
      penetration: 25, adoption: 20, maturity: 2, market: 85, speed: 'fast', risk: '中',
      summary: 'VLA 大模型让通用机器人快速进步，进入实验室与小规模商用。',
      deployed: [
        { where: '仓储/物流机器人', depth: '分拣、搬运，结构化场景', level: 3 },
        { where: '人形机器人（Figure、Optimus 等）', depth: '演示与小规模试点', level: 1 },
        { where: '服务机器人（清洁、配送、酒店）', depth: '商业化落地', level: 2 }
      ],
      future: [
        '通用人形机器人进入工厂与家庭试点',
        '"大脑"大模型 + "小脑"控制分层架构成熟',
        '成本下降带来规模化拐点'
      ]
    },
    {
      id: 'ecom', name: '电商与零售', icon: '🛒', category: '服务',
      penetration: 65, adoption: 75, maturity: 4, market: 90, speed: 'fast', risk: '中',
      summary: '推荐、搜索、营销、客服、商品生成都已深度 AI 化。',
      deployed: [
        { where: '推荐与个性化搜索', depth: '千人千面、实时排序', level: 4 },
        { where: 'AI 模特与商品图/视频生成', depth: '替代部分拍摄', level: 3 },
        { where: '虚拟试穿与直播数字人', depth: '全天候带货', level: 2 },
        { where: '智能选品与定价', depth: '动态定价、库存预测', level: 2 }
      ],
      future: [
        '生成式电商：用户描述即生成商品方案',
        'AI 买手/导购代理跨平台比价下单',
        '供应链端到端 AI 协同'
      ]
    },
    {
      id: 'sec', name: '网络安全', icon: '🛡️', category: '技术',
      penetration: 55, adoption: 60, maturity: 3, market: 75, speed: 'fast', risk: '高',
      summary: '攻防双方都用 AI，安全运营从"人海战术"走向自动化。',
      deployed: [
        { where: '威胁检测与响应（XDR/SOC）', depth: '异常识别、自动处置', level: 2 },
        { where: '钓鱼/深度伪造检测', depth: '识别 AI 生成的攻击', level: 2 },
        { where: '漏洞挖掘与代码审计', depth: '辅助发现漏洞', level: 1 }
      ],
      future: [
        '自主安全运营 Agent 24 小时值守',
        '攻防进入"模型对模型"对抗时代',
        'AI 武器化与防御能力同步升级'
      ]
    },
    {
      id: 'agri', name: '农业', icon: '🌾', category: '实体经济',
      penetration: 22, adoption: 20, maturity: 2, market: 55, speed: 'slow', risk: '中',
      summary: '精准农业起步，AI 用于识别、决策，但受基础设施与成本约束。',
      deployed: [
        { where: '病虫害与杂草识别', depth: '图像识别指导施药', level: 2 },
        { where: '产量与气候预测', depth: '辅助种植决策', level: 1 },
        { where: '无人农机与采摘', depth: '局部自动化作业', level: 2 }
      ],
      future: [
        '从"单点识别"走向"农场级决策"',
        '卫星 + 物联网 + AI 形成闭环',
        '小农户可负担的轻量化方案是关键'
      ]
    },
    {
      id: 'hr', name: 'HR 与招聘', icon: '🧑‍💼', category: '专业服务',
      penetration: 50, adoption: 55, maturity: 3, market: 50, speed: 'fast', risk: '中',
      summary: '简历筛选、面试、培训环节 AI 化，效率与公平争议并存。',
      deployed: [
        { where: '简历解析与匹配', depth: '自动筛选、人岗匹配', level: 3 },
        { where: 'AI 视频面试与评估', depth: '初筛、能力评估', level: 2 },
        { where: '员工培训与知识管理', depth: '个性化学习路径', level: 2 }
      ],
      future: [
        '招聘全流程自动化代理',
        'AI 偏见与就业公平监管强化',
        '内部人才流动与技能图谱智能化'
      ]
    },
    {
      id: 'energy', name: '能源与电力', icon: '⚡', category: '实体经济',
      penetration: 35, adoption: 30, maturity: 2, market: 70, speed: 'steady', risk: '中',
      summary: 'AI 用于电网调度、新能源预测与能效管理，扩张稳健。',
      deployed: [
        { where: '风光出力与负荷预测', depth: '提升新能源消纳', level: 2 },
        { where: '电网调度与虚拟电厂', depth: '实时优化与需求响应', level: 2 },
        { where: '数据中心能效优化', depth: '冷却、调度降能耗', level: 2 }
      ],
      future: [
        'AI 自身耗能成为电网重要负荷，"AI 优化 vs AI 消耗"博弈',
        '虚拟电厂规模化参与电力市场',
        '碳排放追踪与优化智能化'
      ]
    }
  ];

  /* ---- 时间轴：AI 整体能力 / 应用广度的相对指数（2018 -> 2027 预测） -------- */
  // capability: 基础模型能力；breadth: 应用领域广度；autonomy: 自主代理成熟度
  const TIMELINE = [
    { year: 2018, capability: 10, breadth: 8,  autonomy: 3,  note: '预训练兴起，BERT/GPT-1，能力有限' },
    { year: 2019, capability: 15, breadth: 12, autonomy: 4,  note: 'GPT-2，文本生成质量跃升' },
    { year: 2020, capability: 22, breadth: 18, autonomy: 5,  note: 'GPT-3，少样本学习，应用爆发起点' },
    { year: 2021, capability: 30, breadth: 25, autonomy: 7,  note: 'CLIP/DALL·E，多模态起步' },
    { year: 2022, capability: 42, breadth: 38, autonomy: 9,  note: 'ChatGPT 发布，对话式 AI 普及元年' },
    { year: 2023, capability: 58, breadth: 55, autonomy: 14, note: 'GPT-4、开源浪潮，AI 全面进入工作流' },
    { year: 2024, capability: 70, breadth: 70, autonomy: 24, note: '多模态成熟，视频生成、Agent 雏形' },
    { year: 2025, capability: 80, breadth: 82, autonomy: 40, note: '编程/代理爆发，Computer Use 落地' },
    { year: 2026, capability: 86, breadth: 88, autonomy: 55, note: 'Agent 走向生产，端到端任务常态化（当下）' },
    { year: 2027, capability: 91, breadth: 93, autonomy: 68, note: '预测：通用代理规模化，具身智能试点（预测）' }
  ];

  /* ---- 按领域的扩张曲线（渗透率 2018->2027） ------------------------------ */
  // 取若干代表领域，用于对比扩张节奏
  const DOMAIN_CURVES = [
    { id: 'code',     values: [2, 4, 8, 15, 30, 55, 70, 78, 82, 86] },
    { id: 'content',  values: [3, 6, 10, 18, 35, 60, 80, 85, 88, 91] },
    { id: 'cs',       values: [8, 12, 18, 28, 45, 60, 70, 75, 80, 84] },
    { id: 'health',   values: [5, 8, 12, 18, 25, 32, 40, 45, 52, 60] },
    { id: 'av',       values: [6, 9, 13, 18, 24, 30, 34, 38, 44, 52] },
    { id: 'robot',    values: [2, 3, 5, 7, 10, 14, 18, 22, 28, 38] }
  ];

  /* ---- 大类聚合（用于分类筛选与雷达图） ----------------------------------- */
  const CATEGORIES = ['技术', '创意', '通用', '服务', '生命科学', '专业服务', '实体经济', '公共服务'];

  return { LEVELS, SPEED, DOMAINS, TIMELINE, DOMAIN_CURVES, CATEGORIES };
})();
