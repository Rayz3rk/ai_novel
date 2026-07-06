# AI 小说导演

面向长篇小说、网文和章节化创作的 AI 工作台。

它不是“一句话生成整本书”的黑盒，而是把创作过程拆成项目、设定、章节、伏笔、故事状态、审阅、改写、日志和工具协作几个可管理的环节。

## 当前能力

- 项目管理：按作品维度管理题材、状态、默认语气、目标读者等基础信息。
- 章节创作台：生成下一章、重生成章节、查看 contract / planner / guard / repair 过程。
- 章节编辑器：编辑正文、保存草稿、章节审阅、导出章节、查看历史版本。
- 设定库：管理角色、世界观、地点、道具、能力体系等结构化设定。
- 设定提取器：从章节文本或手动文本中抽取候选设定，再导入设定库。
- 伏笔线程：记录伏笔内容、埋设章节、预期回收章节、关联线索和状态。
- 改写 / 润色：支持整章或选中片段的润色、定向修改、多风格改写。
- 故事状态：汇总活跃设定、关系线、延续压力、伏笔板和状态时间线。
- MCP / Tools：管理 MCP Server、调用 Tool、执行 MCP Agent 任务。
- I/O 记录：追踪生成、审阅、改写、提取等流程的输入输出，便于排错。
- 导出：支持项目全文和单章导出为 `txt`、`markdown`、`docx`、`pdf`、`epub`。

## 技术栈

- 前端：React 18 + Vite
- 后端：Express
- 数据库：PostgreSQL
- 文档导出：`docx`、`pdf-lib`、`pdfkit`、`jszip`
- 图标：`lucide-react`

## 快速启动

### 方式一：一键启动

Windows 下直接运行：

```bat
start-dev.bat
```

这个脚本会自动做几件事：

- 检查 `node` / `npm`
- 缺少 `node_modules` 时自动执行 `npm install`
- 缺少 `.env` 时从 `.env.example` 复制
- 同时启动前端和后端

### 方式二：命令行启动

```bash
npm install
npm run dev
```

启动后默认地址：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`
- 状态接口：`http://localhost:8787/api/state`

## 环境配置

默认 `.env.example`：

```bash
PORT=8787
AI_PROVIDER=mock
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novel

# Optional OpenAI-compatible provider.
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com/v1
# AI_MODEL=your-model-name
```

说明：

- `AI_PROVIDER=mock` 时使用本地模拟 AI，适合先把前后端跑起来。
- 切换到 OpenAI 兼容接口时，填写 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`AI_MODEL`。
- 数据库默认连接本地 PostgreSQL：`novel`。

## 数据库

服务启动时会自动初始化所需表结构。当前核心数据包括：

- `projects`
- `settings`
- `chapters`
- `chapter_versions`
- `foreshadows`
- `reports`
- `io_logs`

如果本地 PostgreSQL 账号、密码或端口不同，修改 `.env` 里的 `DATABASE_URL` 即可。

## 常用脚本

```bash
npm run dev
npm run build
npm run preview
npm run start
```

含义：

- `dev`：同时启动前端和后端
- `build`：构建前端产物到 `dist/`
- `preview`：本地预览前端构建结果
- `start`：仅启动后端服务

## 目录结构

```text
.
├─ server/                 # Express 服务、AI 配置、导出、MCP 运行时
├─ src/
│  ├─ components/          # 通用 UI 组件
│  ├─ features/            # 按业务拆分的页面与面板
│  │  ├─ chapter-editor/
│  │  ├─ chapter-generation/
│  │  ├─ chapter-workflow/
│  │  ├─ io-logs/
│  │  ├─ mcp/
│  │  ├─ rewrite/
│  │  ├─ settings/
│  │  ├─ skills/
│  │  ├─ story-state/
│  │  ├─ studio/
│  │  └─ threads/
│  ├─ hooks/               # 自定义 hooks
│  ├─ lib/                 # 共享 helper、常量、路由、格式化工具
│  ├─ main.jsx             # 应用入口与页面装配
│  └─ styles.css           # 全局样式
├─ start-dev.bat
├─ package.json
└─ README.md
```

## 分层约定

当前代码按下面的职责拆分：

- `src/features/*`：页面和业务面板，尽量按功能域组织。
- `src/components/*`：不绑定具体业务的可复用组件。
- `src/lib/*`：纯 helper、常量、格式化、路由、共享状态工具。
- `src/hooks/*`：跨 feature 复用的 hook。
- `server/*`：接口、工作流、AI 配置、MCP 运行时、导出逻辑。

如果继续拆分，优先原则是：

- 页面逻辑留在 `features`
- 可复用但不含业务语义的能力下沉到 `lib` 或 `hooks`
- 不要再把大段共享 helper 堆回 `main.jsx`

## 关键文件

- [src/main.jsx](/D:/aproj_python/ai_novel/src/main.jsx)：应用入口、顶层状态和页面装配。
- [server/index.js](/D:/aproj_python/ai_novel/server/index.js)：主要 API 与工作流编排。
- [server/ai-config.js](/D:/aproj_python/ai_novel/server/ai-config.js)：章节生成、审阅、改写等 AI 配置。
- [src/lib/app-constants.js](/D:/aproj_python/ai_novel/src/lib/app-constants.js)：前端共享常量。

## 说明

- 当前项目是单仓库前后端一体开发模式。
- 前端构建通过后，产物输出到 `dist/`。
- 最近已清理主要页面乱码，README 也已同步到当前页面结构和功能命名。
