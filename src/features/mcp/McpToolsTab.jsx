import React, { useEffect, useState } from "react";
import { BrainCircuit, Plus, RefreshCw, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";

export function McpToolsTab({
  project,
  mcp = {},
  mutate,
  working,
  mcpToolCall = null,
  mcpAgentRun = null,
  buildMcpServerDraft,
  parseMcpArgs,
  parseJsonDraft,
  formatJsonBlock
}) {
  const runtimeServers = Array.isArray(mcp?.servers) ? mcp.servers : [];
  const runtimeTools = Array.isArray(mcp?.tools) ? mcp.tools : [];
  const runtimeResources = Array.isArray(mcp?.resources) ? mcp.resources : [];
  const runtimePrompts = Array.isArray(mcp?.prompts) ? mcp.prompts : [];
  const [serversDraft, setServersDraft] = useState(() => runtimeServers.map((item) => buildMcpServerDraft(item)));
  const [toolForm, setToolForm] = useState({
    serverId: runtimeTools[0]?.serverId || runtimeServers[0]?.id || "",
    toolName: runtimeTools[0]?.name || "",
    argumentsText: "{}"
  });
  const [agentForm, setAgentForm] = useState({
    task: "",
    systemPrompt: "",
    selectedServerIds: runtimeServers.filter((item) => item.status === "ready").map((item) => item.id)
  });

  useEffect(() => {
    setServersDraft(runtimeServers.map((item) => buildMcpServerDraft(item)));
  }, [buildMcpServerDraft, JSON.stringify(runtimeServers)]);

  useEffect(() => {
    setToolForm((current) => {
      const nextServerId =
        current.serverId && runtimeServers.some((item) => item.id === current.serverId)
          ? current.serverId
          : runtimeTools[0]?.serverId || runtimeServers[0]?.id || "";
      const candidateTools = runtimeTools.filter((item) => item.serverId === nextServerId);
      const nextToolName =
        current.toolName && candidateTools.some((item) => item.name === current.toolName)
          ? current.toolName
          : candidateTools[0]?.name || "";

      return {
        ...current,
        serverId: nextServerId,
        toolName: nextToolName
      };
    });
  }, [JSON.stringify(runtimeTools), JSON.stringify(runtimeServers)]);

  useEffect(() => {
    setAgentForm((current) => {
      const validIds = new Set(runtimeServers.filter((item) => item.status === "ready").map((item) => item.id));
      const selected = current.selectedServerIds.filter((item) => validIds.has(item));
      return {
        ...current,
        selectedServerIds: selected.length ? selected : Array.from(validIds)
      };
    });
  }, [JSON.stringify(runtimeServers)]);

  const callableTools = runtimeTools.filter((item) => item.serverId === toolForm.serverId);
  const readyServers = runtimeServers.filter((item) => item.status === "ready");

  function updateServerDraft(serverId, key, value) {
    setServersDraft((current) =>
      current.map((item) => (item.id === serverId ? { ...item, [key]: value } : item))
    );
  }

  function addServerDraft() {
    setServersDraft((current) => [...current, buildMcpServerDraft()]);
  }

  function removeServerDraft(serverId) {
    setServersDraft((current) => current.filter((item) => item.id !== serverId));
  }

  async function saveServers(event) {
    event.preventDefault();
    await mutate(
      "/api/mcp/servers",
      {
        servers: serversDraft.map((item) => ({
          id: item.id,
          name: item.name,
          command: item.command,
          args: parseMcpArgs(item.args),
          cwd: item.cwd,
          enabled: item.enabled,
          env: parseJsonDraft(item.envText, {})
        }))
      },
      "保存 MCP Server 配置"
    );
  }

  async function refreshServers() {
    await mutate("/api/mcp/refresh", {}, "刷新 MCP 运行时");
  }

  async function callTool(event) {
    event.preventDefault();
    await mutate(
      "/api/mcp/tools/call",
      {
        serverId: toolForm.serverId,
        toolName: toolForm.toolName,
        arguments: parseJsonDraft(toolForm.argumentsText, {})
      },
      "调用 MCP Tool"
    );
  }

  async function runAgent(event) {
    event.preventDefault();
    await mutate(
      `/api/projects/${project.id}/mcp/agent-run`,
      {
        task: agentForm.task,
        systemPrompt: agentForm.systemPrompt,
        selectedServerIds: agentForm.selectedServerIds
      },
      "执行 MCP Agent"
    );
  }

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">MCP Servers</p>
            <h2>Server 配置</h2>
          </div>
          <BrainCircuit size={20} />
        </div>
        <form className="editor-form" onSubmit={saveServers}>
          <div className="card-actions">
            <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={addServerDraft}>
              <Plus size={16} />
              新增 Server
            </button>
            <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => refreshServers().catch(() => {})}>
              <RefreshCw size={16} />
              刷新运行时
            </button>
          </div>

          {serversDraft.length ? (
            <div className="cards setting-card-grid">
              {serversDraft.map((server) => {
                const runtime = runtimeServers.find((item) => item.id === server.id) || null;
                return (
                  <article className="asset-card" key={server.id}>
                    <label>
                      名称
                      <input value={server.name} onChange={(event) => updateServerDraft(server.id, "name", event.target.value)} placeholder="filesystem" />
                    </label>
                    <label>
                      Command
                      <input value={server.command} onChange={(event) => updateServerDraft(server.id, "command", event.target.value)} placeholder="npx" />
                    </label>
                    <label>
                      Args
                      <input value={server.args} onChange={(event) => updateServerDraft(server.id, "args", event.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem D:\\aproj_python\\ai_novel" />
                    </label>
                    <label>
                      工作目录
                      <input value={server.cwd} onChange={(event) => updateServerDraft(server.id, "cwd", event.target.value)} placeholder="可选" />
                    </label>
                    <label>
                      ENV(JSON)
                      <textarea rows={4} value={server.envText} onChange={(event) => updateServerDraft(server.id, "envText", event.target.value)} />
                    </label>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={server.enabled}
                        onChange={(event) => updateServerDraft(server.id, "enabled", event.target.checked)}
                      />
                      启用
                    </label>
                    <div className="editor-footer">
                      <span>状态：{runtime?.status || "未知"}</span>
                      <span>Tools：{runtime?.tools?.length || 0}</span>
                      <span>Resources：{runtime?.resources?.length || 0}</span>
                    </div>
                    {runtime?.error ? <small className="warning-text">{runtime.error}</small> : null}
                    <button className="danger-button" type="button" disabled={Boolean(working)} onClick={() => removeServerDraft(server.id)}>
                      <Trash2 size={16} />
                      删除
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState text="还没有 MCP server，先添加一个 stdio server 配置。" />
          )}

          <button className="primary-button" type="submit" disabled={Boolean(working)}>
            <Save size={16} />
            保存 MCP Server 配置
          </button>
        </form>
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Tool Runtime</p>
            <h2>Tools / Resources / Prompts</h2>
          </div>
          <Wand2 size={20} />
        </div>

        <form className="editor-form" onSubmit={callTool}>
          <label>
            Server
            <select
              value={toolForm.serverId}
              onChange={(event) =>
                setToolForm((current) => ({
                  ...current,
                  serverId: event.target.value,
                  toolName: runtimeTools.find((item) => item.serverId === event.target.value)?.name || ""
                }))
              }
            >
              <option value="">请选择</option>
              {runtimeServers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tool
            <select value={toolForm.toolName} onChange={(event) => setToolForm((current) => ({ ...current, toolName: event.target.value }))}>
              <option value="">请选择</option>
              {callableTools.map((tool) => (
                <option key={`${tool.serverId}-${tool.name}`} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arguments(JSON)
            <textarea rows={5} value={toolForm.argumentsText} onChange={(event) => setToolForm((current) => ({ ...current, argumentsText: event.target.value }))} />
          </label>
          <button className="primary-button" type="submit" disabled={Boolean(working) || !toolForm.serverId || !toolForm.toolName}>
            <Sparkles size={16} />
            调用 MCP Tool
          </button>
        </form>

        <div className="editor-footer">
          <span>可用 Tools：{runtimeTools.length}</span>
          <span>Resources：{runtimeResources.length}</span>
          <span>Prompts：{runtimePrompts.length}</span>
        </div>

        {mcpToolCall ? (
          <details className="io-log-card" open>
            <summary className="io-log-summary">
              <div>
                <strong>{mcpToolCall.serverName} / {mcpToolCall.toolName}</strong>
                <small>最近一次调用结果</small>
              </div>
            </summary>
            <div className="io-log-grid">
              <div>
                <strong>结果</strong>
                <pre className="io-log-pre">{formatJsonBlock(mcpToolCall.result)}</pre>
              </div>
              <div>
                <strong>stderr</strong>
                <pre className="io-log-pre">{mcpToolCall.stderr || "-"}</pre>
              </div>
            </div>
          </details>
        ) : null}

        {runtimeTools.length ? (
          <div className="cards setting-card-grid">
            {runtimeTools.map((tool) => (
              <article className="asset-card" key={`${tool.serverId}-${tool.name}`}>
                <h3>{tool.name}</h3>
                <p>{tool.description || "该 tool 暂无描述。"}</p>
                <div className="editor-footer">
                  <span>{tool.serverName}</span>
                </div>
                <pre className="io-log-pre">{formatJsonBlock(tool.inputSchema)}</pre>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState text="还没有发现 MCP tools，请确认 server 已成功连接并返回 tools/list。" />
        )}

        {runtimeResources.length ? (
          <div className="cards setting-card-grid">
            {runtimeResources.slice(0, 12).map((resource) => (
              <article className="asset-card" key={`${resource.serverId}-${resource.uri}`}>
                <h3>{resource.name || resource.uri}</h3>
                <p>{resource.description || resource.uri}</p>
                <div className="editor-footer">
                  <span>{resource.serverName}</span>
                  <span>{resource.mimeType || "unknown"}</span>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <div className="panel wide">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Agent Loop</p>
            <h2>MCP Agent 执行</h2>
          </div>
          <Sparkles size={20} />
        </div>
        <form className="editor-form" onSubmit={runAgent}>
          <small className="ai-config-hint">
            这里依赖当前 AI provider 支持 tool calling；如果本地 provider 不支持，Agent 任务可能无法正常执行。
          </small>
          <label>
            <textarea
              rows={5}
              value={agentForm.task}
              onChange={(event) => setAgentForm((current) => ({ ...current, task: event.target.value }))}
              placeholder="描述一个需要多个 MCP tool 协作完成的任务"
            />
          </label>
          <label>
            系统提示
            <textarea
              rows={3}
              value={agentForm.systemPrompt}
              onChange={(event) => setAgentForm((current) => ({ ...current, systemPrompt: event.target.value }))}
              placeholder="可选：补充执行边界，例如只允许读取当前项目目录"
            />
          </label>
          <div className="workflow-pill-list">
            {readyServers.map((server) => {
              const checked = agentForm.selectedServerIds.includes(server.id);
              return (
                <label className="workflow-pill inline-check" key={`agent-server-${server.id}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      setAgentForm((current) => ({
                        ...current,
                        selectedServerIds: event.target.checked
                          ? Array.from(new Set([...current.selectedServerIds, server.id]))
                          : current.selectedServerIds.filter((item) => item !== server.id)
                      }))
                    }
                  />
                  {server.name}
                </label>
              );
            })}
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={Boolean(working) || !agentForm.task.trim() || !agentForm.selectedServerIds.length}
          >
            <BrainCircuit size={16} />
            开始执行
          </button>
        </form>
        {mcpAgentRun ? (
          <details className="io-log-card" open>
            <summary className="io-log-summary">
              <div>
                <strong>最近一次 Agent 执行</strong>
                <small>{mcpAgentRun.toolCount} 次工具调用 / {mcpAgentRun.trace?.length || 0} 条轨迹</small>
              </div>
            </summary>
            <div className="io-log-grid">
              <div>
                <strong>最终结果</strong>
                <pre className="io-log-pre">{mcpAgentRun.finalText || ""}</pre>
              </div>
              <div>
                <strong>Tool Trace</strong>
                <pre className="io-log-pre">{formatJsonBlock(mcpAgentRun.trace || [])}</pre>
              </div>
            </div>
          </details>
        ) : (
          <EmptyState text="Agent 执行结果会显示在这里，前提是已连接可用 MCP tool。" />
        )}
      </div>
    </section>
  );
}
