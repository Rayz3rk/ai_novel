import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  Library,
  Plus,
  Save,
  Wand2
} from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { ToneComposer } from "../../components/ToneComposer.jsx";
import { useWebDraftState } from "../../hooks/useWebDraftState.js";
import { makeWebDraftKey } from "../../lib/webDraft.js";

function ChapterEditorPanel({
  project,
  mutate,
  working,
  selectedChapter,
  selectedDraft,
  updateDraft,
  saveDraft,
  saveChapter,
  downloadChapter,
  chapterDownloadFormat,
  setChapterDownloadFormat,
  onRewriteSelection,
  onOpenSettingExtractor,
  readTextSelection,
  buildPartialRewriteSelection,
  formatTime,
  SaveIndicator,
  DownloadFormatSelect
}) {
  const editorRef = useRef(null);
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const selectedLength = Math.max(0, selectionRange.end - selectionRange.start);

  useEffect(() => {
    setSelectionRange({ start: 0, end: 0 });
  }, [selectedChapter?.id]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    function syncSelectionFromDocument() {
      if (!editorRef.current) return;
      if (document.activeElement !== editorRef.current) return;
      setSelectionRange(readTextSelection(editorRef.current, selectedDraft?.content.length || 0));
    }

    document.addEventListener("selectionchange", syncSelectionFromDocument);
    return () => document.removeEventListener("selectionchange", syncSelectionFromDocument);
  }, [readTextSelection, selectedDraft?.content.length]);

  function syncSelectionRange(event) {
    const target = event?.target || editorRef.current;
    if (!target) return;
    setSelectionRange(readTextSelection(target, selectedDraft?.content.length || 0));
  }

  function sendSelectionToRewrite() {
    if (!selectedChapter || !selectedDraft) return;
    const selection = buildPartialRewriteSelection({
      chapter: selectedChapter,
      content: selectedDraft.content,
      start: selectionRange.start,
      end: selectionRange.end
    });
    if (!selection) return;
    onRewriteSelection?.(selection);
  }

  return (
    <div className="panel chapter-editor-panel">
      {selectedChapter && selectedDraft ? (
        <>
          <div className="panel-title">
            <div>
              <p className="eyebrow">Full Editor</p>
              <h2>章节正文编辑</h2>
            </div>
            <div className="toolbar-wrap">
              <SaveIndicator draft={selectedDraft} />
              {onOpenSettingExtractor && (
                <button className="secondary-button" disabled={Boolean(working)} onClick={onOpenSettingExtractor}>
                  <Library size={16} />
                  提取设定
                </button>
              )}
              <DownloadFormatSelect value={chapterDownloadFormat} onChange={setChapterDownloadFormat} />
              <button className="secondary-button" disabled={Boolean(working)} onClick={() => downloadChapter()}>
                <Download size={16} />
                导出章节
              </button>
              <button className="secondary-button" disabled={Boolean(working)} onClick={() => saveDraft(selectedChapter.id, { silent: false })}>
                <Save size={16} />
                保存草稿
              </button>
              <button className="primary-button" disabled={Boolean(working)} onClick={() => saveChapter(selectedChapter.id)}>
                <Save size={16} />
                保存入库
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(working)}
                onClick={() => mutate(`/api/projects/${project.id}/chapters/${selectedChapter.id}/check`, {}, "章节审阅")}
              >
                <CheckCircle2 size={16} />
                章节审阅
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(working) || !selectedLength}
                onClick={sendSelectionToRewrite}
              >
                <Wand2 size={16} />
                选中改写 / 润色
              </button>
            </div>
          </div>

          <div className="editor-meta-grid">
            <label>
              章节标题
              <input
                value={selectedDraft.title}
                onChange={(event) => updateDraft(selectedChapter.id, { title: event.target.value })}
                placeholder={`第${selectedChapter.number}章标题`}
              />
            </label>
            <label>
              章节语气
              <ToneComposer
                value={selectedDraft.tone}
                onChange={(tone) => updateDraft(selectedChapter.id, { tone })}
                placeholder="例如：冷峻、克制、热血、悬疑"
              />
            </label>
          </div>

          <div className="chapter-outline">
            {selectedChapter.beats.map((beat) => (
              <span key={beat}>{beat}</span>
            ))}
          </div>

          <label>
            正文内容
            <textarea
              ref={editorRef}
              className="chapter-editor-textarea"
              value={selectedDraft.content}
              onChange={(event) => updateDraft(selectedChapter.id, { content: event.target.value })}
              onFocus={syncSelectionRange}
              onKeyUp={syncSelectionRange}
              onMouseUp={syncSelectionRange}
              onSelect={syncSelectionRange}
              placeholder="在这里编辑章节正文，支持先保存草稿，再确认入库。"
            />
          </label>

          <div className="editor-footer">
            <span>最近更新：{formatTime(selectedChapter.updatedAt || selectedChapter.createdAt)}</span>
            <span>正文长度：{selectedDraft.content.trim().length}</span>
            <span>{selectedLength ? `已选中 ${selectedLength} 字，可发送到改写面板` : "可框选一段正文后发送到改写 / 润色"}</span>
          </div>
        </>
      ) : (
        <EmptyState text="请选择一个章节进行编辑。" />
      )}
    </div>
  );
}

function ChapterVersionPanel({ selectedChapter, restoreVersion, formatTime }) {
  return (
    <aside className="panel version-panel">
      <div className="panel-title compact">
        <h2>历史版本</h2>
        <span>{selectedChapter?.versions?.length || 0}</span>
      </div>
      {selectedChapter?.versions?.length ? (
        <div className="version-list">
          {selectedChapter.versions.map((version) => (
            <article className="version-card" key={version.id}>
              <header>
                <strong>{version.style || version.source}</strong>
                <span>{formatTime(version.createdAt)}</span>
              </header>
              <small>{version.source} · {version.tone}</small>
              <p>
                {version.content.slice(0, 120)}
                {version.content.length > 120 ? "..." : ""}
              </p>
              <button className="secondary-button" type="button" onClick={() => restoreVersion(selectedChapter.id, version)}>
                恢复此版本
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text="还没有历史版本。" />
      )}
    </aside>
  );
}

function ChapterDirectoryPanel({ project, selectedChapterId, onChangeChapter }) {
  const chapters = project.chapters || [];

  return (
    <aside className="panel chapter-directory-panel">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">目录</p>
          <h2>章节目录</h2>
        </div>
        <span>{chapters.length}</span>
      </div>
      <p className="chapter-page-note">
        在这里切换章节、查看标题和节拍数量。当前高亮项就是正在编辑的章节。
      </p>
      <div className="chapter-nav">
        {chapters.length ? (
          chapters.map((chapter) => (
            <button
              key={chapter.id}
              className={`chapter-nav-item ${chapter.id === selectedChapterId ? "active" : ""}`}
              type="button"
              onClick={() => onChangeChapter(chapter.id)}
            >
              <div>
                <span>第 {chapter.number} 章</span>
                <strong>{chapter.title}</strong>
              </div>
              <small>{chapter.beats?.length || 0} 个节拍</small>
            </button>
          ))
        ) : (
          <div className="chapter-directory-empty">
            <EmptyState text="还没有章节，先创建一个章节草稿。" />
          </div>
        )}
      </div>
    </aside>
  );
}

function ManualChapterDraftEditor({
  project,
  mutate,
  working,
  onCreatedChapter,
  standalone = false,
  buildManualChapterDraft,
  getNextChapterNumber,
  findProjectById
}) {
  const manualDraftKey = useMemo(() => makeWebDraftKey(project.id, "manual-chapter-draft"), [project.id]);
  const [draft, setDraft, resetDraft] = useWebDraftState(manualDraftKey, buildManualChapterDraft(project));
  const nextChapterNumber = getNextChapterNumber(project);

  async function createManualChapter() {
    const data = await mutate(`/api/projects/${project.id}/chapters/manual`, draft, "创建手动章节");
    if (data.pendingGenerationSessionId) {
      return;
    }
    const nextProject = findProjectById(data, project.id) || project;
    const createdChapterId =
      data.createdChapterId || nextProject.chapters[nextProject.chapters.length - 1]?.id || "";

    resetDraft(buildManualChapterDraft(nextProject));
    if (createdChapterId) {
      onCreatedChapter?.(createdChapterId);
    }
  }

  return (
    <div className={`panel ${standalone ? "chapter-editor-panel" : "manual-chapter-panel"}`}>
      <div className="panel-title">
        <div>
          <p className="eyebrow">{standalone ? "Standalone Draft" : "Manual Draft"}</p>
          <h2>{standalone ? "新建章节草稿" : "手动章节草稿"}</h2>
        </div>
        <div className="toolbar-wrap">
          <span className="draft-hint">先写草稿，再决定是否入库</span>
          <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => resetDraft(buildManualChapterDraft(project))}>
            重置草稿
          </button>
          <button className="primary-button" type="button" disabled={Boolean(working)} onClick={createManualChapter}>
            <Save size={16} />
            创建第 {nextChapterNumber} 章
          </button>
        </div>
      </div>

      <div className="editor-meta-grid">
        <label>
          章节标题
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder={`为第 ${nextChapterNumber} 章填写标题`}
          />
        </label>
        <label>
          章节语气
          <ToneComposer
            value={draft.tone}
            onChange={(tone) => setDraft((current) => ({ ...current, tone }))}
            placeholder="例如：热血、压抑、克制、轻松"
          />
        </label>
      </div>

      <label>
        正文内容
        <textarea
          className="chapter-editor-textarea"
          value={draft.content}
          onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
          placeholder="先写一个完整草稿，之后仍可继续编辑、改写或交给 AI 扩写。"
        />
      </label>
      <div className="editor-footer">
        <span>将创建为第 {nextChapterNumber} 章，创建后可继续细修</span>
        <span>草稿字数：{draft.content.trim().length}</span>
      </div>
    </div>
  );
}

export function ChapterEditorPage({
  project,
  mutate,
  working,
  workspace,
  downloadBinary,
  onBack,
  onChangeChapter,
  onCreateChapter,
  onRewriteSelection,
  onOpenSettingExtractor,
  isNewMode = false,
  buildManualChapterDraft,
  getNextChapterNumber,
  findProjectById,
  buildDownloadName,
  readTextSelection,
  buildPartialRewriteSelection,
  formatTime,
  SaveIndicator,
  DownloadFormatSelect
}) {
  const {
    selectedChapter,
    selectedChapterId,
    selectedDraft,
    setSelectedChapterId,
    updateDraft,
    saveDraft,
    saveChapter,
    restoreVersion
  } = workspace;
  const chapterDownloadKey = useMemo(() => makeWebDraftKey(project.id, "chapter-download-format"), [project.id]);
  const [chapterDownloadFormat, setChapterDownloadFormat] = useWebDraftState(chapterDownloadKey, "markdown");

  async function downloadChapter() {
    if (!selectedChapter) return;
    await downloadBinary(
      `/api/projects/${project.id}/chapters/${selectedChapter.id}/export?format=${encodeURIComponent(chapterDownloadFormat)}`,
      buildDownloadName(`第${selectedChapter.number}章-${selectedChapter.title}`, chapterDownloadFormat),
      "导出章节"
    );
  }

  function handleChapterChange(chapterId) {
    setSelectedChapterId(chapterId);
    onChangeChapter(chapterId);
  }

  return (
    <section className="chapter-page">
      <div className="panel chapter-page-header">
        <div>
          <p className="eyebrow">章节编辑器</p>
          <h2>
            {isNewMode
              ? "新建章节"
              : selectedChapter
                ? `第 ${selectedChapter.number} 章：${selectedChapter.title}`
                : "章节编辑器"}
          </h2>
          <p className="chapter-page-note">
            {isNewMode
              ? "先创建一个章节草稿，后续可以继续编辑、改写、审阅和入库。"
              : "在这里处理正文、历史版本、章节审阅和片段改写。"}
          </p>
        </div>
        <div className="chapter-page-toolbar">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回创作台
          </button>
        </div>
      </div>

      <div className="chapter-page-grid">
        <ChapterDirectoryPanel
          project={project}
          selectedChapterId={isNewMode ? "" : selectedChapterId}
          onChangeChapter={handleChapterChange}
        />
        {isNewMode ? (
          <ManualChapterDraftEditor
            project={project}
            mutate={mutate}
            working={working}
            standalone
            onCreatedChapter={onCreateChapter}
            buildManualChapterDraft={buildManualChapterDraft}
            getNextChapterNumber={getNextChapterNumber}
            findProjectById={findProjectById}
          />
        ) : (
          <ChapterEditorPanel
            project={project}
            mutate={mutate}
            working={working}
            selectedChapter={selectedChapter}
            selectedDraft={selectedDraft}
            updateDraft={updateDraft}
            saveDraft={saveDraft}
            saveChapter={saveChapter}
            downloadChapter={downloadChapter}
            chapterDownloadFormat={chapterDownloadFormat}
            setChapterDownloadFormat={setChapterDownloadFormat}
            onRewriteSelection={onRewriteSelection}
            onOpenSettingExtractor={() => selectedChapter && onOpenSettingExtractor?.(selectedChapter.id)}
            readTextSelection={readTextSelection}
            buildPartialRewriteSelection={buildPartialRewriteSelection}
            formatTime={formatTime}
            SaveIndicator={SaveIndicator}
            DownloadFormatSelect={DownloadFormatSelect}
          />
        )}
        {isNewMode ? (
          <div className="panel version-panel">
            <EmptyState text="新章节创建后，历史版本会显示在这里。" />
          </div>
        ) : (
          <ChapterVersionPanel
            selectedChapter={selectedChapter}
            restoreVersion={restoreVersion}
            formatTime={formatTime}
          />
        )}
      </div>
    </section>
  );
}
