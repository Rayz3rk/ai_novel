import React from "react";
import { Edit3, FileText, Plus } from "lucide-react";
import { EmptyState } from "../../components/EmptyState.jsx";
import { PlotMap } from "../story-state/StoryStatePanels.jsx";

export function ChapterGenerationPage({
  project,
  working,
  workspace,
  openChapterEditorPage,
  openBlankChapterEditorPage,
  formatTime
}) {
  const { selectedChapter } = workspace;

  function openCurrentChapterEditor() {
    if (!project?.id) return;
    const chapterId = selectedChapter?.id || project.chapters[0]?.id || "";
    if (chapterId) {
      openChapterEditorPage(project.id, chapterId);
      return;
    }
    openBlankChapterEditorPage(project.id);
  }

  return (
    <section className="chapter-page">
      <div className="panel chapter-page-header">
        <div>
          <p className="eyebrow">章节创作台</p>
          <h2>章节创作台</h2>
          <p className="chapter-page-note">
            从这里进入章节编辑、查看现有章节脉络，并快速开始新章节草稿。
          </p>
        </div>
        <div className="chapter-page-toolbar">
          <button
            className="secondary-button"
            type="button"
            disabled={Boolean(working)}
            onClick={openCurrentChapterEditor}
          >
            <Edit3 size={16} />
            编辑当前章节
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={Boolean(working)}
            onClick={() => openBlankChapterEditorPage(project.id)}
          >
            <Plus size={16} />
            新建空白章节
          </button>
        </div>
      </div>

      <div className="chapter-page-grid chapter-generation-overview-grid">
        <div className="panel chapter-generation-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">章节总览</p>
              <h2>章节结构与脉络</h2>
            </div>
            <FileText size={20} />
          </div>
          {project.chapters.length ? (
            <div className="chapter-generation-summary">
              <div className="editor-footer">
                <span>章节数：{project.chapters.length}</span>
                <span>
                  最近更新：
                  {formatTime(project.chapters[0]?.updatedAt || project.chapters[0]?.createdAt)}
                </span>
              </div>
              <PlotMap project={project} />
            </div>
          ) : (
            <EmptyState text="还没有章节，先在右侧新建一章。" />
          )}
        </div>

        <div className="panel chapter-generation-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">快速入口</p>
              <h2>进入章节编辑器</h2>
            </div>
            <Edit3 size={20} />
          </div>
          <p className="chapter-page-note">
            如果已经选中了章节，会优先打开当前章节；如果还没有章节，可以直接新建空白章节并开始写作。
          </p>
          <div className="standalone-entry-actions">
            <button
              className="primary-button"
              type="button"
              disabled={Boolean(working)}
              onClick={openCurrentChapterEditor}
            >
              <FileText size={16} />
              打开章节编辑器
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={Boolean(working)}
              onClick={() => openBlankChapterEditorPage(project.id)}
            >
              <Plus size={16} />
              新建章节草稿
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
