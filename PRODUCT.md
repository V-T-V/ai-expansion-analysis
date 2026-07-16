# AI Expansion Analysis 产品化执行档案

## 产品定位

AI 应用扩张趋势雷达。目标是把静态观察升级为可持续更新的技术趋势门户，展示领域热度、介入深度、成熟度、风险和异动。

## 目标用户

- 产品和战略人员：判断 AI 应用机会和扩张速度。
- 技术管理者：观察模型能力、工程成熟度和生态信号。
- 内容作者 / 研究员：生成趋势报告和领域对比。
- 投资或创新团队：把公开信号转成可解释仪表盘。

## 最小产品闭环

1. 打开仪表盘查看 18 个领域的相对评分。
2. 点击领域查看已应用场景、介入级别和未来预测。
3. 动态引擎采集 arXiv、HN、GitHub、News 信号。
4. 生成快照、趋势 delta、告警和 replay。
5. 页面加载最新数据并标注置信度。

## 当前优势

- 纯前端仪表盘可直接打开。
- 已有动态评估引擎、快照、告警、回放和置信度概念。
- 数据源覆盖科研、开发者、新闻和社区讨论。
- 可导出 Markdown 趋势报告，适合沉淀为周报、专题页或研究门户内容。

## 近期路线

- M1：把定时采集流程产品化，固定 `latest.json`、`replay.json`、`product-status.json` 与历史快照入口。
- M2：将 `tiny-edge-models` 纳入知识库，作为端侧 AI 专题（见 `topics/edge-ai.md`）。
- M3：增加领域配置编辑和指标解释面板。
- M4：扩展 Markdown / HTML 趋势报告，形成可发布研究内容。HTML 门户通过 `node scripts/export-html-report.js` 生成。
- M5：补数据源健康页，明确真实源、降级源和置信度。

## 产品化验收

- 无网络时静态快照可展示。
- 有网络时 `node engine/run.js --synth` 和真实采集流程可运行。
- 仪表盘明确显示数据时间、置信度和告警原因。
- `node scripts/verify.js`、`node scripts/product-check.js`、`node scripts/export-report.js`、`node scripts/export-html-report.js` 通过。
