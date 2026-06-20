# AI 小说导演

面向长篇小说和网文创作的 AI 工作台 MVP。它不是“一句话生成整本书”的续写器，而是把小说拆成项目、设定、章节、伏笔、诊断报告和改写任务来管理。

## 功能

- 项目库：一本小说一个项目，支持类型、卖点和目标读者。
- 设定库：角色、世界观、地点、道具、能力体系等结构化资产。
- 章节生成：按章节目标、冲突、语气、结尾钩子生成章节草稿和情节点。
- 一致性检查：对最新章节或指定章节输出红黄绿风险提示。
- 伏笔管理：记录埋设章节、预期回收章节、相关角色/道具和状态。
- 多版本改写：按“更网文化、文学化、紧张、暧昧、短剧化”等抽象风格润色。
- 情节地图：按章节展示关键情节点，辅助查看长篇结构。
- I/O 记录：保存章节生成 planner / writer、润色、扩写和检查的输入输出，方便排查协作问题。

## 本地运行

```bash
npm install
npm run dev
```

前端地址：

```text
http://localhost:5173
```

后端接口：

```text
http://localhost:8787/api/state
```

数据默认保存到 PostgreSQL 的 `novel` 数据库。服务启动时会自动创建以下表：

- `projects`
- `settings`
- `chapters`
- `chapter_versions`
- `foreshadows`
- `reports`
- `io_logs`

默认连接串：

```text
postgresql://postgres:postgres@localhost:5432/novel
```

如果你的本地 PostgreSQL 用户、密码或端口不同，在 `.env` 中改 `DATABASE_URL`。

## AI 服务配置

默认使用本地模拟 AI，方便无密钥直接试用。

如需接入 OpenAI 兼容接口，复制 `.env.example` 为 `.env`，并配置：

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novel
AI_PROVIDER=openai
OPENAI_API_KEY=你的密钥
OPENAI_BASE_URL=https://api.openai.com/v1
AI_MODEL=你的模型名
```

然后重新启动：

```bash
npm run dev
```

章节生成的协作 prompt 现已集中在 `server/ai-config.js`，需要调整智能体分工或提示词时优先改这里。

## 生产构建

```bash
npm run build
```

构建产物输出到 `dist/`。
