# MCP 联调指南

本文给出这个项目里最小可用的 MCP 联调方式，目标是先把 `Tools/MCP` 跑通，再验证 `设定抽取 / 章节生成 / 润色修改` 里的 MCP 增强与子 agent 编排。

## 1. 准备前提

- 已安装 `Node.js`
- 当前项目目录可正常执行 `npm`
- 已配置一个远程 AI provider
  - 本项目里的 MCP 工具调用和子 agent 编排都依赖远程模型
  - 仅 `local` provider 时，界面开关会显示，但不会真正进入 tool calling

## 2. 复制示例配置

把示例文件复制成正式配置文件：

```powershell
Copy-Item settings\mcp-servers.example.json settings\mcp-servers.json
```

默认示例已经包含一个最小可用的 `filesystem` server：

```json
{
  "servers": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "D:\\aproj_python\\ai_novel"
      ],
      "cwd": "D:\\aproj_python\\ai_novel",
      "enabled": true,
      "env": {}
    }
  ]
}
```

如果你的项目目录不同，把上面的路径改成你的实际工作目录。

## 3. 在界面里完成首次探测

打开 `Tools/MCP` 页面后按这个顺序操作：

1. 点击“刷新探测”
2. 确认 `filesystem` server 状态变成 `ready`
3. 确认 `Tools / Resources / Prompts` 区域出现内容

如果第一次执行较慢，通常是 `npx` 在拉取 `@modelcontextprotocol/server-filesystem`。

## 4. 做最小验证

先不要直接跑章节工作流，先用工具页做一轮验证：

### 方案 A：手动调工具

- Server 选 `Filesystem`
- Tool 选一个该 server 暴露出来的工具
- 传入一个最小 JSON 参数

### 方案 B：跑模型自主调用工具

在“模型自主调用工具”里输入类似任务：

```text
读取当前项目根目录下的文件结构，告诉我有哪些 server、src、settings 相关文件。
```

如果 trace 正常出现，说明：

- MCP server 启动成功
- tools/list 成功
- tool call 成功
- 当前远程模型支持工具调用

## 5. 验证业务链路

### 设定抽取

进入 `设定抽取` 页面：

- 勾选“用 MCP 先做研究增强”
- 可选再勾选“启用子 agent 小组编排”
- 选择一个章节或贴入文本后执行抽取

结果区会出现：

- 最近一次研究增强
- 最近一次子 Agent 编排

### 章节生成

进入 `章节生成` 页面：

- 勾选 `MCP 研究增强`
- 可选再勾选 `子 agent 小组编排`
- 先生成约束草案，再正式生成

页面会显示：

- 最近一次 MCP 研究
- 最近一次子 Agent 编排
- 常规 workflow trace

### 润色 / 修改

进入 `润色/修改` 页面：

- 可勾选 `子 agent 小组编排`
- 提交后先进入 transform，再做最终 humanize

结果区会显示最近一次子 agent 编排结果。

## 6. 常见问题

### 没有 `ready` server

优先检查：

- `command` 是否存在
- `cwd` 是否正确
- 路径是否有权限访问
- `npx` 首次安装是否被网络阻塞

### 工具页可用，但业务页没有真正调用

通常是以下原因之一：

- 当前 AI provider 还是 `local`
- 当前模型不支持 tool calling
- 页面里没有勾选对应开关
- 已选 server 不是 `ready`

### 想接更多 MCP server

直接在 `settings/mcp-servers.json` 里追加 `servers` 项即可。当前项目优先支持 `stdio` 型 MCP server。

## 7. 建议的联调顺序

建议严格按下面顺序排查：

1. `Tools/MCP` 页面探测成功
2. 手动工具调用成功
3. 模型自主调用工具成功
4. 设定抽取中的 MCP 研究成功
5. 章节生成中的 MCP + 子 agent 成功
6. 润色/修改中的子 agent 成功

这样最容易定位问题究竟出在 server、tool calling、还是业务工作流接线。
