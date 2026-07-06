import { summarizeInstruction } from "./format.js";

export const getProjectDeleteCode = (projectId) =>
  `DEL-${projectId.replace(/^project_/, "").slice(-6).toUpperCase().padStart(6, "0")}`;

export function makeClientId(prefix = "draft") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildChapterDraft(chapter, project) {
  const hasDraft = Boolean(chapter?.draftSavedAt);
  return {
    title: hasDraft ? chapter.draftTitle : chapter.title,
    tone: hasDraft
      ? chapter.draftTone || chapter.tone || project.defaultTone || "热血"
      : chapter.tone || project.defaultTone || "热血",
    content: hasDraft ? chapter.draftContent : chapter.content,
    status: chapter?.draftSavedAt ? "saved" : "idle",
    lastSavedAt: chapter?.draftSavedAt || chapter?.updatedAt || chapter?.createdAt || "",
    error: ""
  };
}

export function getNextChapterNumber(project) {
  return (
    (project?.chapters || []).reduce(
      (max, chapter) => Math.max(max, Number(chapter?.number) || 0),
      0
    ) + 1
  );
}

export function buildAiProfileDraft(profile) {
  return {
    name: profile?.name || "",
    provider: profile?.provider || "local",
    apiKey: profile?.apiKey || "",
    baseUrl: profile?.baseUrl || "",
    model: profile?.model || "",
    thinkingMode: profile?.thinkingMode || "",
    reasoningEffort: profile?.reasoningEffort || ""
  };
}

export function isAbortLikeError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    /abort|cancell?ed/i.test(String(error?.message || ""))
  );
}

export function buildManualChapterDraft(project) {
  return {
    title: "",
    tone: project?.defaultTone || "热血",
    content: ""
  };
}

export function buildForeshadowDraft() {
  return {
    content: "",
    plantedChapter: "",
    expectedPayoff: "",
    related: "",
    status: "未回收"
  };
}

export function buildRewriteDraft() {
  return {
    mode: "polish",
    style: "更网文化",
    instruction: "",
    followChapter: true,
    sourceMode: "chapter",
    selectionContext: null,
    manualSource: "",
    useSubagents: false,
    result: ""
  };
}

export function buildTransformVersionLabel(form) {
  return form.mode === "modify" ? `修改：${summarizeInstruction(form.instruction)}` : form.style;
}

export function parseSseDataBlock(block) {
  const data = block
    .split(/\r?\n/)
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data) return null;
  return JSON.parse(data);
}

function clampSelectionIndex(value, max) {
  return Math.max(0, Math.min(Number(value) || 0, max));
}

export function buildPartialRewriteSelection({ chapter, content, start, end }) {
  const safeStart = clampSelectionIndex(Math.min(start, end), content.length);
  const safeEnd = clampSelectionIndex(Math.max(start, end), content.length);
  const selectedText = content.slice(safeStart, safeEnd);

  if (!selectedText) return null;

  return {
    id: `selection-${Date.now()}`,
    chapterId: chapter.id,
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    start: safeStart,
    end: safeEnd,
    selectedText
  };
}

export function readTextSelection(target, fallbackLength = 0) {
  const max = typeof target?.value === "string" ? target.value.length : fallbackLength;
  return {
    start: clampSelectionIndex(Math.min(target?.selectionStart || 0, target?.selectionEnd || 0), max),
    end: clampSelectionIndex(Math.max(target?.selectionStart || 0, target?.selectionEnd || 0), max)
  };
}

function resolvePartialRewriteRange(content, selection) {
  if (!selection?.selectedText) return null;

  const originalText = selection.selectedText;
  const start = clampSelectionIndex(selection.start, content.length);
  const end = clampSelectionIndex(selection.end, content.length);

  if (content.slice(start, end) === originalText) {
    return { start, end };
  }

  const firstIndex = content.indexOf(originalText);
  if (firstIndex !== -1 && firstIndex === content.lastIndexOf(originalText)) {
    return { start: firstIndex, end: firstIndex + originalText.length };
  }

  return null;
}

export function applyPartialRewrite(content, selection, replacement) {
  const range = resolvePartialRewriteRange(content, selection);
  if (!range) return null;
  return `${content.slice(0, range.start)}${replacement}${content.slice(range.end)}`;
}

export function sameDraft(a, b) {
  return a?.title === b?.title && a?.tone === b?.tone && a?.content === b?.content;
}

export function findProjectById(data, projectId) {
  return data?.projects?.find((project) => project.id === projectId);
}

export function findChapterById(project, chapterId) {
  return project?.chapters?.find((chapter) => chapter.id === chapterId);
}
