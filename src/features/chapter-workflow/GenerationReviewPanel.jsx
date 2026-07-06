import React from "react";
import { Save, Trash2 } from "lucide-react";

function summarizeInlineText(text, limit = 88) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "暂无";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function countTextUnits(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function splitRevisionBlocks(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRevisionDiffSummary(beforeText, afterText) {
  const before = String(beforeText || "").trim();
  const after = String(afterText || "").trim();
  const beforeBlocks = splitRevisionBlocks(before);
  const afterBlocks = splitRevisionBlocks(after);
  const maxBlocks = Math.max(beforeBlocks.length, afterBlocks.length);
  let changedBlocks = 0;
  let firstChangedBlock = null;

  for (let index = 0; index < maxBlocks; index += 1) {
    const beforeBlock = beforeBlocks[index] || "";
    const afterBlock = afterBlocks[index] || "";
    if (beforeBlock !== afterBlock) {
      changedBlocks += 1;
      if (!firstChangedBlock) {
        firstChangedBlock = {
          index: index + 1,
          before: summarizeInlineText(beforeBlock, 76),
          after: summarizeInlineText(afterBlock, 76)
        };
      }
    }
  }

  return {
    beforeUnits: countTextUnits(before),
    afterUnits: countTextUnits(after),
    deltaUnits: countTextUnits(after) - countTextUnits(before),
    changedBlocks,
    firstChangedBlock
  };
}

function RevisionDiffCard({ title, beforeLabel, afterLabel, beforeText, afterText, emptyText }) {
  const summary = buildRevisionDiffSummary(beforeText, afterText);
  const hasDiff = summary.changedBlocks > 0 || summary.deltaUnits !== 0;
  const deltaLabel = summary.deltaUnits > 0 ? `+${summary.deltaUnits}` : `${summary.deltaUnits}`;

  return (
    <article className={`review-diff-card ${hasDiff ? "changed" : "stable"}`}>
      <header>
        <strong>{title}</strong>
        <small>{hasDiff ? "检测到差异" : "无明显差异"}</small>
      </header>
      <div className="review-diff-meta">
        <span>{beforeLabel}：{summary.beforeUnits} 字</span>
        <span>{afterLabel}：{summary.afterUnits} 字</span>
        <span>变化段落：{summary.changedBlocks}</span>
        <span>字数变化：{deltaLabel}</span>
      </div>
      {hasDiff && summary.firstChangedBlock ? (
        <div className="review-diff-preview">
          <div>
            <small>{beforeLabel} · 第 {summary.firstChangedBlock.index} 段</small>
            <p>{summary.firstChangedBlock.before}</p>
          </div>
          <div>
            <small>{afterLabel} · 第 {summary.firstChangedBlock.index} 段</small>
            <p>{summary.firstChangedBlock.after}</p>
          </div>
        </div>
      ) : (
        <p className="workflow-empty">{emptyText}</p>
      )}
    </article>
  );
}

export function GenerationReviewPanel({
  session,
  workflow,
  reviewSource,
  reviewContent,
  reviewDirty,
  busy,
  loadedSourceContent,
  repairPlanBlock = null,
  onLoadSource,
  onChangeContent,
  onCommit,
  onDiscard
}) {
  const commitLabel = session?.sessionType === "regenerate" ? "确认覆盖当前章节" : "确认存入新章节";
  const writerContent = workflow?.repair?.originalContent || "";
  const repairContent =
    workflow?.repair?.repairedContent || workflow?.repair?.reviewContent || workflow?.repair?.originalContent || "";
  const writerLength = countTextUnits(writerContent);
  const repairLength = countTextUnits(repairContent);

  return (
    <article className="panel generation-review-panel">
      <div className="panel-title compact">
        <div>
          <h2>审阅后入库</h2>
          <span>
            第 {workflow?.chapterNumber || "--"} 章 · {session?.sessionType === "regenerate" ? "重生成覆盖" : "新章入库"}
          </span>
        </div>
      </div>
      <div className="workflow-meta">
        <span>Post Guard：{workflow?.postGuard?.status || "pass"}</span>
        <span>Repair：{workflow?.repair?.applied ? "已给出最小修订稿" : "未触发"}</span>
        <span>当前载入：{reviewSource === "writer" ? "Writer 原稿" : "Repair 修订稿"}</span>
      </div>
      <div className="review-source-row">
        <button
          className={`secondary-button ${reviewSource === "writer" ? "active" : ""}`}
          disabled={busy}
          type="button"
          onClick={() => onLoadSource("writer")}
        >
          载入 Writer 原稿 · {writerLength} 字
        </button>
        <button
          className={`secondary-button ${reviewSource === "repair" ? "active" : ""}`}
          disabled={busy || !workflow?.repair?.applied}
          type="button"
          onClick={() => onLoadSource("repair")}
        >
          载入 Repair 修订稿 · {repairLength} 字
        </button>
      </div>
      {repairPlanBlock}
      <div className="review-diff-grid">
        {workflow?.repair?.applied ? (
          <RevisionDiffCard
            title="Writer -> Repair 差异"
            beforeLabel="Writer"
            afterLabel="Repair"
            beforeText={writerContent}
            afterText={repairContent}
            emptyText="Repair 没有改动正文，当前修订稿与 Writer 原稿一致。"
          />
        ) : (
          <RevisionDiffCard
            title="Writer -> Repair 差异"
            beforeLabel="Writer"
            afterLabel="Repair"
            beforeText={writerContent}
            afterText={writerContent}
            emptyText="这轮没有触发 Repair，Writer 原稿将直接进入审阅。"
          />
        )}
        <RevisionDiffCard
          title={reviewDirty ? "当前载入源 -> 你的手工修改" : "当前载入源 -> 最终入库稿"}
          beforeLabel={reviewSource === "writer" ? "Writer" : "Repair"}
          afterLabel="当前文本"
          beforeText={loadedSourceContent}
          afterText={reviewContent}
          emptyText={
            reviewDirty
              ? "你手工修改后的差异很小，当前文本和载入源几乎一致。"
              : "你还没有手工改动正文，确认入库会直接采用当前载入版本。"
          }
        />
      </div>
      <label>
        最终入库正文
        <textarea
          className="review-textarea"
          rows={18}
          value={reviewContent}
          onChange={(event) => onChangeContent(event.target.value)}
        />
      </label>
      <div className="editor-footer">
        <span>{reviewDirty ? "你已经手工改过审阅稿，入库时会以当前文本为准。" : "可直接采用当前版本入库，也可以先微调正文。"}</span>
      </div>
      <div className="card-actions">
        <button className="primary-button" disabled={busy || !reviewContent.trim()} type="button" onClick={onCommit}>
          <Save size={16} />
          {commitLabel}
        </button>
        <button className="secondary-button" disabled={busy} type="button" onClick={onDiscard}>
          <Trash2 size={16} />
          丢弃这次审阅稿
        </button>
      </div>
    </article>
  );
}
