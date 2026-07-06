import React, { useEffect, useMemo } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { useWebDraftState } from "../../hooks/useWebDraftState.js";
import { makeWebDraftKey } from "../../lib/webDraft.js";

export function SettingExtractorPage({
  project,
  mutate,
  working,
  mcp = {},
  routeChapterId = "",
  onBack,
  onChangeChapter,
  buildSettingExtractionDraft,
  findChapterById,
  buildChapterSourceText,
  findLatestIoLog,
  buildExtractedSettingDraft,
  settingTypes,
  ResearchTracePanel,
  AgentTracePanel,
  describeWorkflowTrace
}) {
  const extractorDraftKey = useMemo(
    () => makeWebDraftKey(project.id, "setting-extractor"),
    [project.id]
  );
  const [form, setForm] = useWebDraftState(
    extractorDraftKey,
    buildSettingExtractionDraft(project, routeChapterId)
  );
  const chapterIdsSignature = project.chapters.map((chapter) => chapter.id).join("|");
  const activeChapter =
    findChapterById(project, form.chapterId) ||
    findChapterById(project, routeChapterId) ||
    project.chapters[0] ||
    null;
  const sourceText =
    form.sourceMode === "chapter" ? buildChapterSourceText(activeChapter) : form.manualSource;
  const checkedCount = form.results.filter((item) => item.checked).length;
  const readyMcpServers = Array.isArray(mcp?.servers)
    ? mcp.servers.filter((item) => item.status === "ready")
    : [];
  const latestResearchLog = useMemo(
    () =>
      findLatestIoLog(project, {
        workflows: ["setting_extract"],
        stages: ["mcp_research"],
        chapterId: activeChapter?.id || routeChapterId || ""
      }),
    [project, activeChapter?.id, routeChapterId, findLatestIoLog]
  );
  const latestSubagentLog = useMemo(
    () =>
      findLatestIoLog(project, {
        workflows: ["setting_extract"],
        stages: ["subagents"],
        chapterId: activeChapter?.id || routeChapterId || ""
      }),
    [project, activeChapter?.id, routeChapterId, findLatestIoLog]
  );

  useEffect(() => {
    const fallbackChapterId = routeChapterId || form.chapterId || project.chapters[0]?.id || "";
    const normalizedChapterId = project.chapters.some((chapter) => chapter.id === fallbackChapterId)
      ? fallbackChapterId
      : project.chapters[0]?.id || "";
    const nextSourceMode =
      routeChapterId || (!project.chapters.length && form.sourceMode === "chapter")
        ? project.chapters.length && routeChapterId
          ? "chapter"
          : "manual"
        : form.sourceMode;

    setForm((current) => {
      if (
        current.chapterId === normalizedChapterId &&
        current.sourceMode === nextSourceMode
      ) {
        return current;
      }

      return {
        ...current,
        chapterId: normalizedChapterId,
        sourceMode: nextSourceMode
      };
    });
  }, [routeChapterId, project.chapters.length, chapterIdsSignature, project.id, form.chapterId, form.sourceMode, setForm]);

  async function submit(event) {
    event.preventDefault();
    if (!sourceText.trim()) return;

    const data = await mutate(
      `/api/projects/${project.id}/settings/extract`,
      {
        sourceMode: form.sourceMode,
        chapterId: form.sourceMode === "chapter" ? activeChapter?.id || "" : "",
        source: form.sourceMode === "manual" ? form.manualSource : sourceText,
        useMcp: form.useMcp && readyMcpServers.length > 0,
        useSubagents: form.useSubagents === true,
        selectedServerIds: form.useMcp ? form.selectedMcpServerIds : []
      },
      "提取设定"
    );

    setForm((current) => ({
      ...current,
      results: (data.extractionResult || []).map((item, index) =>
        buildExtractedSettingDraft(item, index)
      )
    }));
  }

  async function importSelected() {
    const items = form.results
      .filter((item) => item.checked)
      .map(({ type, name, summary, traits, rules, evidence }) => ({
        type,
        name,
        summary,
        traits,
        rules,
        evidence
      }));

    if (!items.length) return;

    await mutate(`/api/projects/${project.id}/settings/import`, { items }, "导入设定");
    setForm((current) => ({
      ...current,
      results: current.results.filter((item) => !item.checked)
    }));
  }

  function updateResult(tempId, patch) {
    setForm((current) => ({
      ...current,
      results: current.results.map((item) =>
        item.tempId === tempId ? { ...item, ...patch } : item
      )
    }));
  }

  function removeResult(tempId) {
    setForm((current) => ({
      ...current,
      results: current.results.filter((item) => item.tempId !== tempId)
    }));
  }

  function setSourceMode(sourceMode) {
    if (sourceMode === "chapter" && activeChapter?.id) {
      onChangeChapter?.(activeChapter.id);
    }
    if (sourceMode === "manual") {
      onChangeChapter?.("");
    }

    setForm((current) => ({
      ...current,
      sourceMode,
      chapterId: current.chapterId || project.chapters[0]?.id || ""
    }));
  }

  function handleChapterChange(chapterId) {
    setForm((current) => ({
      ...current,
      chapterId,
      sourceMode: "chapter"
    }));
    onChangeChapter?.(chapterId);
  }

  function toggleMcpServer(serverId, checked) {
    setForm((current) => ({
      ...current,
      selectedMcpServerIds: checked
        ? Array.from(new Set([...current.selectedMcpServerIds, serverId]))
        : current.selectedMcpServerIds.filter((item) => item !== serverId)
    }));
  }

  return (
    <section className="chapter-page">
      <div className="panel chapter-page-header">
        <div>
          <p className="eyebrow">Setting Extractor</p>
          <h2>设定提取器</h2>
          <p className="chapter-page-note">
            从章节或手动文本中抽取人物、地点、道具、规则等候选设定，确认后再导入设定库。
          </p>
        </div>
        <div className="chapter-page-toolbar">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回章节编辑
          </button>
        </div>
      </div>

      <div className="chapter-page-grid setting-extractor-grid">
        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Source</p>
              <h2>提取来源</h2>
            </div>
            <Sparkles size={20} />
          </div>
          <form className="editor-form" onSubmit={submit}>
            <div className="list-toolbar segmented">
              <button
                className={form.sourceMode === "chapter" ? "active" : ""}
                type="button"
                disabled={!project.chapters.length}
                onClick={() => setSourceMode("chapter")}
              >
                当前章节
              </button>
              <button
                className={form.sourceMode === "manual" ? "active" : ""}
                type="button"
                onClick={() => setSourceMode("manual")}
              >
                手动文本
              </button>
            </div>

            {form.sourceMode === "chapter" ? (
              project.chapters.length ? (
                <>
                  <label>
                    选择章节
                    <select
                      value={activeChapter?.id || ""}
                      onChange={(event) => handleChapterChange(event.target.value)}
                    >
                      {project.chapters.map((chapter) => (
                        <option key={chapter.id} value={chapter.id}>
                          第 {chapter.number} 章 · {chapter.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    章节内容
                    <textarea
                      className="chapter-editor-textarea extractor-source-textarea"
                      value={sourceText}
                      readOnly
                    />
                  </label>
                </>
              ) : (
                <EmptyState text="当前项目还没有章节，无法从章节中提取设定。" />
              )
            ) : (
              <label>
                待提取文本
                <textarea
                  className="chapter-editor-textarea extractor-source-textarea"
                  value={form.manualSource}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, manualSource: event.target.value }))
                  }
                  placeholder="粘贴一段正文、人物说明或世界观设定，系统会尝试识别其中的候选设定。"
                />
              </label>
            )}

            <div className="editor-footer">
              <span>来源字数：{sourceText.trim().length}</span>
              <span>{form.results.length ? `${form.results.length} 条候选` : "尚未提取"}</span>
            </div>

            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.useMcp && readyMcpServers.length > 0}
                disabled={!readyMcpServers.length}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    useMcp: event.target.checked,
                    selectedMcpServerIds: event.target.checked
                      ? current.selectedMcpServerIds.length
                        ? current.selectedMcpServerIds
                        : readyMcpServers.map((item) => item.id)
                      : current.selectedMcpServerIds
                  }))
                }
              />
              启用 MCP 辅助检索（仅在有可用 server 时生效）
            </label>
            <small className="ai-config-hint">
              {readyMcpServers.length
                ? `${readyMcpServers.length} 个可用 MCP server，可参与抽取`
                : "当前没有可用的 MCP server，将只使用本地抽取流程"}
            </small>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.useSubagents === true}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    useSubagents: event.target.checked
                  }))
                }
              />
              启用子代理协作（Scout / Classifier / Reviewer）
            </label>
            <small className="ai-config-hint">
              子代理会先拆分文本、分类候选和复核证据，再回传最终结果。
            </small>
            {form.useMcp && readyMcpServers.length ? (
              <div className="workflow-pill-list">
                {readyMcpServers.map((server) => (
                  <label className="workflow-pill inline-check" key={`extract-mcp-${server.id}`}>
                    <input
                      type="checkbox"
                      checked={form.selectedMcpServerIds.includes(server.id)}
                      onChange={(event) => toggleMcpServer(server.id, event.target.checked)}
                    />
                    {server.name}
                  </label>
                ))}
              </div>
            ) : null}

            <button className="primary-button" type="submit" disabled={Boolean(working) || !sourceText.trim()}>
              <Sparkles size={17} />
              提取设定
            </button>
          </form>
        </div>

        <div className="panel result-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Candidates</p>
              <h2>候选设定</h2>
            </div>
            <div className="panel-title-actions">
              <span>{checkedCount} / {form.results.length}</span>
              <button
                className="secondary-button"
                type="button"
                disabled={!form.results.length}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    results: current.results.map((item) => ({ ...item, checked: true }))
                  }))
                }
              >
                全选
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={!form.results.length}
                onClick={() => setForm((current) => ({ ...current, results: [] }))}
              >
                清空结果
              </button>
            </div>
          </div>
          <ResearchTracePanel
            title="MCP 检索轨迹"
            log={latestResearchLog}
            emptyText="未启用 MCP 检索"
            describeTrace={describeWorkflowTrace}
          />
          <AgentTracePanel
            title="子代理轨迹"
            log={latestSubagentLog}
            emptyText="暂无子代理记录"
            describeTrace={describeWorkflowTrace}
          />

          {form.results.length ? (
            <div className="extract-result-list">
              <div className="card-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={Boolean(working) || !checkedCount}
                  onClick={importSelected}
                >
                  <Plus size={16} />
                  导入勾选项到设定库
                </button>
              </div>

              {form.results.map((item) => (
                <article className="asset-card extracted-card" key={item.tempId}>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) => updateResult(item.tempId, { checked: event.target.checked })}
                    />
                    导入这条设定
                  </label>
                  <div className="form-row">
                    <label>
                      设定类型
                      <select
                        value={item.type}
                        onChange={(event) => updateResult(item.tempId, { type: event.target.value })}
                      >
                        {settingTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      名称
                      <input
                        value={item.name}
                        onChange={(event) => updateResult(item.tempId, { name: event.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    摘要
                    <textarea
                      rows={4}
                      value={item.summary}
                      onChange={(event) => updateResult(item.tempId, { summary: event.target.value })}
                    />
                  </label>
                  <label>
                    标签 / 特征
                    <input
                      value={item.traits}
                      onChange={(event) => updateResult(item.tempId, { traits: event.target.value })}
                    />
                  </label>
                  <label>
                    规则 / 约束
                    <textarea
                      rows={3}
                      value={item.rules}
                      onChange={(event) => updateResult(item.tempId, { rules: event.target.value })}
                    />
                  </label>
                  {item.evidence && <small className="extract-evidence">证据：{item.evidence}</small>}
                  <div className="card-actions">
                    <button className="danger-button" type="button" onClick={() => removeResult(item.tempId)}>
                      <Trash2 size={16} />
                      移除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState text="提取结果会显示在这里，可逐条编辑后导入。" />
          )}
        </div>
      </div>
    </section>
  );
}
