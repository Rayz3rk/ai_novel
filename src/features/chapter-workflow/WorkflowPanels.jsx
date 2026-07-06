import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Edit3,
  Gauge,
  Sparkles
} from "lucide-react";

export function ChapterTaskFlow({ preview, workflow, reviewSession, runtime, aggregateRuntimeStepState }) {
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

export function WorkflowRuntimePanel({
  runtime,
  canCancel = false,
  onCancel,
  getWorkflowRuntimeProgress,
  formatElapsedDuration,
  formatRuntimeStatus,
  buildRuntimeStageSummary,
  summarizeInlineText
}) {
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
      ? "执行已取消"
      : "工作流已完成";
  const headerDetail = runtime.currentMessage || (runtime.active ? "正在推进当前阶段" : "本轮工作流已经结束");

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
              取消执行
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

export function WorkflowSummaryBlock({ title, items, empty = "暂无内容", normalizeEditorList }) {
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

export function WorkflowActionBanner({ recommendation }) {
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

export function ConstraintPolicyComposer({
  value,
  onChange,
  normalizeConstraintPolicyDraft,
  buildConstraintPolicyLabels,
  constraintPolicyOptions
}) {
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
          <h3>约束策略</h3>
          <p>这些策略会直接影响 contract / planner / guard 生成出来的约束层。</p>
        </div>
        <div className="constraint-policy-meta">
          <span>{enabledLabels.length} / {constraintPolicyOptions.length} 已启用</span>
          {enabledLabels.length ? (
            <div className="workflow-pill-list">
              {enabledLabels.map((label) => (
                <span className="workflow-pill" key={label}>
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span>当前没有启用任何约束策略</span>
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
                  {active ? "启用" : "关闭"}
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

export function WorkflowTracePanel({ logs = [], workflowStageLabels, formatTime, describeWorkflowTrace }) {
  return (
    <article className="panel workflow-trace-panel">
      <div className="panel-title compact">
        <div>
          <h2>工作流追踪</h2>
          <span>最多展示最近 8 条与当前章节相关的 Planner / Guard / Repair 记录</span>
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
                <span>状态：{log.status === "error" ? "异常" : "完成"}</span>
                <span>工作流：{log.workflow || "workflow"}</span>
              </div>
              <p>{describeWorkflowTrace(log)}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="workflow-empty">当前还没有可展示的工作流轨迹，生成一次草稿或正文后这里会出现记录。</p>
      )}
    </article>
  );
}

export function ConstraintLayersPanel({ layers, buildConstraintPolicyLabels, normalizeEditorList }) {
  const layerDefinitions = [
    {
      key: "chapterIdentity",
      title: "章节身份锁",
      description: "锁定章序、标题意象、正文首句等不能跑偏的章节身份信息。",
      empty: "当前没有单独锁定章节身份。"
    },
    {
      key: "characterMotivations",
      title: "人物动机锁",
      description: "把关键角色当前必须坚持的动机和立场压进本章约束。",
      empty: "当前没有额外人物动机锁。"
    },
    {
      key: "worldRules",
      title: "世界规则锁",
      description: "集中约束世界观、能力边界、禁忌规则，避免写崩设定。",
      empty: "当前没有额外世界规则锁。"
    },
    {
      key: "continuityAnchors",
      title: "连续性锚点",
      description: "明确上一章必须承接的事实、关系、情绪和局面。",
      empty: "当前没有必须承接的连续性锚点。"
    },
    {
      key: "foreshadowAnchors",
      title: "伏笔锚点",
      description: "列出 Writer / Guard 必须注意并照应的伏笔或回收线索。",
      empty: "当前没有额外伏笔锚点。"
    },
    {
      key: "hardBans",
      title: "硬性禁止",
      description: "任何情况下都不能出现的内容、走向或设定违背项。",
      empty: "当前没有额外硬性禁止。"
    }
  ];
  const policyLabels = buildConstraintPolicyLabels(layers?.policy);

  return (
    <article className="workflow-stage-card constraint-layers-card">
      <header>
        <span>Constraint Layers</span>
        <strong>{policyLabels.length ? `${policyLabels.length} 条策略` : "未启用"}</strong>
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
          <span>当前还没有从 contract 中提炼出额外层级约束</span>
        )}
      </div>
      <div className="constraint-layers-list">
        {layerDefinitions.map((definition) => {
          const items = normalizeEditorList(layers?.[definition.key] || []);
          return (
            <section className={`constraint-layer-block ${items.length ? "active" : "idle"}`} key={definition.key}>
              <div className="constraint-layer-head">
                <strong>{definition.title}</strong>
                <small>{items.length ? `${items.length} 条` : "空"}</small>
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
