import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  Edit3,
  FileText,
  Flame,
  Gauge,
  GitBranch,
  Library,
  Loader2,
  MapPinned,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wand2
} from "lucide-react";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

const settingTypes = [
  { id: "character", label: "角色", icon: Users },
  { id: "world", label: "世界观", icon: Boxes },
  { id: "location", label: "地点", icon: MapPinned },
  { id: "item", label: "道具", icon: CircleDot },
  { id: "power", label: "能力体系", icon: Flame }
];

const genreOptions = ["玄幻", "言情", "悬疑", "都市", "短剧化小说", "同人 / OC"];
const rewriteStyles = [
  "更网文化",
  "更文学化",
  "更紧张",
  "更暧昧",
  "更克制",
  "更热血",
  "更悬疑",
  "更短剧化"
];
const tonePresets = [
  "热血",
  "冷峻",
  "轻松",
  "悬疑感强",
  "暧昧拉扯",
  "史诗感",
  "第一人称压迫式"
];
const constraintPolicyOptions = [
  {
    id: "lockCharacterMotivations",
    label: "锁人物动机",
    description: "把已选角色的动机压进本章约束，减少人设漂移。"
  },
  {
    id: "strictWorldRules",
    label: "锁世界规则",
    description: "把能力、世界观和禁忌规则显式锁进 forbidden。"
  },
  {
    id: "lockRecentContinuity",
    label: "锁最近连续性",
    description: "强制承接最近章节的事实、情绪和关系走向。"
  },
  {
    id: "enforceForeshadowContinuity",
    label: "锁伏笔照应",
    description: "把未回收伏笔压进 continuity，减少漏接。"
  }
];
const workflowStageLabels = {
  planner: "Planner",
  guard_preflight: "Preflight Guard",
  writer: "Writer",
  "writer-local": "Writer",
  guard: "Post Guard",
  repair: "Repair",
  review_session: "生成审阅稿",
  review_commit: "确认入库",
  discard: "丢弃审阅稿"
};
const downloadFormatOptions = [
  { value: "txt", label: "TXT" },
  { value: "markdown", label: "Markdown" },
  { value: "docx", label: "Word" },
  { value: "pdf", label: "PDF" },
  { value: "epub", label: "EPUB" }
];
const settingTypeMap = Object.fromEntries(settingTypes.map((item) => [item.id, item]));

const getProjectDeleteCode = (projectId) =>
  `DEL-${projectId.replace(/^project_/, "").slice(-6).toUpperCase().padStart(6, "0")}`;

function formatTime(value) {
  if (!value) return "未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未保存";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function extensionForFormat(format) {
  return format === "markdown" ? "md" : format;
}

function buildDownloadName(baseName, format) {
  return `${baseName || "download"}.${extensionForFormat(format)}`;
}

function buildChapterEditorHash(projectId, chapterId, mode = "existing") {
  if (!projectId) return "";
  const params = new URLSearchParams({ projectId });
  if (chapterId) {
    params.set("chapterId", chapterId);
  }
  if (mode === "new") {
    params.set("mode", "new");
  }
  return `#/chapter-editor?${params.toString()}`;
}

function buildSettingExtractorHash(projectId, chapterId = "") {
  if (!projectId) return "";
  const params = new URLSearchParams({ projectId });
  if (chapterId) {
    params.set("chapterId", chapterId);
  }
  return `#/setting-extractor?${params.toString()}`;
}

function readChapterEditorRoute() {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#\/chapter-editor(?:\?(.*))?$/);
  if (!match) return null;

  const params = new URLSearchParams(match[1] || "");
  const projectId = params.get("projectId") || "";
  const chapterId = params.get("chapterId") || "";
  const mode = params.get("mode") === "new" ? "new" : "existing";

  if (!projectId) return null;
  if (mode === "new") return { projectId, chapterId: "", mode };
  if (!chapterId) return null;
  return { projectId, chapterId, mode };
}

function readSettingExtractorRoute() {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#\/setting-extractor(?:\?(.*))?$/);
  if (!match) return null;

  const params = new URLSearchParams(match[1] || "");
  const projectId = params.get("projectId") || "";
  const chapterId = params.get("chapterId") || "";

  if (!projectId) return null;
  return { projectId, chapterId };
}

function padSettingNumber(value) {
  return String(Math.max(1, Number(value) || 0)).padStart(2, "0");
}

function formatSettingCode(setting) {
  const typeLabel = settingTypeMap[setting?.type]?.label || "设定";
  return `${typeLabel}-${padSettingNumber(setting?.categoryNumber)}`;
}

function formatSettingLabel(setting) {
  return `${formatSettingCode(setting)} ${setting?.name || "未命名设定"}`;
}

function sortSettings(settings) {
  return [...(settings || [])].sort((left, right) => {
    const leftIndex = settingTypes.findIndex((item) => item.id === left.type);
    const rightIndex = settingTypes.findIndex((item) => item.id === right.type);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;

    const numberDiff = (Number(left.categoryNumber) || 0) - (Number(right.categoryNumber) || 0);
    if (numberDiff !== 0) return numberDiff;

    return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
  });
}

function normalizeTagList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[、,，;；/|\n]+/);
  const seen = new Set();

  return items
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function stringifyTagList(value) {
  return normalizeTagList(value).join("、");
}

function normalizeSettingSelection(value, project) {
  const validIds = new Set((project?.settings || []).map((item) => item.id));
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item && validIds.has(item) && !seen.has(item) && seen.add(item));
}

function buildChapterSourceText(chapter) {
  if (!chapter) return "";
  return chapter.draftSavedAt
    ? chapter.draftContent || chapter.content || ""
    : chapter.content || chapter.draftContent || "";
}

function makeClientId(prefix = "draft") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildExtractedSettingDraft(item, index = 0) {
  return {
    tempId: item?.tempId || makeClientId("extract"),
    checked: item?.checked ?? true,
    type: item?.type || "character",
    name: item?.name || `新设定${index + 1}`,
    summary: item?.summary || "",
    traits: stringifyTagList(item?.traits || ""),
    rules: item?.rules || "",
    evidence: item?.evidence || ""
  };
}

function buildSettingExtractionDraft(project, chapterId = "") {
  return {
    sourceMode: chapterId ? "chapter" : "manual",
    chapterId: chapterId || project?.chapters?.[0]?.id || "",
    manualSource: "",
    results: []
  };
}

function makeWebDraftKey(projectId, scope) {
  return projectId ? `ai-novel:web-draft:${projectId}:${scope}` : "";
}

function readWebDraft(storageKey, fallbackValue) {
  if (!storageKey || typeof window === "undefined") return fallbackValue;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallbackValue;
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      fallbackValue &&
      typeof parsed === "object" &&
      typeof fallbackValue === "object" &&
      !Array.isArray(parsed) &&
      !Array.isArray(fallbackValue)
    ) {
      return { ...fallbackValue, ...parsed };
    }

    return parsed;
  } catch {
    return fallbackValue;
  }
}

function useWebDraftState(storageKey, fallbackValue) {
  const fallbackRef = useRef(fallbackValue);
  const [state, setState] = useState(() => readWebDraft(storageKey, fallbackValue));

  useEffect(() => {
    fallbackRef.current = fallbackValue;
  }, [fallbackValue]);

  useEffect(() => {
    setState(readWebDraft(storageKey, fallbackValue));
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore quota or serialization errors and keep the in-memory state.
    }
  }, [storageKey, state]);

  function reset(nextValue = fallbackRef.current) {
    setState(nextValue);
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextValue));
    } catch {
      // Ignore storage failures and keep the in-memory state.
    }
  }

  return [state, setState, reset];
}

function buildChapterDraft(chapter, project) {
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

function getNextChapterNumber(project) {
  return (
    (project?.chapters || []).reduce(
      (max, chapter) => Math.max(max, Number(chapter?.number) || 0),
      0
    ) + 1
  );
}

function buildSettingDraft(setting) {
  return {
    type: setting?.type || "character",
    name: setting?.name || "",
    summary: setting?.summary || "",
    traits: stringifyTagList(setting?.traits || ""),
    rules: setting?.rules || ""
  };
}

function buildAiProfileDraft(profile) {
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

function normalizeConstraintPolicyDraft(policy = {}) {
  return {
    lockCharacterMotivations: policy?.lockCharacterMotivations !== false,
    strictWorldRules: policy?.strictWorldRules !== false,
    lockRecentContinuity: policy?.lockRecentContinuity !== false,
    enforceForeshadowContinuity: policy?.enforceForeshadowContinuity !== false
  };
}

function summarizeInlineText(text, limit = 88) {
  const compact = String(text || "").replace(/\s+/g, " ").trim();
  if (!compact) return "暂无";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function isAbortLikeError(error) {
  return (
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    /abort|cancell?ed/i.test(String(error?.message || ""))
  );
}

function countTextUnits(text) {
  return String(text || "").replace(/\s+/g, "").length;
}

function joinWorkflowSummaryParts(parts = []) {
  return parts
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function safeParseJsonObject(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function mapGuardStatusLabel(status) {
  if (status === "needs_fix") return "需修";
  if (status === "block") return "阻断";
  return "通过";
}

function mapEndingModeLabel(mode) {
  if (mode === "hook") return "钩子收束";
  if (mode === "open") return "开放收束";
  return "自然收束";
}

function buildFindingDigest(findings = [], limit = 2) {
  const labels = Array.from(
    new Set(
      (Array.isArray(findings) ? findings : [])
        .map((item) => summarizeInlineText(item?.title || item?.type || "", 12))
        .filter(Boolean)
    )
  );
  return labels.slice(0, limit).join("、");
}

function buildPlannerSummaryLine(plan) {
  if (!plan) return "Planner 尚未产出章节规划。";
  const beatsCount = normalizeEditorList(plan.beats || []).length;
  return joinWorkflowSummaryParts([
    plan.narrativeMode || "混合",
    beatsCount ? `${beatsCount}拍` : "",
    mapEndingModeLabel(plan.endingMode),
    summarizeInlineText(plan.summary || "章节 brief 已生成", 28)
  ]);
}

function buildGuardSummaryLine(report, label = "Guard") {
  if (!report) return `${label} 尚未运行。`;
  const findingsCount = Array.isArray(report.findings) ? report.findings.length : Number(report.findingsCount || 0);
  const findingsDigest = buildFindingDigest(report.findings || [], 2);
  return joinWorkflowSummaryParts([
    `${label} ${report.score ?? "--"}分${mapGuardStatusLabel(report.status)}`,
    findingsCount ? `${findingsCount}项` : "无明显问题",
    findingsDigest
  ]);
}

function buildRepairSummaryLine({ repair, postGuard } = {}) {
  const repairPlan = normalizeEditorList(repair?.repairPlan || postGuard?.repairPlan || []);
  if (repair?.applied) {
    return joinWorkflowSummaryParts([
      `最小修订 ${Math.max(repairPlan.length, 1)} 处`,
      repairPlan[0] ? summarizeInlineText(repairPlan[0], 24) : "",
      repair?.repairedContent ? `${countTextUnits(repair.repairedContent)}字` : ""
    ]);
  }
  if (repairPlan.length) {
    return joinWorkflowSummaryParts([
      "无需落笔修订",
      `保留 ${repairPlan.length} 条提醒`
    ]);
  }
  return "正文直接通过，无需修订。";
}

function buildWorkflowOutcomeSummaryLine(workflow) {
  if (!workflow) return "Writer / Guard / Repair 结果待生成。";
  return joinWorkflowSummaryParts([
    workflow.postGuard
      ? `${workflow.postGuard.score ?? "--"}分${mapGuardStatusLabel(workflow.postGuard.status)}`
      : "",
    workflow.repair?.applied
      ? `Repair ${Math.max(normalizeEditorList(workflow.repair.repairPlan || []).length, 1)}处`
      : "正文直接通过"
  ]);
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
    beforeBlocks: beforeBlocks.length,
    afterBlocks: afterBlocks.length,
    changedBlocks,
    firstChangedBlock
  };
}

function buildConstraintPolicyLabels(policy = {}) {
  const normalized = normalizeConstraintPolicyDraft(policy);
  return constraintPolicyOptions
    .filter((item) => normalized[item.id])
    .map((item) => item.label);
}

function mergeUniqueTextList(...lists) {
  const seen = new Set();
  return lists
    .flat()
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function isChapterIdentityConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /章节序号|正文首行|标题意象|第\s*\d+\s*章/.test(text);
}

function isContinuityConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /最近章节|已发生|关系走向|情绪状态|承接/.test(text);
}

function isWorldRuleConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /世界规则|能力规则|规则|禁忌|设定|代价|超自然/.test(text);
}

function deriveWorldRulesFromForbidden(forbidden = [], policy = {}) {
  if (!policy.strictWorldRules) return [];
  return normalizeEditorList(forbidden).filter(
    (item) =>
      isWorldRuleConstraintEntry(item) &&
      !isChapterIdentityConstraintEntry(item) &&
      !isContinuityConstraintEntry(item)
  );
}

function deriveConstraintLayersFromContract(contract) {
  if (!contract) return null;

  const currentLayers = contract.constraintLayers || {};
  const mustMention = normalizeEditorList(contract.mustMention || []);
  const continuity = normalizeEditorList(contract.continuity || []);
  const forbidden = normalizeEditorList(contract.forbidden || []);
  const derivedPolicy = normalizeConstraintPolicyDraft(currentLayers.policy || {
    lockCharacterMotivations: mustMention.some((item) => item.startsWith("人物动机锁：")),
    strictWorldRules: forbidden.some(
      (item) => item.startsWith("不能违反规则：") || isWorldRuleConstraintEntry(item)
    ),
    lockRecentContinuity: continuity.some((item) => item.startsWith("承接第") || item.startsWith("紧接第")),
    enforceForeshadowContinuity: continuity.some((item) => item.startsWith("待照应伏笔"))
  });

  return {
    policy: derivedPolicy,
    chapterIdentity: mergeUniqueTextList(
      currentLayers.chapterIdentity || [],
      contract.chapterLock ? [contract.chapterLock] : [],
      contract.titleLock ? [contract.titleLock] : [],
      mustMention.filter((item) => item.startsWith("标题意象："))
    ),
    characterMotivations: mergeUniqueTextList(
      currentLayers.characterMotivations || [],
      mustMention
        .filter((item) => item.startsWith("人物动机锁："))
        .map((item) => item.replace(/^人物动机锁：/, "").trim())
    ),
    worldRules: mergeUniqueTextList(
      currentLayers.worldRules || [],
      forbidden
        .filter((item) => item.startsWith("不能违反规则："))
        .map((item) => item.replace(/^不能违反规则：/, "").trim()),
      deriveWorldRulesFromForbidden(forbidden, derivedPolicy)
    ),
    continuityAnchors: mergeUniqueTextList(
      currentLayers.continuityAnchors || [],
      continuity.filter((item) => item.startsWith("承接第") || item.startsWith("紧接第"))
    ),
    foreshadowAnchors: mergeUniqueTextList(
      currentLayers.foreshadowAnchors || [],
      continuity.filter((item) => item.startsWith("待照应伏笔"))
    ),
    hardBans: mergeUniqueTextList(currentLayers.hardBans || [], forbidden)
  };
}

function buildWorkflowRecommendation({
  runtime,
  preview,
  workflow,
  reviewSession,
  previewStale,
  reviewDirty,
  isRegenerateMode
}) {
  if (runtime?.active) {
    const currentStage =
      runtime.stages.find((item) => item.key === runtime.currentStageKey) ||
      runtime.stages.find((item) => item.status === "running") ||
      runtime.stages.find((item) => item.status === "done" || item.status === "skipped") ||
      null;
    return {
      tone: "ready",
      title: `正在执行 ${currentStage?.label || "Workflow"}`,
      detail: runtime.currentMessage || "阶段状态会实时刷新到下方运行面板。"
    };
  }

  if (runtime?.cancelled) {
    return {
      tone: "warn",
      title: "本次运行已取消",
      detail: "可继续调整约束，或重新发起新一轮 preview / generate。"
    };
  }

  if (reviewSession) {
    return {
      tone: "review",
      title: isRegenerateMode ? "当前处于重生成审阅阶段" : "当前处于待入库审阅阶段",
      detail: reviewDirty
        ? "你已经手工改过正文，当前文本会作为最终入库版本。"
        : "建议先看 Writer / Repair 的差异，再决定确认入库还是丢弃。"
    };
  }

  if (previewStale) {
    return {
      tone: "warn",
      title: "约束草案已经过期",
      detail: "表单刚发生过变化。先刷新 contract / planner / guard，再生成审阅稿更稳。"
    };
  }

  if (preview) {
    return {
      tone: "ready",
      title: "约束草案已就位",
      detail: "现在可以继续微调 contract / planner，或者直接生成章节审阅稿。"
    };
  }

  if (workflow) {
    return {
      tone: "done",
      title: "本轮工作流已完成",
      detail: "你可以继续生成下一轮草案，或者去章节页、润色/修改页继续处理正文。"
    };
  }

  return {
    tone: "idle",
    title: "先生成约束，再生成正文",
    detail: "填写目标后先跑 contract / planner / preflight guard，会比直接写正文更稳。"
  };
}

function buildWorkflowTraceLogs(project, { isRegenerateMode, selectedChapterId = "" } = {}) {
  const allowedWorkflows = isRegenerateMode
    ? new Set(["chapter_regenerate", "chapter_regenerate_preview", "generation_review"])
    : new Set(["chapter_generate", "chapter_preview", "generation_review"]);

  return (project?.ioLogs || [])
    .filter((log) => allowedWorkflows.has(log.workflow))
    .filter((log) => {
      if (!isRegenerateMode) return true;
      if (!selectedChapterId) return true;
      if (!log.chapterId) return true;
      return log.chapterId === selectedChapterId;
    })
    .slice(0, 8);
}

function legacyDescribeWorkflowTrace(log) {
  if (!log) return "";
  if (log.status === "error") {
    return summarizeInlineText(log.outputText || "执行失败", 92);
  }

  if (log.stage === "guard_preflight") {
    return `预写作评分 ${log.outputPayload?.score ?? "--"} / ${log.outputPayload?.status || "pass"}`;
  }
  if (log.stage === "guard") {
    return `后置 guard 评分 ${log.outputPayload?.score ?? "--"} / ${log.outputPayload?.status || "pass"}`;
  }
  if (log.stage === "repair") {
    return summarizeInlineText(log.outputText || "已生成最小修订稿", 92);
  }
  if (log.stage === "review_session") {
    return "已生成待入库审阅稿，可继续人工干预。";
  }
  if (log.stage === "review_commit") {
    return "审阅稿已确认入库。";
  }
  if (log.stage === "discard") {
    return "审阅稿已丢弃，没有写入章节。";
  }
  if (log.stage === "planner") {
    return summarizeInlineText(log.outputText || log.outputPayload?.summary || "已生成章节 brief", 92);
  }
  if (log.stage === "writer" || log.stage === "writer-local") {
    return summarizeInlineText(log.outputText || "已生成 writer 原稿", 92);
  }

  return summarizeInlineText(log.outputText || JSON.stringify(log.outputPayload || {}), 92);
}

function describeWorkflowTrace(log) {
  if (!log) return "";
  if (log.status === "error") {
    return summarizeInlineText(log.outputText || "执行失败", 92);
  }

  if (log.stage === "guard_preflight") {
    return buildGuardSummaryLine(log.outputPayload, "Preflight");
  }
  if (log.stage === "guard") {
    return buildGuardSummaryLine(log.outputPayload, "Post Guard");
  }
  if (log.stage === "repair") {
    return buildRepairSummaryLine({
      repair: {
        applied: true,
        repairedContent: log.outputText || "",
        repairPlan: log.inputPayload?.guardReport?.repairPlan || []
      },
      postGuard: log.inputPayload?.guardReport || null
    });
  }
  if (log.stage === "review_session") {
    return "已生成待入库审阅稿，可继续人工干预。";
  }
  if (log.stage === "review_commit") {
    return "审阅稿已确认入库。";
  }
  if (log.stage === "discard") {
    return "审阅稿已丢弃，没有写入章节。";
  }
  if (log.stage === "planner") {
    return buildPlannerSummaryLine(safeParseJsonObject(log.outputText) || log.outputPayload || {});
  }
  if (log.stage === "writer" || log.stage === "writer-local") {
    return summarizeInlineText(log.outputText || "已生成 Writer 原稿", 72);
  }

  return summarizeInlineText(log.outputText || JSON.stringify(log.outputPayload || {}), 92);
}

function buildChapterGeneratorDraft(project, chapter = null) {
  return {
    title: chapter?.title || "",
    goal: chapter?.goal || "",
    conflict: chapter?.conflict || "",
    hook: chapter?.hook || "",
    tone: chapter?.tone || project?.defaultTone || "热血",
    wordCount: Number(chapter?.wordCount) || 1800,
    selectedSettingIds: normalizeSettingSelection(chapter?.selectedSettingIds, project),
    constraintPolicy: normalizeConstraintPolicyDraft(chapter?.constraintPolicy)
  };
}

function buildChapterWorkflowState() {
  return {
    signature: "",
    preview: null,
    lastRun: null,
    editorMode: "simple",
    ignoredFindingKeys: [],
    reviewSessionId: "",
    reviewSource: "repair",
    reviewContent: "",
    reviewDirty: false
  };
}

function buildWorkflowRuntimeState() {
  return {
    active: false,
    cancelled: false,
    mode: "idle",
    workflow: "",
    startedAt: "",
    finishedAt: "",
    chapterId: "",
    chapterNumber: null,
    currentStageKey: "",
    currentMessage: "",
    stages: [],
    writerStream: "",
    writerUnits: 0,
    error: ""
  };
}

function legacyFormatRuntimeStatus(status) {
  if (status === "running") return "运行中";
  if (status === "done") return "已完成";
  if (status === "skipped") return "已跳过";
  if (status === "error") return "失败";
  return "待执行";
}

function formatElapsedDuration(startedAt, finishedAt = "") {
  const startTime = new Date(startedAt || "").getTime();
  const endTime = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return "--";

  const totalSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return `${hours}h ${remainMinutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function upsertWorkflowRuntimeStage(stages, payload) {
  const nextStage = {
    key: payload.key || "",
    label: payload.label || payload.key || "Stage",
    status: payload.status || "idle",
    message: payload.message || "",
    updatedAt: payload.updatedAt || "",
    meta: payload.meta || null
  };
  const index = stages.findIndex((item) => item.key === nextStage.key);
  if (index === -1) {
    return [...stages, nextStage];
  }

  return stages.map((item, stageIndex) => (stageIndex === index ? { ...item, ...nextStage } : item));
}

function applyWorkflowRuntimeEvent(current, payload) {
  if (!payload?.type) return current;

  if (payload.type === "run_started") {
    return {
      active: true,
      cancelled: false,
      mode: payload.mode || "generate",
      workflow: payload.workflow || "",
      startedAt: payload.startedAt || "",
      finishedAt: "",
      chapterId: payload.chapterId || "",
      chapterNumber: payload.chapterNumber ?? null,
      currentStageKey: "",
      currentMessage: "",
      stages: (payload.stages || []).map((item) => ({
        key: item.key || "",
        label: item.label || item.key || "Stage",
        status: "idle",
        message: "",
        updatedAt: payload.startedAt || "",
        meta: null
      })),
      writerStream: "",
      writerUnits: 0,
      error: ""
    };
  }

  if (payload.type === "stage") {
    const nextStages = upsertWorkflowRuntimeStage(current.stages || [], payload);
    const hasRunning = nextStages.some((item) => item.status === "running");
    return {
      ...current,
      active: payload.status === "error" ? false : current.active,
      finishedAt: payload.status === "error" ? payload.updatedAt || current.finishedAt : current.finishedAt,
      currentStageKey: payload.status === "running" ? payload.key || "" : hasRunning ? current.currentStageKey : "",
      currentMessage: payload.message || current.currentMessage,
      stages: nextStages,
      error: payload.status === "error" ? payload.message || current.error : current.error
    };
  }

  if (payload.type === "delta") {
    const nextWriterStream =
      typeof payload.result === "string" ? payload.result : `${current.writerStream || ""}${payload.delta || ""}`;
    return {
      ...current,
      currentStageKey: payload.key || current.currentStageKey,
      currentMessage: payload.message || current.currentMessage,
      writerStream: nextWriterStream,
      writerUnits: payload.meta?.units ?? countTextUnits(nextWriterStream)
    };
  }

  if (payload.type === "done") {
    return {
      ...current,
      active: false,
      cancelled: false,
      finishedAt: payload.finishedAt || current.finishedAt,
      currentStageKey: "",
      currentMessage: current.currentMessage || "本轮运行已完成"
    };
  }

  if (payload.type === "error") {
    return {
      ...current,
      active: false,
      cancelled: false,
      finishedAt: current.finishedAt || new Date().toISOString(),
      currentStageKey: "",
      error: payload.error || "请求失败"
    };
  }

  return current;
}

function aggregateRuntimeStepState(runtime, keys = []) {
  const stages = keys
    .map((key) => runtime?.stages?.find((item) => item.key === key))
    .filter(Boolean);
  if (!stages.length) return "idle";
  if (stages.some((item) => item.status === "cancelled")) return "cancelled";
  if (stages.some((item) => item.status === "error")) return "error";
  if (stages.some((item) => item.status === "running")) return "active";
  if (stages.every((item) => item.status === "done" || item.status === "skipped" || item.status === "cancelled")) return "done";
  return "idle";
}

function getWorkflowRuntimeProgress(runtime) {
  const stages = runtime?.stages || [];
  const total = stages.length;
  const completed = stages.filter((item) => item.status === "done" || item.status === "skipped" || item.status === "cancelled").length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0
  };
}

function cancelWorkflowRuntime(current) {
  const finishedAt = new Date().toISOString();
  return {
    ...current,
    active: false,
    cancelled: true,
    finishedAt,
    currentStageKey: "",
    currentMessage: "本次运行已取消。",
    stages: (current?.stages || []).map((stage) =>
      stage.status === "running"
        ? {
            ...stage,
            status: "cancelled",
            message: "已取消，未继续执行。",
            updatedAt: finishedAt
          }
        : stage
    ),
    error: ""
  };
}

function formatRuntimeStatus(status) {
  if (status === "running") return "运行中";
  if (status === "done") return "已完成";
  if (status === "skipped") return "已跳过";
  if (status === "cancelled") return "已取消";
  if (status === "error") return "失败";
  return "待执行";
}

function buildRuntimeStageSummary(stage) {
  if (!stage) return "";
  if (stage.status === "running") {
    return summarizeInlineText(stage.message || "阶段执行中", 56);
  }
  if (stage.status === "cancelled") {
    return "已取消，未继续执行。";
  }
  if (stage.key === "planner" && stage.status === "done") {
    return joinWorkflowSummaryParts([
      stage.meta?.narrativeMode || "",
      stage.meta?.beatsCount ? `${stage.meta.beatsCount}拍` : "",
      "章节规划已锁定"
    ]);
  }
  if (stage.key === "guard_preflight" && stage.status === "done") {
    return joinWorkflowSummaryParts([
      `${stage.meta?.score ?? "--"}分${mapGuardStatusLabel(stage.meta?.status)}`,
      stage.meta?.findingsCount ? `${stage.meta.findingsCount}项风险` : "无明显风险"
    ]);
  }
  if (stage.key === "guard" && stage.status === "done") {
    return joinWorkflowSummaryParts([
      `${stage.meta?.score ?? "--"}分${mapGuardStatusLabel(stage.meta?.status)}`,
      stage.meta?.repairPlanCount ? `${stage.meta.repairPlanCount}条修订` : "无需修订"
    ]);
  }
  if (stage.key === "repair") {
    if (stage.status === "done") {
      return joinWorkflowSummaryParts([
        "最小修订已落笔",
        stage.meta?.units ? `${stage.meta.units}字` : ""
      ]);
    }
    if (stage.status === "skipped") {
      return "无需修订，沿用 Writer 原稿。";
    }
  }
  if (stage.key === "writer" && stage.status === "done" && stage.meta?.units) {
    return `Writer 原稿已完成 · ${stage.meta.units}字`;
  }
  return summarizeInlineText(stage.message || "等待执行。", 56);
}

function normalizeEditorList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n|[；;]+/)
        .map((item) => item.trim());
  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

function joinEditorList(value) {
  return normalizeEditorList(value).join("\n");
}

function buildWorkflowSignature({ form, mode, chapterId = "" }) {
  return JSON.stringify({
    mode,
    chapterId,
    title: form.title || "",
    goal: form.goal || "",
    conflict: form.conflict || "",
    hook: form.hook || "",
    tone: form.tone || "",
    wordCount: Number(form.wordCount || 0),
    constraintPolicy: normalizeConstraintPolicyDraft(form.constraintPolicy),
    selectedSettingIds: Array.from(
      new Set((form.selectedSettingIds || []).map((item) => String(item || "").trim()).filter(Boolean))
    ).sort()
  });
}

function mergeWorkflowPatch(target, patch) {
  return {
    ...target,
    ...patch,
    mustUseSettings: patch?.mustUseSettings ? Array.from(new Set([...(target.mustUseSettings || []), ...normalizeEditorList(patch.mustUseSettings)])) : target.mustUseSettings || [],
    mustMention: patch?.mustMention ? Array.from(new Set([...(target.mustMention || []), ...normalizeEditorList(patch.mustMention)])) : target.mustMention || [],
    continuity: patch?.continuity ? Array.from(new Set([...(target.continuity || []), ...normalizeEditorList(patch.continuity)])) : target.continuity || [],
    forbidden: patch?.forbidden ? Array.from(new Set([...(target.forbidden || []), ...normalizeEditorList(patch.forbidden)])) : target.forbidden || []
  };
}

function mergeWorkflowPlanPatch(target, patch) {
  return {
    ...target,
    ...patch,
    beats: patch?.beats ? Array.from(new Set([...(target.beats || []), ...normalizeEditorList(patch.beats)])) : target.beats || [],
    mustKeep: patch?.mustKeep ? Array.from(new Set([...(target.mustKeep || []), ...normalizeEditorList(patch.mustKeep)])) : target.mustKeep || [],
    mustMention: patch?.mustMention ? Array.from(new Set([...(target.mustMention || []), ...normalizeEditorList(patch.mustMention)])) : target.mustMention || [],
    mustUseSettings: patch?.mustUseSettings ? Array.from(new Set([...(target.mustUseSettings || []), ...normalizeEditorList(patch.mustUseSettings)])) : target.mustUseSettings || [],
    continuity: patch?.continuity ? Array.from(new Set([...(target.continuity || []), ...normalizeEditorList(patch.continuity)])) : target.continuity || [],
    forbidden: patch?.forbidden ? Array.from(new Set([...(target.forbidden || []), ...normalizeEditorList(patch.forbidden)])) : target.forbidden || []
  };
}

function buildGuardFindingKey(finding, index = 0) {
  return finding?.id || `${finding?.target || "content"}:${finding?.type || "continuity"}:${finding?.title || "finding"}:${index}`;
}

function hasWorkflowPatchValue(patch) {
  if (!patch || typeof patch !== "object") return false;
  return Object.values(patch).some((value) =>
    Array.isArray(value) ? normalizeEditorList(value).length > 0 : String(value ?? "").trim()
  );
}

function resolveGuardFindingPatch(finding, preview) {
  let contractPatch = finding?.contractPatch || {};
  let planPatch = finding?.planPatch || {};

  if (hasWorkflowPatchValue(contractPatch) || hasWorkflowPatchValue(planPatch)) {
    return { contractPatch, planPatch };
  }

  const guard = preview?.preflightGuard || {};
  const fullContract = guard.suggestedContractPatch || {};
  const fullPlan = guard.suggestedPlanPatch || {};

  if (finding?.target === "contract") {
    if (finding.type === "foreshadow_miss") {
      contractPatch = { continuity: fullContract.continuity || [] };
    } else if (finding.type === "setting_conflict") {
      contractPatch = { mustMention: fullContract.mustMention || [] };
    } else {
      contractPatch = fullContract;
    }
  }

  if (finding?.target === "plan") {
    if (finding.type === "ending") {
      planPatch = {
        endingMode: "hook",
        endingNote: fullPlan.endingNote || preview?.plan?.endingNote || ""
      };
    } else if (finding.type === "motivation_drift") {
      planPatch = {
        summary: preview?.contract?.coreMission || preview?.plan?.summary || "",
        mustKeep: fullPlan.mustKeep || []
      };
    } else if (finding.type === "continuity") {
      planPatch = {
        beats: fullPlan.beats || []
      };
    } else {
      planPatch = fullPlan;
    }
  }

  return { contractPatch, planPatch };
}

function defaultReviewSource(workflow) {
  return workflow?.repair?.applied ? "repair" : "writer";
}

function resolveReviewSourceContent(workflow, source = defaultReviewSource(workflow)) {
  if (!workflow) return "";
  if (source === "writer") {
    return workflow.repair?.originalContent || "";
  }
  return workflow.repair?.repairedContent || workflow.repair?.reviewContent || workflow.repair?.originalContent || "";
}

function buildManualChapterDraft(project) {
  return {
    title: "",
    tone: project?.defaultTone || "热血",
    content: ""
  };
}

function buildForeshadowDraft() {
  return {
    content: "",
    plantedChapter: "",
    expectedPayoff: "",
    related: "",
    status: "未回收"
  };
}

function buildRewriteDraft() {
  return {
    mode: "polish",
    style: "更网文化",
    instruction: "",
    followChapter: true,
    sourceMode: "chapter",
    selectionContext: null,
    manualSource: "",
    result: ""
  };
}

function summarizeInstruction(value, limit = 24) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  if (!compact) return "按要求修改";
  return compact.length > limit ? `${compact.slice(0, limit)}...` : compact;
}

function buildTransformVersionLabel(form) {
  return form.mode === "modify" ? `修改｜${summarizeInstruction(form.instruction)}` : form.style;
}

function formatJsonBlock(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function parseSseDataBlock(block) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n");

  if (!data) return null;
  return JSON.parse(data);
}

function clampSelectionIndex(value, max) {
  return Math.max(0, Math.min(Number(value) || 0, max));
}

function buildPartialRewriteSelection({ chapter, content, start, end }) {
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

function readTextSelection(target, fallbackLength = 0) {
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

function applyPartialRewrite(content, selection, replacement) {
  const range = resolvePartialRewriteRange(content, selection);
  if (!range) return null;
  return `${content.slice(0, range.start)}${replacement}${content.slice(range.end)}`;
}

function sameDraft(a, b) {
  return a?.title === b?.title && a?.tone === b?.tone && a?.content === b?.content;
}

function findProjectById(data, projectId) {
  return data?.projects?.find((project) => project.id === projectId);
}

function findChapterById(project, chapterId) {
  return project?.chapters?.find((chapter) => chapter.id === chapterId);
}

function useChapterWorkspace({ activeProject, request, setState, setError, notify }) {
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef(drafts);
  const timersRef = useRef({});
  const activeProjectRef = useRef(activeProject);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!activeProject) {
      setSelectedChapterId("");
      return;
    }

    setSelectedChapterId((current) => {
      if (activeProject.chapters.some((chapter) => chapter.id === current)) {
        return current;
      }
      return activeProject.chapters[0]?.id || "";
    });

    setDrafts((current) => {
      const next = { ...current };

      for (const chapter of activeProject.chapters) {
        const serverDraft = buildChapterDraft(chapter, activeProject);
        const local = current[chapter.id];

        if (!local || local.status === "idle" || local.status === "saved") {
          next[chapter.id] = serverDraft;
          continue;
        }

        if (local.status === "saving" && sameDraft(local, serverDraft)) {
          next[chapter.id] = { ...serverDraft, status: "saved" };
          continue;
        }

        if (local.status !== "dirty" && local.status !== "error") {
          next[chapter.id] = { ...local, ...serverDraft };
        }
      }

      return next;
    });
  }, [activeProject]);

  const selectedChapter = useMemo(() => {
    if (!activeProject) return null;
    return (
      activeProject.chapters.find((chapter) => chapter.id === selectedChapterId) ||
      activeProject.chapters[0] ||
      null
    );
  }, [activeProject, selectedChapterId]);

  const selectedDraft = useMemo(() => {
    if (!activeProject || !selectedChapter) return null;
    return drafts[selectedChapter.id] || buildChapterDraft(selectedChapter, activeProject);
  }, [activeProject, drafts, selectedChapter]);

  function syncDraftFromResponse(data, projectId, chapterId, fallbackDraft) {
    const nextProject = findProjectById(data, projectId);
    const nextChapter = findChapterById(nextProject, chapterId);
    if (!nextProject || !nextChapter) {
      setDrafts((current) => ({
        ...current,
        [chapterId]: { ...fallbackDraft, status: "saved", error: "" }
      }));
      return;
    }

    const serverDraft = buildChapterDraft(nextChapter, nextProject);
    setDrafts((current) => ({
      ...current,
      [chapterId]: { ...serverDraft, status: "saved", error: "" }
    }));
  }

  function scheduleAutosave(chapterId) {
    window.clearTimeout(timersRef.current[chapterId]);
    timersRef.current[chapterId] = window.setTimeout(() => {
      saveDraft(chapterId, { silent: true }).catch(() => {});
    }, 1200);
  }

  function updateDraft(chapterId, patch) {
    const project = activeProjectRef.current;
    if (!project) return;
    const chapter = findChapterById(project, chapterId);
    if (!chapter) return;

    setDrafts((current) => {
      const base = current[chapterId] || buildChapterDraft(chapter, project);
      return {
        ...current,
        [chapterId]: {
          ...base,
          ...patch,
          status: "dirty",
          error: ""
        }
      };
    });

    scheduleAutosave(chapterId);
  }

  async function saveDraft(chapterId, { silent = true } = {}) {
    const project = activeProjectRef.current;
    const draft = draftsRef.current[chapterId];
    if (!project || !draft) return null;

    window.clearTimeout(timersRef.current[chapterId]);
    setDrafts((current) => ({
      ...current,
      [chapterId]: {
        ...current[chapterId],
        status: "saving",
        error: ""
      }
    }));

    try {
      const data = await request(`/api/projects/${project.id}/chapters/${chapterId}/draft`, {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          tone: draft.tone,
          content: draft.content
        })
      });

      setState(data);
      syncDraftFromResponse(data, project.id, chapterId, draft);
      if (!silent) notify("草稿已保存");
      return data;
    } catch (error) {
      setDrafts((current) => ({
        ...current,
        [chapterId]: {
          ...current[chapterId],
          status: "error",
          error: error.message
        }
      }));
      setError(error.message);
      throw error;
    }
  }

  async function saveChapter(chapterId) {
    const project = activeProjectRef.current;
    const draft = draftsRef.current[chapterId];
    if (!project || !draft) return null;

    window.clearTimeout(timersRef.current[chapterId]);
    setDrafts((current) => ({
      ...current,
      [chapterId]: {
        ...current[chapterId],
        status: "saving",
        error: ""
      }
    }));

    try {
      const data = await request(`/api/projects/${project.id}/chapters/${chapterId}/save`, {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          tone: draft.tone,
          content: draft.content
        })
      });

      setState(data);
      syncDraftFromResponse(data, project.id, chapterId, draft);
      notify("章节已保存到数据库");
      return data;
    } catch (error) {
      setDrafts((current) => ({
        ...current,
        [chapterId]: {
          ...current[chapterId],
          status: "error",
          error: error.message
        }
      }));
      setError(error.message);
      throw error;
    }
  }

  async function applyRewrite(chapterId, payload) {
    const project = activeProjectRef.current;
    const draft = draftsRef.current[chapterId];
    if (!project || !draft) return null;

    try {
      const nextContent =
        payload.scope === "selection"
          ? applyPartialRewrite(draft.content, payload.selectionContext, payload.content)
          : payload.content;

      if (payload.scope === "selection" && nextContent == null) {
        throw new Error("原文选区已经变化，无法定位局部替换位置。请回到章节编辑器重新选择。");
      }

      const data = await request(`/api/projects/${project.id}/chapters/${chapterId}/rewrite-apply`, {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          tone: draft.tone,
          content: nextContent,
          style: payload.style
        })
      });

      setState(data);
      syncDraftFromResponse(data, project.id, chapterId, {
        ...draft,
        content: nextContent
      });
      notify(payload.scope === "selection" ? "润色结果已替换选中片段" : "润色结果已覆盖当前章节");
      return data;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  async function saveRewriteVersion(chapterId, payload) {
    const project = activeProjectRef.current;
    const draft = draftsRef.current[chapterId];
    if (!project || !draft) return null;

    try {
      const nextContent =
        payload.scope === "selection"
          ? applyPartialRewrite(draft.content, payload.selectionContext, payload.content)
          : payload.content;

      if (payload.scope === "selection" && nextContent == null) {
        throw new Error("原文选区已经变化，无法保存局部替换版本。请重新选择后再试。");
      }

      const data = await request(`/api/projects/${project.id}/chapters/${chapterId}/versions`, {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          tone: draft.tone,
          content: nextContent,
          style: payload.style,
          source: payload.scope === "selection" ? "rewrite-selection" : "rewrite"
        })
      });

      setState(data);
      notify(payload.scope === "selection" ? "局部润色结果已另存为新版本" : "润色结果已另存为新版本");
      return data;
    } catch (error) {
      setError(error.message);
      throw error;
    }
  }

  function restoreVersion(chapterId, version) {
    updateDraft(chapterId, {
      title: version.title,
      tone: version.tone,
      content: version.content
    });
    notify("版本内容已载入编辑器");
  }

  return {
    drafts,
    selectedChapter,
    selectedChapterId,
    selectedDraft,
    setSelectedChapterId,
    updateDraft,
    saveDraft,
    saveChapter,
    applyRewrite,
    saveRewriteVersion,
    restoreVersion
  };
}

function App() {
  const [state, setState] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [activeTab, setActiveTab] = useState("studio");
  const [chapterEditorRoute, setChapterEditorRoute] = useState(() => readChapterEditorRoute());
  const [settingExtractorRoute, setSettingExtractorRoute] = useState(() => readSettingExtractorRoute());
  const [rewritePrefill, setRewritePrefill] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ai-novel:sidebar-collapsed") === "true";
  });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    loadState();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function syncRoute() {
      setChapterEditorRoute(readChapterEditorRoute());
      setSettingExtractorRoute(readSettingExtractorRoute());
    }

    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ai-novel:sidebar-collapsed", String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "请求失败");
    }
    return payload;
  }

  async function streamText(path, body, label, { onDelta, onDone, signal } = {}) {
    setWorking(label);
    setError("");

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const raw = await response.text();
        let payload = null;
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch (_error) {
          payload = null;
        }
        throw new Error(payload?.error || raw || "请求失败");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("浏览器未返回可读取的流");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let result = "";
      let sawDone = false;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (block.trim()) {
            let payload = null;
            try {
              payload = parseSseDataBlock(block);
            } catch (_error) {
              payload = null;
            }
            if (payload?.type === "delta") {
              result = typeof payload.result === "string" ? payload.result : `${result}${payload.delta || ""}`;
              onDelta?.(payload.delta || "", result);
            } else if (payload?.type === "done") {
              result = typeof payload.result === "string" ? payload.result : result;
              sawDone = true;
              onDone?.(result, payload);
            } else if (payload?.type === "error") {
              throw new Error(payload.error || "请求失败");
            }
          }

          boundary = buffer.indexOf("\n\n");
        }

        if (done) break;
      }

      if (!sawDone) {
        onDone?.(result, { type: "done", result });
      }
      notify(`${label}完成`);
      return result;
    } catch (err) {
      if (isAbortLikeError(err)) {
        throw err;
      }
      setError(err.message);
      throw err;
    } finally {
      setWorking("");
    }
  }

  async function streamEvents(path, body, label, { onEvent, onDone, signal } = {}) {
    setWorking(label);
    setError("");

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal
      });

      if (!response.ok) {
        const raw = await response.text();
        let payload = null;
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch (_error) {
          payload = null;
        }
        throw new Error(payload?.error || raw || "请求失败");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("浏览器未返回可读取的流");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload = null;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (block.trim()) {
            const payload = parseSseDataBlock(block);
            if (payload?.type === "error") {
              onEvent?.(payload);
              throw new Error(payload.error || "请求失败");
            }
            if (payload?.type === "done") {
              donePayload = payload;
              onDone?.(payload);
            } else if (payload) {
              onEvent?.(payload);
            }
          }

          boundary = buffer.indexOf("\n\n");
        }

        if (done) break;
      }

      const data = donePayload
        ? Object.fromEntries(Object.entries(donePayload).filter(([key]) => key !== "type"))
        : {};
      if (Object.prototype.hasOwnProperty.call(data, "projects")) {
        setState(data);
      }
      if (Object.prototype.hasOwnProperty.call(data, "activeProjectId")) {
        setActiveProjectId(data.activeProjectId || "");
      }
      notify(`${label}完成`);
      return data;
    } catch (err) {
      if (isAbortLikeError(err)) {
        throw err;
      }
      setError(err.message);
      throw err;
    } finally {
      setWorking("");
    }
  }

  async function loadState() {
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/state");
      setState(data);
      setActiveProjectId((current) => current || data.projects[0]?.id || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function mutate(path, body, label) {
    setWorking(label);
    setError("");
    try {
      const data = await request(path, {
        method: "POST",
        body: JSON.stringify(body)
      });
      setState(data);
      if (Object.prototype.hasOwnProperty.call(data, "activeProjectId")) {
        setActiveProjectId(data.activeProjectId || "");
      }
      notify(`${label}完成`);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setWorking("");
    }
  }

  const activeProject = useMemo(
    () => state?.projects.find((project) => project.id === activeProjectId) || state?.projects[0],
    [state, activeProjectId]
  );
  const projectDownloadKey = useMemo(
    () => makeWebDraftKey(activeProject?.id || activeProjectId, "project-download-format"),
    [activeProject?.id, activeProjectId]
  );
  const [projectDownloadFormat, setProjectDownloadFormat] = useWebDraftState(projectDownloadKey, "markdown");

  const chapterWorkspace = useChapterWorkspace({
    activeProject,
    request,
    setState,
    setError,
    notify
  });
  const isStandaloneChapterEditor = Boolean(chapterEditorRoute?.projectId);
  const isStandaloneSettingExtractor = Boolean(settingExtractorRoute?.projectId);
  const isStandaloneNewChapter = chapterEditorRoute?.mode === "new";
  const standaloneRouteReady =
    !isStandaloneChapterEditor ||
    (activeProject?.id === chapterEditorRoute?.projectId &&
      (isStandaloneNewChapter || chapterWorkspace.selectedChapterId === chapterEditorRoute?.chapterId));
  const hasLeafPage = isStandaloneChapterEditor || isStandaloneSettingExtractor;

  const hasProjects = (state?.projects?.length || 0) > 0;

  useEffect(() => {
    if (!chapterEditorRoute?.projectId) return;
    setActiveProjectId((current) => (current === chapterEditorRoute.projectId ? current : chapterEditorRoute.projectId));
  }, [chapterEditorRoute?.projectId]);

  useEffect(() => {
    if (!settingExtractorRoute?.projectId) return;
    setActiveProjectId((current) =>
      current === settingExtractorRoute.projectId ? current : settingExtractorRoute.projectId
    );
  }, [settingExtractorRoute?.projectId]);

  useEffect(() => {
    if (!chapterEditorRoute?.projectId) return;
    if (activeTab !== "chapters") {
      setActiveTab("chapters");
    }
    if (chapterEditorRoute.mode !== "new" && chapterEditorRoute.chapterId && chapterWorkspace.selectedChapterId !== chapterEditorRoute.chapterId) {
      chapterWorkspace.setSelectedChapterId(chapterEditorRoute.chapterId);
    }
  }, [
    chapterEditorRoute?.projectId,
    chapterEditorRoute?.chapterId,
    chapterEditorRoute?.mode,
    chapterWorkspace.selectedChapterId,
    chapterWorkspace.setSelectedChapterId,
    activeTab
  ]);

  useEffect(() => {
    if (!settingExtractorRoute?.projectId) return;
    if (activeTab !== "bible") {
      setActiveTab("bible");
    }
  }, [settingExtractorRoute?.projectId, activeTab]);

  function syncLeafRoutesFromLocation() {
    setChapterEditorRoute(readChapterEditorRoute());
    setSettingExtractorRoute(readSettingExtractorRoute());
  }

  function syncChapterEditorRoute(route, { replace = false } = {}) {
    if (typeof window === "undefined") return;

    const nextHash = route ? buildChapterEditorHash(route.projectId, route.chapterId, route.mode) : "";
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

    if (replace) {
      window.history.replaceState(null, "", nextUrl);
      syncLeafRoutesFromLocation();
      return;
    }

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      syncLeafRoutesFromLocation();
    }
  }

  function syncSettingExtractorRoute(route, { replace = false } = {}) {
    if (typeof window === "undefined") return;

    const nextHash = route ? buildSettingExtractorHash(route.projectId, route.chapterId) : "";
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;

    if (replace) {
      window.history.replaceState(null, "", nextUrl);
      syncLeafRoutesFromLocation();
      return;
    }

    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      syncLeafRoutesFromLocation();
    }
  }

  function openChapterEditorPage(projectId, chapterId) {
    if (!projectId || !chapterId) return;
    setActiveProjectId(projectId);
    setActiveTab("chapters");
    chapterWorkspace.setSelectedChapterId(chapterId);
    syncChapterEditorRoute({ projectId, chapterId, mode: "existing" });
  }

  function openBlankChapterEditorPage(projectId) {
    if (!projectId) return;
    setActiveProjectId(projectId);
    setActiveTab("chapters");
    syncChapterEditorRoute({ projectId, chapterId: "", mode: "new" });
  }

  function changeChapterEditorPage(chapterId) {
    if (!activeProject?.id || !chapterId) return;
    chapterWorkspace.setSelectedChapterId(chapterId);
    syncChapterEditorRoute({ projectId: activeProject.id, chapterId, mode: "existing" }, { replace: true });
  }

  function closeChapterEditorPage() {
    setActiveTab("chapters");
    syncChapterEditorRoute(null, { replace: true });
  }

  function openSettingExtractorPage(projectId, chapterId = "") {
    if (!projectId) return;
    setActiveProjectId(projectId);
    setActiveTab("bible");
    syncSettingExtractorRoute({ projectId, chapterId });
  }

  function changeSettingExtractorPage(chapterId) {
    if (!activeProject?.id) return;
    syncSettingExtractorRoute({ projectId: activeProject.id, chapterId }, { replace: true });
  }

  function closeSettingExtractorPage() {
    setActiveTab("bible");
    syncSettingExtractorRoute(null, { replace: true });
  }

  function openPartialRewrite(selection) {
    if (!selection?.selectedText?.length) return;
    setRewritePrefill(selection);
    chapterWorkspace.setSelectedChapterId(selection.chapterId);
    syncChapterEditorRoute(null, { replace: true });
    syncSettingExtractorRoute(null, { replace: true });
    setActiveTab("rewrite");
  }

  async function downloadBinary(path, fileName, label) {
    setWorking(label);
    setError("");
    try {
      const response = await fetch(`${API_BASE}${path}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "下载失败");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
      notify("下载已开始");
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking("");
    }
  }

  async function downloadProject() {
    if (!activeProject) return;
    await downloadBinary(
      `/api/projects/${activeProject.id}/export?format=${encodeURIComponent(projectDownloadFormat)}`,
      buildDownloadName(activeProject.title || "novel", projectDownloadFormat),
      "下载全文"
    );
  }

  if (loading) return <LoadingScreen />;
  if (!state) return <ErrorScreen message={error || "无法加载应用数据"} onRetry={loadState} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <button
          className="sidebar-collapse-toggle"
          type="button"
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          onClick={() => setIsSidebarCollapsed((current) => !current)}
        >
          {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        {!isSidebarCollapsed && (
          <>
            <div className="brand">
              <div className="brand-mark">
                <BrainCircuit size={22} />
              </div>
              <div>
                <strong>AI 小说导演</strong>
                <span>长篇创作工作台</span>
              </div>
            </div>

            <ProjectCreator
              onCreate={(project) => mutate("/api/projects", project, "创建项目")}
              disabled={Boolean(working)}
            />

            <div className="project-list">
              {state.projects.map((project) => (
                <button
                  key={project.id}
                  className={`project-pill ${project.id === activeProject?.id ? "active" : ""}`}
                  onClick={() => setActiveProjectId(project.id)}
                >
                  <BookOpen size={16} />
                  <span>{project.title}</span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>

            <div className="sidebar-footer">
              {activeProject && (
                <ProjectDangerZone project={activeProject} mutate={mutate} working={working} />
              )}
              <AiConfigPanel aiConfig={state.aiConfig} mutate={mutate} working={working} />
            </div>
          </>
        )}
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {activeProject?.genre || "长篇小说"} · {activeProject?.status || "筹备中"} ·{" "}
              {activeProject?.defaultTone || "热血"}
            </p>
            <h1>{activeProject?.title || "AI 小说导演"}</h1>
          </div>
          <div className="topbar-actions">
            {working && (
              <span className="work-indicator">
                <Loader2 size={16} className="spin" />
                {working}
              </span>
            )}
            {activeProject && (
              <>
                <DownloadFormatSelect
                  value={projectDownloadFormat}
                  onChange={setProjectDownloadFormat}
                />
                <button className="secondary-button" onClick={downloadProject}>
                  <Download size={16} />
                  下载全文
                </button>
              </>
            )}
            <button className="icon-button" onClick={loadState} title="刷新">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {!hasProjects && <EmptyWorkspace />}

        {hasProjects && !hasLeafPage && (
          <nav className="tabs">
            <TabButton active={activeTab === "studio"} onClick={() => setActiveTab("studio")} icon={Gauge} label="创作台" />
            <TabButton active={activeTab === "bible"} onClick={() => setActiveTab("bible")} icon={Library} label="设定库" />
            <TabButton active={activeTab === "chapters"} onClick={() => setActiveTab("chapters")} icon={FileText} label="章节生成" />
            <TabButton
              active={false}
              onClick={() => {
                if (!activeProject) return;
                const chapterId = chapterWorkspace.selectedChapterId || activeProject.chapters[0]?.id || "";
                if (chapterId) {
                  openChapterEditorPage(activeProject.id, chapterId);
                } else {
                  openBlankChapterEditorPage(activeProject.id);
                }
              }}
              icon={Edit3}
              label="章节编辑"
            />
            <TabButton active={activeTab === "threads"} onClick={() => setActiveTab("threads")} icon={GitBranch} label="伏笔" />
            <TabButton active={activeTab === "rewrite"} onClick={() => setActiveTab("rewrite")} icon={Wand2} label="润色/修改" />
            <TabButton active={activeTab === "io"} onClick={() => setActiveTab("io")} icon={BrainCircuit} label="I/O记录" />
          </nav>
        )}

        {activeProject && isStandaloneChapterEditor && standaloneRouteReady && (
          <ChapterEditorPage
            project={activeProject}
            mutate={mutate}
            working={working}
            workspace={chapterWorkspace}
            downloadBinary={downloadBinary}
            onBack={closeChapterEditorPage}
            onChangeChapter={changeChapterEditorPage}
            onCreateChapter={(chapterId) => openChapterEditorPage(activeProject.id, chapterId)}
            onRewriteSelection={openPartialRewrite}
            onOpenSettingExtractor={(chapterId) =>
              openSettingExtractorPage(activeProject.id, chapterId)
            }
            isNewMode={isStandaloneNewChapter}
          />
        )}
        {activeProject && isStandaloneChapterEditor && !standaloneRouteReady && (
          <div className="center-screen">
            <Loader2 className="spin" size={24} />
            <span>正在切换章节编辑页</span>
          </div>
        )}

        {activeProject && isStandaloneSettingExtractor && (
          <SettingExtractorPage
            project={activeProject}
            mutate={mutate}
            working={working}
            routeChapterId={settingExtractorRoute?.chapterId || ""}
            onBack={closeSettingExtractorPage}
            onChangeChapter={changeSettingExtractorPage}
          />
        )}

        {activeProject && !hasLeafPage && activeTab === "studio" && (
          <StudioTab
            project={activeProject}
            request={request}
            mutate={mutate}
            streamEvents={streamEvents}
            working={working}
            setActiveTab={setActiveTab}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "bible" && (
          <BibleTab
            project={activeProject}
            mutate={mutate}
            working={working}
            onOpenSettingExtractor={(chapterId = "") =>
              openSettingExtractorPage(activeProject.id, chapterId)
            }
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "chapters" && (
          <ChapterGenerationPage
            project={activeProject}
            working={working}
            workspace={chapterWorkspace}
            openChapterEditorPage={openChapterEditorPage}
            openBlankChapterEditorPage={openBlankChapterEditorPage}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "threads" && (
          <ThreadsTab project={activeProject} mutate={mutate} working={working} />
        )}
        {activeProject && !hasLeafPage && activeTab === "rewrite" && (
          <RewriteTab
            project={activeProject}
            mutate={mutate}
            streamText={streamText}
            working={working}
            workspace={chapterWorkspace}
            rewritePrefill={rewritePrefill}
            clearRewritePrefill={setRewritePrefill}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "io" && (
          <IoLogsTab project={activeProject} />
        )}

        {toast && (
          <div className="toast">
            <CheckCircle2 size={17} />
            {toast}
          </div>
        )}
      </main>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="center-screen">
      <Loader2 className="spin" size={28} />
      <span>正在载入创作工作台</span>
    </div>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div className="center-screen">
      <AlertTriangle size={28} />
      <span>{message}</span>
      <button className="primary-button" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <div className="empty-workspace">
      <BookOpen size={22} />
      <div>
        <strong>还没有项目</strong>
        <p>先在左侧创建一个小说项目，再开始设定、章节、伏笔和润色/修改协作。</p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button className={`tab-button ${active ? "active" : ""}`} onClick={onClick}>
      <Icon size={17} />
      {label}
    </button>
  );
}

function DownloadFormatSelect({ value, onChange }) {
  return (
    <select className="download-select" value={value} onChange={(event) => onChange(event.target.value)}>
      {downloadFormatOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ToneComposer({ value, onChange, placeholder = "输入自定义语气" }) {
  return (
    <div className="tone-composer">
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      <div className="chip-row">
        {tonePresets.map((tone) => (
          <button key={tone} type="button" onClick={() => onChange(tone)}>
            {tone}
          </button>
        ))}
      </div>
    </div>
  );
}

function SaveIndicator({ draft }) {
  if (!draft) return null;
  const text =
    draft.status === "saving"
      ? "草稿自动保存中"
      : draft.status === "dirty"
        ? "草稿待保存"
        : draft.status === "error"
          ? "草稿保存失败"
          : `草稿已保存 ${formatTime(draft.lastSavedAt)}`;

  return (
    <span className={`save-indicator ${draft.status}`}>
      <Clock3 size={14} />
      {text}
    </span>
  );
}

function ProjectCreator({ onCreate, disabled }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    genre: "玄幻",
    premise: "",
    targetAudience: "网文新人作者",
    defaultTone: "热血"
  });

  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) return;
    await onCreate(form);
    setOpen(false);
    setForm({
      title: "",
      genre: "玄幻",
      premise: "",
      targetAudience: "网文新人作者",
      defaultTone: "热血"
    });
  }

  return (
    <div className="creator-box">
      <button className="primary-button full" onClick={() => setOpen((value) => !value)} disabled={disabled}>
        <Plus size={17} />
        新建小说项目
      </button>
      {open && (
        <form className="stacked-form" onSubmit={submit}>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="书名" />
          <select value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })}>
            {genreOptions.map((genre) => (
              <option key={genre}>{genre}</option>
            ))}
          </select>
          <textarea
            value={form.premise}
            onChange={(event) => setForm({ ...form, premise: event.target.value })}
            placeholder="一句话核心卖点"
            rows={3}
          />
          <input
            value={form.targetAudience}
            onChange={(event) => setForm({ ...form, targetAudience: event.target.value })}
            placeholder="目标读者"
          />
          <label>
            创作台语气
            <ToneComposer value={form.defaultTone} onChange={(defaultTone) => setForm({ ...form, defaultTone })} />
          </label>
          <button className="primary-button" type="submit">
            创建
          </button>
        </form>
      )}
    </div>
  );
}

function ProjectDangerZone({ project, mutate, working }) {
  const [open, setOpen] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const deleteCode = getProjectDeleteCode(project.id);

  async function submit(event) {
    event.preventDefault();
    await mutate(`/api/projects/${project.id}/delete`, { confirmationCode }, "删除项目");
    setConfirmationCode("");
    setOpen(false);
  }

  return (
    <div className="danger-zone">
      <button className="danger-trigger" type="button" disabled={Boolean(working)} onClick={() => setOpen((value) => !value)}>
        <Trash2 size={16} />
        删除当前项目
      </button>
      {open && (
        <form className="stacked-form danger-card" onSubmit={submit}>
          <p>
            删除 <strong>{project.title}</strong> 前，请输入验证码：
          </p>
          <code>{deleteCode}</code>
          <input
            value={confirmationCode}
            onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())}
            placeholder="输入验证码确认删除"
          />
          <button
            className="danger-button"
            type="submit"
            disabled={Boolean(working) || confirmationCode.trim().toUpperCase() !== deleteCode}
          >
            <Trash2 size={16} />
            确认删除项目
          </button>
        </form>
      )}
    </div>
  );
}

function AiConfigPanel({ aiConfig, mutate, working }) {
  const profiles = aiConfig?.profiles || [];
  const activeProfile =
    aiConfig?.activeProfile ||
    profiles.find((item) => item.id === aiConfig?.activeProfileId) ||
    profiles[0] ||
    null;
  const [open, setOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(activeProfile?.id || "");
  const [form, setForm] = useState(() => buildAiProfileDraft(activeProfile));
  const remoteEnabled = !["", "local", "mock"].includes(String(form.provider || "").trim().toLowerCase());
  const summaryParts = [
    activeProfile?.name || "未命名配置",
    activeProfile?.provider || "local",
    activeProfile?.model || "local"
  ].filter(Boolean);

  if (activeProfile?.thinkingMode) {
    summaryParts.push(`thinking:${activeProfile.thinkingMode}`);
  }
  if (activeProfile?.reasoningEffort) {
    summaryParts.push(`effort:${activeProfile.reasoningEffort}`);
  }

  useEffect(() => {
    setSelectedProfileId(activeProfile?.id || "");
    setForm(buildAiProfileDraft(activeProfile));
  }, [activeProfile?.id, activeProfile?.updatedAt]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function switchProfile(profileId) {
    if (!profileId || profileId === activeProfile?.id) {
      setSelectedProfileId(profileId || "");
      const profile = profiles.find((item) => item.id === profileId) || activeProfile;
      setForm(buildAiProfileDraft(profile));
      return;
    }

    const data = await mutate(`/api/ai-profiles/${profileId}/select`, {}, "切换AI配置");
    const nextActive = data.aiConfig?.activeProfile || null;
    setSelectedProfileId(nextActive?.id || profileId);
    setForm(buildAiProfileDraft(nextActive));
  }

  async function saveCurrent(event) {
    event.preventDefault();

    if (!activeProfile?.id) {
      const data = await mutate("/api/ai-profiles", form, "新建AI配置");
      const nextActive = data.aiConfig?.activeProfile || null;
      setSelectedProfileId(nextActive?.id || "");
      setForm(buildAiProfileDraft(nextActive));
      return;
    }

    const data = await mutate(`/api/ai-profiles/${activeProfile.id}`, form, "保存AI配置");
    const nextActive = data.aiConfig?.activeProfile || null;
    setSelectedProfileId(nextActive?.id || activeProfile.id);
    setForm(buildAiProfileDraft(nextActive));
  }

  async function saveAsNew() {
    const data = await mutate("/api/ai-profiles", form, "另存AI配置");
    const nextActive = data.aiConfig?.activeProfile || null;
    setSelectedProfileId(nextActive?.id || "");
    setForm(buildAiProfileDraft(nextActive));
  }

  async function deleteCurrent() {
    if (!activeProfile?.id || profiles.length <= 1) return;
    const data = await mutate(`/api/ai-profiles/${activeProfile.id}/delete`, {}, "删除AI配置");
    const nextActive = data.aiConfig?.activeProfile || null;
    setSelectedProfileId(nextActive?.id || "");
    setForm(buildAiProfileDraft(nextActive));
  }

  function resetForm() {
    setForm(buildAiProfileDraft(activeProfile));
  }

  return (
    <div className="sidebar-section-card ai-config-panel">
      <button className="secondary-button full" type="button" disabled={Boolean(working)} onClick={() => setOpen((value) => !value)}>
        <BrainCircuit size={16} />
        AI 设置
      </button>
      <small className="ai-config-summary">{summaryParts.join(" / ")}</small>
      {open && (
        <form className="stacked-form ai-config-form" onSubmit={saveCurrent}>
          <label>
            当前配置
            <select value={selectedProfileId} onChange={(event) => switchProfile(event.target.value).catch(() => {})}>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            配置名称
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="例如：DeepSeek Pro" />
          </label>
          <label>
            AI_PROVIDER
            <input
              value={form.provider}
              onChange={(event) => updateField("provider", event.target.value)}
              placeholder="local / openai / deepseek"
            />
          </label>
          <label>
            API_KEY
            <input
              type="password"
              value={form.apiKey}
              onChange={(event) => updateField("apiKey", event.target.value)}
              placeholder="远程模型需要填写"
            />
          </label>
          <label>
            BASE_URL
            <input
              value={form.baseUrl}
              onChange={(event) => updateField("baseUrl", event.target.value)}
              placeholder="例如：https://api.deepseek.com"
            />
          </label>
          <label>
            模型
            <input
              value={form.model}
              onChange={(event) => updateField("model", event.target.value)}
              placeholder="例如：deepseek-v4-pro"
            />
          </label>
          <div className="form-row">
            <label>
              思考模式
              <select value={form.thinkingMode} onChange={(event) => updateField("thinkingMode", event.target.value)} disabled={!remoteEnabled}>
                <option value="">默认</option>
                <option value="enabled">enabled</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
            <label>
              思考强度
              <select
                value={form.reasoningEffort}
                onChange={(event) => updateField("reasoningEffort", event.target.value)}
                disabled={!remoteEnabled || form.thinkingMode === "disabled"}
              >
                <option value="">默认</option>
                <option value="high">high</option>
                <option value="max">max</option>
              </select>
            </label>
          </div>
          <small className="ai-config-hint">
            DeepSeek `deepseek-v4-pro` 可设置 `thinking=enabled`，并用 `high` 或 `max` 控制思考强度。
          </small>
          <div className="card-actions ai-config-actions">
            <button className="primary-button" type="submit" disabled={Boolean(working)}>
              <Save size={16} />
              保存当前
            </button>
            <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => saveAsNew().catch(() => {})}>
              <Plus size={16} />
              另存为新配置
            </button>
            <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={resetForm}>
              <Target size={16} />
              重置表单
            </button>
            <button
              className="danger-button"
              type="button"
              disabled={Boolean(working) || profiles.length <= 1}
              onClick={() => deleteCurrent().catch(() => {})}
            >
              <Trash2 size={16} />
              删除当前配置
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function FieldAssist({ project, mutate, working, section, fieldLabel, value, guidance, onApply }) {
  async function run(mode) {
    const actionLabel = `${mode === "expand" ? "扩写" : "润色"}${fieldLabel}`;
    const data = await mutate(
      `/api/projects/${project.id}/assist`,
      {
        section,
        fieldLabel,
        source: value,
        mode,
        guidance
      },
      actionLabel
    );
    if (data.assistResult) onApply(data.assistResult);
  }

  return (
    <div className="field-assist">
      <button type="button" disabled={Boolean(working)} onClick={() => run("expand")}>
        <Sparkles size={14} />
        扩写
      </button>
      <button type="button" disabled={Boolean(working)} onClick={() => run("polish")}>
        <Wand2 size={14} />
        润色
      </button>
    </div>
  );
}

function StudioTab({ project, request, mutate, streamEvents, working, setActiveTab }) {
  const latestReport = project.reports[0];
  const chapterCount = project.chapters.length;
  const unresolvedThreads = project.foreshadows.filter((item) => item.status !== "已回收").length;
  const characterCount = project.settings.filter((item) => item.type === "character").length;
  const ioLogCount = project.ioLogs?.length || 0;

  return (
    <section className="content-grid studio-grid">
      <div className="quick-actions">
        <button onClick={() => setActiveTab("chapters")}>
          <Sparkles size={17} />
          写下一章
        </button>
        <button onClick={() => setActiveTab("bible")}>
          <Plus size={17} />
          补设定
        </button>
        <button onClick={() => setActiveTab("threads")}>
          <GitBranch size={17} />
          记伏笔
        </button>
        <button onClick={() => setActiveTab("rewrite")}>
          <Wand2 size={17} />
          润色/修改正文
        </button>
        <button onClick={() => setActiveTab("io")}>
          <BrainCircuit size={17} />
          看 I/O 记录
        </button>
      </div>

      <div className="overview-band">
        <div className="metric"><span>章节</span><strong>{chapterCount}</strong></div>
        <div className="metric"><span>设定资产</span><strong>{project.settings.length}</strong></div>
        <div className="metric"><span>角色卡</span><strong>{characterCount}</strong></div>
        <div className="metric"><span>未回收伏笔</span><strong>{unresolvedThreads}</strong></div>
        <div className="metric"><span>I/O 记录</span><strong>{ioLogCount}</strong></div>
      </div>

      <div className="panel chapter-engine-panel wide">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Chapter Cockpit</p>
            <h2>单章驾驶舱</h2>
          </div>
          <Edit3 size={20} />
        </div>
        <ChapterGenerator project={project} request={request} mutate={mutate} streamEvents={streamEvents} working={working} compact />
      </div>

      <div className="studio-main-column">
        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Plot Map</p>
              <h2>情节地图</h2>
            </div>
            <GitBranch size={20} />
          </div>
          <PlotMap project={project} />
        </div>
      </div>

      <div className="studio-side-column">
        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Project Tone</p>
              <h2>创作台语气</h2>
            </div>
            <Gauge size={20} />
          </div>
          <ProjectTonePanel project={project} mutate={mutate} working={working} />
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Risk Radar</p>
              <h2>一致性雷达</h2>
            </div>
            <Target size={20} />
          </div>
          {latestReport ? <ReportCard report={latestReport} /> : <EmptyState text="生成章节后可运行一致性检查。" />}
          <button
            className="secondary-button full"
            disabled={!project.chapters.length || Boolean(working)}
            onClick={() => mutate(`/api/projects/${project.id}/check`, {}, "检查最新章节")}
          >
            <CheckCircle2 size={17} />
            检查最新章节
          </button>
        </div>
      </div>
    </section>
  );
}

function ProjectTonePanel({ project, mutate, working }) {
  const toneDraftKey = useMemo(() => makeWebDraftKey(project.id, "studio-tone"), [project.id]);
  const [tone, setTone] = useWebDraftState(toneDraftKey, project.defaultTone || "热血");

  async function submit(event) {
    event.preventDefault();
    if (!tone.trim()) return;
    await mutate(`/api/projects/${project.id}/preferences`, { defaultTone: tone }, "保存创作台语气");
  }

  return (
    <form className="editor-form" onSubmit={submit}>
      <label>
        当前默认语气
        <ToneComposer value={tone} onChange={setTone} placeholder="例如：热血压迫感、冷感克制" />
      </label>
      <button className="primary-button" type="submit" disabled={Boolean(working)}>
        <Save size={16} />
        保存创作台语气
      </button>
    </form>
  );
}

function TagInput({ value, onChange, placeholder = "输入后回车添加标签" }) {
  const tags = normalizeTagList(value);
  const [draft, setDraft] = useState("");

  function commit(nextValue = draft) {
    const nextTags = normalizeTagList([...tags, ...normalizeTagList(nextValue)]);
    if (!nextTags.length && !tags.length) return;
    onChange(stringifyTagList(nextTags));
    setDraft("");
  }

  function removeTag(tag) {
    onChange(stringifyTagList(tags.filter((item) => item !== tag)));
  }

  function handleKeyDown(event) {
    if (!["Enter", ",", "，", "、", ";", "；"].includes(event.key)) return;
    event.preventDefault();
    if (!draft.trim()) return;
    commit();
  }

  return (
    <div className="tag-editor">
      <div className="tag-editor-pills">
        {tags.length ? (
          tags.map((tag) => (
            <button
              className="tag-editor-chip"
              key={tag}
              type="button"
              onClick={() => removeTag(tag)}
              title={`移除标签 ${tag}`}
            >
              <span>{tag}</span>
              <small>×</small>
            </button>
          ))
        ) : (
          <span className="tag-editor-empty">暂无标签，输入后按回车添加。</span>
        )}
      </div>
      <div className="tag-editor-input">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <button type="button" onClick={() => commit()} disabled={!draft.trim()}>
          添加
        </button>
      </div>
    </div>
  );
}

function TagList({ value }) {
  const tags = normalizeTagList(value);
  if (!tags.length) return null;

  return (
    <div className="tag-list">
      {tags.map((tag) => (
        <span className="tag" key={tag}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function BibleTab({ project, mutate, working, onOpenSettingExtractor }) {
  const bibleFormKey = useMemo(() => makeWebDraftKey(project.id, "bible-form"), [project.id]);
  const bibleQueryKey = useMemo(() => makeWebDraftKey(project.id, "bible-query"), [project.id]);
  const bibleEditKey = useMemo(() => makeWebDraftKey(project.id, "bible-edit"), [project.id]);
  const bibleSectionsKey = useMemo(() => makeWebDraftKey(project.id, "bible-sections"), [project.id]);
  const [form, setForm, resetForm] = useWebDraftState(bibleFormKey, {
    type: "character",
    name: "",
    summary: "",
    traits: "",
    rules: ""
  });
  const [query, setQuery] = useWebDraftState(bibleQueryKey, "");
  const [editState, setEditState] = useWebDraftState(bibleEditKey, {
    activeId: "",
    expandedId: "",
    drafts: {}
  });
  const [collapsedSections, setCollapsedSections] = useWebDraftState(
    bibleSectionsKey,
    Object.fromEntries(settingTypes.map((type) => [type.id, false]))
  );
  const normalizedQuery = query.trim().toLowerCase();
  const activeEditId = editState.activeId || "";
  const expandedId = editState.expandedId || "";
  const editDrafts = editState.drafts || {};

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.summary.trim()) return;
    await mutate(
      `/api/projects/${project.id}/settings`,
      { ...form, traits: stringifyTagList(form.traits) },
      "保存设定"
    );
    resetForm({ type: form.type, name: "", summary: "", traits: "", rules: "" });
  }

  function startEdit(item) {
    setCollapsedSections((current) => ({
      ...(current || {}),
      [item.type]: false
    }));
    setEditState((current) => ({
      activeId: item.id,
      expandedId: item.id,
      drafts: {
        ...(current?.drafts || {}),
        [item.id]: current?.drafts?.[item.id] || buildSettingDraft(item)
      }
    }));
  }

  function collapseEdit() {
    setEditState((current) => ({ ...current, activeId: "" }));
  }

  function resetEditDraft(item) {
    setEditState((current) => ({
      activeId: item.id,
      drafts: {
        ...(current?.drafts || {}),
        [item.id]: buildSettingDraft(item)
      }
    }));
  }

  function updateEditDraft(item, patch) {
    setEditState((current) => ({
      activeId: item.id,
      drafts: {
        ...(current?.drafts || {}),
        [item.id]: {
          ...(current?.drafts?.[item.id] || buildSettingDraft(item)),
          ...patch
        }
      }
    }));
  }

  async function saveEdit(item) {
    const draft = editDrafts[item.id] || buildSettingDraft(item);
    if (!draft.name.trim() || !draft.summary.trim()) return;

    await mutate(
      `/api/projects/${project.id}/settings/${item.id}`,
      { ...draft, traits: stringifyTagList(draft.traits) },
      "更新设定"
    );
    setEditState((current) => {
      const nextDrafts = { ...(current?.drafts || {}) };
      delete nextDrafts[item.id];
      return {
        activeId: current?.activeId === item.id ? "" : current?.activeId || "",
        expandedId: item.id,
        drafts: nextDrafts
      };
    });
  }

  async function deleteSetting(item) {
    if (!window.confirm(`确认删除设定“${item.name}”吗？此操作不可恢复。`)) return;

    await mutate(`/api/projects/${project.id}/settings/${item.id}/delete`, {}, "删除设定");
    setEditState((current) => {
      const nextDrafts = { ...(current?.drafts || {}) };
      delete nextDrafts[item.id];
      return {
        activeId: current?.activeId === item.id ? "" : current?.activeId || "",
        expandedId: current?.expandedId === item.id ? "" : current?.expandedId || "",
        drafts: nextDrafts
      };
    });
  }

  function toggleSection(sectionId) {
    setCollapsedSections((current) => ({
      ...(current || {}),
      [sectionId]: !current?.[sectionId]
    }));
  }

  function toggleSettingCard(item) {
    setCollapsedSections((current) => ({
      ...(current || {}),
      [item.type]: false
    }));
    setEditState((current) => {
      const isSameCard = current?.expandedId === item.id;
      return {
        ...current,
        activeId: isSameCard && current?.activeId === item.id ? "" : current?.activeId || "",
        expandedId: isSameCard ? "" : item.id,
        drafts: current?.drafts || {}
      };
    });
  }

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Story Bible</p>
            <h2>新增结构化设定</h2>
          </div>
          <div className="panel-title-actions">
            <button className="secondary-button" type="button" onClick={() => onOpenSettingExtractor?.()}>
              <Sparkles size={16} />
              打开提取页
            </button>
            <Library size={20} />
          </div>
        </div>
        <form className="editor-form" onSubmit={submit}>
          <label>
            类型
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {settingTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            名称
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="如：沈照夜 / 血玉 / 北境王庭" />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="名称"
              value={form.name}
              guidance="输出一个适合小说设定库的短名称，不加解释。"
              onApply={(name) => setForm((current) => ({ ...current, name }))}
            />
          </label>
          <label>
            核心设定
            <textarea
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
              rows={5}
              placeholder="这个设定在故事中的作用、限制、秘密。"
            />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="核心设定"
              value={form.summary}
              guidance="写成可直接入库的设定摘要，兼顾作用、限制和秘密。"
              onApply={(summary) => setForm((current) => ({ ...current, summary }))}
            />
          </label>
          <label>
            特征标签
            <TagInput
              value={form.traits}
              onChange={(traits) => setForm((current) => ({ ...current, traits }))}
              placeholder="输入后回车添加，如：冷静、火系、复仇"
            />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="特征标签"
              value={form.traits}
              guidance="输出 3 到 6 个短标签，用顿号分隔。"
              onApply={(traits) => setForm((current) => ({ ...current, traits: stringifyTagList(traits) }))}
            />
          </label>
          <label>
            禁忌 / 不可违背
            <textarea value={form.rules} onChange={(event) => setForm({ ...form, rules: event.target.value })} rows={3} placeholder="后续生成必须遵守的硬规则。" />
            <FieldAssist
              project={project}
              mutate={mutate}
              working={working}
              section="设定库"
              fieldLabel="禁忌/不可违背"
              value={form.rules}
              guidance="输出可执行的硬规则，避免含糊。"
              onApply={(rules) => setForm((current) => ({ ...current, rules }))}
            />
          </label>
          <button className="primary-button" disabled={Boolean(working)} type="submit">
            <Plus size={17} />
            加入设定库
          </button>
        </form>
      </div>

      <div className="asset-list">
        <div className="list-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索角色、道具、地点或规则" />
        </div>
        {settingTypes.map((type) => {
          const Icon = type.icon;
          const items = sortSettings(project.settings).filter((item) => {
            if (item.type !== type.id) return false;
            if (item.id === activeEditId) return true;
            if (!normalizedQuery) return true;
            return [item.name, item.summary, item.traits, item.rules].some((value) =>
              String(value || "").toLowerCase().includes(normalizedQuery)
            );
          });
          const isCollapsed = Boolean(collapsedSections[type.id]) && !normalizedQuery;

          return (
            <div className="panel" key={type.id}>
              <div className="panel-title compact">
                <h2><Icon size={18} />{type.label}</h2>
                <div className="panel-title-actions">
                  <span>{items.length}</span>
                  <button
                    className="section-toggle"
                    type="button"
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "展开" : "收起"}${type.label}`}
                    onClick={() => toggleSection(type.id)}
                  >
                    <ChevronRight size={16} />
                    {isCollapsed ? "展开" : "收起"}
                  </button>
                </div>
              </div>
              {isCollapsed && items.length ? (
                <div className="collapsed-hint">已折叠，点击展开查看该分类下的设定。</div>
              ) : items.length ? (
                <div className="cards setting-card-grid">
                  {items.map((item) => {
                    const isEditing = activeEditId === item.id;
                    const isExpanded = isEditing || expandedId === item.id;
                    const editDraft = editDrafts[item.id] || buildSettingDraft(item);

                    return (
                      <article className={`asset-card setting-card ${isExpanded ? "expanded" : ""} ${isEditing ? "editing" : ""}`} key={item.id}>
                        <button
                          className="setting-card-toggle"
                          type="button"
                          aria-expanded={isExpanded}
                          onClick={() => toggleSettingCard(item)}
                        >
                          <div className="setting-card-heading">
                            <span className="setting-code-badge">{formatSettingCode(item)}</span>
                            <h3>{item.name}</h3>
                          </div>
                          <div className="setting-card-meta">
                            <small>
                              {isExpanded
                                ? "\u6536\u8d77\u8be6\u60c5"
                                : item.rules
                                  ? "\u542b\u89c4\u5219\u7ea6\u675f"
                                  : "\u70b9\u51fb\u5c55\u5f00\u8be6\u60c5"}
                            </small>
                            <ChevronRight size={16} />
                          </div>
                        </button>
                        {isEditing ? (
                          <form
                            className="editor-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveEdit(item).catch(() => {});
                            }}
                          >
                            <label>
                              类型
                              <select value={editDraft.type} onChange={(event) => updateEditDraft(item, { type: event.target.value })}>
                                {settingTypes.map((settingType) => (
                                  <option key={settingType.id} value={settingType.id}>
                                    {settingType.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              名称
                              <input value={editDraft.name} onChange={(event) => updateEditDraft(item, { name: event.target.value })} />
                            </label>
                            <label>
                              核心设定
                              <textarea value={editDraft.summary} onChange={(event) => updateEditDraft(item, { summary: event.target.value })} rows={5} />
                            </label>
                            <label>
                              特征标签
                              <TagInput
                                value={editDraft.traits}
                                onChange={(traits) => updateEditDraft(item, { traits })}
                                placeholder="输入后回车添加标签"
                              />
                            </label>
                            <label>
                              禁忌 / 不可违背
                              <textarea value={editDraft.rules} onChange={(event) => updateEditDraft(item, { rules: event.target.value })} rows={3} />
                            </label>
                            <div className="card-actions">
                              <button className="primary-button" type="submit" disabled={Boolean(working)}>
                                <Save size={16} />
                                保存修改
                              </button>
                              <button
                                className="danger-button"
                                type="button"
                                disabled={Boolean(working)}
                                onClick={() => deleteSetting(item)}
                              >
                                <Trash2 size={16} />
                                删除设定
                              </button>
                              <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => resetEditDraft(item)}>
                                重置草稿
                              </button>
                              <button className="secondary-button" type="button" onClick={collapseEdit}>
                                收起编辑
                              </button>
                            </div>
                          </form>
                        ) : (
                          isExpanded && (
                            <div className="setting-card-body">
                              <p>{item.summary}</p>
                              <TagList value={item.traits} />
                              {item.rules && <small>{item.rules}</small>}
                              <div className="card-actions">
                                <button className="secondary-button" type="button" onClick={() => startEdit(item)}>
                                  <Edit3 size={16} />
                                  编辑设定
                                </button>
                                <button className="danger-button" type="button" disabled={Boolean(working)} onClick={() => deleteSetting(item)}>
                                  <Trash2 size={16} />
                                  删除设定
                                </button>
                              </div>
                            </div>
                          )
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState text="暂无条目。" />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

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
  onOpenSettingExtractor
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
  }, [selectedDraft?.content.length]);

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
              <h2>章节全文编辑器</h2>
            </div>
            <div className="toolbar-wrap">
              <SaveIndicator draft={selectedDraft} />
              {onOpenSettingExtractor && (
                <button className="secondary-button" disabled={Boolean(working)} onClick={onOpenSettingExtractor}>
                  <Library size={16} />
                  提取设定
                </button>
              )}
              <DownloadFormatSelect
                value={chapterDownloadFormat}
                onChange={setChapterDownloadFormat}
              />
              <button className="secondary-button" disabled={Boolean(working)} onClick={() => downloadChapter()}>
                <Download size={16} />
                下载当前章节
              </button>
              <button className="secondary-button" disabled={Boolean(working)} onClick={() => saveDraft(selectedChapter.id, { silent: false })}>
                <Save size={16} />
                立即保存草稿
              </button>
              <button className="primary-button" disabled={Boolean(working)} onClick={() => saveChapter(selectedChapter.id)}>
                <Save size={16} />
                手动保存正式稿
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(working)}
                onClick={() => mutate(`/api/projects/${project.id}/chapters/${selectedChapter.id}/check`, {}, "检查章节")}
              >
                <CheckCircle2 size={16} />
                检查
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(working) || !selectedLength}
                onClick={sendSelectionToRewrite}
              >
                <Wand2 size={16} />
                局部润色/修改
              </button>
            </div>
          </div>

          <div className="editor-meta-grid">
            <label>
              章节标题
              <input
                value={selectedDraft.title}
                onChange={(event) => updateDraft(selectedChapter.id, { title: event.target.value })}
                placeholder={`第 ${selectedChapter.number} 章标题`}
              />
            </label>
            <label>
              章节语气
              <ToneComposer
                value={selectedDraft.tone}
                onChange={(tone) => updateDraft(selectedChapter.id, { tone })}
                placeholder="例如：冷感压迫、轻快群像"
              />
            </label>
          </div>

          <div className="chapter-outline">
            {selectedChapter.beats.map((beat) => (
              <span key={beat}>{beat}</span>
            ))}
          </div>

          <label>
            正文全文
            <textarea
              ref={editorRef}
              className="chapter-editor-textarea"
              value={selectedDraft.content}
              onChange={(event) => updateDraft(selectedChapter.id, { content: event.target.value })}
              onFocus={syncSelectionRange}
              onKeyUp={syncSelectionRange}
              onMouseUp={syncSelectionRange}
              onSelect={syncSelectionRange}
              placeholder="在这里直接编辑本章全文，自动保存会记录为草稿，手动保存会写入正式正文。"
            />
          </label>

          <div className="editor-footer">
            <span>正式稿最后更新：{formatTime(selectedChapter.updatedAt || selectedChapter.createdAt)}</span>
            <span>当前草稿字数：{selectedDraft.content.trim().length}</span>
            <span>{selectedLength ? `当前已选中 ${selectedLength} 字，可直接送去局部润色或修改` : "先在正文里选中一段，再点“局部润色/修改”"}</span>
          </div>
        </>
      ) : (
        <EmptyState text="选择一章开始编辑。" />
      )}
    </div>
  );
}

function ChapterVersionPanel({ selectedChapter, restoreVersion }) {
  return (
    <aside className="panel version-panel">
      <div className="panel-title compact">
        <h2>版本记录</h2>
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
                载入编辑器
              </button>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text="还没有章节版本。" />
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
        从这里切换要编辑的章节。左侧目录会保持当前项目下的章节顺序，方便连续修稿。
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
              <small>{chapter.beats?.length || 0} 个情节点</small>
            </button>
          ))
        ) : (
          <div className="chapter-directory-empty">
            <EmptyState text="当前项目还没有章节，先创建一个空白章节再开始编辑。" />
          </div>
        )}
      </div>
    </aside>
  );
}

function ManualChapterDraftEditor({ project, mutate, working, onCreatedChapter, standalone = false }) {
  const manualDraftKey = useMemo(() => makeWebDraftKey(project.id, "manual-chapter-draft"), [project.id]);
  const [draft, setDraft, resetDraft] = useWebDraftState(manualDraftKey, buildManualChapterDraft(project));
  const nextChapterNumber = getNextChapterNumber(project);

  async function createManualChapter() {
    const data = await mutate(`/api/projects/${project.id}/chapters/manual`, draft, "创建空白章节");
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
          <h2>{standalone ? "空白章节编辑" : "空白章节编辑器"}</h2>
        </div>
        <div className="toolbar-wrap">
          <span className="draft-hint">本地草稿实时保存</span>
          <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => resetDraft(buildManualChapterDraft(project))}>
            清空草稿
          </button>
          <button className="primary-button" type="button" disabled={Boolean(working)} onClick={createManualChapter}>
            <Save size={16} />
            保存为第 {nextChapterNumber} 章
          </button>
        </div>
      </div>

      <div className="editor-meta-grid">
        <label>
          章节标题
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder={`例如：古灯初燃（不填则保存为第 ${nextChapterNumber} 章）`}
          />
        </label>
        <label>
          章节语气
          <ToneComposer
            value={draft.tone}
            onChange={(tone) => setDraft((current) => ({ ...current, tone }))}
            placeholder="例如：冷感压迫、轻快群像"
          />
        </label>
      </div>

      <label>
        正文全文
        <textarea
          className="chapter-editor-textarea"
          value={draft.content}
          onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
          placeholder="这里可以直接手写空白章节，不需要先 AI 生成。保存后会创建正式章节并进入普通章节工作流。"
        />
      </label>
      <div className="editor-footer">
        <span>系统会自动保存为第 {nextChapterNumber} 章，标题里不需要再写章号</span>
        <span>当前草稿字数：{draft.content.trim().length}</span>
      </div>
    </div>
  );
}

function ChapterEditorPage({
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
  isNewMode = false
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
      "下载当前章节"
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
          <p className="eyebrow">章节编辑</p>
          <h2>
            {isNewMode
              ? "空白章节编辑"
              : selectedChapter
                ? `第 ${selectedChapter.number} 章 · 章节编辑`
                : "章节编辑"}
          </h2>
          <p className="chapter-page-note">
            {isNewMode
              ? "这里不依赖 AI 生成，可以直接手写新章节并保存入库。"
              : "这里是章节编辑子页面，专门用于单章全文编辑和版本管理。"}
          </p>
        </div>
        <div className="chapter-page-toolbar">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回章节生成
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
            onOpenSettingExtractor={() =>
              selectedChapter && onOpenSettingExtractor?.(selectedChapter.id)
            }
          />
        )}
        {isNewMode ? (
          <div className="panel version-panel">
            <EmptyState text="保存为正式章节后，这里会显示版本记录。" />
          </div>
        ) : (
          <ChapterVersionPanel selectedChapter={selectedChapter} restoreVersion={restoreVersion} />
        )}
      </div>
    </section>
  );
}

function ChapterGenerationPage({
  project,
  working,
  workspace,
  openChapterEditorPage,
  openBlankChapterEditorPage
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
          <p className="eyebrow">章节生成</p>
          <h2>章节生成</h2>
          <p className="chapter-page-note">
            章节生成工作台已经迁到「创作台」里的单章驾驶舱。这里保留章节概览和跳转入口，方便你直接切到编辑页。
          </p>
        </div>
        <div className="chapter-page-toolbar">
          <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={openCurrentChapterEditor}>
            <Edit3 size={16} />
            打开章节编辑
          </button>
          <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => openBlankChapterEditorPage(project.id)}>
            <Plus size={16} />
            新建空白章节
          </button>
        </div>
      </div>

      <div className="chapter-page-grid chapter-generation-overview-grid">
        <div className="panel chapter-generation-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">章节概览</p>
              <h2>最近章节与目录</h2>
            </div>
            <FileText size={20} />
          </div>
          {project.chapters.length ? (
            <div className="chapter-generation-summary">
              <div className="editor-footer">
                <span>章节总数：{project.chapters.length}</span>
                <span>最近更新：{formatTime(project.chapters[0]?.updatedAt || project.chapters[0]?.createdAt)}</span>
              </div>
              <PlotMap project={project} />
            </div>
          ) : (
            <EmptyState text="当前项目还没有章节。先创建空白章节，再到章节编辑页继续补全正文。" />
          )}
        </div>

        <div className="panel chapter-generation-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">快捷入口</p>
              <h2>进入章节编辑</h2>
            </div>
            <Edit3 size={20} />
          </div>
          <p className="chapter-page-note">
            需要连续修稿、切章编辑或查看版本时，直接进入章节编辑页。那里有左侧目录、中间正文和右侧版本记录。
          </p>
          <div className="standalone-entry-actions">
            <button className="primary-button" type="button" disabled={Boolean(working)} onClick={openCurrentChapterEditor}>
              <FileText size={16} />
              打开当前章节
            </button>
            <button className="secondary-button" type="button" disabled={Boolean(working)} onClick={() => openBlankChapterEditorPage(project.id)}>
              <Plus size={16} />
              直接新建空白章节
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SettingSelector({ project, value, onChange }) {
  const normalizedValue = normalizeSettingSelection(value, project);
  const selectedIds = new Set(normalizedValue);
  const orderedSettings = sortSettings(project?.settings || []);
  const groups = settingTypes
    .map((type) => ({
      ...type,
      items: orderedSettings.filter((item) => item.type === type.id)
    }))
    .filter((group) => group.items.length);
  const hasSelection = normalizedValue.length > 0;

  function toggleSetting(settingId) {
    if (selectedIds.has(settingId)) {
      onChange(normalizedValue.filter((item) => item !== settingId));
      return;
    }
    onChange([...normalizedValue, settingId]);
  }

  return (
    <div className="setting-selector">
      <div className="setting-selector-header">
        <strong>本章带入设定</strong>
        <div className="setting-selector-actions">
          <span>{hasSelection ? `已选 ${normalizedValue.length} 条` : `默认全部 ${orderedSettings.length} 条`}</span>
          <button type="button" onClick={() => onChange(orderedSettings.map((item) => item.id))}>
            全选
          </button>
          <button type="button" disabled={!hasSelection} onClick={() => onChange([])}>
            恢复默认
          </button>
        </div>
      </div>
      <p className="setting-selector-note">
        不勾选时，系统会把全部设定带入章节生成。开始勾选后，只会使用你选中的条目。
      </p>
      {groups.length ? (
        groups.map((group) => (
          <div className="setting-selector-group" key={group.id}>
            <small>{group.label}</small>
            <div className="setting-selector-pills">
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`setting-chip ${selectedIds.has(item.id) ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleSetting(item.id)}
                >
                  {formatSettingLabel(item)}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="setting-selector-empty">暂无可选设定。</div>
      )}
    </div>
  );
}

function ChapterGenerator({
  project,
  request,
  mutate,
  streamEvents,
  working,
  selectedChapter = null,
  onCreatedChapter,
  onOpenStandalone,
  onOpenBlankStandalone,
  compact = false
}) {
  const chapterGeneratorModeKey = useMemo(
    () => makeWebDraftKey(project.id, "chapter-generator-mode"),
    [project.id]
  );
  const chapterGeneratorKey = useMemo(
    () => makeWebDraftKey(project.id, "chapter-generator-form"),
    [project.id]
  );
  const chapterRegenerateKey = useMemo(
    () => makeWebDraftKey(project.id, `chapter-regenerate-form-${selectedChapter?.id || "default"}`),
    [project.id, selectedChapter?.id]
  );
  const chapterAutoCheckKey = useMemo(() => makeWebDraftKey(project.id, "chapter-generator-auto-check"), [project.id]);
  const [mode, setMode] = useWebDraftState(chapterGeneratorModeKey, "next");
  const [nextForm, setNextForm] = useWebDraftState(chapterGeneratorKey, buildChapterGeneratorDraft(project));
  const [regenerateForm, setRegenerateForm] = useWebDraftState(
    chapterRegenerateKey,
    buildChapterGeneratorDraft(project, selectedChapter)
  );
  const [autoCheck, setAutoCheck] = useWebDraftState(chapterAutoCheckKey, true);
  const nextChapterNumber = getNextChapterNumber(project);
  const isRegenerateMode = mode === "selected" && Boolean(selectedChapter);
  const form = isRegenerateMode ? regenerateForm : nextForm;
  const setForm = isRegenerateMode ? setRegenerateForm : setNextForm;
  const chapterWorkflowKey = useMemo(
    () => makeWebDraftKey(project.id, `chapter-workflow-${isRegenerateMode ? selectedChapter?.id || "selected" : "next"}`),
    [project.id, isRegenerateMode, selectedChapter?.id]
  );
  const [workflowState, setWorkflowState, resetWorkflowState] = useWebDraftState(
    chapterWorkflowKey,
    buildChapterWorkflowState()
  );
  const [runtimeState, setRuntimeState] = useState(buildWorkflowRuntimeState());
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const runtimeAbortRef = useRef(null);
  const workflowPreview = workflowState.preview;
  const workflowLastRun = workflowState.lastRun;
  const workflowEditorMode = workflowState.editorMode || "simple";
  const ignoredFindingKeys = workflowState.ignoredFindingKeys || [];
  const pendingReviewSession = useMemo(() => {
    const sessions = project.generationSessions || [];
    if (!sessions.length) return null;
    const pinned = sessions.find((session) => session.id === workflowState.reviewSessionId);
    if (pinned) return pinned;
    return (
      sessions.find(
        (session) =>
          session.sessionType === (isRegenerateMode ? "regenerate" : "generate") &&
          session.targetMode === (isRegenerateMode ? "selected" : "next") &&
          (isRegenerateMode ? session.chapterId === (selectedChapter?.id || "") : !session.chapterId)
      ) || null
    );
  }, [project.generationSessions, workflowState.reviewSessionId, isRegenerateMode, selectedChapter?.id]);
  const workflowResult = workflowLastRun || pendingReviewSession?.workflow || null;
  const activeReviewWorkflow = workflowResult?.pendingReview ? workflowResult : pendingReviewSession?.workflow || null;
  const reviewSource = workflowState.reviewSource || defaultReviewSource(activeReviewWorkflow);
  const reviewContent = workflowState.reviewDirty
    ? workflowState.reviewContent
    : resolveReviewSourceContent(activeReviewWorkflow, reviewSource);
  const currentWorkflowSignature = useMemo(
    () =>
      buildWorkflowSignature({
        form,
        mode: isRegenerateMode ? "selected" : "next",
        chapterId: selectedChapter?.id || ""
      }),
    [form, isRegenerateMode, selectedChapter?.id]
  );
  const previewStale = Boolean(workflowPreview) && workflowState.signature !== currentWorkflowSignature;
  const workflowRecommendation = buildWorkflowRecommendation({
    runtime: runtimeState,
    preview: workflowPreview,
    workflow: workflowResult,
    reviewSession: pendingReviewSession,
    previewStale,
    reviewDirty: workflowState.reviewDirty,
    isRegenerateMode
  });
  const workflowTraceLogs = useMemo(
    () =>
      buildWorkflowTraceLogs(project, {
        isRegenerateMode,
        selectedChapterId: selectedChapter?.id || ""
      }),
    [project, isRegenerateMode, selectedChapter?.id]
  );

  const templates = [
    {
      label: "升级爆点",
      value: {
        goal: "让主角在明确代价下完成一次能力突破，并拿到下一阶段地图线索。",
        conflict: "对手用规则压制主角，逼他在暴露底牌和失去资格之间选择。",
        hook: "裁判席上，有人念出了主角早该被抹去的旧名。",
        tone: "热血"
      }
    },
    {
      label: "情绪拉扯",
      value: {
        goal: "推进两名核心人物的信任关系，同时埋下误会的反向证据。",
        conflict: "女主发现主角隐瞒关键信息，却又不得不和他共同脱身。",
        hook: "她把那枚信物放回主角掌心，只说了一句：你最好别让我查到真相。",
        tone: "暧昧拉扯"
      }
    },
    {
      label: "悬疑反转",
      value: {
        goal: "揭开一个旧案细节，但让真相指向更危险的幕后人。",
        conflict: "线索互相矛盾，唯一证人说出的版本和设定库记录完全相反。",
        hook: "尸体袖口里，露出一张写着主角名字的请柬。",
        tone: "悬疑感强"
      }
    }
  ];

  useEffect(() => {
    if (mode === "selected" && !selectedChapter) {
      setMode("next");
    }
  }, [mode, selectedChapter, setMode]);

  useEffect(() => {
    setRuntimeState(buildWorkflowRuntimeState());
  }, [chapterWorkflowKey]);

  useEffect(() => () => runtimeAbortRef.current?.abort(), []);

  function resetCurrentForm() {
    setForm(buildChapterGeneratorDraft(project, isRegenerateMode ? selectedChapter : null));
  }

  function startRuntimeRequest() {
    runtimeAbortRef.current?.abort();
    const controller = new AbortController();
    runtimeAbortRef.current = controller;
    return controller;
  }

  function finishRuntimeRequest(controller) {
    if (runtimeAbortRef.current === controller) {
      runtimeAbortRef.current = null;
    }
  }

  function cancelCurrentRun() {
    if (!runtimeAbortRef.current) return;
    runtimeAbortRef.current.abort();
    setPreviewBusy(false);
    setPreviewError("");
    setRuntimeState((current) => cancelWorkflowRuntime(current));
  }

  function buildGeneratorPayload() {
    return {
      title: form.title,
      goal: form.goal,
      conflict: form.conflict,
      hook: form.hook,
      tone: form.tone,
      wordCount: Number(form.wordCount || 1800),
      selectedSettingIds: normalizeSettingSelection(form.selectedSettingIds || [], project),
      constraintPolicy: normalizeConstraintPolicyDraft(form.constraintPolicy),
      chapterId: isRegenerateMode ? selectedChapter?.id || "" : ""
    };
  }

  function handleRuntimeEvent(payload, runSignature = currentWorkflowSignature) {
    setRuntimeState((current) => applyWorkflowRuntimeEvent(current, payload));
    if (payload?.workflowPreview) {
      setWorkflowState((current) => ({
        ...current,
        signature: runSignature,
        preview: payload.workflowPreview || current.preview
      }));
    }
  }

  async function previewWorkflow() {
    setPreviewBusy(true);
    setPreviewError("");
    const controller = startRuntimeRequest();
    try {
      const payload = buildGeneratorPayload();
      const runSignature = currentWorkflowSignature;
      const data = await streamEvents(
        `/api/projects/${project.id}/chapters/workflow-preview/stream`,
        payload,
        "生成约束草案",
        {
          signal: controller.signal,
          onEvent: (runtimeEvent) => handleRuntimeEvent(runtimeEvent, runSignature),
          onDone: (runtimeEvent) => handleRuntimeEvent(runtimeEvent, runSignature)
        }
      );

      setWorkflowState((current) => ({
        ...current,
        signature: runSignature,
        preview: data.workflowPreview || null
      }));
    } catch (error) {
      if (isAbortLikeError(error)) {
        setRuntimeState((current) => cancelWorkflowRuntime(current));
        return null;
      }
      setPreviewError(error.message);
      throw error;
    } finally {
      finishRuntimeRequest(controller);
      setPreviewBusy(false);
    }
  }

  function updateWorkflowContract(field, value, asList = false) {
    setWorkflowState((current) => {
      if (!current.preview) return current;
      return {
        ...current,
        preview: {
          ...current.preview,
          contract: {
            ...current.preview.contract,
            [field]: asList ? normalizeEditorList(value) : value
          }
        }
      };
    });
  }

  function updateWorkflowPlan(field, value, asList = false) {
    setWorkflowState((current) => {
      if (!current.preview) return current;
      return {
        ...current,
        preview: {
          ...current.preview,
          plan: {
            ...current.preview.plan,
            [field]: asList ? normalizeEditorList(value) : value
          }
        }
      };
    });
  }

  function applyGuardSuggestions() {
    setWorkflowState((current) => {
      if (!current.preview?.preflightGuard) return current;
      return {
        ...current,
        preview: {
          ...current.preview,
          contract: mergeWorkflowPatch(
            current.preview.contract || {},
            current.preview.preflightGuard.suggestedContractPatch || {}
          ),
          plan: mergeWorkflowPlanPatch(
            current.preview.plan || {},
            current.preview.preflightGuard.suggestedPlanPatch || {}
          )
        }
      };
    });
  }

  function setWorkflowEditorMode(editorMode) {
    setWorkflowState((current) => ({
      ...current,
      editorMode
    }));
  }

  function applyGuardFinding(finding, index) {
    const findingKey = buildGuardFindingKey(finding, index);
    setWorkflowState((current) => {
      if (!current.preview) return current;
      const { contractPatch, planPatch } = resolveGuardFindingPatch(finding, current.preview);
      return {
        ...current,
        ignoredFindingKeys: (current.ignoredFindingKeys || []).filter((item) => item !== findingKey),
        preview: {
          ...current.preview,
          contract: mergeWorkflowPatch(current.preview.contract || {}, contractPatch),
          plan: mergeWorkflowPlanPatch(current.preview.plan || {}, planPatch)
        }
      };
    });
  }

  function ignoreGuardFinding(finding, index) {
    const findingKey = buildGuardFindingKey(finding, index);
    setWorkflowState((current) => ({
      ...current,
      ignoredFindingKeys: Array.from(new Set([...(current.ignoredFindingKeys || []), findingKey]))
    }));
  }

  function restoreGuardFinding(finding, index) {
    const findingKey = buildGuardFindingKey(finding, index);
    setWorkflowState((current) => ({
      ...current,
      ignoredFindingKeys: (current.ignoredFindingKeys || []).filter((item) => item !== findingKey)
    }));
  }

  function loadReviewSource(source) {
    setWorkflowState((current) => ({
      ...current,
      reviewSource: source,
      reviewContent: resolveReviewSourceContent(activeReviewWorkflow, source),
      reviewDirty: false,
      reviewSessionId: pendingReviewSession?.id || current.reviewSessionId || ""
    }));
  }

  function updateReviewContent(value) {
    setWorkflowState((current) => ({
      ...current,
      reviewContent: value,
      reviewDirty: true,
      reviewSessionId: pendingReviewSession?.id || current.reviewSessionId || ""
    }));
  }

  async function commitReview() {
    if (!pendingReviewSession) return;
    const data = await mutate(
      `/api/projects/${project.id}/generation-sessions/${pendingReviewSession.id}/commit`,
      {
        content: reviewContent
      },
      isRegenerateMode ? "保存重生成章节" : "保存生成章节"
    );

    setWorkflowState((current) => ({
      ...current,
      lastRun: data.generationWorkflow || null,
      preview: null,
      signature: "",
      ignoredFindingKeys: [],
      reviewSessionId: "",
      reviewContent: "",
      reviewDirty: false,
      reviewSource: "repair"
    }));

    if (autoCheck && !data.pendingGenerationSessionId) {
      if (isRegenerateMode && selectedChapter) {
        await mutate(
          `/api/projects/${project.id}/chapters/${selectedChapter.id}/check`,
          {},
          "检查当前章节"
        );
      } else {
        await mutate(`/api/projects/${project.id}/check`, {}, "检查最新章节");
      }
    }

    if (isRegenerateMode && selectedChapter) {
      if (!data.pendingGenerationSessionId) {
        onCreatedChapter?.(selectedChapter.id);
      }
      return;
    }

    const nextProject = findProjectById(data, project.id) || project;
    const createdChapterId =
      data.createdChapterId || nextProject.chapters[nextProject.chapters.length - 1]?.id || "";
    setNextForm((current) => ({ ...current, title: "", goal: "", conflict: "", hook: "" }));
    if (createdChapterId) {
      onCreatedChapter?.(createdChapterId);
    }
  }

  async function discardReview() {
    if (!pendingReviewSession) return;
    await mutate(
      `/api/projects/${project.id}/generation-sessions/${pendingReviewSession.id}/discard`,
      {},
      "丢弃审阅稿"
    );
    setWorkflowState((current) => ({
      ...current,
      lastRun: null,
      reviewSessionId: "",
      reviewContent: "",
      reviewDirty: false,
      ignoredFindingKeys: []
    }));
    setRuntimeState(buildWorkflowRuntimeState());
  }

  async function submit(event) {
    event.preventDefault();
    const payload = buildGeneratorPayload();
    if (workflowPreview && previewStale) {
      await previewWorkflow();
      return;
    }

    const workflowDraft =
      workflowPreview && !previewStale
        ? {
            contract: workflowPreview.contract,
            plan: workflowPreview.plan
          }
        : undefined;
    const controller = startRuntimeRequest();
    try {

    if (isRegenerateMode && selectedChapter) {
      const data = await streamEvents(
        `/api/projects/${project.id}/chapters/${selectedChapter.id}/regenerate/stream`,
        {
          ...payload,
          workflowDraft,
          reviewMode: true
        },
        "重新生成章节",
        {
          signal: controller.signal,
          onEvent: (runtimeEvent) => handleRuntimeEvent(runtimeEvent),
          onDone: (runtimeEvent) => handleRuntimeEvent(runtimeEvent)
        }
      );
      setWorkflowState((current) => ({
        ...current,
        lastRun: data.generationWorkflow || null,
        preview: null,
        signature: "",
        ignoredFindingKeys: [],
        reviewSessionId: data.generationWorkflow?.sessionId || data.pendingGenerationSessionId || "",
        reviewSource: defaultReviewSource(data.generationWorkflow),
        reviewContent: resolveReviewSourceContent(data.generationWorkflow),
        reviewDirty: false
      }));
      if (autoCheck && !data.pendingGenerationSessionId) {
        await mutate(
          `/api/projects/${project.id}/chapters/${selectedChapter.id}/check`,
          {},
          "检查当前章节"
        );
      }
      if (!data.pendingGenerationSessionId) {
        onCreatedChapter?.(selectedChapter.id);
      }
      return;
    }

    const data = await streamEvents(
      `/api/projects/${project.id}/chapters/generate/stream`,
        {
          ...payload,
          workflowDraft,
          reviewMode: true
        },
      "生成章节",
      {
        signal: controller.signal,
        onEvent: (runtimeEvent) => handleRuntimeEvent(runtimeEvent),
        onDone: (runtimeEvent) => handleRuntimeEvent(runtimeEvent)
      }
    );
    setWorkflowState((current) => ({
      ...current,
      lastRun: data.generationWorkflow || null,
      preview: null,
      signature: "",
      ignoredFindingKeys: [],
      reviewSessionId: data.generationWorkflow?.sessionId || data.pendingGenerationSessionId || "",
      reviewSource: defaultReviewSource(data.generationWorkflow),
      reviewContent: resolveReviewSourceContent(data.generationWorkflow),
      reviewDirty: false
    }));
    if (autoCheck && !data.pendingGenerationSessionId) {
      await mutate(`/api/projects/${project.id}/check`, {}, "检查最新章节");
    }
    if (data.pendingGenerationSessionId) {
      return;
    }
    const nextProject = findProjectById(data, project.id) || project;
    const createdChapterId =
      data.createdChapterId || nextProject.chapters[nextProject.chapters.length - 1]?.id || "";

    setNextForm((current) => ({ ...current, title: "", goal: "", conflict: "", hook: "" }));
    if (createdChapterId) {
      onCreatedChapter?.(createdChapterId);
    }
    } catch (error) {
      if (isAbortLikeError(error)) {
        setRuntimeState((current) => cancelWorkflowRuntime(current));
        return;
      }
      throw error;
    } finally {
      finishRuntimeRequest(controller);
    }
  }

  return (
    <form className={`generator-form ${compact ? "compact" : ""}`} onSubmit={submit}>
      <div className="panel-title compact generator-header">
        <div>
          <p className="eyebrow">章节生成</p>
          <h2>章节生成</h2>
        </div>
      </div>
      <div className="list-toolbar segmented">
        <button
          className={isRegenerateMode ? "" : "active"}
          type="button"
          onClick={() => setMode("next")}
        >
          生成下一章
        </button>
        <button
          className={isRegenerateMode ? "active" : ""}
          type="button"
          disabled={!selectedChapter}
          onClick={() => selectedChapter && setMode("selected")}
        >
          {selectedChapter ? `重生成第 ${selectedChapter.number} 章` : "先选章节后重生成"}
        </button>
      </div>
      {isRegenerateMode && selectedChapter && (
        <div className="selection-callout">
          <strong>
            当前将重生成第 {selectedChapter.number} 章 · {selectedChapter.title}
          </strong>
          <span>提交后会覆盖这一章，并先把当前内容自动备份到版本记录。</span>
        </div>
      )}
      <ChapterTaskFlow preview={workflowPreview} workflow={workflowResult} reviewSession={pendingReviewSession} runtime={runtimeState} />
      <WorkflowActionBanner recommendation={workflowRecommendation} />
      <div className="template-row">
        {templates.map((template) => (
          <button key={template.label} type="button" onClick={() => setForm((current) => ({ ...current, ...template.value }))}>
            {template.label}
          </button>
        ))}
      </div>
      <div className="generator-utility-row">
        <button className="secondary-button" type="button" onClick={resetCurrentForm}>
          <RefreshCw size={16} />
          清空本章输入
        </button>
        <span>本章输入和锁定策略会自动保存在浏览器，离开后回来也能继续。</span>
      </div>
      <label>
        章节标题
        <input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          placeholder={
            isRegenerateMode && selectedChapter
              ? `例如：拐骗（将覆盖第 ${selectedChapter.number} 章）`
              : `例如：古灯初燃（系统会自动生成第 ${nextChapterNumber} 章）`
          }
        />
      </label>
      <label>
        本章目标
        <textarea value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} rows={compact ? 3 : 4} placeholder="角色要达成什么、剧情要推进什么。" />
      </label>
      <label>
        核心冲突
        <textarea value={form.conflict} onChange={(event) => setForm({ ...form, conflict: event.target.value })} rows={compact ? 3 : 4} placeholder="阻力、对手、误会、危机或反转。" />
      </label>
      <div className="form-row">
        <label>
          章节语气
          <ToneComposer value={form.tone} onChange={(tone) => setForm({ ...form, tone })} placeholder="例如：热血压迫感、冷感悬疑" />
        </label>
        <label>
          目标字数
          <input type="number" min="800" max="8000" step="100" value={form.wordCount} onChange={(event) => setForm({ ...form, wordCount: Number(event.target.value) })} />
        </label>
      </div>
      <label>
        结尾钩子
        <input
          value={form.hook}
          onChange={(event) => setForm({ ...form, hook: event.target.value })}
          placeholder="可选。不填则允许这一章自然收束。"
        />
      </label>
      <SettingSelector
        project={project}
        value={form.selectedSettingIds || []}
        onChange={(selectedSettingIds) => setForm((current) => ({ ...current, selectedSettingIds }))}
      />
      <ConstraintPolicyComposer
        value={form.constraintPolicy}
        onChange={(constraintPolicy) => setForm((current) => ({ ...current, constraintPolicy }))}
      />
      <div className="workflow-panel">
        <div className="panel-title compact">
          <div>
            <h2>约束工作流</h2>
          </div>
          <div className="panel-title-actions">
            <div className="list-toolbar segmented workflow-mode-toggle">
              <button
                className={workflowEditorMode === "simple" ? "active" : ""}
                type="button"
                onClick={() => setWorkflowEditorMode("simple")}
              >
                简洁模式
              </button>
              <button
                className={workflowEditorMode === "expert" ? "active" : ""}
                type="button"
                onClick={() => setWorkflowEditorMode("expert")}
              >
                专家模式
              </button>
            </div>
            <button className="secondary-button" disabled={Boolean(working) || previewBusy} onClick={() => previewWorkflow().catch(() => {})} type="button">
              <BrainCircuit size={16} />
              {previewBusy ? "生成中..." : "生成约束草案"}
            </button>
            <button className="secondary-button" disabled={!workflowPreview?.preflightGuard} onClick={applyGuardSuggestions} type="button">
              <Sparkles size={16} />
              应用 Guard 建议
            </button>
            <button
              className="secondary-button"
              disabled={!workflowPreview && !workflowResult && !pendingReviewSession}
              onClick={() => {
                if (pendingReviewSession) {
                  discardReview().catch(() => {});
                  return;
                }
                resetWorkflowState(buildChapterWorkflowState());
                setRuntimeState(buildWorkflowRuntimeState());
              }}
              type="button"
            >
              <Trash2 size={16} />
              清空工作流
            </button>
          </div>
        </div>
        {previewStale && (
          <div className="danger-card">
            <p>表单已经变化，当前约束草案已过期。再次点击“生成约束草案”会刷新 contract / planner / guard。</p>
          </div>
        )}
        {previewError && (
          <div className="danger-card">
            <p>{previewError}</p>
          </div>
        )}
        <WorkflowRuntimePanel
          runtime={runtimeState}
          canCancel={runtimeState.active && Boolean(runtimeAbortRef.current)}
          onCancel={cancelCurrentRun}
        />
        <ChapterWorkflowEditor
          preview={workflowPreview}
          lastRun={workflowResult}
          compact={compact}
          editorMode={workflowEditorMode}
          ignoredFindingKeys={ignoredFindingKeys}
          onUpdateContract={updateWorkflowContract}
          onUpdatePlan={updateWorkflowPlan}
          onApplyFinding={applyGuardFinding}
          onIgnoreFinding={ignoreGuardFinding}
          onRestoreFinding={restoreGuardFinding}
        />
      </div>
      {pendingReviewSession && activeReviewWorkflow && (
        <GenerationReviewPanel
          session={pendingReviewSession}
          workflow={activeReviewWorkflow}
          reviewSource={reviewSource}
          reviewContent={reviewContent}
          reviewDirty={workflowState.reviewDirty}
          busy={Boolean(working)}
          onLoadSource={loadReviewSource}
          onChangeContent={updateReviewContent}
          onCommit={() => commitReview().catch(() => {})}
          onDiscard={() => discardReview().catch(() => {})}
        />
      )}
      <WorkflowTracePanel logs={workflowTraceLogs} />
      <div className="editor-footer">
        <span>
          {isRegenerateMode && selectedChapter
            ? `当前会重生成第 ${selectedChapter.number} 章，并覆盖这一章`
            : `当前会生成第 ${nextChapterNumber} 章，章号由系统锁定`}
        </span>
        <span>{isRegenerateMode ? "入库时会自动备份当前章节" : "确认入库后会追加到目录末尾"}</span>
        <span>
          {pendingReviewSession
            ? "当前已有待入库审阅稿，可继续审阅、微调或丢弃。"
            : workflowPreview
              ? "当前会优先使用你手工调整后的 contract / plan。"
              : "可先生成约束草案，再人工干预后生成审阅稿。"}
        </span>
      </div>
      <label className="inline-check">
        <input type="checkbox" checked={autoCheck} onChange={(event) => setAutoCheck(event.target.checked)} />
        {isRegenerateMode ? "入库后自动检查当前章节" : "入库后自动运行一致性检查"}
      </label>
      <button className="primary-button" disabled={Boolean(working) || previewStale} type="submit">
        <Sparkles size={17} />
        {previewStale
          ? "先刷新约束草案"
          : isRegenerateMode
            ? "生成重生成审阅稿"
            : "生成章节审阅稿"}
      </button>
    </form>
  );
}

function ChapterTaskFlow({ preview, workflow, reviewSession, runtime }) {
  const items = runtime?.stages?.length
    ? [
        { label: "目标", state: "done" },
        { label: "约束", state: aggregateRuntimeStepState(runtime, ["contract", "planner"]) },
        { label: "风险", state: aggregateRuntimeStepState(runtime, ["guard_preflight"]) },
        {
          label: "生成",
          state: runtime.mode === "preview" ? "idle" : aggregateRuntimeStepState(runtime, ["writer"])
        },
        {
          label: "修正",
          state: runtime.mode === "preview" ? "idle" : aggregateRuntimeStepState(runtime, ["guard", "repair"])
        },
        {
          label: "入库",
          state: runtime.mode === "preview" ? "idle" : aggregateRuntimeStepState(runtime, ["review_session"])
        }
      ]
    : [
        { label: "目标", state: "done" },
        { label: "约束", state: preview || workflow ? "done" : "active" },
        { label: "风险", state: preview?.preflightGuard || workflow?.preflightGuard ? "done" : "idle" },
        { label: "生成", state: workflow ? "done" : "idle" },
        {
          label: "修正",
          state: workflow?.repair?.applied ? (reviewSession ? "active" : "done") : workflow ? "done" : "idle"
        },
        { label: "入库", state: reviewSession ? "active" : workflow && !workflow.pendingReview ? "done" : "idle" }
      ];

  return (
    <div className="task-flow">
      {items.map((item) => (
        <div key={item.label} className={`task-flow-step ${item.state}`}>
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}

function LegacyWorkflowRuntimePanel({ runtime, canCancel = false, onCancel }) {
  const [tick, setTick] = useState(() => Date.now());
  const progress = getWorkflowRuntimeProgress(runtime);
  const currentStage =
    runtime?.stages?.find((item) => item.key === runtime.currentStageKey) ||
    runtime?.stages?.find((item) => item.status === "running") ||
    runtime?.stages?.[runtime?.stages?.length - 1] ||
    null;

  useEffect(() => {
    if (!runtime?.active) return undefined;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runtime?.active]);

  if (!runtime?.stages?.length) return null;

  const elapsed = formatElapsedDuration(
    runtime.startedAt,
    runtime.active ? new Date(tick).toISOString() : runtime.finishedAt
  );
  const panelTone = runtime.error ? "error" : runtime.cancelled ? "cancelled" : runtime.active ? "active" : "done";

  return (
    <article className={`workflow-runtime-panel ${panelTone}`}>
      <header>
        <div>
          <strong>{runtime.active ? `正在执行 ${currentStage?.label || "Workflow"}` : "最近一轮执行"}</strong>
          <p>{runtime.currentMessage || (runtime.active ? "阶段状态会实时刷新。" : "本轮运行已经结束。")}</p>
        </div>
        <div className="workflow-runtime-stats">
          <span>
            <Gauge size={14} />
            {progress.completed}/{progress.total}
          </span>
          <span>
            <Clock3 size={14} />
            {elapsed}
          </span>
          {canCancel ? (
            <button className="secondary-button workflow-runtime-cancel" type="button" onClick={onCancel}>
              取消本次运行
            </button>
          ) : null}
        </div>
      </header>
      <div className="workflow-runtime-progress">
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="workflow-runtime-stage-list">
        {runtime.stages.map((stage) => (
          <article className={`workflow-runtime-stage ${stage.status || "idle"}`} key={stage.key}>
            <div className="workflow-runtime-stage-head">
              <strong>{stage.label}</strong>
              <small>{formatRuntimeStatus(stage.status)}</small>
            </div>
            <p>{stage.message || "等待执行。"}</p>
          </article>
        ))}
      </div>
      {runtime.writerStream ? (
        <div className="workflow-runtime-writer">
          <div className="workflow-runtime-stage-head">
            <strong>Writer 实时输出</strong>
            <small>{runtime.writerUnits} 字</small>
          </div>
          <p>{summarizeInlineText(runtime.writerStream, 220)}</p>
        </div>
      ) : null}
      {runtime.error ? <p className="workflow-runtime-error">{runtime.error}</p> : null}
    </article>
  );
}

function WorkflowRuntimePanel({ runtime, canCancel = false, onCancel }) {
  const [tick, setTick] = useState(() => Date.now());
  const progress = getWorkflowRuntimeProgress(runtime);
  const currentStage =
    runtime?.stages?.find((item) => item.key === runtime.currentStageKey) ||
    runtime?.stages?.find((item) => item.status === "running") ||
    runtime?.stages?.[runtime?.stages?.length - 1] ||
    null;

  useEffect(() => {
    if (!runtime?.active) return undefined;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runtime?.active]);

  if (!runtime?.stages?.length) return null;

  const elapsed = formatElapsedDuration(
    runtime.startedAt,
    runtime.active ? new Date(tick).toISOString() : runtime.finishedAt
  );
  const panelTone = runtime.error ? "error" : runtime.cancelled ? "cancelled" : runtime.active ? "active" : "done";
  const headerTitle = runtime.active
    ? `正在执行 ${currentStage?.label || "Workflow"}`
    : runtime.cancelled
      ? "本次运行已取消"
      : "最近一轮执行";
  const headerDetail = runtime.currentMessage || (runtime.active ? "阶段状态会实时刷新。" : "本轮运行已经结束。");

  return (
    <article className={`workflow-runtime-panel ${panelTone}`}>
      <header>
        <div>
          <strong>{headerTitle}</strong>
          <p>{headerDetail}</p>
        </div>
        <div className="workflow-runtime-stats">
          <span>
            <Gauge size={14} />
            {progress.completed}/{progress.total}
          </span>
          <span>
            <Clock3 size={14} />
            {elapsed}
          </span>
          {canCancel ? (
            <button className="secondary-button workflow-runtime-cancel" type="button" onClick={onCancel}>
              取消本次运行
            </button>
          ) : null}
        </div>
      </header>
      <div className="workflow-runtime-progress">
        <span style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="workflow-runtime-stage-list">
        {runtime.stages.map((stage) => (
          <article className={`workflow-runtime-stage ${stage.status || "idle"}`} key={stage.key}>
            <div className="workflow-runtime-stage-head">
              <strong>{stage.label}</strong>
              <small>{formatRuntimeStatus(stage.status)}</small>
            </div>
            <p>{buildRuntimeStageSummary(stage)}</p>
          </article>
        ))}
      </div>
      {runtime.writerStream ? (
        <div className="workflow-runtime-writer">
          <div className="workflow-runtime-stage-head">
            <strong>Writer 实时输出</strong>
            <small>{runtime.writerUnits} 字</small>
          </div>
          <p>{summarizeInlineText(runtime.writerStream, 220)}</p>
        </div>
      ) : null}
      {runtime.error ? <p className="workflow-runtime-error">{runtime.error}</p> : null}
    </article>
  );
}

function WorkflowSummaryBlock({ title, items, empty = "暂无" }) {
  const normalized = normalizeEditorList(items || []);
  return (
    <div className="workflow-summary-block">
      <small>{title}</small>
      {normalized.length ? (
        <div className="workflow-pill-list">
          {normalized.map((item, index) => (
            <span className="workflow-pill" key={`${title}-${index}-${item}`}>
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="workflow-empty">{empty}</p>
      )}
    </div>
  );
}

function WorkflowActionBanner({ recommendation }) {
  if (!recommendation) return null;

  const iconMap = {
    idle: BrainCircuit,
    ready: CheckCircle2,
    warn: AlertTriangle,
    review: Edit3,
    done: Sparkles
  };
  const Icon = iconMap[recommendation.tone] || BrainCircuit;

  return (
    <div className={`workflow-action-banner ${recommendation.tone || "idle"}`}>
      <div className="workflow-action-icon">
        <Icon size={18} />
      </div>
      <div className="workflow-action-copy">
        <strong>{recommendation.title}</strong>
        <p>{recommendation.detail}</p>
      </div>
    </div>
  );
}

function ConstraintPolicyComposer({ value, onChange }) {
  const normalized = normalizeConstraintPolicyDraft(value);
  const enabledLabels = buildConstraintPolicyLabels(normalized);

  function togglePolicy(policyId) {
    onChange({
      ...normalized,
      [policyId]: !normalized[policyId]
    });
  }

  return (
    <section className="constraint-policy-panel">
      <div className="constraint-policy-header">
        <div>
          <h3>约束锁定策略</h3>
          <p>这些开关会决定 contract / planner / guard 强制检查哪些层面。</p>
        </div>
        <div className="constraint-policy-meta">
          <span>{enabledLabels.length} / {constraintPolicyOptions.length} 项启用</span>
          {enabledLabels.length ? (
            <div className="workflow-pill-list">
              {enabledLabels.map((label) => (
                <span className="workflow-pill" key={label}>
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span>当前没有额外锁定策略。</span>
          )}
        </div>
      </div>
      <div className="constraint-policy-grid">
        {constraintPolicyOptions.map((option) => {
          const active = normalized[option.id];
          return (
            <button
              className={`constraint-policy-card ${active ? "active" : ""}`}
              key={option.id}
              type="button"
              onClick={() => togglePolicy(option.id)}
            >
              <div className="constraint-policy-card-head">
                <strong>{option.label}</strong>
                <span className={`constraint-policy-state ${active ? "active" : "inactive"}`}>
                  {active ? "已锁定" : "未锁定"}
                </span>
              </div>
              <p>{option.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WorkflowTracePanel({ logs = [] }) {
  return (
    <article className="panel workflow-trace-panel">
      <div className="panel-title compact">
        <div>
          <h2>阶段轨迹</h2>
          <span>最近 8 条生成链路记录，便于回看 Planner / Guard / Repair 的执行状态。</span>
        </div>
      </div>
      {logs.length ? (
        <div className="workflow-trace-list">
          {logs.map((log) => (
            <article className={`workflow-trace-item ${log.status || "success"}`} key={log.id}>
              <div className="workflow-trace-head">
                <strong>{workflowStageLabels[log.stage] || log.stage || "未知阶段"}</strong>
                <small>{formatTime(log.createdAt)}</small>
              </div>
              <div className="workflow-meta">
                <span>状态：{log.status === "error" ? "失败" : "完成"}</span>
                <span>链路：{log.workflow || "workflow"}</span>
                {log.chapterId ? <span>章节：{log.chapterId}</span> : null}
              </div>
              <p>{describeWorkflowTrace(log)}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="workflow-empty">当前还没有生成链路记录。跑一次约束草案或章节生成后，这里会显示阶段轨迹。</p>
      )}
    </article>
  );
}

function ConstraintLayersPanel({ layers }) {
  const layerDefinitions = [
    {
      key: "chapterIdentity",
      title: "章节身份层",
      description: "锁章号、标题和本章身份，防止写串章或标题漂移。",
      empty: "当前没有额外章节身份锁。"
    },
    {
      key: "characterMotivations",
      title: "人物动机层",
      description: "明确本章必须保持的角色诉求与行为方向。",
      empty: "当前未锁定人物动机。"
    },
    {
      key: "worldRules",
      title: "世界规则层",
      description: "把能力限制、世界禁忌和硬规则压进本章。",
      empty: "当前未额外锁定世界规则。"
    },
    {
      key: "continuityAnchors",
      title: "连续性层",
      description: "强制承接最近章节的事实、情绪与关系变化。",
      empty: "当前没有最近章节连续性锚点。"
    },
    {
      key: "foreshadowAnchors",
      title: "伏笔层",
      description: "提醒 Writer / Guard 衔接未回收伏笔，减少漏接。",
      empty: "当前没有待照应伏笔。"
    },
    {
      key: "hardBans",
      title: "硬禁止层",
      description: "集中列出本章绝不能发生的越界、漂移和冲突。",
      empty: "当前没有额外硬禁止项。"
    }
  ];
  const policyLabels = buildConstraintPolicyLabels(layers?.policy);

  return (
    <article className="workflow-stage-card constraint-layers-card">
      <header>
        <span>Constraint Layers</span>
        <strong>{policyLabels.length ? `${policyLabels.length} 项策略开启` : "默认策略"}</strong>
      </header>
      <div className="constraint-policy-meta">
        {policyLabels.length ? (
          <div className="workflow-pill-list">
            {policyLabels.map((label) => (
              <span className="workflow-pill" key={label}>
                {label}
              </span>
            ))}
          </div>
        ) : (
          <span>当前未读到额外策略开关，按默认约束处理。</span>
        )}
      </div>
      <div className="constraint-layers-list">
        {layerDefinitions.map((definition) => {
          const items = normalizeEditorList(layers?.[definition.key] || []);
          return (
            <section className={`constraint-layer-block ${items.length ? "active" : "idle"}`} key={definition.key}>
              <div className="constraint-layer-head">
                <strong>{definition.title}</strong>
                <small>{items.length ? `${items.length} 条` : "未锁定"}</small>
              </div>
              <p>{definition.description}</p>
              {items.length ? (
                <div className="constraint-layer-items">
                  {items.map((item, index) => (
                    <span className="workflow-pill" key={`${definition.key}-${index}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="workflow-empty">{definition.empty}</p>
              )}
            </section>
          );
        })}
      </div>
    </article>
  );
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

function GenerationReviewPanel({
  session,
  workflow,
  reviewSource,
  reviewContent,
  reviewDirty,
  busy,
  onLoadSource,
  onChangeContent,
  onCommit,
  onDiscard
}) {
  const commitLabel = session?.sessionType === "regenerate" ? "确认覆盖当前章节" : "确认存入新章节";
  const writerContent = workflow?.repair?.originalContent || "";
  const repairContent =
    workflow?.repair?.repairedContent || workflow?.repair?.reviewContent || workflow?.repair?.originalContent || "";
  const loadedSourceContent = resolveReviewSourceContent(workflow, reviewSource);
  const writerLength = countTextUnits(writerContent);
  const repairLength = countTextUnits(repairContent);

  return (
    <article className="panel generation-review-panel">
      <div className="panel-title compact">
        <div>
          <h2>审阅后入库</h2>
          <span>
            第 {workflow?.chapterNumber || "--"} 章 · {session?.sessionType === "regenerate" ? "重生成覆写" : "新章入库"}
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
      {workflow?.repair?.repairPlan?.length ? (
        <WorkflowSummaryBlock title="Repair 动作" items={workflow.repair.repairPlan} empty="本次无需额外修订动作。" />
      ) : null}
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

function ChapterWorkflowEditor({
  preview,
  lastRun,
  compact,
  editorMode,
  ignoredFindingKeys,
  onUpdateContract,
  onUpdatePlan,
  onApplyFinding,
  onIgnoreFinding,
  onRestoreFinding
}) {
  const previewData =
    preview ||
    (lastRun
      ? {
          chapterNumber: lastRun.chapterNumber,
          contract: lastRun.contract,
          plan: lastRun.plan,
          preflightGuard: lastRun.preflightGuard
        }
      : null);
  const preflightFindings = previewData?.preflightGuard?.findings || [];
  const visiblePreflightFindings = preflightFindings.filter(
    (finding, index) => !ignoredFindingKeys.includes(buildGuardFindingKey(finding, index))
  );
  const postFindings = lastRun?.postGuard?.findings || [];
  const expertMode = editorMode === "expert" && Boolean(preview);
  const constraintLayers = deriveConstraintLayersFromContract(previewData?.contract || null);

  return (
    <div className={`workflow-grid ${compact ? "compact" : ""}`}>
      {previewData ? (
        <>
          <article className="workflow-stage-card">
            <header>
              <span>Contract</span>
              <strong>第 {previewData.chapterNumber} 章</strong>
            </header>
            {expertMode ? (
              <>
                <label>
                  本章任务
                  <textarea rows={2} value={previewData.contract?.coreMission || ""} onChange={(event) => onUpdateContract("coreMission", event.target.value)} />
                </label>
                <label>
                  冲突锚点
                  <textarea rows={2} value={previewData.contract?.conflictAnchor || ""} onChange={(event) => onUpdateContract("conflictAnchor", event.target.value)} />
                </label>
                <label>
                  收束要求
                  <textarea rows={2} value={previewData.contract?.endingRequirement || ""} onChange={(event) => onUpdateContract("endingRequirement", event.target.value)} />
                </label>
                <label>
                  必须调用设定
                  <textarea rows={4} value={joinEditorList(previewData.contract?.mustUseSettings || [])} onChange={(event) => onUpdateContract("mustUseSettings", event.target.value, true)} />
                </label>
                <label>
                  必须照应
                  <textarea rows={4} value={joinEditorList(previewData.contract?.mustMention || [])} onChange={(event) => onUpdateContract("mustMention", event.target.value, true)} />
                </label>
                <label>
                  连续性约束
                  <textarea rows={5} value={joinEditorList(previewData.contract?.continuity || [])} onChange={(event) => onUpdateContract("continuity", event.target.value, true)} />
                </label>
                <label>
                  禁止漂移
                  <textarea rows={5} value={joinEditorList(previewData.contract?.forbidden || [])} onChange={(event) => onUpdateContract("forbidden", event.target.value, true)} />
                </label>
              </>
            ) : (
              <>
                <p className="workflow-summary-lead">{previewData.contract?.coreMission || "本章任务待明确。"}</p>
                <div className="workflow-summary-grid">
                  <div>
                    <small>冲突锚点</small>
                    <p>{previewData.contract?.conflictAnchor || "未指定"}</p>
                  </div>
                  <div>
                    <small>收束要求</small>
                    <p>{previewData.contract?.endingRequirement || "允许自然收束"}</p>
                  </div>
                </div>
                <WorkflowSummaryBlock title="必须调用设定" items={previewData.contract?.mustUseSettings || []} empty="未额外锁定，默认使用已选设定。" />
                <WorkflowSummaryBlock title="必须照应" items={previewData.contract?.mustMention || []} empty="暂无额外照应项。" />
                <WorkflowSummaryBlock title="连续性约束" items={previewData.contract?.continuity || []} empty="当前没有额外连续性提醒。" />
                <WorkflowSummaryBlock title="禁止漂移" items={previewData.contract?.forbidden || []} empty="当前没有额外禁止项。" />
              </>
            )}
          </article>

          <article className="workflow-stage-card">
            <header>
              <span>Planner</span>
              <strong>{previewData.plan?.narrativeMode || "混合"}</strong>
            </header>
            {expertMode ? (
              <>
                <label>
                  本章概述
                  <textarea rows={3} value={previewData.plan?.summary || ""} onChange={(event) => onUpdatePlan("summary", event.target.value)} />
                </label>
                <label>
                  叙事模式
                  <input value={previewData.plan?.narrativeMode || ""} onChange={(event) => onUpdatePlan("narrativeMode", event.target.value)} />
                </label>
                <label>
                  结尾模式
                  <input value={previewData.plan?.endingMode || ""} onChange={(event) => onUpdatePlan("endingMode", event.target.value)} />
                </label>
                <label>
                  执行节拍
                  <textarea rows={6} value={joinEditorList(previewData.plan?.beats || [])} onChange={(event) => onUpdatePlan("beats", event.target.value, true)} />
                </label>
                <label>
                  必须保留
                  <textarea rows={4} value={joinEditorList(previewData.plan?.mustKeep || [])} onChange={(event) => onUpdatePlan("mustKeep", event.target.value, true)} />
                </label>
                <label>
                  结尾说明
                  <textarea rows={3} value={previewData.plan?.endingNote || ""} onChange={(event) => onUpdatePlan("endingNote", event.target.value)} />
                </label>
              </>
            ) : (
              <>
                <p className="workflow-summary-lead">{buildPlannerSummaryLine(previewData.plan)}</p>
                <div className="workflow-summary-grid">
                  <div>
                    <small>叙事模式</small>
                    <p>{previewData.plan?.narrativeMode || "混合"}</p>
                  </div>
                  <div>
                    <small>结尾模式</small>
                    <p>{previewData.plan?.endingMode || "natural"}</p>
                  </div>
                </div>
                <WorkflowSummaryBlock title="执行节拍" items={previewData.plan?.beats || []} empty="当前还没有拆出具体节拍。" />
                <WorkflowSummaryBlock title="必须保留" items={previewData.plan?.mustKeep || []} empty="没有额外必须保留项。" />
              </>
            )}
          </article>

          <article className="workflow-stage-card guard-card">
            <header>
              <span>Preflight Guard</span>
              <strong>{previewData.preflightGuard?.score ?? "--"}</strong>
            </header>
            <p className="workflow-summary-lead">{buildGuardSummaryLine(previewData.preflightGuard, "Preflight")}</p>
            <div className="workflow-meta">
              <span>状态：{previewData.preflightGuard?.status || "pass"}</span>
              <span>问题：{preflightFindings.length}</span>
              <span>忽略：{preflightFindings.length - visiblePreflightFindings.length}</span>
            </div>
            {visiblePreflightFindings.length ? (
              <div className="workflow-findings">
                {preflightFindings.map((finding, index) => {
                  const findingKey = buildGuardFindingKey(finding, index);
                  const ignored = ignoredFindingKeys.includes(findingKey);
                  const canApply = finding.target === "contract" || finding.target === "plan";

                  return (
                    <article className={`workflow-finding ${finding.severity} ${ignored ? "ignored" : ""}`} key={findingKey}>
                      <strong>{finding.title}</strong>
                      <small>{finding.type} / {finding.target}</small>
                      <p>{finding.detail}</p>
                      <p>建议：{finding.suggestion}</p>
                      <div className="finding-actions">
                        {canApply && !ignored && (
                          <button className="secondary-button" type="button" onClick={() => onApplyFinding(finding, index)}>
                            应用建议
                          </button>
                        )}
                        {ignored ? (
                          <button className="secondary-button" type="button" onClick={() => onRestoreFinding(finding, index)}>
                            恢复本章检查
                          </button>
                        ) : (
                          <button className="secondary-button" type="button" onClick={() => onIgnoreFinding(finding, index)}>
                            忽略本章
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="workflow-empty">预写作 guard 没有发现明显问题，可以直接进入 writer。</p>
            )}
          </article>
          <ConstraintLayersPanel layers={constraintLayers} />
        </>
      ) : (
        <div className="collapsed-hint">
          先点击“生成约束草案”，系统会把 <code>contract -&gt; planner -&gt; preflight guard</code> 可视化出来，你可以先改约束，再正式生成正文。
        </div>
      )}

      {lastRun && (
        <article className="workflow-stage-card workflow-stage-wide">
          <header>
            <span>Writer / Post Guard / Repair</span>
            <strong>
              {lastRun.pendingReview ? "待入库审阅" : lastRun.repair?.applied ? "已修正" : "直接通过"}
            </strong>
          </header>
          <p className="workflow-summary-lead">{buildWorkflowOutcomeSummaryLine(lastRun)}</p>
          <div className="workflow-meta">
            <span>Post Guard：{lastRun.postGuard?.status || "pass"}</span>
            <span>评分：{lastRun.postGuard?.score ?? "--"}</span>
            <span>Repair：{lastRun.repair?.applied ? "已生成最小修订稿" : "未触发"}</span>
          </div>
          {lastRun.repair?.repairPlan?.length ? (
            <WorkflowSummaryBlock title="最小修订动作" items={lastRun.repair.repairPlan} empty="正文已直接通过，无需修订动作。" />
          ) : null}
          {postFindings.length ? (
            <div className="workflow-findings">
              {postFindings.map((finding, index) => (
                <article className={`workflow-finding ${finding.severity}`} key={`${finding.title}-${index}`}>
                  <strong>{finding.title}</strong>
                  <small>{finding.type} / {finding.target}</small>
                  <p>{finding.detail}</p>
                  <p>修订建议：{finding.suggestion}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="workflow-empty">正文在 guard 阶段直接通过，没有触发 repair。</p>
          )}
        </article>
      )}
    </div>
  );
}

function SettingExtractorPage({
  project,
  mutate,
  working,
  routeChapterId = "",
  onBack,
  onChangeChapter
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
        source: form.sourceMode === "manual" ? form.manualSource : sourceText
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

  return (
    <section className="chapter-page">
      <div className="panel chapter-page-header">
        <div>
          <p className="eyebrow">Setting Extractor</p>
          <h2>设定提取页</h2>
          <p className="chapter-page-note">
            从已有章节或外部文本里提取值得入库的人物、世界观、地点、道具和能力体系，先编辑再导入。
          </p>
        </div>
        <div className="chapter-page-toolbar">
          <button className="secondary-button" type="button" onClick={onBack}>
            返回设定库
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
                已有章节
              </button>
              <button
                className={form.sourceMode === "manual" ? "active" : ""}
                type="button"
                onClick={() => setSourceMode("manual")}
              >
                粘贴文本
              </button>
            </div>

            {form.sourceMode === "chapter" ? (
              project.chapters.length ? (
                <>
                  <label>
                    目标章节
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
                    用于提取的文本
                    <textarea
                      className="chapter-editor-textarea extractor-source-textarea"
                      value={sourceText}
                      readOnly
                    />
                  </label>
                </>
              ) : (
                <EmptyState text="还没有可提取的章节，请改用“粘贴文本”模式。" />
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
                  placeholder="可以粘贴外部文本，也可以把某一个片段整理后再提取。"
                />
              </label>
            )}

            <div className="editor-footer">
              <span>当前字数：{sourceText.trim().length}</span>
              <span>{form.results.length ? `本轮已提取 ${form.results.length} 条` : "还没有提取结果"}</span>
            </div>

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
              <h2>待导入设定</h2>
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
                全选为导入
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
                  导入已选中设定
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
                      类型
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
                    核心设定
                    <textarea
                      rows={4}
                      value={item.summary}
                      onChange={(event) => updateResult(item.tempId, { summary: event.target.value })}
                    />
                  </label>
                  <label>
                    特征标签
                    <input
                      value={item.traits}
                      onChange={(event) => updateResult(item.tempId, { traits: event.target.value })}
                    />
                  </label>
                  <label>
                    禁忌 / 不可违背
                    <textarea
                      rows={3}
                      value={item.rules}
                      onChange={(event) => updateResult(item.tempId, { rules: event.target.value })}
                    />
                  </label>
                  {item.evidence && <small className="extract-evidence">依据：{item.evidence}</small>}
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
            <EmptyState text="先从章节或文本里提取候选设定，结果会出现在这里，确认后再导入设定库。" />
          )}
        </div>
      </div>
    </section>
  );
}

function ThreadsTab({ project, mutate, working }) {
  const threadFormKey = useMemo(() => makeWebDraftKey(project.id, "threads-form"), [project.id]);
  const threadFilterKey = useMemo(() => makeWebDraftKey(project.id, "threads-filter"), [project.id]);
  const [form, setForm, resetForm] = useWebDraftState(threadFormKey, buildForeshadowDraft());
  const [statusFilter, setStatusFilter] = useWebDraftState(threadFilterKey, "全部");
  const visibleForeshadows = project.foreshadows.filter(
    (item) => statusFilter === "全部" || item.status === statusFilter
  );

  async function submit(event) {
    event.preventDefault();
    if (!form.content.trim()) return;
    await mutate(`/api/projects/${project.id}/foreshadows`, form, "记录伏笔");
    resetForm(buildForeshadowDraft());
  }

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Foreshadow</p>
            <h2>伏笔管理器</h2>
          </div>
          <GitBranch size={20} />
        </div>
        <form className="editor-form" onSubmit={submit}>
          <label>
            伏笔内容
            <textarea rows={4} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} placeholder="如：血玉只在主角濒死时发热。" />
          </label>
          <div className="form-row">
            <label>
              埋设章节
              <input value={form.plantedChapter} onChange={(event) => setForm({ ...form, plantedChapter: event.target.value })} placeholder="第 3 章" />
            </label>
            <label>
              预期回收
              <input value={form.expectedPayoff} onChange={(event) => setForm({ ...form, expectedPayoff: event.target.value })} placeholder="第 12 章" />
            </label>
          </div>
          <label>
            相关人物 / 道具
            <input value={form.related} onChange={(event) => setForm({ ...form, related: event.target.value })} placeholder="沈照夜、血玉、师父失踪" />
          </label>
          <label>
            状态
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option>未回收</option>
              <option>回收中</option>
              <option>已回收</option>
            </select>
          </label>
          <button className="primary-button" disabled={Boolean(working)} type="submit">
            <Plus size={17} />
            记录伏笔
          </button>
        </form>
      </div>

      <div className="thread-board">
        <div className="list-toolbar segmented">
          {["全部", "未回收", "回收中", "已回收"].map((status) => (
            <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)} type="button">
              {status}
            </button>
          ))}
        </div>
        {visibleForeshadows.length ? (
          visibleForeshadows.map((item) => (
            <article className={`thread-card ${item.status === "已回收" ? "done" : ""}`} key={item.id}>
              <header>
                <span>{item.status}</span>
                <strong>{item.plantedChapter || "未标章节"}</strong>
              </header>
              <p>{item.content}</p>
              <div className="thread-meta">
                <span>预期：{item.expectedPayoff || "待定"}</span>
                <span>相关：{item.related || "无"}</span>
              </div>
              <div className="card-actions">
                {item.status !== "回收中" && item.status !== "已回收" && (
                  <button className="secondary-button" disabled={Boolean(working)} onClick={() => mutate(`/api/projects/${project.id}/foreshadows/${item.id}/status`, { status: "回收中" }, "更新伏笔")}>
                    回收中
                  </button>
                )}
                {item.status !== "已回收" && (
                  <button className="secondary-button" disabled={Boolean(working)} onClick={() => mutate(`/api/projects/${project.id}/foreshadows/${item.id}/status`, { status: "已回收" }, "更新伏笔")}>
                    已回收
                  </button>
                )}
              </div>
              {item.warning && <small className="warning-text">{item.warning}</small>}
            </article>
          ))
        ) : (
          <EmptyState text="当前筛选下没有伏笔。" />
        )}
      </div>
    </section>
  );
}

function RewriteTab({ project, mutate, streamText, working, workspace, rewritePrefill, clearRewritePrefill }) {
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
          tone: selectedDraft?.tone || project.defaultTone,
          chapterId: selectedChapterId,
          rewriteScope: isPartialRewrite ? "selection" : form.followChapter ? "chapter" : "manual",
          selectionStart: isPartialRewrite ? form.selectionContext?.start : undefined,
          selectionEnd: isPartialRewrite ? form.selectionContext?.end : undefined
        },
        isModifyMode ? "实时修改" : "实时润色",
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
            <h2>润色 / 修改并同步当前章节</h2>
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
                修改模式
              </button>
            </div>
            <label>
              目标章节
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
              跟随当前章节草稿实时同步
            </label>
            {isPartialRewrite && (
              <div className="selection-callout">
                <strong>当前为局部{actionNoun}</strong>
                <span>
                  第 {form.selectionContext.chapterNumber} 章 · 已锁定选中片段 {form.selectionContext.selectedText.length} 字
                </span>
              </div>
            )}
            <label>
              原文
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
                placeholder={isPartialRewrite ? "这里显示刚才选中的片段，你也可以在发送前微调。" : "粘贴或直接跟随章节草稿。"}
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
                  placeholder={isPartialRewrite ? "例如：保留信息点，把这段改得更冷、更短、更像对峙。" : "例如：保留剧情事实，把整章改成第一人称；删掉直白解释；加强女主压迫感。"}
                />
              </label>
            ) : (
              <label>
                改写方向
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
              <span>当前章节语气：{selectedDraft?.tone || project.defaultTone}</span>
              <span>原文字数：{source.trim().length}</span>
              <span>
                {isPartialRewrite
                  ? "应用时只替换原选中片段，不会覆盖整章其他内容"
                  : isModifyMode
                    ? "会严格按修改要求输出一整段替换结果"
                    : "当前模式会输出一整段润色结果"}
              </span>
            </div>
            <button className="primary-button" disabled={Boolean(working) || isStreaming || !canSubmit} type="submit">
              <Wand2 size={17} />
              {isStreaming ? `正在实时${actionNoun}...` : isPartialRewrite ? `开始实时局部${actionNoun}` : `开始实时${actionNoun}`}
            </button>
          </form>
        ) : (
          <EmptyState text="还没有章节可供润色或修改。" />
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
        {isStreaming && <p className="stream-hint">正在实时{actionNoun}，结果会持续写入下面的文本框。</p>}
        {form.result ? (
          <>
            <textarea className="rewrite-result-textarea" value={form.result} onChange={(event) => setForm((current) => ({ ...current, result: event.target.value }))} />
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
                {isPartialRewrite ? "替换选中片段" : "一键覆盖当前章节"}
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
                {isPartialRewrite ? "保存为局部替换后的版本" : "另存为新版本"}
              </button>
            </div>
          </>
        ) : (
          <EmptyState text={`${actionNoun}结果会显示在这里，并可直接覆盖章节或另存版本。`} />
        )}
      </div>
    </section>
  );
}

function IoLogsTab({ project }) {
  const logs = project.ioLogs || [];

  return (
    <section className="two-column">
      <div className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Workflow Config</p>
            <h2>智能体协作与 I/O 记录</h2>
          </div>
          <BrainCircuit size={20} />
        </div>
        <p>
          章节生成的 contract / planner / writer / guard / repair 协作配置现在集中在 <code>server/ai-config.js</code>。
          这里展示最近 120 条输入输出记录，方便排查章节号漂移、提示词和协作效果。
        </p>
        <div className="editor-footer">
          <span>配置文件：server/ai-config.js</span>
          <span>最近记录：{logs.length}</span>
        </div>
      </div>

      <div className="panel result-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Recent Logs</p>
            <h2>I/O 明细</h2>
          </div>
          <MessageSquareText size={20} />
        </div>
        {logs.length ? (
          <div className="io-log-list">
            {logs.map((log) => {
              const chapter = project.chapters.find((item) => item.id === log.chapterId);
              return (
                <details className="io-log-card" key={log.id}>
                  <summary className="io-log-summary">
                    <div>
                      <strong>{log.workflow} / {log.stage}</strong>
                      <small>{formatTime(log.createdAt)}</small>
                    </div>
                    <span className={`io-log-status ${log.status}`}>{log.status === "error" ? "失败" : "成功"}</span>
                  </summary>
                  <div className="io-log-meta">
                    <span>{chapter ? `第 ${chapter.number} 章 · ${chapter.title}` : "未绑定章节"}</span>
                    <span>{log.provider || "local"}{log.model ? ` / ${log.model}` : ""}</span>
                  </div>
                  <div className="io-log-grid">
                    <div>
                      <strong>输入</strong>
                      <pre className="io-log-pre">{formatJsonBlock(log.inputPayload)}</pre>
                    </div>
                    <div>
                      <strong>输出</strong>
                      <pre className="io-log-pre">{log.outputText || formatJsonBlock(log.outputPayload)}</pre>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <EmptyState text="还没有 I/O 记录。生成章节、润色、修改或扩写后，这里会自动出现明细。" />
        )}
      </div>
    </section>
  );
}

function PlotMap({ project }) {
  if (!project.chapters.length) {
    return <EmptyState text="章节生成后会形成情节地图。" />;
  }

  return (
    <div className="plot-map">
      {project.chapters.map((chapter) => (
        <article className="plot-node" key={chapter.id}>
          <span>第 {chapter.number} 章</span>
          <strong>{chapter.title}</strong>
          <div>
            {chapter.beats.slice(0, 4).map((beat) => (
              <small key={beat}>{beat}</small>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function ReportCard({ report }) {
  const riskClass = report.score >= 80 ? "good" : report.score >= 60 ? "medium" : "high";
  return (
    <article className={`report-card ${riskClass}`}>
      <header>
        <span>风险评分</span>
        <strong>{report.score}</strong>
      </header>
      <div className="report-lines">
        {report.findings.map((finding) => (
          <p key={`${finding.level}-${finding.title}`}>
            <b>{finding.level}</b>
            {finding.title}：{finding.detail}
          </p>
        ))}
      </div>
    </article>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <BookOpen size={20} />
      <span>{text}</span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
