import { settingTypes } from "../../lib/app-constants.js";
import { makeClientId } from "../../lib/project-helpers.js";

const settingTypeMap = Object.fromEntries(settingTypes.map((item) => [item.id, item]));

function padSettingNumber(value) {
  return String(Math.max(1, Number(value) || 0)).padStart(2, "0");
}

export function formatSettingCode(setting) {
  const typeLabel = settingTypeMap[setting?.type]?.label || "设定";
  return `${typeLabel}-${padSettingNumber(setting?.categoryNumber)}`;
}

export function formatSettingLabel(setting) {
  return `${formatSettingCode(setting)} ${setting?.name || "未命名设定"}`;
}

export function sortSettings(settings) {
  return [...(settings || [])].sort((left, right) => {
    const leftIndex = settingTypes.findIndex((item) => item.id === left.type);
    const rightIndex = settingTypes.findIndex((item) => item.id === right.type);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;

    const numberDiff = (Number(left.categoryNumber) || 0) - (Number(right.categoryNumber) || 0);
    if (numberDiff !== 0) return numberDiff;

    return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
  });
}

export function normalizeTagList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "").split(/(?:[\u3001\uff0c,|]|\r?\n)+/);
  const seen = new Set();

  return items
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

export function stringifyTagList(value) {
  return normalizeTagList(value).join("\u3001");
}

export function normalizeSettingSelection(value, project) {
  const validIds = new Set((project?.settings || []).map((item) => item.id));
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item && validIds.has(item) && !seen.has(item) && seen.add(item));
}

export function buildChapterSourceText(chapter) {
  if (!chapter) return "";
  return chapter.draftSavedAt
    ? chapter.draftContent || chapter.content || ""
    : chapter.content || chapter.draftContent || "";
}

export function buildExtractedSettingDraft(item, index = 0) {
  return {
    tempId: item?.tempId || makeClientId("extract"),
    checked: item?.checked ?? true,
    type: item?.type || "character",
    name: item?.name || `新设定 ${index + 1}`,
    summary: item?.summary || "",
    traits: stringifyTagList(item?.traits || ""),
    rules: item?.rules || "",
    evidence: item?.evidence || ""
  };
}

export function buildSettingExtractionDraft(project, chapterId = "") {
  return {
    sourceMode: chapterId ? "chapter" : "manual",
    chapterId: chapterId || project?.chapters?.[0]?.id || "",
    manualSource: "",
    useMcp: false,
    useSubagents: false,
    selectedMcpServerIds: [],
    results: []
  };
}

export function buildSettingDraft(setting) {
  return {
    type: setting?.type || "character",
    name: setting?.name || "",
    summary: setting?.summary || "",
    traits: stringifyTagList(setting?.traits || ""),
    rules: setting?.rules || ""
  };
}
