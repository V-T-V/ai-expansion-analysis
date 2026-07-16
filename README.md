# 🧭 AI 扩张分析

> 一个**纯前端、零依赖**的可视化项目，分析 AI 的扩张方向、应用深度、介入程度、已经应用的场景，以及对未来的预测。

直接用浏览器打开 `index.html` 即可，无需安装、无需构建、无需联网。

---

## ✨ 它回答什么问题

| 你想知道的 | 对应板块 |
|---|---|
| AI 在**哪些方面**应用？ | 领域全景卡片（18 个领域，8 大类） |
| 应用的**深度**如何？ | 渗透热力图、扩张气泡图、KPI「介入深度」 |
| 已经在**哪里**应用了？ | 点击任一领域 → 详情抽屉「已经应用在哪里」 |
| **介入程度**如何？ | 介入阶梯 L0–L4（工具辅助 → 自主代理） |
| 未来会**走向何方**？ | 详情抽屉「未来预测」+ 时间轴 2027 预测 |
| 哪些扩张**最快**？ | 卡片速度标签（爆发式 / 快速 / 稳健 / 缓慢） |

---

## 🗺️ 主要可视化

1. **🌐 AI 扩张全景图（气泡图）** — 横轴采用率、纵轴介入深度、气泡大小=市场、颜色=阶段。四象限直观区分「自主化前沿 / 高度自治 / 起步探索 / 深度嵌入」。
2. **🪜 介入阶梯** — L0 工具辅助 → L1 部分自动化 → L2 深度协作 → L3 高度自治 → L4 自主代理，每个阶段挂载对应领域。
3. **📈 时间轴** — 2018→2027 三条曲线：模型能力 / 应用广度 / 自治代理，2026 为「当下」，之后为预测。
4. **🔥 渗透热力图** — 领域 × 5 维度（介入深度、采用率、成熟度、扩张速度、自主倾向）的颜色矩阵。
5. **🗂️ 领域卡片 + 详情抽屉** — 每个领域含：概述、4 项指标、**已应用场景及各自介入级别**、未来预测、扩张曲线对比。

所有图表均可交互：**悬停看明细，点击深入探索**。

---

## 🎯 决策场景分析（真实业务怎么办）

领域级 0-100 分回答不了"我这个具体业务该不该用 AI、用到哪一级"。决策场景分析把这层补上：

**选一个真实决策场景 → 看推演结果**

12 个场景覆盖医疗、金融、制造、客服、教育、法律、电商、研发、自动驾驶、创业、制药、HR，每个场景输出：

| 输出 | 含义 |
|---|---|
| **ROI 判定** | 强烈建议推进 / 建议试点 / 观望为主 / 暂不建议（价值 vs 成本） |
| **建议介入级别** | L0-L4，受场景约束（合规/风险容忍/数据就绪）压低 |
| **分步实施路径** | 从 L0 到建议级别的逐级递进，每级标注前置条件 + 已验证案例参考 |
| **风险卡点** | 合规/安全/数据/成熟度/预算 中的短板，以及怎么应对 |
| **场景约束** | 预算/风险容忍/合规/数据就绪/紧迫性 五维可视 |

推理逻辑可解释：`建议级别 = min(领域已验证级别, 场景约束允许上限)`。例如银行风控领域已达 L3，但强监管把上限压到 L2 → 标注"被约束压低"，并解释原因。

点击任意领域卡片 → 详情抽屉底部也有"该领域关联的决策场景"快速预览。

---

## 📁 项目结构

```
ai-expansion-analysis/
├── index.html          # 主页面
├── css/
│   └── style.css       # 暗色仪表盘样式
├── js/
│   ├── data.js         # 数据层（领域、阶梯、时间轴、曲线）
│   ├── viz.js          # 可视化层（Canvas 渲染，零依赖）
│   └── app.js          # 应用逻辑（统计、筛选、抽屉）
├── assets/
└── README.md
```

---

## 📊 评分体系说明

所有数值（`penetration` / `adoption` / `market` 等）均为 **0–100 的相对估算值**，用于横向对比，不是绝对指标。

- **介入深度 (penetration)**：AI 在该领域决策链中的自主程度，映射到 L0–L4 阶梯。
- **采用率 (adoption)**：该应用已被多广泛地实际使用。
- **成熟度 (maturity)**：1–5，产品与工程化成熟度。
- **扩张速度 (speed)**：爆发式 / 快速 / 稳健 / 缓慢，综合资本、人才、渗透增速。

数据综合公开行业报告与观察，截至 **2026 年中**，并包含 **2027 年预测**。

---

## 🚀 本地运行

```bash
# 方式一：直接双击 index.html（用静态估算数据）

# 方式二：起一个本地服务器（推荐，能加载动态评估数据）
cd ai-expansion-analysis
python -m http.server 8000
# 然后访问 http://localhost:8000
```

---

## 🔄 动态评估引擎（engine/）

`js/data.js` 是**静态快照**。`engine/` 是一套**动态评估管线**，把分数从"人工估算"变成"信号驱动 + 持续更新"。

### 一行运行

```bash
node engine/run.js            # 真实采集（arXiv/HN/GitHub/News）
node engine/run.js --synth    # 合成模式（无网也能跑，用于演示/测试）
node scripts/product-check.js # 产品化门禁
node scripts/export-report.js # 导出 Markdown 趋势报告
node scripts/export-html-report.js # 导出 HTML 趋势门户页

# 可选：设置 GitHub token 把 GitHub 源真实率从 ~56% 提到 100%
# （无 token 时 GitHub 无鉴权限速，约 10 次/分钟，18 领域会有一半降级）
export GITHUB_TOKEN=ghp_xxx   # 或 Windows: set GITHUB_TOKEN=ghp_xxx
```

**实测真实率**（2026-07，无 token）：

| 源 | 真实率 | 说明 |
|---|---|---|
| arXiv | 100% | 稳定，`totalResults` 元数据提供跨领域区分度 |
| Hacker News | 100% | Algolia API 稳定 |
| GitHub | ~56% | 无 token 限速；设 `GITHUB_TOKEN` 后 100% |
| News | 100% | 聚合 TechCrunch/VentureBeat/Verge，宽关键词 per-domain 归属 |

每跑一轮会：
1. **全量并发采集** 4 个真实数据源（18 领域 × 4 源同时起飞，每源独立并发闸门控速；失败自动降级到合成，标记 `synthetic:true`）
2. 信号归一化 → 时间衰减 → **语义加权**（arXiv 标题/摘要深度词）→ 加权 → 锚点校准 → 综合分 0-100 + **置信度**
3. 存一份带时间戳（精确到秒）的快照到 `engine/snapshots/`
4. 对比上一轮算**一阶 delta + 二阶加速度**，检测异动告警
5. 输出 `engine/output/latest.json` + `replay.json`

页面刷新后会**自动加载** `latest.json`：顶部"动态评估数据"横幅 + 告警面板 + 历史回放滑块 + **新兴雷达 + 趋势外推 + 加速度榜**（≥2 个快照后出现）；若文件不存在则安静回退到静态数据。

### 工程优化

- **并发采集 + 速率控制**：每个源独立并发闸门（GitHub 最保守=2，避免触发限速）；`_http.js` 内置 5 分钟内存缓存 + 指数退避重试（429/5xx 自动重试）
- **CI 校验脚本**：`node scripts/verify.js`（35 项检查：语法 + 数据完整性 + 合成管线端到端 + 告警逻辑单测）；`--full` 额外跑真实采集
- **产品化门禁**：`node scripts/product-check.js` 检查静态仪表盘、动态引擎、输出快照、报告导出和产品文档是否齐备
- **趋势报告导出**：`node scripts/export-report.js` 基于 `engine/output/latest.json` 生成 `reports/trend-report-*.md`；`node scripts/export-html-report.js` 生成可发布的 `reports/trend-portal-*.html`
- **置信度标注**：每个领域分数带 0-100 置信度（真实源数加权），卡片右上角徽章 + 详情抽屉显示，让"这个分有多可信"一目了然

### 评估模型

```
score = Σ( 维度分ᵢ × 权重ᵢ ) × 时间衰减 × 相对增长 − 风险扣分
        ↑ adoption .30 / depth .25 / maturity .22 / speed .18 / risk .05
        ↑ 再与人工锚点基线融合，避免脱离常识
```

| 维度 | 信号来源 | 含义 |
|---|---|---|
| 介入深度 depth | arXiv 论文时效加权量 | 科研/技术深度 |
| 采用率 adoption | Hacker News 热度 + 新闻量 | 实际普及度 |
| 成熟度 maturity | GitHub 仓库数 + top stars | 工程化/生态 |
| 扩张速度 speed | 近期信号密度 | 增长势头 |
| 风险 risk | 新闻风险关键词命中 | 监管/安全事故（负向）|

### 告警类型

- 📈 **趋势异动**：单轮评分变化 ≥ 12 分
- 🚀 **爆发激增**：扩张速度显著加快
- 🆕 **新兴机会**：采用率低但增速排名前 25%

### 引擎结构

```
engine/
├── config.js          # 权重/关键词/衰减半衰期/阈值/锚点
├── sources/           # 4 个真实采集源（各自带 synthetic 降级）
│   ├── arxiv.js  hn.js  github.js  news.js  _http.js
├── scorer.js          # 归一化 + 时间衰减 + 加权 + 锚点校准
├── snapshot.js        # 快照存储 + 历史回放 + 加速度
├── alerts.js          # 异动告警检测
├── run.js             # 管线编排（入口）
├── snapshots/         # 历史快照（每轮一个）
└── output/            # latest.json + replay.json（仪表盘消费）
```

### 定时更新

```bash
# Linux/macOS cron，每 6 小时跑一次
0 */6 * * * cd /path/ai-expansion-analysis && node engine/run.js >> engine/output/cron.log 2>&1

# 或 Windows 任务计划器，触发器设为每日多次，操作为：
node D:\M_X_M\ai-expansion-analysis\engine\run.js
```

跑得越多，`snapshots/` 积累越多，历史回放滑块能回放的时点越密，时间轴越接近"真实演变"而非"预设曲线"。

---

## 🔧 扩展数据

**调整动态评分**：编辑 `engine/config.js`
- `WEIGHTS`：各维度权重（投资视角可加大资本/人才权重）
- `KEYWORDS.领域`：检索关键词，决定召回质量
- `ANCHORS.领域`：人工基线 + 锚点强度（慢变领域调高 anchor）
- `NORM_BASELINE`：归一化基数（信号整体偏高/偏低时调）

**新增领域**：在 `js/data.js` 的 `DOMAINS` 加条目，同时在 `engine/config.js` 的 `KEYWORDS` 和 `ANCHORS` 加对应配置即可。

静态领域对象的字段：

```js
{
  id, name, icon, category,
  penetration, adoption, maturity, market, speed, risk, summary,
  deployed: [{ where, depth, level }],  // 已应用场景
  future: []                             // 未来预测
}
```

---

> 免责声明：本项目数据为基于公开信息的相对估算，用于趋势感知与横向对比，不构成投资或决策建议。
