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
  Clock3,
  Download,
  Edit3,
  FileText,
  Gauge,
  GitBranch,
  Library,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Wand2
} from "lucide-react";
import { EmptyState } from "./components/EmptyState.jsx";
import { ToneComposer } from "./components/ToneComposer.jsx";
import { ChapterEditorPage } from "./features/chapter-editor/ChapterEditorPage.jsx";
import { ChapterGenerationPage } from "./features/chapter-generation/ChapterGenerationPage.jsx";
import { GenerationReviewPanel as ChapterGenerationReviewPanel } from "./features/chapter-workflow/GenerationReviewPanel.jsx";
import {
  ChapterTaskFlow,
  ConstraintLayersPanel,
  ConstraintPolicyComposer,
  WorkflowActionBanner,
  WorkflowRuntimePanel,
  WorkflowSummaryBlock,
  WorkflowTracePanel
} from "./features/chapter-workflow/WorkflowPanels.jsx";
import { SkillsTab } from "./features/skills/SkillsTab.jsx";
import { buildHumanizeSkillSummary } from "./features/skills/skill-utils.js";
import { ThreadsTab } from "./features/threads/ThreadsTab.jsx";
import {
  PlotMap,
  ReportCard,
  StoryStateOverview,
  StoryStateTab
} from "./features/story-state/StoryStatePanels.jsx";
import { IoLogsTab } from "./features/io-logs/IoLogsTab.jsx";
import { McpToolsTab } from "./features/mcp/McpToolsTab.jsx";
import { RewriteTab } from "./features/rewrite/RewriteTab.jsx";
import { ProjectTonePanel } from "./features/studio/ProjectTonePanel.jsx";
import { StudioTab } from "./features/studio/StudioTab.jsx";
import { BibleTab } from "./features/settings/BibleTab.jsx";
import { SettingExtractorPage } from "./features/settings/SettingExtractorPage.jsx";
import {
  constraintPolicyOptions,
  downloadFormatOptions,
  genreOptions,
  rewriteStyles,
  settingTypes,
  workflowStageLabels
} from "./lib/app-constants.js";
import { formatJsonBlock, formatTime, buildDownloadName, summarizeInlineText } from "./lib/format.js";
import {
  AgentTracePanel,
  ResearchTracePanel,
  findLatestIoLog
} from "./lib/io-log-helpers.jsx";
import { buildMcpServerDraft, parseJsonDraft, parseMcpArgs } from "./lib/mcp.js";
import {
  applyPartialRewrite,
  buildAiProfileDraft,
  buildChapterDraft,
  buildForeshadowDraft,
  buildManualChapterDraft,
  buildPartialRewriteSelection,
  buildRewriteDraft,
  buildTransformVersionLabel,
  findChapterById,
  findProjectById,
  getNextChapterNumber,
  getProjectDeleteCode,
  isAbortLikeError,
  parseSseDataBlock,
  readTextSelection,
  sameDraft
} from "./lib/project-helpers.js";
import {
  buildChapterEditorHash,
  buildSettingExtractorHash,
  readChapterEditorRoute,
  readSettingExtractorRoute
} from "./lib/routes.js";
import {
  buildChapterSourceText,
  buildExtractedSettingDraft,
  buildSettingDraft,
  buildSettingExtractionDraft,
  formatSettingCode,
  formatSettingLabel,
  normalizeSettingSelection,
  normalizeTagList,
  sortSettings,
  stringifyTagList
} from "./features/settings/settings-helpers.js";
import {
  mapRelationshipKindLabel,
  mapStoryHeatLabel,
  mapStoryStateSourceLabel
} from "./features/story-state/story-state-helpers.js";
import {
  aggregateRuntimeStepState,
  buildConstraintPolicyLabels,
  buildGuardSummaryLine,
  buildPlannerSummaryLine,
  buildRuntimeStageSummary,
  buildWorkflowOutcomeSummaryLine,
  buildWorkflowRecommendation,
  buildWorkflowTraceLogs,
  defaultReviewSource,
  deriveConstraintLayersFromContract,
  describeWorkflowTrace,
  formatElapsedDuration,
  formatRuntimeStatus,
  getWorkflowRuntimeProgress,
  joinEditorList,
  normalizeConstraintPolicyDraft,
  normalizeEditorList,
  resolveReviewSourceContent
} from "./features/chapter-workflow/workflow-helpers.js";
import { useWebDraftState } from "./hooks/useWebDraftState.js";
import { makeWebDraftKey } from "./lib/webDraft.js";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

function buildChapterGeneratorDraft(project, chapter = null) {
  return {
    title: chapter?.title || "",
    goal: chapter?.goal || "",
    conflict: chapter?.conflict || "",
    hook: chapter?.hook || "",
    tone: chapter?.tone || project?.defaultTone || "热血",
    wordCount: Number(chapter?.wordCount) || 1800,
    selectedSettingIds: normalizeSettingSelection(chapter?.selectedSettingIds, project),
    useMcp: false,
    selectedMcpServerIds: [],
    useSubagents: false,
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
      currentMessage: current.currentMessage || "鏈疆杩愯宸插畬鎴?"
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


function cancelWorkflowRuntime(current) {
  const finishedAt = new Date().toISOString();
  return {
    ...current,
    active: false,
    cancelled: true,
    finishedAt,
    currentStageKey: "",
    currentMessage: "鏈杩愯宸插彇娑堛€?",
    stages: (current?.stages || []).map((stage) =>
      stage.status === "running"
        ? {
            ...stage,
            status: "cancelled",
            message: "宸插彇娑堬紝鏈户缁墽琛屻€?",
            updatedAt: finishedAt
          }
        : stage
    ),
    error: ""
  };
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
    useMcp: form.useMcp === true,
    useSubagents: form.useSubagents === true,
    selectedMcpServerIds: Array.from(
      new Set((form.selectedMcpServerIds || []).map((item) => String(item || "").trim()).filter(Boolean))
    ).sort(),
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
      if (!silent) notify("鑽夌宸蹭繚瀛?");
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
      notify("绔犺妭宸蹭繚瀛樺埌鏁版嵁搴?");
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
        throw new Error("鍘熸枃閫夊尯宸茬粡鍙樺寲锛屾棤娉曞畾浣嶅眬閮ㄦ浛鎹綅缃€傝鍥炲埌绔犺妭缂栬緫鍣ㄩ噸鏂伴€夋嫨銆?");
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
      notify(payload.scope === "selection" ? "娑﹁壊缁撴灉宸叉浛鎹㈤€変腑鐗囨" : "娑﹁壊缁撴灉宸茶鐩栧綋鍓嶇珷鑺?");
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
        throw new Error("鍘熸枃閫夊尯宸茬粡鍙樺寲锛屾棤娉曚繚瀛樺眬閮ㄦ浛鎹㈢増鏈€傝閲嶆柊閫夋嫨鍚庡啀璇曘€?");
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
      notify(payload.scope === "selection" ? "灞€閮ㄦ鼎鑹茬粨鏋滃凡鍙﹀瓨涓烘柊鐗堟湰" : "娑﹁壊缁撴灉宸插彟瀛樹负鏂扮増鏈?");
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
        throw new Error("娴忚鍣ㄦ湭杩斿洖鍙鍙栫殑娴?");
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
        throw new Error("娴忚鍣ㄦ湭杩斿洖鍙鍙栫殑娴?");
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

  function openPrimaryTab(tab) {
    syncChapterEditorRoute(null, { replace: true });
    syncSettingExtractorRoute(null, { replace: true });
    setActiveTab(tab);
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
      notify("涓嬭浇宸插紑濮?");
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
              {activeProject?.genre || "未分类"} · {activeProject?.status || "草稿"} ·{" "}
              {activeProject?.defaultTone || "默认语气"}
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

        {hasProjects && (
          <nav className="tabs">
            <TabButton active={!hasLeafPage && activeTab === "studio"} onClick={() => openPrimaryTab("studio")} icon={Gauge} label="创作台" />
            <TabButton active={!hasLeafPage && activeTab === "bible"} onClick={() => openPrimaryTab("bible")} icon={Library} label="设定集" />
            <TabButton active={!hasLeafPage && activeTab === "chapters"} onClick={() => openPrimaryTab("chapters")} icon={FileText} label="章节库" />
            <TabButton active={!hasLeafPage && activeTab === "state"} onClick={() => openPrimaryTab("state")} icon={Clock3} label="故事状态" />
            <TabButton
              active={isStandaloneChapterEditor}
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
            <TabButton active={!hasLeafPage && activeTab === "threads"} onClick={() => openPrimaryTab("threads")} icon={GitBranch} label="伏笔线程" />
            <TabButton active={!hasLeafPage && activeTab === "rewrite"} onClick={() => openPrimaryTab("rewrite")} icon={Wand2} label="改写 / 润色" />
            <TabButton active={!hasLeafPage && activeTab === "skills"} onClick={() => openPrimaryTab("skills")} icon={Boxes} label="Skills" />
            <TabButton active={!hasLeafPage && activeTab === "tools"} onClick={() => openPrimaryTab("tools")} icon={BrainCircuit} label="Tools/MCP" />
            <TabButton active={!hasLeafPage && activeTab === "io"} onClick={() => openPrimaryTab("io")} icon={BrainCircuit} label="I/O 记录" />
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
            buildManualChapterDraft={buildManualChapterDraft}
            getNextChapterNumber={getNextChapterNumber}
            findProjectById={findProjectById}
            buildDownloadName={buildDownloadName}
            readTextSelection={readTextSelection}
            buildPartialRewriteSelection={buildPartialRewriteSelection}
            formatTime={formatTime}
            SaveIndicator={SaveIndicator}
            DownloadFormatSelect={DownloadFormatSelect}
          />
        )}
        {activeProject && isStandaloneChapterEditor && !standaloneRouteReady && (
          <div className="center-screen">
            <Loader2 className="spin" size={24} />
            <span>正在打开章节编辑...</span>
          </div>
        )}

        {activeProject && isStandaloneSettingExtractor && (
          <SettingExtractorPage
            project={activeProject}
            mutate={mutate}
            working={working}
            mcp={state?.mcp || {}}
            routeChapterId={settingExtractorRoute?.chapterId || ""}
            onBack={closeSettingExtractorPage}
            onChangeChapter={changeSettingExtractorPage}
            buildSettingExtractionDraft={buildSettingExtractionDraft}
            findChapterById={findChapterById}
            buildChapterSourceText={buildChapterSourceText}
            findLatestIoLog={findLatestIoLog}
            buildExtractedSettingDraft={buildExtractedSettingDraft}
            settingTypes={settingTypes}
            ResearchTracePanel={ResearchTracePanel}
            AgentTracePanel={AgentTracePanel}
            describeWorkflowTrace={describeWorkflowTrace}
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
            skills={state?.skills || []}
            mcp={state?.mcp || {}}
            ChapterGenerator={ChapterGenerator}
            formatTime={formatTime}
            summarizeInlineText={summarizeInlineText}
            mapStoryStateSourceLabel={mapStoryStateSourceLabel}
            mapStoryHeatLabel={mapStoryHeatLabel}
            mapRelationshipKindLabel={mapRelationshipKindLabel}
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
            settingTypes={settingTypes}
            buildSettingDraft={buildSettingDraft}
            sortSettings={sortSettings}
            normalizeTagList={normalizeTagList}
            stringifyTagList={stringifyTagList}
            formatSettingCode={formatSettingCode}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "chapters" && (
          <ChapterGenerationPage
            project={activeProject}
            working={working}
            workspace={chapterWorkspace}
            openChapterEditorPage={openChapterEditorPage}
            openBlankChapterEditorPage={openBlankChapterEditorPage}
            formatTime={formatTime}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "state" && (
          <StoryStateTab
            project={activeProject}
            formatTime={formatTime}
            summarizeInlineText={summarizeInlineText}
            mapStoryStateSourceLabel={mapStoryStateSourceLabel}
            mapStoryHeatLabel={mapStoryHeatLabel}
            mapRelationshipKindLabel={mapRelationshipKindLabel}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "threads" && (
          <ThreadsTab
            project={activeProject}
            mutate={mutate}
            working={working}
            buildForeshadowDraft={buildForeshadowDraft}
          />
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
            skills={state?.skills || []}
            buildRewriteDraft={buildRewriteDraft}
            buildTransformVersionLabel={buildTransformVersionLabel}
            findLatestIoLog={findLatestIoLog}
            rewriteStyles={rewriteStyles}
            AgentTracePanel={AgentTracePanel}
            describeWorkflowTrace={describeWorkflowTrace}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "skills" && (
          <SkillsTab project={activeProject} skills={state?.skills || []} />
        )}
        {activeProject && !hasLeafPage && activeTab === "tools" && (
          <McpToolsTab
            project={activeProject}
            mcp={state?.mcp || {}}
            mutate={mutate}
            working={working}
            mcpToolCall={state?.mcpToolCall || null}
            mcpAgentRun={state?.mcpAgentRun || null}
            buildMcpServerDraft={buildMcpServerDraft}
            parseMcpArgs={parseMcpArgs}
            parseJsonDraft={parseJsonDraft}
            formatJsonBlock={formatJsonBlock}
          />
        )}
        {activeProject && !hasLeafPage && activeTab === "io" && (
          <IoLogsTab
            project={activeProject}
            formatTime={formatTime}
            formatJsonBlock={formatJsonBlock}
          />
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
      <span>正在加载应用...</span>
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
        <p>先创建一个小说项目，系统会把设定、章节、状态和工作流集中管理起来。</p>
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

function SaveIndicator({ draft }) {
  if (!draft) return null;
  const text =
    draft.status === "saving"
      ? "草稿自动保存中"
      : draft.status === "dirty"
        ? "草稿待保存"
        : draft.status === "error"
          ? "草稿保存失败"
          : `草稿已保存：${formatTime(draft.lastSavedAt)}`;

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
    defaultTone: "热血",
    humanizeEnabled: true
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
      defaultTone: "热血",
      humanizeEnabled: true
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
          <label className="inline-check">
            <input
              type="checkbox"
              checked={form.humanizeEnabled}
              onChange={(event) => setForm({ ...form, humanizeEnabled: event.target.checked })}
            />
            默认在终稿阶段追加一轮 AI 润色
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
            鍒犻櫎 <strong>{project.title}</strong> 鍓嶏紝璇疯緭鍏ラ獙璇佺爜锛?
          </p>
          <code>{deleteCode}</code>
          <input
            value={confirmationCode}
            onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())}
            placeholder="杈撳叆楠岃瘉鐮佺‘璁ゅ垹闄?"
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
    activeProfile?.name || "鏈懡鍚嶉厤缃?",
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
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="渚嬪锛欴eepSeek Pro" />
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
              placeholder="杩滅▼妯″瀷闇€瑕佸～鍐?"
            />
          </label>
          <label>
            BASE_URL
            <input
              value={form.baseUrl}
              onChange={(event) => updateField("baseUrl", event.target.value)}
              placeholder="渚嬪锛歨ttps://api.deepseek.com"
            />
          </label>
          <label>
            模型
            <input
              value={form.model}
              onChange={(event) => updateField("model", event.target.value)}
              placeholder="渚嬪锛歞eepseek-v4-pro"
            />
          </label>
          <div className="form-row">
            <label>
              鎬濊€冩ā寮?
              <select value={form.thinkingMode} onChange={(event) => updateField("thinkingMode", event.target.value)} disabled={!remoteEnabled}>
                <option value="">默认</option>
                <option value="enabled">enabled</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
            <label>
              鎬濊€冨己搴?
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
            DeepSeek `deepseek-v4-pro` 鍙缃?`thinking=enabled`锛屽苟鐢?`high` 鎴?`max` 鎺у埗鎬濊€冨己搴︺€?
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
        <strong>关联设定</strong>
        <div className="setting-selector-actions">
          <span>{hasSelection ? `已选 ${normalizedValue.length} 项` : `共计 ${orderedSettings.length} 项`}</span>
          <button type="button" onClick={() => onChange(orderedSettings.map((item) => item.id))}>
            全选
          </button>
          <button type="button" disabled={!hasSelection} onClick={() => onChange([])}>
            清空
          </button>
        </div>
      </div>
      <p className="setting-selector-note">
        这些设定会进入本章上下文，影响约束草稿、Planner、Writer 和 Guard 的判断。
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
        <div className="setting-selector-empty">当前还没有可选设定。</div>
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
  mcp = {},
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
  const readyMcpServers = Array.isArray(mcp?.servers)
    ? mcp.servers.filter((item) => item.status === "ready")
    : [];
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
  const latestWorkflowResearchLog = useMemo(
    () =>
      findLatestIoLog(project, {
        workflows: isRegenerateMode
          ? ["chapter_regenerate", "chapter_regenerate_preview"]
          : ["chapter_generate", "chapter_preview"],
        stages: ["mcp_research"],
        chapterId: selectedChapter?.id || ""
      }),
    [project, isRegenerateMode, selectedChapter?.id]
  );
  const latestWorkflowSubagentLog = useMemo(
    () =>
      findLatestIoLog(project, {
        workflows: isRegenerateMode
          ? ["chapter_regenerate", "chapter_regenerate_preview"]
          : ["chapter_generate", "chapter_preview"],
        stages: ["subagents"],
        chapterId: selectedChapter?.id || ""
      }),
    [project, isRegenerateMode, selectedChapter?.id]
  );

  const templates = [
    {
      label: "升级爆点",
      value: {
        goal: "璁╀富瑙掑湪鏄庣‘浠ｄ环涓嬪畬鎴愪竴娆¤兘鍔涚獊鐮达紝骞舵嬁鍒颁笅涓€闃舵鍦板浘绾跨储銆?",
        conflict: "瀵规墜鐢ㄨ鍒欏帇鍒朵富瑙掞紝閫间粬鍦ㄦ毚闇插簳鐗屽拰澶卞幓璧勬牸涔嬮棿閫夋嫨銆?",
        hook: "瑁佸垽甯笂锛屾湁浜哄康鍑轰簡涓昏鏃╄琚姽鍘荤殑鏃у悕銆?",
        tone: "热血"
      }
    },
    {
      label: "情绪拉扯",
      value: {
        goal: "鎺ㄨ繘涓ゅ悕鏍稿績浜虹墿鐨勪俊浠诲叧绯伙紝鍚屾椂鍩嬩笅璇細鐨勫弽鍚戣瘉鎹€?",
        conflict: "濂充富鍙戠幇涓昏闅愮瀿鍏抽敭淇℃伅锛屽嵈鍙堜笉寰椾笉鍜屼粬鍏卞悓鑴辫韩銆?",
        hook: "濂规妸閭ｆ灇淇＄墿鏀惧洖涓昏鎺屽績锛屽彧璇翠簡涓€鍙ワ細浣犳渶濂藉埆璁╂垜鏌ュ埌鐪熺浉銆?",
        tone: "暧昧拉扯"
      }
    },
    {
      label: "悬疑反转",
      value: {
        goal: "鎻紑涓€涓棫妗堢粏鑺傦紝浣嗚鐪熺浉鎸囧悜鏇村嵄闄╃殑骞曞悗浜恒€?",
        conflict: "绾跨储浜掔浉鐭涚浘锛屽敮涓€璇佷汉璇村嚭鐨勭増鏈拰璁惧畾搴撹褰曞畬鍏ㄧ浉鍙嶃€?",
        hook: "灏镐綋琚栧彛閲岋紝闇插嚭涓€寮犲啓鐫€涓昏鍚嶅瓧鐨勮鏌€?",
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
    const validIds = new Set(readyMcpServers.map((item) => item.id));
    setNextForm((current) => {
      const selected = (current.selectedMcpServerIds || []).filter((item) => validIds.has(item));
      const nextUseMcp = current.useMcp && validIds.size > 0;
      if (
        selected.length === (current.selectedMcpServerIds || []).length &&
        nextUseMcp === current.useMcp
      ) {
        return current;
      }
      return {
        ...current,
        useMcp: nextUseMcp,
        selectedMcpServerIds: selected
      };
    });
    setRegenerateForm((current) => {
      const selected = (current.selectedMcpServerIds || []).filter((item) => validIds.has(item));
      const nextUseMcp = current.useMcp && validIds.size > 0;
      if (
        selected.length === (current.selectedMcpServerIds || []).length &&
        nextUseMcp === current.useMcp
      ) {
        return current;
      }
      return {
        ...current,
        useMcp: nextUseMcp,
        selectedMcpServerIds: selected
      };
    });
  }, [JSON.stringify(readyMcpServers), setNextForm, setRegenerateForm]);

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
      useMcp: form.useMcp && readyMcpServers.length > 0,
      useSubagents: form.useSubagents === true,
      selectedServerIds: form.useMcp ? form.selectedMcpServerIds : [],
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
      isRegenerateMode ? "确认重生成审阅稿" : "确认生成审阅稿"
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
          "妫€鏌ュ綋鍓嶇珷鑺?"
        );
      } else {
        await mutate(`/api/projects/${project.id}/check`, {}, "妫€鏌ユ渶鏂扮珷鑺?");
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
      "涓㈠純瀹￠槄绋?"
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
          "妫€鏌ュ綋鍓嶇珷鑺?"
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
      await mutate(`/api/projects/${project.id}/check`, {}, "妫€鏌ユ渶鏂扮珷鑺?");
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
    <>
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
          {selectedChapter ? `重生成第 ${selectedChapter.number} 章` : "请选择要重生成的章节"}
        </button>
      </div>
      {isRegenerateMode && selectedChapter && (
        <div className="selection-callout">
          <strong>
            正在重生成第 {selectedChapter.number} 章：{selectedChapter.title}
          </strong>
          <span>会沿用当前工作流配置，并以审阅稿模式返回结果。</span>
        </div>
      )}
      <ChapterTaskFlow
        preview={workflowPreview}
        workflow={workflowResult}
        reviewSession={pendingReviewSession}
        runtime={runtimeState}
        aggregateRuntimeStepState={aggregateRuntimeStepState}
      />
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
        <span>先生成约束草稿，再决定是否正式生成正文。</span>
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
        <textarea value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} rows={compact ? 3 : 4} placeholder="这一章必须推进什么、达成什么转折？" />
      </label>
      <label className="generator-conflict-field">
        核心冲突
        <textarea
          value={form.conflict}
          onChange={(event) => setForm({ ...form, conflict: event.target.value })}
          rows={compact ? 6 : 4}
          placeholder="这一章最主要的对抗、误解或拉扯是什么？"
        />
      </label>
      <div className="form-row">
        <label>
          章节语气
          <ToneComposer value={form.tone} onChange={(tone) => setForm({ ...form, tone })} placeholder="" />
        </label>
        <label>
          目标字数
          <input type="number" min="800" max="8000" step="100" value={form.wordCount} onChange={(event) => setForm({ ...form, wordCount: Number(event.target.value) })} />
        </label>
      </div>
      <label className="generator-hook-field">
        结尾钩子
        <input
          value={form.hook}
          onChange={(event) => setForm({ ...form, hook: event.target.value })}
          placeholder=""
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
        normalizeConstraintPolicyDraft={normalizeConstraintPolicyDraft}
        buildConstraintPolicyLabels={buildConstraintPolicyLabels}
        constraintPolicyOptions={constraintPolicyOptions}
      />
      <section className="constraint-policy-panel">
        <div className="constraint-policy-header">
          <div>
            <h3>MCP 辅助</h3>
            <p>需要时可调用 MCP tools，为 contract / planner / writer 补充额外上下文。</p>
          </div>
          <div className="constraint-policy-meta">
            <span>{readyMcpServers.length} 个 ready server</span>
          </div>
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
                  ? current.selectedMcpServerIds?.length
                    ? current.selectedMcpServerIds
                    : readyMcpServers.map((item) => item.id)
                  : current.selectedMcpServerIds || []
              }))
            }
          />
          用 MCP 补充设定检索、资料查询或结构化上下文
        </label>
        <small className="ai-config-hint">
          {readyMcpServers.length
            ? "当前 AI provider 支持 tool calling，可以把可用 MCP server 接入本章工作流。"
            : "当前没有 ready 的 MCP server，可先去 Tools/MCP 页配置。"}
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
          使用多代理协作：Context Scout / Beat Architect / Continuity Reviewer
        </label>
        <small className="ai-config-hint">
          多代理会先补全上下文，再把结论汇入 contract / plan，适合复杂章节。
        </small>
        {form.useMcp && readyMcpServers.length ? (
          <div className="workflow-pill-list">
            {readyMcpServers.map((server) => (
              <label className="workflow-pill inline-check" key={`chapter-mcp-${server.id}`}>
                <input
                  type="checkbox"
                  checked={(form.selectedMcpServerIds || []).includes(server.id)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      selectedMcpServerIds: event.target.checked
                        ? Array.from(new Set([...(current.selectedMcpServerIds || []), server.id]))
                        : (current.selectedMcpServerIds || []).filter((item) => item !== server.id)
                    }))
                  }
                />
                {server.name}
              </label>
            ))}
          </div>
        ) : null}
      </section>
      <div className="workflow-panel">
        <div className="panel-title compact">
          <div>
            <h2>工作流草稿</h2>
          </div>
          <div className="panel-title-actions">
            <div className="list-toolbar segmented workflow-mode-toggle">
              <button
                className={workflowEditorMode === "simple" ? "active" : ""}
                type="button"
                onClick={() => setWorkflowEditorMode("simple")}
              >
                简版
              </button>
              <button
                className={workflowEditorMode === "expert" ? "active" : ""}
                type="button"
                onClick={() => setWorkflowEditorMode("expert")}
              >
                专家版
              </button>
            </div>
            <button className="secondary-button" disabled={Boolean(working) || previewBusy} onClick={() => previewWorkflow().catch(() => {})} type="button">
              <BrainCircuit size={16} />
              {previewBusy ? "生成中..." : "生成约束草稿"}
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
              重置工作流
            </button>
          </div>
        </div>
        {previewStale && (
          <div className="danger-card">
            <p>当前输入已变化，请重新生成约束草稿，避免 contract / planner / guard 继续使用旧配置。</p>
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
          getWorkflowRuntimeProgress={getWorkflowRuntimeProgress}
          formatElapsedDuration={formatElapsedDuration}
          formatRuntimeStatus={formatRuntimeStatus}
          buildRuntimeStageSummary={buildRuntimeStageSummary}
          summarizeInlineText={summarizeInlineText}
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
      <ResearchTracePanel
        title="最近 MCP 记录"
        log={latestWorkflowResearchLog}
        emptyText="本轮工作流还没有 MCP 调用记录"
        describeTrace={describeWorkflowTrace}
      />
      <AgentTracePanel
        title="最近 Agent 记录"
        log={latestWorkflowSubagentLog}
        emptyText="本轮工作流还没有 agent 协作记录"
        describeTrace={describeWorkflowTrace}
      />
      <WorkflowTracePanel
        logs={workflowTraceLogs}
        workflowStageLabels={workflowStageLabels}
        formatTime={formatTime}
        describeWorkflowTrace={describeWorkflowTrace}
      />
      <div className="editor-footer">
        <span>
          {isRegenerateMode && selectedChapter
            ? `当前目标：重生成第 ${selectedChapter.number} 章`
            : `当前目标：生成第 ${nextChapterNumber} 章`}
        </span>
        <span>{isRegenerateMode ? "结果将覆盖当前章节审阅稿" : "结果会先进入审阅稿再决定是否入库"}</span>
        <span>
          {pendingReviewSession
            ? "已生成审阅稿，可以继续修改、确认入库或直接丢弃"
            : workflowPreview
              ? "约束草稿已就绪，可以继续检查 contract / plan"
              : "尚未生成草稿，系统会先跑约束与预检工作流"}
        </span>
      </div>
      <label className="inline-check">
        <input type="checkbox" checked={autoCheck} onChange={(event) => setAutoCheck(event.target.checked)} />
        {isRegenerateMode ? "完成后自动检查当前章节" : "完成后自动检查新章节"}
      </label>
      <button className="primary-button" disabled={Boolean(working) || previewStale} type="submit">
        <Sparkles size={17} />
        {previewStale
          ? "请先刷新草稿"
          : isRegenerateMode
            ? "开始重生成"
            : "开始生成章节"}
      </button>
      </form>
      {pendingReviewSession && activeReviewWorkflow && (
        <ChapterGenerationReviewPanel
          session={pendingReviewSession}
          workflow={activeReviewWorkflow}
          reviewSource={reviewSource}
          reviewContent={reviewContent}
          reviewDirty={workflowState.reviewDirty}
          busy={Boolean(working)}
          loadedSourceContent={resolveReviewSourceContent(activeReviewWorkflow, reviewSource)}
          repairPlanBlock={
            activeReviewWorkflow?.repair?.repairPlan?.length ? (
              <WorkflowSummaryBlock
                title="Repair 动作"
                items={activeReviewWorkflow.repair.repairPlan}
                empty="本次无需额外修订动作。"
                normalizeEditorList={normalizeEditorList}
              />
            ) : null
          }
          onLoadSource={loadReviewSource}
          onChangeContent={updateReviewContent}
          onCommit={() => commitReview().catch(() => {})}
          onDiscard={() => discardReview().catch(() => {})}
        />
      )}
    </>
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
                  核心使命
                  <textarea rows={2} value={previewData.contract?.coreMission || ""} onChange={(event) => onUpdateContract("coreMission", event.target.value)} />
                </label>
                <label>
                  冲突锚点
                  <textarea rows={2} value={previewData.contract?.conflictAnchor || ""} onChange={(event) => onUpdateContract("conflictAnchor", event.target.value)} />
                </label>
                <label>
                  结尾要求
                  <textarea rows={2} value={previewData.contract?.endingRequirement || ""} onChange={(event) => onUpdateContract("endingRequirement", event.target.value)} />
                </label>
                <label>
                  必用设定
                  <textarea rows={4} value={joinEditorList(previewData.contract?.mustUseSettings || [])} onChange={(event) => onUpdateContract("mustUseSettings", event.target.value, true)} />
                </label>
                <label>
                  必提信息
                  <textarea rows={4} value={joinEditorList(previewData.contract?.mustMention || [])} onChange={(event) => onUpdateContract("mustMention", event.target.value, true)} />
                </label>
                <label>
                  连续性
                  <textarea rows={5} value={joinEditorList(previewData.contract?.continuity || [])} onChange={(event) => onUpdateContract("continuity", event.target.value, true)} />
                </label>
                <label>
                  禁止项
                  <textarea rows={5} value={joinEditorList(previewData.contract?.forbidden || [])} onChange={(event) => onUpdateContract("forbidden", event.target.value, true)} />
                </label>
              </>
            ) : (
              <>
                <p className="workflow-summary-lead">{previewData.contract?.coreMission || "尚未填写本章核心使命。"}</p>
                <div className="workflow-summary-grid">
                  <div>
                    <small>冲突锚点</small>
                    <p>{previewData.contract?.conflictAnchor || "待补充"}</p>
                  </div>
                  <div>
                    <small>结尾要求</small>
                    <p>{previewData.contract?.endingRequirement || "待补充"}</p>
                  </div>
                </div>
                <WorkflowSummaryBlock title="必用设定" items={previewData.contract?.mustUseSettings || []} empty="当前没有强制设定。" normalizeEditorList={normalizeEditorList} />
                <WorkflowSummaryBlock title="必提信息" items={previewData.contract?.mustMention || []} empty="当前没有强制信息。" normalizeEditorList={normalizeEditorList} />
                <WorkflowSummaryBlock title="连续性" items={previewData.contract?.continuity || []} empty="当前没有连续性约束。" normalizeEditorList={normalizeEditorList} />
                <WorkflowSummaryBlock title="禁止项" items={previewData.contract?.forbidden || []} empty="当前没有禁止项。" normalizeEditorList={normalizeEditorList} />
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
                <WorkflowSummaryBlock title="执行节拍" items={previewData.plan?.beats || []} empty="Planner 还没有拆出节拍。" normalizeEditorList={normalizeEditorList} />
                <WorkflowSummaryBlock title="必须保留" items={previewData.plan?.mustKeep || []} empty="当前没有额外保留项。" normalizeEditorList={normalizeEditorList} />
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
              <span>问题数：{preflightFindings.length}</span>
              <span>已忽略：{preflightFindings.length - visiblePreflightFindings.length}</span>
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
                            恢复
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
              <p className="workflow-empty">预检 Guard 没发现明显问题，可以继续进入 Writer。</p>
            )}
          </article>
          <ConstraintLayersPanel
            layers={constraintLayers}
            buildConstraintPolicyLabels={buildConstraintPolicyLabels}
            normalizeEditorList={normalizeEditorList}
          />
        </>
      ) : (
        <div className="collapsed-hint">
          先点击“生成约束草稿”，系统会把 <code>contract -&gt; planner -&gt; preflight guard</code> 可视化出来。你可以先改约束，再正式生成正文。
        </div>
      )}

      {lastRun && (
        <article className="workflow-stage-card workflow-stage-wide">
          <header>
            <span>Writer / Post Guard / Repair</span>
            <strong>
              {lastRun.pendingReview ? "待审阅" : lastRun.repair?.applied ? "已修订" : "已通过"}
            </strong>
          </header>
          <p className="workflow-summary-lead">{buildWorkflowOutcomeSummaryLine(lastRun)}</p>
          <div className="workflow-meta">
            <span>Post Guard?{lastRun.postGuard?.status || "pass"}</span>
            <span>评分：{lastRun.postGuard?.score ?? "--"}</span>
            <span>Repair：{lastRun.repair?.applied ? "已应用修订" : "未触发"}</span>
          </div>
          {lastRun.repair?.repairPlan?.length ? (
            <WorkflowSummaryBlock title="修订计划" items={lastRun.repair.repairPlan} empty="当前没有修订计划。" normalizeEditorList={normalizeEditorList} />
          ) : null}
          {postFindings.length ? (
            <div className="workflow-findings">
              {postFindings.map((finding, index) => (
                <article className={`workflow-finding ${finding.severity}`} key={`${finding.title}-${index}`}>
                  <strong>{finding.title}</strong>
                  <small>{finding.type} / {finding.target}</small>
                  <p>{finding.detail}</p>
                  <p>建议：{finding.suggestion}</p>
                </article>
              ))}
            </div>
          ) : (
             <p className="workflow-empty">Post Guard 没有提出需要 Repair 的问题。</p>
          )}
        </article>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
