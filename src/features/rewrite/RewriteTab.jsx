import React, { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Plus, Save, Wand2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { useWebDraftState } from "../../hooks/useWebDraftState.js";
import { makeWebDraftKey } from "../../lib/webDraft.js";
import { buildHumanizeSkillSummary } from "../skills/skill-utils.js";

export function RewriteTab({
  project,
  mutate,
  streamText,
  working,
  workspace,
  rewritePrefill,
  clearRewritePrefill,
  skills = [],
  buildRewriteDraft,
  buildTransformVersionLabel,
  findLatestIoLog,
  rewriteStyles,
  AgentTracePanel,
  describeWorkflowTrace
}) {
  const { selectedChapter, selectedDraft, selectedChapterId, setSelectedChapterId, applyRewrite, saveRewriteVersion } = workspace;
  const rewriteDraftKey = useMemo(
    () => makeWebDraftKey(project.id, `rewrite-${selectedChapterId || "default"}`),
    [project.id, selectedChapterId]
  );
  const [form, setForm] = useWebDraftState(rewriteDraftKey, buildRewriteDraft());
  const [isStreaming, setIsStreaming] = useState(false);
  const isPartialRewrite =
    form.sourceMode === "selection" && form.selectionContext?.chapterId === selectedChapterId;
  const isModifyMode = form.mode === "modify";
  const actionNoun = isModifyMode ? "修改" : "润色";
  const versionLabel = buildTransformVersionLabel(form);
  const latestSubagentLog = useMemo(
    () =>
      findLatestIoLog(project, {
        workflows: ["rewrite", "modify"],
        stages: ["subagents"],
        chapterId: selectedChapterId || ""
      }),
    [project, selectedChapterId, findLatestIoLog]
  );

  const source = form.followChapter ? selectedDraft?.content || "" : form.manualSource;
  const canSubmit = source.trim() && (!isModifyMode || form.instruction.trim());

  useEffect(() => {
    if (!rewritePrefill || rewritePrefill.chapterId !== selectedChapterId) return;

    setForm((current) => ({
      ...current,
      followChapter: false,
      sourceMode: "selection",
      selectionContext: rewritePrefill,
      manualSource: rewritePrefill.selectedText,
      result: ""
    }));
    clearRewritePrefill?.(null);
  }, [rewritePrefill, selectedChapterId, setForm, clearRewritePrefill]);

  useEffect(() => {
    if (form.sourceMode !== "selection") return;
    if (form.selectionContext?.chapterId === selectedChapterId) return;

    setForm((current) => ({
      ...current,
      followChapter: true,
      sourceMode: "chapter",
      selectionContext: null,
      manualSource: "",
      result: ""
    }));
  }, [form.sourceMode, form.selectionContext, selectedChapterId, setForm]);

  async function submit(event) {
    event.preventDefault();
    setIsStreaming(true);
    setForm((current) => ({ ...current, result: "" }));

    try {
      const result = await streamText(
        `/api/projects/${project.id}/transform/stream`,
        {
          mode: form.mode,
          source,
          style: isModifyMode ? undefined : form.style,
          instruction: isModifyMode ? form.instruction : undefined,
          useSubagents: form.useSubagents === true,
          tone: selectedDraft?.tone || project.defaultTone,
          chapterId: selectedChapterId,
          rewriteScope: isPartialRewrite ? "selection" : form.followChapter ? "chapter" : "manual",
          selectionStart: isPartialRewrite ? form.selectionContext?.start : undefined,
          selectionEnd: isPartialRewrite ? form.selectionContext?.end : undefined
        },
        isModifyMode ? "执行定向修改" : "执行润色",
        {
          onDelta: (_delta, fullText) => {
            setForm((current) => ({ ...current, result: fullText }));
          }
        }
      );
      setForm((current) => ({ ...current, result }));
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Transform</p>
            <h2>润色 / 定向修改</h2>
          </div>
          <Wand2 size={20} />
        </div>
        {project.chapters.length ? (
          <form className="editor-form" onSubmit={submit}>
            <div className="list-toolbar segmented">
              <button
                className={isModifyMode ? "" : "active"}
                disabled={Boolean(working) || isStreaming}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    mode: "polish",
                    result: ""
                  }))
                }
                type="button"
              >
                润色模式
              </button>
              <button
                className={isModifyMode ? "active" : ""}
                disabled={Boolean(working) || isStreaming}
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    mode: "modify",
                    result: ""
                  }))
                }
                type="button"
              >
                定向修改
              </button>
            </div>
            <label>
              选择章节
              <select value={selectedChapterId} onChange={(event) => setSelectedChapterId(event.target.value)}>
                {project.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    第 {chapter.number} 章 · {chapter.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={form.followChapter}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    followChapter: event.target.checked,
                    sourceMode: event.target.checked ? "chapter" : "manual",
                    selectionContext: event.target.checked ? null : current.selectionContext
                  }))
                }
              />
              直接使用当前章节草稿作为输入
            </label>
            {isPartialRewrite && (
              <div className="selection-callout">
                <strong>已选片段，可直接{actionNoun}</strong>
                <span>
                  第 {form.selectionContext.chapterNumber} 章 · 已选 {form.selectionContext.selectedText.length} 字
                </span>
              </div>
            )}
            <label>
              来源文本
              <textarea
                rows={13}
                value={source}
                readOnly={form.followChapter}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    manualSource: event.target.value,
                    sourceMode: current.sourceMode === "selection" ? "selection" : "manual"
                  }))
                }
                placeholder={isPartialRewrite ? "将基于当前选中的片段进行处理" : "粘贴需要处理的文本"}
              />
            </label>
            {isModifyMode ? (
              <label>
                修改要求
                <textarea
                  rows={4}
                  value={form.instruction}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      instruction: event.target.value
                    }))
                  }
                  placeholder={isPartialRewrite ? "说明希望如何调整这段内容" : "描述你希望对当前文本做出的具体修改"}
                />
              </label>
            ) : (
              <label>
                润色风格
                <select
                  value={form.style}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      style: event.target.value
                    }))
                  }
                >
                  {rewriteStyles.map((style) => (
                    <option key={style}>{style}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="editor-footer">
              <span>当前语气：{selectedDraft?.tone || project.defaultTone}</span>
              <span>输入字数：{source.trim().length}</span>
              <span>{project.humanizeEnabled === false ? "未启用 AI 去模板化" : buildHumanizeSkillSummary(skills)}</span>
              <span>
                {isPartialRewrite
                  ? "本次将只处理选中的正文片段"
                  : isModifyMode
                    ? "本次将根据要求执行定向修改"
                    : "本次将对整段文本进行润色"}
              </span>
            </div>
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
              启用子代理协作（Content Guard / Style Architect / Continuity Reviewer）
            </label>
            <small className="ai-config-hint">
              子代理会先做约束检查和风格分析，再汇总给主模型执行。
            </small>
            <button className="primary-button" disabled={Boolean(working) || isStreaming || !canSubmit} type="submit">
              <Wand2 size={17} />
              {isStreaming ? `正在${actionNoun}...` : isPartialRewrite ? `处理选中片段并${actionNoun}` : `开始${actionNoun}`}
            </button>
          </form>
        ) : (
          <EmptyState text="请先创建章节。" />
        )}
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Result</p>
            <h2>{actionNoun}结果</h2>
          </div>
          <MessageSquareText size={20} />
        </div>
        <AgentTracePanel
          title="子代理轨迹"
          log={latestSubagentLog}
          emptyText="本次未启用子代理 / 暂无记录"
          describeTrace={describeWorkflowTrace}
        />
        {isStreaming && <p className="stream-hint">正在{actionNoun}，结果会实时写入下方。</p>}
        {form.result ? (
          <>
            <textarea
              className="rewrite-result-textarea"
              value={form.result}
              onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))}
            />
            <div className="card-actions">
              <button
                className="primary-button"
                disabled={Boolean(working) || !selectedChapter}
                onClick={() =>
                  selectedChapter &&
                  applyRewrite(selectedChapter.id, {
                    content: form.result,
                    style: versionLabel,
                    scope: isPartialRewrite ? "selection" : "chapter",
                    selectionContext: isPartialRewrite ? form.selectionContext : null
                  })
                }
                type="button"
              >
                <Save size={16} />
                {isPartialRewrite ? "替换选中内容" : "覆盖当前草稿"}
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(working) || !selectedChapter}
                onClick={() =>
                  selectedChapter &&
                  saveRewriteVersion(selectedChapter.id, {
                    content: form.result,
                    style: versionLabel,
                    scope: isPartialRewrite ? "selection" : "chapter",
                    selectionContext: isPartialRewrite ? form.selectionContext : null
                  })
                }
                type="button"
              >
                <Plus size={16} />
                {isPartialRewrite ? "存为片段版本" : "另存为新版本"}
              </button>
            </div>
          </>
        ) : (
          <EmptyState text={`${actionNoun}结果会显示在这里。`} />
        )}
      </div>
    </section>
  );
}
