/* ============================================================================
 * 动态评估引擎 · 配置层  (config.js)
 * 定义：信号权重、领域关键词（驱动多源采集）、时间衰减、归一化基线、告警阈值
 * 追踪目标=持续趋势，故权重偏向"持续可观测的存量/流量信号"
 * ============================================================================ */
'use strict';

/* ---- 信号权重（持续追踪趋势视角）----------------------------------------- *
 * adoption   采用率   ← 流量/产品热度（HN、News）
 * depth      介入深度 ← 学术与技术深度（arXiv、GitHub 复杂度）
 * maturity   成熟度   ← 工程化与生态（GitHub stars/repo、生产级信号）
 * speed      扩张速度 ← 近期增量（时间衰减后的增长率）
 * risk       风险     ← 监管/安全/负面（News 关键词）
 * 权重和无需归一，scorer 会再归一一次。
 */
const WEIGHTS = {
  adoption: 0.30,
  depth:    0.25,
  maturity: 0.22,
  speed:    0.18,
  risk:     0.05   // 风险作为调节项（负向），权重小
};

/* ---- 时间衰减：近期信号更可信 -------------------------------------------- *
 * score(t) = raw * 0.5 ^ ((now - t) / HALF_LIFE_DAYS)
 * 90 天半衰期：3 个月前的信号权重减半，符合趋势追踪的中期视角
 */
const HALF_LIFE_DAYS = 90;

/* ---- 归一化基线：相对值跨领域可比 ---------------------------------------- *
 * 每个源都有一个"典型满量程"基数，原始计数 / 基数 → 0-1。
 * 这些基数是经验值，用于把不同源的计数压到可比区间；可随观测调整。
 */
const NORM_BASELINE = {
  arxivHits:   60,   // 一个热门 AI 子领域月级 arXiv 论文量级
  hnPoints:    4000, // 一个热门话题季度累计 HN points 量级
  githubStars: 80,   // 千 stars 量级（top repo 的近似量级，单位 k）
  githubRepos: 50,   // 千 repos 量级
  newsVolume:  200,  // 一个领域月级新闻条数量级
  // 注：news 源在当前实现下区分度有限（单/少媒体 RSS 难覆盖 18 领域），
  // volume 常为 0、riskHits 跨领域相近。权重 0.20 + log 压缩使其影响可控。
  // 提升 news 价值的方向：接入多语种多源新闻 API（需 key）。
};

/* ---- 采集窗口 ------------------------------------------------------------ */
const WINDOWS = {
  arxivDays: 120,   // 检索近 120 天论文（覆盖衰减曲线多采样点）
  hnMonths: 3,      // 近 3 个月 HN
  newsDays: 30      // 近 30 天新闻
};

/* ---- News 专用关键词：比检索词更宽，用于在 RSS 全文里召回 per-domain 相关条 -- *
 * 作用：解决"几个媒体 RSS 覆盖不了 18 细分领域"的问题——不靠检索精确召回，
 *  而是把全部 feed 抓下来后，用宽关键词在标题+描述里做领域归属判定。
 *  这样 code/finance/health 等热门领域能拿到 10-30% 的相关条数，区分度可用。
 */
const NEWS_KEYWORDS = {
  code:     ['coding', 'code generation', 'copilot', 'software', 'developer', 'programming', 'code assistant'],
  content:  ['image generation', 'video generation', 'ai music', 'generative', 'midjourney', 'sora', 'text-to-'],
  assistant:['ai agent', 'agent', 'assistant', 'chatbot', 'copilot', 'claude', 'chatgpt', 'gemini'],
  search:   ['search', 'rag', 'retrieval', 'perplexity', 'answer engine'],
  cs:       ['customer service', 'call center', 'voice agent', 'support bot', 'chatbot'],
  health:   ['health', 'medical', 'drug', 'clinical', 'patient', 'doctor', 'hospital', 'diagnos'],
  science:  ['science', 'protein', 'material', 'research', 'alphafold', 'discovery'],
  finance:  ['finance', 'bank', 'trading', 'credit', 'invest', 'fintech', 'insurance', 'loan'],
  edu:      ['education', 'tutor', 'student', 'learning', 'school', 'teach'],
  legal:    ['legal', 'law', 'contract', 'compliance', 'lawsuit', 'attorney'],
  mfg:      ['manufactur', 'industrial', 'factory', 'production', 'supply chain', 'predictive maintenance'],
  av:       ['autonomous', 'driving', 'robotaxi', 'vehicle', 'self-driving', 'tesla', 'waymo'],
  robot:    ['robot', 'humanoid', 'embodied', 'manipulation', 'figure', 'optimus', 'tesla bot'],
  ecom:     ['ecommerce', 'retail', 'recommendation', 'shopping', 'merchant', 'store'],
  sec:      ['security', 'cyber', 'threat', 'vulnerab', 'breach', 'malware', 'phishing'],
  agri:     ['agriculture', 'farm', 'crop', 'agri', 'livestock'],
  hr:       ['recruit', 'hiring', 'hr ', 'resume', 'talent', 'workforce'],
  energy:   ['energy', 'grid', 'power', 'renewable', 'solar', 'battery', 'emission']
};

/* ---- 告警阈值 ------------------------------------------------------------ */
const ALERTS = {
  scoreDelta: 12,      // 单轮评分变化 ≥12 分 → 趋势异动
  speedSurge: 0.35,    // 加速度（二阶变化）≥35% → 爆发
  emergenceRatio: 0.45 // 采用率<45 但增速排名前 25% → 新兴机会
};

/* ---- 领域关键词：驱动多源检索 + 信号抽取 --------------------------------- *
 * 每个领域配 (en) 英文检索词（arXiv/HN/GitHub 用英文召回高）+ (cn) 中文词
 * intensity: 该领域对"自主/agent/autonomous"等深度词的天然敏感系数（修正偏差）
 */
const KEYWORDS = {
  code:     { en: ['AI coding', 'code generation', 'copilot', 'software engineering agent'], cn: ['AI编程','代码生成'], intensity: 1.15 },
  content:  { en: ['text to image', 'video generation', 'AI music', 'generative media'], cn: ['AI生成','文生图','文生视频'], intensity: 1.1 },
  assistant:{ en: ['AI agent', 'autonomous agent', 'personal assistant', 'computer use'], cn: ['AI助手','智能体'], intensity: 1.25 },
  search:   { en: ['AI search', 'answer engine', 'RAG retrieval'], cn: ['AI搜索','生成式搜索'], intensity: 0.95 },
  cs:       { en: ['AI customer service', 'voice agent', 'call center AI'], cn: ['智能客服','AI外呼'], intensity: 1.0 },
  health:   { en: ['AI drug discovery', 'medical imaging AI', 'AlphaFold', 'clinical AI'], cn: ['AI制药','医学影像'], intensity: 0.9 },
  science:  { en: ['AI for science', 'protein design', 'material discovery AI'], cn: ['AI科研','蛋白质设计'], intensity: 1.05 },
  finance:  { en: ['AI finance', 'algorithmic trading', 'credit risk AI'], cn: ['金融AI','智能投研'], intensity: 1.0 },
  edu:      { en: ['AI tutoring', 'education AI', 'personalized learning'], cn: ['AI教育','个性化学习'], intensity: 0.95 },
  legal:    { en: ['legal AI', 'contract review AI', 'legal research AI'], cn: ['法律AI','合同审查'], intensity: 0.9 },
  mfg:      { en: ['industrial AI', 'manufacturing AI', 'predictive maintenance AI'], cn: ['工业AI','智能制造'], intensity: 0.85 },
  av:       { en: ['autonomous driving', 'robotaxi', 'self driving', 'end to end driving'], cn: ['自动驾驶','无人驾驶'], intensity: 1.1 },
  robot:    { en: ['humanoid robot', 'embodied AI', 'VLA model', 'manipulation'], cn: ['人形机器人','具身智能'], intensity: 1.2 },
  ecom:     { en: ['AI ecommerce', 'recommendation AI', 'virtual try on'], cn: ['电商AI','智能推荐'], intensity: 0.95 },
  sec:      { en: ['AI cybersecurity', 'threat detection AI', 'security operations AI'], cn: ['AI安全','网络安全AI'], intensity: 1.0 },
  agri:     { en: ['precision agriculture AI', 'crop disease AI'], cn: ['智慧农业','AI农业'], intensity: 0.8 },
  hr:       { en: ['AI recruitment', 'HR AI', 'resume screening AI'], cn: ['AI招聘','智能HR'], intensity: 0.9 },
  energy:   { en: ['AI energy', 'grid AI', 'virtual power plant AI'], cn: ['能源AI','智能电网'], intensity: 0.85 }
};

/* ---- 人工基线锚点：把动态分数校准回"常识区间" ----------------------------- *
 * 完全靠信号波动会偏离常识（某月新闻少≠领域衰退）。这里给每个领域一个
 * 人工锚点 baseline 和惯性权重 anchor：最终分 = 信号分*(1-anchor) + baseline*anchor
 * anchor 越大越稳定（适合慢变领域），越小越敏感（适合热点领域）。
 */
const ANCHORS = {
  code:    { baseline: 78, anchor: 0.30 },
  content: { baseline: 72, anchor: 0.30 },
  assistant:{baseline: 60, anchor: 0.25 },
  search:  { baseline: 58, anchor: 0.35 },
  cs:      { baseline: 75, anchor: 0.35 },
  health:  { baseline: 45, anchor: 0.45 },
  science: { baseline: 55, anchor: 0.40 },
  finance: { baseline: 62, anchor: 0.35 },
  edu:     { baseline: 50, anchor: 0.35 },
  legal:   { baseline: 48, anchor: 0.45 },
  mfg:     { baseline: 40, anchor: 0.45 },
  av:      { baseline: 38, anchor: 0.40 },
  robot:   { baseline: 25, anchor: 0.35 },
  ecom:    { baseline: 65, anchor: 0.35 },
  sec:     { baseline: 55, anchor: 0.40 },
  agri:    { baseline: 22, anchor: 0.50 },
  hr:      { baseline: 50, anchor: 0.40 },
  energy:  { baseline: 35, anchor: 0.45 }
};

/* ---- 深度语义词：命中这些词说明 AI 介入更深（自主/agent/生产级）----------- *
 * arXiv/news 抽取时，标题/摘要里命中深度词的论文/新闻权重更高。
 * 这是"介入深度"信号从"纯计数"升级到"语义加权"的关键。
 */
const DEPTH_WORDS = [
  'autonomous', 'agent', 'end-to-end', 'production', 'deploy',
  'real-world', 'clinical', 'safety-critical', 'self-driving', 'humanoid',
  'robotaxi', 'closed-loop', 'decision', 'reasoning', 'planning',
  '自主', '智能体', '端到端', '生产', '落地', '临床', '闭环', '决策', '推理'
];

/* ---- 置信度：信号越真实、越齐全，分数越可信 ------------------------------ *
 * 每个源对最终分的"证据权重"不同（arXiv/GitHub 证据强，news 偏噪声）。
 * confidence = 真实源数加权 / 全源加权；合成源不计入证据。
 */
const SOURCE_CREDIBILITY = {
  arxiv: 0.30,
  github: 0.28,
  hn: 0.22,
  news: 0.20
};

module.exports = {
  WEIGHTS, HALF_LIFE_DAYS, NORM_BASELINE, WINDOWS, ALERTS,
  KEYWORDS, ANCHORS, DEPTH_WORDS, SOURCE_CREDIBILITY, NEWS_KEYWORDS
};
