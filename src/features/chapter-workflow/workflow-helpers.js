import { constraintPolicyOptions } from "../../lib/app-constants.js";
import { countTextUnits, summarizeInlineText } from "../../lib/format.js";

export function normalizeConstraintPolicyDraft(policy = {}) {
  return {
    lockCharacterMotivations: policy?.lockCharacterMotivations !== false,
    strictWorldRules: policy?.strictWorldRules !== false,
    lockRecentContinuity: policy?.lockRecentContinuity !== false,
    enforceForeshadowContinuity: policy?.enforceForeshadowContinuity !== false
  };
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

export function buildPlannerSummaryLine(plan) {
  if (!plan) return "Planner 尚未产出章节规划。";
  const beatsCount = normalizeEditorList(plan.beats || []).length;
  return joinWorkflowSummaryParts([
    plan.narrativeMode || "混合",
    beatsCount ? `${beatsCount}拍` : "",
    mapEndingModeLabel(plan.endingMode),
    summarizeInlineText(plan.summary || "章节 brief 已生成", 28)
  ]);
}

export function buildGuardSummaryLine(report, label = "Guard") {
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

export function buildWorkflowOutcomeSummaryLine(workflow) {
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

export function buildConstraintPolicyLabels(policy = {}) {
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
  return /只能写第\s*\d+\s*章|正文首行必须是|章节锁定|标题锁定/.test(text);
}

function isContinuityConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /承接：|连续性：|上一章|最近章节/.test(text);
}

function isWorldRuleConstraintEntry(item = "") {
  const text = String(item || "").trim();
  if (!text) return false;
  return /世界观|规则|能力|设定|禁忌/.test(text);
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

export function deriveConstraintLayersFromContract(contract) {
  if (!contract) return null;

  const currentLayers = contract.constraintLayers || {};
  const mustMention = normalizeEditorList(contract.mustMention || []);
  const continuity = normalizeEditorList(contract.continuity || []);
  const forbidden = normalizeEditorList(contract.forbidden || []);
  const derivedPolicy = normalizeConstraintPolicyDraft(currentLayers.policy || {
    lockCharacterMotivations: mustMention.some((item) => item.startsWith("人物动机锁：")),
    strictWorldRules: forbidden.some(
      (item) => item.startsWith("不能违背规则：") || isWorldRuleConstraintEntry(item)
    ),
    lockRecentContinuity: continuity.some((item) => item.startsWith("承接：") || item.startsWith("连续性：")),
    enforceForeshadowContinuity: continuity.some((item) => item.startsWith("伏笔："))
  });

  return {
    policy: derivedPolicy,
    chapterIdentity: mergeUniqueTextList(
      currentLayers.chapterIdentity || [],
      contract.chapterLock ? [contract.chapterLock] : [],
      contract.titleLock ? [contract.titleLock] : [],
      mustMention.filter(
        (item) => item.startsWith("章节锁定：") || item.startsWith("标题锁定：")
      )
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
        .filter((item) => item.startsWith("不能违背规则："))
        .map((item) => item.replace(/^不能违背规则：/, "").trim()),
      deriveWorldRulesFromForbidden(forbidden, derivedPolicy)
    ),
    continuityAnchors: mergeUniqueTextList(
      currentLayers.continuityAnchors || [],
      continuity.filter((item) => item.startsWith("承接：") || item.startsWith("连续性："))
    ),
    foreshadowAnchors: mergeUniqueTextList(
      currentLayers.foreshadowAnchors || [],
      continuity.filter((item) => item.startsWith("伏笔："))
    ),
    hardBans: mergeUniqueTextList(currentLayers.hardBans || [], forbidden)
  };
}

export function buildWorkflowRecommendation({
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
      detail: runtime.currentMessage || "流程仍在运行，完成后会自动刷新到最新结果。"
    };
  }

  if (runtime?.cancelled) {
    return {
      tone: "warn",
      title: "执行已取消",
      detail: "可以在调整 contract / planner 后重新 preview / generate。"
    };
  }

  if (reviewSession) {
    return {
      tone: "review",
      title: isRegenerateMode ? "待确认重生成审阅稿" : "待确认生成审阅稿",
      detail: reviewDirty
        ? "审阅稿已被手动修改，确认后会以当前内容入库。"
        : "可直接确认 Writer / Repair 结果，或切换来源后再微调。"
    };
  }

  if (previewStale) {
    return {
      tone: "warn",
      title: "预览已过期",
      detail: "请先重新生成约束草稿，确保 contract / planner / guard 与当前配置一致。"
    };
  }

  if (preview) {
    return {
      tone: "ready",
      title: "约束草稿已就绪",
      detail: "可以继续检查 contract / planner，再决定是否正式生成正文。"
    };
  }

  if (workflow) {
    return {
      tone: "done",
      title: "已生成最新结果",
      detail: "可直接进入审阅，或调整约束后重新生成。"
    };
  }

  return {
    tone: "idle",
    title: "先生成约束草稿",
    detail: "系统会先跑 contract / planner / preflight guard，再进入正文生成。"
  };
}

export function buildWorkflowTraceLogs(project, { isRegenerateMode, selectedChapterId = "" } = {}) {
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

export function describeWorkflowTrace(log) {
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
  if (log.stage === "mcp_research") {
    return summarizeInlineText(log.outputText || "MCP 研究完成", 92);
  }
  if (log.stage === "subagents") {
    return summarizeInlineText(log.outputText || "多代理分析完成", 92);
  }
  if (log.stage === "humanize" || log.stage === "humanize-local" || log.stage === "humanize-local-stream") {
    return summarizeInlineText(
      log.inputPayload?.skillName
        ? `已应用 ${log.inputPayload.skillName} 进行人性化润色`
        : log.outputText || "已进行 AI 润色",
      92
    );
  }
  if (log.stage === "review_session") {
    return "已生成可编辑审阅稿。";
  }
  if (log.stage === "review_commit") {
    return "审阅稿已确认入库。";
  }
  if (log.stage === "discard") {
    return "已丢弃当前审阅稿。";
  }
  if (log.stage === "planner") {
    return buildPlannerSummaryLine(safeParseJsonObject(log.outputText) || log.outputPayload || {});
  }
  if (log.stage === "writer" || log.stage === "writer-local") {
    return summarizeInlineText(log.outputText || "正文已由 Writer 生成", 72);
  }

  return summarizeInlineText(log.outputText || JSON.stringify(log.outputPayload || {}), 92);
}

export function formatElapsedDuration(startedAt, finishedAt = "") {
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

export function aggregateRuntimeStepState(runtime, keys = []) {
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

export function getWorkflowRuntimeProgress(runtime) {
  const stages = runtime?.stages || [];
  const total = stages.length;
  const completed = stages.filter((item) => item.status === "done" || item.status === "skipped" || item.status === "cancelled").length;
  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0
  };
}

export function formatRuntimeStatus(status) {
  if (status === "running") return "运行中";
  if (status === "done") return "已完成";
  if (status === "skipped") return "已跳过";
  if (status === "cancelled") return "已取消";
  if (status === "error") return "异常";
  return "待执行";
}

export function buildRuntimeStageSummary(stage) {
  if (!stage) return "";
  if (stage.status === "running") {
    return summarizeInlineText(stage.message || "正在执行当前阶段", 56);
  }
  if (stage.status === "cancelled") {
    return "当前阶段已取消。";
  }
  if (stage.key === "planner" && stage.status === "done") {
    return joinWorkflowSummaryParts([
      stage.meta?.narrativeMode || "",
      stage.meta?.beatsCount ? `${stage.meta.beatsCount} 个节拍` : "",
      "规划完成"
    ]);
  }
  if (stage.key === "guard_preflight" && stage.status === "done") {
    return joinWorkflowSummaryParts([
      `${stage.meta?.score ?? "--"} 分 ${mapGuardStatusLabel(stage.meta?.status)}`,
      stage.meta?.findingsCount ? `${stage.meta.findingsCount} 条提示` : "无明显问题"
    ]);
  }
  if (stage.key === "guard" && stage.status === "done") {
    return joinWorkflowSummaryParts([
      `${stage.meta?.score ?? "--"} 分 ${mapGuardStatusLabel(stage.meta?.status)}`,
      stage.meta?.repairPlanCount ? `${stage.meta.repairPlanCount} 条修订建议` : "无需修订"
    ]);
  }
  if (stage.key === "repair") {
    if (stage.status === "done") {
      return joinWorkflowSummaryParts([
        "修订已完成",
        stage.meta?.units ? `${stage.meta.units} 字` : ""
      ]);
    }
    if (stage.status === "skipped") {
      return "无需修订，直接保留 Writer 结果。";
    }
  }
  if (stage.key === "humanize") {
    if (stage.status === "done") {
      return joinWorkflowSummaryParts([
        stage.meta?.applied ? "已应用人性化润色" : "跳过人性化润色",
        stage.meta?.skillName || "",
        stage.meta?.units ? `${stage.meta.units} 字` : ""
      ]);
    }
    if (stage.status === "skipped") {
      return "当前流程未启用 AI 润色。";
    }
  }
  if (stage.key === "writer" && stage.status === "done" && stage.meta?.units) {
    return `Writer 已生成 ${stage.meta.units} 字`;
  }
  return summarizeInlineText(stage.message || "阶段已完成", 56);
}

export function normalizeEditorList(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/(?:\r?\n|[\uff1b;])+/)
        .map((item) => item.trim());
  const seen = new Set();
  return items
    .map((item) => String(item || "").trim())
    .filter((item) => item && !seen.has(item) && seen.add(item));
}

export function joinEditorList(value) {
  return normalizeEditorList(value).join("\n");
}

export function defaultReviewSource(workflow) {
  return workflow?.repair?.applied ? "repair" : "writer";
}

export function resolveReviewSourceContent(workflow, source = defaultReviewSource(workflow)) {
  if (!workflow) return "";
  if (source === "writer") {
    return workflow.repair?.originalContent || "";
  }
  return workflow.repair?.repairedContent || workflow.repair?.reviewContent || workflow.repair?.originalContent || "";
}

export function resolveReviewSourceLabel(workflow, source = defaultReviewSource(workflow)) {
  if (source === "writer") return "Writer 初稿";
  if (workflow?.humanize?.enabled !== false) return "人性化润色稿";
  return "Repair 修订稿";
}
